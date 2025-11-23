import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'stats.js';

export class Scene3D {
  constructor(options) {
    this.container = options.container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);
    
    // OrbitControls for full camera control
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 100;
    this.controls.target.set(0, 0, 0);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    
    // Add axes helper
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    
    // Stats for performance monitoring
    this.stats = new Stats();
    this.stats.showPanel(0);
    document.body.appendChild(this.stats.dom);
    
    // Raycaster for object picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObject = null;
    this.onClickCallback = null;
    
    this.handleClick = (event) => {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      
      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData.isBlock && this.onClickCallback) {
          this.onClickCallback(object);
        }
      } else if (this.onClickCallback) {
        this.onClickCallback(null);
      }
    };
    
    this.renderer.domElement.addEventListener('click', this.handleClick);
    
    // Handle window resize
    this.handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', this.handleResize);
    
    this.animate();
  }

  setOnClickListener(callback) {
    this.onClickCallback = callback;
  }

  animate() {
    this.stats.begin();
    
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();
    
    this.render();
    
    this.stats.end();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    window.removeEventListener('resize', this.handleResize);
    
    if (this.controls) {
      this.controls.dispose();
    }
    
    if (this.stats && this.stats.dom) {
      document.body.removeChild(this.stats.dom);
    }
    
    // Dispose of all geometries and materials
    this.scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    this.renderer.dispose();
  }
}

