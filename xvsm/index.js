export { VerkleStateTree } from './src/verkle-tree.js';
export { StateDiff } from './src/state-diff.js';
export { WASMExecutor } from './src/wasm-execution.js';
export { StateShard } from './src/sharding.js';
export { StateAssembler } from './src/state-assembly.js';
export { StateMachine } from './src/state-machine.js';

const port = process.env.PORT || 3002;
console.log(`XVSM (XMBL Virtual State Machine) starting on port ${port}`);



