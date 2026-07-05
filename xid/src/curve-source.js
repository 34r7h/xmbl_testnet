import { createHash } from 'crypto';

/**
 * CurveSource — the seam by which the xid signature scheme requests curve /
 * parameter material derived from the XMBL cubic ledger (xclt).
 *
 * This file defines ONLY the contract (input/output shape) and a deterministic
 * PLACEHOLDER implementation. It is intentionally decoupled: it imports nothing
 * from xclt or any fork/extraction module and takes plain data as input, so the
 * seam stands on its own while the specified construction is designed elsewhere.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ NOT FINAL — NO SECURITY PROPERTIES.                                        │
 * │ The placeholder returns deterministic stand-in bytes. It makes NO          │
 * │ cryptographic or security guarantee of any kind. The mixing primitive is   │
 * │ a stand-in for reproducibility only, not a security choice. The specified  │
 * │ construction (curves derived from the cube-of-cubes ledger) is TBD and     │
 * │ must replace this before any parameter material is relied upon.            │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Fixed size, in bytes, of a curve parameter block returned by any CurveSource.
 * The seam is defined around a fixed-size opaque block; the internal layout is
 * part of the specified construction (TBD) and deliberately unspecified here.
 * @type {number}
 */
export const CURVE_PARAM_BLOCK_SIZE = 64;

// Domain-separation tag for the placeholder mixer. Named to make its status
// unmistakable in any hash preimage; it is not a security parameter.
const PLACEHOLDER_DOMAIN = 'xmbl/xid/curve-source/placeholder-insecure/v0';

/**
 * Encode a single scalar into a canonical, collision-resistant-by-tagging form.
 * BigInt is handled explicitly (cube addresses/timestamps in xclt are nanosecond
 * BigInts, and JSON.stringify throws on BigInt). Non-finite numbers are rejected
 * so the canonical form — and therefore the output — is stable across nodes.
 *
 * @param {bigint|number|string} v
 * @returns {string}
 */
function encodeScalar(v) {
  if (typeof v === 'bigint') return 'b:' + v.toString();
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('CurveSource: non-finite scalar value');
    return 'n:' + v.toString();
  }
  if (typeof v === 'string') return 's:' + v;
  throw new Error(`CurveSource: unsupported scalar type ${typeof v}`);
}

/**
 * @typedef {Object} CurveRequest
 * @property {bigint|number|string} cubeAddress
 *   Address/id of the cube the parameter material is bound to.
 * @property {Array<{x:number,y:number,z:number,magnitude?:number}>} coordinates
 *   The cube's ORDERED block coordinate/vector set (as produced by xclt geometry).
 *   Order is significant and is preserved; the seam never reorders it.
 */

/**
 * Produce a canonical, order-preserving string for a CurveRequest. Two nodes
 * with identical ledger state produce byte-identical canonical forms, which is
 * what makes the placeholder output deterministic across nodes.
 *
 * @param {CurveRequest} request
 * @returns {string}
 */
export function canonicalizeRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('CurveSource: request must be an object');
  }
  const { cubeAddress, coordinates } = request;
  if (cubeAddress === undefined || cubeAddress === null) {
    throw new Error('CurveSource: request.cubeAddress is required');
  }
  if (!Array.isArray(coordinates)) {
    throw new Error('CurveSource: request.coordinates must be an array');
  }

  const parts = [`addr=${encodeScalar(cubeAddress)}`, `n=${coordinates.length}`];
  // Ordered set: iterate in caller order and never sort. The index prefix pins
  // position so a reordering of identical values yields a different canonical form.
  coordinates.forEach((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`CurveSource: coordinate[${i}] must be an object`);
    }
    const { x, y, z, magnitude } = c;
    if (x === undefined || y === undefined || z === undefined) {
      throw new Error(`CurveSource: coordinate[${i}] must have x, y, z`);
    }
    let seg = `${i}:${encodeScalar(x)},${encodeScalar(y)},${encodeScalar(z)}`;
    if (magnitude !== undefined) seg += `,m=${encodeScalar(magnitude)}`;
    parts.push(seg);
  });

  return parts.join('|');
}

/**
 * Abstract contract for a source of curve/parameter material.
 *
 * The signature scheme depends only on this interface: given a {@link CurveRequest},
 * return a fixed-size ({@link CURVE_PARAM_BLOCK_SIZE}) opaque parameter block.
 * Concrete sources (the specified construction, TBD) implement getCurveParams.
 *
 * @abstract
 */
export class CurveSource {
  /**
   * Return a fixed-size curve parameter block for the given request.
   * @param {CurveRequest} _request
   * @returns {Uint8Array} block of exactly CURVE_PARAM_BLOCK_SIZE bytes
   * @abstract
   */
  getCurveParams(_request) {
    throw new Error('CurveSource.getCurveParams is abstract; use a concrete implementation');
  }

  /**
   * Machine-readable self-description of this source. Concrete sources override
   * to advertise their construction and status.
   * @returns {{name:string, blockSize:number, placeholder:boolean, secure:boolean, note:string}}
   */
  describe() {
    return {
      name: 'CurveSource',
      blockSize: CURVE_PARAM_BLOCK_SIZE,
      placeholder: true,
      secure: false,
      note: 'abstract contract; no implementation',
    };
  }
}

/**
 * Deterministic PLACEHOLDER CurveSource.
 *
 * Derives the parameter block from a hash of the canonicalized request, expanded
 * to CURVE_PARAM_BLOCK_SIZE via counter-mode digesting. The output is a pure,
 * order-sensitive function of the request, so it is identical across nodes for
 * identical ledger state — and NOTHING MORE. It has no security properties and
 * must be replaced by the specified construction before use. See file header.
 */
export class PlaceholderCurveSource extends CurveSource {
  /**
   * @param {CurveRequest} request
   * @returns {Uint8Array} deterministic, insecure, stand-in parameter block
   */
  getCurveParams(request) {
    const canonical = canonicalizeRequest(request);
    const out = Buffer.alloc(CURVE_PARAM_BLOCK_SIZE);
    let offset = 0;
    let counter = 0;
    // Counter-mode expansion: each digest fills up to 32 bytes; a 4-byte BE
    // counter separates blocks. Deterministic given `canonical`.
    while (offset < CURVE_PARAM_BLOCK_SIZE) {
      const ctr = Buffer.alloc(4);
      ctr.writeUInt32BE(counter, 0);
      const digest = createHash('sha256')
        .update(PLACEHOLDER_DOMAIN)
        .update(ctr)
        .update(canonical)
        .digest();
      const take = Math.min(digest.length, CURVE_PARAM_BLOCK_SIZE - offset);
      digest.copy(out, offset, 0, take);
      offset += take;
      counter += 1;
    }
    return new Uint8Array(out);
  }

  /** @returns {{name:string, blockSize:number, placeholder:boolean, secure:boolean, note:string}} */
  describe() {
    return {
      name: 'PlaceholderCurveSource',
      blockSize: CURVE_PARAM_BLOCK_SIZE,
      placeholder: true,
      secure: false,
      note: 'insecure deterministic stand-in; specified construction TBD; do not rely on output',
    };
  }
}
