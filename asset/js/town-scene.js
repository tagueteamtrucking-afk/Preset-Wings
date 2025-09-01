
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';

const SCENE_BG = 0x0b0b12;

function makeLabel(text='Building') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 8, fs = 24;
  ctx.font = `${fs}px ui-sans-serif,system-ui,Segoe UI,Roboto`;
  const w = Math.floor(ctx.measureText(text).width) + pad*2;
  const h = fs + pad*2;
  canvas.width = w; canvas.height = h;
  ctx.font = `${fs}px ui-sans-serif,system-ui,Segoe UI,Roboto`;
  ctx.fillStyle = 'rgba(8,8,12,0.75)';
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(0.5,0.5,w-1,h-1);
  ctx.fillStyle = '#e6e6f0';
  ctx.textBaseline = 'top';
  ctx.fillText(text, pad, pad);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const spr = new THREE.Sprite(mat);
  const scale = 0.018; // world units per pixel
  spr.scale.set(w*scale, h*scale, 1);
  spr.position.set(0, 2.2, 0);
  spr.renderOrder = 999;
  return spr;
}

export async function bootTown(canvasId='scene') {
  const canvas = document.getElementById(canvasId);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  scene.fog = new THREE.FogExp2(SCENE_BG, 0.035);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(12, 12, 18);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 6;
  controls.maxDistance = 45;

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(5, 10, 4);
  dir.castShadow = true;
  scene.add(dir);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.2, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(50, 50, 0x404050, 0x202028);
  grid.position.y = 0.01;
  scene.add(grid);

  // Load buildings
  const loader = new GLTFLoader();
  const res = await fetch('asset/models/buildings/town_layout.json', { cache: 'no-store' });
  const layout = await res.json();
  const interactables = [];
  for (const b of layout) {
    try {
      const gltf = await loader.loadAsync(b.glb);
      const g = new THREE.Group();
      g.name = b.name;
      g.userData.page = b.page;
      const node = gltf.scene;
      node.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      g.add(node);
      g.position.set(...b.pos);
      g.rotation.set(...b.rot);
      g.scale.set(...b.s);
      const label = makeLabel(b.title || b.name);
      g.add(label);
      scene.add(g);
      interactables.push(g);
    } catch (err) {
      console.error('Failed to load', b.glb, err);
    }
  }

  // Raycast for clicks
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  function onClick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = [];
    for (const g of interactables) g.traverse(n => { if (n.isMesh) meshes.push(n); });
    const hit = raycaster.intersectObjects(meshes, true)[0];
    if (hit) {
      let target = hit.object;
      while (target && !target.userData.page) target = target.parent;
      if (target && target.userData.page) {
        window.location.href = target.userData.page;
      }
    }
  }
  renderer.domElement.addEventListener('click', onClick);

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animate
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Return for debugging if needed
  return { scene, camera, renderer, controls };
}
