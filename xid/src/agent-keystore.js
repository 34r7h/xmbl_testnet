import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Identity } from './identity.js';

/**
 * agent-keystore — per-agent xid (MAYO) keypair generation + encrypted-at-rest
 * storage, reusing the existing per-agent directory layout
 * (~/.handoff/agents/<id>/ already holds config.json + skill.md).
 *
 * Each agent gets ~/.handoff/agents/<id>/xmbl.json:
 *   { version, agent_id, address, public_key, secret_key_encrypted, created_at }
 * Only `address` and `public_key` are broker-safe; the plaintext MAYO secret is
 * encrypted at rest and never leaves this machine.
 *
 * ── Encryption scheme (what wraps the secret) ──────────────────────────────────
 *   Cipher : AES-256-GCM, random 12-byte IV, 16-byte auth tag, AAD = agent_id.
 *   Key    : a per-file 256-bit key-encryption-key derived by
 *            HKDF-SHA256(ikm = machine master key, salt = random-per-file,
 *                        info = "xmbl/agent-secret/<agent_id>").
 *   Master : a single 32-byte machine master key. Source, in order:
 *            (1) opts.masterKey (Buffer/hex — for tests/CI injection),
 *            (2) env HANDOFF_XMBL_MASTER_KEY (base64 or hex, 32 bytes),
 *            (3) file ~/.handoff/xmbl-master.key (auto-created 0600 on first use).
 *   HKDF `info` binds each envelope to its agent_id, so a secret file cannot be
 *   swapped between agents; the GCM AAD enforces the same at decrypt time.
 *
 * ── Threat model / limitations (read before relying on this) ───────────────────
 *   This protects against: xmbl.json being accidentally committed to a repo or
 *   copied on its own, and casual inspection of the file.
 *   This does NOT protect against an attacker who can read the whole ~/.handoff
 *   tree (same OS user, root, or a backup/exfil of that directory): the master
 *   key and the ciphertext live under the same root, so such an attacker obtains
 *   both. Moving the master key out of that blast radius (OS keychain, a separate
 *   volume, or an operator-supplied passphrase) is an operator decision and a
 *   possible follow-up — not built here.
 */

const MASTER_KEY_BYTES = 32;

function defaultAgentsDir() {
  return path.join(os.homedir(), '.handoff', 'agents');
}
function defaultMasterKeyPath() {
  return path.join(os.homedir(), '.handoff', 'xmbl-master.key');
}

// agent_id becomes a path segment — reject anything that could traverse or escape.
function validateAgentId(agentId) {
  if (typeof agentId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agentId) || agentId === '.' || agentId === '..') {
    throw new Error(`agent-keystore: invalid agent_id ${JSON.stringify(agentId)}`);
  }
}

// Accept a 32-byte key encoded as hex (64 chars) or base64.
function decodeMasterKeyString(str) {
  const s = String(str).trim();
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(s)) buf = Buffer.from(s, 'hex');
  else buf = Buffer.from(s, 'base64');
  if (buf.length !== MASTER_KEY_BYTES) {
    throw new Error(`agent-keystore: master key must be ${MASTER_KEY_BYTES} bytes, got ${buf.length}`);
  }
  return buf;
}

// Write a file with an exact permission mode, atomically, regardless of umask or
// whether the destination already exists (temp file + rename + explicit chmod).
function writeFileAtomic(filePath, data, mode) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.writeFileSync(tmp, data, { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, filePath);
  fs.chmodSync(filePath, mode);
}

/**
 * Resolve the machine master key from opts → env → file (creating the file 0600
 * on first use). Returns a 32-byte Buffer. The master key is the root secret and
 * never leaves the box.
 */
export function loadMasterKey(opts = {}) {
  if (opts.masterKey) {
    return Buffer.isBuffer(opts.masterKey) ? opts.masterKey : decodeMasterKeyString(opts.masterKey);
  }
  if (process.env.HANDOFF_XMBL_MASTER_KEY) {
    return decodeMasterKeyString(process.env.HANDOFF_XMBL_MASTER_KEY);
  }
  const keyPath = opts.masterKeyPath || defaultMasterKeyPath();
  if (fs.existsSync(keyPath)) {
    fs.chmodSync(keyPath, 0o600);
    return decodeMasterKeyString(fs.readFileSync(keyPath, 'utf8'));
  }
  // First use: create the master key with an EXCLUSIVE create on the FINAL path
  // (flag 'wx' = O_CREAT|O_EXCL). A temp-file+rename is atomic but last-write-wins,
  // so two agents doing first-ever keygen concurrently on a fresh box would each
  // generate a different master key and clobber each other — leaving the earlier
  // agent's secret encrypted under a key that no longer exists (undecryptable).
  // With O_EXCL exactly one creator wins; every loser adopts the winner's key.
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = crypto.randomBytes(MASTER_KEY_BYTES);
  try {
    fs.writeFileSync(keyPath, key.toString('base64') + '\n', { flag: 'wx', mode: 0o600 });
    fs.chmodSync(keyPath, 0o600); // enforce mode regardless of umask
    return key;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return adoptMasterKey(keyPath); // lost the create race — use the winner's key
  }
}

// Synchronous short sleep (loadMasterKey is sync). Avoids a busy-spin while a
// concurrent creator finishes writing the key file.
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Adopt a master key created by a concurrent winner. The winner creates the file
// (O_EXCL) and then writes its bytes; a loser can observe the file after create
// but before the bytes land, so re-read briefly until it parses to a valid key.
function adoptMasterKey(keyPath) {
  let lastErr;
  for (let i = 0; i < 200; i++) { // up to ~1s; the write lands in microseconds
    try {
      const raw = fs.readFileSync(keyPath, 'utf8').trim();
      if (raw.length > 0) {
        const key = decodeMasterKeyString(raw);
        fs.chmodSync(keyPath, 0o600);
        return key;
      }
    } catch (e) {
      lastErr = e;
    }
    sleepMs(5);
  }
  throw new Error(`agent-keystore: master key at ${keyPath} unreadable after wait: ${lastErr?.message || 'empty file'}`);
}

function deriveKek(masterKey, salt, agentId) {
  const info = Buffer.from(`xmbl/agent-secret/${agentId}`);
  // hkdfSync returns an ArrayBuffer — wrap it before use as a cipher key.
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, info, 32));
}

/**
 * Encrypt a plaintext secret into a self-describing envelope bound to agent_id.
 * @returns {{v:number,alg:string,kdf:string,salt:string,iv:string,tag:string,ct:string}}
 */
export function encryptSecret(plaintext, masterKey, agentId) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const kek = deriveKek(masterKey, salt, agentId);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  cipher.setAAD(Buffer.from(agentId));
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'HKDF-SHA256',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

/** Decrypt an envelope produced by {@link encryptSecret}. Throws on tamper/wrong key. */
export function decryptSecret(envelope, masterKey, agentId) {
  const kek = deriveKek(masterKey, Buffer.from(envelope.salt, 'base64'), agentId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(agentId));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

function agentFilePath(agentId, opts) {
  return path.join(opts.agentsDir || defaultAgentsDir(), agentId, 'xmbl.json');
}

/**
 * Idempotently ensure agent <id> has an xid identity on disk.
 * If a valid xmbl.json already exists it is returned untouched (never regenerated).
 * A file that exists but is missing required fields is a hard error — never clobbered.
 *
 * @param {string} agentId
 * @param {{agentsDir?:string, masterKey?:Buffer|string, masterKeyPath?:string}} [opts]
 * @returns {Promise<{address:string, public_key:string, created:boolean, path:string}>}
 */
export async function ensureAgentIdentity(agentId, opts = {}) {
  validateAgentId(agentId);
  const file = agentFilePath(agentId, opts);

  if (fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rec.public_key || !rec.address || !rec.secret_key_encrypted) {
      throw new Error(`agent-keystore: ${file} exists but is missing fields; refusing to overwrite`);
    }
    fs.chmodSync(file, 0o600); // enforce mode even on a pre-existing file
    return { address: rec.address, public_key: rec.public_key, created: false, path: file };
  }

  const masterKey = loadMasterKey(opts);
  const identity = await Identity.create();
  const record = {
    version: 1,
    agent_id: agentId,
    address: identity.address,
    public_key: identity.publicKey,
    secret_key_encrypted: encryptSecret(identity.privateKey, masterKey, agentId),
    created_at: new Date().toISOString(),
  };
  writeFileAtomic(file, JSON.stringify(record, null, 2) + '\n', 0o600);
  return { address: identity.address, public_key: identity.publicKey, created: true, path: file };
}

// ── identity_path convenience (A5e) ────────────────────────────────────────────
// The xmbl-node config carries a single `identity_path` string. By convention
// (node-config schema) it is a `<agentsDir>/<agent_id>/xmbl.json` keystore file.
// These wrappers derive the agent_id from that path and delegate to the
// agent_id-based functions above — the keygen/crypto path (master-key O_EXCL race,
// atomic 0600 write, HKDF+GCM binding) is reused UNTOUCHED, and the file the
// wrapper resolves to IS `identity_path`. We require the `xmbl.json` filename so
// the crypto AAD binds to the intended <agent_id> segment, never to whatever a
// parent directory happens to be named.
function agentFromIdentityPath(identityPath) {
  if (typeof identityPath !== 'string' || identityPath.trim() === '') {
    throw new Error('agent-keystore: identity_path is empty; a node has no default identity');
  }
  const file = path.resolve(identityPath);
  if (path.basename(file) !== 'xmbl.json') {
    throw new Error(
      `agent-keystore: identity_path must be a <dir>/<agent_id>/xmbl.json keystore file, got ${identityPath}`,
    );
  }
  const agentId = path.basename(path.dirname(file));
  const agentsDir = path.dirname(path.dirname(file));
  return { agentId, agentsDir };
}

/**
 * Idempotently ensure the identity at `identityPath` exists (create-once, 0600),
 * returning its broker-safe fields. Delegates to {@link ensureAgentIdentity}.
 * @param {string} identityPath  a <agentsDir>/<agent_id>/xmbl.json path
 * @param {{masterKey?:Buffer|string, masterKeyPath?:string}} [opts]
 * @returns {Promise<{address:string, public_key:string, created:boolean, path:string}>}
 */
export async function ensureIdentityAtPath(identityPath, opts = {}) {
  const { agentId, agentsDir } = agentFromIdentityPath(identityPath);
  return ensureAgentIdentity(agentId, { ...opts, agentsDir });
}

/**
 * Load the identity at `identityPath`, decrypting the secret on-box, ready to
 * sign. Delegates to {@link loadAgentIdentity}.
 * @param {string} identityPath  a <agentsDir>/<agent_id>/xmbl.json path
 * @param {{masterKey?:Buffer|string, masterKeyPath?:string}} [opts]
 * @returns {Promise<Identity>}
 */
export async function loadIdentityAtPath(identityPath, opts = {}) {
  const { agentId, agentsDir } = agentFromIdentityPath(identityPath);
  return loadAgentIdentity(agentId, { ...opts, agentsDir });
}

/**
 * Load agent <id>'s identity, decrypting the secret on-box, ready to sign.
 * @returns {Promise<Identity>}
 */
export async function loadAgentIdentity(agentId, opts = {}) {
  validateAgentId(agentId);
  const file = agentFilePath(agentId, opts);
  if (!fs.existsSync(file)) throw new Error(`agent-keystore: no xmbl.json for ${agentId}`);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const masterKey = loadMasterKey(opts);
  const secret = decryptSecret(rec.secret_key_encrypted, masterKey, agentId);
  return new Identity(rec.public_key, secret);
}

/**
 * Return ONLY the broker-safe fields for agent <id> — never the secret.
 * This is what may be published to the broker (address + public_key).
 * @returns {{agent_id:string, address:string, public_key:string}}
 */
export function getPublicRecord(agentId, opts = {}) {
  validateAgentId(agentId);
  const file = agentFilePath(agentId, opts);
  if (!fs.existsSync(file)) throw new Error(`agent-keystore: no xmbl.json for ${agentId}`);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { agent_id: agentId, address: rec.address, public_key: rec.public_key };
}
