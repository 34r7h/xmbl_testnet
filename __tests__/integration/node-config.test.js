import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  NODE_CONFIG_SCHEMA,
  NODE_CONFIG_FIELDS,
  defaultConfig,
  validateConfig,
  normalizeConfig,
  loadConfig,
} from '../../core/node-config.js';

const examplePath = fileURLToPath(new URL('../../config.node.example.json', import.meta.url));
const docPath = fileURLToPath(new URL('../../docs/node-config.md', import.meta.url));

const roleFields = Object.keys(NODE_CONFIG_SCHEMA.roles.fields);
const capFields = Object.keys(NODE_CONFIG_SCHEMA.resource_caps.fields);

describe('xmbl-node config schema', () => {
  it('the canonical config.example.json validates against the schema', () => {
    const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    expect(validateConfig(example)).toEqual({ valid: true, errors: [] });
  });

  it('all roles default to false', () => {
    const cfg = defaultConfig();
    for (const role of roleFields) expect(cfg.roles[role]).toBe(false);
  });

  it('the defaults are valid once an identity_path is supplied', () => {
    // identity_path is the only required-but-defaultless field, so defaultConfig()
    // is a template: valid in every other respect. Proving that means the default
    // roles/caps/addrs a fresh node boots from are themselves valid.
    const bare = defaultConfig();
    expect(validateConfig(bare)).toEqual({
      valid: false,
      errors: ['field identity_path is required and must not be empty'],
    });
    const booted = { ...bare, identity_path: '/tmp/agents/x/xmbl.json' };
    expect(validateConfig(booted).valid).toBe(true);
  });

  it('loadConfig fills missing sub-fields from defaults and returns a valid config', () => {
    const cfg = loadConfig(examplePath);
    expect(cfg.resource_caps.disk_mb).toBeGreaterThanOrEqual(0);
    // roles absent from a partial are still fully populated
    const norm = normalizeConfig({ identity_path: '/x', roles: { validate: true } });
    for (const role of roleFields) expect(typeof norm.roles[role]).toBe('boolean');
    expect(norm.roles.validate).toBe(true);
  });

  describe('validation rejects malformed configs', () => {
    const base = () => ({ ...defaultConfig(), identity_path: '/x/xmbl.json' });

    it('unknown top-level key', () => {
      const r = validateConfig({ ...base(), listen_port: 4737 });
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('unknown field: listen_port');
    });

    it('unknown role sub-key', () => {
      const cfg = base();
      cfg.roles = { ...cfg.roles, superuser: true };
      const r = validateConfig(cfg);
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('unknown field: roles.superuser');
    });

    it('wrong type for listen_addrs', () => {
      expect(validateConfig({ ...base(), listen_addrs: '/ip4/0.0.0.0/tcp/0' }).valid).toBe(false);
    });

    it('non-boolean role', () => {
      const cfg = base();
      cfg.roles = { ...cfg.roles, validate: 'yes' };
      expect(validateConfig(cfg).errors).toContain('field roles.validate must be boolean');
    });

    it('negative resource cap', () => {
      const cfg = base();
      cfg.resource_caps = { ...cfg.resource_caps, disk_mb: -1 };
      expect(validateConfig(cfg).errors).toContain('field resource_caps.disk_mb must be >= 0');
    });

    it('missing identity_path', () => {
      const cfg = base();
      delete cfg.identity_path;
      expect(validateConfig(cfg).errors).toContain('missing required field: identity_path');
    });
  });

  describe('docs/node-config.md stays in lock-step with the schema', () => {
    const doc = fs.readFileSync(docPath, 'utf8');

    it('documented top-level fields === schema top-level fields (both directions)', () => {
      const documented = [...doc.matchAll(/^### `(\w+)`/gm)].map((m) => m[1]);
      expect(new Set(documented)).toEqual(new Set(NODE_CONFIG_FIELDS));
    });

    it('documented sub-fields (table cells) === schema roles + resource_caps sub-fields', () => {
      // first backticked cell of each table row, e.g. "| `validate` | `false` | ... |"
      const cells = [...doc.matchAll(/^\s*\|\s*`(\w+)`\s*\|/gm)].map((m) => m[1]);
      expect(new Set(cells)).toEqual(new Set([...roleFields, ...capFields]));
    });
  });
});
