export class MarketPricing {
  constructor() {
    this.baseStoragePrice = 0.001; // per KB
    this.baseComputePrice = 0.01; // per second
  }

  calculateStoragePrice(sizeBytes, utilization) {
    // Base price adjusted by utilization (higher utilization = higher price)
    const utilizationMultiplier = 1 + utilization;
    return (sizeBytes / 1024) * this.baseStoragePrice * utilizationMultiplier;
  }

  calculateComputePrice(durationMs, memoryMB) {
    const durationSeconds = durationMs / 1000;
    return durationSeconds * this.baseComputePrice * (memoryMB / 64);
  }

  calculateTotalPrice(storagePrice, computePrice) {
    return storagePrice + computePrice;
  }
}

