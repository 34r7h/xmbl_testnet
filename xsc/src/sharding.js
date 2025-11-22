export class StorageShard {
  constructor(index, data, isParity = false, originalLength = null) {
    this.index = index;
    this.data = data;
    this.isParity = isParity;
    this.originalLength = originalLength;
  }

  static create(data, index, totalShards) {
    const chunkSize = Math.ceil(data.length / totalShards);
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunk = data.slice(start, end);
    const padded = Buffer.alloc(chunkSize);
    chunk.copy(padded);
    return new StorageShard(index, padded, false, data.length);
  }

  static reconstruct(shards) {
    const dataShards = shards.filter(s => !s.isParity).sort((a, b) => a.index - b.index);
    if (dataShards.length === 0) {
      throw new Error('No data shards provided');
    }
    
    // Get original length from first shard that has it, or calculate from shards
    const originalLength = dataShards[0].originalLength || 
      (dataShards.length * dataShards[0].data.length);
    
    const chunkSize = dataShards[0].data.length;
    const totalSize = Math.min(originalLength, dataShards.length * chunkSize);
    const reconstructed = Buffer.alloc(totalSize);
    
    let offset = 0;
    for (const shard of dataShards) {
      const remaining = totalSize - offset;
      const copySize = Math.min(shard.data.length, remaining);
      if (copySize > 0) {
        shard.data.copy(reconstructed, offset, 0, copySize);
        offset += copySize;
      }
      if (offset >= totalSize) break;
    }
    
    return reconstructed;
  }

  static encode(data, k, m) {
    // k data shards, m parity shards
    const shards = [];
    const chunkSize = Math.ceil(data.length / k);
    
    // Split data into k shards
    for (let i = 0; i < k; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      // Pad if necessary
      const padded = Buffer.alloc(chunkSize);
      chunk.copy(padded);
      shards.push(new StorageShard(i, padded, false, data.length));
    }
    
    // Generate parity shards
    // Each parity shard is XOR of pairs of data shards to allow recovery
    // parity[0] = data[0] XOR data[2], parity[1] = data[1] XOR data[3], etc.
    const parity = [];
    for (let i = 0; i < m; i++) {
      const parityData = Buffer.alloc(chunkSize);
      // XOR corresponding data shards (i pairs with i + m)
      for (let j = 0; j < k; j += m) {
        const shardIdx = i + j;
        if (shardIdx < k) {
          for (let b = 0; b < chunkSize; b++) {
            parityData[b] ^= shards[shardIdx].data[b];
          }
        }
      }
      parity.push(new StorageShard(k + i, parityData, true, data.length));
    }
    
    return { shards, parity };
  }

  static decode(shards) {
    // Reconstruct original data from shards (can use data shards or parity shards)
    const allShards = shards.sort((a, b) => a.index - b.index);
    const dataShards = allShards.filter(s => !s.isParity);
    const parityShards = allShards.filter(s => s.isParity);
    
    // Get original length from first shard
    const originalLength = (dataShards[0] || parityShards[0])?.originalLength;
    if (!originalLength) {
      throw new Error('Cannot determine original data length');
    }
    
    const chunkSize = (dataShards[0] || parityShards[0])?.data.length || 0;
    if (chunkSize === 0) {
      throw new Error('Invalid shard data');
    }
    
    // Determine k (number of data shards) from parity shard indices
    // Parity shards have indices k, k+1, ..., k+m-1
    // So k = min(parity shard indices), or calculate from original length if no parity
    const m = parityShards.length;
    let k;
    if (parityShards.length > 0) {
      const minParityIndex = Math.min(...parityShards.map(p => p.index));
      k = minParityIndex;
    } else {
      k = Math.ceil(originalLength / chunkSize);
    }
    const neededShards = Math.ceil(originalLength / chunkSize);
    
    // Build a map of available shards by index
    const shardMap = new Map();
    for (const shard of allShards) {
      shardMap.set(shard.index, shard);
    }
    
    // Reconstruct each needed chunk
    const reconstructed = Buffer.alloc(originalLength);
    const recoveredDataShards = [];
    
    // First, collect all available data shards
    for (let i = 0; i < neededShards; i++) {
      const shard = shardMap.get(i);
      if (shard && !shard.isParity) {
        recoveredDataShards.push(shard);
      }
    }
    
    // If we have enough data shards, use them directly
    if (recoveredDataShards.length >= neededShards) {
      let offset = 0;
      for (const shard of recoveredDataShards.slice(0, neededShards)) {
        const remaining = originalLength - offset;
        const copySize = Math.min(shard.data.length, remaining);
        if (copySize > 0) {
          shard.data.copy(reconstructed, offset, 0, copySize);
          offset += copySize;
        }
        if (offset >= originalLength) break;
      }
      return reconstructed;
    }
    
    // Otherwise, we need to use parity shards to recover missing data shards
    // Our parity scheme: parity[i] = XOR of data shards at indices i, i+m, i+2m, ...
    // To recover data[j]: data[j] = parity[i] XOR (all other data shards in parity group)
    // where i = j % m
    
    // Build chunks array, recovering missing ones from parity
    const chunks = [];
    
    for (let i = 0; i < neededShards; i++) {
      const dataShard = shardMap.get(i);
      if (dataShard && !dataShard.isParity) {
        chunks.push(Buffer.from(dataShard.data));
      } else {
        // Missing data shard - try to recover from parity
        const parityIdx = i % m;
        // Find parity shard with index k + parityIdx
        const parityShard = parityShards.find(p => {
          const expectedIdx = k + parityIdx;
          return p.index === expectedIdx;
        });
        
        if (parityShard && m > 0) {
          // Recover: data[i] = parity[parityIdx] XOR (all other data shards in this parity group)
          const recovered = Buffer.from(parityShard.data);
          
          // XOR out the other data shards in this parity group
          for (let j = parityIdx; j < k; j += m) {
            if (j !== i) {
              const otherShard = shardMap.get(j);
              if (otherShard && !otherShard.isParity) {
                for (let b = 0; b < chunkSize; b++) {
                  recovered[b] ^= otherShard.data[b];
                }
              }
            }
          }
          
          chunks.push(recovered);
        } else {
          // Can't recover - use zeros
          chunks.push(Buffer.alloc(chunkSize));
        }
      }
    }
    
    // Reconstruct from chunks
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const remaining = originalLength - offset;
      const copySize = Math.min(chunks[i].length, remaining);
      if (copySize > 0) {
        chunks[i].copy(reconstructed, offset, 0, copySize);
        offset += copySize;
      }
      if (offset >= originalLength) break;
    }
    
    return reconstructed.slice(0, originalLength);
  }
}

