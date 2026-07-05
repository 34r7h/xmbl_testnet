import { MAYOWasm } from './wasm-wrapper.js';

/**
 * signer — the ONE seam through which every xmbl signature is constructed and
 * verified. Every callsite that produces or checks an xmbl signature routes
 * through this module; nothing else calls the underlying primitive directly.
 * Group F swaps the signature scheme by editing THIS module (and the primitive
 * it delegates to) without touching any caller.
 *
 * Interface:
 *   sign(bytes, secretKey)        → signature
 *   verify(bytes, signature, pk)  → boolean
 *   SIGNER_SCHEME / Signer.scheme → the scheme tag (default 'mayo')
 *
 * The scheme tag is EXPOSED here, not embedded in the signed payload: the signed
 * message format is unchanged, so existing signatures/verification across the
 * codebase keep working. `signTagged` is a forward hook for callers that want to
 * record which scheme produced a signature.
 *
 * `wasm-wrapper.js` is the MAYO primitive this seam delegates to — the thing
 * group F replaces — not a competing signature-construction site.
 */

/** Current signature scheme tag. Group F changes this when the scheme changes. */
export const SIGNER_SCHEME = 'mayo';

// Normalize accepted message inputs to the Uint8Array the primitive expects.
function toMessageBytes(message) {
  if (message instanceof Uint8Array) return message;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(message)) return new Uint8Array(message);
  if (typeof message === 'string') return new TextEncoder().encode(message);
  throw new Error('signer: message must be a Uint8Array, Buffer, or string');
}

/**
 * Construct a signature over `message` with `secretKey`.
 * @param {Uint8Array|Buffer|string} message
 * @param {string} secretKey - base64 MAYO secret key
 * @returns {Promise<string>} signature
 */
export async function sign(message, secretKey) {
  const mayo = await MAYOWasm.load();
  return mayo.sign(toMessageBytes(message), secretKey);
}

/**
 * Verify `signature` over `message` under `publicKey`.
 * @param {Uint8Array|Buffer|string} message
 * @param {string} signature
 * @param {string} publicKey - base64 MAYO public key
 * @returns {Promise<boolean>}
 */
export async function verify(message, signature, publicKey) {
  const mayo = await MAYOWasm.load();
  return mayo.verify(toMessageBytes(message), signature, publicKey);
}

/**
 * Construct a scheme-tagged signature envelope. Forward hook for callers that
 * want to persist which scheme produced the signature; does not change the bytes
 * that are signed.
 * @returns {Promise<{scheme:string, sig:string}>}
 */
export async function signTagged(message, secretKey) {
  return { scheme: SIGNER_SCHEME, sig: await sign(message, secretKey) };
}

/** The signer seam as a single object. */
export const Signer = { scheme: SIGNER_SCHEME, sign, verify, signTagged };

export default Signer;
