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
}
