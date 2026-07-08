// A5f — persist xn's libp2p peer key so peer_id is STABLE across node restarts.
//
// By default createLibp2p mints a FRESH key every start → a new peer_id each
// restart, which breaks presence continuity, bootstrap-seed stability (a seed
// multiaddr embeds its peer_id), and validation-task assignment keyed to a stable
// node. This persists an Ed25519 libp2p key at a caller-chosen path (0600) and
// loads it back, so the same peer_id survives restarts — the libp2p analog of A5e
// (which persists the xmbl address). Serialization is the canonical @libp2p/crypto
// protobuf (privateKeyToProtobuf), so the file is a standard libp2p key.
import fs from 'fs';
import path from 'path';
import { keys } from '@libp2p/crypto';

const { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } = keys;

/**
 * Load the persisted libp2p private key at `keyPath`, or create + persist one
 * (0600, create-once) if absent. Returns the key plus whether it was freshly
 * created — mirrors xid.ensureIdentityAtPath's {created,path} shape so callers can
 * log create-vs-load.
 *
 * @param {string} keyPath
 * @returns {Promise<{ privateKey: import('@libp2p/interface').PrivateKey, created: boolean, path: string }>}
 */
export async function loadOrCreatePeerKey(keyPath) {
  if (typeof keyPath !== 'string' || !keyPath) {
    throw new Error('loadOrCreatePeerKey: keyPath must be a non-empty string');
  }
  if (fs.existsSync(keyPath)) {
    const bytes = fs.readFileSync(keyPath);
    try { fs.chmodSync(keyPath, 0o600); } catch { /* best-effort tighten */ }
    return { privateKey: privateKeyFromProtobuf(bytes), created: false, path: keyPath };
  }

  const privateKey = await generateKeyPair('Ed25519');
  const bytes = privateKeyToProtobuf(privateKey);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  try {
    // create-once: `wx` fails with EEXIST if a concurrent start already wrote the
    // key, so two starts can never mint different keys (the loser loads the winner's).
    fs.writeFileSync(keyPath, bytes, { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') {
      const existing = fs.readFileSync(keyPath);
      try { fs.chmodSync(keyPath, 0o600); } catch { /* best-effort */ }
      return { privateKey: privateKeyFromProtobuf(existing), created: false, path: keyPath };
    }
    throw e;
  }
  try { fs.chmodSync(keyPath, 0o600); } catch { /* best-effort */ }
  return { privateKey, created: true, path: keyPath };
}
