import { describe, test, expect } from '@jest/globals';
import { MarketPricing } from '../src/pricing.js';

describe('Market Pricing', () => {
  test('should calculate storage price', () => {
    const pricing = new MarketPricing();
    const price = pricing.calculateStoragePrice(1000, 0.5); // 1KB, 50% utilization
    expect(price).toBeGreaterThan(0);
  });

  test('should calculate compute price', () => {
    const pricing = new MarketPricing();
    const price = pricing.calculateComputePrice(1000, 64); // 1s, 64MB
    expect(price).toBeGreaterThan(0);
  });

  test('should adjust price based on demand', () => {
    const pricing = new MarketPricing();
    const price1 = pricing.calculateStoragePrice(1000, 0.3); // Low utilization
    const price2 = pricing.calculateStoragePrice(1000, 0.9); // High utilization
    expect(price2).toBeGreaterThan(price1);
  });
});

