#!/usr/bin/env node
// E4 acceptance: "a lead-role node takes part in batch sealing." Drives the
// REAL XMBLCore (real WASM-backed xid signing, real LevelDB-backed xclt/xpc,
// the actual roles.lead-gated LeadWorker) end-to-end: submit 9 real
// transactions, complete each one's validations, and confirm the lead role
// finalizes + seals them into a real face/cube in the ledger.
//
// SCOPE NOTE: submitTransaction's own tx only gets ONE real validation from
// this node's own ValidationWorker (user-as-validator, E1) — reaching the
// consensus workflow's requiredValidations=3 needs 2 more validators, which
// in production means other peers on a real multi-node swarm. Docker was
// not available in this environment (same gap noted in G2b/E1/E3/E5's own
// PRs) to run the full docker-compose dev swarm from docs/dev-swarm.md, so
// this check supplies the other 2 validations directly via
// core.xpc.completeValidation (exactly what a second/third validator node
// would call over the real network) — everything else (signing, ledger
// writes, face sealing, the LeadWorker itself) is the real, unmocked
// production code path. This is not a full multi-node proof; it is the
// closest substitute without Docker, following this project's established
// pattern for that specific gap.
import fs from 'fs';
import os from 'os';
import path from 'path';

const CHILD_HANDOFF_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.HANDOFF_XMBL_MASTER_KEY = CHILD_HANDOFF_MASTER_KEY;

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function run() {
  const { XMBLCore } = await import('../core/index.js');
  const { ensureIdentityAtPath, loadIdentityAtPath } = await import('../xid/index.js');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-lead-check-'));
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const identityPath = path.join(tmp, 'agents', 'testnode', 'xmbl.json');

  const core = new XMBLCore({
    network: { addresses: ['/ip4/127.0.0.1/tcp/0'] },
    ledger: { dbPath: path.join(dataDir, 'ledger') },
    stateMachine: { dbPath: path.join(dataDir, 'xvsm'), totalShards: 4 },
    consensus: { dbPath: path.join(dataDir, 'xpc') },
    storage: { dbPath: path.join(dataDir, 'storage'), capacity: 1024 * 1024 * 1024 },
    roles: { validate: true, storage: false, compute: false, relay: false, lead: true },
  });

  await ensureIdentityAtPath(identityPath);
  const identity = await loadIdentityAtPath(identityPath);
  core.setIdentity(identity);
  await core.start();

  assert(core.leadWorker !== null, 'roles.lead:true constructs a LeadWorker');
  assert(core.leadBatchesSealed === 0, 'leadBatchesSealed starts honestly at 0');

  const cubesBefore = core.xclt.cubes.size;

  // Submit 9 real transactions; for each, this node's own ValidationWorker
  // supplies validation #1 (E1, user-as-validator) — supply 2 more directly
  // (see SCOPE NOTE above) to reach requiredValidations=3 and trigger
  // moveToProcessing -> (LeadWorker) finalizeTransaction -> (LeadWorker)
  // addSealedBatch.
  for (let i = 0; i < 9; i++) {
    const rawTxId = await core.submitTransaction({ type: 'utxo', to: `bob_${i}`, amount: i + 1 });
    // Give the async ValidationWorker a tick to claim + complete its own task.
    await new Promise((r) => setTimeout(r, 30));
    const tasks = core.xpc.getValidationTasks(rawTxId);
    const remaining = tasks.filter((t) => !t.complete);
    for (const [j, task] of remaining.entries()) {
      await core.xpc.completeValidation(rawTxId, task.task, 1000 + j, null, `sim-peer-${i}-${j}`);
    }
  }
  // Let every async finalize/seal chain (tx:processing -> finalizeTransaction
  // -> tx:finalized -> LeadWorker.handleFinalizedTx -> addSealedBatch) settle.
  await new Promise((r) => setTimeout(r, 300));

  assert(core.leadBatchesSealed >= 1, `leadBatchesSealed rose after 9 finalized txs (${core.leadBatchesSealed})`);
  assert(core.xclt.cubes.size > cubesBefore || core.xclt.pendingFaces.size > 0,
    'the ledger actually gained sealed-face/cube state (not just a counter)');
  assert(core.xclt._membershipPool.length === 0, 'the membership pool is fully drained (exactly 9 sealed)');

  await core.stop();
  console.log('\nPASS: a lead-role node finalizes its own processed txs and seals them into the ledger via addSealedBatch');
}

const hardTimeout = setTimeout(() => {
  console.error('\nFAIL: overall hard timeout (60s) exceeded');
  process.exit(1);
}, 60000);

run()
  .then(() => { clearTimeout(hardTimeout); process.exit(0); })
  .catch((e) => { clearTimeout(hardTimeout); console.error(`\nFAIL: ${e.message}`); console.error(e.stack); process.exit(1); });
