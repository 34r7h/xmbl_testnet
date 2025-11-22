export function calculateDigitalRoot(hash) {
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

