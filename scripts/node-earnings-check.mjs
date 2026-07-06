#!/usr/bin/env node
// E5 acceptance: the node earnings ledger is queryable via BOTH the control
// socket (`earnings` op) and the metrics HTTP endpoint (`earnings` field),
// and reports the correct shape/rates.
//
// This check runs against a daemon with no group-E role enabled, so every
// role's units are honestly 0 here (same "not faked" discipline as
// node-metrics-check.mjs) — collectEarnings() itself is unit-tested in
// __tests__/integration/earnings.test.js against synthetic non-zero core
// state for the E1 (validationsCompleted)/E2 (xsc.shardsStored)/E3
// (computeNode.computeJobsRun) read-paths, since those role workers
// themselves aren't part of this repo state at the time this check runs.
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
import { PAPER_RATES } from '../core/earnings.js';

const NODE = process.execPath;
const DAEMON = fileURLToPath(new URL('../node.js', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHILD_ENV = { ...process.env, HANDOFF_XMBL_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-earnings-check-'));
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
    roles: { validate: false, storage: false, compute: false, relay: false, lead: false },
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
function sockCall(op, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    let buf = '';
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const timer = setTimeout(() => fail(new Error(`${op} timeout`)), timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ op }) + '\n'));
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

function assertEarningsShape(earnings, label) {
  assert(earnings.currency === 'paper', `${label}: currency is "paper" (non-cashable)`);
  assert(typeof earnings.total_earned === 'number', `${label}: total_earned is numeric`);
  for (const role of Object.keys(PAPER_RATES)) {
    const r = earnings.by_role[role];
    assert(r && typeof r.units === 'number' && typeof r.earned === 'number' && r.rate === PAPER_RATES[role],
      `${label}: by_role.${role} has {units, rate:${PAPER_RATES[role]}, earned} (${JSON.stringify(r)})`);
  }
  assert(earnings.total_earned === 0, `${label}: total_earned is honestly 0 (no role enabled in this check)`);
}

async function run() {
  startDaemon();
  const status = await waitForSock(30000);

  // 1. control-socket `earnings` op
  const socketEarnings = await sockCall('earnings');
  assert(socketEarnings.ok === true, 'earnings op returns ok:true');
  assertEarningsShape(socketEarnings, 'control-socket earnings');

  // 2. metrics HTTP endpoint's `earnings` field — same shape, same source
  const { status: code, json: m } = await httpGetJson(status.metrics_url);
  assert(code === 200, 'GET metrics returns 200');
  assert(m.earnings && typeof m.earnings === 'object', 'metrics response includes an earnings object');
  assertEarningsShape(m.earnings, 'metrics.earnings');

  const stopCode = await runCmd('stop');
  assert(stopCode === 0, 'stop exits 0');

  console.log('\nPASS: earnings ledger queryable via control socket AND metrics; correct shape/rates; honest 0 with no role enabled');
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
