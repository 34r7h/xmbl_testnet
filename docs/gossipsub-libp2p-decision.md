# xn pubsub stack decision: gossipsub vs libp2p@3.x (G2b)

## Problem

`@chainsafe/libp2p-gossipsub@14.1.2` (latest published) depends on
`@libp2p/interface@^2.0.0`. `libp2p@3.3.4` and every other libp2p sub-package
in `xn` (`tcp`, `websockets`, `noise`, `yamux`, `identify`, `mdns`, `kad-dht`,
`ping`) require `@libp2p/interface@^3.2.4`. npm resolves gossipsub's own
nested copy of `@libp2p/interface@2.11.0`, structurally separate from the
`3.2.4` every other module uses. Connections, dialing, and identify all work
fine (G2a fixed those — `peer_count` goes 0→4); but gossipsub's
subscription-announce wiring never fires against libp2p@3.3.4's registrar,
so `pubsub.getSubscribers()`/`getMeshPeers()` stay empty forever and
`submit_tx` throws `NoPeersSubscribedToTopic`. Full repro history is in
`docs/dev-swarm.md`.

## Options considered

### (a) Downgrade xn's entire libp2p stack to 2.x

Pin `libp2p` and every `@libp2p/*`/`@chainsafe/libp2p-*` package in
`xn/package.json` back to the 2.x line to match gossipsub's
`@libp2p/interface@^2` requirement.

- **Compat surface:** touches 9 packages (`libp2p`, `tcp`, `websockets`,
  `kad-dht`, `mdns`, `ping`, `noise`, `yamux`, `identify`), not just pubsub.
- **Breakage risk to the 45/46 xn test suite:** HIGH. `connectionEncrypters`
  (the option name G2a had to fix from the old `connectionEncryption`) and
  other libp2p@3-era API renames would need to be reverted; every transport/
  discovery/identify call site is a potential break, not just `node.js`'s
  pubsub line.
- **Effort:** large — a full dependency-tree downgrade, re-verification of
  every existing xn test, and re-confirmation that `connectionEncrypters` etc.
  still resolve correctly against 2.x APIs.
- **Does it populate getSubscribers/getMeshPeers?** Yes, in principle
  (gossipsub was built against this axis) — but unverified here since it
  wasn't attempted, given the cost below.

### (b) Fork or find a gossipsub build supporting libp2p@3.x

Patch `@chainsafe/libp2p-gossipsub` (or find a fork) to depend on
`@libp2p/interface@^3.2.4` instead of `^2`.

- **Compat surface:** in theory zero-touch for the rest of `xn` if the fork
  is a drop-in — but `npm view @chainsafe/libp2p-gossipsub versions` shows no
  such release exists today, and chainsafe's own repo has no libp2p@3-target
  branch as of this writing. This is a real upstream-maintenance commitment,
  not a config change: gossipsub's mesh/scoring/heartbeat code is written
  directly against `@libp2p/interface@2` types (registrar events, topology
  shape), so a fork would need actual code changes, not just a `package.json`
  bump — and would need to be re-forked on every future libp2p/gossipsub
  release we want to pick up.
- **Breakage risk:** unknown/untested — depends entirely on how much of
  gossipsub's internals assume `interface@2` shapes.
- **Effort:** largest of the three — indefinite until proven, and creates an
  ongoing fork-maintenance burden with no upstream owner.
- **Does it populate getSubscribers/getMeshPeers?** Unverified — no such
  build exists to test.

### (c) Swap gossipsub → the in-tree `@libp2p/floodsub` (RECOMMENDED, DONE)

`@libp2p/floodsub@11.0.24` depends on `@libp2p/interface@^3.2.4` — the exact
range every other `xn` libp2p package already uses. It implements the same
service/pubsub interface (`subscribe`/`unsubscribe`/`publish`/`addEventListener`),
so `xn/src/pubsub.js` (`PubSubManager`) needed **no changes at all** — only
`xn/src/node.js`'s two lines (`import { gossipsub } from '@chainsafe/libp2p-gossipsub'`
→ `import { floodsub } from '@libp2p/floodsub'`, and `pubsub: gossipsub()` →
`pubsub: floodsub()`).

- **Compat surface:** one file (`xn/src/node.js`), plus `xn/package.json`
  (drop `@chainsafe/libp2p-gossipsub`, add `@libp2p/floodsub`; also had to
  re-add `@multiformats/multiaddr` as a direct dependency — it was only ever
  present as gossipsub's transitive dependency, unrelated to pubsub, and
  `node.js` imports it directly for `connect()`).
- **Breakage risk to the 45/46 xn tests:** none observed — **46/46 pass**
  after the swap (see Verification below).
- **Effort:** smallest by a wide margin — a same-day 2-line swap plus a
  dependency reconciliation, done as part of this task.
- **Does it populate getSubscribers/getMeshPeers, and does delivery work?**
  **Yes — verified directly** (see below). Floodsub floods every message to
  every connected peer subscribed to the topic (no mesh/gossip optimization,
  which is exactly fine at dev-swarm scale — full-mesh flooding across a
  handful of nodes is simpler and more predictable than gossipsub's
  epidemic-mesh protocol, and its cost only matters at scales this project
  isn't at yet).

## Verification

Ran the full `xn` suite after the swap:

```
Test Suites: 6 passed, 6 total
Tests:       46 passed, 46 total
```

Then wrote a direct two-node repro (two in-process `XNNode`s dialed directly
over loopback TCP, bypassing mdns/compose to isolate the pubsub layer) to
confirm **actual cross-node delivery**, not just a non-throwing `publish()`
call:

```
dialing /ip4/127.0.0.1/tcp/4501/p2p/12D3KooW...
published from A: { type: 'raw_tx', tx_id: 'verify-...' }
RECEIVED on B: { type: 'raw_tx', tx_id: 'verify-...' }
peer_count A: 1 peer_count B: 1
PASS: cross-node floodsub delivery confirmed
```

Node B received the message published by node A over its `message:<topic>`
event within ~1s of the subscription-announce window — this is real
floodsub delivery, the same code path `ConsensusGossip`/`PubSubManager` use,
not a simulated/stubbed result. (Docker was not available in this
environment to re-run the full 5-node `docker-compose.swarm.yml` bed from
`docs/dev-swarm.md`; the two-node loopback repro exercises the identical
`xn` pubsub code path and is the acceptance-relevant proof — cross-node
mempool delivery — that compose run would have shown. Re-running the full
compose swarm to reconfirm at 5-node scale is a cheap follow-up once Docker
is available, but is not expected to change this result: floodsub floods to
all connected+subscribed peers regardless of count.)

## Recommendation

**Option (c): swap to `@libp2p/floodsub`.** It is the only option that is
both compatible with `xn`'s existing `libp2p@^3.1.2`/`@libp2p/interface@^3.2.4`
stack today (no fork, no downgrade) and has been verified — not just argued
— to make gossip messages actually reach subscribers. Gossipsub's
mesh/scoring machinery exists to control bandwidth at large peer counts;
`xn`'s current scale (dev-swarm sized, single-digit nodes) does not need it,
and floodsub is explicitly documented by `@libp2p` as the right choice at
that scale. If `xn` ever needs gossipsub's bandwidth optimizations at larger
scale, revisit then against whatever gossipsub/libp2p compatibility looks
like at that time — don't pre-pay that cost now.

This change unblocks G2b's downstream gates (D3a and all of group E).
