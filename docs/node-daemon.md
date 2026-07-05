# xmbl-node daemon (`node.js`)

`node.js` at the repo root is the **xmbl-node daemon** — the process a handoff
coordinator supervises. It wraps `XMBLCore` (`core/index.js`) and is driven by the
node config ([`docs/node-config.md`](./node-config.md), schema in
`core/node-config.js`).

## Commands

```
node node.js start  --config <path>   # boot XMBLCore, write pidfile + status, run in foreground
node node.js stop   --config <path>   # SIGTERM the running node, wait for a clean exit 0
node node.js status --config <path>   # report liveness + peer id from disk (JSON)
```

`--config` defaults to `./config.node.json`. Copy
[`config.node.example.json`](../config.node.example.json) to create one.

- **`start`** runs the node in the **foreground** — the launched process *is* the
  node the coordinator supervises. It:
  1. loads + validates the config, ensures `data_dir` exists;
  2. refuses to start if another instance is alive (and clears a stale pidfile);
  3. boots `XMBLCore` (network + identity), then opens the ledger LevelDB and
     writes a `node:boot` marker so the database is genuinely initialized;
  4. writes `data_dir/node.pid` (plain PID) and `data_dir/node.status.json`
     (`{pid, peer_id, address, roles, listen_addrs, started_at}`);
  5. installs `SIGTERM`/`SIGINT` handlers that call `XMBLCore.stop()` — flushing
     **every** LevelDB (ledger, state-machine, storage) cleanly — remove the
     pidfile/status, and exit `0`.
- **`status`** and **`stop`** are short-lived, pure-filesystem operations. They
  read the pidfile and check liveness with `process.kill(pid, 0)`; a dead pid is
  reported as `running: false, reason: "stale pidfile"`. They deliberately do
  **not** import `XMBLCore` (which would boot the whole stack and print banners),
  so `status` emits clean JSON.

## Lifecycle guarantee

The cycle **start → status (peer id) → stop (exit 0) → restart → stop** reopens
LevelDB without corruption. This is demonstrated end-to-end, in real processes,
by [`scripts/node-lifecycle-check.mjs`](../scripts/node-lifecycle-check.mjs)
(`npm run node:check`) — hermetic (temp `data_dir`, ephemeral port) with a hard
timeout.

## Local control socket (A5c)

While running, the daemon serves a newline-delimited JSON op server on a unix
socket at `data_dir/node.sock` — this is how the handoff coordinator talks to a
running node. The socket opens on `start` (after the core is live), and is closed
+ unlinked on clean shutdown alongside the pidfile/status.

**Protocol** is byte-identical to the handoff coordinator socket, so the handoff
side reuses its existing client (`handoff-lib` `coordCall`) by pointing
`HANDOFF_COORD_SOCK` at `node.sock` — no new client:

```
request:  {"op":"<name>", ...args}\n      (one JSON line)
reply:    {"ok":true, ...}\n   or   {"ok":false,"error":"..."}\n
```

| Op          | Args        | Reply |
| ----------- | ----------- | ----- |
| `status`    | —           | `{ok, pid, peer_id, address, roles, listen_addrs, started_at}` |
| `peers`     | —           | `{ok, peers:[peerId…], count}` |
| `wallet`    | —           | `{ok, address, public_key}` (the node's xmbl identity — there is no separate wallet subsystem) |
| `roles`     | —           | `{ok, roles:{validate,storage,compute,relay,lead}}` |
| `submit_tx` | `tx:{…}`    | `{ok, tx_id}` (guarded + 5s time-boxed so it can never hang) |
| unknown     | —           | `{ok:false, error:"unknown op"}` |

Every op is a single request/reply; any error becomes a JSON `{ok:false,error}`,
never a crash or hang. Exercised end-to-end by
[`scripts/node-socket-check.mjs`](../scripts/node-socket-check.mjs)
(`npm run node:socket-check`).

## Health + metrics endpoint (A5d)

While running, the daemon serves a **loopback-only** HTTP metrics endpoint. It
starts with the node and stops on shutdown. The URL (OS-assigned port) is
published in `node.status.json` and the control socket's `status` op as
`metrics_url`, so the coordinator discovers it without a fixed port.

- **Bind:** `127.0.0.1` **only** (never `0.0.0.0`). Loopback → the OS refuses
  off-host connections, so the counters are served unauthenticated by design.
- Every request returns the same plain-JSON snapshot; all values are numeric:

```json
{
  "uptime_seconds": 12,
  "peer_count": 0,
  "mempool": { "raw": 0, "validation_tasks": 0, "locked_utxo": 0, "processing": 0, "tx": 0 },
  "validations_completed": 0,
  "shards_stored": 0,
  "compute_jobs_run": 0
}
```

- `uptime_seconds`, `peer_count`, and the five `mempool` stage depths are read
  **live** from XMBLCore (the xpc mempool's raw / validation-task / locked-utxo /
  processing / tx pipelines).
- `validations_completed` / `shards_stored` / `compute_jobs_run` are cumulative
  counters owned by the group-E role workers (E1/E2/E3). Until those land they
  have not run, so they are honestly **0** — not faked; a code comment marks
  where each role will increment its counter.

Exercised by [`scripts/node-metrics-check.mjs`](../scripts/node-metrics-check.mjs)
(`npm run node:metrics-check`): starts the node, curls the endpoint, asserts
every field is present + numeric, and that it is not reachable off loopback.

## Scope notes (A5b)

- **Role flags** are passed through and recorded in the status file; they do not
  yet gate which subsystems run (that is group-E work).
- The daemon's on-disk identity is `XMBLCore`'s own, created at boot. Binding it
  to the config's `identity_path` (the C1 keystore) is deliberate follow-up
  wiring, not part of this lifecycle task.
- Running the daemon requires the workspace packages to be linked
  (`npm install` at the repo root) — `core/index.js` imports `xid`/`xn`/`xclt`/…
  as workspaces.
