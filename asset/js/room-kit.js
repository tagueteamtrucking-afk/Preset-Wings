
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';

async function loadGLB(url){ const L=new GLTFLoader(); const gltf=await L.loadAsync(url); const root=new THREE.Group(); const node=gltf.scene||gltf.scenes?.[0]; node.traverse(n=>{ if(n.isMesh){n.castShadow=n.receiveShadow=true;} }); root.add(node.clone(true)); return root; }

export async function bootRoom(canvasId='scene', roomName='palace_throne'){
  const canvas=document.getElementById(canvasId);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio||1)); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();
  const cfg=await (await fetch('../asset/models/buildings/room_configs.json',{cache:'no-store'})).json().then(j=>j[roomName]); if(!cfg) throw new Error('Unknown room: '+roomName);
  scene.background=new THREE.Color(cfg.sky||'#0b0b12');
  const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.1,120); camera.position.set(0,2.4,6.5);
  const controls=new OrbitControls(camera, renderer.domElement); controls.target.set(0,1.2,0); controls.enableDamping=true; controls.maxPolarAngle=Math.PI*0.49; controls.minDistance=3; controls.maxDistance=20;
  scene.add(new THREE.HemisphereLight(0xffffff,0x223344,0.9)); const dir=new THREE.DirectionalLight(0xffffff,1.1); dir.position.set(3,6,2); dir.castShadow=true; scene.add(dir);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(12,48), new THREE.MeshStandardMaterial({color:cfg.floor||'#23232e',metalness:0.2,roughness:0.85})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  const room=await loadGLB('../'+cfg.glb); scene.add(room);

  // Load simple props (non-interactive)
  try{
    const props=await (await fetch('../asset/models/buildings/room_props.json',{cache:'no-store'})).json(); const list=props[roomName]||[];
    for(const p of list){ const g=await loadGLB('../asset/models/props/'+p.type+'.glb'); if(p.pos) g.position.set(...p.pos); if(p.rot) g.rotation.set(...p.rot); if(p.s) g.scale.set(...p.s); scene.add(g); }
  }catch(e){ console.warn('No props or failed props json', e); }

  addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  (function animate(){ controls.update(); renderer.render(scene,camera); requestAnimationFrame(animate); })();
}
