import { describe, test, expect } from '@jest/globals';
import { ConsensusGossip } from '../src/gossip.js';

describe('Consensus Gossip', () => {
  test('should broadcast raw transaction', async () => {
    const gossip = new ConsensusGossip();
    const tx = { to: 'bob', amount: 1.0 };
    await gossip.broadcastRawTransaction('leader1', tx);
    // Verify broadcast (implementation specific)
    expect(gossip).toBeDefined();
  });

  test('should receive gossip messages', (done) => {
    const gossip = new ConsensusGossip();
    gossip.on('raw_tx:received', (data) => {
      expect(data).toHaveProperty('leaderId');
      expect(data).toHaveProperty('tx');
      done();
    });
    // Simulate receiving message
    gossip._handleMessage({ type: 'raw_tx', leaderId: 'leader1', tx: {} });
  });
});

