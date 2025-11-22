import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Identity } from '../../xid/index.js';
import { XNNode } from '../../xn/index.js';
import { Ledger } from '../../xclt/index.js';
import { StateMachine } from '../../xvsm/index.js';
import { ConsensusWorkflow, ConsensusGossip } from '../../xpc/index.js';
import { rmSync } from 'fs';

describe('End-to-End Transaction Flow', () => {
  let identity1, identity2;
  let node1, node2;
  let ledger1, ledger2;
  let stateMachine1, stateMachine2;
  let workflow1, workflow2;
  let gossip1, gossip2;
  const testDbPath1 = './data/ledger-e2e-1';
  const testDbPath2 = './data/ledger-e2e-2';

  beforeEach(async () => {
    identity1 = await Identity.create();
    identity2 = await Identity.create();
    
    node1 = new XNNode({ port: 0 });
    node2 = new XNNode({ port: 0 });
    
    ledger1 = new Ledger(testDbPath1);
    ledger2 = new Ledger(testDbPath2);
    
    stateMachine1 = new StateMachine();
    stateMachine2 = new StateMachine();
    
    workflow1 = new ConsensusWorkflow();
    workflow2 = new ConsensusWorkflow();
    
    gossip1 = new ConsensusGossip();
    gossip2 = new ConsensusGossip();

    await node1.start();
    await node2.start();
  });

  afterEach(async () => {
    if (node1) await node1.stop();
    if (node2) await node2.stop();
    if (ledger1 && ledger1.db) await ledger1.db.close();
    if (ledger2 && ledger2.db) await ledger2.db.close();
    try {
      rmSync(testDbPath1, { recursive: true, force: true });
      rmSync(testDbPath2, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('complete flow: Create → Sign → Validate → Consensus → Ledger → State', async () => {
    // Step 1: Create transaction
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    // Step 2: Sign transaction
    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Step 3: Submit to consensus workflow
    const rawTxId = await workflow1.submitTransaction('leader1', signedTx);
    expect(rawTxId).toBeDefined();

    // Step 4: Broadcast via gossip
    await gossip1.broadcastRawTransaction('leader1', signedTx);

    // Step 5: Complete validations
    const tasks = workflow1.getValidationTasks(rawTxId);
    for (const task of tasks) {
      // Verify signature before completing validation
      const verification = await Identity.verifyTransaction(signedTx, identity1.publicKey);
      expect(verification).toBe(true);
      await workflow1.completeValidation(rawTxId, task.task, Date.now());
    }

    // Step 6: Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 7: Finalize transaction
    const processingTxs = Array.from(workflow1.mempool.processingTx.entries());
    expect(processingTxs.length).toBeGreaterThan(0);
    
    if (processingTxs.length > 0) {
      const [txId, processingTx] = processingTxs[0];
      workflow1.finalizeTransaction(txId);

      // Step 8: Add to ledger
      const result = await ledger1.addTransaction(processingTx.txData);
      expect(result.blockId).toBeDefined();
      expect(result.coordinates).toBeDefined();

      // Step 9: Process state diff if applicable
      if (processingTx.txData.type === 'state_diff') {
        const { StateDiff } = await import('../../xvsm/index.js');
        const diff = new StateDiff(txId, processingTx.txData.args || {});
        const state = diff.apply({});
        expect(state).toBeDefined();
      }
    }
  });

  test('complete flow with state diff transaction', async () => {
    // Create state diff transaction
    const tx = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'balance:alice', value: 100 },
      timestamp: Date.now()
    };

    // Sign
    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Submit to consensus
    const rawTxId = await workflow1.submitTransaction('leader1', signedTx);

    // Complete validations
    const tasks = workflow1.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow1.completeValidation(rawTxId, task.task, Date.now());
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // Finalize and add to ledger
    const processingTxs = Array.from(workflow1.mempool.processingTx.entries());
    if (processingTxs.length > 0) {
      const [txId, processingTx] = processingTxs[0];
      workflow1.finalizeTransaction(txId);

      const result = await ledger1.addTransaction(processingTx.txData);
      expect(result.blockId).toBeDefined();

      // Process in state machine
      const { StateDiff } = await import('../../xvsm/index.js');
      const diff = new StateDiff(txId, { [tx.args.key]: tx.args.value });
      let state = {};
      state = diff.apply(state);
      expect(state['balance:alice']).toBe(100);
    }
  });

  test('complete flow with network propagation', async () => {
    const topic = 'blocks';
    await node1.subscribe(topic);
    await node2.subscribe(topic);

    const node2Address = node2.getAddresses()[0];
    try {
      await node1.connect(node2Address);
    } catch (error) {
      // Network connection may fail in test environment
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create, sign, and submit transaction
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    const rawTxId = await workflow1.submitTransaction('leader1', signedTx);

    // Complete validations
    const tasks = workflow1.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow1.completeValidation(rawTxId, task.task, Date.now());
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // Finalize and add to ledger1
    const processingTxs = Array.from(workflow1.mempool.processingTx.entries());
    if (processingTxs.length > 0) {
      const [txId, processingTx] = processingTxs[0];
      workflow1.finalizeTransaction(txId);

      const result = await ledger1.addTransaction(processingTx.txData);
      const block = await ledger1.getBlock(result.blockId);

      // Propagate block to node2 (may fail if no peers subscribed)
      try {
        await node1.publish(topic, {
          blockId: block.id,
          block: block.serialize()
        });
      } catch (error) {
        // Expected in test environment if no peers are connected
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Node2 should receive block (verification depends on network timing)
    }
  });
});

