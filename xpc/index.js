import { ConsensusWorkflow } from './src/workflow.js';
import { LeaderElection } from './src/leader-election.js';
import { Mempool } from './src/mempool.js';
import { ValidationTaskManager } from './src/validation-tasks.js';
import { ConsensusGossip } from './src/gossip.js';

export {
  ConsensusWorkflow,
  LeaderElection,
  Mempool,
  ValidationTaskManager,
  ConsensusGossip
};

const port = process.env.PORT || 3004;

console.log(`XPC (XMBL Peer Consensus) starting on port ${port}`);

// Module implementation here
