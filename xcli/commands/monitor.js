import { Command } from 'commander';
import { EventEmitter } from 'events';

export function createMonitorCommand(xclt, xpc, xsc) {
  const monitorCmd = new Command('monitor');

  let streaming = false;
  let eventHandlers = [];

  monitorCmd
    .command('stream')
    .description('Stream real-time updates')
    .requiredOption('--type <type>', 'Stream type: tx, blocks, consensus')
    .action(async (options) => {
      streaming = true;
      const streamType = options.type;

      try {
        if (streamType === 'tx') {
          if (!xclt || !xclt.Ledger) {
            console.error('Error: XCLT module not available');
            process.exit(1);
          }
          const ledger = new xclt.Ledger();
          const handler = (tx) => {
            if (streaming) {
              console.log(JSON.stringify({ type: 'tx', data: tx }));
            }
          };
          ledger.on('transaction:added', handler);
          eventHandlers.push({ emitter: ledger, event: 'transaction:added', handler });
          console.log(JSON.stringify({ status: 'Monitoring transactions' }));
        } else if (streamType === 'blocks') {
          if (!xclt || !xclt.Ledger) {
            console.error('Error: XCLT module not available');
            process.exit(1);
          }
          const ledger = new xclt.Ledger();
          const handler = (block) => {
            if (streaming) {
              console.log(JSON.stringify({ type: 'block', data: block }));
            }
          };
          ledger.on('block:added', handler);
          eventHandlers.push({ emitter: ledger, event: 'block:added', handler });
          console.log(JSON.stringify({ status: 'Monitoring blocks' }));
        } else if (streamType === 'consensus') {
          if (!xpc || !xpc.ConsensusWorkflow) {
            console.error('Error: XPC module not available');
            process.exit(1);
          }
          const workflow = new xpc.ConsensusWorkflow();
          const handler = (update) => {
            if (streaming) {
              console.log(JSON.stringify({ type: 'consensus', data: update }));
            }
          };
          workflow.on('raw_tx:added', handler);
          workflow.on('tx:finalized', handler);
          eventHandlers.push({ emitter: workflow, event: 'raw_tx:added', handler });
          eventHandlers.push({ emitter: workflow, event: 'tx:finalized', handler });
          console.log(JSON.stringify({ status: 'Monitoring consensus' }));
        } else {
          console.error('Error: Invalid stream type. Use: tx, blocks, consensus');
          process.exit(1);
        }

        // Keep process alive
        process.on('SIGINT', () => {
          streaming = false;
          eventHandlers.forEach(({ emitter, event, handler }) => {
            emitter.off(event, handler);
          });
          process.exit(0);
        });
      } catch (error) {
        console.error('Error starting stream:', error.message);
        process.exit(1);
      }
    });

  return monitorCmd;
}

