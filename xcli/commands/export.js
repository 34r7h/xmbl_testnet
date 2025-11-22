import { Command } from 'commander';
import { writeFileSync } from 'fs';

export function createExportCommand(xclt, xvsm) {
  const exportCmd = new Command('export');

  exportCmd
    .command('tx')
    .description('Export transactions')
    .requiredOption('--format <format>', 'Export format: json, csv')
    .requiredOption('--output <file>', 'Output file path')
    .option('--limit <number>', 'Limit number of transactions', '100')
    .action(async (options) => {
      if (!xclt || !xclt.Ledger) {
        console.error('Error: XCLT module not available');
        process.exit(1);
      }

      try {
        const ledger = new xclt.Ledger();
        const cubes = await ledger.getCubes();
        const transactions = [];
        
        for (const cube of cubes) {
          for (const face of cube.faces.values()) {
            for (const block of face.blocks.values()) {
              transactions.push({
                id: block.id,
                type: block.tx.type,
                from: block.tx.from,
                to: block.tx.to,
                amount: block.tx.amount,
                timestamp: block.timestamp
              });
            }
          }
        }

        const limited = transactions.slice(0, parseInt(options.limit));

        if (options.format === 'json') {
          writeFileSync(options.output, JSON.stringify(limited, null, 2));
          console.log(JSON.stringify({ exported: limited.length, format: 'json', file: options.output }));
        } else if (options.format === 'csv') {
          const headers = ['id', 'type', 'from', 'to', 'amount', 'timestamp'];
          const rows = limited.map(tx => [
            tx.id,
            tx.type,
            tx.from || '',
            tx.to || '',
            tx.amount || '',
            tx.timestamp
          ]);
          const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
          writeFileSync(options.output, csv);
          console.log(JSON.stringify({ exported: limited.length, format: 'csv', file: options.output }));
        } else {
          console.error('Error: Invalid format. Use: json, csv');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error exporting transactions:', error.message);
        process.exit(1);
      }
    });

  exportCmd
    .command('state')
    .description('Export state data')
    .requiredOption('--format <format>', 'Export format: json')
    .requiredOption('--output <file>', 'Output file path')
    .action(async (options) => {
      if (!xvsm || !xvsm.VerkleStateTree) {
        console.error('Error: XVSM module not available');
        process.exit(1);
      }

      try {
        const tree = new xvsm.VerkleStateTree();
        const stateRoot = tree.getRoot();
        
        const stateData = {
          stateRoot: stateRoot,
          timestamp: Date.now()
        };

        if (options.format === 'json') {
          writeFileSync(options.output, JSON.stringify(stateData, null, 2));
          console.log(JSON.stringify({ exported: true, format: 'json', file: options.output }));
        } else {
          console.error('Error: Invalid format. Use: json');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error exporting state:', error.message);
        process.exit(1);
      }
    });

  return exportCmd;
}

