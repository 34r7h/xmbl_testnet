export { MAYOWasm } from './src/wasm-wrapper.js';
export { Identity } from './src/identity.js';
export { KeyManager } from './src/key-manager.js';
export { batchSign, batchVerify } from './src/batch.js';
export { Signer, sign, verify, signTagged, SIGNER_SCHEME } from './src/signer.js';
export { CurveSource, PlaceholderCurveSource, canonicalizeRequest, CURVE_PARAM_BLOCK_SIZE } from './src/curve-source.js';
export {
  ensureAgentIdentity,
  loadAgentIdentity,
  ensureIdentityAtPath,
  loadIdentityAtPath,
  getPublicRecord,
  encryptSecret,
  decryptSecret,
  loadMasterKey,
} from './src/agent-keystore.js';
