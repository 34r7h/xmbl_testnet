import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { Identity } from '../src/identity.js';
import {
  ensureAgentIdentity,
  loadAgentIdentity,
  getPublicRecord,
  encryptSecret,
  decryptSecret,
} from '../src/agent-keystore.js';

// Fixed injected master key → deterministic encryption tests, and no dependency on
// ~/.handoff or any ambient file.
const MASTER = crypto.createHash('sha256').update('test-master-key').digest(); // 32 bytes
const AGENT = 'test-agent-01';

let agentsDir;
const opts = () => ({ agentsDir, masterKey: MASTER });

beforeEach(() => {
  agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xid-keystore-'));
});
afterEach(() => {
  fs.rmSync(agentsDir, { recursive: true, force: true });
});

describe('envelope encryption (deterministic, no MAYO)', () => {
  test('encrypt → decrypt round-trips the exact plaintext', () => {
    const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // stand-in secret
    const env = encryptSecret(secret, MASTER, AGENT);
    expect(env.alg).toBe('AES-256-GCM');
    expect(decryptSecret(env, MASTER, AGENT)).toBe(secret);
  });

  test('decrypt fails under a different master key', () => {
    const env = encryptSecret('sekret', MASTER, AGENT);
    const wrong = crypto.randomBytes(32);
    expect(() => decryptSecret(env, wrong, AGENT)).toThrow();
  });

  test('decrypt fails under a different agent_id (KEK/AAD bound to agent)', () => {
    const env = encryptSecret('sekret', MASTER, AGENT);
    expect(() => decryptSecret(env, MASTER, 'other-agent')).toThrow();
  });

  test('a tampered ciphertext fails authentication', () => {
    const env = encryptSecret('sekret', MASTER, AGENT);
    const bytes = Buffer.from(env.ct, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decryptSecret({ ...env, ct: bytes.toString('base64') }, MASTER, AGENT)).toThrow();
  });
});

describe('ensureAgentIdentity — acceptance criteria', () => {
  test('creates xmbl.json with broker-safe fields + encrypted secret', async () => {
    const res = await ensureAgentIdentity(AGENT, opts());
    expect(res.created).toBe(true);
    expect(res.address).toMatch(/^xmb[0-9a-f]{40}$/);
    const rec = JSON.parse(fs.readFileSync(res.path, 'utf8'));
    expect(rec.public_key).toBe(res.public_key);
    expect(rec.secret_key_encrypted.alg).toBe('AES-256-GCM');
    expect(rec.secret_key_encrypted.ct).toBeTruthy();
  });

  test('file mode is exactly 0600', async () => {
    const res = await ensureAgentIdentity(AGENT, opts());
    expect(fs.statSync(res.path).mode & 0o777).toBe(0o600);
  });

  test('is idempotent per agent — re-run does not regenerate', async () => {
    const first = await ensureAgentIdentity(AGENT, opts());
    const mtime1 = fs.statSync(first.path).mtimeMs;
    const raw1 = fs.readFileSync(first.path, 'utf8');

    const second = await ensureAgentIdentity(AGENT, opts());
    expect(second.created).toBe(false);
    expect(second.address).toBe(first.address);
    expect(second.public_key).toBe(first.public_key);
    // byte-identical file + unchanged mtime prove no regeneration/rewrite occurred
    expect(fs.readFileSync(second.path, 'utf8')).toBe(raw1);
    expect(fs.statSync(second.path).mtimeMs).toBe(mtime1);
  });

  test('refuses to overwrite an existing-but-corrupt xmbl.json', async () => {
    const file = path.join(agentsDir, AGENT, 'xmbl.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ agent_id: AGENT }), { mode: 0o600 });
    await expect(ensureAgentIdentity(AGENT, opts())).rejects.toThrow(/missing fields|refusing/);
    // the pre-existing file is untouched
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ agent_id: AGENT });
  });

  test('rejects a path-traversal agent_id', async () => {
    await expect(ensureAgentIdentity('../evil', opts())).rejects.toThrow(/invalid agent_id/);
  });

  // decrypt → sign → verify. Depends on the MAYO wasm (xid/mayo-c-source submodule);
  // if the submodule/wasm is absent this is the only test that cannot run — the
  // storage/crypto coverage above is independent of it.
  test('decrypt → sign → verify round-trip passes', async () => {
    await ensureAgentIdentity(AGENT, opts());
    const identity = await loadAgentIdentity(AGENT, opts());
    const signed = await identity.signTransaction({ to: 'xmbDEST', amount: 1, nonce: 1 });
    expect(await Identity.verifyTransaction(signed, identity.publicKey)).toBe(true);
  });
});

describe('master-key first-use (file path, no injected key)', () => {
  let masterKeyPath;
  beforeEach(() => {
    masterKeyPath = path.join(agentsDir, 'xmbl-master.key');
  });

  test('creates the master key file 0600 on first use, and reuses it', async () => {
    const a = await ensureAgentIdentity('agent-a', { agentsDir, masterKeyPath });
    expect(fs.existsSync(masterKeyPath)).toBe(true);
    expect(fs.statSync(masterKeyPath).mode & 0o777).toBe(0o600);
    const masterBytes = fs.readFileSync(masterKeyPath);

    // a second agent's first-use reuses the same master key (file unchanged)
    await ensureAgentIdentity('agent-b', { agentsDir, masterKeyPath });
    expect(fs.readFileSync(masterKeyPath).equals(masterBytes)).toBe(true);

    // both decrypt under the shared master
    await expect(loadAgentIdentity('agent-a', { agentsDir, masterKeyPath })).resolves.toBeTruthy();
    await expect(loadAgentIdentity('agent-b', { agentsDir, masterKeyPath })).resolves.toBeTruthy();
    void a;
  });

  // The regression this task fixes: N agents doing first-ever keygen CONCURRENTLY
  // in SEPARATE PROCESSES on a fresh box must not clobber each other's master key.
  // (Same-process Promise.all can't reproduce it — loadMasterKey is synchronous, so
  // the first caller finishes creating the file before any other runs. Real OS-level
  // concurrency requires real processes.)
  test('concurrent first-use never loses a secret (N processes, all decrypt)', async () => {
    const N = 8;
    const moduleUrl = new URL('../src/agent-keystore.js', import.meta.url).href;
    // Each child does a first-use ensureAgentIdentity against the SAME fresh master path.
    const childScript = `
      const { ensureAgentIdentity } = await import(process.env.KS_MODULE);
      await ensureAgentIdentity(process.env.KS_AGENT, {
        agentsDir: process.env.KS_AGENTS_DIR,
        masterKeyPath: process.env.KS_MASTER,
      });
    `;
    const runChild = (agentId) =>
      new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          ['--input-type=module', '-e', childScript],
          {
            env: {
              ...process.env,
              KS_MODULE: moduleUrl,
              KS_AGENT: agentId,
              KS_AGENTS_DIR: agentsDir,
              KS_MASTER: masterKeyPath,
              HANDOFF_XMBL_MASTER_KEY: '', // force the file path, not the env override
            },
          },
          (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()),
        );
      });

    // launch all N concurrently to maximize create-race overlap
    await Promise.all(Array.from({ length: N }, (_, i) => runChild(`race-agent-${i}`)));

    // exactly one master key survived, 0600
    expect(fs.existsSync(masterKeyPath)).toBe(true);
    expect(fs.statSync(masterKeyPath).mode & 0o777).toBe(0o600);

    // EVERY agent's secret must still decrypt under the surviving master key —
    // this is the property the race previously broke.
    for (let i = 0; i < N; i++) {
      const identity = await loadAgentIdentity(`race-agent-${i}`, { agentsDir, masterKeyPath });
      expect(identity.privateKey).toBeTruthy();
    }
  }, 30000);
});

describe('secret never leaks (constraint b)', () => {
  test('getPublicRecord exposes no secret field', async () => {
    await ensureAgentIdentity(AGENT, opts());
    const pub = getPublicRecord(AGENT, opts());
    expect(Object.keys(pub).sort()).toEqual(['address', 'agent_id', 'public_key']);
    expect(JSON.stringify(pub)).not.toMatch(/secret/i);
  });

  test('the plaintext secret does not appear anywhere in xmbl.json', async () => {
    const res = await ensureAgentIdentity(AGENT, opts());
    const identity = await loadAgentIdentity(AGENT, opts());
    const plaintextSecret = identity.privateKey;
    const fileContents = fs.readFileSync(res.path, 'utf8');
    expect(fileContents).not.toContain(plaintextSecret);
  });
});
