import { describe, test, expect, beforeEach } from '@jest/globals';
import { Identity } from '../../xid/index.js';
import { ConsensusWorkflow } from '../../xpc/index.js';

describe('Integration: xpc + xid (Signature Verification in Consensus)', () => {
  let workflow;
  let identity1, identity2, identity3;

  beforeEach(async () => {
    workflow = new ConsensusWorkflow();
    identity1 = await Identity.create();
    identity2 = await Identity.create();
    identity3 = await Identity.create();
  });

  test('should verify signature before processing transaction', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    // Sign transaction
    const signedTx = await identity1.signTransaction(tx);

    // Verify signature
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Submit to consensus workflow
    const rawTxId = await workflow.submitTransaction('leader1', signedTx);
    expect(rawTxId).toBeDefined();
  });

  test('should reject transaction with invalid signature', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    
    // Tamper with signature
    signedTx.sig = 'invalid_signature';

    // Verify should fail
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(false);

    // Should not process invalid transaction
    // (In real system, would be rejected before submission)
  });

  test('should verify signatures for multiple validators', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);

    // Multiple validators verify
    const verify1 = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    const verify2 = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    const verify3 = await Identity.verifyTransaction(signedTx, identity1.publicKey);

    expect(verify1).toBe(true);
    expect(verify2).toBe(true);
    expect(verify3).toBe(true);

    // Submit and complete validations
    const rawTxId = await workflow.submitTransaction('leader1', signedTx);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task, Date.now());
    }
  });

  test('should handle validation with signature verification', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    const rawTxId = await workflow.submitTransaction('leader1', signedTx);

    // Validators verify signature before completing validation
    const tasks = workflow.getValidationTasks(rawTxId);
    expect(tasks.length).toBeGreaterThan(0);

    // Each validator verifies signature
    for (const task of tasks) {
      // In real system, validator would verify signature here
      const verification = await Identity.verifyTransaction(signedTx, identity1.publicKey);
      expect(verification).toBe(true);
      
      // Complete validation with signature proof
      await workflow.completeValidation(rawTxId, task.task, Date.now(), signedTx.sig);
    }
  });

  test('edge case: transaction modified after signing', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    
    // Modify transaction after signing
    signedTx.amount = 200;

    // Verification should fail
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(false);
  });

  test('edge case: wrong public key for verification', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);

    // Verify with wrong public key
    const isValid = await Identity.verifyTransaction(signedTx, identity2.publicKey);
    expect(isValid).toBe(false);
  });
});





