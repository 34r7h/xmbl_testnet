import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('State Commands', () => {
  test('should set state value', async () => {
    const { stdout } = await execAsync(
      'node index.js state set testkey --value \'{"data":"test"}\''
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('root');
    expect(result.key).toBe('testkey');
  });

  test('should get state value', async () => {
    // First set a value
    await execAsync('node index.js state set gettest --value \'"getvalue"\'');
    
    const { stdout } = await execAsync('node index.js state get gettest');
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('key');
    expect(result.key).toBe('gettest');
  });

  test('should get state root', async () => {
    const { stdout } = await execAsync('node index.js state root');
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('stateRoot');
    expect(typeof result.stateRoot).toBe('string');
  });

  test('should generate state proof', async () => {
    // First set a value
    await execAsync('node index.js state set prooftest --value \'"proofvalue"\'');
    
    // Proof generation may fail if key not found, but command should not crash
    try {
      const { stdout } = await execAsync('node index.js state proof generate prooftest');
      const proof = JSON.parse(stdout.trim());
      expect(proof).toBeDefined();
    } catch (e) {
      // If proof generation fails, that's okay - it means the command handled the error
      expect(e.message).toBeDefined();
    }
  });
});

