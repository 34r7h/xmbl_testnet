import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tokenTypes = null;

function loadTokenTypes() {
  if (!tokenTypes) {
    try {
      const tokensPath = join(__dirname, '..', 'tokens.json');
      const tokensData = readFileSync(tokensPath, 'utf-8');
      tokenTypes = JSON.parse(tokensData).transactionTypes;
    } catch (error) {
      throw new Error(`Failed to load tokens.json: ${error.message}`);
    }
  }
  return tokenTypes;
}

export function validateTransaction(tx) {
  if (!tx || typeof tx !== 'object') {
    throw new Error('Transaction must be an object');
  }

  if (!tx.type) {
    throw new Error('Transaction must have a type field');
  }

  const types = loadTokenTypes();
  const txType = types[tx.type];

  if (!txType) {
    throw new Error(`Unknown transaction type: ${tx.type}`);
  }

  // Validate required fields
  for (const field of txType.required) {
    if (!(field in tx)) {
      throw new Error(`Missing required field: ${field} for transaction type ${tx.type}`);
    }
  }

  return true;
}

export function getTransactionType(tx) {
  if (!tx || !tx.type) {
    return null;
  }
  const types = loadTokenTypes();
  return types[tx.type] || null;
}

