#!/usr/bin/env node
// A5d acceptance: start the node, discover its metrics URL from the control
// socket, curl the endpoint, and assert every counter is present + NUMERIC.
// Also confirms the endpoint is bound to loopback only.
//
// Hermetic: temp data_dir, ephemeral libp2p port, children tracked + killed,
// hard overall timeout so it can never hang a review.
import { spawn, execFile } from 'child_process';
import net from 'net';
import http from 'http';
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-metrics-check-'));
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
    roles: { validate: true, storage: false, compute: true, relay: false, lead: false },
    resource_caps: { disk_mb: 1024, compute_cpu_ms: 10000, compute_mem_mb: 512 },
  }, null, 2),
);

// Minimal WASM module exporting "add": (i32, i32) -> i32 — same fixture used
// by xsc/__tests__/compute-node.test.js.
const ADD_WASM_B64 = Buffer.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02,
  0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61,
  0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01,
  0x6a, 0x0b,
]).toString('base64');

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
function sockCall(op, args = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    let buf = '';
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const timer = setTimeout(() => fail(new Error(`${op} timeout`)), timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ op, ...args }) + '\n'));
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
async function pollUntil(fetchFn, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fetchFn();
    if (predicate(last)) return last;
    await sleep(200);
  }
  return last;
}
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function waitForSock(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(sockPath)) {
      try { const r = await sockCall('status'); if (r.ok && r.metrics_url) return r; } catch { /* not up */ }
    }
    await sleep(300);
  }
  throw new Error('node did not come up with a metrics_url');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

async function run() {
  startDaemon();
  const status = await waitForSock(30000);
  const url = status.metrics_url;
  assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url), `metrics_url is loopback-bound (${url})`);

  const { status: code, json: m } = await httpGetJson(url);
  assert(code === 200, 'GET metrics returns 200');

  // every top-level counter present + numeric
  for (const field of ['uptime_seconds', 'peer_count', 'validations_completed', 'shards_stored', 'compute_jobs_run']) {
    assert(isNum(m[field]), `${field} is numeric (${m[field]})`);
  }
  // all 5 mempool stage depths present + numeric
  assert(m.mempool && typeof m.mempool === 'object', 'mempool object present');
  for (const stage of ['raw', 'validation_tasks', 'locked_utxo', 'processing', 'tx']) {
    assert(isNum(m.mempool[stage]), `mempool.${stage} is numeric (${m.mempool[stage]})`);
  }
  // Before any tx/job: nothing has run yet — honest 0s.
  assert(m.validations_completed === 0 && m.shards_stored === 0 && m.compute_jobs_run === 0,
    'group-E counters are 0 before any tx/job (unpopulated, not faked)');

  // E1 acceptance: submit_tx (roles.validate: true) produces a validation task
  // addressed back to this node's own identity; its ValidationWorker claims +
  // completes it — validations_completed rises. compute/storage still 0 here.
  const submitResult = await sockCall('submit_tx', { tx: { to: 'bob', amount: 1.23 } }, 8000);
  assert(submitResult.ok === true, `submit_tx succeeds (${JSON.stringify(submitResult)})`);

  const afterTx = await pollUntil(
    async () => (await httpGetJson(url)).json,
    (json) => json.validations_completed > 0,
    10000,
  );
  assert(afterTx.validations_completed > 0,
    `validations_completed rose after submit_tx (${afterTx.validations_completed})`);
  assert(afterTx.shards_stored === 0 && afterTx.compute_jobs_run === 0,
    'compute/storage counters still honest 0 before compute runs');

  // E3 acceptance: a job within resource_caps (roles.compute: true) runs and
  // compute_jobs_run rises; a refused job (missing required fields) does NOT.
  const goodJob = await sockCall('compute_job', {
    job: { jobId: 'e3-check-1', wasmCode: ADD_WASM_B64, functionName: 'add', args: [2, 3] },
  });
  assert(goodJob.ok === true && goodJob.result === 5, `compute_job runs within caps (${JSON.stringify(goodJob)})`);

  const afterGood = (await httpGetJson(url)).json;
  assert(afterGood.compute_jobs_run === 1, `compute_jobs_run rose after a within-caps job (${afterGood.compute_jobs_run})`);

  const badJob = await sockCall('compute_job', { job: { jobId: 'e3-check-2' } });
  assert(badJob.ok === false, `malformed/refused compute_job returns ok:false (${JSON.stringify(badJob)})`);

  const afterBad = (await httpGetJson(url)).json;
  assert(afterBad.compute_jobs_run === 1, 'a refused compute_job does NOT increment compute_jobs_run');
  assert(afterBad.validations_completed > 0 && afterBad.shards_stored === 0,
    'E1 validations persisted (validate ran first), E2 storage honest 0');

  // loopback-only: the endpoint must NOT be reachable on a routable LAN address.
  // (Connecting to 0.0.0.0 is ambiguous/loopback on many OSes, so probe a real
  // non-loopback interface address if one exists; otherwise the metrics_url
  // loopback regex above is the binding proof.)
  const port = Number(url.match(/:(\d+)\//)[1]);
  const lan = Object.values(os.networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (lan) {
    const reachable = await new Promise((resolve) => {
      const sock = net.connect({ host: lan.address, port, timeout: 1500 });
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));   // refused off-loopback = correct
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    assert(reachable === false, `endpoint NOT reachable on LAN address ${lan.address} (loopback only)`);
  } else {
    console.log('  ok: no non-loopback interface to probe; metrics_url confirms 127.0.0.1 bind');
  }

  const stopCode = await runCmd('stop');
  assert(stopCode === 0, 'stop exits 0');

  console.log('\nPASS: metrics endpoint returns all numeric counters on 127.0.0.1; E-role counters honest 0; clean shutdown');
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
