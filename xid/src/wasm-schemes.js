/**
 * Signature-scheme → WASM-artifact resolver (F5, the scheme-swap seam).
 *
 * PURE + SYNCHRONOUS: maps a scheme tag to the descriptor of the WASM artifact
 * that backs it. It loads nothing and has no side effects, so it is exhaustively
 * unit-testable without touching WASM — the observable core of the swap. The
 * actual module load (wasm-wrapper.js `MAYOWasm.load(scheme)`) CONSUMES the
 * `cjsPath`/`wasmPath` this resolves, so a scheme that resolves to a distinct
 * artifact genuinely routes there (proved by a bad-path test in the suite).
 *
 * WHY BOTH SCHEMES POINT AT `mayo-cube/` TODAY: there is exactly one vendored
 * MAYO artifact — `xid/mayo-cube/`, our fork of MAYO-C (byte-identical to
 * upstream baseline except the F1a `shake256` build-correctness fix; see
 * mayo-cube/VENDOR.md). The distinct cube-curve scheme's crypto does NOT exist
 * yet ("seams now, MAYO math later"). So 'mayo' (default) and 'mayo-cube' both
 * currently resolve to that one working artifact — honest, not a masked
 * behavioral divergence. When the cube-curve build lands, 'mayo-cube' repoints
 * to its own artifact by editing ONE entry below; no caller and no loader
 * change is needed.
 *
 * The default scheme is 'mayo' and its descriptor is the exact path
 * wasm-wrapper.js loaded before F5, so the no-scheme/default path is unchanged.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The default scheme — the pre-F5 behavior. Callers that pass no scheme get this. */
export const DEFAULT_SCHEME = 'mayo';

/**
 * Scheme registry: tag → the artifact directory under xid/ that backs it.
 * Distinct entries even where they resolve to the same directory today, so the
 * future cube-curve divergence is a one-line change here.
 */
const SCHEME_DIRS = Object.freeze({
  // Baseline MAYO — the artifact loaded before F5. Default; must stay byte-identical.
  mayo: 'mayo-cube',
  // Our MAYO fork slot for the cube-curve scheme. Points at the shared fork
  // artifact today (cube-curve math is future); repoint to its own build later.
  'mayo-cube': 'mayo-cube',
});

/** The scheme tags this build knows how to load. */
export const KNOWN_SCHEMES = Object.freeze(Object.keys(SCHEME_DIRS));

/**
 * @typedef {Object} SchemeDescriptor
 * @property {string} scheme  - the (validated) scheme tag
 * @property {string} dir     - artifact directory name under xid/
 * @property {string} cjsPath - absolute path to the Emscripten CJS loader
 * @property {string} wasmPath- absolute path to the .wasm binary
 */

/**
 * Resolve a scheme tag to its WASM-artifact descriptor.
 *
 * @param {string} [scheme=DEFAULT_SCHEME] - one of KNOWN_SCHEMES
 * @returns {SchemeDescriptor}
 * @throws {Error} on an unknown scheme (clear, enumerating the known ones)
 */
export function resolveScheme(scheme = DEFAULT_SCHEME) {
  const dir = SCHEME_DIRS[scheme];
  if (!dir) {
    throw new Error(
      `xid: unknown signature scheme '${scheme}'. Known schemes: ${KNOWN_SCHEMES.join(', ')}`
    );
  }
  return {
    scheme,
    dir,
    cjsPath: resolve(__dirname, `../${dir}/mayo.cjs`),
    wasmPath: resolve(__dirname, `../${dir}/mayo.wasm`),
  };
}
