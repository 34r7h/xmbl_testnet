import * as THREE from 'three';

export class MempoolVisualizer {
  constructor() {
    this.barWidth = 0.2;
    this.barSpacing = 0.3;
    this.maxHeight = 2.0;
  }

  createMempoolViz() {
    const group = new THREE.Group();
    group.userData = { raw: 0, processing: 0, final: 0 };
    return group;
  }

  updateCounts(mempool, counts) {
    mempool.userData = counts;
    mempool.clear();
    
    const stages = [
      { name: 'raw', count: counts.raw, color: 0xff4444 },
      { name: 'processing', count: counts.processing, color: 0xffaa00 },
      { name: 'final', count: counts.final, color: 0x44ff44 }
    ];
    
    stages.forEach((stage, index) => {
      const bar = this.createBar(stage.count, stage.color, index);
      mempool.add(bar);
    });
  }

  createBar(count, color, index) {
    const normalizedCount = Math.min(count / 100, 1.0);
    const height = Math.max(0.1, normalizedCount * this.maxHeight);
    const geometry = new THREE.BoxGeometry(this.barWidth, height, this.barWidth);
    const material = new THREE.MeshStandardMaterial({ 
      color,
      metalness: 0.5,
      roughness: 0.5
    });
    const bar = new THREE.Mesh(geometry, material);
    
    bar.position.set(
      index * this.barSpacing - this.barSpacing,
      height / 2,
      0
    );
    
    // Add wireframe
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000 })
    );
    bar.add(line);
    
    return bar;
  }

  createBarChart(counts) {
    const group = new THREE.Group();
    this.updateCounts(group, counts);
    return group;
  }
}


