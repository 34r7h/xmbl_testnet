#!/usr/bin/env node
// A5f acceptance: the node's libp2p peer_id is STABLE across restarts, because xn's
// libp2p key is persisted (create-once, 0600) at <dir(identity_path)>/libp2p-peer.key
// and reloaded on boot — the libp2p analog of A5e (stable xmbl address). This closes
// the gap node-identity-check.mjs OBSERVED (pre-A5f: peer_id boot1 != boot2). libp2p
// hangs jest, so this is a script (matching node-identity-check.mjs).
//
//   start -> status(peer_id P1) -> stop -> start -> status(peer_id P2) -> stop
//   assert P1 === P2 ; assert P1 is a real 12D3Koo… peer id
//   assert the persisted key file is 0600 ; assert first boot CREATED it
//
// Hermetic: a fixed master key in the child env so nothing touches ~/.handoff; a
// controlled <tmp>/agents/testnode/xmbl.json identity path; children killed on
// failure; a hard overall timeout.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const NODE = process.execPath;
const DAEMON = fileURLToPath(new URL('../node.js', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fixed 32-byte master key for the child, so keystore create/load is hermetic and
// never writes ~/.handoff/xmbl-master.key on the host running the check.
const CHILD_ENV = { ...process.env, HANDOFF_XMBL_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-node-peerid-'));
const dataDir = path.join(tmp, 'data');
const identityPath = path.join(tmp, 'agents', 'testnode', 'xmbl.json'); // agent_id = "testnode"
const peerKeyPath = path.join(path.dirname(identityPath), 'libp2p-peer.key');
const cfgPath = path.join(tmp, 'config.node.json');
const baseCfg = {
  identity_path: identityPath,
  data_dir: dataDir,
  listen_addrs: ['/ip4/127.0.0.1/tcp/0'],
  bootstrap_peers: [],
  roles: { validate: false, storage: false, compute: false, relay: false, lead: false },
  resource_caps: { disk_mb: 1024, compute_cpu_ms: 10000, compute_mem_mb: 512 },
};
fs.writeFileSync(cfgPath, JSON.stringify(baseCfg, null, 2));

const children = new Set();
function startDaemon() {
  const c = spawn(NODE, [DAEMON, 'start', '--config', cfgPath], { stdio: 'inherit', env: CHILD_ENV });
  children.add(c);
  c.on('exit', () => children.delete(c));
  return c;
}
function runCmd(cmd, cfg = cfgPath) {
  return new Promise((resolve) => {
    execFile(NODE, [DAEMON, cmd, '--config', cfg], { env: CHILD_ENV }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
async function status() {
  const { stdout } = await runCmd('status');
  try {
    return JSON.parse(stdout);
  } catch {
    return { running: false };
  }
}
async function waitForPeerId(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await status();
    if (s.running && s.peer_id) return s;
    await sleep(300);
  }
  throw new Error('timed out waiting for the node to report a peer_id');
}
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run() {
  // 1. first boot -> record peer_id; the persisted key file is created 0600
  startDaemon();
  const s1 = await waitForPeerId(30000);
  assert(!!s1.peer_id && /^12D3Koo/.test(s1.peer_id), `first boot reports a libp2p peer_id (${s1.peer_id})`);
  assert(fs.existsSync(peerKeyPath), 'libp2p-peer.key created next to the keystore at first boot');
  const mode = fs.statSync(peerKeyPath).mode & 0o777;
  assert(mode === 0o600, `libp2p-peer.key is 0600 (got 0${mode.toString(8)})`);
  const stop1 = await runCmd('stop');
  assert(stop1.code === 0, 'first stop exits 0');

  // 2. restart with the SAME config -> peer_id MUST be identical (the A5f fix;
  //    pre-A5f this was a fresh 12D3Koo… each boot, as node-identity-check noted).
  startDaemon();
  const s2 = await waitForPeerId(30000);
  assert(s2.peer_id === s1.peer_id, `restart keeps the SAME peer_id (${s2.peer_id})`);
  const stop2 = await runCmd('stop');
  assert(stop2.code === 0, 'second stop exits 0');

  console.log('\nPASS: start -> peer_id P -> stop -> restart -> SAME peer_id P -> stop; 0600 persisted libp2p key');
}

async function cleanup() {
  for (const c of children) {
    try {
      c.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

const hardTimeout = setTimeout(async () => {
  console.error('\nFAIL: overall hard timeout (90s) exceeded');
  await cleanup();
  process.exit(1);
}, 90000);

run()
  .then(async () => {
    clearTimeout(hardTimeout);
    await cleanup();
    process.exit(0);
  })
  .catch(async (e) => {
    clearTimeout(hardTimeout);
    console.error(`\nFAIL: ${e.message}`);
    await cleanup();
    process.exit(1);
  });
