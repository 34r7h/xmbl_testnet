import { Command } from 'commander';

export function createConsensusCommand(xpc, xid, xclt, xn) {
  const consensusCmd = new Command('consensus');

  let workflow = null;

  consensusCmd
    .command('submit')
    .description('Submit transaction to mempool')
    .requiredOption('--tx <json>', 'Transaction JSON')
    .requiredOption('--leader <leader-id>', 'Leader ID')
    .action(async (options) => {
      if (!xpc || !xpc.ConsensusWorkflow) {
        console.error('Error: XPC module not available');
        process.exit(1);
      }

      try {
        const tx = JSON.parse(options.tx);
        if (!workflow) {
          workflow = new xpc.ConsensusWorkflow({ xid, xclt, xn });
        }
        const rawTxId = await workflow.submitTransaction(options.leader, tx);
        console.log(JSON.stringify({ rawTxId }));
      } catch (error) {
        console.error('Error submitting transaction:', error.message);
        process.exit(1);
      }
    });

  consensusCmd
    .command('raw-tx list')
    .description('List raw transactions')
    .option('--leader <leader-id>', 'Filter by leader')
    .action(async (options) => {
      if (!xpc || !xpc.Mempool) {
        console.error('Error: XPC module not available');
        process.exit(1);
      }

      try {
        const mempool = new xpc.Mempool();
        if (options.leader) {
          const leaderTxs = mempool.rawTx.get(options.leader);
          const txs = leaderTxs ? Array.from(leaderTxs.keys()) : [];
          console.log(JSON.stringify(txs));
        } else {
          const allTxs = [];
          for (const [leader, txs] of mempool.rawTx) {
            for (const txId of txs.keys()) {
              allTxs.push({ leader, rawTxId: txId });
            }
          }
          console.log(JSON.stringify(allTxs));
        }
      } catch (error) {
        console.error('Error listing raw transactions:', error.message);
        process.exit(1);
      }
    });

  consensusCmd
    .command('leader elect')
    .description('Elect leaders')
    .option('--count <number>', 'Number of leaders', '3')
    .action(async (options) => {
      if (!xpc || !xpc.LeaderElection) {
        console.error('Error: XPC module not available');
        process.exit(1);
      }

      try {
        const election = new xpc.LeaderElection();
        const leaders = election.electLeaders(parseInt(options.count));
        console.log(JSON.stringify({ leaders }));
      } catch (error) {
        console.error('Error electing leaders:', error.message);
        process.exit(1);
      }
    });

  consensusCmd
    .command('stats mempool')
    .description('Get mempool statistics')
    .action(async () => {
      if (!xpc || !xpc.Mempool) {
        console.error('Error: XPC module not available');
        process.exit(1);
      }

      try {
        const mempool = new xpc.Mempool();
        let rawCount = 0;
        for (const txs of mempool.rawTx.values()) {
          rawCount += txs.size;
        }
        console.log(JSON.stringify({
          rawTx: rawCount,
          processing: mempool.processingTx.size,
          finalized: mempool.tx.size,
          lockedUtxos: mempool.lockedUtxo.size
        }));
      } catch (error) {
        console.error('Error getting mempool stats:', error.message);
        process.exit(1);
      }
    });

  return consensusCmd;
}

