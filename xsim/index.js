import { SystemSimulator } from './src/simulator.js';
import { StructuredLogger } from './src/logger.js';

const port = process.env.PORT || 3006;

console.log(`XSIM (XMBL Simulator) starting on port ${port}`);

// If run directly, start the simulator
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('index.js') ||
  process.argv[1].includes('xsim/index.js') ||
  process.argv[1].includes('xsim\\index.js')
);

if (isMainModule || process.argv.includes('--run')) {
  const sim = new SystemSimulator({
    initialIdentities: 10,
    transactionRate: 2,
    stateDiffRate: 1,
    storageOpRate: 0.5,
    computeOpRate: 0.5,
    useRealModules: true
  });

  sim.start().catch(err => {
    console.error('Failed to start simulator:', err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down simulator...');
    sim.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down simulator...');
    sim.stop();
    process.exit(0);
  });
}

export { SystemSimulator, StructuredLogger };



