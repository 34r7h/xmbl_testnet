export class StateDiff {
  constructor(txId, changes) {
    this.txId = txId;
    this.timestamp = Date.now();
    this.changes = changes; // key -> new value
  }

  apply(state) {
    const newState = { ...state };
    for (const [key, value] of Object.entries(this.changes)) {
      newState[key] = value;
    }
    return newState;
  }

  static merge(diffs) {
    const merged = {};
    for (const diff of diffs) {
      Object.assign(merged, diff.changes);
    }
    return new StateDiff('merged', merged);
  }

  serialize() {
    return JSON.stringify({
      txId: this.txId,
      timestamp: this.timestamp,
      changes: this.changes
    });
  }

  static deserialize(data) {
    const obj = JSON.parse(data);
    return new StateDiff(obj.txId, obj.changes);
  }
}

