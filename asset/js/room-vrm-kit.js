
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils, VRM } from 'https://unpkg.com/@pixiv/three-vrm@3.2.0/lib/three-vrm.module.js';
import { WingRig } from './wings-bundle.js';

async function loadGLB(url){ const L=new GLTFLoader(); const gltf=await L.loadAsync(url); const node=gltf.scene||gltf.scenes?.[0]; const root=new THREE.Group(); node.traverse(n=>{ if(n.isMesh){n.castShadow=n.receiveShadow=true;} }); root.add(node.clone(true)); return root; }

export async function boot(canvasId='scene', roomName='palace_throne', modelPath=''){
  const canvas=document.getElementById(canvasId); const renderer=new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio||1)); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();
  const cfg=await (await fetch('../asset/models/buildings/room_configs.json',{cache:'no-store'})).json().then(j=>j[roomName]); if(!cfg) throw new Error('Unknown room: '+roomName);
  scene.background=new THREE.Color(cfg.sky||'#0b0b12'); const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.1,120); camera.position.set(0,2.4,6.5);
  scene.add(new THREE.HemisphereLight(0xffffff,0x223344,0.7)); const dir=new THREE.DirectionalLight(0xffffff,0.9); dir.position.set(3,6,2); dir.castShadow=true; scene.add(dir);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(12,48), new THREE.MeshStandardMaterial({color:cfg.floor||'#23232e',metalness:0.2,roughness:0.85})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  const room=await loadGLB('../'+cfg.glb); scene.add(room);
  if(!modelPath){ const map=await (await fetch('../asset/models/buildings/room_characters.json',{cache:'no-store'})).json().catch(()=>({})); const file=map[roomName]||''; modelPath = file?('../asset/models/'+file):''; }
  let vrm; if(modelPath){ const L=new GLTFLoader(); const gltf=await L.loadAsync(modelPath); VRMUtils.removeUnnecessaryJoints(gltf.scene); ({ vrm } = await VRM.from(gltf)); scene.add(vrm.scene); const rig=new WingRig(vrm); rig.showUI(); }
  addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  (function animate(){ renderer.render(scene,camera); requestAnimationFrame(animate); })();
}
