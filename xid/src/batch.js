import { Identity } from './identity.js';

export async function batchSign(transactions, identity) {
  const signed = [];
  for (const tx of transactions) {
    const signedTx = await identity.signTransaction(tx);
    signed.push(signedTx);
  }
  return signed;
}

export async function batchVerify(signedTransactions, publicKey) {
  const results = [];
  for (const signedTx of signedTransactions) {
    const isValid = await Identity.verifyTransaction(signedTx, publicKey);
    results.push(isValid);
  }
  return results;
}

