// asset/js/room.js
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';

const hud = document.getElementById('hud');
const canvas = document.getElementById('scene');
const modelURL = document.body.dataset.model;
const [bgA, bgB] = (document.body.dataset.bg || '#111,#222').split(',');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(new THREE.Color(bgA), 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0.8, 1.5, 2.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.4, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x202028, 1.0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(2, 3, 2);
scene.add(dir);

// gradient backdrop plane
{
  const geo = new THREE.PlaneGeometry(20, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: { c1: { value: new THREE.Color(bgA) }, c2: { value: new THREE.Color(bgB) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 c1; uniform vec3 c2; void main(){ gl_FragColor=vec4(mix(c1,c2,vUv.y),1.0); }',
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1.5, -5);
  scene.add(mesh);
}

hud.textContent = 'Loading…';
const loader = new GLTFLoader();
loader.load(modelURL, (gltf) => {
  const root = gltf.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  // center & scale
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const s = 1.6 / size;
  root.scale.setScalar(s);

  scene.add(root);
  hud.textContent = '';

  const mixer = new THREE.AnimationMixer(root);
  if (gltf.animations && gltf.animations.length) {
    gltf.animations.forEach(clip => mixer.clipAction(clip).play());
  }

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}, undefined, (err)=>{
  hud.textContent = 'Load error.';
  console.error(err);
});

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
