import { Command } from 'commander';

export function createStateCommand(xvsm) {
  const stateCmd = new Command('state');

  stateCmd
    .command('get <key>')
    .description('Get state value')
    .action(async (key) => {
      if (!xvsm || !xvsm.VerkleStateTree) {
        console.error('Error: XVSM module not available');
        process.exit(1);
      }

      try {
        const tree = new xvsm.VerkleStateTree();
        const value = tree.get(key);
        console.log(JSON.stringify({ key, value }));
      } catch (error) {
        console.error('Error getting state:', error.message);
        process.exit(1);
      }
    });

  stateCmd
    .command('set <key>')
    .description('Set state value')
    .requiredOption('--value <json>', 'Value JSON')
    .action(async (key, options) => {
      if (!xvsm || !xvsm.VerkleStateTree) {
        console.error('Error: XVSM module not available');
        process.exit(1);
      }

      try {
        const tree = new xvsm.VerkleStateTree();
        const value = JSON.parse(options.value);
        tree.insert(key, value);
        console.log(JSON.stringify({ key, value, root: tree.getRoot() }));
      } catch (error) {
        console.error('Error setting state:', error.message);
        process.exit(1);
      }
    });

  stateCmd
    .command('root')
    .description('Get state root')
    .action(async () => {
      if (!xvsm || !xvsm.VerkleStateTree) {
        console.error('Error: XVSM module not available');
        process.exit(1);
      }

      try {
        const tree = new xvsm.VerkleStateTree();
        const root = tree.getRoot();
        console.log(JSON.stringify({ stateRoot: root }));
      } catch (error) {
        console.error('Error getting state root:', error.message);
        process.exit(1);
      }
    });

  stateCmd
    .command('proof generate <key>')
    .description('Generate state proof')
    .action(async (key) => {
      if (!xvsm || !xvsm.VerkleStateTree) {
        console.error('Error: XVSM module not available');
        process.exit(1);
      }

      try {
        const tree = new xvsm.VerkleStateTree();
        const proof = tree.generateProof(key);
        console.log(JSON.stringify(proof));
      } catch (error) {
        console.error('Error generating proof:', error.message);
        process.exit(1);
      }
    });

  return stateCmd;
}

