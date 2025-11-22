import { Command } from 'commander';

export function createLedgerCommand(xclt) {
  const ledgerCmd = new Command('ledger');

  ledgerCmd
    .command('tx add')
    .description('Add transaction to ledger')
    .requiredOption('--tx <json>', 'Transaction JSON')
    .action(async (options) => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        let tx = options.tx;
        if (typeof tx === 'string') {
          tx = JSON.parse(tx);
        }
        if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
          throw new Error('Transaction must be an object');
        }
        const ledger = new xclt.Ledger();
        // Signed transactions from identity.signTransaction() return the full tx with sig
        // Ledger expects the transaction object directly
        const blockId = await ledger.addTransaction(tx);
        console.log(JSON.stringify({ blockId }));
      } catch (error) {
        console.error('Error adding transaction:', error.message);
        process.exit(1);
      }
    });

  ledgerCmd
    .command('block get <block-id>')
    .description('Get block by ID')
    .action(async (blockId) => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const block = await ledger.getBlock(blockId);
        console.log(JSON.stringify(block));
      } catch (error) {
        console.error('Error getting block:', error.message);
        process.exit(1);
      }
    });

  ledgerCmd
    .command('cube list')
    .description('List all cubes')
    .action(async () => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const cubes = await ledger.getCubes();
        console.log(JSON.stringify(cubes.map(c => ({ id: c.id, faces: c.faces.size }))));
      } catch (error) {
        console.error('Error listing cubes:', error.message);
        process.exit(1);
      }
    });

  ledgerCmd
    .command('state root')
    .description('Get ledger state root')
    .action(async () => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const root = await ledger.getStateRoot();
        console.log(JSON.stringify({ stateRoot: root }));
      } catch (error) {
        console.error('Error getting state root:', error.message);
        process.exit(1);
      }
    });

  return ledgerCmd;
}

