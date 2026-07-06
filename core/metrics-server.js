import http from 'http';

/**
 * Health + metrics endpoint for the xmbl-node daemon (A5d).
 *
 * A tiny HTTP server bound to 127.0.0.1 ONLY (loopback → the OS refuses any
 * off-host connection, so no auth is needed). Every request returns the same
 * plain-JSON snapshot of numeric counters read live from XMBLCore.
 *
 * BIND SAFETY: host is hardcoded to 127.0.0.1 — never 0.0.0.0. Do not change
 * this without an auth story; these counters are unauthenticated.
 */

const LOOPBACK = '127.0.0.1';

// Depth of the raw-tx / validation-task mempools, which are keyed by leaderId:
//   rawTx:           Map<leaderId, Map<rawTxId, data>>
//   validationTasks: Map<leaderId, Array<task>>
// so the depth is the total across all leaders.
function sumNested(map, sizeOf) {
  let total = 0;
  if (map instanceof Map) for (const v of map.values()) total += sizeOf(v);
  return total;
}

/**
 * Build the metrics snapshot from the live core.
 * @param {import('./index.js').XMBLCore} core
 * @param {number} startTime - Date.now() at daemon start (for uptime)
 * @returns {object} all-numeric counters
 */
export function collectMetrics(core, startTime) {
  const mp = core?.xpc?.mempool || {};
  return {
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    peer_count: core?.xn?.getConnectedPeers ? core.xn.getConnectedPeers().length : 0,
    // xpc mempool depths — the 5 pipeline stages
    mempool: {
      raw: sumNested(mp.rawTx, (inner) => (inner instanceof Map ? inner.size : 0)),
      validation_tasks: sumNested(mp.validationTasks, (arr) => (Array.isArray(arr) ? arr.length : 0)),
      locked_utxo: mp.lockedUtxo instanceof Set ? mp.lockedUtxo.size : 0,
      processing: mp.processingTx instanceof Map ? mp.processingTx.size : 0,
      tx: mp.tx instanceof Map ? mp.tx.size : 0,
    },
    // Group-E role counters. These are cumulative counters the role workers own;
    // until E1/E2 land they have not run, so they stay honestly 0 (NOT faked).
    // E1 (validate role) will increment validations_completed as it validates txs.
    validations_completed: 0,
    // E2 (storage role) will increment shards_stored as it persists shards.
    shards_stored: 0,
    // E3 (compute role): cumulative jobs run by the ComputeNode, only
    // constructed when roles.compute is enabled (core/index.js) — 0 otherwise.
    compute_jobs_run: core?.computeNode?.computeJobsRun ?? 0,
  };
}

/**
 * Create + start the metrics HTTP server on 127.0.0.1.
 * @param {object} ctx
 * @param {import('./index.js').XMBLCore} ctx.core
 * @param {number} ctx.port - loopback port (0 = OS-assigned)
 * @param {number} ctx.startTime - Date.now() at daemon start
 * @returns {Promise<{server: http.Server, port: number}>}
 */
export function createMetricsServer({ core, port = 0, startTime }) {
  const server = http.createServer((req, res) => {
    let body;
    try {
      body = JSON.stringify(collectMetrics(core, startTime));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e?.message || e) }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  // a client socket error must never crash the daemon
  server.on('clientError', (_e, socket) => { try { socket.destroy(); } catch { /* gone */ } });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, LOOPBACK, () => resolve({ server, port: server.address().port }));
  });
}
