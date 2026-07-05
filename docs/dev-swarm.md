# Local dev swarm (G2)

`npm run swarm` brings up a 5-node xmbl-node docker-compose swarm plus xsim and
a tx feeder; `npm run swarm:down` tears it down (including volumes).

```bash
npm run swarm        # docker compose -f docker-compose.swarm.yml up --build -d
npm run swarm:logs   # docker compose -f docker-compose.swarm.yml logs -f
npm run swarm:down   # docker compose -f docker-compose.swarm.yml down -v
```

## What this is

- **`Dockerfile.swarm`** — multi-stage build. Stage 1 (`emscripten/emsdk:3.1.51`)
  builds the MAYO-cube WASM artifact (A6); stage 2 (`node:22-bookworm-slim`)
  is the runtime image, with the artifact copied in. Node 22 is required —
  `core/index.js`'s dependency chain uses `Promise.withResolvers` (ES2024),
  which crashes on Node 20 (confirmed: pinning to `node:20-bookworm-slim`
  produced `xmbl-node: Promise.withResolvers is not a function` on boot).
- **`docker-compose.swarm.yml`** — 5 `xmbl-node` replicas (one image, env-var
  parameterized per service — see `scripts/swarm-entrypoint.mjs`), an `xsim`
  service, and a `swarm-feed-txs` one-shot service.
- **`scripts/swarm-entrypoint.mjs`** — per-container orchestration: generates
  `config.node.json` from env vars, starts the daemon (`node.js start`) as a
  child process with signal forwarding (so `docker stop` reaches it cleanly),
  and handles bootstrap-peer discovery: `xmbl-node-1` (`SWARM_ROLE=bootstrap`)
  polls its own control socket for its `peer_id` once up and writes
  `{peer_id, addr}` to a shared volume (`/swarm-meta/bootstrap-peer.json`);
  every other node polls for that file and injects the address into its own
  `bootstrap_peers` before starting. **This is real, dynamic discovery — not
  a baked-in peer ID** — necessary because libp2p generates a fresh keypair
  (and thus peer ID) on every daemon boot (`xn/src/node.js` passes no
  persisted private key to `createLibp2p`), so a static compose-file peer ID
  would break on every `docker compose down -v && up`.
- **`scripts/swarm-feed-txs.mjs`** — round-robins simulated transactions into
  every node's REAL control socket (`docs/node-daemon.md`'s `submit_tx` op,
  A5c) over read-only volume mounts (`/nodes/<name>/node.sock`). Verified
  end-to-end: all 20 test txs return `{ok:true, tx_id}` from real running
  daemons, and each node's own `/metrics` endpoint (A5d) shows its mempool's
  `raw` depth increment accordingly.

`identity_path` in the generated config is a placeholder string, not a real
keystore path — confirmed by reading `core/index.js` and `node.js`'s own
comment ("binding it to `identity_path` \[...\] is deliberate follow-up
wiring, not this task"): the daemon currently always calls `Identity.create()`
fresh at boot regardless of what `identity_path` says, and config validation
only requires it be a non-empty string, never checks the file exists. No
identity pre-provisioning step was needed for this to work.

## What's proven vs. what's blocked (read before assuming "5-node consensus" works)

**Proven, verified against real running containers, not simulated:**
- All 5 nodes boot cleanly, each gets a real libp2p peer ID and its own
  onboard identity, and stays healthy (`node.status.json` / control socket
  `status` op / metrics endpoint all report correctly).
- Bootstrap-peer address handoff between containers works (node 2-5 each
  correctly discover and record node-1's dynamic peer ID/address).
- Simulated transactions submitted via `submit_tx` are accepted, signed, and
  land in the submitting node's own mempool (metrics `mempool.raw` increments
  1:1 with submitted txs) — the daemon's transaction-intake path (control
  socket → `core.submitTransaction` → `xid.signTransaction` →
  `xpc.submitTransaction`) is real and works end-to-end per node.

**NOT proven — blocked on two pre-existing substrate gaps, found and
root-caused while building this (neither fixed here; this PR is infra-only,
per G2's mandate):**

1. **`bootstrap_peers` is never dialed.** `core/index.js`'s `toCoreConfig()`
   passes `{ addresses: cfg.listen_addrs, bootstrap: cfg.bootstrap_peers }`
   into `new XNNode(config.network)`, but `xn/src/node.js`'s `XNNode`
   constructor only reads `addresses`/`port` from its options — the
   `bootstrap` field is silently dropped. `PeerDiscovery.bootstrap()`
   (`xn/src/discovery.js`) exists and would dial correctly (raw `.dial(ma)`
   on a bare multiaddr, no `/p2p/...` suffix required), but nothing in the
   daemon startup path ever calls it. Confirmed live: every node's metrics
   endpoint reports `peer_count: 0` even with a correct bootstrap address in
   its config.
2. **`ConsensusGossip` never subscribes to its own topic.** In
   `core/index.js`, `this.gossip = new ConsensusGossip({ xn: this.xn })` runs
   in the `XMBLCore` **constructor**, before `core.start()` (and therefore
   `xn.start()`) has ever run. `ConsensusGossip`'s constructor
   (`xpc/src/gossip.js`) only calls `this.xn.subscribe(this.topic)` if
   `this.xn.started` is already `true` at that moment — which is never the
   case, since gossip is always constructed pre-boot. So even if gap (1) were
   fixed and peers connected, no node would ever be subscribed to receive
   `consensus:raw_tx` broadcasts. Confirmed live: every `submit_tx` call logs
   `Failed to broadcast transaction: PublishError.NoPeersSubscribedToTopic`
   (the sending node isn't even subscribed to its own topic).

Together these mean cross-node transaction propagation and multi-node
consensus **do not currently function**, independent of any docker/compose
wiring — this is application-code state, not an infra gap. Recommend a
follow-up task (referenced from here as candidate work, not filed/claimed) to:
(a) have the daemon call `discovery.bootstrap(cfg.bootstrap_peers)` after
`xn.start()`, and (b) either subscribe `ConsensusGossip` lazily on its own
`xn`'s `start` event, or move `gossip` construction to after `xn.start()` in
`core/index.js`. Both are small, targeted fixes once someone owns them — this
doc has the full repro so nobody needs to rediscover it.

## Known limitation of this test bed itself

- Only 2 CPUs / 2GiB were available in the local Docker VM (colima) used to
  build this — building all 6 images serially takes a few minutes. A
  from-scratch build also failed once here with a colima-VM disk-corruption
  error traced to the HOST running low on free disk space (not a compose/
  Dockerfile bug) — if `docker compose build` fails with an `input/output
  error` on your machine, check host free space and/or restart your Docker VM
  before assuming the Dockerfile is broken.
