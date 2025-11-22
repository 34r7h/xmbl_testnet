# XV - XMBL Visualizer Instructions

## Overview

XV provides a 3D visualization system using Three.js to render XMBL system activity in real-time. It visualizes cubic ledger constructions (main cube and partials), state machine operations, consensus mempools, storage distribution, and compute activities. The visualizer serves as both a development tool and a user-facing interface for understanding XMBL system behavior.

## Fundamentals

### Key Concepts

- **3D Rendering**: Three.js for WebGL-based 3D graphics
- **Real-Time Updates**: Live visualization of system events
- **Cubic Geometry**: 3D representation of cubic ledger structure
- **Mempool Visualization**: Visual representation of consensus mempools
- **State Machine View**: Visualization of state transitions
- **Storage/Compute Maps**: Geographic or network topology views

### Dependencies

- **three**: Three.js 3D library
- **vue**: Vue 3 for UI framework
- **socket.io-client**: Real-time event streaming
- **stats.js**: Performance monitoring

### Architectural Decisions

- **Component-Based**: Vue 3 components for each visualization
- **Event-Driven**: Subscribe to module events for updates
- **WebGL Rendering**: Hardware-accelerated 3D graphics
- **Responsive Design**: Adapts to different screen sizes

## Development Steps

### Step 1: Project Setup

```bash
cd xv
npm init -y
npm install three vue@next socket.io-client stats.js
npm install --save-dev @vitejs/plugin-vue vite jest @types/jest
```

### Step 2: Three.js Scene Setup (TDD)

**Test First** (`__tests__/scene.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { Scene3D } from '../src/scene';

describe('3D Scene', () => {
  test('should create scene', () => {
    const scene = new Scene3D({ container: document.createElement('div') });
    expect(scene.scene).toBeDefined();
    expect(scene.camera).toBeDefined();
    expect(scene.renderer).toBeDefined();
  });

  test('should render scene', () => {
    const scene = new Scene3D({ container: document.createElement('div') });
    scene.render();
    // Scene should render without errors
  });

  test('should handle window resize', () => {
    const scene = new Scene3D({ container: document.createElement('div') });
    scene.handleResize(800, 600);
    expect(scene.camera.aspect).toBe(800 / 600);
  });
});
```

**Implementation** (`src/scene.js`):

```javascript
import * as THREE from 'three';

export class Scene3D {
  constructor(options) {
    this.container = options.container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);
    
    this.camera.position.z = 5;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
    
    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  handleResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
```

### Step 3: Cubic Ledger Visualization (TDD)

**Test** (`__tests__/cubic-viz.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { CubicVisualizer } from '../src/cubic-viz';

describe('Cubic Visualizer', () => {
  test('should create cube visualization', () => {
    const viz = new CubicVisualizer();
    const cube = viz.createCube(1, 1, 1);
    expect(cube).toBeDefined();
    expect(cube.geometry).toBeDefined();
  });

  test('should update cube with new blocks', () => {
    const viz = new CubicVisualizer();
    const cube = viz.createCube(3, 3, 3);
    viz.addBlock(cube, 0, 0, 0, { id: 'block1' });
    expect(viz.getBlockCount(cube)).toBe(1);
  });

  test('should visualize face structure', () => {
    const viz = new CubicVisualizer();
    const face = viz.createFace(3, 3);
    expect(face.children.length).toBe(9); // 3x3 = 9 blocks
  });
});
```

**Implementation** (`src/cubic-viz.js`):

```javascript
import * as THREE from 'three';

export class CubicVisualizer {
  constructor() {
    this.blockSize = 0.1;
    this.spacing = 0.15;
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
      opacity: data.opacity || 1.0
    });
    const block = new THREE.Mesh(geometry, material);
    
    block.position.set(
      x * this.spacing - (this.spacing * 2),
      y * this.spacing - (this.spacing * 2),
      z * this.spacing - (this.spacing * 2)
    );
    
    block.userData = data;
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
  }

  getBlockCount(cube) {
    return cube.children.length;
  }

  updateBlockColor(block, color) {
    block.material.color.setHex(color);
  }

  highlightBlock(block) {
    block.material.emissive.setHex(0x444444);
    block.scale.set(1.2, 1.2, 1.2);
  }

  unhighlightBlock(block) {
    block.material.emissive.setHex(0x000000);
    block.scale.set(1, 1, 1);
  }
}
```

### Step 4: Mempool Visualization (TDD)

**Test** (`__tests__/mempool-viz.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { MempoolVisualizer } from '../src/mempool-viz';

describe('Mempool Visualizer', () => {
  test('should create mempool visualization', () => {
    const viz = new MempoolVisualizer();
    const mempool = viz.createMempoolViz();
    expect(mempool).toBeDefined();
  });

  test('should update mempool counts', () => {
    const viz = new MempoolVisualizer();
    const mempool = viz.createMempoolViz();
    viz.updateCounts(mempool, { raw: 10, processing: 5, final: 2 });
    expect(mempool.userData.raw).toBe(10);
  });

  test('should create bar chart for mempool', () => {
    const viz = new MempoolVisualizer();
    const chart = viz.createBarChart({ raw: 10, processing: 5, final: 2 });
    expect(chart.children.length).toBe(3); // 3 bars
  });
});
```

**Implementation** (`src/mempool-viz.js`):

```javascript
import * as THREE from 'three';

export class MempoolVisualizer {
  constructor() {
    this.barWidth = 0.2;
    this.barSpacing = 0.3;
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
      { name: 'raw', count: counts.raw, color: 0xff0000 },
      { name: 'processing', count: counts.processing, color: 0xffff00 },
      { name: 'final', count: counts.final, color: 0x00ff00 }
    ];
    
    stages.forEach((stage, index) => {
      const bar = this.createBar(stage.count, stage.color, index);
      mempool.add(bar);
    });
  }

  createBar(count, color, index) {
    const height = Math.max(0.1, count * 0.01); // Scale height
    const geometry = new THREE.BoxGeometry(this.barWidth, height, this.barWidth);
    const material = new THREE.MeshStandardMaterial({ color });
    const bar = new THREE.Mesh(geometry, material);
    
    bar.position.set(
      index * this.barSpacing - this.barSpacing,
      height / 2,
      0
    );
    
    return bar;
  }

  createBarChart(counts) {
    const group = new THREE.Group();
    this.updateCounts(group, counts);
    return group;
  }
}
```

### Step 5: State Machine Visualization (TDD)

**Test** (`__tests__/state-viz.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { StateMachineVisualizer } from '../src/state-viz';

describe('State Machine Visualizer', () => {
  test('should create state node', () => {
    const viz = new StateMachineVisualizer();
    const node = viz.createStateNode('state1', {});
    expect(node).toBeDefined();
  });

  test('should create state transition', () => {
    const viz = new StateMachineVisualizer();
    const node1 = viz.createStateNode('state1', {});
    const node2 = viz.createStateNode('state2', {});
    const transition = viz.createTransition(node1, node2);
    expect(transition).toBeDefined();
  });

  test('should update state', () => {
    const viz = new StateMachineVisualizer();
    const node = viz.createStateNode('state1', { value: 10 });
    viz.updateState(node, { value: 20 });
    expect(node.userData.value).toBe(20);
  });
});
```

**Implementation** (`src/state-viz.js`):

```javascript
import * as THREE from 'three';

export class StateMachineVisualizer {
  constructor() {
    this.nodeRadius = 0.2;
    this.nodeSpacing = 1.0;
  }

  createStateNode(id, state) {
    const geometry = new THREE.SphereGeometry(this.nodeRadius, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0x0099ff });
    const node = new THREE.Mesh(geometry, material);
    
    node.userData = { id, state };
    return node;
  }

  createTransition(fromNode, toNode) {
    const points = [
      new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z),
      new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(geometry, material);
    
    return line;
  }

  updateState(node, newState) {
    node.userData.state = { ...node.userData.state, ...newState };
    // Update visual representation based on state
    if (newState.value !== undefined) {
      node.scale.set(1 + newState.value * 0.1, 1 + newState.value * 0.1, 1 + newState.value * 0.1);
    }
  }
}
```

### Step 6: Vue Component Integration (TDD)

**Test** (`__tests__/visualizer-component.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { mount } from '@vue/test-utils';
import VisualizerComponent from '../src/components/Visualizer.vue';

describe('Visualizer Component', () => {
  test('should render visualizer', () => {
    const wrapper = mount(VisualizerComponent);
    expect(wrapper.find('.visualizer-container').exists()).toBe(true);
  });

  test('should update on data change', async () => {
    const wrapper = mount(VisualizerComponent);
    await wrapper.setProps({ cubeData: { blocks: 10 } });
    expect(wrapper.vm.cubeData.blocks).toBe(10);
  });
});
```

**Implementation** (`src/components/Visualizer.vue`):

```vue
<template>
  <div class="visualizer-container">
    <div ref="container" class="canvas-container"></div>
    <div class="controls">
      <button @click="toggleAnimation">Toggle Animation</button>
      <button @click="resetCamera">Reset Camera</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Scene3D } from '../scene';
import { CubicVisualizer } from '../cubic-viz';
import { MempoolVisualizer } from '../mempool-viz';

const props = defineProps({
  cubeData: Object,
  mempoolData: Object,
  stateData: Object
});

const container = ref(null);
let scene = null;
let cubicViz = null;
let mempoolViz = null;

onMounted(() => {
  if (container.value) {
    scene = new Scene3D({ container: container.value });
    cubicViz = new CubicVisualizer();
    mempoolViz = new MempoolVisualizer();
    
    // Add initial visualizations
    if (props.cubeData) {
      updateCubeVisualization();
    }
    if (props.mempoolData) {
      updateMempoolVisualization();
    }
  }
});

onUnmounted(() => {
  if (scene) {
    scene.dispose();
  }
});

watch(() => props.cubeData, () => {
  updateCubeVisualization();
}, { deep: true });

watch(() => props.mempoolData, () => {
  updateMempoolVisualization();
}, { deep: true });

function updateCubeVisualization() {
  if (!scene || !cubicViz) return;
  // Update cube visualization based on props.cubeData
}

function updateMempoolVisualization() {
  if (!scene || !mempoolViz) return;
  // Update mempool visualization based on props.mempoolData
}

function toggleAnimation() {
  // Toggle animation
}

function resetCamera() {
  if (scene) {
    scene.camera.position.set(0, 0, 5);
  }
}
</script>

<style scoped>
.visualizer-container {
  width: 100%;
  height: 100vh;
  position: relative;
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 100;
}
</style>
```

## Interfaces/APIs

### Exported Classes

```javascript
export class Scene3D {
  constructor(options: SceneOptions);
  render(): void;
  handleResize(width: number, height: number): void;
}

export class CubicVisualizer {
  createCube(width: number, height: number, depth: number): THREE.Group;
  createBlock(x: number, y: number, z: number, data?: BlockData): THREE.Mesh;
  addBlock(cube: THREE.Group, x: number, y: number, z: number, data: BlockData): void;
}

export class MempoolVisualizer {
  createMempoolViz(): THREE.Group;
  updateCounts(mempool: THREE.Group, counts: MempoolCounts): void;
}
```

## Testing

### Test Scenarios

1. **Scene Rendering**
   - Scene creation
   - Camera setup
   - Render loop

2. **Cubic Visualization**
   - Cube creation
   - Block addition
   - Face structure

3. **Mempool Visualization**
   - Bar charts
   - Count updates
   - Color coding

4. **State Machine Visualization**
   - State nodes
   - Transitions
   - State updates

5. **Vue Integration**
   - Component rendering
   - Props handling
   - Event handling

### Coverage Goals

- 90%+ code coverage
- All visualization types tested
- Performance benchmarks
- Browser compatibility

## Integration Notes

### Module Dependencies

- **All XMBL modules**: Subscribe to events for real-time updates

### Integration Pattern

```javascript
import { VisualizerComponent } from 'xv';
import { XCLT } from 'xclt';
import { XPC } from 'xpc';

// Subscribe to module events
xclt.on('block:added', (block) => {
  visualizer.updateCube(block);
});

xpc.on('mempool:update', (counts) => {
  visualizer.updateMempool(counts);
});
```

## Terminal and Browser Monitoring

### Terminal Output

- **Visualization Status**: Log visualization state
  ```javascript
  console.log('Visualizer started');
  ```

- **Performance**: Log FPS and render stats
  ```javascript
  console.log(`FPS: ${stats.fps}, Objects: ${scene.children.length}`);
  ```

### Screenshot Requirements

Capture browser screenshots for:
- 3D cubic ledger visualization
- Mempool bar charts
- State machine graphs
- Storage/compute maps

### Browser Console

- **Performance**: Monitor FPS in console
- **WebGL**: Check WebGL context
- **Memory**: Monitor memory usage
- **Errors**: Log rendering errors

### Console Logging

- Log visualization updates
- Include performance metrics
- Log WebGL errors
- Include object counts
