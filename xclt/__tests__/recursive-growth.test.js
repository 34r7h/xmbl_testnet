import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../src/ledger.js';
import { rmSync, existsSync } from 'fs';

describe('Recursive Superstructure Growth', () => {
  let ledger;
  const testDbPath = './data/ledger-recursive-test';

  beforeEach(() => {
    // Clean up test database
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

  test('should form Level 1 cubes from 27 blocks', async () => {
    const cubeCompletions = [];
    ledger.on('cube:complete', (data) => {
      cubeCompletions.push({ level: data.level || 1, cubeId: data.cube?.id });
    });

    // Create 27 transactions to form one Level 1 cube
    for (let i = 0; i < 27; i++) {
      const tx = {
        type: 'utxo',
        from: `alice_${i}`,
        to: `bob_${i}`,
        amount: 1.0,
        timestamp: Date.now() + i,
        validationTimestamp: Date.now() + i // Validator average timestamp
      };
      await ledger.addTransaction(tx);
    }

    // Wait for cube completion
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(cubeCompletions.length).toBeGreaterThanOrEqual(1);
    expect(cubeCompletions[0].level).toBe(1);
    console.log(`✓ Level 1 cube formed: ${cubeCompletions[0].cubeId}`);
  });

  test('should form Level 2 super-cubes from 27 Level 1 cubes', async () => {
    const cubeCompletions = [];
    const superCubeCompletions = [];
    
    ledger.on('cube:complete', (data) => {
      const level = data.level || 1;
      if (level === 1) {
        cubeCompletions.push({ level, cubeId: data.cube?.id });
      }
    });

    ledger.on('supercube:complete', (data) => {
      superCubeCompletions.push({ level: data.level, cubeId: data.cube?.id });
    });

    // Create 27 * 27 = 729 transactions to form 27 Level 1 cubes
    // which will then form 1 Level 2 super-cube
    let blockCount = 0;
    const baseTime = Date.now();
    
    for (let cubeIndex = 0; cubeIndex < 27; cubeIndex++) {
      for (let blockIndex = 0; blockIndex < 27; blockIndex++) {
        const tx = {
          type: 'utxo',
          from: `alice_${cubeIndex}_${blockIndex}`,
          to: `bob_${cubeIndex}_${blockIndex}`,
          amount: 1.0,
          timestamp: baseTime + blockCount,
          validationTimestamp: baseTime + blockCount // Validator average timestamp
        };
        await ledger.addTransaction(tx);
        blockCount++;
        
        // Small delay to ensure proper ordering
        if (blockCount % 27 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    // Wait for all cubes to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`✓ Level 1 cubes formed: ${cubeCompletions.length}`);
    console.log(`✓ Level 2 super-cubes formed: ${superCubeCompletions.length}`);
    
    expect(cubeCompletions.length).toBeGreaterThanOrEqual(27);
    expect(superCubeCompletions.length).toBeGreaterThanOrEqual(1);
    expect(superCubeCompletions[0].level).toBe(2);
    
    // Verify the super-cube has 27 child cubes
    const superCube = superCubeCompletions[0];
    const superCubeData = ledger.superCubes?.get(2);
    if (superCubeData) {
      const firstSuperCube = Array.from(superCubeData.values())[0];
      if (firstSuperCube && firstSuperCube.childCubes) {
        expect(firstSuperCube.childCubes.size).toBe(27);
        console.log(`✓ Super-cube contains 27 Level 1 cubes`);
      }
    }
  });

  test('should form Level 3 mega-cubes from 27 Level 2 super-cubes', async () => {
    const completions = { level1: [], level2: [], level3: [] };
    
    ledger.on('cube:complete', (data) => {
      const level = data.level || 1;
      if (level === 1) completions.level1.push(data);
    });

    ledger.on('supercube:complete', (data) => {
      if (data.level === 2) completions.level2.push(data);
      if (data.level === 3) completions.level3.push(data);
    });

    // Create 27 * 27 * 27 = 19,683 transactions
    // This forms: 27 Level 1 cubes → 1 Level 2 super-cube
    // Then 27 Level 2 super-cubes → 1 Level 3 mega-cube
    let blockCount = 0;
    const baseTime = Date.now();
    const totalBlocks = 27 * 27 * 27; // 19,683 blocks
    
    console.log(`Creating ${totalBlocks} blocks for recursive growth demonstration...`);
    
    for (let megaCubeIndex = 0; megaCubeIndex < 27; megaCubeIndex++) {
      for (let superCubeIndex = 0; superCubeIndex < 27; superCubeIndex++) {
        for (let blockIndex = 0; blockIndex < 27; blockIndex++) {
          const tx = {
            type: 'utxo',
            from: `alice_${megaCubeIndex}_${superCubeIndex}_${blockIndex}`,
            to: `bob_${megaCubeIndex}_${superCubeIndex}_${blockIndex}`,
            amount: 1.0,
            timestamp: baseTime + blockCount,
            validationTimestamp: baseTime + blockCount
          };
          await ledger.addTransaction(tx);
          blockCount++;
          
          // Progress indicator
          if (blockCount % 1000 === 0) {
            console.log(`  Progress: ${blockCount}/${totalBlocks} blocks (${Math.round(blockCount/totalBlocks*100)}%)`);
          }
          
          // Small delay every 27 blocks (one cube)
          if (blockCount % 27 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      }
    }

    // Wait for all recursive formations
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`\n✓ Recursive Growth Results:`);
    console.log(`  Level 1 cubes: ${completions.level1.length}`);
    console.log(`  Level 2 super-cubes: ${completions.level2.length}`);
    console.log(`  Level 3 mega-cubes: ${completions.level3.length}`);
    
    expect(completions.level1.length).toBeGreaterThanOrEqual(27 * 27); // At least 729 Level 1 cubes
    expect(completions.level2.length).toBeGreaterThanOrEqual(27); // At least 27 Level 2 super-cubes
    expect(completions.level3.length).toBeGreaterThanOrEqual(1); // At least 1 Level 3 mega-cube
    
    // Verify recursive structure
    const level2Cubes = ledger.superCubes?.get(2);
    const level3Cubes = ledger.superCubes?.get(3);
    
    if (level2Cubes && level2Cubes.size > 0) {
      const firstLevel2 = Array.from(level2Cubes.values())[0];
      expect(firstLevel2.childCubes.size).toBe(27);
      console.log(`✓ Level 2 super-cube contains 27 Level 1 cubes`);
    }
    
    if (level3Cubes && level3Cubes.size > 0) {
      const firstLevel3 = Array.from(level3Cubes.values())[0];
      expect(firstLevel3.childCubes.size).toBe(27);
      console.log(`✓ Level 3 mega-cube contains 27 Level 2 super-cubes`);
      console.log(`✓ RECURSIVE FRACTAL STRUCTURE DEMONSTRATED: Cubes → Super-cubes → Mega-cubes`);
    }
  });

  test('should order parallel cubes by validator average timestamp', async () => {
    const cubeCompletions = [];
    ledger.on('cube:complete', (data) => {
      cubeCompletions.push({
        level: data.level || 1,
        cubeId: data.cube?.id,
        validatorTimestamp: data.validatorAverageTimestamp
      });
    });

    // Create blocks with different validator timestamps
    // Earlier timestamps should form cubes first
    const baseTime = Date.now();
    
    // Create first set of 27 blocks with earlier timestamps
    for (let i = 0; i < 27; i++) {
      const tx = {
        type: 'utxo',
        from: `alice_early_${i}`,
        to: `bob_early_${i}`,
        amount: 1.0,
        timestamp: baseTime + i,
        validationTimestamp: baseTime + i // Earlier validator timestamps
      };
      await ledger.addTransaction(tx);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Create second set with later timestamps
    for (let i = 0; i < 27; i++) {
      const tx = {
        type: 'utxo',
        from: `alice_late_${i}`,
        to: `bob_late_${i}`,
        amount: 1.0,
        timestamp: baseTime + 10000 + i,
        validationTimestamp: baseTime + 10000 + i // Later validator timestamps
      };
      await ledger.addTransaction(tx);
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(cubeCompletions.length).toBeGreaterThanOrEqual(2);
    
    // First cube should have earlier validator timestamp
    if (cubeCompletions.length >= 2) {
      const firstTimestamp = cubeCompletions[0].validatorTimestamp;
      const secondTimestamp = cubeCompletions[1].validatorTimestamp;
      
      expect(firstTimestamp).toBeLessThan(secondTimestamp);
      console.log(`✓ Parallel cubes ordered by validator timestamp: ${firstTimestamp} < ${secondTimestamp}`);
    }
  });
});


