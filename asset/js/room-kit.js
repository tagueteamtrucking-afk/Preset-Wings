
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';

async function loadGLB(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = new THREE.Group();
  const node = gltf.scene;
  node.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  root.add(node.clone(true));
  return root;
}

export async function bootRoom(canvasId='scene', roomName='palace_throne') {
  const canvas = document.getElementById(canvasId);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cfgRes = await fetch('../asset/models/buildings/room_configs.json', { cache: 'no-store' });
  const cfgJson = await cfgRes.json();
  const cfg = cfgJson[roomName];
  if (!cfg) throw new Error('Unknown room: ' + roomName);

  scene.background = new THREE.Color(cfg.sky || '#0b0b12');
  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0.0, 2.4, 6.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 3;
  controls.maxDistance = 20;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(3, 6, 2);
  dir.castShadow = true;
  scene.add(dir);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 48),
    new THREE.MeshStandardMaterial({ color: cfg.floor || '#23232e', metalness: 0.2, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  const room = await loadGLB('../' + cfg.glb);
  scene.add(room);

  try {
    const propsRes = await fetch('../asset/models/buildings/room_props.json', { cache: 'no-store' });
    const propsJson = await propsRes.json();
    const list = propsJson[roomName] || [];
    for (const p of list) {
      const prop = await loadGLB('../asset/models/props/' + p.type + '.glb');
      prop.position.set(...(p.pos || [0,0,0]));
      prop.rotation.set(...(p.rot || [0,0,0]));
      if (p.s) prop.scale.set(...p.s);
      scene.add(prop);
    }
  } catch (e) {
    console.warn('No props for room or failed to load props json', e);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
