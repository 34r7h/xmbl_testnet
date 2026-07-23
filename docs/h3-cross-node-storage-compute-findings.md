# H3: storage + compute cross-node e2e — spike findings

Task H3 (handoff project 963632e8, goal 1fe89e4a) asked to "prove storage + compute roles across
nodes on the dev swarm: a shard stored on one node is probe-verifiable from another; a compute job
runs and reports." This doc is the honest result of that spike, plus what a real production
`requestShard`/`dispatchComputeJob` API would need to close the remaining gap.

## What's proven (xsc/__tests__/cross-node-e2e.test.js)

Two real `XNNode` (libp2p) instances, peered directly (`connect`, not mDNS — deterministic, no
discovery-timing race), each hosting a real `StorageNode`/`ComputeNode` wired to its own `xn`:

- **Storage probe, cross-node:** a shard stored on node A (`storeShard`) is probe-verified from
  node B — the real `_handleProbeRequest` → `respondToProbe` production code path runs on A, and its
  answer (`held:true` + `computeProbeProof`) genuinely transits the network back to B over floodsub.
  A probe for a shard A does NOT have correctly reports `held:false` (no false positive).
- **Compute job, cross-node:** a job dispatched from node B is executed on node A (`_handleJobRequest`
  → `runJob`, the real WASM execution path) and the result genuinely transits back to B.

Both use the ACTUAL production responder code, unmodified — nothing about the responder side was
stubbed, mocked, or faked to make this pass.

## The gap this exposed

Neither `StorageNode` nor `ComputeNode` has a **requester-side** method — there is no
`requestShard`/`probeShard`/`dispatchComputeJob` a caller can invoke to fetch a shard or run a job
on a *peer*. Concretely:

- `StorageNode._handleShardResponse(data)` is a literal empty stub: `// Can be used for shard
  retrieval` — no code anywhere consumes an incoming `storage:shard_response` message.
- `StorageNode` never subscribes to `storage:probe_response` at all (only `probeRequestTopic`) — a
  node that PROBES a peer has nowhere in the class to receive the answer.
- `ComputeNode` never subscribes to `compute:job_response` at all — same gap, one-sided.
- The control socket (`core/control-socket.js`) exposes `compute_job` (LOCAL execution only — it
  calls `core.computeNode.runJob()` on whichever node you're connected to) and nothing at all for
  storage (`status/peers/wallet/roles/earnings/submit_tx/compute_job/addrs/connect/publish/
  subscribe/chain` is the full op list — no `store`/`get`/`probe`).

The test above proves the wire protocol and the responder half are real by having the TEST harness
play the missing requester half directly (raw `xn.publish`/`xn.subscribe` on the production topic
names). That is a legitimate way to prove the network path works, but it is not something a real
caller (a control-socket client, another role) can do today without the missing methods.

## Recommended follow-up scope (not done here — out of scope for a "prove it" spike)

1. **`StorageNode.requestShard(peerHint, shardId, timeoutMs)`** — publish to `requestTopic`, resolve
   on the next matching `storage:shard_response` (needs a real `_handleShardResponse` that resolves
   a pending promise keyed by `shardId`, not the current no-op).
2. **`StorageNode.probeShard(peerHint, shardId, nonce, timeoutMs)`** — same shape for
   `probeRequestTopic`/`probeResponseTopic` (currently no subscription to the response topic exists
   at all).
3. **`ComputeNode.dispatchJob(peerHint, job, timeoutMs)`** — subscribe to `responseTopic`, publish to
   `requestTopic`, resolve on the matching `jobId`.
4. **Control-socket ops** exposing the above (`store_probe`, `store_request`, `compute_dispatch` or
   similar) so `handoff xmbl <subcommand>` / the coordinator's `xmbl` passthrough op can drive this
   from outside the node process, matching the pattern `submit_tx`/`compute_job` already establish.
5. All of the above need a `timeoutMs` + "no response" path (a peer that never answers, or isn't
   actually holding/running anything) — none of that failure handling exists today either, since
   there's currently no request/response round-trip to time out.

This is real, scoped, buildable follow-on work — sizing it is a separate call from this task.
