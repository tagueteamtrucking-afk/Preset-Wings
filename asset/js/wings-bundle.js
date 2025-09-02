
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils, VRM } from 'https://unpkg.com/@pixiv/three-vrm@3.2.0/lib/three-vrm.module.js';

export async function loadWingsList(url='asset/models/wings/wings.json'){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) return []; const j=await r.json(); return Array.isArray(j)?j:[]; }

function guessTextureSet(list, base){ const m=p=>p.toLowerCase().includes(base.toLowerCase()); return {
  diffuse:list.find(p=>m(p)&&/\.png$/i.test(p)&&!/_c\.|_nrm\.|_e\.|_alpha\.|_mask\./i.test(p)),
  c:list.find(p=>m(p)&&/_c\.png$/i.test(p)),
  nrm:list.find(p=>m(p)&&/_nrm\.png$/i.test(p)),
  e:list.find(p=>m(p)&&/_e\.png$/i.test(p)),
  alpha:list.find(p=>m(p)&&/(_alpha|_mask)\.png$/i.test(p))
}; }

async function applyAutoTextures(obj, tex){ const L=new THREE.TextureLoader();
  const dif=tex.diffuse?await L.loadAsync(tex.diffuse):null; const n=tex.nrm?await L.loadAsync(tex.nrm):null; const e=tex.e||tex.c?await L.loadAsync(tex.e||tex.c):null; const a=tex.alpha?await L.loadAsync(tex.alpha):null;
  obj.traverse(s=>{ if(!s.isMesh) return; const m=s.material=new THREE.MeshStandardMaterial({color:0xffffff,metalness:0.2,roughness:0.8}); if(dif){ m.map=dif; m.map.colorSpace=THREE.SRGBColorSpace; } if(n) m.normalMap=n; if(e){ m.emissiveMap=e; m.emissive=new THREE.Color(0xffffff); m.emissiveIntensity=0.6; } if(a){ m.alphaMap=a; m.transparent=true; m.depthWrite=false; } m.needsUpdate=true; });
}

export class WingRig{ constructor(vrm,{autoAttach=true}={}){ this.vrm=vrm; this.group=new THREE.Group(); this.group.name='WingRig'; this.locked=false; this.state={px:0,py:0.16,pz:-0.04,rx:0,ry:0,rz:0,sx:1,sy:1,sz:1}; if(autoAttach) this.attachToChest(); }
  getChest(){ return this.vrm?.humanoid?.getBoneNode('chest')||this.vrm?.humanoid?.getBoneNode('spine')||this.vrm?.scene; }
  attachToChest(){ const chest=this.getChest(); chest.add(this.group); this.applyState(); }
  applyState(){ const g=this.group,s=this.state; g.position.set(s.px,s.py,s.pz); g.rotation.set(s.rx,s.ry,s.rz); g.scale.set(s.sx,s.sy,s.sz); }
  async load(url){ const ext=url.split('.').pop().toLowerCase(); while(this.group.children.length) this.group.remove(this.group.children[0]);
    if(ext==='fbx'){ const L=new FBXLoader(); const obj=await L.loadAsync(url); obj.traverse(n=>n.isMesh&&(n.castShadow=n.receiveShadow=true)); this.group.add(obj);
      const folder=url.split('/').slice(0,-1).join('/')+'/'; let list=await loadWingsList(); list=list.filter(p=>p.startsWith(folder));
      const base=url.replace(folder,'').replace(/\.[^/.]+$/,'').replace(/[^a-z0-9]+/gi,'').toLowerCase(); const tex=guessTextureSet(list, base);
      if(tex.diffuse||tex.nrm||tex.e||tex.c||tex.alpha) await applyAutoTextures(obj, tex);
    } else if(ext==='gltf'||ext==='glb'){ const L=new GLTFLoader(); const gltf=await L.loadAsync(url); const obj=gltf.scene||gltf.scenes?.[0]; if(!obj) throw new Error('GLTF scene missing'); obj.traverse(n=>n.isMesh&&(n.castShadow=n.receiveShadow=true)); this.group.add(obj);
    } else if(ext==='vrm'){ const L=new GLTFLoader(); const gltf=await L.loadAsync(url); VRMUtils.removeUnnecessaryJoints(gltf.scene); const { vrm } = await VRM.from(gltf); const node=vrm.scene; node.traverse(n=>n.isMesh&&(n.castShadow=n.receiveShadow=true)); this.group.add(node);
    } else { throw new Error('Unsupported wing format: '+ext); } }
  showUI(container=document.body){ if(this._ui) return; const wrap=document.createElement('div'); wrap.style="position:fixed;top:12px;right:12px;z-index:9999;background:rgba(20,20,28,0.72);backdrop-filter:blur(8px);padding:12px;border-radius:12px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;color:#eee;width:280px;box-shadow:0 6px 24px rgba(0,0,0,0.35)";
    wrap.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Wing Controls</strong><button id="wingLock" style="border:1px solid #666;border-radius:8px;padding:4px 10px;background:#222;color:#eee;cursor:pointer">Lock</button></div>
      <label>Wing file:<select id="wingFile" style="width:100%;margin:6px 0;padding:6px;border-radius:8px;background:#1d1d25;color:#ddd;border:1px solid #555"></select></label><div id="sliders"></div>`;
    const spec=[['px',-0.5,0.5,0.001],['py',-0.5,0.8,0.001],['pz',-0.8,0.8,0.001],['rx',-Math.PI,Math.PI,0.001],['ry',-Math.PI,Math.PI,0.001],['rz',-Math.PI,Math.PI,0.001],['sx',0.1,3,0.001],['sy',0.1,3,0.001],['sz',0.1,3,0.001]];
    const sliders=wrap.querySelector('#sliders'); for(const [k,min,max,step] of spec){ const row=document.createElement('div'); row.style="margin:4px 0 10px"; row.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${k.toUpperCase()}</span><span id="${k}Val">${this.state[k].toFixed(3)}</span></div><input id="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${this.state[k]}" style="width:100%">`; sliders.appendChild(row); }
    const lock=wrap.querySelector('#wingLock'); lock.onclick=()=>{ this.locked=!this.locked; lock.textContent=this.locked?'Locked':'Lock'; lock.style.background=this.locked?'#375a7f':'#222'; };
    sliders.oninput=(e)=>{ if(this.locked) return; if(e.target && e.target.type==='range'){ const id=e.target.id, v=parseFloat(e.target.value); this.state[id]=v; wrap.querySelector(`#${id}Val`).textContent=v.toFixed(3); this.applyState(); } };
    const sel = wrap.querySelector('#wingFile'); loadWingsList().then(list=>{ if(list.length===0){ const opt=document.createElement('option'); opt.value=''; opt.text='No wings found (run tools/build-wings-manifest.ps1)'; sel.appendChild(opt);} else { for(const p of list){ const opt=document.createElement('option'); opt.value=p; opt.text=p.replace(/^.*\\//,''); sel.appendChild(opt);} } });
    sel.onchange=async()=>{ if(!sel.value) return; try{ await this.load(sel.value);}catch(err){ alert('Failed to load wings: '+err.message);} };
    container.appendChild(wrap); this._ui = wrap; }
}