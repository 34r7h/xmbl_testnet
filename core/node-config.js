import fs from 'fs';

/**
 * xmbl-node config schema — the ONE boring, stable surface that the handoff
 * coordinator (which supervises the node process) and every group-E role worker
 * (validate / storage / compute / relay / lead) reads. This JS module is the
 * single source of truth: it defines the field set, the defaults, and the
 * validator. `config.node.example.json` and `docs/node-config.md` are derived from
 * it and kept in lock-step by the test suite.
 *
 * Design rules (deliberately conservative — this path gets hardcoded everywhere):
 *  - Field names are snake_case and fixed. Do not rename or alias.
 *  - Unknown TOP-LEVEL keys are rejected, to catch typos early. This is an
 *    intentional, scoped strictness for testnet — NOT deep/recursive strictness.
 *  - Flat schema only. Cross-field rules (e.g. "compute role needs compute caps")
 *    belong to lifecycle/enforcement (A5b+), not here.
 */

/**
 * Field schema. Each entry: { type, default, required?, item? , fields? }.
 * `type` ∈ 'string' | 'number' | 'boolean' | 'string[]' | 'object'.
 * @type {Record<string, any>}
 */
export const NODE_CONFIG_SCHEMA = {
  // Path to this node's xmbl identity keystore file (produced by the xid
  // agent-keystore, C1): ~/.handoff/agents/<id>/xmbl.json. Required — a node has
  // no meaningful default identity.
  identity_path: { type: 'string', required: true, default: '' },

  // Base directory for all node state (ledger, storage, peerstore subdirs live
  // under here). Created by the daemon if absent.
  data_dir: { type: 'string', default: './xmbl-data' },

  // libp2p multiaddrs this node listens on. Default binds all interfaces on an
  // OS-assigned TCP port.
  listen_addrs: { type: 'string[]', default: ['/ip4/0.0.0.0/tcp/0'] },

  // libp2p multiaddrs of bootstrap peers to dial on startup. Empty = isolated /
  // first node.
  bootstrap_peers: { type: 'string[]', default: [] },

  // Which roles this node performs. ALL default false — a node opts in explicitly.
  roles: {
    type: 'object',
    fields: {
      validate: { type: 'boolean', default: false }, // participate in xpc validation
      storage: { type: 'boolean', default: false }, // hold ledger/blob storage
      compute: { type: 'boolean', default: false }, // run compute tasks
      relay: { type: 'boolean', default: false }, // relay traffic for other peers
      lead: { type: 'boolean', default: false }, // act as a lead/coordinator node
    },
  },

  // Hard resource ceilings the daemon enforces per role (A5b+ enforces; defined
  // here so the surface is stable). All are non-negative numbers.
  resource_caps: {
    type: 'object',
    fields: {
      disk_mb: { type: 'number', default: 1024 }, // max disk for the storage role
      compute_cpu_ms: { type: 'number', default: 10000 }, // max CPU ms per compute task
      compute_mem_mb: { type: 'number', default: 512 }, // max memory per compute task
    },
  },
};

/** Ordered list of top-level field names in the schema. */
export const NODE_CONFIG_FIELDS = Object.keys(NODE_CONFIG_SCHEMA);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The canonical default config — what a fresh node boots from. Built from the
 * schema so it can never drift from it. Note `identity_path` defaults to '' and
 * is required, so DEFAULT_CONFIG is a template: a real node must set it.
 * @returns {object}
 */
export function defaultConfig() {
  const out = {};
  for (const [key, spec] of Object.entries(NODE_CONFIG_SCHEMA)) {
    if (spec.type === 'object') {
      out[key] = {};
      for (const [fk, fspec] of Object.entries(spec.fields)) out[key][fk] = clone(fspec.default);
    } else {
      out[key] = clone(spec.default);
    }
  }
  return out;
}

function clone(v) {
  return Array.isArray(v) ? [...v] : isPlainObject(v) ? { ...v } : v;
}

function checkType(type, value) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string[]':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
}

/**
 * Validate a config object against the schema.
 * @param {any} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = [];
  if (!isPlainObject(config)) {
    return { valid: false, errors: ['config must be an object'] };
  }

  // reject unknown top-level keys (typo guard)
  for (const key of Object.keys(config)) {
    if (!(key in NODE_CONFIG_SCHEMA)) errors.push(`unknown field: ${key}`);
  }

  for (const [key, spec] of Object.entries(NODE_CONFIG_SCHEMA)) {
    const present = key in config;
    const value = config[key];

    if (!present) {
      if (spec.required) errors.push(`missing required field: ${key}`);
      continue;
    }

    if (!checkType(spec.type, value)) {
      errors.push(`field ${key} must be ${spec.type}`);
      continue;
    }

    if (spec.required && spec.type === 'string' && value.trim() === '') {
      errors.push(`field ${key} is required and must not be empty`);
    }

    if (spec.type === 'object') {
      for (const sub of Object.keys(value)) {
        if (!(sub in spec.fields)) errors.push(`unknown field: ${key}.${sub}`);
      }
      for (const [fk, fspec] of Object.entries(spec.fields)) {
        if (!(fk in value)) continue; // sub-fields are optional; defaults fill them
        if (!checkType(fspec.type, value[fk])) {
          errors.push(`field ${key}.${fk} must be ${fspec.type}`);
        } else if (fspec.type === 'number' && value[fk] < 0) {
          errors.push(`field ${key}.${fk} must be >= 0`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge a partial config over the defaults (one level deep for `roles` /
 * `resource_caps`). Does not validate — call validateConfig separately.
 * @param {object} [partial]
 * @returns {object}
 */
export function normalizeConfig(partial = {}) {
  const base = defaultConfig();
  const out = { ...base, ...partial };
  for (const key of ['roles', 'resource_caps']) {
    out[key] = { ...base[key], ...(isPlainObject(partial[key]) ? partial[key] : {}) };
  }
  return out;
}

/**
 * Load, normalize, and validate a config file. Throws with all errors joined if
 * invalid.
 * @param {string} path
 * @returns {object} the normalized, validated config
 */
export function loadConfig(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  const normalized = normalizeConfig(raw);
  const { valid, errors } = validateConfig(normalized);
  if (!valid) throw new Error(`invalid xmbl-node config at ${path}: ${errors.join('; ')}`);
  return normalized;
}
