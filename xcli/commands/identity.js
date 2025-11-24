import { Command } from 'commander';

export function createIdentityCommand(xid) {
  const identityCmd = new Command('identity');

  identityCmd
    .command('create')
    .description('Generate new identity')
    .option('--name <name>', 'Identity name')
    .option('--key-dir <path>', 'Key directory path', './keys')
    .option('--password <password>', 'Password for encrypted key')
    .action(async (options) => {
      if (!xid || !xid.Identity || !xid.KeyManager) {
        console.error('Error: XID module not available');
        process.exit(1);
      }

      try {
        const identity = await xid.Identity.create();
        const keyManager = new xid.KeyManager(options.keyDir);
        const name = options.name || `identity_${Date.now()}`;
        await keyManager.saveIdentity(name, identity, options.password);
        console.log(JSON.stringify({
          name,
          address: identity.address,
          publicKey: identity.publicKey
        }));
      } catch (error) {
        console.error('Error creating identity:', error.message);
        process.exit(1);
      }
    });

  identityCmd
    .command('list')
    .description('List all identities')
    .option('--key-dir <path>', 'Key directory path', './keys')
    .action(async (options) => {
      if (!xid || !xid.KeyManager) {
        console.error('Error: XID module not available');
        process.exit(1);
      }

      try {
        const keyManager = new xid.KeyManager(options.keyDir);
        const identities = await keyManager.listIdentities();
        console.log(JSON.stringify(identities));
      } catch (error) {
        console.error('Error listing identities:', error.message);
        process.exit(1);
      }
    });

  identityCmd
    .command('show <name>')
    .description('Show identity details')
    .option('--key-dir <path>', 'Key directory path', './keys')
    .action(async (name, options) => {
      if (!xid || !xid.KeyManager) {
        console.error('Error: XID module not available');
        process.exit(1);
      }

      try {
        const keyManager = new xid.KeyManager(options.keyDir);
        const identity = await keyManager.loadIdentity(name);
        console.log(JSON.stringify({
          name,
          address: identity.address,
          publicKey: identity.publicKey
        }));
      } catch (error) {
        console.error('Error loading identity:', error.message);
        process.exit(1);
      }
    });

  identityCmd
    .command('sign <name>')
    .description('Sign message')
    .requiredOption('--message <text>', 'Message to sign')
    .option('--key-dir <path>', 'Key directory path', './keys')
    .option('--password <password>', 'Password for encrypted key')
    .action(async (name, options) => {
      if (!xid || !xid.KeyManager || !xid.Identity) {
        console.error('Error: XID module not available');
        process.exit(1);
      }

      try {
        const keyManager = new xid.KeyManager(options.keyDir);
        const identity = await keyManager.loadIdentity(name, options.password);
        const messageBytes = new TextEncoder().encode(options.message);
        const mayo = await xid.MAYOWasm.load();
        const signature = await mayo.sign(messageBytes, identity.privateKey);
        console.log(JSON.stringify({ message: options.message, signature }));
      } catch (error) {
        console.error('Error signing message:', error.message);
        process.exit(1);
      }
    });

  identityCmd
    .command('verify')
    .description('Verify signature')
    .requiredOption('--message <text>', 'Message to verify')
    .requiredOption('--signature <sig>', 'Signature')
    .requiredOption('--public-key <key>', 'Public key')
    .action(async (options) => {
      if (!xid || !xid.MAYOWasm) {
        console.error('Error: XID module not available');
        process.exit(1);
      }

      try {
        const mayo = await xid.MAYOWasm.load();
        const messageBytes = new TextEncoder().encode(options.message);
        const isValid = await mayo.verify(messageBytes, options.signature, options.publicKey);
        console.log(JSON.stringify({ valid: isValid }));
      } catch (error) {
        console.error('Error verifying signature:', error.message);
        process.exit(1);
      }
    });

  return identityCmd;
}

