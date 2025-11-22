import { Identity } from './src/identity.js';

async function demo() {
  console.log('Generating MAYO_1 key pair...\n');
  
  const identity = await Identity.create();
  
  console.log('Public Key (base64):');
  console.log(identity.publicKey);
  console.log('\nPrivate Key (base64):');
  console.log(identity.privateKey);
  console.log('\nAddress:');
  console.log(identity.address);
  
  console.log('\n---\n');
  console.log('Signing message "hello"...\n');
  
  const message = 'hello';
  const tx = { message, from: identity.address };
  const signed = await identity.signTransaction(tx);
  
  console.log('Signature (base64):');
  console.log(signed.sig);
  
  console.log('\n---\n');
  console.log('Verifying signature...\n');
  
  const isValid = await Identity.verifyTransaction(signed, identity.publicKey);
  console.log('Verification result:', isValid ? '✓ VALID' : '✗ INVALID');
}

demo().catch(console.error);

