/**
 * F6 differential-test RIG (test-support only — NOT exported from index.js).
 *
 * Differentially exercises the F5 scheme-swap seam: it drives identical
 * keygen/sign/verify inputs through both the reference ('mayo') and fork
 * ('mayo-cube') schemes so a suite can assert the invariants that MUST hold —
 * classic MAYO untouched by the fork's presence, and the fork's sign→verify
 * plumbing round-trips with the placeholder CurveSource (F3).
 *
 * DECOUPLING: like curve-source.js itself, this rig takes PLAIN CurveRequest
 * data and imports NOTHING from xclt or any fork/extraction module. The signing
 * path (F5 signer seam) and the curve-param path (F3 CurveSource) are joined
 * here only at the test layer.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ EXPERIMENTAL — the curve-binding below is a TEST-RIG PLACEHOLDER, not a    │
 * │ decided signature scheme. It binds a signature to the placeholder curve-   │
 * │ param block as `message ‖ hash(curveParams)` purely to demonstrate the     │
 * │ future cube-curve binding and to give "wrong-curve-params fails verify" a  │
 * │ concrete meaning today. The REAL binding is curve-source.js's TBD          │
 * │ construction; do not treat this shape as final.                            │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import { createHash } from 'crypto';
import { sign as signerSign, verify as signerVerify } from '../../src/signer.js';
import { PlaceholderCurveSource } from '../../src/curve-source.js';

/** The two schemes the rig differentiates. 'mayo' is the reference; 'mayo-cube' is the fork. */
export const REFERENCE_SCHEME = 'mayo';
export const FORK_SCHEME = 'mayo-cube';
export const SCHEMES = Object.freeze([REFERENCE_SCHEME, FORK_SCHEME]);

/**
 * Run one keygen/sign/verify vector through a scheme.
 * @param {{publicKey:string, privateKey:string}} identity - a keypair (MAYO keys
 *   work under either scheme today, since both back the one vendored artifact).
 * @param {Uint8Array|string} message
 * @param {string} scheme
 * @returns {Promise<{scheme:string, sig:string, verified:boolean}>}
 */
export async function runVector(identity, message, scheme) {
  const sig = await signerSign(message, identity.privateKey, scheme);
  const verified = await signerVerify(message, sig, identity.publicKey, scheme);
  return { scheme, sig, verified };
}

/**
 * Derive the placeholder curve-param block for a CurveRequest, as a hex string.
 * Pure, deterministic, and independent of the signing scheme.
 * @param {object} request - a CurveRequest ({cubeAddress, coordinates})
 * @returns {string} hex of the CURVE_PARAM_BLOCK_SIZE-byte block
 */
export function curveParamsHex(request) {
  const block = new PlaceholderCurveSource().getCurveParams(request);
  return Buffer.from(block).toString('hex');
}

/**
 * EXPERIMENTAL binding: message bytes concatenated with a domain-tagged hash of
 * the curve-param block derived from `request`. This is what gets signed/verified
 * in the fork's curve-bound round-trip. Recomputed identically at sign and verify
 * time, so a different `request` yields a different bound message.
 * @param {Uint8Array|string} message
 * @param {object} request - a CurveRequest
 * @returns {Uint8Array}
 */
export function bindMessageToCurve(message, request) {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const paramsHash = createHash('sha256')
    .update('xmbl/f6/experimental-curve-binding/v0') // domain tag — marks this as the rig placeholder
    .update(Buffer.from(curveParamsHex(request), 'hex'))
    .digest();
  const bound = new Uint8Array(msgBytes.length + paramsHash.length);
  bound.set(msgBytes, 0);
  bound.set(paramsHash, msgBytes.length);
  return bound;
}

/**
 * Sign a message BOUND to a curve-param request under a scheme (experimental).
 * @returns {Promise<string>} signature over the bound message
 */
export async function signBoundToCurve(message, identity, request, scheme = FORK_SCHEME) {
  return signerSign(bindMessageToCurve(message, request), identity.privateKey, scheme);
}

/**
 * Verify a curve-bound signature by RECOMPUTING the binding from `request` at
 * verify time — so verification provably flows through the curve params. A
 * different `request` (wrong curve params) recomputes a different bound message
 * and fails.
 * @returns {Promise<boolean>}
 */
export async function verifyBoundToCurve(message, sig, identity, request, scheme = FORK_SCHEME) {
  return signerVerify(bindMessageToCurve(message, request), sig, identity.publicKey, scheme);
}
