import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
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
