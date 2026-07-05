#!/usr/bin/env node
// Operational entry point: ensure an xid identity exists for one agent, then print
// ONLY the broker-safe public record (agent_id, address, public_key, created).
// The plaintext secret is never printed and never leaves the box.
//
// Usage: node xid/src/agent-keystore-cli.js <agent_id>
import { ensureAgentIdentity } from './agent-keystore.js';

const agentId = process.argv[2];
if (!agentId) {
  console.error('usage: agent-keystore-cli <agent_id>');
  process.exit(1);
}

try {
  const res = await ensureAgentIdentity(agentId);
  console.log(JSON.stringify(
    { agent_id: agentId, address: res.address, public_key: res.public_key, created: res.created },
    null,
    2,
  ));
} catch (err) {
  console.error(`agent-keystore-cli: ${err.message}`);
  process.exit(1);
}
