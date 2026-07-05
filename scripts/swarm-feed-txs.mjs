#!/usr/bin/env node
// G2: feeds simulated transactions into the running docker-compose swarm's
// real xmbl-node daemons over their local control sockets (docs/node-daemon.md
// "Local control socket (A5c)") — round-robins across every node's node.sock,
// so this proves txs actually reach the daemons' own mempools (via each node's
// own onboard identity signing them), not just that xsim can run standalone.
//
// Each node's data_dir volume is mounted read-only under /nodes/<name>/ in the
// feeder container (see docker-compose.swarm.yml), so node.sock is reachable
// at /nodes/<name>/node.sock without any network hop.
import net from 'node:net';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const NODES_DIR = process.env.SWARM_NODES_DIR || '/nodes';
const TX_COUNT = Number(process.env.SWARM_TX_COUNT || 20);
const TX_INTERVAL_MS = Number(process.env.SWARM_TX_INTERVAL_MS || 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sockCall(sockPath, op, params = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    let buf = '';
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const timer = setTimeout(() => fail(new Error(`${op} timed out on ${sockPath}`)), timeoutMs);
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

function discoverNodeSockets() {
  if (!existsSync(NODES_DIR)) return [];
  return readdirSync(NODES_DIR)
    .map((name) => ({ name, sock: join(NODES_DIR, name, 'node.sock') }))
    .filter((n) => existsSync(n.sock));
}

function randomTx(seq) {
  const addr = () => `xmbl${Math.random().toString(16).slice(2, 10)}`;
  const types = ['utxo', 'token_creation', 'contract', 'state_diff'];
  return {
    id: `swarm-sim-${Date.now()}-${seq}`,
    type: types[seq % types.length],
    from: addr(),
    to: addr(),
    amount: Number((Math.random() * 1000).toFixed(2)),
    fee: Number((Math.random() * 10).toFixed(2)),
    stake: Number((Math.random() * 100).toFixed(2)),
    timestamp: Date.now(),
    data: `swarm-sim-payload-${seq}`,
  };
}

async function waitForNodes(minCount, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const nodes = discoverNodeSockets();
    if (nodes.length >= minCount) return nodes;
    console.log(`[swarm-feed-txs] waiting for node sockets (${nodes.length}/${minCount} up)...`);
    await sleep(1000);
  }
  throw new Error(`only found ${discoverNodeSockets().length}/${minCount} node sockets within ${maxWaitMs}ms`);
}

async function main() {
  const nodes = await waitForNodes(1);
  console.log(`[swarm-feed-txs] found ${nodes.length} node socket(s): ${nodes.map((n) => n.name).join(', ')}`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < TX_COUNT; i++) {
    const node = nodes[i % nodes.length];
    const tx = randomTx(i);
    try {
      const res = await sockCall(node.sock, 'submit_tx', { tx });
      if (res.ok) {
        ok++;
        console.log(`[swarm-feed-txs] [${node.name}] tx ${tx.id} -> raw_tx_id=${res.tx_id}`);
      } else {
        failed++;
        console.error(`[swarm-feed-txs] [${node.name}] tx ${tx.id} REJECTED: ${res.error}`);
      }
    } catch (e) {
      failed++;
      console.error(`[swarm-feed-txs] [${node.name}] tx ${tx.id} ERROR: ${e.message}`);
    }
    await sleep(TX_INTERVAL_MS);
  }

  console.log(`[swarm-feed-txs] done — ${ok} submitted, ${failed} failed, out of ${TX_COUNT}`);
  // Print each node's mempool depth via metrics so the proof is visible in one place.
  for (const node of nodes) {
    try {
      const status = await sockCall(node.sock, 'status');
      console.log(`[swarm-feed-txs] [${node.name}] status:`, JSON.stringify(status));
    } catch (e) {
      console.error(`[swarm-feed-txs] [${node.name}] status check failed: ${e.message}`);
    }
  }
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[swarm-feed-txs] fatal:', e);
  process.exit(1);
});
