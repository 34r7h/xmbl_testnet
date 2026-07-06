import { describe, test, expect } from '@jest/globals';
import { resolveScheme, KNOWN_SCHEMES, DEFAULT_SCHEME } from '../src/wasm-schemes.js';
import { existsSync } from 'fs';

// The scheme resolver is PURE and synchronous — the observable core of the F5
// swap. Tested exhaustively here without touching WASM.
describe('wasm-schemes resolver (F5)', () => {
  test('the default scheme is mayo', () => {
    expect(DEFAULT_SCHEME).toBe('mayo');
  });

  test('known schemes are exactly mayo and mayo-cube', () => {
    expect(KNOWN_SCHEMES).toEqual(['mayo', 'mayo-cube']);
  });

  test('resolveScheme() with no argument returns the default (mayo) descriptor', () => {
    const d = resolveScheme();
    expect(d.scheme).toBe('mayo');
    expect(d.dir).toBe('mayo-cube'); // the one vendored artifact today
  });

  test.each(KNOWN_SCHEMES)('resolves %s to an absolute cjs+wasm artifact path', (scheme) => {
    const d = resolveScheme(scheme);
    expect(d.scheme).toBe(scheme);
    expect(d.cjsPath).toMatch(/mayo\.cjs$/);
    expect(d.wasmPath).toMatch(/mayo\.wasm$/);
    // absolute paths (resolved from the module dir)
    expect(d.cjsPath.startsWith('/')).toBe(true);
    expect(d.wasmPath.startsWith('/')).toBe(true);
  });

  test('the resolved default artifact actually exists on disk (fresh-clone guard)', () => {
    const d = resolveScheme('mayo');
    expect(existsSync(d.cjsPath)).toBe(true);
    expect(existsSync(d.wasmPath)).toBe(true);
  });

  test('both schemes currently resolve to the same vendored artifact (fork not yet diverged)', () => {
    // Honest today: the distinct cube-curve build does not exist yet, so both
    // schemes back onto the one working artifact. This test documents that and
    // will be updated when mayo-cube repoints to its own build.
    expect(resolveScheme('mayo').cjsPath).toBe(resolveScheme('mayo-cube').cjsPath);
  });

  test('an unknown scheme throws a clear, enumerating error', () => {
    expect(() => resolveScheme('rsa')).toThrow(/unknown signature scheme 'rsa'/);
    expect(() => resolveScheme('rsa')).toThrow(/mayo, mayo-cube/);
  });
});
