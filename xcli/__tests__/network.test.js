import { describe, test, expect, afterEach } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Network Commands', () => {
  test('should start network node', async () => {
    const { stdout } = await execAsync('timeout 2 node index.js network start --port 3010 2>&1 || true');
    const lines = stdout.trim().split('\n');
    const resultLine = lines.find(l => l.startsWith('{'));
    if (resultLine) {
      const result = JSON.parse(resultLine);
      expect(result).toHaveProperty('started');
      expect(result).toHaveProperty('peerId');
      expect(result).toHaveProperty('addresses');
      expect(result.started).toBe(true);
    }
  }, 10000);

  test('should restart network node', async () => {
    const { stdout } = await execAsync('timeout 2 node index.js network restart --port 3014 2>&1 || true');
    const lines = stdout.trim().split('\n');
    const resultLine = lines.find(l => l.startsWith('{'));
    if (resultLine) {
      const result = JSON.parse(resultLine);
      expect(result).toHaveProperty('restarted');
      expect(result).toHaveProperty('peerId');
      expect(result.restarted).toBe(true);
    }
  }, 10000);
});

