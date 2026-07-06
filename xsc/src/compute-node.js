import { ComputeRuntime } from './compute.js';

/**
 * Compute role (E3): accepts + executes compute jobs under this node's own
 * resource_caps (compute_cpu_ms/compute_mem_mb, A5a), gated on roles.compute.
 * Mirrors StorageNode's shard-request wiring: an xn pubsub topic pair for
 * network-submitted jobs, plus a directly-callable runJob() for anything
 * driving it in-process (control socket, tests).
 *
 * Cap enforcement is delegated entirely to ComputeRuntime.execute — it
 * already throws on both an over-declared WASM memory export and an
 * over-time execution, so "over-cap is refused" falls out of the existing,
 * already-tested runtime rather than duplicating the check here.
 */
export class ComputeNode {
  constructor(options = {}) {
    this.maxTime = options.maxTime ?? 10000;
    this.maxMemory = options.maxMemory ?? 512 * 1024 * 1024;
    this.runtime = options.runtime || new ComputeRuntime({ maxMemory: this.maxMemory, maxTime: this.maxTime });
    // Cumulative count of jobs that completed WITHIN caps (metrics: compute_jobs_run).
    // A refused (over-cap or failed) job is never counted.
    this.computeJobsRun = 0;

    // Integration: xn for P2P job submission
    this.xn = options.xn || null;
    this.requestTopic = options.requestTopic || 'compute:job_request';
    this.responseTopic = options.responseTopic || 'compute:job_response';

    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.requestTopic).catch(() => {});
      this.xn.on(`message:${this.requestTopic}`, (data) => {
        this._handleJobRequest(data);
      });
    }
  }

  async _handleJobRequest(data) {
    if (!data || !data.jobId) return;
    const response = await this.runJob(data);
    if (this.xn && this.xn.started) {
      try {
        await this.xn.publish(this.responseTopic, response);
      } catch (error) {
        // Silently handle network errors
      }
    }
  }

  /**
   * Run a compute job under this node's resource_caps.
   * @param {{jobId: string, wasmCode: Uint8Array|string, functionName: string, args?: any[]}} job
   * @returns {Promise<{jobId: string, ok: boolean, result?: any, error?: string}>}
   */
  async runJob(job) {
    const { jobId, wasmCode, functionName, args = [] } = job || {};
    try {
      if (!wasmCode || !functionName) {
        throw new Error('runJob requires wasmCode and functionName');
      }
      const code = typeof wasmCode === 'string' ? Buffer.from(wasmCode, 'base64') : wasmCode;
      const result = await this.runtime.execute(code, functionName, args);
      this.computeJobsRun += 1;
      return { jobId, ok: true, result };
    } catch (error) {
      // Over-cap (memory/time limit exceeded) or any other execution failure
      // is a clean refusal, never a thrown error and never counted.
      return { jobId, ok: false, error: error.message };
    }
  }
}
