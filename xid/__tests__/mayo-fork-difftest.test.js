import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import { Identity } from '../src/identity.js';
import { sign as signerSign, verify as signerVerify } from '../src/signer.js';
import {
  REFERENCE_SCHEME,
  FORK_SCHEME,
  SCHEMES,
  runVector,
  curveParamsHex,
  signBoundToCurve,
  verifyBoundToCurve,
} from './support/scheme-difftest.js';

// F6 — Differential test rig for the F5 scheme-swap seam. Drives identical
// keygen/sign/verify vector sets through BOTH the reference ('mayo') and fork
// ('mayo-cube') schemes, asserting the invariants that MUST hold. Closes group F
// and de-risks the future cube-curve math swap.
//
// EXPERIMENTAL: every fork-path output here is labeled experimental (see
// support/scheme-difftest.js). The curve-binding is a test-rig placeholder for
// the future cube-curve construction, not a decided signature scheme.
//
// DECOUPLING: CurveRequests are inline plain-data fixtures — this rig imports
// nothing from xclt or any fork/extraction module, preserving the F3 seam's
// deliberate independence.

jest.setTimeout(120000); // keygen/sign/verify over WASM, across schemes

// A small set of message vectors exercised identically under every scheme.
const MESSAGE_VECTORS = [
  new TextEncoder().encode(''),
  new TextEncoder().encode('hello xmbl'),
  new TextEncoder().encode('the quick brown fox'),
  new Uint8Array([0, 1, 2, 3, 255, 254, 253]),
];

// Inline CurveRequest fixtures (the documented shape: cube address + ordered
// coordinate/vector set). Plain data — NOT sourced from xclt.
const CURVE_REQUEST = {
  cubeAddress: 'cube-f6-000',
  coordinates: [
    { x: -1, y: 1, z: -1, magnitude: 1.7320508075688772 },
    { x: 0, y: 0, z: 0 },
    { x: 3, y: -3, z: 1, magnitude: 4.358898943540674 },
  ],
};
// A DIFFERENT request (wrong curve params) — differs only in cubeAddress, which
// the placeholder CurveSource guarantees changes the derived param block.
const WRONG_CURVE_REQUEST = { ...CURVE_REQUEST, cubeAddress: 'cube-f6-999' };

describe('F6 differential rig — classic MAYO (reference scheme) is untouched by the fork', () => {
  let identity;
  beforeAll(async () => { identity = await Identity.create(); }); // default 'mayo'

  test.each(MESSAGE_VECTORS.map((m, i) => [i, m]))(
    'vector %#: reference sign→verify round-trips true',
    async (_i, message) => {
      const { scheme, verified } = await runVector(identity, message, REFERENCE_SCHEME);
      expect(scheme).toBe('mayo');
      expect(verified).toBe(true);
    }
  );

  test('reference verify REJECTS a tampered message', async () => {
    const sig = await signerSign('original', identity.privateKey, REFERENCE_SCHEME);
    expect(await signerVerify('original', sig, identity.publicKey, REFERENCE_SCHEME)).toBe(true);
    expect(await signerVerify('tampered', sig, identity.publicKey, REFERENCE_SCHEME)).toBe(false);
  });

  test('reference verify REJECTS a tampered signature', async () => {
    const message = new TextEncoder().encode('sign me');
    const sig = await signerSign(message, identity.privateKey, REFERENCE_SCHEME);
    // Flip one base64 char to corrupt the signature (kept a valid-length string).
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await signerVerify(message, flipped, identity.publicKey, REFERENCE_SCHEME)).toBe(false);
  });
});

describe('F6 differential rig — mayo vs mayo-cube swap behaves identically today', () => {
  let identity;
  beforeAll(async () => { identity = await Identity.create(); });

  test.each(MESSAGE_VECTORS.map((m, i) => [i, m]))(
    'vector %#: BOTH schemes independently round-trip sign→verify',
    async (_i, message) => {
      for (const scheme of SCHEMES) {
        const { verified } = await runVector(identity, message, scheme);
        expect(verified).toBe(true);
      }
    }
  );

  test('cross-scheme: a signature made under mayo verifies under mayo-cube TODAY (both back the one vendored fork)', async () => {
    // This holds ONLY because 'mayo' and 'mayo-cube' currently resolve to the
    // same vendored artifact. When the cube-curve build diverges, this flips —
    // the assertion documents the current equivalence, not a permanent invariant.
    const message = new TextEncoder().encode('cross-scheme message');
    const sigUnderMayo = await signerSign(message, identity.privateKey, REFERENCE_SCHEME);
    expect(await signerVerify(message, sigUnderMayo, identity.publicKey, FORK_SCHEME)).toBe(true);
    const sigUnderCube = await signerSign(message, identity.privateKey, FORK_SCHEME);
    expect(await signerVerify(message, sigUnderCube, identity.publicKey, REFERENCE_SCHEME)).toBe(true);
  });
});

describe('F6 differential rig — CurveSource (F3) determinism invariants', () => {
  test('same CurveRequest → identical param block (deterministic)', () => {
    expect(curveParamsHex(CURVE_REQUEST)).toBe(curveParamsHex({ ...CURVE_REQUEST }));
  });

  test('different CurveRequest (wrong params) → different param block', () => {
    expect(curveParamsHex(CURVE_REQUEST)).not.toBe(curveParamsHex(WRONG_CURVE_REQUEST));
  });
});

describe('F6 differential rig — fork plumbing round-trips sign→verify WITH the placeholder CurveSource (F3)', () => {
  let identity;
  beforeAll(async () => { identity = await Identity.create({ scheme: FORK_SCHEME }); });

  test('curve-bound sign→verify round-trips true under the fork scheme', async () => {
    const message = new TextEncoder().encode('curve-bound payload');
    const sig = await signBoundToCurve(message, identity, CURVE_REQUEST, FORK_SCHEME);
    expect(await verifyBoundToCurve(message, sig, identity, CURVE_REQUEST, FORK_SCHEME)).toBe(true);
  });

  test('WRONG curve params FAIL verification (same message, same key — only the CurveRequest differs)', async () => {
    // Non-vacuous: sign binds to CURVE_REQUEST; verify recomputes the binding from
    // WRONG_CURVE_REQUEST. The failure provably flows from the curve params
    // through the binding, not an incidental mismatch.
    const message = new TextEncoder().encode('curve-bound payload');
    const sig = await signBoundToCurve(message, identity, CURVE_REQUEST, FORK_SCHEME);
    expect(await verifyBoundToCurve(message, sig, identity, WRONG_CURVE_REQUEST, FORK_SCHEME)).toBe(false);
    // And the SAME signature still verifies under the CORRECT request (proves the
    // signature itself is valid; only the curve params changed the outcome).
    expect(await verifyBoundToCurve(message, sig, identity, CURVE_REQUEST, FORK_SCHEME)).toBe(true);
  });

  test('a tampered curve-bound signature FAILS verification', async () => {
    const message = new TextEncoder().encode('curve-bound payload');
    const sig = await signBoundToCurve(message, identity, CURVE_REQUEST, FORK_SCHEME);
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verifyBoundToCurve(message, flipped, identity, CURVE_REQUEST, FORK_SCHEME)).toBe(false);
  });
});
