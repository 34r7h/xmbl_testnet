#!/usr/bin/env node
// G2: docker-compose swarm entrypoint. One image, N services — each container
// is parameterized entirely by environment variables (no per-node baked config
// files), so docker-compose.swarm.yml just sets different env vars per replica.
//
// Responsibilities:
//   1. Generate this node's config.node.json from env vars (into its data_dir,
//      which is a per-service named volume — see docker-compose.swarm.yml).
//   2. Start the xmbl-node daemon (node.js start) as a CHILD process, forward
//      SIGTERM/SIGINT to it, and exit with its code — so docker's PID 1
//      signal handling reaches the actual daemon cleanly.
//   3. Poll the daemon's own control socket for its peer_id once it's up, and
//      (if SWARM_ROLE=bootstrap) publish {peer_id, addr} to a shared volume
//      file so the other nodes can pick it up as a bootstrap_peers entry.
//      Non-bootstrap nodes poll for that file and inject it into their own
//      config BEFORE starting the daemon.
//
// NOTE (found while building this, documented in docs/dev-swarm.md — NOT fixed
// here, out of scope for G2's infra-only mandate): bootstrap_peers as read from
// config.node.json is currently NEVER dialed by the daemon (xn/src/node.js's
// XNNode only reads `addresses`/`port` from its options, silently ignoring the
// `bootstrap` field `core/index.js:toCoreConfig` passes through) — so step 3's
// bootstrap-address handoff is wired and ready, but won't actually cause a
// libp2p dial until that gap is closed upstream. This script still performs the
// real handoff (proves the orchestration side works) so it "just works" the
// moment that wiring lands.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const NODE_NAME = process.env.SWARM_NODE_NAME || 'xmbl-node';
const DATA_DIR = process.env.SWARM_DATA_DIR || '/data';
const SOCK_PATH = join(DATA_DIR, 'node.sock');
const ROLE = process.env.SWARM_ROLE || 'peer'; // 'bootstrap' | 'peer'
const META_DIR = process.env.SWARM_META_DIR || '/swarm-meta';
const BOOTSTRAP_FILE = join(META_DIR, 'bootstrap-peer.json');
const LISTEN_PORT = process.env.SWARM_LISTEN_PORT || '4001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  console.log(`[swarm-entrypoint:${NODE_NAME}]`, ...args);
}

function sockCall(op, params = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCK_PATH);
    let buf = '';
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const timer = setTimeout(() => fail(new Error(`${op} timed out`)), timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ op, ...params }) + '\n'));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      done = true;
      clearTimeout(timer);
      try { resolve(JSON.parse(buf.slice(0, nl))); } catch (e) { reject(e); }
      sock.end();
    });
    sock.on('error', fail);
  });
}

async function waitForSocketAndPeerId(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (existsSync(SOCK_PATH)) {
      try {
        const res = await sockCall('status');
        if (res.ok && res.peer_id) return res;
      } catch { /* socket exists but not answering yet, or peer_id not assigned yet */ }
    }
    await sleep(500);
  }
  throw new Error(`node.sock never reported a peer_id within ${maxWaitMs}ms`);
}

async function waitForBootstrapFile(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (existsSync(BOOTSTRAP_FILE)) {
      try {
        const data = JSON.parse(readFileSync(BOOTSTRAP_FILE, 'utf8'));
        if (data && data.addr) return data;
      } catch { /* being written concurrently, retry */ }
    }
    await sleep(500);
  }
  log(`WARNING: no bootstrap-peer.json after ${maxWaitMs}ms — starting with empty bootstrap_peers`);
  return null;
}

function writeNodeConfig(bootstrapAddr) {
  mkdirSync(DATA_DIR, { recursive: true });
  const config = {
    // Not actually consumed at runtime yet (core/index.js always calls
    // Identity.create() fresh — see node.js's own comment on this; C1 wiring
    // is separate follow-up work). Must be a non-empty string to validate.
    identity_path: `/data/.unused-pending-C1-identity-wiring-${NODE_NAME}`,
    data_dir: DATA_DIR,
    listen_addrs: [`/ip4/0.0.0.0/tcp/${LISTEN_PORT}`],
    bootstrap_peers: bootstrapAddr ? [bootstrapAddr] : [],
    roles: {
      validate: process.env.SWARM_ROLE_VALIDATE === '1',
      storage: process.env.SWARM_ROLE_STORAGE === '1',
      compute: process.env.SWARM_ROLE_COMPUTE === '1',
      relay: process.env.SWARM_ROLE_RELAY === '1',
      lead: ROLE === 'bootstrap',
    },
    resource_caps: { disk_mb: 1024, compute_cpu_ms: 10000, compute_mem_mb: 512 },
  };
  const cfgPath = join(DATA_DIR, 'config.node.json');
  writeFileSync(cfgPath, JSON.stringify(config, null, 2));
  log(`wrote ${cfgPath}`, JSON.stringify(config));
  return cfgPath;
}

async function main() {
  let bootstrapAddr = null;
  if (ROLE !== 'bootstrap') {
    log('peer node — waiting for bootstrap-peer.json from the bootstrap node...');
    const meta = await waitForBootstrapFile();
    if (meta) {
      bootstrapAddr = meta.addr;
      log(`got bootstrap addr: ${bootstrapAddr}`);
    }
  }

  const cfgPath = writeNodeConfig(bootstrapAddr);

  log('starting xmbl-node daemon...');
  const child = spawn(process.execPath, [join(REPO_ROOT, 'node.js'), 'start', '--config', cfgPath], {
    stdio: 'inherit',
  });

  let exiting = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      if (exiting) return;
      exiting = true;
      log(`received ${sig}, forwarding to daemon...`);
      child.kill(sig);
    });
  }
  child.on('exit', (code, signal) => {
    log(`daemon exited (code=${code}, signal=${signal})`);
    process.exit(code ?? (signal ? 1 : 0));
  });

  if (ROLE === 'bootstrap') {
    try {
      const status = await waitForSocketAndPeerId();
      mkdirSync(META_DIR, { recursive: true });
      const addr = `/dns4/${NODE_NAME}/tcp/${LISTEN_PORT}/p2p/${status.peer_id}`;
      writeFileSync(BOOTSTRAP_FILE, JSON.stringify({ peer_id: status.peer_id, addr }, null, 2));
      log(`published bootstrap addr for other nodes: ${addr}`);
    } catch (e) {
      log('WARNING: could not publish bootstrap addr:', e.message);
    }
  }
}

main().catch((e) => {
  console.error(`[swarm-entrypoint:${NODE_NAME}] fatal:`, e);
  process.exit(1);
});
