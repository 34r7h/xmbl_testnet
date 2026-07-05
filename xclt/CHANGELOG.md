# Changelog

All notable changes to the `xclt` module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this module adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Deterministic face-membership sealing (D3a)** — `src/face-sealing.js`
  (`sealBlocksIntoFaces`) and `Ledger.addSealedBatch`. Fixes cross-node
  divergence where the legacy incremental `addTransaction` chose WHICH nine
  blocks form a face by local arrival order, so two validators seeing the same
  transactions in a different order produced different faces / merkle roots /
  forked geometry. The sealed path partitions membership as a pure function of
  the transaction SET (global hash-sort → chunk-9) and feeds the existing
  cube-formation pipeline. Two ledgers given the same set in different orders now
  converge to identical face/cube/state roots — verified in-process and across
  two independent OS processes. Ledger-local seal only; agreeing the seal
  boundary across nodes live (leader-sealing over consensus) is a follow-up
  gated on the xpc gossip path (G2b).

### Changed
- **`Face.addBlock` hardening (D3a)** — adding to a FULL face now returns an
  explicit falsy rejection value instead of silently dropping the block. The
  fullness check also correctly recognizes a hash-sorted (`blocks.size === 9`)
  face, not just one still accumulating in `pendingBlocks` — closing a latent
  bug where adds to a completed face were silently accumulated as orphans. A
  normal accepted add still returns `undefined`; no throw (callers treating
  overflow as benign, e.g. the 12-blocks-cap-at-9 test, are unaffected).
