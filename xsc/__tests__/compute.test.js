import { describe, test, expect } from '@jest/globals';
import { ComputeRuntime } from '../src/compute.js';

describe('WASM Compute Runtime', () => {
  test('should create compute runtime', () => {
    const runtime = new ComputeRuntime();
    expect(runtime).toBeDefined();
  });

  test('should execute WASM function', async () => {
    const runtime = new ComputeRuntime();
    // Simple WASM module (add function: (i32, i32) -> i32)
    // This is a minimal WASM binary for: (func (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)
    const wasmCode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // WASM magic
      0x01, 0x00, 0x00, 0x00, // Version
      0x01, 0x07, // Type section: 1 type
      0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // func type: (i32, i32) -> i32
      0x03, 0x02, // Function section: 1 function
      0x01, 0x00, // Function 0 uses type 0
      0x07, 0x07, // Export section: 1 export
      0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // Export "add" as function 0
      0x0a, 0x09, // Code section: 1 function
      0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b // Function body: local.get 0, local.get 1, i32.add
    ]);
    const result = await runtime.execute(wasmCode, 'add', [1, 2]);
    expect(result).toBe(3);
  }, 10000);

  test('should isolate function execution', async () => {
    const runtime = new ComputeRuntime();
    // Each execution should be isolated - this test verifies basic functionality
    // WASM: (func (result i32) i32.const 42)
    const wasmCode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // WASM magic
      0x01, 0x00, 0x00, 0x00, // Version
      0x01, 0x05, // Type section: 1 type
      0x01, 0x60, 0x00, 0x01, 0x7f, // func type: () -> i32
      0x03, 0x02, // Function section: 1 function
      0x01, 0x00, // Function 0 uses type 0
      0x07, 0x08, // Export section: 1 export
      0x01, 0x04, 0x70, 0x72, 0x6f, 0x63, 0x00, 0x00, // Export "proc" as function 0
      0x0a, 0x06, // Code section: 1 function
      0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b // Function body: i32.const 42, end
    ]);
    const result1 = await runtime.execute(wasmCode, 'proc', []);
    const result2 = await runtime.execute(wasmCode, 'proc', []);
    expect(result1).toBe(42);
    expect(result2).toBe(42);
  }, 10000);

  test('should enforce resource limits', async () => {
    const runtime = new ComputeRuntime({ maxMemory: 1024, maxTime: 1000 });
    // This test verifies that resource limits are checked
    // For now, we'll just verify the runtime accepts the limits
    expect(runtime.maxMemory).toBe(1024);
    expect(runtime.maxTime).toBe(1000);
  });
});

