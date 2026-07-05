# XCLT - XMBL Cubic Ledger Technology

XMBL's Cubic Ledger Technology module.

All transactions submitted to the network mempools are hashed. Placement in the hierarchical cubic structure is **hash-based**: blocks accumulate in a face and, once the face holds 9, they are sorted by hash to assign positions 0-8 deterministically. (Digital root was used for placement in an earlier design but was removed — see "Placement Logic" below.)

## Core Concepts

**Block**: The fundamental unit - a 1×1×1 spatial volume representing a single transaction.

**Face**: A 3×3 grid of 9 units (blocks at Level 1, cubes at Level 2, super-cubes at Level 3, etc.).

**Cube**: Composed of 3 faces, containing 27 units total.

**Placement Logic**: The same placement mechanism works at all hierarchical levels:
- **Unit Placement in Face**: Units accumulate in a face; once a face holds 9, they are **sorted by hash** and assigned positions 0-8 (lowest hash = position 0). Placement is deferred until the face is full so it is fully deterministic and independent of arrival order.
- **Face Placement in Cube**: Once 3 faces are ready, they are **sorted by hash** and assigned to the cube's 3 face-slots (indexed 0-2).

> **Note — digital root removed for placement:** an earlier design derived a digital root from the unit hash to place units immediately. That was intentionally removed: immediate digital-root placement created frequent position collisions that spawned parallel builds, and those orphaned parallel builds stalled cube construction. Placement is now hash-sort on a full face/cube. `calculateDigitalRoot()` remains in the codebase but is **not** used for placement.

## Hierarchical Growth Structure

The cubic ledger grows hierarchically using the **same placement mechanism** at every level:

**Level 1 (Atomic Cube)**: 27 blocks = 3×3×3
- 9 blocks per face (3×3 grid)
- 3 faces per cube
- **Status**: ✅ Fully implemented in Phase 2 Layer 1

**Level 2 (Super-Cube)**: 729 blocks = 9×9×9
- 27 atomic cubes (each 3×3×3)
- 9 atomic cubes per cube-face (3×3 grid)
- 3 cube-faces per super-cube
- **Placement**: Uses same `getBlockPosition()` and `getFaceIndex()` functions, treating atomic cubes as units

**Level 3 (Mega-Cube)**: 19,683 blocks = 27×27×27
- 27 super-cubes (each 9×9×9)
- 9 super-cubes per super-face (3×3 grid)
- 3 super-faces per mega-cube
- **Placement**: Same functions, treating super-cubes as units

**Level N**: 3^(3N) blocks = (3^N)×(3^N)×(3^N)
- Each level contains 27 units from the previous level
- Side length grows as powers of 3: 3⁰, 3¹, 3², 3³, ...
- Same placement algorithm applies recursively

**Key Insight**: The placement mechanism is **dimension-agnostic**. The functions `getBlockPosition()` and `getFaceIndex()` work identically whether placing blocks in faces (Level 1), atomic cubes in cube-faces (Level 2), super-cubes in super-faces (Level 3), or any level-N units in level-N+1 faces. Completed cubes become atomic units for the next level.

## Transaction Types

XCLT supports five transaction types (defined in `tokens.json`):

1. **identity**: Identity transaction - signing the public key
2. **utxo**: UTXO transaction - coin/token transfer
3. **token_creation**: Token creation transaction - XMBL NFT
4. **contract**: Contract transaction - hash + ABI
5. **state_diff**: State diff transaction - function + args

See `tokens.json` for detailed field definitions and requirements for each transaction type.

## Public API

```js
import {
  Ledger,
  Block,
  Face,
  Cube,
  SuperCube,
  calculateDigitalRoot,
  getBlockPosition,
  getFaceIndex,
  validateTransaction,
  getTransactionType,
  positionToLocalCoords,
  faceIndexToZ,
  calculateBlockCoords,
  calculateCubeCoords,
  calculateAbsoluteCoords,
  calculateVector,
  calculateFractalAddress,
  getOrigin,
} from 'xclt';
```

- `Ledger` — class managing the cubic ledger's persisted block/cube/super-cube state.
- `Block` — class for a single 1×1×1 transaction unit.
- `Face` — class for a 3×3 face of 9 units.
- `Cube` — class composed of 3 faces (27 units).
- `SuperCube` — class for a Level-2 aggregation of 27 cubes.
- `calculateDigitalRoot(...)` — derives a digital root from a hash. Retained for compatibility; **no longer used for placement** (placement is hash-sort — see "Placement Logic").
- `getBlockPosition(...)` / `getFaceIndex(...)` — functions computing a unit's placement within its face/cube.
- `validateTransaction(...)` / `getTransactionType(...)` — functions validating and classifying a submitted transaction.
- `positionToLocalCoords(...)`, `faceIndexToZ(...)`, `calculateBlockCoords(...)`, `calculateCubeCoords(...)`, `calculateAbsoluteCoords(...)`, `calculateVector(...)`, `calculateFractalAddress(...)`, `getOrigin(...)` — geometry functions mapping placement indices to spatial coordinates across hierarchy levels.

