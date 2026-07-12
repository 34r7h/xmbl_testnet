#!/usr/bin/env node
// build-slim-node.mjs — assemble a SMALL, self-contained xmbl node into dist-node/.
//
// A coordinator that only needs to RUN a node should not clone the whole 1.5G
// monorepo (tests, jest, coverage, the Vue frontend `src/`+vite, xcli/xsim/
// xzk/xda/xbe, git history). This packager copies just what `node.js` loads at
// runtime:
//   - node.js  (the daemon entrypoint)
//   - core/*.js
//   - the SOURCE of the 6 runtime workspaces (xvsm, xpc, xsc, xclt, xn, xid):
//       each workspace's package.json (STRIPPED to metadata — no deps), its
//       src/ + index.js, and xid's prebuilt mayo-cube/ WASM assets (verbatim).
//       NOT __tests__, coverage, node_modules, data, *.md, jest configs.
//   - a single ROOT package.json that (a) declares workspaces:[the 6] so the
//     cross-imports (`from 'xvsm'` etc.) resolve via workspace symlinks, (b)
//     carries the UNION of the 6 workspaces' + core's RUNTIME dependencies
//     (devDependencies and misplaced test tooling excluded), (c) type:module.
//
// The stripped workspace package.jsons are deliberate: with `workspaces:[...]`,
// `npm install` would otherwise install EVERY workspace's own deps (hoisted),
// dragging xpc's misplaced `jest`/`@types/jest` back in and letting xclt's
// `level ^8` install a SECOND copy of level beside the root's ^10. Making the
// root the single authoritative dep source (task item b) avoids both.
//
// Then, in dist-node/:  npm install --omit=dev --no-audit --no-fund
//
// The prebuilt MAYO WASM (xid/mayo-cube/mayo.{cjs,wasm}) is copied VERBATIM —
// never recompiled (emscripten may be absent).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));   // xmbl_testnet/scripts
const ROOT = path.resolve(HERE, '..');                        // xmbl_testnet
const DIST = path.join(ROOT, 'dist-node');

const WORKSPACES = ['xvsm', 'xpc', 'xsc', 'xclt', 'xn', 'xid'];

// Packages that appear in some workspace's `dependencies` (or root's) but are
// NOT runtime deps of the node — test tooling misfiled under dependencies, and
// the Vue/vite frontend stack. Excluded from the root union.
const DENYLIST = new Set([
  'jest', '@jest/globals', '@types/jest', 'jest-node-exports-resolver', 'babel-jest',
  '@babel/core', '@babel/preset-env', 'emscripten',
  'vite', '@vitejs/plugin-vue', 'vue', 'concurrently', 'eslint', 'prettier', 'pino-pretty',
]);

// Runtime deps that are IMPORTED but not DECLARED by any workspace (transitive
// of libp2p, so absent from the union) — must be added explicitly so the bare
// `import { keys } from '@libp2p/crypto'` in xn/src/peer-identity.js resolves.
const EXTRA_DEPS = { '@libp2p/crypto': '^5.1.20' };

// Version overrides for deps declared at conflicting ranges across workspaces.
// xclt declares level ^8, everyone else ^10 — unify on ^10 (the `Level` export
// is API-stable across 8→10) so npm installs ONE level, not two.
const VERSION_OVERRIDE = { level: '^10.0.0' };

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Recursive copy with an exclude predicate (relative-to-src path -> boolean).
function copyDir(src, dest, exclude = () => false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = ent.name;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (exclude(s)) continue;
    if (ent.isDirectory()) copyDir(s, d, exclude);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

// Exclude test/coverage/dev cruft from a copied src tree.
const isDevCruft = (p) => {
  const b = path.basename(p);
  return b === '__tests__' || b === '__mocks__' || b === 'node_modules' ||
    b === 'coverage' || b.endsWith('.test.js') || b === 'jest.config.js';
};

console.log(`[slim] assembling into ${DIST}`);
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1. node.js
fs.copyFileSync(path.join(ROOT, 'node.js'), path.join(DIST, 'node.js'));
console.log('[slim] copied node.js');

// 2. core/*.js (flat, all .js)
copyDir(path.join(ROOT, 'core'), path.join(DIST, 'core'), isDevCruft);
console.log('[slim] copied core/');

// 3. workspaces — stripped package.json + src/ + index.js (+ xid mayo-cube)
const union = {};
function addDep(name, range) {
  if (DENYLIST.has(name)) return;
  if (VERSION_OVERRIDE[name]) { union[name] = VERSION_OVERRIDE[name]; return; }
  if (!(name in union)) union[name] = range;
}

for (const w of WORKSPACES) {
  const wsSrc = path.join(ROOT, w);
  const wsDest = path.join(DIST, w);
  const pkg = readJson(path.join(wsSrc, 'package.json'));

  // union THIS workspace's runtime dependencies (devDependencies dropped wholesale)
  for (const [n, r] of Object.entries(pkg.dependencies || {})) addDep(n, r);

  fs.mkdirSync(wsDest, { recursive: true });
  // stripped package.json: metadata only, so the ROOT union is the single dep source
  const slimPkg = { name: pkg.name, version: pkg.version, type: pkg.type || 'module' };
  if (pkg.main) slimPkg.main = pkg.main;
  if (pkg.exports) slimPkg.exports = pkg.exports;
  fs.writeFileSync(path.join(wsDest, 'package.json'), JSON.stringify(slimPkg, null, 2) + '\n');

  // src/
  if (fs.existsSync(path.join(wsSrc, 'src'))) copyDir(path.join(wsSrc, 'src'), path.join(wsDest, 'src'), isDevCruft);
  // root index.js (the workspace entrypoint)
  if (fs.existsSync(path.join(wsSrc, 'index.js'))) fs.copyFileSync(path.join(wsSrc, 'index.js'), path.join(wsDest, 'index.js'));

  // xid: prebuilt MAYO WASM assets, copied verbatim (NEVER recompiled). Keep the
  // xid/src <-> xid/mayo-cube sibling layout so wasm-schemes.js's
  // resolve(__dirname, '../mayo-cube/mayo.{cjs,wasm}') holds. Skip mayo-c-source (C build).
  if (w === 'xid') {
    copyDir(path.join(wsSrc, 'mayo-cube'), path.join(wsDest, 'mayo-cube'));
    console.log('[slim]   xid: copied mayo-cube/ verbatim');
  }
  console.log(`[slim] copied workspace ${w}`);
}

// core/root runtime deps (pino; vue is frontend-only and denylisted)
const rootPkg = readJson(path.join(ROOT, 'package.json'));
for (const [n, r] of Object.entries(rootPkg.dependencies || {})) addDep(n, r);
// explicit imported-but-undeclared transitives
for (const [n, r] of Object.entries(EXTRA_DEPS)) union[n] = r;

// 4. the single root package.json
const sortedDeps = Object.fromEntries(Object.entries(union).sort(([a], [b]) => a.localeCompare(b)));
const distPkg = {
  name: 'xmbl-slim-node',
  version: rootPkg.version || '0.1.0',
  private: true,
  type: 'module',
  workspaces: WORKSPACES,
  dependencies: sortedDeps,
};
fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n');

console.log('[slim] wrote root package.json with union dependencies:');
for (const [n, r] of Object.entries(sortedDeps)) console.log(`         ${n}@${r}`);
console.log(`[slim] done. next: (cd ${DIST} && npm install --omit=dev --no-audit --no-fund)`);
