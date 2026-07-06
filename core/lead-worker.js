/**
 * Lead-role batch sealer (E4). Opt-in via roles.lead. Two jobs, both gaps
 * the daemon otherwise leaves unfilled:
 *
 * 1. tx:processing -> finalizeTransaction. Nothing in the production daemon
 *    ever calls ConsensusWorkflow.finalizeTransaction today — the only
 *    existing caller is xsim's simulator (its "auto-finalize" listener),
 *    which stands in for a leader in local dev sims. Without a lead role
 *    calling it on the real daemon, a tx sits in "processing" forever. This
 *    IS the leader's job in a leader-based consensus, so the lead role does
 *    it here.
 *
 * 2. tx:finalized -> xclt.addSealedBatch. D3a's own docs called out
 *    "leaders sealing batches over consensus" as the deferred follow-up to
 *    its deterministic face-membership seal, gated on G2b (floodsub, now
 *    merged). Routed via ConsensusWorkflow's batchSealer constructor option
 *    (see xpc/src/workflow.js) so it REPLACES the legacy per-tx
 *    xclt.addTransaction call rather than double-writing alongside it.
 */
export class LeadWorker {
  constructor({ xclt, onBatchSealed = null } = {}) {
    if (!xclt) {
      throw new Error('LeadWorker requires xclt');
    }
    this.xclt = xclt;
    this.onBatchSealed = onBatchSealed;
    this.workflow = null;
    this._onProcessing = this._onTxProcessing.bind(this);
  }

  /**
   * Attach to a ConsensusWorkflow's tx:processing event. Separate from the
   * constructor because core/index.js must construct this worker BEFORE
   * ConsensusWorkflow (its batchSealer option needs handleFinalizedTx bound
   * at construction time) — so the workflow is only available afterward.
   * @param {import('xpc').ConsensusWorkflow} workflow
   */
  start(workflow) {
    if (!workflow) {
      throw new Error('LeadWorker.start requires a workflow');
    }
    if (this.workflow) return; // already started
    this.workflow = workflow;
    this.workflow.on('tx:processing', this._onProcessing);
  }

  stop() {
    if (!this.workflow) return;
    this.workflow.off('tx:processing', this._onProcessing);
    this.workflow = null;
  }

  async _onTxProcessing({ txId }) {
    try {
      await this.workflow.finalizeTransaction(txId);
    } catch (error) {
      // finalizeTransaction rejecting must never crash the daemon.
      console.error('[LeadWorker] finalizeTransaction failed:', error);
    }
  }

  /**
   * Called once per finalized transaction (wired as ConsensusWorkflow's
   * batchSealer hook — see xpc/src/workflow.js). Forwards immediately to
   * addSealedBatch: xclt's own membership pool (Ledger._membershipPool)
   * accumulates across calls and only actually seals a face once 9 are
   * pooled, so passing one tx at a time is correct — sealReadyFaces() is a
   * no-op (0 sealed, tx stays pooled) until the 9th arrives.
   * @param {object} txData
   * @returns {Promise<{sealedFaces: number, pooled: number}>}
   */
  async handleFinalizedTx(txData) {
    const result = await this.xclt.addSealedBatch([txData]);
    if (result.sealedFaces > 0 && typeof this.onBatchSealed === 'function') {
      this.onBatchSealed(result.sealedFaces);
    }
    return result;
  }
}
