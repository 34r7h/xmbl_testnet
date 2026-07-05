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

## Scope notes (A5b)

- **Role flags** are passed through and recorded in the status file; they do not
  yet gate which subsystems run (that is group-E work).
- The daemon's on-disk identity is `XMBLCore`'s own, created at boot. Binding it
  to the config's `identity_path` (the C1 keystore) is deliberate follow-up
  wiring, not part of this lifecycle task.
- Running the daemon requires the workspace packages to be linked
  (`npm install` at the repo root) — `core/index.js` imports `xid`/`xn`/`xclt`/…
  as workspaces.
