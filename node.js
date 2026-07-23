#!/usr/bin/env node
// xmbl-node daemon — the process a handoff coordinator supervises.
//
// Lifecycle around XMBLCore (core/index.js), driven by the node config
// (core/node-config.js, A5a):
//   node node.js start  --config <path>   boot XMBLCore, write pidfile + status
//   node node.js stop   --config <path>   SIGTERM the running node, wait for exit 0
//   node node.js status --config <path>   report liveness + peer id from disk
//
// `start` runs the node in the FOREGROUND: the process it launches IS the node a
// coordinator supervises. `stop`/`status` are separate short-lived invocations
// that act on the running node via its pidfile.
//
// Scope (A5b): lifecycle only. Role flags are passed through and recorded, not
// used to gate subsystems (that is group-E).
//
// Identity (A5e): the node loads a STABLE identity from the C1 keystore at
// `config.identity_path` on start (create-once if absent, 0600) and hands it to
// XMBLCore BEFORE boot, so restarts keep the same xmbl `address` instead of
// minting a fresh XMBLCore identity each time. D3 (submit_tx from the node wallet)
// and E1 (validation tasks assigned to the submitting identity) require this
// stability. NOTE: this binds the xmbl `address` (the wallet/signing identity);
// the libp2p `peer_id` is xn's own key and is NOT persisted here — see
// scripts/node-identity-check.mjs and the A5e submission note.
import fs from 'fs';
import path from 'path';
import { loadConfig } from './core/node-config.js';
import { createControlServer } from './core/control-socket.js';
import { createMetricsServer } from './core/metrics-server.js';
import { ensureIdentityAtPath, loadIdentityAtPath } from './xid/index.js';
import { loadOrCreatePeerKey } from './xn/index.js';
// NOTE: XMBLCore is imported lazily inside `start` only. Importing core/index.js
// pulls in xvsm/xpc/xsc, which print startup banners at module-load time — that
// would pollute the machine-readable stdout of `status`/`stop`, which are pure
// filesystem operations and must not boot the core stack.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) flags[name] = argv[++i];
      else flags[name] = true;
    } else pos.push(a);
  }
  return { command: pos[0], flags };
}

const pidFile = (dataDir) => path.join(dataDir, 'node.pid');
const statusFile = (dataDir) => path.join(dataDir, 'node.status.json');
const sockFile = (dataDir) => path.join(dataDir, 'node.sock');

function readPid(dataDir) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile(dataDir), 'utf8').trim(), 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

// process.kill(pid, 0) throws ESRCH if the process is gone, EPERM if it exists
// but we can't signal it (still "alive").
function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// Map the node config (A5a shape) onto the XMBLCore/app config shape.
function toCoreConfig(cfg, dataDir) {
  return {
    network: { addresses: cfg.listen_addrs, bootstrap: cfg.bootstrap_peers },
    ledger: { dbPath: path.join(dataDir, 'ledger') },
    stateMachine: { dbPath: path.join(dataDir, 'xvsm'), totalShards: 4 },
    consensus: { dbPath: path.join(dataDir, 'xpc') },
    storage: { dbPath: path.join(dataDir, 'storage'), capacity: cfg.resource_caps.disk_mb * 1024 * 1024 },
    // E3: this node's own compute-job caps (A5a resource_caps), read by
    // XMBLCore.start() when constructing the opt-in ComputeNode.
    compute: { cpuMs: cfg.resource_caps.compute_cpu_ms, memMb: cfg.resource_caps.compute_mem_mb },
    logging: { level: 'info' },
    // group-E role opt-ins (E1's validate worker reads roles.validate, E3's
    // compute worker reads roles.compute; see XMBLCore.start()). A5b left these
    // passed-through/recorded only — this is group-E actually gating subsystems
    // on them.
    roles: cfg.roles,
  };
}

async function cmdStart(cfgPath) {
  const startTime = Date.now(); // for the metrics uptime counter
  const cfg = loadConfig(cfgPath);
  const dataDir = path.resolve(cfg.data_dir);
  fs.mkdirSync(dataDir, { recursive: true });

  const existing = readPid(dataDir);
  if (existing && isAlive(existing)) {
    console.error(`xmbl-node already running (pid ${existing})`);
    process.exit(1);
  }
  if (existing) fs.rmSync(pidFile(dataDir), { force: true }); // stale pidfile

  const { XMBLCore } = await import('./core/index.js'); // lazy: see top-of-file note
  const coreCfg = toCoreConfig(cfg, dataDir);

  // A5f: persist xn's libp2p key next to the C1 keystore (0600) so the node's
  // peer_id is STABLE across restarts — the libp2p analog of A5e's stable address.
  // Create-once if absent, load if present, then hand it to XNNode via
  // config.network BEFORE core.start() constructs libp2p (else it mints a fresh
  // peer_id each boot). D3/E1 (validation tasks keyed to a stable node) and a
  // bootstrap seed's published multiaddr (which embeds its peer_id) require this.
  const peerKeyPath = path.join(path.dirname(cfg.identity_path), 'libp2p-peer.key');
  const peerKeyInfo = await loadOrCreatePeerKey(peerKeyPath);
  coreCfg.network.privateKey = peerKeyInfo.privateKey;
  const core = new XMBLCore(coreCfg);

  // A5e: bind a STABLE node identity from the C1 keystore at cfg.identity_path
  // BEFORE start(). loadConfig has already rejected a missing/empty identity_path,
  // so there is no silent-mint fallback: create-once (0600) if the keystore file is
  // absent, load it if present, then hand it to XMBLCore (which skips its own
  // fresh-mint because xid is now set).
  const idInfo = await ensureIdentityAtPath(cfg.identity_path);
  const identity = await loadIdentityAtPath(cfg.identity_path);
  core.setIdentity(identity);

  await core.start();

  // start() opens no LevelDB (level is lazy). Open the ledger and write a boot
  // marker so the database is genuinely exercised — otherwise a stop/restart
  // cycle would flush and reopen nothing and prove nothing about integrity.
  await core.xclt.db.open();
  const peerId = core.xn.getPeerId() ? core.xn.getPeerId().toString() : null;
  await core.xclt.db.put(
    'node:boot',
    JSON.stringify({ peer_id: peerId, at: new Date().toISOString() }),
  );

  // Health + metrics endpoint (A5d): loopback-only HTTP, OS-assigned port. The
  // port is published in node.status.json + the control-socket status so the
  // coordinator can discover it without a fixed port or a config change.
  const metrics = await createMetricsServer({ core, port: 0, startTime });
  const metricsUrl = `http://127.0.0.1:${metrics.port}/`;

  fs.writeFileSync(pidFile(dataDir), String(process.pid), { mode: 0o644 });
  const status = {
    pid: process.pid,
    peer_id: peerId,
    address: core.xid ? core.xid.address : null,
    roles: cfg.roles,
    listen_addrs: cfg.listen_addrs,
    metrics_url: metricsUrl,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(statusFile(dataDir), JSON.stringify(status, null, 2), { mode: 0o644 });

  // Local control socket (A5c): how the coordinator talks to this running node.
  const sockPath = sockFile(dataDir);
  const server = await createControlServer({
    core,
    config: cfg,
    sockPath,
    statusSnapshot: () => ({
      pid: process.pid,
      peer_id: peerId,
      address: core.xid ? core.xid.address : null,
      roles: cfg.roles,
      listen_addrs: cfg.listen_addrs,
      metrics_url: metricsUrl,
      started_at: status.started_at,
      // Rides the ALREADY-POLLED status op (broker calls nodeStatus() on every /xmbl/status; no new
      // round-trip, not gated behind the slower `chain` O(blocks) scan) — same in-memory ring the
      // dedicated `validations` op also serves, just cheaply duplicated onto the hot path too.
      validations: (core.recentValidations || []).slice().reverse(),
    }),
  });
  console.log(
    `xmbl-node started pid=${process.pid} address=${core.xid ? core.xid.address : null}` +
      ` (identity ${idInfo.created ? 'created' : 'loaded'} at ${idInfo.path}) peer=${peerId} sock=${sockPath} metrics=${metricsUrl}`,
  );

  // Keep the process alive even if no networking role holds the loop open, and
  // shut down cleanly on signal: close the control socket, flush every LevelDB
  // (core.stop), then remove the pidfile/status/sock and exit 0.
  const keepAlive = setInterval(() => {}, 1 << 30);
  let shuttingDown = false;
  const shutdown = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(keepAlive);
    try {
      await new Promise((r) => server.close(r));
    } catch { /* already closed */ }
    try {
      await new Promise((r) => metrics.server.close(r));
    } catch { /* already closed */ }
    try {
      await core.stop();
    } catch (e) {
      console.error(`xmbl-node shutdown error: ${e.message}`);
    }
    fs.rmSync(pidFile(dataDir), { force: true });
    fs.rmSync(statusFile(dataDir), { force: true });
    fs.rmSync(sockPath, { force: true });
    console.log(`xmbl-node stopped (${sig})`);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function cmdStop(cfgPath) {
  const cfg = loadConfig(cfgPath);
  const dataDir = path.resolve(cfg.data_dir);
  const pid = readPid(dataDir);
  if (!pid || !isAlive(pid)) {
    if (pid) fs.rmSync(pidFile(dataDir), { force: true }); // clear stale pidfile
    console.error('xmbl-node not running');
    process.exit(1);
  }
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && isAlive(pid)) await sleep(100);
  if (isAlive(pid)) {
    console.error(`xmbl-node (pid ${pid}) did not stop within 15s`);
    process.exit(1);
  }
  console.log(`xmbl-node stopped (pid ${pid})`);
}

function cmdStatus(cfgPath) {
  const cfg = loadConfig(cfgPath);
  const dataDir = path.resolve(cfg.data_dir);
  const pid = readPid(dataDir);
  if (!pid) {
    console.log(JSON.stringify({ running: false, reason: 'no pidfile' }));
    return;
  }
  if (!isAlive(pid)) {
    console.log(JSON.stringify({ running: false, reason: 'stale pidfile', pid }));
    return;
  }
  let status = {};
  try {
    status = JSON.parse(fs.readFileSync(statusFile(dataDir), 'utf8'));
  } catch {
    /* status file may lag pidfile by a moment */
  }
  console.log(JSON.stringify({ running: true, ...status }, null, 2));
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cfgPath = flags.config || './config.node.json';
  switch (command) {
    case 'start':
      await cmdStart(cfgPath);
      break;
    case 'stop':
      await cmdStop(cfgPath);
      break;
    case 'status':
      cmdStatus(cfgPath);
      break;
    default:
      console.error('usage: node node.js <start|stop|status> [--config <path>]');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`xmbl-node: ${e.message}`);
  process.exit(1);
});
