import * as THREE from 'three';

export class CubicVisualizer {
  constructor() {
    this.blockSize = 0.5; // Larger blocks for visibility
    this.spacing = 0.6; // More spacing between blocks
  }

  createCube(width, height, depth) {
    const group = new THREE.Group();
    
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        for (let z = 0; z < depth; z++) {
          const block = this.createBlock(x, y, z);
          group.add(block);
        }
      }
    }
    
    return group;
  }

  createBlock(x, y, z, data = {}) {
    const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
    const material = new THREE.MeshStandardMaterial({ 
      color: data.color || 0x00ff00,
      transparent: true,
      opacity: data.opacity || 1.0,
      metalness: 0.3,
      roughness: 0.7
    });
    const block = new THREE.Mesh(geometry, material);
    
    block.position.set(
      x * this.spacing - ((this.spacing * (x + 1)) / 2),
      y * this.spacing - ((this.spacing * (y + 1)) / 2),
      z * this.spacing - ((this.spacing * (z + 1)) / 2)
    );
    
    block.userData = { ...data, x, y, z };
    
    // Add wireframe edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
    );
    block.add(line);
    
    return block;
  }

  createFace(width, height) {
    const group = new THREE.Group();
    
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const block = this.createBlock(x, y, 0);
        group.add(block);
      }
    }
    
    return group;
  }

  addBlock(cube, x, y, z, data) {
    const block = this.createBlock(x, y, z, data);
    cube.add(block);
    return block;
  }

  getBlockCount(cube) {
    return cube.children.length;
  }

  updateBlockColor(block, color) {
    if (block.material) {
      block.material.color.setHex(color);
    }
  }

  highlightBlock(block) {
    if (block.material) {
      block.material.emissive.setHex(0x444444);
      block.scale.set(1.2, 1.2, 1.2);
    }
  }

  unhighlightBlock(block) {
    if (block.material) {
      block.material.emissive.setHex(0x000000);
      block.scale.set(1, 1, 1);
    }
  }

  animateBlock(block, time) {
    if (block) {
      block.rotation.x += 0.01;
      block.rotation.y += 0.01;
    }
  }
}

