import * as THREE from 'three';

/**
 * XMBL 3D Visualizer
 * Renders cubic ledger structure, mempool, and network topology
 */
export class XMBLVisualizer {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.cubes = new Map(); // cubeId -> THREE.Mesh
    this.blocks = new Map(); // blockId -> THREE.Mesh
    
    this.setupScene();
    this.setupControls();
    this.animate();
  }

  setupScene() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    this.container.appendChild(this.renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);

    // Set camera position
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);
  }

  setupControls() {
    // Basic orbit controls (would use OrbitControls in full implementation)
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        // Rotate camera
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  /**
   * Add a cube to the visualization
   * @param {string} cubeId - Cube ID
   * @param {Object} position - {x, y, z} coordinates
   */
  addCube(cubeId, position) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(position.x, position.y, position.z);
    this.scene.add(cube);
    this.cubes.set(cubeId, cube);
  }

  /**
   * Add a block to the visualization
   * @param {string} blockId - Block ID
   * @param {Object} position - {x, y, z} coordinates
   */
  addBlock(blockId, position) {
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    const block = new THREE.Mesh(geometry, material);
    block.position.set(position.x, position.y, position.z);
    this.scene.add(block);
    this.blocks.set(blockId, block);
  }

  /**
   * Update cube color based on state
   * @param {string} cubeId - Cube ID
   * @param {string} state - State (complete, pending, etc.)
   */
  updateCubeState(cubeId, state) {
    const cube = this.cubes.get(cubeId);
    if (!cube) return;

    const colors = {
      complete: 0x00ff00,
      pending: 0xffff00,
      error: 0xff0000
    };

    cube.material.color.setHex(colors[state] || 0xffffff);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Resize renderer on window resize
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

