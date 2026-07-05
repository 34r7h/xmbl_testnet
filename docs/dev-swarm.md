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

**UPDATE (G2a):** the two gaps below are FIXED (see commit on
`sonnet/g2a-consensus-blockers-fix`) — `bootstrap_peers` is now dialed on
node start, and `ConsensusGossip` is constructed after `xn.start()`. A third
prerequisite bug was found and fixed along the way: `xn/src/node.js` passed
`connectionEncryption` to `createLibp2p`, but libp2p@3.x renamed this option
to `connectionEncrypters` — the old key was silently ignored, so no
connection encrypter was ever configured and every dial failed with
`EncryptionFailedError`. With all three fixes, **`peer_count` goes 0 → 4 on
the bootstrap node (1 on every peer) — real libp2p connections now form.**

That exposed a **fourth, deeper blocker that is NOT fixed** (see below):
gossip messages still never reach a subscriber, so `submit_tx` still throws
`NoPeersSubscribedToTopic`. Full multi-node consensus remains unproven.

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
- **(G2a)** Nodes actually connect to each other: `peer_count` is 4 on the
  bootstrap node and 1 on every peer, confirmed live via each node's
  `/metrics` endpoint after the bootstrap-dial + connectionEncrypters fixes.
- **(G2a)** Every node's `ConsensusGossip` does successfully call
  `xn.subscribe('consensus:raw_tx')` on its own local pubsub instance
  (confirmed via instrumented debug build — `pubsub.getTopics()` includes
  the topic on every node).

**NOT proven — blocked on a real dependency-version incompatibility found
while chasing this (not a "small targeted fix"; reported rather than
patched around):**

**`@chainsafe/libp2p-gossipsub` has no release compatible with `libp2p@3.x`.**
Even with peer connections established (`peer_count>0` on every node) and
every node locally subscribed to its topic, `pubsub.getSubscribers(topic)`
and `pubsub.getMeshPeers(topic)` stay empty on EVERY node, indefinitely (not
a startup race — reconfirmed on a tx submitted 40+s after boot). Root cause,
confirmed via `npm ls @libp2p/interface`: `@chainsafe/libp2p-gossipsub@14.1.2`
(latest published version) depends on `@libp2p/interface@^2.0.0`, while
`libp2p@3.3.4` (and every other libp2p sub-package here — tcp, websockets,
noise, yamux, identify, mdns, kad-dht, ping — all correctly on `^3.2.4`)
requires `@libp2p/interface@^3.2.4`. npm resolves gossipsub's own nested copy
at `@libp2p/interface@2.11.0`, structurally separate from the `3.2.4` every
other module uses. Connections/identify/dial all work fine (those are all on
`interface@3.2.4` consistently); gossipsub's connect-time
subscription-announce wiring silently no-ops because its registrar/topology
types don't match what libp2p@3.3.4's registrar actually emits.
**There is no gossipsub release on npm today that supports libp2p@3.x** — the
only way to make gossipsub work here is a full dependency-tree downgrade of
the `xn` module's entire libp2p stack to the 2.x line (rippling through
`tcp`, `websockets`, `noise`, `yamux`, `identify`, `mdns`, `kad-dht`, `ping`,
each pinned to a `3.x`-era major in `xn/package.json`), or swapping pubsub
implementations — either is real scope, not a follow-up-in-passing. Do NOT
paper over this with `allowPublishToZeroTopicPeers: true` — that would make
`submit_tx` stop throwing while gossip messages still reach zero actual
subscribers, i.e. fake consensus.

Recommend a follow-up task to own the libp2p-stack downgrade-or-replace
decision; this doc has the full repro (`npm ls @libp2p/interface`, the
`getSubscribers`/`getMeshPeers` empty-forever symptom) so nobody needs to
rediscover it.

**Also found, not fixed here (out of scope):** `xda/src/core/xmbl-core.js`
(the desktop app's own copy of this core-assembly logic) has the same
gossip-construction-before-`xn.start()` bug as `core/index.js` did. Not
touched — G2a's scope was the daemon's `core/index.js`.

## Known limitation of this test bed itself

- Only 2 CPUs / 2GiB were available in the local Docker VM (colima) used to
  build this — building all 6 images serially takes a few minutes. A
  from-scratch build also failed once here with a colima-VM disk-corruption
  error traced to the HOST running low on free disk space (not a compose/
  Dockerfile bug) — if `docker compose build` fails with an `input/output
  error` on your machine, check host free space and/or restart your Docker VM
  before assuming the Dockerfile is broken.
