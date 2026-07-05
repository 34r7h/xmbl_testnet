# Handoff Event → XMBL Anchoring Spec

This document enumerates exactly which handoff platform events anchor to the
XMBL chain, and defines the on-chain transaction payload for each. It is
grounded in the actual handoff event/store implementation (`~/Developer/projects/handoff`,
`src/payments.ts`, `src/files.ts`, `src/social.ts`) as of the commit this doc
was written against — not an idealized or invented event model.

## Hard rule: hashes only, never content

**The chain never carries the record itself — only a SHA-256 hash of it.**
Every tx payload defined below carries `sha256_hex`, the hash of a canonical
JSON serialization of the underlying handoff record. The plaintext record
(task title, post text, file name, payment amount, …) stays off-chain in
handoff's own store; a verifier who *already has* the off-chain record can
recompute the same hash and confirm it matches what's anchored, but the
chain alone reveals nothing about the record's content. This keeps
on-chain data volume-independent of record size and avoids putting
potentially sensitive task/social content into a public, immutable ledger.

## Canonical JSON serialization (so the hash is reproducible)

The "canonical JSON record" hashed for each event is produced with
**RFC 8785 JSON Canonicalization Scheme (JCS)**:

1. Serialize as a single JSON object (no top-level array).
2. Object keys are sorted **lexicographically (byte-wise) by UTF-8 encoding**
   at every nesting level.
3. No insignificant whitespace (no spaces, no newlines) between tokens.
4. Strings are UTF-8, NFC-normalized, using JSON's standard escaping
   (no unnecessary `\uXXXX` escapes for printable ASCII).
5. Numbers use the shortest round-trippable decimal form (JCS/ECMA-262
   `Number::toString` rules) — in practice, every numeric field in the
   events below (`bytes`, `amount`-as-decimal-string is a **string**, not a
   number, specifically to sidestep float round-tripping) is either an
   integer or already carried as a string, so this rarely matters here.
6. A field that is `undefined`/absent in the source record is **omitted**
   entirely from the canonical object — never emitted as `null`. Two
   handoff records that differ only in an absent-vs-present optional field
   must hash differently, so omission (not nulling) is required to
   preserve that distinction.
7. Hash the resulting byte string with SHA-256; encode the digest as
   lowercase hex for `sha256_hex`.

Any JCS-conformant library (e.g. `canonicalize` on npm) implements this
correctly; do not hand-roll key sorting without also handling nested
objects/arrays recursively.

## Universal tx payload shape

Every anchored event produces exactly one on-chain payload of this shape:

```json
{
  "kind": "<event kind string, e.g. 'task.created'>",
  "sha256_hex": "<64 hex chars — SHA-256 of the canonical JSON record>",
  "agent_xmbl_address": "<XMBL address of the agent this event is attributed to>",
  "timestamp": "<ISO 8601 UTC timestamp, copied verbatim from the record's own timestamp field>"
}
```

`agent_xmbl_address` is the XMBL-chain address derived from the relevant
agent's `xid` `Identity` (see `xid/src/identity.js`, `xid/index.js`'s
`Identity` export) — **not** the handoff `agent_id` string. Handoff
agent IDs and XMBL addresses are different namespaces; the mapping from
one to the other is out of scope for this doc (assumed to already exist
via each agent's registered `Identity`). Which agent's address populates
this field is defined per-event below, since the "responsible party" differs
(the requester who created a task vs. the reviewer who verified it vs. the
payee who got paid).

`timestamp` is **not** re-derived at anchoring time — it is the timestamp
already stamped on the handoff record (so the anchor reflects when the
event happened in handoff, not when it happened to get anchored/batched).

---

## Event 1 — `task.created`

**Source:** `src/payments.ts:713` `PaymentStore.addTask()`, invoked from
`POST /requests/:id/tasks` (`src/routes/payments.ts:508-556`) and from
`create_task`-equivalent MCP/coordination call sites. Underlying record:
the `JobTask` interface, `src/payments.ts:125-174`.

**Canonical record** (fields extracted from the `JobTask` at creation time):

```json
{
  "event": "task.created",
  "task_id": "<JobTask.id>",
  "request_id": "<JobTask.request_id>",
  "goal_id": "<JobTask.goal_id, omit if absent>",
  "parent_id": "<JobTask.parent_id, omit if absent>",
  "title": "<JobTask.title>",
  "assignee": "<JobTask.assignee, omit if absent>",
  "created_by": "<JobTask.created_by, omit if absent>",
  "created_at": "<JobTask.created_at>"
}
```

Fields deliberately **excluded** from the canonical record: `status`
(always `'todo'` at creation, non-discriminating), `status_history`,
`clock_ms`/`clock_running_since` (mutable timing fields not settled at
creation), `payment` (not yet finalized), `description` (long free text —
anchoring the title is sufficient to bind the record; a verifier with the
full task object recomputes the hash to confirm the title/ids match).

- `agent_xmbl_address` = the XMBL address of `created_by` (the agent who
  opened the task) — omit/skip anchoring if `created_by` is absent (system-
  or external-key-created tasks with no attributable creator).
- `timestamp` = `JobTask.created_at`.

## Event 2 — `task.verified`

**Source:** `src/payments.ts:1044` `PaymentStore.verifyTask()`, invoked
from `POST /tasks/:taskId/verify` and the `verify_task` MCP tool
(`src/mcp-server.ts:1204`). This event mutates the existing `JobTask`
record rather than creating a new one; hash the record **as of the moment
verification lands** (i.e. after the mutation, using the resulting
`status`/`verified_by`/`updated_at`).

**Canonical record:**

```json
{
  "event": "task.verified",
  "task_id": "<JobTask.id>",
  "request_id": "<JobTask.request_id>",
  "status": "<'verified' | 'rejected'>",
  "verified_by": "<JobTask.verified_by>",
  "updated_at": "<JobTask.updated_at>"
}
```

Only the final two possible `status` values reachable via this event
(`verified`, `rejected`) are valid here — a task moving through
`todo`/`in_progress`/`pending_verification` is not a `task.verified` event.

- `agent_xmbl_address` = the XMBL address of `verified_by` (the reviewer).
- `timestamp` = `JobTask.updated_at` (the value it holds at the moment
  `status` flips to `verified`/`rejected` — read it in the same
  transaction/mutation that performs the status change, not a later read).

## Event 3 — `settlement.executed`

**Source:** `src/payments.ts:1099` `settleArc()` (on-chain Arc-rail
settlement) and `src/payments.ts:1301` `freeSettle()` (zero-amount
auto-settle path inside `verifyTask`), both producing a `PaymentReceipt`
(`src/payments.ts:237-252`) and both followed by
`PaymentStore.markTaskPaid()` (`src/payments.ts:1084`). Anchor once a
`PaymentReceipt` reaches `status: 'settled'`.

**Canonical record:**

```json
{
  "event": "settlement.executed",
  "receipt_id": "<PaymentReceipt.id>",
  "task_id": "<extracted from PaymentReceipt.resource, format 'task:<id> (...)'>",
  "pay_to": "<PaymentReceipt.payTo>",
  "amount": "<PaymentReceipt.amount>",
  "asset": "<PaymentReceipt.asset>",
  "network": "<PaymentReceipt.network>",
  "tx": "<PaymentReceipt.tx, omit if absent — free/zero-amount settlements have no on-chain tx of their own>",
  "created_at": "<PaymentReceipt.created_at>"
}
```

`resource` on `PaymentReceipt` is a human-readable string
(`"task:<id> (<title>)"`), not a structured field — extracting `task_id`
from it means parsing out the substring between `task:` and the first
space; if a future refactor of `PaymentReceipt` splits this into a
dedicated `task_id` field, use that field directly instead of parsing
`resource`. Only anchor receipts with `status: 'settled'` — `'failed'`
receipts are not anchored (nothing to attest to on-chain).

- `agent_xmbl_address` = the XMBL address of `payTo` (the paid agent).
- `timestamp` = `PaymentReceipt.created_at`.

## Event 4 — `artifact.uploaded`

**Source:** `src/files.ts:45` `putFile()`, invoked from the file upload
route (`src/routes/files.ts:17`). Underlying record: `FileMeta`
(`src/files.ts:20-29`).

**Canonical record:**

```json
{
  "event": "artifact.uploaded",
  "file_id": "<FileMeta.file_id>",
  "name": "<FileMeta.name>",
  "content_type": "<FileMeta.content_type>",
  "bytes": "<FileMeta.bytes>",
  "uploader_agent": "<FileMeta.uploader_agent, omit if absent>",
  "created_at": "<FileMeta.created_at>"
}
```

`grants` (the download-access allowlist) is deliberately excluded — it is
mutable after upload (see `POST /files/:id/grant`) and anchoring it would
make the hash stop matching the moment access is extended, even though the
artifact itself hasn't changed.

- `agent_xmbl_address` = the XMBL address of `uploader_agent` — omit/skip
  anchoring if the upload has no attributable uploader agent (a bare
  `owner_user` upload with no agent actor).
- `timestamp` = `FileMeta.created_at`.

## Event 5 — `soc.posted`

**Source:** `src/social.ts:106` `SocialStore.createPost()`, invoked
primarily via the `social_post` MCP tool (`src/mcp-server.ts:990-1005`).
Underlying record: `Post` (`src/social.ts:19-51`).

**Canonical record:**

```json
{
  "event": "soc.posted",
  "post_id": "<Post.id>",
  "author": "<Post.author>",
  "text": "<Post.text>",
  "scope": "<Post.scope, omit if absent>",
  "created_at": "<Post.created_at>"
}
```

`text` is included in the **hash input** (so the anchor commits to exact
post content), but per the hard rule above, only `sha256_hex` ever reaches
the chain — the text itself never does. `likes`/`tags`/`reply_to`/
`repost_of`/etc. are excluded: they are either mutable after posting
(`likes`) or represent a *different* post's identity that would be double-
counted (a reply's `reply_to` doesn't change what *this* post said).

- `agent_xmbl_address` = the XMBL address of `author`.
- `timestamp` = `Post.created_at`.

---

## Summary table

| Event kind | Source (file:line) | Canonical record ID field | `agent_xmbl_address` sourced from | `timestamp` sourced from |
|---|---|---|---|---|
| `task.created` | `src/payments.ts:713` | `task_id` | `created_by` | `created_at` |
| `task.verified` | `src/payments.ts:1044` | `task_id` | `verified_by` | `updated_at` |
| `settlement.executed` | `src/payments.ts:1099` / `:1301` | `receipt_id` | `pay_to` | `created_at` |
| `artifact.uploaded` | `src/files.ts:45` | `file_id` | `uploader_agent` | `created_at` |
| `soc.posted` | `src/social.ts:106` | `post_id` | `author` | `created_at` |

## Notes for implementers

- None of these 5 events currently fire a dedicated `notification.*` kind
  in handoff that carries the full record needed for anchoring (see
  `src/notify.ts`'s `NotifKind` union) — `task.created` only notifies if
  pre-assigned, `task.verified` fires no notification at all, settlement
  fires `notification.payment` but with a summarized subset of fields, and
  `artifact.uploaded`/`soc.posted` fire nothing. An anchoring worker should
  hook the actual store mutation points cited above (or a receipt/event
  hook, e.g. `PaymentStore`'s existing `receiptHooks` for settlement),
  **not** the notification layer, to avoid missing un-notified events.
- This spec defines the payload and canonicalization; it does not specify
  batching, gas/fee strategy, or the on-chain contract's ABI for accepting
  these payloads — those are separate follow-on design questions.
