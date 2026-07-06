import { describe, test, expect } from '@jest/globals';
import { ComputeNode } from '../src/compute-node.js';

// Minimal WASM module exporting "add": (i32, i32) -> i32, local.get 0, local.get 1, i32.add.
// Same fixture as compute.test.js, kept in sync deliberately (compute-node.js
// delegates cap enforcement entirely to ComputeRuntime — no separate check to
// diverge from).
const ADD_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x07,
  0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02,
  0x01, 0x00,
  0x07, 0x07,
  0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09,
  0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

describe('ComputeNode (E3)', () => {
  test('runs a job within caps and increments compute_jobs_run', async () => {
    const node = new ComputeNode({ maxMemory: 64 * 1024 * 1024, maxTime: 10000 });
    const response = await node.runJob({
      jobId: 'job-1',
      wasmCode: ADD_WASM,
      functionName: 'add',
      args: [2, 3],
    });

    expect(response).toEqual({ jobId: 'job-1', ok: true, result: 5 });
    expect(node.computeJobsRun).toBe(1);
  });

  test('accepts base64-encoded wasmCode (network transport shape)', async () => {
    const node = new ComputeNode();
    const response = await node.runJob({
      jobId: 'job-b64',
      wasmCode: Buffer.from(ADD_WASM).toString('base64'),
      functionName: 'add',
      args: [10, 20],
    });

    expect(response).toEqual({ jobId: 'job-b64', ok: true, result: 30 });
  });

  test('over-cap (time) job is refused and does NOT increment the counter', async () => {
    // maxTime: -1 forces the elapsed-time check to fail deterministically
    // regardless of actual execution speed (see compute.js's post-race
    // elapsed check) — this is the "over-cap" path, not a flaky timing race.
    const node = new ComputeNode({ maxTime: -1 });
    const response = await node.runJob({
      jobId: 'job-over-time',
      wasmCode: ADD_WASM,
      functionName: 'add',
      args: [1, 1],
    });

    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/time limit/i);
    expect(node.computeJobsRun).toBe(0);
  });

  test('a job for an unknown function is refused, not thrown', async () => {
    const node = new ComputeNode();
    const response = await node.runJob({
      jobId: 'job-missing-fn',
      wasmCode: ADD_WASM,
      functionName: 'does_not_exist',
      args: [],
    });

    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/not found/i);
    expect(node.computeJobsRun).toBe(0);
  });

  test('runJob rejects a malformed job cleanly instead of throwing', async () => {
    const node = new ComputeNode();
    const response = await node.runJob({ jobId: 'job-malformed' });
    expect(response).toEqual({ jobId: 'job-malformed', ok: false, error: expect.any(String) });
  });

  test('multiple successful jobs accumulate the counter', async () => {
    const node = new ComputeNode();
    await node.runJob({ jobId: 'a', wasmCode: ADD_WASM, functionName: 'add', args: [1, 1] });
    await node.runJob({ jobId: 'b', wasmCode: ADD_WASM, functionName: 'add', args: [2, 2] });
    await node.runJob({ jobId: 'c', wasmCode: ADD_WASM, functionName: 'add', args: [3, 3] });
    expect(node.computeJobsRun).toBe(3);
  });

  describe('xn topic wiring', () => {
    function makeFakeXn() {
      const handlers = new Map();
      return {
        started: true,
        subscribed: [],
        published: [],
        subscribe(topic) { this.subscribed.push(topic); return Promise.resolve(); },
        on(event, handler) { handlers.set(event, handler); },
        publish(topic, data) { this.published.push({ topic, data }); return Promise.resolve(); },
        _emit(event, data) { handlers.get(event)?.(data); },
      };
    }

    test('subscribes to the job-request topic when xn is already started', () => {
      const xn = makeFakeXn();
      const node = new ComputeNode({ xn });
      expect(xn.subscribed).toContain('compute:job_request');
    });

    test('a job_request message runs the job and publishes a job_response', async () => {
      const xn = makeFakeXn();
      const node = new ComputeNode({ xn });

      xn._emit('message:compute:job_request', {
        jobId: 'net-job-1',
        wasmCode: ADD_WASM,
        functionName: 'add',
        args: [4, 5],
      });
      // _handleJobRequest is async — let its promise chain settle.
      await new Promise((r) => setTimeout(r, 20));

      expect(xn.published).toHaveLength(1);
      expect(xn.published[0]).toEqual({
        topic: 'compute:job_response',
        data: { jobId: 'net-job-1', ok: true, result: 9 },
      });
      expect(node.computeJobsRun).toBe(1);
    });

    test('ignores a job_request message with no jobId', async () => {
      const xn = makeFakeXn();
      const node = new ComputeNode({ xn });

      xn._emit('message:compute:job_request', { wasmCode: ADD_WASM, functionName: 'add' });
      await new Promise((r) => setTimeout(r, 20));

      expect(xn.published).toHaveLength(0);
    });
  });
});
