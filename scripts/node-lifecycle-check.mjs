#!/usr/bin/env node
// A5b acceptance: demonstrate the exact lifecycle cycle end-to-end in real
// processes (libp2p hangs jest's open-handle detector, so this is a script, not
// a jest test):
//
//   start -> status shows peer id -> stop (exit 0) -> restart reopens LevelDB
//   WITHOUT corruption -> stop.
//
// Hermetic: a temp data_dir + ephemeral port, spawned children tracked and
// killed on failure, and a hard overall timeout so it can never hang a review.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
// Read the ledger back through xclt's own Ledger (relative import) so the
// `level` dependency resolves from the xclt workspace, not root.
import { Ledger } from '../xclt/index.js';

const NODE = process.execPath;
const DAEMON = fileURLToPath(new URL('../node.js', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-node-check-'));
const dataDir = path.join(tmp, 'data');
const cfgPath = path.join(tmp, 'config.node.json');
fs.writeFileSync(
  cfgPath,
  JSON.stringify({
    identity_path: path.join(tmp, 'xmbl.json'),
    data_dir: dataDir,
    listen_addrs: ['/ip4/127.0.0.1/tcp/0'], // ephemeral port
    bootstrap_peers: [],
    roles: { validate: false, storage: false, compute: false, relay: false, lead: false },
    resource_caps: { disk_mb: 1024, compute_cpu_ms: 10000, compute_mem_mb: 512 },
  }, null, 2),
);

const children = new Set();
function startDaemon() {
  const c = spawn(NODE, [DAEMON, 'start', '--config', cfgPath], { stdio: 'inherit' });
  children.add(c);
  c.on('exit', () => children.delete(c));
  return c;
}
function runCmd(cmd) {
  return new Promise((resolve) => {
    execFile(NODE, [DAEMON, cmd, '--config', cfgPath], (err, stdout) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '' });
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
async function waitForPeer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await status();
    if (s.running && s.peer_id) return s;
    await sleep(300);
  }
  throw new Error('timed out waiting for the node to report a peer id');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run() {
  // repo-root ./data must never be created: all node state must be contained
  // in data_dir (a leak means a subsystem ignored its configured dbPath).
  const repoData = path.resolve('data');
  const repoDataPre = fs.existsSync(repoData);

  // 1. start -> status shows peer id
  startDaemon();
  const s1 = await waitForPeer(30000);
  assert(!!s1.peer_id, `first boot reports peer id (${s1.peer_id})`);
  assert(fs.existsSync(path.join(dataDir, 'ledger', 'CURRENT')), 'ledger LevelDB was created on disk');

  // containment: every LevelDB (ledger, xvsm, xpc) lives under data_dir, and the
  // run created no ./data at the repo root.
  for (const sub of ['ledger', 'xvsm', 'xpc']) {
    assert(fs.existsSync(path.join(dataDir, sub)), `${sub} LevelDB is contained under data_dir`);
  }
  assert(repoDataPre || !fs.existsSync(repoData), 'no state leaked to repo-root ./data');

  // 2. stop -> exit 0, pidfile removed
  const stop1 = await runCmd('stop');
  assert(stop1.code === 0, 'stop exits 0');
  assert(!fs.existsSync(path.join(dataDir, 'node.pid')), 'pidfile removed after stop');
  const down = await status();
  assert(down.running === false, 'status reports not running after stop');

  // 3. restart -> reopens the SAME LevelDB without corruption
  startDaemon();
  const s2 = await waitForPeer(30000);
  assert(!!s2.peer_id, `restart reopens and reports peer id (${s2.peer_id})`);

  // 4. stop again cleanly
  const stop2 = await runCmd('stop');
  assert(stop2.code === 0, 'second stop exits 0');

  // 5. Final integrity check: open the ledger directly (now that no node holds
  //    the LOCK) and read the boot marker — proves data survived two clean
  //    close/reopen cycles with no corruption.
  const ledger = new Ledger({ dbPath: path.join(dataDir, 'ledger') });
  await ledger.db.open();
  const marker = JSON.parse(await ledger.db.get('node:boot'));
  assert(!!marker.peer_id, 'ledger reopened clean and boot marker is readable');
  await ledger.db.close();

  console.log('\nPASS: start -> status(peer id) -> stop(0) -> restart(no corruption) -> stop(0)');
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
