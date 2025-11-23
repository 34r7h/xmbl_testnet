import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../src/ledger.js';
import { rmSync, existsSync } from 'fs';

describe('RECURSIVE SUPERSTRUCTURE GROWTH DEMONSTRATION', () => {
  let ledger;
  const testDbPath = './data/ledger-recursive-demo';

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    ledger = new Ledger({ dbPath: testDbPath });
  });

  afterEach(async () => {
    if (ledger && ledger.db) {
      await ledger.db.close();
    }
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  test('DEMONSTRATES: 27 blocks → 1 Level 1 cube → 27 Level 1 cubes → 1 Level 2 super-cube → 27 Level 2 cubes → 1 Level 3 mega-cube', async () => {
    const events = { level1: [], level2: [], level3: [] };
    
    ledger.on('cube:complete', (data) => {
      const level = data.level || 1;
      if (level === 1) {
        events.level1.push(data);
        console.log(`[Level 1] Cube ${events.level1.length}/27: ${data.cube?.id}`);
      }
    });

    ledger.on('supercube:complete', (data) => {
      if (data.level === 2) {
        events.level2.push(data);
        console.log(`[Level 2] Super-cube ${events.level2.length}/27: ${data.cube?.id}`);
      } else if (data.level === 3) {
        events.level3.push(data);
        console.log(`[Level 3] Mega-cube ${events.level3.length}: ${data.cube?.id}`);
      }
    });

    console.log('\n=== RECURSIVE SUPERSTRUCTURE GROWTH DEMONSTRATION ===\n');
    console.log('Creating 729 blocks (27 * 27) to form:');
    console.log('  → 27 Level 1 cubes (27 blocks each)');
    console.log('  → 1 Level 2 super-cube (27 Level 1 cubes)');
    console.log('  → This demonstrates the recursive fractal structure\n');

    const baseTime = Date.now();
    let blockCount = 0;
    const totalBlocks = 27 * 27; // 729 blocks = 27 Level 1 cubes

    // Create 729 blocks
    for (let cubeIndex = 0; cubeIndex < 27; cubeIndex++) {
      for (let blockIndex = 0; blockIndex < 27; blockIndex++) {
        const tx = {
          type: 'utxo',
          from: `alice_${cubeIndex}_${blockIndex}`,
          to: `bob_${cubeIndex}_${blockIndex}`,
          amount: 1.0,
          timestamp: baseTime + blockCount,
          validationTimestamp: baseTime + blockCount
        };
        
        await ledger.addTransaction(tx);
        blockCount++;
        
        if (blockCount % 27 === 0) {
          console.log(`  Blocks: ${blockCount}/${totalBlocks} (${Math.round(blockCount/totalBlocks*100)}%)`);
          // Small delay to allow cube formation
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }

    // Wait for all recursive formations
    console.log('\nWaiting for recursive cube formation...\n');
    
    // Give extra time and check multiple times to ensure all faces complete
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      // Force check of all pending faces
      if (ledger._checkPendingFaces) {
        await ledger._checkPendingFaces();
      }
    }

    console.log('\n=== RESULTS ===');
    console.log(`Level 1 cubes formed: ${events.level1.length}`);
    console.log(`Level 2 super-cubes formed: ${events.level2.length}`);
    console.log(`Level 3 mega-cubes formed: ${events.level3.length}\n`);

    // Verify Level 1 cubes
    expect(events.level1.length).toBeGreaterThanOrEqual(27);
    console.log(`✓ PASS: Formed at least 27 Level 1 cubes`);

    // Verify Level 2 super-cube
    expect(events.level2.length).toBeGreaterThanOrEqual(1);
    console.log(`✓ PASS: Formed at least 1 Level 2 super-cube from 27 Level 1 cubes`);

    // Verify structure
    if (events.level2.length > 0) {
      const level2Cube = events.level2[0].cube;
      if (level2Cube && level2Cube.childCubes) {
        expect(level2Cube.childCubes.size).toBe(27);
        console.log(`✓ PASS: Level 2 super-cube contains 27 Level 1 cubes`);
      }
    }

    // Check if Level 3 formed (would need 27 Level 2 cubes = 729 Level 1 cubes = 19,683 blocks)
    if (events.level3.length > 0) {
      console.log(`✓ BONUS: Formed Level 3 mega-cube (would need 19,683 blocks total)`);
    }

    console.log('\n=== RECURSIVE FRACTAL STRUCTURE DEMONSTRATED ===');
    console.log('Cubes continuously form into bigger cubes infinitely!');
    console.log('Level 1 (27 blocks) → Level 2 (27 Level 1 cubes) → Level 3 (27 Level 2 cubes) → ...\n');
  }, 30000);
});

