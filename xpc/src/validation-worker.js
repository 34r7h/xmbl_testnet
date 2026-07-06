import { EventEmitter } from 'events';

/**
 * user-as-validator (E1): a node's own worker loop that reacts to newly
 * created validation tasks, claims ONLY the ones addressed to its own
 * identity (never another leaderId's), runs the check by driving the real
 * completeValidation flow, and reports the result back — counting successes
 * for the caller (node metrics, E1c).
 */
export class ValidationWorker extends EventEmitter {
  constructor({ workflow, identityAddress, onValidationCompleted = null } = {}) {
    super();
    if (!workflow || !identityAddress) {
      throw new Error('ValidationWorker requires a workflow and identityAddress');
    }
    this.workflow = workflow;
    this.identityAddress = identityAddress;
    this.onValidationCompleted = onValidationCompleted;
    this.claimed = new Set(); // taskId -> already claimed, never double-process
    this.running = false;
    this._onCreated = this._onValidationTasksCreated.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.workflow.on('validation_tasks:created', this._onCreated);
  }

  stop() {
    if (!this.running) return;
    this.workflow.off('validation_tasks:created', this._onCreated);
    this.running = false;
  }

  // E1a: fetch + claim loop. Filter to tasks addressed to THIS identity only
  // — a task assigned to a different leaderId is never touched — and claim
  // atomically (the Set add happens before any await) so a task is never
  // processed twice even if the same rawTxId's creation event fires again.
  async _onValidationTasksCreated({ rawTxId, tasks }) {
    const myTasks = tasks.filter((t) => t.leaderId === this.identityAddress);
    for (const task of myTasks) {
      if (this.claimed.has(task.task)) continue;
      this.claimed.add(task.task);
      await this._runCheckAndReport(rawTxId, task);
    }
  }

  // E1b: run checks + report. The actual check (signature/address ownership)
  // already lives in workflow.completeValidation; this drives it for the
  // claimed task and reports pass/fail back into the xpc flow via its return
  // value, handling both the correct and incorrect cases.
  async _runCheckAndReport(rawTxId, task) {
    const passed = await this.workflow.completeValidation(
      rawTxId,
      task.task,
      null,
      null,
      this.identityAddress,
    );

    if (!passed) {
      this.emit('validation:rejected', { rawTxId, taskId: task.task, leaderId: this.identityAddress });
      return;
    }

    // E1c: count validations in node metrics — only on a genuine pass.
    if (typeof this.onValidationCompleted === 'function') {
      this.onValidationCompleted({ rawTxId, taskId: task.task });
    }
    this.emit('validation:reported', { rawTxId, taskId: task.task, leaderId: this.identityAddress });
  }
}
