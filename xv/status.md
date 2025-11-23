# XV Status

## Current Progress

### Completed
- ✅ **Direct xsim Import**: Server directly imports SystemSimulator from xsim module
- ✅ **Three.js Scene**: Implemented base 3D scene with camera controls, lighting, and mouse interaction
- ✅ **Cubic Visualization**: Created `CubicVisualizer` class for rendering 3D cubes and blocks
- ✅ **Mempool Visualization**: Created `MempoolVisualizer` class for bar chart visualization of mempool stages
- ✅ **Vue App Structure**: Set up Vue 3 app with `App.vue` component and socket.io client integration
- ✅ **Real-time Metrics**: Connected to xsim metrics events - receiving live updates
- ✅ **Socket.io Connection**: Client successfully connects to server and receives metrics updates
- ✅ **Hierarchical Visualization**: Implemented visualization of blocks -> faces -> cubes -> supercubes
- ✅ **Block Interaction**: Click blocks to zoom in and view transaction data
- ✅ **Auto-zoom**: Camera automatically zooms out as larger structures form
- ✅ **Scroll Zoom**: Mouse wheel to zoom in/out manually
- ✅ **Block Details Panel**: Shows transaction data when block is selected
- ✅ **XPC Integration**: Simulator properly uses xpc module to finalize transactions after validation
- ✅ **Transaction Flow Events**: Added `tx:processing` event forwarding from server to client
- ✅ **BigInt Serialization**: Fixed BigInt serialization errors in `tx:finalized` events
- ✅ **Block Coordinates**: Cube visualization now uses actual block coordinates from ledger (`{x, y, z}` objects)
- ✅ **Real-time Block Creation**: Blocks are created when transactions are finalized and added to ledger

### In Progress
- 🔄 **Cube Formation**: Verifying cubes form correctly using actual coordinates from ledger

### Next Steps
- [ ] Verify block:added events are being received and visualized in real-time
- [ ] Verify cube:complete events show proper cube assembly
- [ ] Verify supercube:complete events show recursive structure
- [ ] Add state machine visualization component
- [ ] Add storage and compute activity visualization
- [ ] Performance optimization for large numbers of objects

## Architecture

The visualizer directly imports xsim:
- `server.js` imports `SystemSimulator` from `../xsim/index.js`
- Server starts xsim and forwards events via socket.io to Vue client
- Events are serialized before transmission (blocks, cubes, supercubes)

## Data Flow

1. **server.js** imports and starts xsim SystemSimulator
2. **xsim** generates system activity (identities, transactions, blocks, cubes)
3. **xclt** emits block:added, face:complete, cube:complete, supercube:complete events
4. **server.js** serializes and forwards events via socket.io to connected clients
5. **App.vue** receives events and updates Three.js scene in real-time
6. **CubicVisualizer** renders hierarchical structure (supercubes -> cubes -> blocks)
7. **MempoolVisualizer** shows mempool counts as bar chart

## Features

### Real-time Construction
- Blocks appear as they're added to the ledger
- Faces form when 9 blocks are assembled
- Cubes form when 6 faces are assembled (3x3x3 = 27 blocks)
- Supercubes form when 27 cubes are assembled (recursive structure)

### Interaction
- **Click block**: Zooms to block and shows transaction details
- **Drag**: Rotate camera around the structure
- **Scroll**: Zoom in/out manually
- **Auto-zoom**: Automatically zooms out as larger structures form

### Block Details
When a block is selected, shows:
- Block ID
- Transaction ID
- Transaction type
- From/To addresses
- Amount and fee
- 3D coordinates
- Face index, cube index, level

## Testing

To test:
1. Start visualizer: `cd xv && npm start`
2. Open browser to http://localhost:3009
3. The server will automatically start xsim and begin generating activity
4. Watch blocks appear in real-time as transactions are validated
5. See cubes assemble as faces complete
6. See supercubes form as cubes complete (recursive determinism)
7. Click any block to zoom in and see transaction data

## Known Issues

- Cube visualization now uses actual block coordinates from ledger, but needs verification that cubes form correctly
- No state machine or storage/compute visualizations yet

## Recent Fixes

- **XPC Integration**: Simulator now properly uses xpc module to complete validation steps and finalize transactions
- **Event Forwarding**: Added `tx:processing` event forwarding from xpc to client via server
- **BigInt Serialization**: Fixed BigInt serialization errors by converting BigInt values to strings before JSON.stringify
- **Block Coordinates**: Updated cube visualization to use actual `{x, y, z}` coordinates from ledger instead of calculating positions locally
