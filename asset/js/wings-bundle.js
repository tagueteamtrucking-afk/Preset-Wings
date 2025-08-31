import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMUtils, VRMLoaderPlugin } from 'https://unpkg.com/@pixiv/three-vrm@2.0.3/lib/three-vrm.module.js';

// === VRM Loader ===
export async function loadVRM(url, scene) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      async (gltf) => {
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        const vrm = gltf.userData.vrm;
        scene.add(vrm.scene);
        vrm.scene.traverse((obj)=>{ obj.frustumCulled = false; });
        resolve(vrm);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

// === Find a reasonable attach node (Chest/Spine/Back) ===
export function findAttachNode(vrm){
  const candidates = ['UpperChest','Chest','Spine','Back','Torso'];
  if (vrm?.humanoid) {
    for (const name of candidates){
      try {
        const n = vrm.humanoid.getRawBoneNode?.(name) || vrm.humanoid.getNormalizedBoneNode?.(name);
        if (n) return n;
      } catch(e) {}
    }
  }
  let found = null;
  vrm.scene.traverse((o)=>{
    if(found) return;
    const n = (o.name||'').toLowerCase();
    if(['upperchest','chest','spine','back','torso'].some(k=>n.includes(k))) found = o;
  });
  return found || vrm.scene;
}

// === Attach GLB wings ===
export async function attachWingsFromGLB(vrm, glbUrl, opts={}){
  const { scale=1.0, offset=new THREE.Vector3(0,0.12,-0.05), rotation=new THREE.Euler(0,0,0) } = opts;
  const loader = new GLTFLoader();
  const gltf = await new Promise((res, rej)=> loader.load(glbUrl, res, undefined, rej));
  const wings = gltf.scene;
  wings.name = 'WingsGLB';
  wings.scale.setScalar(scale);
  wings.position.copy(offset);
  wings.rotation.copy(rotation);

  detachWings(vrm);
  const anchor = findAttachNode(vrm);
  anchor.add(wings);
  vrm.userData.wings = wings;
  return wings;
}

// === Manufacture wings from a PNG (billboard style, mirrored) ===
export async function attachWingsFromPNG(vrm, pngUrl, opts={}){
  const { width=0.7, height=0.7, spread=0.5, offset=new THREE.Vector3(0,0.12,-0.05) } = opts;
  const loader = new THREE.TextureLoader();
  const tex = await new Promise((res, rej)=> loader.load(pngUrl, res, undefined, rej));
  tex.flipY = false;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, depthWrite: false });
  const geo = new THREE.PlaneGeometry(width, height);

  const left = new THREE.Mesh(geo, mat);
  const right = new THREE.Mesh(geo, mat.clone());
  left.position.set(-spread, 0, 0);
  right.position.set(spread, 0, 0);
  right.scale.x = -1; // mirror

  const group = new THREE.Group();
  group.name = 'WingsPNG';
  group.add(left, right);
  group.position.copy(offset);

  detachWings(vrm);
  const anchor = findAttachNode(vrm);
  anchor.add(group);
  vrm.userData.wings = group;
  return group;
}

export function detachWings(vrm){
  const w = vrm?.userData?.wings;
  if(w && w.parent){ w.parent.remove(w); }
  if(vrm?.userData) vrm.userData.wings = null;
}

// Simple wing flapping animator
export function makeWingFlap(updateTarget){
  let t = 0;
  return (dt)=>{
    t += dt;
    const amp = 0.35, freq = 1.8; // tweak as desired
    const angle = Math.sin(t*freq)*amp;
    const g = updateTarget?.();
    if(!g) return;
    g.children.forEach((c, i)=>{ c.rotation.z = (i===0?1:-1) * angle; });
  };
}

// Minimal scene bootstrapping used by Wing Lab
export function createBasicScene({canvas}){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, canvas.clientWidth/canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 1.45, 2.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3,4,2);
  scene.add(dir);

  const grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
  grid.position.y = -1.0;
  scene.add(grid);

  const clock = new THREE.Clock();
  function onResize(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, controls, clock };
}
