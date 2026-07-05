#!/usr/bin/env node
// A5c acceptance: exercise the local control socket end-to-end in a real daemon.
//   - each op (status, peers, wallet, roles, submit_tx) returns a JSON reply
//   - an unknown op returns a JSON error (not a crash, not a hang)
//   - after submit_tx the daemon STILL answers status (proves "not a crash")
//   - node.sock is gone after stop
//
// The client below replicates handoff-lib `coordCall`'s framing exactly (connect
// → write one JSON line → read one \n-terminated line → parse). That is the proof
// the handoff side reuses coordCall by pointing HANDOFF_COORD_SOCK at node.sock —
// no cross-repo import, byte-identical protocol.
import { spawn, execFile } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const NODE = process.execPath;
const DAEMON = fileURLToPath(new URL('../node.js', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Hermetic keystore: fixed master key (no ~/.handoff writes) + a controlled
// agents/<id>/xmbl.json path so the derived agent_id is deterministic.
const CHILD_ENV = { ...process.env, HANDOFF_XMBL_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-sock-check-'));
const dataDir = path.join(tmp, 'data');
const cfgPath = path.join(tmp, 'config.node.json');
const sockPath = path.join(dataDir, 'node.sock');
fs.writeFileSync(
  cfgPath,
  JSON.stringify({
    identity_path: path.join(tmp, 'agents', 'testnode', 'xmbl.json'),
    data_dir: dataDir,
    listen_addrs: ['/ip4/127.0.0.1/tcp/0'],
    bootstrap_peers: [],
    roles: { validate: true, storage: false, compute: false, relay: false, lead: false },
    resource_caps: { disk_mb: 1024, compute_cpu_ms: 10000, compute_mem_mb: 512 },
  }, null, 2),
);

const children = new Set();
function startDaemon() {
  const c = spawn(NODE, [DAEMON, 'start', '--config', cfgPath], { stdio: 'inherit', env: CHILD_ENV });
  children.add(c);
  c.on('exit', () => children.delete(c));
  return c;
}
function runCmd(cmd) {
  return new Promise((resolve) => {
    execFile(NODE, [DAEMON, cmd, '--config', cfgPath], { env: CHILD_ENV }, (err) => resolve(err ? (err.code ?? 1) : 0));
  });
}

// coordCall-equivalent single request/response client.
function sockCall(op, params = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    let buf = '';
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const timer = setTimeout(() => fail(new Error(`${op} did not respond in time`)), timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ op, ...params }) + '\n'));
    sock.on('data', (d) => {
      buf += d;
      const i = buf.indexOf('\n');
      if (i < 0) return;
      clearTimeout(timer);
      done = true;
      try { resolve(JSON.parse(buf.slice(0, i))); } catch (e) { reject(e); } finally { try { sock.end(); } catch {} }
    });
    sock.on('error', (e) => { clearTimeout(timer); fail(e); });
  });
}

async function waitForSock(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(sockPath)) {
      try { const r = await sockCall('status'); if (r.ok) return r; } catch { /* not up yet */ }
    }
    await sleep(300);
  }
  throw new Error('control socket did not come up');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run() {
  startDaemon();
  const status = await waitForSock(30000);
  assert(status.ok && !!status.peer_id, `status returns a reply with peer id (${status.peer_id})`);

  const peers = await sockCall('peers');
  assert(peers.ok && Array.isArray(peers.peers), `peers returns an array (count ${peers.count})`);

  const wallet = await sockCall('wallet');
  assert(wallet.ok && /^xmb[0-9a-f]{40}$/.test(wallet.address), `wallet returns the node address (${wallet.address})`);

  const roles = await sockCall('roles');
  assert(roles.ok && roles.roles.validate === true, 'roles returns the configured roles');

  const submit = await sockCall('submit_tx', { tx: { to: 'xmbDEST', amount: 1, nonce: 1 } });
  assert(submit.ok && !!submit.tx_id, `submit_tx returns a tx id (${String(submit.tx_id).slice(0, 16)}…)`);

  // the whole point of "never a crash": the daemon still answers after submit_tx
  const after = await sockCall('status');
  assert(after.ok && !!after.peer_id, 'daemon still answers status after submit_tx (not crashed)');

  // malformed submit_tx → JSON error, not a crash
  const badSubmit = await sockCall('submit_tx', {});
  assert(badSubmit.ok === false && /tx object/.test(badSubmit.error), 'submit_tx without a tx returns a JSON error');

  // unknown op → JSON error, not a hang/crash
  const unknown = await sockCall('frobnicate');
  assert(unknown.ok === false && unknown.error === 'unknown op', 'unknown op returns { ok:false, error:"unknown op" }');

  // still answering after all of that
  const finalStatus = await sockCall('status');
  assert(finalStatus.ok, 'daemon still answers after an unknown op');

  const stopCode = await runCmd('stop');
  assert(stopCode === 0, 'stop exits 0');
  assert(!fs.existsSync(sockPath), 'node.sock removed after stop');

  console.log('\nPASS: control socket serves status/peers/wallet/roles/submit_tx; unknown op errors; no crash; sock cleaned up');
}

async function cleanup() {
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

const hardTimeout = setTimeout(async () => {
  console.error('\nFAIL: overall hard timeout (90s) exceeded');
  await cleanup();
  process.exit(1);
}, 90000);

run()
  .then(async () => { clearTimeout(hardTimeout); await cleanup(); process.exit(0); })
  .catch(async (e) => { clearTimeout(hardTimeout); console.error(`\nFAIL: ${e.message}`); await cleanup(); process.exit(1); });
