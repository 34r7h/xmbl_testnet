export { StorageShard } from './src/sharding.js';
export { StorageNode } from './src/storage-node.js';
export { ComputeRuntime } from './src/compute.js';
export { MarketPricing } from './src/pricing.js';
export { AvailabilityTester } from './src/availability.js';
export { CoordinateDelivery } from './src/coordinate-delivery.js';

const port = process.env.PORT || 3005

console.log(`XSC (XMBL Storage and Compute) starting on port ${port}`)



