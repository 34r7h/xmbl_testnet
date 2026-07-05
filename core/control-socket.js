import net from 'net';
import fs from 'fs';

/**
 * Local control socket for the xmbl-node daemon — how the handoff coordinator
 * talks to a running node. A newline-delimited JSON op server over a unix socket
 * at data_dir/node.sock.
 *
 * PROTOCOL — deliberately byte-identical to the handoff coordinator socket
 * (~/.handoff/handoff-coordinator.mjs) so the handoff side reuses its existing
 * client (handoff-lib `coordCall`) by pointing HANDOFF_COORD_SOCK at node.sock,
 * with NO new client:
 *   request:  one JSON line `{"op":"<name>", ...args}\n`
 *   reply:    one JSON line `JSON.stringify(obj) + "\n"` (NEVER pretty-printed —
 *             coordCall reads up to the first \n and parses)
 *   success:  { ok: true, ... }
 *   failure:  { ok: false, error: "..." }
 *   unknown:  { ok: false, error: "unknown op" }
 * Bad JSON on a line is ignored (matches the coordinator).
 *
 * Ops: status, peers, wallet, submit_tx, roles. Every op is a single
 * request/reply (no waiter-hold pattern). Every handler is wrapped so a throw
 * or rejection becomes a JSON error — the daemon must never crash or hang on a
 * control request.
 */

const SUBMIT_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

/**
 * Create + bind the control socket for a running node.
 * @param {object} ctx
 * @param {import('./index.js').XMBLCore} ctx.core - the live core
 * @param {object} ctx.config - the node config (roles etc.)
 * @param {string} ctx.sockPath - data_dir/node.sock
 * @param {() => object} ctx.statusSnapshot - returns the current status object
 * @returns {Promise<net.Server>}
 */
export function createControlServer({ core, config, sockPath, statusSnapshot }) {
  // cmdStart already refused to run if another instance is alive, so any leftover
  // socket file is definitionally stale — unlink it before binding (simpler than
  // the coordinator's connect-probe, which guards against a live winner).
  try { fs.rmSync(sockPath, { force: true }); } catch { /* nothing to remove */ }

  async function handleOp(req) {
    switch (req.op) {
      case 'status':
        return { ok: true, ...statusSnapshot() };
      case 'peers': {
        const peers = core.xn.getConnectedPeers().map((p) => p.toString());
        return { ok: true, peers, count: peers.length };
      }
      case 'wallet':
        // The node's wallet is its xmbl identity (no separate wallet subsystem).
        return core.xid
          ? { ok: true, address: core.xid.address, public_key: core.xid.publicKey }
          : { ok: false, error: 'identity not initialized' };
      case 'roles':
        return { ok: true, roles: config.roles };
      case 'submit_tx': {
        if (!req.tx || typeof req.tx !== 'object') {
          return { ok: false, error: 'submit_tx requires a tx object' };
        }
        // Guarded + time-boxed so a control request can never hang the daemon.
        const txId = await withTimeout(core.submitTransaction(req.tx), SUBMIT_TIMEOUT_MS, 'submit_tx');
        return { ok: true, tx_id: txId };
      }
      default:
        return { ok: false, error: 'unknown op' };
    }
  }

  function handleLine(sock, line) {
    let req;
    try { req = JSON.parse(line); } catch { return; } // ignore malformed lines
    const reply = (o) => { try { sock.write(JSON.stringify(o) + '\n'); } catch { /* client gone */ } };
    // Any throw/rejection in an op becomes a JSON error — never an unhandled crash.
    Promise.resolve()
      .then(() => handleOp(req))
      .then(reply)
      .catch((e) => reply({ ok: false, error: String(e?.message || e) }));
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer((sock) => {
      sock.setEncoding('utf8');
      let buf = '';
      sock.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.trim()) handleLine(sock, line);
        }
      });
      sock.on('error', () => {}); // a client disconnecting mid-write must not crash the daemon
    });
    server.on('error', (e) => reject(e));
    server.listen(sockPath, () => {
      try { fs.chmodSync(sockPath, 0o600); } catch { /* best effort */ }
      resolve(server);
    });
  });
}
