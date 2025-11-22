import { StateDiff } from './state-diff.js';

export class StateAssembler {
  constructor() {
    this.baseState = {};
  }

  assemble(diffs) {
    // Sort diffs by timestamp
    const sortedDiffs = diffs.sort((a, b) => a.timestamp - b.timestamp);
    
    // Apply diffs in order
    let state = { ...this.baseState };
    for (const diff of sortedDiffs) {
      state = diff.apply(state);
    }
    
    const diffCount = diffs.length;
    console.log(`State assembled from ${diffCount} diffs`);
    
    return state;
  }

  setBaseState(state) {
    this.baseState = state;
  }

  getStateAtTimestamp(diffs, timestamp) {
    const relevantDiffs = diffs.filter(d => d.timestamp <= timestamp);
    return this.assemble(relevantDiffs);
  }
}

