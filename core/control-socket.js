import net from 'net';
import fs from 'fs';
import { collectEarnings } from './earnings.js';

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
 * Ops: status, peers, wallet, submit_tx, compute_job, roles, earnings, publish, subscribe.
 * Every op EXCEPT `subscribe` is a single request/reply (no waiter-hold pattern). `subscribe`
 * holds the connection open and STREAMS one JSON line per received pubsub message (the handoff
 * message-relay transport — see handoff src/xmbl-relay.ts). Every handler is wrapped so a throw
 * or rejection becomes a JSON error — the daemon must never crash or hang on a control request.
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
      case 'earnings':
        return { ok: true, ...collectEarnings(core) };
      case 'submit_tx': {
        if (!req.tx || typeof req.tx !== 'object') {
          return { ok: false, error: 'submit_tx requires a tx object' };
        }
        // Guarded + time-boxed so a control request can never hang the daemon.
        const txId = await withTimeout(core.submitTransaction(req.tx), SUBMIT_TIMEOUT_MS, 'submit_tx');
        return { ok: true, tx_id: txId };
      }
      case 'compute_job': {
        if (!core.computeNode) {
          return { ok: false, error: 'compute role not enabled (roles.compute)' };
        }
        if (!req.job || typeof req.job !== 'object') {
          return { ok: false, error: 'compute_job requires a job object' };
        }
        // Guarded + time-boxed so a control request can never hang the daemon
        // even if runJob's own cap enforcement somehow didn't (defense in depth).
        const result = await withTimeout(core.computeNode.runJob(req.job), SUBMIT_TIMEOUT_MS, 'compute_job');
        return result;
      }
      case 'addrs': {
        // This node's own peer id + dialable listen multiaddrs (each embeds the peer id). A peer
        // broker/coordinator needs these to add this node to its bootstrap_peers or `connect` to it.
        if (!core.xn) return { ok: false, error: 'network layer not initialized' };
        const addrs = (core.xn.getAddresses() || []).map((a) => a.toString());
        const peer_id = core.xn.getPeerId ? String(core.xn.getPeerId() || '') : '';
        return { ok: true, peer_id, addrs };
      }
      case 'connect': {
        // Dial another node by multiaddr (must include /p2p/<peerId>). Lets a coordinator peer two
        // nodes at runtime without a restart/bootstrap-config change — the mesh the relay rides on.
        if (!core.xn) return { ok: false, error: 'network layer not initialized' };
        if (!req.address || typeof req.address !== 'string') return { ok: false, error: 'connect requires an address (multiaddr)' };
        await withTimeout(core.xn.connect(req.address), SUBMIT_TIMEOUT_MS, 'connect');
        return { ok: true, address: req.address };
      }
      case 'publish': {
        // Broadcast a message onto the libp2p (floodsub) mesh under `topic`. This is the
        // SEND side of the handoff message-relay transport: a broker publishes each stored
        // envelope so peer brokers subscribed to the recipient's topic receive it.
        if (!req.topic || typeof req.topic !== 'string') return { ok: false, error: 'publish requires a topic' };
        if (!core.xn) return { ok: false, error: 'network layer not initialized' };
        await withTimeout(core.xn.publish(req.topic, req.data ?? {}), SUBMIT_TIMEOUT_MS, 'publish');
        return { ok: true, topic: req.topic };
      }
      default:
        return { ok: false, error: 'unknown op' };
    }
  }

  // `subscribe` is special: it holds THIS connection open and streams a JSON line per received
  // pubsub message on `topic` (the RECEIVE side of the handoff relay). The listener is removed and
  // the topic unsubscribed when the client disconnects, so a dropped relay never leaks handlers.
  async function handleSubscribe(sock, req) {
    const reply = (o) => { try { sock.write(JSON.stringify(o) + '\n'); } catch { /* client gone */ } };
    const topic = req.topic;
    if (!topic || typeof topic !== 'string') { reply({ ok: false, error: 'subscribe requires a topic' }); return; }
    if (!core.xn) { reply({ ok: false, error: 'network layer not initialized' }); return; }
    try { await core.xn.subscribe(topic); } catch (e) { reply({ ok: false, error: String(e?.message || e) }); return; }
    const listener = (data) => reply({ ok: true, event: 'message', topic, data });
    core.xn.on(`message:${topic}`, listener);
    reply({ ok: true, event: 'subscribed', topic });
    const cleanup = () => { try { core.xn.removeListener(`message:${topic}`, listener); } catch { /* */ } };
    sock.on('close', cleanup);
    sock.on('error', cleanup);
  }

  function handleLine(sock, line) {
    let req;
    try { req = JSON.parse(line); } catch { return; } // ignore malformed lines
    const reply = (o) => { try { sock.write(JSON.stringify(o) + '\n'); } catch { /* client gone */ } };
    // `subscribe` holds the socket open and streams — handled separately from the request/reply ops.
    if (req.op === 'subscribe') { void handleSubscribe(sock, req).catch((e) => reply({ ok: false, error: String(e?.message || e) })); return; }
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
