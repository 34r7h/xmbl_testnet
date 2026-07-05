# Vendored source

Copied (not a git submodule) from https://github.com/PQCMayo/MAYO-C, pinned at
commit `4b7cd94c96b9522864efe40c6ad1fa269584a807` ("Simplify downstream
integration (#9)") — the same commit `xid/mayo-c-source` and
`docs/mayo-multiplication-map.md` are pinned to.

Vendored: `src/`, `include/`, `LICENSE`, `NOTICE`, `README.md` (renamed
`UPSTREAM-README.md` here to avoid shadowing this file). Byte-identical to
upstream at that commit — no crypto changes.

Not vendored (upstream's own native CMake build/test tooling, not used by
the emscripten/WASM build in this repo): `KAT/` (known-answer test vectors,
~7.3MB), `test/`, `apps/`, `scripts/`, `.cmake/`, `.github/`, `META/`,
`.astylerc`, `CMakeLists.txt`.

## Why a second copy instead of fixing `xid/mayo-c-source`

`xid/mayo-c-source` is committed as a git submodule gitlink (mode `160000`)
with no corresponding `.gitmodules` entry anywhere in this repo's history —
on a fresh clone it resolves to an empty directory, so the existing
`build-mayo-wasm.sh` path is currently broken from scratch (confirmed while
verifying A1: `npm -w xid test` fails with `Cannot find module
'.../mayo-c-source/mayo.cjs'` on a clean clone since there's no source to
build from, let alone a prebuilt artifact). That's a separate, pre-existing
gap — not something this task fixes. This directory is a plain vendored copy
precisely so it does *not* have that failure mode.

## Build

`../build-mayo-cube-wasm.sh` (sibling of `../build-mayo-wasm.sh`, same
Emscripten flags/exported functions, paths retargeted at this directory)
produces `mayo.cjs` + `mayo.wasm` here. Not committed (build output, same as
`mayo-c-source`'s artifacts never were) — CI (A4) builds it.

Confirmed locally: `emcc` (Homebrew, `4.0.24-git`/`5.0.0` package) compiles
this cleanly and the resulting artifact loads via `wasm-wrapper.js`.

## KNOWN ISSUE: keygen crashes under today's toolchain (blocks "35 tests green")

Both this fork's WASM build **and a from-scratch rebuild of unmodified
upstream** (verified locally, not committed — `xid/mayo-c-source` populated
temporarily with the same 4b7cd94 source to get an apples-to-apples control)
crash identically:

```
RuntimeError: unreachable
    at MAYOWasm.keygen (src/wasm-wrapper.js:84:27)
```

`wasm-ld` warns during both builds:

```
wasm-ld: warning: function signature mismatch: shake256
>>> defined as (i32, i32, i32, i32) -> i32 in mayo.o
>>> defined as (i32, i32, i32, i32) -> void in fips202.o
```

Root cause, confirmed by direct C-level test (not guessed): `src/common/
fips202.h` declares `int shake256(...)`, but `src/common/fips202.c` *defines*
`void shake256(...)` — a real prototype/implementation return-type mismatch
in upstream MAYO-C@4b7cd94 itself. Under this machine's Emscripten build,
wasm-ld links the mismatched types with only a warning instead of an error,
and the resulting call-site type confusion traps at runtime. This is **not**
a regression introduced by vendoring the fork — it reproduces identically
against untouched upstream source with the same toolchain.

Fix (verified working, NOT applied here to keep this fork byte-identical to
upstream per task scope): change the declaration in `fips202.h` to match the
real implementation —

```diff
- int shake256(unsigned char *output, size_t outputByteLen, const unsigned char *input, size_t inputByteLen);
+ void shake256(unsigned char *output, size_t outputByteLen, const unsigned char *input, size_t inputByteLen);
```

Verified with a direct node-level test calling `_pqmayo_MAYO_1_opt_crypto_sign_keypair`
after this one-line change: returns `0` (success) instead of trapping.
Zero behavior/algorithm change — the function body is untouched, only a
stale forward declaration is corrected.

This blocks running the existing 35 xid tests green against either artifact
on this machine today. Recommend routing as a follow-up task: either (a)
apply this 1-line, non-crypto prototype fix to whichever copy becomes the
one CI actually builds, or (b) pin an older/compatible Emscripten in CI (A4)
if the mismatch happens not to trap there. Whoever picks this up should not
need to re-derive the diagnosis — it's captured above in full.
