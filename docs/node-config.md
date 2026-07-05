# xmbl-node configuration (`config.json`)

The `xmbl-node` daemon is the process a handoff coordinator supervises. This
document defines its configuration surface. It is intentionally **boring and
stable**: the coordinator and every group-E role worker (validate / storage /
compute / relay / lead) read these fields, so the names are fixed.

- **Single source of truth:** [`core/node-config.js`](../core/node-config.js) —
  `NODE_CONFIG_SCHEMA`, `defaultConfig()`, `validateConfig()`, `loadConfig()`.
- **Canonical example:** [`config.node.example.json`](../config.node.example.json).
- The example and this document are checked against the schema by
  `__tests__/integration/node-config.test.js`, so all three stay in lock-step.

> **Not to be confused with the root [`config.example.json`](../config.example.json),**
> which is the existing *application-level* config (`network`, `ledger`,
> `consensus`, `stateMachine`, `storage`, `logging`, `rateLimit`). That surface
> overlaps conceptually — the app's `network.bootstrap` ≈ the node's
> `bootstrap_peers`; the app's `storage`/`consensus` ≈ the node's
> `roles.storage`/`roles.validate` — but it is a distinct file for a distinct
> component. The node-daemon config lives at `config.node.example.json`.

## Fields

All field names are `snake_case` and fixed. Types and defaults come from the
schema; a value omitted from `config.json` takes the default below.

### `identity_path`
- **Type:** `string` · **Required** (no meaningful default; `defaultConfig()`
  leaves it `""`, which fails validation until set).
- Path to this node's xmbl identity keystore file, as produced by the xid
  agent-keystore (`~/.handoff/agents/<id>/xmbl.json`). The node loads its signing
  identity from here.

### `data_dir`
- **Type:** `string` · **Default:** `"./xmbl-data"`.
- Base directory for all node state (ledger, storage, peerstore subdirectories
  live under it). Created by the daemon if absent.

### `listen_addrs`
- **Type:** `string[]` · **Default:** `["/ip4/0.0.0.0/tcp/0"]`.
- libp2p multiaddrs this node listens on. The default binds all interfaces on an
  OS-assigned TCP port. Example uses fixed ports and a WebSocket transport.

### `bootstrap_peers`
- **Type:** `string[]` · **Default:** `[]`.
- libp2p multiaddrs of bootstrap peers to dial on startup. Empty means an
  isolated / first node.

### `roles`
**Type:** `object`. Each sub-field is a `boolean` and **defaults to `false`** — a
node opts into every role explicitly.

| Role       | Default | Meaning                                    |
| ---------- | ------- | ------------------------------------------ |
| `validate` | `false` | participate in xpc transaction validation  |
| `storage`  | `false` | hold ledger / blob storage                 |
| `compute`  | `false` | run compute tasks                          |
| `relay`    | `false` | relay traffic for other peers              |
| `lead`     | `false` | act as a lead / coordinator node           |

### `resource_caps`
**Type:** `object`. Hard per-role ceilings. Each is a non-negative `number`.
Defined here so the surface is stable; enforcement lands in the daemon lifecycle
(A5b+).

| Cap              | Default | Meaning                          |
| ---------------- | ------- | -------------------------------- |
| `disk_mb`        | `1024`  | max disk (MB) for the storage role |
| `compute_cpu_ms` | `10000` | max CPU time (ms) per compute task |
| `compute_mem_mb` | `512`   | max memory (MB) per compute task   |

## Validation rules

`validateConfig(config)` returns `{ valid, errors }`. A config is valid when:

1. It is an object with **no unknown top-level keys** (typo guard; scoped to the
   top level, not recursive beyond the two known objects).
2. `identity_path` is present and a non-empty string.
3. Every present field matches its declared type; `roles.*` are booleans;
   `resource_caps.*` are numbers `>= 0`.
4. `roles` and `resource_caps` contain no unknown sub-keys.

Sub-fields of `roles` / `resource_caps` are optional in a file — `loadConfig()`
fills any missing ones from the defaults via `normalizeConfig()` before
validating.
