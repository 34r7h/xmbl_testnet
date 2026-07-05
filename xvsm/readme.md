# XVSM - XMBL Virtual State Machine

XMBL's Virtual State Machine module.

the xmbl virtual state machine is a sparsly populated verkle tree of diffs that are able to be assembled into full state by requesting nodes

## Public API

```js
import {
  VerkleStateTree,
  StateDiff,
  WASMExecutor,
  StateShard,
  StateAssembler,
  StateMachine,
} from 'xvsm';
```

- `VerkleStateTree` — class implementing the sparse verkle tree of state diffs.
- `StateDiff` — class representing a single state delta applied by a transaction.
- `WASMExecutor` — class executing WASM state-transition logic.
- `StateShard` — class representing one shard of the sparse state tree.
- `StateAssembler` — class assembling full state from a requested set of diffs.
- `StateMachine` — class driving the overall state-transition lifecycle.