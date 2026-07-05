import { describe, test, expect } from '@jest/globals';
import {
  CurveSource,
  PlaceholderCurveSource,
  canonicalizeRequest,
  CURVE_PARAM_BLOCK_SIZE,
} from '../src/curve-source.js';

// Inline fixtures matching the documented CurveRequest shape (a cube address plus
// its ordered block coordinate/vector set). Kept inline on purpose: the seam takes
// plain data and must not depend on xclt or any fork/extraction module.
const REQUEST = {
  cubeAddress: 'cube-000',
  coordinates: [
    { x: -1, y: 1, z: 0, magnitude: 1.4142135623730951 },
    { x: 0, y: 0, z: 0 },
    { x: 3, y: -3, z: 1, magnitude: 4.358898943540674 },
  ],
};

// Golden vector: pins the exact placeholder output so any change that would break
// cross-node determinism (canonicalization, expansion, mixer) fails loudly here.
const GOLDEN_HEX =
  'f14a1d7d09d3009e3758c8f81ec97aeaf74844a5a36daadc32440c57d08766f8' +
  '03f59daa6c496993afc90bebe678ea3205223058bb3f306ffe05b717fdd00411';

describe('CurveSource (abstract contract)', () => {
  test('getCurveParams is abstract on the base class', () => {
    const base = new CurveSource();
    expect(() => base.getCurveParams(REQUEST)).toThrow(/abstract/i);
  });

  test('describe() advertises placeholder / non-secure status', () => {
    expect(new CurveSource().describe()).toMatchObject({ placeholder: true, secure: false });
  });
});

describe('PlaceholderCurveSource', () => {
  const source = new PlaceholderCurveSource();

  test('returns a fixed-size block', () => {
    const block = source.getCurveParams(REQUEST);
    expect(block).toBeInstanceOf(Uint8Array);
    expect(block.length).toBe(CURVE_PARAM_BLOCK_SIZE);
  });

  test('is deterministic for identical input (same ledger state → same bytes)', () => {
    const a = source.getCurveParams(REQUEST);
    const b = new PlaceholderCurveSource().getCurveParams(REQUEST);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test('matches the golden vector', () => {
    const block = source.getCurveParams(REQUEST);
    expect(Buffer.from(block).toString('hex')).toBe(GOLDEN_HEX);
  });

  test('different cube address → different block', () => {
    const other = source.getCurveParams({ ...REQUEST, cubeAddress: 'cube-001' });
    expect(Buffer.from(other).toString('hex')).not.toBe(GOLDEN_HEX);
  });

  test('coordinate order is significant (ordered set, never reordered)', () => {
    const reversed = { ...REQUEST, coordinates: [...REQUEST.coordinates].reverse() };
    expect(Buffer.from(source.getCurveParams(reversed)).toString('hex')).not.toBe(GOLDEN_HEX);
  });

  test('accepts a BigInt cube address (xclt nanosecond timestamps)', () => {
    const block = source.getCurveParams({
      cubeAddress: 123456789012345678901234567890n,
      coordinates: [{ x: 0, y: 0, z: 0 }],
    });
    expect(block.length).toBe(CURVE_PARAM_BLOCK_SIZE);
  });

  test('describe() marks the source insecure and non-final', () => {
    expect(source.describe()).toMatchObject({
      name: 'PlaceholderCurveSource',
      placeholder: true,
      secure: false,
    });
    expect(source.describe().note).toMatch(/TBD/);
  });
});

describe('canonicalizeRequest', () => {
  test('rejects a missing cube address', () => {
    expect(() => canonicalizeRequest({ coordinates: [] })).toThrow(/cubeAddress/);
  });

  test('rejects non-array coordinates', () => {
    expect(() => canonicalizeRequest({ cubeAddress: 'c', coordinates: null })).toThrow(/coordinates/);
  });

  test('rejects a coordinate missing x/y/z', () => {
    expect(() => canonicalizeRequest({ cubeAddress: 'c', coordinates: [{ x: 0, y: 0 }] })).toThrow(/x, y, z/);
  });

  test('rejects a non-finite coordinate value', () => {
    expect(() =>
      canonicalizeRequest({ cubeAddress: 'c', coordinates: [{ x: 0, y: 0, z: Infinity }] })
    ).toThrow(/non-finite/);
  });
});
