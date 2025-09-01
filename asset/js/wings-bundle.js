/**
 * wings-bundle.js
 * Drop-in utility to load a wing model (FBX/GLTF/VRM) and attach it to a VRM avatar's chest.
 * Includes an on-page UI with sliders for position/rotation/scale and a "Lock" toggle.
 *
 * Requirements (via <script type="module"> or bundler):
 *  - three (r152+)
 *  - three/examples/jsm/loaders/FBXLoader.js
 *  - three/examples/jsm/loaders/GLTFLoader.js
 *  - @pixiv/three-vrm (for VRM humanoid lookups)
 *
 * Usage:
 *   import { WingRig, loadWingsList } from "../asset/js/wings-bundle.js";
 *   const rig = new WingRig(vrm); // vrm is an instance of VRM
 *   await rig.load("asset/models/wings/angel_wings.fbx");
 *   rig.showUI(); // sliders overlay
 *
 * Or use initWingsLab(...) on the wings-lab.html page we provide below.
 */

import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils, VRM } from 'https://unpkg.com/@pixiv/three-vrm@3.2.0/lib/three-vrm.module.js';

export async function loadWingsList(url = 'asset/models/wings/wings.json') {
  // Fetch a JSON array of wing file paths (relative to site root)
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load wings list: ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('wings.json must be an array of file paths');
  return list;
}

export class WingRig {
  constructor(vrm, { autoAttach = true } = {}) {
    if (!vrm) throw new Error('WingRig requires a VRM instance');
    this.vrm = vrm;
    this.group = new THREE.Group();
    this.group.name = 'WingRig';
    this.locked = false;

    // Default transforms (relative to chest)
    this.state = {
      px: 0, py: 0.16, pz: -0.04,
      rx: 0, ry: 0, rz: 0,
      sx: 1.0, sy: 1.0, sz: 1.0
    };

    if (autoAttach) this.attachToChest();
  }

  getChest() {
    const chest = this.vrm?.humanoid?.getBoneNode('chest') ||
                  this.vrm?.humanoid?.getBoneNode('spine') ||
                  this.vrm?.scene;
    return chest || this.vrm?.scene;
  }

  attachToChest() {
    const chest = this.getChest();
    if (!chest) throw new Error('Could not find chest/spine on VRM');
    chest.add(this.group);
    this.applyState();
  }

  applyState() {
    const g = this.group;
    const s = this.state;
    g.position.set(s.px, s.py, s.pz);
    g.rotation.set(s.rx, s.ry, s.rz);
    g.scale.set(s.sx, s.sy, s.sz);
  }

  async load(url) {
    const ext = url.split('.').pop().toLowerCase();
    const parent = this.group;
    // clear previous
    while (parent.children.length) parent.remove(parent.children[0]);

    if (ext === 'fbx') {
      const loader = new FBXLoader();
      const obj = await loader.loadAsync(url);
      obj.traverse(n => n.isMesh && (n.castShadow = n.receiveShadow = true));
      parent.add(obj);
    } else if (ext === 'gltf' || ext === 'glb') {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const obj = gltf.scene || gltf.scenes?.[0];
      if (!obj) throw new Error('GLTF scene missing');
      obj.traverse(n => n.isMesh && (n.castShadow = n.receiveShadow = true));
      parent.add(obj);
    } else if (ext === 'vrm') {
      // Load a VRM as a wing (for VRM-based accessories)
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      const { vrm } = await VRM.from(gltf);
      const node = vrm.scene;
      node.traverse(n => n.isMesh && (n.castShadow = n.receiveShadow = true));
      parent.add(node);
    } else {
      throw new Error(`Unsupported wing format: .${ext}`);
    }
  }

  showUI(container = document.body) {
    // Basic overlay UI with sliders, no external libs
    if (this._ui) return;
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.top = '12px';
    wrap.style.right = '12px';
    wrap.style.zIndex = '9999';
    wrap.style.background = 'rgba(20,20,28,0.72)';
    wrap.style.backdropFilter = 'blur(8px)';
    wrap.style.padding = '12px';
    wrap.style.borderRadius = '12px';
    wrap.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Roboto, "Segoe UI"';
    wrap.style.color = '#eee';
    wrap.style.width = '280px';
    wrap.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Wing Controls</strong>
        <button id="wingLock" style="border:1px solid #666;border-radius:8px;padding:4px 10px;background:#222;color:#eee;cursor:pointer">Lock</button>
      </div>
      <label>Wing file:
        <select id="wingFile" style="width:100%;margin:6px 0;padding:6px;border-radius:8px;background:#1d1d25;color:#ddd;border:1px solid #555"></select>
      </label>
      <div id="sliders"></div>
    `;

    const sliderSpec = [
      ['px', -0.50, 0.50, 0.001],
      ['py', -0.50, 0.80, 0.001],
      ['pz', -0.80, 0.80, 0.001],
      ['rx', -Math.PI, Math.PI, 0.001],
      ['ry', -Math.PI, Math.PI, 0.001],
      ['rz', -Math.PI, Math.PI, 0.001],
      ['sx', 0.10, 3.00, 0.001],
      ['sy', 0.10, 3.00, 0.001],
      ['sz', 0.10, 3.00, 0.001],
    ];

    const sliders = wrap.querySelector('#sliders');
    for (const [key, min, max, step] of sliderSpec) {
      const row = document.createElement('div');
      row.style.margin = '4px 0 10px';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${key.toUpperCase()}</span><span id="${key}Val">${this.state[key].toFixed(3)}</span>
        </div>
        <input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${this.state[key]}" style="width:100%">
      `;
      sliders.appendChild(row);
    }

    const lockBtn = wrap.querySelector('#wingLock');
    lockBtn.addEventListener('click', () => {
      this.locked = !this.locked;
      lockBtn.textContent = this.locked ? 'Locked' : 'Lock';
      lockBtn.style.background = this.locked ? '#375a7f' : '#222';
    });

    sliders.addEventListener('input', (e) => {
      if (this.locked) return;
      if (e.target && e.target.type === 'range') {
        const id = e.target.id;
        const v = parseFloat(e.target.value);
        this.state[id] = v;
        wrap.querySelector(`#${id}Val`).textContent = v.toFixed(3);
        this.applyState();
      }
    });

    // Populate wing list from wings.json
    const wingSelect = wrap.querySelector('#wingFile');
    loadWingsList().then(list => {
      if (list.length === 0) {
        const opt = document.createElement('option');
        opt.value = ''; opt.text = 'No wings found — run build-wings-manifest.ps1';
        wingSelect.appendChild(opt);
      } else {
        for (const p of list) {
          const opt = document.createElement('option');
          opt.value = p; opt.text = p.replace(/^.*\//, '');
          wingSelect.appendChild(opt);
        }
      }
    });

    wingSelect.addEventListener('change', async () => {
      if (!wingSelect.value) return;
      try {
        await this.load(wingSelect.value);
      } catch (err) {
        alert('Failed to load wings: ' + err.message);
      }
    });

    container.appendChild(wrap);
    this._ui = wrap;
  }
}

/**
 * Optional: fully-initialized lab page bootstrap.
 * Requires a <canvas id="scene"></canvas> in the HTML.
 */
export async function initWingsLab({
  canvasId = 'scene',
  modelName = 'WhiteStar', // must exist in models.json
  bg = '#0b0b12'
} = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error('Missing canvas #' + canvasId);

  // renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  // scene & camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0.0, 1.5, 3.2);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(2, 4, 3);
  dir.castShadow = true;
  scene.add(dir);

  // ground
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x22222a, metalness: 0.2, roughness: 0.8 })
  );
  g.rotation.x = -Math.PI/2;
  g.receiveShadow = true;
  scene.add(g);

  // Load manifest & choose model
  const manifestRes = await fetch('asset/models/models.json', { cache: 'no-store' });
  const manifest = await manifestRes.json();
  const item = manifest.find(x => x.name.toLowerCase() === modelName.toLowerCase()) || manifest[0];
  if (!item) throw new Error('models.json is empty');

  // Load VRM
  const gltfLoader = new GLTFLoader();
  const gltf = await gltfLoader.loadAsync(item.file);
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  const { vrm } = await VRM.from(gltf);
  scene.add(vrm.scene);

  // Simple idle sway
  let t = 0;
  function animate() {
    t += 0.016;
    const chest = vrm?.humanoid?.getBoneNode('chest');
    if (chest) chest.rotation.z = Math.sin(t * 0.6) * 0.03;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Wing rig + UI
  const rig = new WingRig(vrm);
  rig.showUI();
  return { scene, camera, renderer, vrm, rig };
}
