# XID - XMBL's Mayo Signatures

XMBL's Mayo Signatures module.

The MAYO signature in C is ported to WASM for use in a browser. We will focus on MAYO 1 for testnet to generate private keys and signatures. Source code to adapt to emscripten https://github.com/PQCMayo/MAYO-C

## Public API

```js
import {
  MAYOWasm,
  Identity,
  KeyManager,
  batchSign,
  batchVerify,
  CurveSource,
  PlaceholderCurveSource,
  canonicalizeRequest,
  CURVE_PARAM_BLOCK_SIZE,
  ensureAgentIdentity,
  loadAgentIdentity,
  getPublicRecord,
  encryptSecret,
  decryptSecret,
  loadMasterKey,
} from 'xid';
```

- `MAYOWasm` — class wrapping the compiled MAYO WASM module (keygen/sign/verify bindings).
- `Identity` — class representing an XMBL agent identity (keypair + derived id).
- `KeyManager` — class for generating, storing, and rotating MAYO keypairs.
- `batchSign(...)` / `batchVerify(...)` — functions for signing/verifying multiple messages in one pass.
- `CurveSource` / `PlaceholderCurveSource` — classes abstracting the curve-parameter source used by signing (the placeholder stands in until the MAYO-C target-list-driven curve replacement lands).
- `canonicalizeRequest(...)` — function producing a canonical byte encoding of a request prior to signing.
- `CURVE_PARAM_BLOCK_SIZE` — constant: byte size of a curve-parameter block.
- `ensureAgentIdentity(...)` / `loadAgentIdentity(...)` / `getPublicRecord(...)` — functions managing on-disk agent identity records.
- `encryptSecret(...)` / `decryptSecret(...)` / `loadMasterKey(...)` — functions for local secret-key encryption at rest.



