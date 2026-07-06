# Changelog

All notable changes to the `xid` module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this module adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Differential test rig (F6)** — `__tests__/mayo-fork-difftest.test.js` +
  `__tests__/support/scheme-difftest.js`. Drives identical keygen/sign/verify
  vector sets through BOTH the reference (`mayo`) and fork (`mayo-cube`) schemes
  and asserts the group-F invariants: classic MAYO is untouched by the fork
  (round-trip + tamper/tampered-signature rejection); the `mayo`↔`mayo-cube`
  swap behaves identically today (both back the one vendored fork — documented
  as current, not permanent); the `PlaceholderCurveSource` (F3) is deterministic;
  and the fork's sign→verify plumbing round-trips WITH the placeholder
  CurveSource, where wrong curve-params (same message + key, only the
  CurveRequest differs, recomputed at verify) fail verification. All fork-path
  outputs are labeled experimental; the curve-binding is a test-rig placeholder
  for the future cube-curve construction (kept in test-support, not exported).
  The rig imports nothing from xclt/extraction — CurveRequests are inline
  plain-data fixtures, preserving the F3 seam's decoupling. Closes group F
  (F1–F6). Also pins `testMatch` to `**/__tests__/**/*.test.js` so support/
  fixtures under `__tests__` are not auto-run as suites (mirrors xclt's config).
- **Scheme-swap seam (F5)** — a runtime `{scheme:'mayo'|'mayo-cube'}` option on
  identity create / sign / verify, landing BEHIND the C3 signer seam so no caller
  changes. `src/wasm-schemes.js` is a pure, synchronous resolver mapping a scheme
  tag → its WASM-artifact descriptor; `MAYOWasm.load(scheme)` consumes that
  descriptor to load the matching artifact (`signer.sign/verify/signTagged`,
  `Identity.create/signTransaction/verifyTransaction` all thread an optional
  scheme through it). Default stays `'mayo'` and resolves to the exact artifact
  loaded before F5, so the default path is byte-identical (existing suites
  unchanged; MAYO signatures are randomized, so "byte-identical" means
  code-path/artifact identity, not signature equality). Both schemes currently
  resolve to the one vendored `mayo-cube/` fork (the cube-curve crypto is future
  — "seams now, MAYO math later"); when it lands, `'mayo-cube'` repoints to its
  own build by editing one registry entry, with no caller or loader change. The
  scheme is NOT embedded in the signed payload, so existing signatures/verify are
  unaffected. (F3/F4 CurveSource stays separate — not wired here.)
