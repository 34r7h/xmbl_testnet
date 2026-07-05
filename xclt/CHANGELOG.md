# Changelog

All notable changes to the `xclt` module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this module adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cube-of-cubes extraction reader (F4)** — `src/cube-extraction.js`, exported as
  `extractCube`, `extractFromLedger`, and `serializeExtraction`. Given a cube
  (or a `(level, index)` into a ledger), it emits the ORDERED leaf
  coordinate/vector set (`{x, y, z, magnitude}`), recursing through the
  cube-of-cubes hierarchy (27^level leaves). Output is byte-stable across nodes
  for the same ledger — traversal order and cube ids are hash-derived (never
  timestamp-derived), and ledger index resolution sorts cubes by hash id. The
  output shape is compatible with `xid`'s `CurveRequest` (the downstream
  cube-curve consumer) without coupling xclt to xid. Verified by a two-process
  determinism test that exercises the full level-2 recursion.
