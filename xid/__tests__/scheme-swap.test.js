import { describe, test, expect, jest } from '@jest/globals';
import { Identity } from '../src/identity.js';
import { sign, verify, signTagged, SIGNER_SCHEME } from '../src/signer.js';
import { MAYOWasm } from '../src/wasm-wrapper.js';
import { KNOWN_SCHEMES } from '../src/wasm-schemes.js';

// WASM keygen/sign/verify are the slow part; give the suite room.
jest.setTimeout(60000);

describe('F5 scheme-swap seam (behind the C3 signer seam)', () => {
  test('default scheme is unchanged (mayo) — no caller passes a scheme', () => {
    expect(SIGNER_SCHEME).toBe('mayo');
  });

  test('DEFAULT path: create → sign → verify round-trips exactly as before', async () => {
    const id = await Identity.create();
    expect(id.scheme).toBe('mayo');
    const msg = new TextEncoder().encode('default path');
    const sig = await sign(msg, id.privateKey); // no scheme arg — pre-F5 callsite
    expect(await verify(msg, sig, id.publicKey)).toBe(true);
  });

  test.each(KNOWN_SCHEMES)('scheme %s is selectable: create → sign → verify round-trips', async (scheme) => {
    const id = await Identity.create({ scheme });
    expect(id.scheme).toBe(scheme);
    const msg = new TextEncoder().encode(`round-trip under ${scheme}`);
    const sig = await sign(msg, id.privateKey, { scheme });
    expect(await verify(msg, sig, id.publicKey, { scheme })).toBe(true);
  });

  test('scheme accepted as a bare string or an {scheme} object equivalently', async () => {
    const id = await Identity.create('mayo-cube');
    expect(id.scheme).toBe('mayo-cube');
    const msg = new TextEncoder().encode('string vs object opts');
    const sigStr = await sign(msg, id.privateKey, 'mayo-cube');
    const sigObj = await sign(msg, id.privateKey, { scheme: 'mayo-cube' });
    expect(await verify(msg, sigStr, id.publicKey, 'mayo-cube')).toBe(true);
    expect(await verify(msg, sigObj, id.publicKey, { scheme: 'mayo-cube' })).toBe(true);
  });

  test('signTagged reports the scheme actually used', async () => {
    const id = await Identity.create({ scheme: 'mayo-cube' });
    const tagged = await signTagged('payload', id.privateKey, 'mayo-cube');
    expect(tagged.scheme).toBe('mayo-cube');
    expect(await verify('payload', tagged.sig, id.publicKey, 'mayo-cube')).toBe(true);
  });

  test('signTransaction / verifyTransaction thread the identity scheme end-to-end', async () => {
    const id = await Identity.create({ scheme: 'mayo-cube' });
    const tx = await id.signTransaction({ to: 'xmbDEST', amount: 1, nonce: 7 });
    expect(await Identity.verifyTransaction(tx, id.publicKey, { scheme: 'mayo-cube' })).toBe(true);
  });

  test('load CONSUMES the resolved artifact path: an unknown scheme throws, not silently loads default', async () => {
    // Proves the swap genuinely routes by scheme (so the future cube-curve build
    // will load rather than silently fall back to the old artifact).
    await expect(MAYOWasm.load('nonexistent-scheme')).rejects.toThrow(/unknown signature scheme/);
  });

  test('the loaded instance records which scheme it was loaded for', async () => {
    const def = await MAYOWasm.load();
    expect(def.scheme).toBe('mayo');
    const cube = await MAYOWasm.load('mayo-cube');
    expect(cube.scheme).toBe('mayo-cube');
  });
});
