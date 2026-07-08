#!/usr/bin/env node
// A5e acceptance: the daemon binds a STABLE node identity from the C1 keystore at
// config.identity_path, so restarts keep the SAME xmbl address instead of minting
// a fresh one each boot (the pre-A5e bug: xmb7c1d1cf… then xmbd04c5f3… across one
// restart). Proven end-to-end in real processes (libp2p hangs jest, so this is a
// script, matching node-lifecycle-check.mjs).
//
//   start -> status(address A1) -> stop -> start -> status(address A2) -> stop
//   assert A1 === A2 ; assert keystore file is 0600 at identity_path
//   assert an empty identity_path FAILS start cleanly (no silent mint)
//
// Hermetic: a temp HOME-free master key (HANDOFF_XMBL_MASTER_KEY in the child env)
// so nothing touches ~/.handoff; a controlled <tmp>/agents/testnode/xmbl.json path
// so the derived agent_id is the literal `testnode` (never a random mkdtemp char);
// children tracked + killed on failure; a hard overall timeout.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const NODE = process.execPath;
const DAEMON = fileURLToPath(new URL('../node.js', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fixed 32-byte master key for the child, so keystore create/load is hermetic
// and never writes ~/.handoff/xmbl-master.key on the host running the check.
const CHILD_ENV = { ...process.env, HANDOFF_XMBL_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-node-identity-'));
const dataDir = path.join(tmp, 'data');
const identityPath = path.join(tmp, 'agents', 'testnode', 'xmbl.json'); // agent_id = "testnode"
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
async function waitForAddress(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await status();
    if (s.running && s.address) return s;
    await sleep(300);
  }
  throw new Error('timed out waiting for the node to report an address');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run() {
  // 1. first boot -> record address + peer id
  startDaemon();
  const s1 = await waitForAddress(30000);
  assert(!!s1.address && s1.address.startsWith('xmb'), `first boot reports an xmbl address (${s1.address})`);
  assert(fs.existsSync(identityPath), 'keystore file created at identity_path');
  const mode = fs.statSync(identityPath).mode & 0o777;
  assert(mode === 0o600, `keystore file is 0600 (got 0${mode.toString(8)})`);
  const stop1 = await runCmd('stop');
  assert(stop1.code === 0, 'first stop exits 0');

  // 2. restart with the SAME config -> address must be identical
  startDaemon();
  const s2 = await waitForAddress(30000);
  assert(s2.address === s1.address, `restart keeps the SAME address (${s2.address})`);
  const stop2 = await runCmd('stop');
  assert(stop2.code === 0, 'second stop exits 0');

  // OBSERVED, not asserted here: A5e delivers the stable xmbl ADDRESS (what the
  // acceptance criteria and D3/E1's wallet/submitting identity require). The libp2p
  // peer_id is xn's own key; its persistence is delivered SEPARATELY by A5f — the
  // node now reloads a persisted libp2p key, so peer_id is ALSO stable across
  // restarts. That is asserted in scripts/node-peerid-check.mjs.
  console.log(`  note: peer_id boot1=${s1.peer_id} boot2=${s2.peer_id} (A5e = stable address; A5f = stable peer_id, see node-peerid-check.mjs)`);

  // 3. a MISSING identity_path must FAIL start clearly, never silently mint.
  const badCfg = path.join(tmp, 'config.bad.json');
  fs.writeFileSync(badCfg, JSON.stringify({ ...baseCfg, identity_path: '' }, null, 2));
  const bad = await runCmd('start', badCfg);
  assert(bad.code !== 0, `empty identity_path fails start (exit ${bad.code})`);
  assert(/identity_path/.test(bad.stderr), 'the failure message names identity_path');

  console.log('\nPASS: start -> address A -> stop -> restart -> SAME address A -> stop; 0600 keystore; empty identity_path errors cleanly');
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
