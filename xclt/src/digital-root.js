import { createHash } from 'crypto';

/**
 * Calculate digital root from transaction data + average timestamp
 * This is the deterministic way to derive placement in the cubic structure
 * @param {Object} txData - Transaction data
 * @param {number|bigint} averageTimestamp - Average validator timestamp (nanoseconds)
 * @returns {number} Digital root (1-9)
 */
export function calculateDigitalRoot(txData, averageTimestamp) {
  // Combine tx data with average timestamp to create deterministic hash
  const combined = JSON.stringify(txData) + averageTimestamp.toString();
  const hash = createHash('sha256').update(combined).digest('hex');
  
  // Convert hash to number
  let sum = 0;
  for (let i = 0; i < hash.length; i++) {
    sum += parseInt(hash[i], 16) || 0;
  }
  
  // Calculate digital root (sum of digits until single digit)
  while (sum > 9) {
    sum = sum.toString().split('').reduce((acc, digit) => acc + parseInt(digit), 0);
  }
  
  return sum || 9; // Ensure 1-9 range
}

/**
 * Legacy function for backward compatibility - calculates from hash only
 * @deprecated Use calculateDigitalRoot(txData, averageTimestamp) instead
 */
export function calculateDigitalRootFromHash(hash) {
  let sum = 0;
  for (let i = 0; i < hash.length; i++) {
    sum += parseInt(hash[i], 16) || 0;
  }
  while (sum > 9) {
    sum = sum.toString().split('').reduce((acc, digit) => acc + parseInt(digit), 0);
  }
  return sum || 9;
}

