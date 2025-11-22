# XCLT - XMBL Cubic Ledger Technology

XMBL's Cubic Ledger Technology module.


All txs submitted to the network mempools are known as atomic cubes. a tx is hashed and a digital root is derived from that hash. 

Block: The fundamental unit. Initially a 1x1x1 spatial volume representing a single transaction. Subsequent "blocks" can be cubes of transactions/cubes of transactions.

Face: A 3x3 grid of 9 blocks.

Cube: Composed of 3 faces.

Block Placement in Face:
For a given block ID, its placement within a face (3x3 grid, top-left to bottom-right indexed 1-9) is determined by the digital root of the block ID.

Face Placement in Cube:
For a given block ID, the face's placement within a cube (3 faces, indexed 0-2) is determined by the block ID modulo 3.

Growing Super-Structure: The system starts with a 1x1x1 block, followed by a 3x3x3 cube, then a 9x9x9 super-cube, and so forth, with the side length of the cube growing as powers of 3 (3⁰, 3¹, 3², ...). Partial cubes await the next entry required for completion.

