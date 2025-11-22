import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('XCLI Basic Structure', () => {
  test('should show help when no command provided', async () => {
    const { stdout } = await execAsync('node index.js --help');
    expect(stdout).toContain('Usage: xmbl');
    expect(stdout).toContain('XMBL Command Line Interface');
  });

  test('should show version', async () => {
    const { stdout } = await execAsync('node index.js --version');
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});

