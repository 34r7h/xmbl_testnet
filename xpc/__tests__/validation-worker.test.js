import { describe, test, expect, beforeEach } from '@jest/globals';
import { ConsensusWorkflow } from '../src/workflow.js';
import { ValidationWorker } from '../src/validation-worker.js';

const MY_ADDRESS = 'xmbl1worker-own-address';

// The worker's task-created handler is async, but EventEmitter#emit does not
// await async listeners — submitTransaction() can resolve before the worker
// finishes claiming/reporting. Wait on the worker's own completion event
// instead of a fixed sleep wherever we expect one to fire.
function waitForEvent(emitter, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('ValidationWorker (E1)', () => {
  let workflow;
  let worker;

  beforeEach(() => {
    workflow = new ConsensusWorkflow();
  });

  test('constructor requires a workflow and identityAddress', () => {
    expect(() => new ValidationWorker({})).toThrow();
    expect(() => new ValidationWorker({ workflow })).toThrow();
    expect(() => new ValidationWorker({ identityAddress: MY_ADDRESS })).toThrow();
  });

  test('E1a: claims only tasks addressed to its own identity, never another leaderId', async () => {
    worker = new ValidationWorker({ workflow, identityAddress: MY_ADDRESS });
    worker.start();

    const reported = [];
    worker.on('validation:reported', (e) => reported.push(e));
    const reportedP = waitForEvent(worker, 'validation:reported');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction(MY_ADDRESS, tx);
    await reportedP;

    // Only the task whose leaderId is MY_ADDRESS should have been reported —
    // the other two fallback-leader tasks ('leader2'/'leader3' slots) must
    // stay untouched by this worker.
    expect(reported.length).toBe(1);
    expect(reported[0].rawTxId).toBe(rawTxId);

    const allTasks = workflow.getValidationTasks(rawTxId);
    const otherTasks = allTasks.filter((t) => t.leaderId !== MY_ADDRESS);
    otherTasks.forEach((t) => {
      const stored = workflow.taskManager.getTask(t.leaderId, t.task);
      expect(stored.complete).toBe(false);
    });
  });

  test('E1a: never double-processes the same task if the creation event fires twice', async () => {
    worker = new ValidationWorker({ workflow, identityAddress: MY_ADDRESS });
    worker.start();

    let reportedCount = 0;
    worker.on('validation:reported', () => { reportedCount += 1; });
    const firstReport = waitForEvent(worker, 'validation:reported');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction(MY_ADDRESS, tx);
    await firstReport;

    // Re-emit the same creation event manually (defensive: simulates a
    // duplicate delivery) — the worker must not re-claim/re-report it.
    const tasks = workflow.getValidationTasks(rawTxId).filter((t) => t.leaderId === MY_ADDRESS);
    workflow.emit('validation_tasks:created', { rawTxId, tasks });
    await new Promise((r) => setTimeout(r, 50));

    expect(reportedCount).toBe(1);
  });

  test('E1b: reports correct case (valid tx) via workflow.completeValidation', async () => {
    worker = new ValidationWorker({ workflow, identityAddress: MY_ADDRESS });
    worker.start();

    const rejected = [];
    const reported = [];
    worker.on('validation:rejected', (e) => rejected.push(e));
    worker.on('validation:reported', (e) => reported.push(e));
    const reportedP = waitForEvent(worker, 'validation:reported');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    await workflow.submitTransaction(MY_ADDRESS, tx);
    await reportedP;

    expect(reported.length).toBe(1);
    expect(rejected.length).toBe(0);
  });

  test('E1b: reports incorrect case when completeValidation rejects (invalid signature)', async () => {
    // xid present + a rawTx with a sig/from + a public-key lookup that always
    // resolves makes completeValidation's signature check run against a
    // bogus signature, which fails closed -> completeValidation returns false.
    workflow.xid = {};
    workflow.getPublicKeyByAddress = () => 'some-public-key';

    worker = new ValidationWorker({ workflow, identityAddress: MY_ADDRESS });
    worker.start();

    const rejected = [];
    const reported = [];
    worker.on('validation:rejected', (e) => rejected.push(e));
    worker.on('validation:reported', (e) => reported.push(e));
    const rejectedP = waitForEvent(worker, 'validation:rejected');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice', sig: 'not-a-real-signature' };
    await workflow.submitTransaction(MY_ADDRESS, tx);
    await rejectedP;

    expect(rejected.length).toBe(1);
    expect(reported.length).toBe(0);
  });

  test('E1c: increments the caller-provided counter only on a genuine pass', async () => {
    let count = 0;
    worker = new ValidationWorker({
      workflow,
      identityAddress: MY_ADDRESS,
      onValidationCompleted: () => { count += 1; },
    });
    worker.start();
    const reportedP = waitForEvent(worker, 'validation:reported');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    await workflow.submitTransaction(MY_ADDRESS, tx);
    await reportedP;

    expect(count).toBe(1);
  });

  test('E1c: onValidationCompleted also reports count/required (the "N/3" progress label)', async () => {
    let payload = null;
    worker = new ValidationWorker({
      workflow,
      identityAddress: MY_ADDRESS,
      onValidationCompleted: (p) => { payload = p; },
    });
    worker.start();
    const reportedP = waitForEvent(worker, 'validation:reported');

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    await workflow.submitTransaction(MY_ADDRESS, tx);
    await reportedP;

    expect(payload).not.toBeNull();
    expect(payload.count).toBe(1);
    expect(payload.required).toBe(workflow.requiredValidations);
  });

  test('stop() detaches the listener so no further tasks are claimed', async () => {
    let count = 0;
    worker = new ValidationWorker({
      workflow,
      identityAddress: MY_ADDRESS,
      onValidationCompleted: () => { count += 1; },
    });
    worker.start();
    worker.stop();

    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    await workflow.submitTransaction(MY_ADDRESS, tx);

    expect(count).toBe(0);
  });
});
