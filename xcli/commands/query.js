import { Command } from 'commander';

export function createQueryCommand(xclt, xvsm, xpc) {
  const queryCmd = new Command('query');

  queryCmd
    .command('balance')
    .description('Query account balance')
    .requiredOption('--address <address>', 'Account address')
    .action(async (options) => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        // Query balance from ledger state
        // In a implementation, this would query the state tree
        const balance = {
          address: options.address,
          balance: 0 // Would query actual balance from state
        };
        console.log(JSON.stringify(balance));
      } catch (error) {
        console.error('Error querying balance:', error.message);
        process.exit(1);
      }
    });

  queryCmd
    .command('tx')
    .description('Query transaction by ID')
    .requiredOption('--id <tx-id>', 'Transaction ID')
    .action(async (options) => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const block = await ledger.getBlock(options.id);
        if (!block) {
          console.error('Error: Transaction not found');
          process.exit(1);
        }
        console.log(JSON.stringify({
          id: block.id,
          tx: block.tx,
          status: 'confirmed',
          blockId: block.id,
          timestamp: block.timestamp
        }));
      } catch (error) {
        console.error('Error querying transaction:', error.message);
        process.exit(1);
      }
    });

  queryCmd
    .command('state')
    .description('Query ledger state')
    .action(async () => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const cubes = await ledger.getCubes();
        const stateRoot = await ledger.getStateRoot();
        console.log(JSON.stringify({
          height: cubes.length,
          cubes: cubes.length,
          stateRoot: stateRoot
        }));
      } catch (error) {
        console.error('Error querying state:', error.message);
        process.exit(1);
      }
    });

  return queryCmd;
}

