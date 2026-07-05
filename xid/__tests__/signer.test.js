import { describe, test, expect } from '@jest/globals';
import { Identity } from '../src/identity.js';
import { Signer, sign, verify, signTagged, SIGNER_SCHEME } from '../src/signer.js';

describe('signer seam', () => {
  test('exposes a scheme tag (default mayo)', () => {
    expect(SIGNER_SCHEME).toBe('mayo');
    expect(Signer.scheme).toBe('mayo');
  });

  test('sign → verify round-trips over bytes', async () => {
    const identity = await Identity.create();
    const message = new TextEncoder().encode('hello xmbl');
    const sig = await sign(message, identity.privateKey);
    expect(typeof sig).toBe('string');
    expect(await verify(message, sig, identity.publicKey)).toBe(true);
  });

  test('verify rejects a tampered message (arg order: bytes, sig, pubkey)', async () => {
    const identity = await Identity.create();
    const sig = await sign('original', identity.privateKey);
    expect(await verify('original', sig, identity.publicKey)).toBe(true);
    expect(await verify('tampered', sig, identity.publicKey)).toBe(false);
  });

  test('accepts Uint8Array, Buffer, and string message forms equivalently', async () => {
    const identity = await Identity.create();
    const str = 'same message';
    const sigFromStr = await sign(str, identity.privateKey);
    // a signature over the string verifies against the equivalent byte forms
    expect(await verify(new TextEncoder().encode(str), sigFromStr, identity.publicKey)).toBe(true);
    expect(await verify(Buffer.from(str, 'utf8'), sigFromStr, identity.publicKey)).toBe(true);
  });

  test('rejects an unsupported message type', async () => {
    const identity = await Identity.create();
    await expect(sign({ not: 'bytes' }, identity.privateKey)).rejects.toThrow(/Uint8Array, Buffer, or string/);
  });

  test('signTagged returns the scheme alongside the signature', async () => {
    const identity = await Identity.create();
    const tagged = await signTagged('payload', identity.privateKey);
    expect(tagged.scheme).toBe('mayo');
    expect(await verify('payload', tagged.sig, identity.publicKey)).toBe(true);
  });

  test('Identity.signTransaction is routed through the seam (verifies via signer)', async () => {
    const identity = await Identity.create();
    const signed = await identity.signTransaction({ to: 'xmbDEST', amount: 1, nonce: 1 });
    // reconstruct the signed message the way Identity does and check it via the seam
    const { sig, ...withoutSig } = signed;
    const bytes = new TextEncoder().encode(JSON.stringify(withoutSig));
    expect(await verify(bytes, sig, identity.publicKey)).toBe(true);
  });
});
