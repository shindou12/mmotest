import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWalkState, stepWalk, tileAt } from './walk.js';
import { DioramaSfx } from './sfx.js';

const STAGE_IDS = ['meadow', 'canyon', 'snow', 'volcano', 'skyisles'];
const STAGE_NAMES = {
  demo: '仮の草原', meadow: '草原と湖', canyon: '砂漠の峡谷', snow: '雪山', volcano: '火山', skyisles: '浮島',
};
const STAGE_LIGHTS = {
  meadow: { sunDir: [0.45, 0.82, 0.34], sunColor: '#ffe7bf', sunPower: 3.0, skyColor: '#c6e6ff', groundColor: '#635747', hemiPower: 0.92, bgTop: '#82b9e9', bgBottom: '#e7eef1', fog: '#dceaf0', fogDensity: 0.008, bloom: 0.35, exposure: 1.0 },
  canyon: { sunDir: [0.76, 0.5, 0.34], sunColor: '#ffbd83', sunPower: 3.1, skyColor: '#f2b895', groundColor: '#583c34', hemiPower: 0.72, bgTop: '#a95743', bgBottom: '#eab886', fog: '#d99772', fogDensity: 0.008, bloom: 0.22, exposure: 0.94 },
  snow: { sunDir: [-0.35, 0.91, 0.25], sunColor: '#d9e9ff', sunPower: 2.6, skyColor: '#d7eaff', groundColor: '#455268', hemiPower: 1.02, bgTop: '#6685b4', bgBottom: '#d6e6f3', fog: '#d5e1ef', fogDensity: 0.01, bloom: 0.3, exposure: 1.0 },
  volcano: { sunDir: [0.3, 0.69, 0.55], sunColor: '#ff9b5c', sunPower: 1.8, skyColor: '#615265', groundColor: '#251f2b', hemiPower: 0.42, bgTop: '#302b43', bgBottom: '#84524d', fog: '#57444c', fogDensity: 0.009, bloom: 0.52, exposure: 0.88 },
  skyisles: { sunDir: [-0.25, 0.78, 0.58], sunColor: '#ffd0ac', sunPower: 2.3, skyColor: '#d0c9ff', groundColor: '#53445d', hemiPower: 0.8, bgTop: '#4d5298', bgBottom: '#cd9fc4', fog: '#8f81b3', fogDensity: 0.006, bloom: 0.42, exposure: 1.0 },
};
const PALETTE = {
  grass: '#679453', grass_top: '#83ad60', turf: '#58a79a', dirt: '#78563e', stone: '#818984', sand: '#d0a56d', sandstone: '#c88854', redrock: '#a6513b',
  snow: '#dce9ec', ice: '#82c5d8', basalt: '#45454b', ash: '#77747c', lava: '#ff6234', obsidian: '#30293b', planks: '#9a7048', wood: '#85563a', bark: '#71503a',
  leaves: '#5b8e54', pine: '#397058', cactus: '#568b63', crystal: '#77edff', cloudstone: '#babfe6', mushroom: '#d66d6c', water: '#4fa4c0', cobble: '#85847b', rock: '#777c7e', flowers: '#e8bc6d',
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const q = new URLSearchParams(location.search);

const root = document.getElementById('root');
const worldElement = document.getElementById('world');
const fadeElement = document.getElementById('stage-fade');
const stageSelect = document.getElementById('stage-select');
const soundButton = document.getElementById('sound-toggle');
const sfx = new DioramaSfx();
const loader = new GLTFLoader();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
const renderScale = clamp(Number(q.get('rscale')) || 1, 0.35, 1.2);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2) * renderScale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
worldElement.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dceaf0');
const camera = new THREE.PerspectiveCamera(27, window.innerWidth / window.innerHeight, 0.15, 700);
const pitch = THREE.MathUtils.degToRad(37.5);
const yaw = THREE.MathUtils.degToRad(45);
const cameraForwardXZ = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
const cameraRightXZ = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
const cameraGoal = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraCenter = new THREE.Vector3();
const focusDirection = new THREE.Vector3();
const focusOffset = new THREE.Vector3();
let cameraDistance = 26;
let baseCameraDistance = 26;
const sunDirection = new THREE.Vector3(0.45, 0.82, 0.34).normalize();

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  toneMapped: false,
  uniforms: { uTop: { value: new THREE.Color('#82b9e9') }, uBottom: { value: new THREE.Color('#e7eef1') } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying vec2 vUv; void main(){ float t=smoothstep(0.02,0.98,vUv.y); gl_FragColor=vec4(mix(uBottom,uTop,t),1.0); }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skyMaterial);
skyDome.scale.setScalar(300);
skyDome.renderOrder = -1000;
scene.add(skyDome);

const hemiLight = new THREE.HemisphereLight('#c6e6ff', '#635747', 0.92);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight('#ffe7bf', 3 / Math.PI);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near = 0.1;
sunLight.shadow.camera.far = 220;
sunLight.shadow.camera.left = -28;
sunLight.shadow.camera.right = 28;
sunLight.shadow.camera.top = 28;
sunLight.shadow.camera.bottom = -28;
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.025;
sunLight.shadow.radius = 3;
scene.add(sunLight);
scene.add(sunLight.target);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.62, 0.78);
bloomPass.threshold = 0.78;
composer.addPass(bloomPass);
const bokehPass = new BokehPass(scene, camera, { focus: 24, aperture: 0.02, maxblur: 0.0048 });
composer.addPass(bokehPass);
const finishPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.17 }, uSaturation: { value: 1.04 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSaturation; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
      c.rgb=mix(vec3(l),c.rgb,uSaturation); float d=length((vUv-0.5)*vec2(1.12,1.0));
      c.rgb*=1.0-uVignette*smoothstep(0.31,0.78,d); c.rgb*=vec3(1.012,1.004,0.99); gl_FragColor=vec4(c.rgb,1.0); }`,
});
composer.addPass(finishPass);
composer.addPass(new OutputPass());

let mode = 'loading';
let activeStageId = 'demo';
let activeStage = null;
let activeStageGroup = null;
let waterMaterials = [];
let glowMaterials = [];
let loadedHero = null;
let heroLoadAttempted = false;
let avatar = null;
let avatarParts = {};
let avatarBaseRotations = new Map();
let shadowDisc = null;
let particleField = null;
let walkState = null;
let requestedStage = null;
let switching = false;
let paused = false;
let lastFrameTime = 0;
let frameInfo = { calls: 0, triangles: 0 };
let fx = { bloom: 0.35, blur: 0.24 };
const heldKeys = new Set();
const pointerDrag = { active: false, pointerId: -1, x: 0, y: 0, moveX: 0, moveY: 0 };
const glowBaseValues = new Map();

function stageColor(name, fallback = '#ffffff') {
  const key = String(name || '').toLowerCase().replace(/[^a-z_]/g, '');
  for (const [material, color] of Object.entries(PALETTE)) if (key.includes(material)) return color;
  return fallback;
}

function stageForDemo(id) {
  const width = 20;
  const depth = 20;
  const height = new Array(width * depth).fill(-1);
  const surface = new Array(width * depth).fill(0);
  const blocked = new Array(width * depth).fill(0);
  const liquid = new Array(width * depth).fill(0);
  const materials = ['grass', 'dirt', 'stone', 'sand', 'water', 'leaves', 'bark', 'crystal', 'lava'];
  const at = (i, k) => k * width + i;
  for (let k = 0; k < depth; k++) {
    for (let i = 0; i < width; i++) {
      const dx = (i - 9.5) / 9.2;
      const dz = (k - 9.5) / 8.8;
      const radius = dx * dx + dz * dz;
      if (radius > 0.98) continue;
      const index = at(i, k);
      const raised = Math.abs(i - 9.5) < 4.5 && Math.abs(k - 9.5) < 4.3;
      height[index] = raised ? 1 : 0;
      surface[index] = raised ? 0 : radius > 0.72 ? 2 : 1;
      if ((i === 5 || i === 6) && (k === 7 || k === 8)) {
        surface[index] = 4;
        liquid[index] = 1;
      }
    }
  }
  const obstacles = id === 'volcano'
    ? [[5, 13], [13, 8], [14, 12]]
    : id === 'skyisles'
      ? [[5, 12], [13, 6], [14, 12]]
      : id === 'snow'
        ? [[5, 12], [15, 7], [13, 14]]
        : [[5, 12], [15, 7], [13, 14]];
  for (const [i, k] of obstacles) {
    const index = at(i, k);
    if (height[index] >= 0) blocked[index] = 1;
  }
  const light = { ...(STAGE_LIGHTS[id] || STAGE_LIGHTS.meadow) };
  return {
    id,
    name: STAGE_NAMES[id] || STAGE_NAMES.demo,
    seed: 188,
    size: [width, depth],
    height,
    surface,
    materials,
    blocked,
    liquid,
    spawn: [10, 10],
    light,
    ambience: ({ canyon: 'desert', snow: 'snow', volcano: 'volcano', skyisles: 'sky' })[id] || 'meadow',
    particles: ({ canyon: 'dust', snow: 'snow', volcano: 'ember', skyisles: 'spark' })[id] || 'pollen',
    fallback: true,
  };
}

function normalizeStage(raw, id) {
  const width = Math.max(1, Number(raw.size?.[0]) || 48);
  const depth = Math.max(1, Number(raw.size?.[1]) || 48);
  const count = width * depth;
  if (!Array.isArray(raw.height) || raw.height.length < count) return null;
  const light = { ...(STAGE_LIGHTS[id] || STAGE_LIGHTS.meadow), ...(raw.light || {}) };
  const stage = {
    ...raw,
    id,
    name: raw.name || STAGE_NAMES[id] || id,
    size: [width, depth],
    height: raw.height.slice(0, count).map((value) => Number.isFinite(Number(value)) ? Number(value) : -1),
    surface: Array.isArray(raw.surface) ? raw.surface.slice(0, count) : Array(count).fill(0),
    blocked: Array.isArray(raw.blocked) ? raw.blocked.slice(0, count) : Array(count).fill(0),
    liquid: Array.isArray(raw.liquid) ? raw.liquid.slice(0, count) : Array(count).fill(0),
    materials: Array.isArray(raw.materials) && raw.materials.length ? raw.materials : ['grass'],
    light,
  };
  stage.ambience ||= ({ canyon: 'desert', snow: 'snow', volcano: 'volcano', skyisles: 'sky' })[id] || 'meadow';
  stage.particles ||= ({ canyon: 'dust', snow: 'snow', volcano: 'ember', skyisles: 'spark' })[id] || 'pollen';
  return stage;
}

async function readStage(id) {
  if (id === 'demo') return { stage: stageForDemo('demo'), model: null, atlas: null };
  try {
    const response = await fetch(`./stages/${encodeURIComponent(id)}.json`);
    if (!response.ok) return { stage: stageForDemo(id), model: null, atlas: null };
    const stage = normalizeStage(await response.json(), id);
    if (!stage) return { stage: stageForDemo(id), model: null, atlas: null };
    const [modelResponse, atlasResponse] = await Promise.all([
      fetch(`./stages/${encodeURIComponent(id)}.glb`).catch(() => null),
      fetch('./tex/atlas.png').catch(() => null),
    ]);
    let model = null;
    let atlas = null;
    if (modelResponse?.ok) model = await parseGlb(await modelResponse.arrayBuffer());
    if (atlasResponse?.ok) atlas = await readAtlas(atlasResponse);
    return { stage, model, atlas };
  } catch {
    return { stage: stageForDemo(id), model: null, atlas: null };
  }
}

async function readAtlas(response) {
  try {
    const bitmap = await createImageBitmap(await response.blob());
    const texture = new THREE.CanvasTexture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

function parseGlb(buffer, basePath = new URL('./stages/', location.href).href) {
  return new Promise((resolve) => {
    loader.parse(buffer, basePath, (gltf) => resolve(gltf.scene), () => resolve(null));
  });
}

async function readHero() {
  heroLoadAttempted = true;
  try {
    const response = await fetch('./models/hero.glb');
    if (!response.ok) return null;
    return await parseGlb(await response.arrayBuffer(), new URL('./models/', location.href).href);
  } catch {
    return null;
  }
}

function createWaterMaterial(baseColor, foamColor, emissive = false) {
  const material = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(baseColor) },
      uFoam: { value: new THREE.Color(foamColor) },
      uEmissive: { value: emissive ? 1 : 0 },
    },
    vertexShader: `uniform float uTime; varying vec2 vUv; varying vec3 vLocal;
      void main(){ vUv=uv; vec3 p=position; p.z += sin((uv.x*17.0+uTime*0.34))*0.012; p.z += sin((uv.y*21.0-uTime*0.27))*0.009;
        vLocal=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uBase; uniform vec3 uFoam; uniform float uEmissive; varying vec2 vUv; varying vec3 vLocal;
      void main(){ float edge=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y));
        float ripple=sin(vUv.x*34.0+uTime*0.55)*sin(vUv.y*29.0-uTime*0.42);
        float shore=1.0-smoothstep(0.015,0.075,edge+ripple*0.005);
        float light=0.88+0.12*ripple; vec3 color=mix(uBase*light,uFoam,shore*0.46);
        if(uEmissive>0.5){ float pulse=0.82+0.18*sin(uTime*1.3+vUv.x*5.0+vUv.y*4.0); color*=pulse*1.8; }
        gl_FragColor=vec4(color,1.0); }`,
  });
  material.userData.dioramaLiquid = true;
  waterMaterials.push(material);
  return material;
}

function geometryMesh(geometry, material, x, y, z, parent = activeStageGroup) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function liquidColor(stage, lava = false) {
  if (lava) {
    if (stage.id === 'volcano') return ['#f45828', '#ffbe60'];
    if (stage.id === 'skyisles') return ['#85dcff', '#f0d1ff'];
    return ['#59a9c9', '#dcf2de'];
  }
  if (stage.id === 'skyisles') return ['#57a9cf', '#c9f5ff'];
  return ['#397f9c', '#e0f0d4'];
}

function addLiquidSurfaces(stage) {
  const [width, depth] = stage.size;
  const visited = new Uint8Array(width * depth);
  const waterCells = [];
  const lavaCells = [];
  for (let index = 0; index < width * depth; index++) {
    const kind = Number(stage.liquid?.[index] || 0);
    if (kind === 1) waterCells.push(index);
    if (kind === 2) lavaCells.push(index);
  }
  const components = [];
  for (const origin of waterCells) {
    if (visited[origin]) continue;
    const cells = [origin];
    visited[origin] = 1;
    for (let cursor = 0; cursor < cells.length; cursor++) {
      const index = cells[cursor];
      const i = index % width;
      const k = Math.floor(index / width);
      for (const [ni, nk] of [[i - 1, k], [i + 1, k], [i, k - 1], [i, k + 1]]) {
        if (ni < 0 || nk < 0 || ni >= width || nk >= depth) continue;
        const next = nk * width + ni;
        if (!visited[next] && Number(stage.liquid?.[next] || 0) === 1) { visited[next] = 1; cells.push(next); }
      }
    }
    components.push(cells);
  }
  const waterColors = liquidColor(stage);
  for (const cells of components) {
    const xs = cells.map((index) => index % width);
    const zs = cells.map((index) => Math.floor(index / width));
    const minI = Math.min(...xs); const maxI = Math.max(...xs);
    const minK = Math.min(...zs); const maxK = Math.max(...zs);
    const heights = cells.map((index) => Number(stage.height[index]) || 0);
    const level = Number.isFinite(Number(stage.waterLevel)) ? Number(stage.waterLevel) : Math.min(...heights) + 0.04;
    const material = createWaterMaterial(...waterColors, false);
    const mesh = geometryMesh(new THREE.PlaneGeometry(maxI - minI + 1, maxK - minK + 1, 8, 8), material, (minI + maxI + 1) / 2, level, (minK + maxK + 1) / 2);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
  }
  const lavaColors = liquidColor(stage, true);
  const lavaMaterial = createWaterMaterial(...lavaColors, true);
  for (const index of lavaCells) {
    const i = index % width;
    const k = Math.floor(index / width);
    const level = (Number(stage.height[index]) || 0) + 0.045;
    const mesh = geometryMesh(new THREE.PlaneGeometry(0.94, 0.94, 4, 4), lavaMaterial, i + 0.5, level, k + 0.5);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.userData.lavaTile = true;
  }
}

function addFallbackProps(stage) {
  const [width] = stage.size;
  const placeable = (i, k) => {
    const index = k * width + i;
    if (i < 0 || k < 0 || i >= width || k >= stage.size[1] || Number(stage.height[index]) < 0) return null;
    return { height: Number(stage.height[index]) || 0 };
  };
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#755138', roughness: 0.9, flatShading: true });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: stage.id === 'snow' ? '#477867' : stage.id === 'skyisles' ? '#3e9b91' : '#548a4b', roughness: 0.84, flatShading: true });
  const glowColor = stage.id === 'volcano' ? '#ff632c' : stage.id === 'skyisles' ? '#8deaff' : '#f2d47b';
  const glowMaterial = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 3.2, roughness: 0.35, flatShading: true, toneMapped: false });
  const crystalMaterial = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2.8, roughness: 0.25, flatShading: true, toneMapped: false });
  const addTree = (i, k, scale = 1) => {
    const tile = placeable(i, k);
    if (!tile) return;
    const rootGroup = new THREE.Group();
    rootGroup.position.set(i + 0.5, tile.height, k + 0.5);
    rootGroup.scale.setScalar(scale);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.92, 5), trunkMaterial);
    trunk.position.y = 0.46;
    trunk.castShadow = true;
    rootGroup.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.57, 1.1, 6, 1), leafMaterial);
    crown.position.y = 1.18;
    crown.castShadow = true;
    rootGroup.add(crown);
    activeStageGroup.add(rootGroup);
  };
  const addGlow = (i, k) => {
    const tile = placeable(i, k);
    if (!tile) return;
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 1), glowMaterial);
    glow.position.set(i + 0.5, tile.height + 0.82, k + 0.5);
    glow.castShadow = true;
    glow.userData.floatBaseY = glow.position.y;
    activeStageGroup.add(glow);
    glowMaterials.push({ material: glowMaterial, mesh: glow, baseIntensity: glowMaterial.emissiveIntensity });
    const light = new THREE.PointLight(glowColor, 0.55, 3.8, 2);
    light.position.copy(glow.position);
    activeStageGroup.add(light);
  };
  const addCrystal = (i, k) => {
    const tile = placeable(i, k);
    if (!tile) return;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.43, 0), crystalMaterial);
    crystal.position.set(i + 0.5, tile.height + 0.53, k + 0.5);
    crystal.rotation.y = 0.25;
    crystal.castShadow = true;
    crystal.userData.floatBaseY = crystal.position.y;
    activeStageGroup.add(crystal);
    glowMaterials.push({ material: crystalMaterial, mesh: crystal, baseIntensity: crystalMaterial.emissiveIntensity });
    const light = new THREE.PointLight(glowColor, 0.32, 3.2, 2);
    light.position.copy(crystal.position);
    activeStageGroup.add(light);
  };
  const center = Math.floor(width / 2);
  if (stage.id === 'volcano') {
    addTree(center - 5, center + 3, 0.8);
    addGlow(center + 3, center - 2);
    addGlow(center + 4, center + 2);
  } else if (stage.id === 'skyisles') {
    addTree(center - 5, center + 2, 1.15);
    addCrystal(center + 3, center - 3);
    addCrystal(center + 4, center + 3);
  } else if (stage.id === 'snow') {
    addTree(center - 5, center + 2, 1.0);
    addTree(center + 5, center - 2, 0.82);
    addGlow(center + 3, center + 4);
  } else {
    addTree(center - 5, center + 2, 1.05);
    addTree(center + 5, center - 3, 0.85);
    addGlow(center + 3, center + 4);
  }
}

function buildFallbackScene(stage) {
  const [width, depth] = stage.size;
  const baseY = Math.min(-0.82, Math.min(...stage.height.filter((height) => height >= 0)) - 1.25);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: stage.id === 'volcano' ? '#3f3538' : '#594a42', roughness: 0.94, flatShading: true });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.52, 0.46, depth + 0.52), plateMaterial);
  plate.position.set(width / 2, baseY - 0.23, depth / 2);
  plate.castShadow = true;
  plate.receiveShadow = true;
  activeStageGroup.add(plate);

  const groups = new Map();
  const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.055);
  const dummy = new THREE.Object3D();
  for (let k = 0; k < depth; k++) {
    for (let i = 0; i < width; i++) {
      const index = k * width + i;
      const height = Number(stage.height[index]);
      if (!Number.isFinite(height) || height < 0) continue;
      const materialName = stage.materials[Number(stage.surface[index]) || 0] || 'grass';
      if (!groups.has(materialName)) groups.set(materialName, []);
      groups.get(materialName).push({ i, k, index, height, materialName });
    }
  }
  for (const [materialName, cells] of groups) {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const mesh = new THREE.InstancedMesh(rounded, material, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      const thickness = cell.height - baseY;
      dummy.position.set(cell.i + 0.5, (cell.height + baseY) * 0.5, cell.k + 0.5);
      dummy.scale.set(1.02, thickness, 1.02);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const shade = 0.94 + ((cell.i * 13 + cell.k * 7 + cell.index) % 13) * 0.01;
      mesh.setColorAt(index, new THREE.Color(stageColor(materialName)).multiplyScalar(shade));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    activeStageGroup.add(mesh);
  }
  addLiquidSurfaces(stage);
  if (stage.fallback) addFallbackProps(stage);
}

function disposeObjectTree(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (material.map && material.userData?.dioramaOwnedTexture) material.map.dispose();
        material.dispose();
      }
    }
  });
}

function prepareGlb(model, stage, atlas) {
  if (!model) return null;
  const rootObject = new THREE.Group();
  rootObject.add(model);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = !/water/i.test(object.name);
    object.receiveShadow = true;
    object.frustumCulled = false;
    const materialNames = Array.isArray(object.material) ? object.material : [object.material];
    const isWater = /water/i.test(object.name) || /water/i.test(object.parent?.name || '');
    const isGlow = /glow|lava|crystal|mushroom/i.test(`${object.name} ${object.parent?.name || ''}`);
    if (isWater) {
      object.material = createWaterMaterial(...liquidColor(stage), false);
      object.castShadow = false;
      return;
    }
    const converted = materialNames.map((source) => {
      const name = `${object.name} ${source?.name || ''}`;
      const base = source?.color?.clone?.() || new THREE.Color('#ffffff');
      if (base.r > 0.94 && base.g > 0.94 && base.b > 0.94) base.set(stageColor(name, stageColor(stage.materials[0], '#8a8b78')));
      const material = new THREE.MeshStandardMaterial({
        name: source?.name || object.name,
        color: atlas ? '#ffffff' : base,
        map: atlas || null,
        vertexColors: object.geometry.hasAttribute('color'),
        roughness: source?.roughness ?? 0.86,
        metalness: source?.metalness ?? 0.02,
        side: source?.side ?? THREE.FrontSide,
        transparent: Boolean(source?.transparent),
        alphaTest: source?.alphaTest ?? 0,
        flatShading: false,
      });
      if (atlas) material.map = atlas;
      if (isGlow) {
        const emissive = stageColor(name, stage.id === 'volcano' ? '#ff6633' : '#83e7ff');
        material.emissive.set(emissive);
        material.emissiveIntensity = 1.8;
        material.toneMapped = false;
        if (atlas) material.emissiveMap = atlas;
        glowMaterials.push({ material, mesh: object, baseIntensity: material.emissiveIntensity });
      }
      return material;
    });
    object.material = Array.isArray(object.material) ? converted : converted[0];
  });
  rootObject.updateMatrixWorld(true);
  return rootObject;
}

function buildStageGroup(pack) {
  waterMaterials = [];
  glowMaterials = [];
  activeStageGroup = new THREE.Group();
  activeStageGroup.name = `stage-${pack.stage.id}`;
  const preparedModel = prepareGlb(pack.model, pack.stage, pack.atlas);
  if (preparedModel) activeStageGroup.add(preparedModel);
  else buildFallbackScene(pack.stage);
  return activeStageGroup;
}

function findAvatarParts(rootObject) {
  const found = {};
  const aliases = { head: 'head', body: 'body', armL: 'arml', armR: 'armr', legL: 'legl', legR: 'legr', cape: 'cape' };
  rootObject.traverse((object) => {
    const name = object.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, alias] of Object.entries(aliases)) if (!found[key] && name.includes(alias)) found[key] = object;
  });
  return found;
}

function makeDummyAvatar() {
  const group = new THREE.Group();
  const stone = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  const cloth = new THREE.MeshStandardMaterial({ color: '#d8aa75', roughness: 0.8, flatShading: true });
  const shirt = new THREE.MeshStandardMaterial({ color: '#477989', roughness: 0.82, flatShading: true });
  const trousers = new THREE.MeshStandardMaterial({ color: '#384955', roughness: 0.88, flatShading: true });
  const capeMaterial = new THREE.MeshStandardMaterial({ color: '#9e5550', roughness: 0.88, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = 1.02;
  const torso = new THREE.Mesh(stone, shirt);
  torso.scale.set(0.46, 0.67, 0.31);
  body.add(torso);
  group.add(body);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.39, 0.015);
  const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), cloth);
  face.position.y = 0.04;
  head.add(face);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#26333b' });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), eyeMaterial);
    eye.position.set(side * 0.07, 0.045, 0.217);
    head.add(eye);
  }
  group.add(head);
  const addLimb = (name, x, y, material, w, h, d) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(stone, material);
    mesh.scale.set(w, h, d);
    mesh.position.y = -h * 0.46;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  addLimb('armL', -0.29, 1.25, cloth, 0.17, 0.59, 0.19);
  addLimb('armR', 0.29, 1.25, cloth, 0.17, 0.59, 0.19);
  addLimb('legL', -0.12, 0.66, trousers, 0.19, 0.58, 0.23);
  addLimb('legR', 0.12, 0.66, trousers, 0.19, 0.58, 0.23);
  const cape = new THREE.Group();
  cape.name = 'cape';
  cape.position.set(0, 1.23, -0.18);
  const capeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.78, 4, 1), capeMaterial);
  capeMesh.rotation.x = Math.PI;
  capeMesh.position.y = -0.38;
  capeMesh.castShadow = true;
  cape.add(capeMesh);
  group.add(cape);
  return group;
}

function installAvatar(model) {
  avatar = new THREE.Group();
  avatar.name = 'hero';
  if (model) {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 1.48 / Math.max(size.y, 0.1);
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    model.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    avatar.add(model);
  } else {
    avatar.add(makeDummyAvatar());
  }
  avatarParts = findAvatarParts(avatar);
  avatarBaseRotations = new Map();
  for (const object of Object.values(avatarParts)) avatarBaseRotations.set(object, object.rotation.clone());
  scene.add(avatar);
  shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.48, 32), new THREE.MeshBasicMaterial({ color: '#18212a', transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }));
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  shadowDisc.renderOrder = 3;
  scene.add(shadowDisc);
}

function replaceAvatar(model) {
  if (avatar) {
    scene.remove(avatar);
    disposeObjectTree(avatar);
  }
  if (shadowDisc) {
    scene.remove(shadowDisc);
    disposeObjectTree(shadowDisc);
  }
  avatar = null;
  shadowDisc = null;
  particleField = null;
  installAvatar(model);
}

function particleColor(kind, stage) {
  if (kind === 'snow') return '#e4f5ff';
  if (kind === 'ember') return '#ff8950';
  if (kind === 'spark') return stage.id === 'skyisles' ? '#b6f5ff' : '#fff0a0';
  if (kind === 'dust') return '#d7b282';
  return '#d7e99b';
}

function makeParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,.82)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setParticles(stage) {
  if (particleField) {
    avatar.remove(particleField.points);
    particleField.geometry.dispose();
    particleField.material.dispose();
    particleField.material.map?.dispose();
  }
  const count = 68;
  const positions = new Float32Array(count * 3);
  let seed = (Number(stage.seed) || stage.id.length * 551) >>> 0;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 7;
    positions[i * 3 + 1] = random() * 3.4;
    positions[i * 3 + 2] = (random() - 0.5) * 7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: particleColor(stage.particles, stage), size: stage.particles === 'snow' ? 0.13 : 0.105, map: makeParticleTexture(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  avatar.add(points);
  particleField = { points, geometry, material, velocities: Array.from({ length: count }, () => 0.12 + random() * 0.42), kind: stage.particles };
}

function setLight(stage) {
  const light = stage.light;
  const size = Math.max(...stage.size);
  const centerX = stage.size[0] / 2;
  const centerZ = stage.size[1] / 2;
  const centerY = Math.max(0.5, Math.max(...stage.height.filter((height) => height >= 0)) * 0.35);
  sunDirection.set(...(light.sunDir || [0.45, 0.82, 0.34])).normalize();
  const center = new THREE.Vector3(centerX, centerY, centerZ);
  hemiLight.color.set(light.skyColor || '#c6e6ff');
  hemiLight.groundColor.set(light.groundColor || '#635747');
  hemiLight.intensity = Number(light.hemiPower ?? 0.9);
  sunLight.color.set(light.sunColor || '#ffe7bf');
  sunLight.intensity = Number(light.sunPower ?? 3) / Math.PI;
  sunLight.position.copy(center).addScaledVector(sunDirection, Math.max(14, size * 0.8));
  sunLight.target.position.copy(center);
  const shadowExtent = Math.max(8, Math.min(size * 0.42, 18));
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.camera.far = shadowExtent * 5;
  sunLight.shadow.camera.updateProjectionMatrix();
  const shadowResolution = clamp(Number(q.get('shadowRes')) || 4096, 256, 4096);
  sunLight.shadow.mapSize.set(shadowResolution, shadowResolution);
  scene.fog = new THREE.FogExp2(light.fog || '#dceaf0', Number(light.fogDensity ?? 0.008));
  skyMaterial.uniforms.uTop.value.set(light.bgTop || '#82b9e9');
  skyMaterial.uniforms.uBottom.value.set(light.bgBottom || '#e7eef1');
  renderer.toneMappingExposure = Number(light.exposure ?? 1);
  fx.bloom = clamp(Number(light.bloom ?? 0.32), 0, 1);
  bloomPass.strength = fx.bloom;
  updateFx();
}

function updateFx() {
  bloomPass.strength = fx.bloom;
  bokehPass.uniforms.aperture.value = 0.006 + fx.blur * 0.035;
  bokehPass.uniforms.maxblur.value = 0.002 + fx.blur * 0.007;
  document.documentElement.dataset.dioramaBloom = fx.bloom.toFixed(3);
  document.documentElement.dataset.dioramaBlur = fx.blur.toFixed(3);
}

function updateCamera(dt = 0) {
  if (!activeStage || !walkState || !avatar) return;
  const width = activeStage.size[0];
  const depth = activeStage.size[1];
  cameraCenter.set(width / 2, 0, depth / 2);
  const follow = new THREE.Vector3(walkState.x, walkState.y + walkState.jumpHeight + 0.65, walkState.z);
  cameraGoal.copy(cameraCenter).multiplyScalar(0.68).addScaledVector(follow, 0.32);
  cameraGoal.y = Math.max(cameraGoal.y, walkState.y + 0.25);
  if (!cameraLook.lengthSq() || !dt) cameraLook.copy(cameraGoal);
  else cameraLook.lerp(cameraGoal, Math.min(1, dt * 2.8));
  const horizontal = cameraDistance * Math.cos(pitch);
  camera.position.set(
    cameraLook.x + Math.sin(yaw) * horizontal,
    cameraLook.y + cameraDistance * Math.sin(pitch),
    cameraLook.z + Math.cos(yaw) * horizontal,
  );
  camera.lookAt(cameraLook);
  sunLight.target.position.set(walkState.x, walkState.y * 0.35, walkState.z);
  sunLight.position.copy(sunLight.target.position).addScaledVector(sunDirection, Math.max(14, Math.max(width, depth) * 0.8));
  sunLight.target.updateMatrixWorld();
  sunLight.updateMatrixWorld();
  skyDome.position.copy(camera.position);
  focusOffset.set(walkState.x, walkState.y + walkState.jumpHeight + 0.75, walkState.z).sub(camera.position);
  camera.getWorldDirection(focusDirection);
  bokehPass.uniforms.focus.value = Math.max(camera.near + 0.1, focusOffset.dot(focusDirection));
}

function setHudStage(stage) {
  const option = Array.from(stageSelect.options).find((entry) => entry.value === stage.id);
  if (option) option.textContent = stage.name;
  else {
    const nextOption = document.createElement('option');
    nextOption.value = stage.id;
    nextOption.textContent = stage.name;
    stageSelect.append(nextOption);
  }
  stageSelect.value = stage.id;
}

function updateFacingAndPose(timeSeconds) {
  if (!avatar || !walkState) return;
  const moving = Math.hypot(walkState.velocityX, walkState.velocityZ) > 0.18;
  avatar.position.set(walkState.x, walkState.y + walkState.jumpHeight, walkState.z);
  avatar.rotation.y = walkState.facing;
  const gait = moving ? Math.sin(walkState.phase) : Math.sin(timeSeconds * 1.15) * 0.07;
  const air = walkState.jumpHeight > 0.03;
  const pose = {
    armL: air ? -0.95 : gait * 0.58,
    armR: air ? -0.95 : -gait * 0.58,
    legL: air ? 0.2 : -gait * 0.62,
    legR: air ? 0.2 : gait * 0.62,
    head: Math.sin(timeSeconds * 0.7) * 0.035,
    body: air ? -0.1 : Math.abs(gait) * 0.025,
    cape: air ? 0.18 : -gait * 0.16,
  };
  for (const [name, angle] of Object.entries(pose)) {
    const part = avatarParts[name];
    if (!part) continue;
    const base = avatarBaseRotations.get(part);
    if (base) part.rotation.set(base.x + (name === 'head' ? angle : name === 'body' ? angle : name === 'cape' ? angle : angle), base.y, base.z);
  }
  if (shadowDisc) {
    shadowDisc.position.set(walkState.x, walkState.y + 0.018, walkState.z);
    const shrink = clamp(1 - walkState.jumpHeight * 0.1, 0.58, 1);
    shadowDisc.scale.set(shrink, shrink, shrink);
    shadowDisc.material.opacity = 0.24 * shrink;
  }
}

function updateParticles(dt) {
  if (!particleField) return;
  const position = particleField.geometry.attributes.position;
  const fall = particleField.kind === 'snow' || particleField.kind === 'ember' ? 1 : -1;
  for (let index = 0; index < position.count; index++) {
    let y = position.getY(index) + particleField.velocities[index] * dt * fall;
    if (fall < 0 && y > 3.8) y = -0.15;
    if (fall > 0 && y < -0.2) y = 3.6;
    position.setY(index, y);
    position.setX(index, position.getX(index) + Math.sin(index * 1.7 + performance.now() * 0.0002) * dt * 0.16);
  }
  position.needsUpdate = true;
}

function animateStage(dt, timeSeconds) {
  for (const material of waterMaterials) material.uniforms.uTime.value = timeSeconds;
  for (const entry of glowMaterials) {
    const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 1.25 + entry.mesh.id * 0.17);
    if (entry.material.emissiveIntensity !== undefined) entry.material.emissiveIntensity = entry.baseIntensity * pulse;
    if (entry.mesh.userData.floatBaseY !== undefined) entry.mesh.position.y = entry.mesh.userData.floatBaseY + Math.sin(timeSeconds * 0.75 + entry.mesh.id) * 0.035;
  }
  updateParticles(dt);
}

function moveInput() {
  let screenX = (heldKeys.has('d') || heldKeys.has('arrowright') ? 1 : 0) - (heldKeys.has('a') || heldKeys.has('arrowleft') ? 1 : 0);
  let screenY = (heldKeys.has('s') || heldKeys.has('arrowdown') ? 1 : 0) - (heldKeys.has('w') || heldKeys.has('arrowup') ? 1 : 0);
  if (pointerDrag.active && (pointerDrag.moveX || pointerDrag.moveY)) {
    screenX = pointerDrag.moveX;
    screenY = pointerDrag.moveY;
  }
  const direction = new THREE.Vector2(
    cameraRightXZ.x * screenX + cameraForwardXZ.x * -screenY,
    cameraRightXZ.y * screenX + cameraForwardXZ.y * -screenY,
  );
  if (direction.lengthSq() > 1) direction.normalize();
  return { x: direction.x, z: direction.y, jump: heldKeys.has(' ') || heldKeys.has('space') };
}

function playWalkEvents(events) {
  for (const event of events) {
    if (event.type === 'footstep') sfx.footstep(event.material, event.water);
    else if (event.type === 'jump') sfx.jump();
    else if (event.type === 'land') sfx.land(event.fallHeight, event.material);
    else if (event.type === 'waterEnter') sfx.waterEnter();
    else if (event.type === 'lavaReturn') sfx.lavaReturn();
  }
}

function renderFrame(delta = 0) {
  renderer.info.reset();
  composer.render(delta);
  frameInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  document.documentElement.dataset.dioramaCalls = String(frameInfo.calls);
  document.documentElement.dataset.dioramaTriangles = String(frameInfo.triangles);
}

function animate(timestamp) {
  if (paused) return;
  window.requestAnimationFrame(animate);
  const dt = lastFrameTime ? clamp((timestamp - lastFrameTime) / 1000, 0, 0.05) : 0;
  lastFrameTime = timestamp;
  const timeSeconds = timestamp / 1000;
  if (mode === 'playing' && walkState && activeStage) {
    const result = stepWalk(walkState, moveInput(), dt, activeStage);
    playWalkEvents(result.events);
    updateFacingAndPose(timeSeconds);
  }
  animateStage(dt, timeSeconds);
  updateCamera(dt);
  renderFrame(dt);
}

function installStage(pack) {
  if (activeStageGroup) {
    scene.remove(activeStageGroup);
    disposeObjectTree(activeStageGroup);
  }
  activeStage = pack.stage;
  activeStageGroup = buildStageGroup(pack);
  scene.add(activeStageGroup);
  setLight(activeStage);
  walkState = createWalkState(activeStage);
  cameraDistance = Math.max(16, Math.max(...activeStage.size) * 2.25);
  baseCameraDistance = cameraDistance;
  cameraLook.set(activeStage.size[0] / 2, walkState.y + 0.5, activeStage.size[1] / 2);
  setParticles(activeStage);
  setHudStage(activeStage);
  sfx.changeAmbience(activeStage.ambience);
  updateFacingAndPose(performance.now() / 1000);
  updateCamera(0);
}

async function changeStage(id) {
  const stageId = STAGE_IDS.includes(id) || id === 'demo' ? id : 'demo';
  if (mode === 'loading') { requestedStage = stageId; return; }
  if (switching) { requestedStage = stageId; return; }
  if (stageId === activeStageId) return;
  switching = true;
  mode = 'switching';
  fadeElement.style.opacity = '1';
  sfx.stageSwitch();
  await sleep(200);
  let nextId = stageId;
  do {
    requestedStage = null;
    const pack = await readStage(nextId);
    if (nextId !== 'demo' && !heroLoadAttempted) {
      loadedHero = await readHero();
      if (loadedHero) replaceAvatar(loadedHero);
    }
    installStage(pack);
    activeStageId = nextId;
    if (requestedStage) nextId = requestedStage;
    else break;
  } while (true);
  await sleep(16);
  fadeElement.style.opacity = '0';
  await sleep(200);
  switching = false;
  mode = 'playing';
  if (requestedStage && requestedStage !== activeStageId) changeStage(requestedStage);
}

function resize() {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
}

function teleport(i, k) {
  if (!activeStage || !walkState) return false;
  const cellI = Math.floor(Number(i));
  const cellK = Math.floor(Number(k));
  const tile = tileAt(activeStage, cellI, cellK);
  if (!tile) return false;
  walkState.i = cellI;
  walkState.k = cellK;
  walkState.x = cellI + 0.5;
  walkState.z = cellK + 0.5;
  walkState.y = tile.height;
  walkState.targetY = tile.height;
  walkState.jumpHeight = 0;
  walkState.jumpVelocity = 0;
  walkState.velocityX = 0;
  walkState.velocityZ = 0;
  updateFacingAndPose(performance.now() / 1000);
  updateCamera(0);
  return true;
}

Object.defineProperty(window, '__pause', {
  get: () => paused,
  set: (value) => {
    const wasPaused = paused;
    paused = Boolean(value);
    if (wasPaused && !paused) { lastFrameTime = 0; window.requestAnimationFrame(animate); }
  },
  configurable: true,
});
Object.defineProperty(window, '__info', { get: () => ({ ...frameInfo }), configurable: true });
Object.defineProperty(window, '__fx', { get: () => ({ ...fx }), configurable: true });
document.documentElement.dataset.dioramaErrors = '0';
window.addEventListener('error', () => { document.documentElement.dataset.dioramaErrors = '1'; });
window.addEventListener('unhandledrejection', () => { document.documentElement.dataset.dioramaErrors = '1'; });
const originalConsoleError = console.error.bind(console);
console.error = (...values) => { document.documentElement.dataset.dioramaErrors = '1'; originalConsoleError(...values); };
window.__ready = false;
window.__teleport = teleport;
window.__renderOnce = () => { updateCamera(0); renderFrame(0); return { ...frameInfo }; };
window.__setFx = (values = {}) => {
  if (Number.isFinite(Number(values.bloom))) fx.bloom = clamp(Number(values.bloom), 0, 1);
  if (Number.isFinite(Number(values.blur))) fx.blur = clamp(Number(values.blur), 0, 1);
  updateFx();
  return { ...fx };
};

root.addEventListener('change', (event) => {
  if (event.target === stageSelect) changeStage(stageSelect.value);
});
root.addEventListener('click', (event) => {
  if (event.target !== soundButton) return;
  sfx.unlock();
  const enabled = soundButton.getAttribute('aria-pressed') !== 'true';
  soundButton.setAttribute('aria-pressed', String(enabled));
  soundButton.textContent = enabled ? '♪' : '×';
  sfx.setEnabled(enabled);
});
root.addEventListener('pointerdown', (event) => {
  sfx.unlock();
  if (event.target !== renderer.domElement || event.button > 0) return;
  pointerDrag.active = true;
  pointerDrag.pointerId = event.pointerId;
  pointerDrag.x = event.clientX;
  pointerDrag.y = event.clientY;
  pointerDrag.moveX = 0;
  pointerDrag.moveY = 0;
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* 入力環境によって捕捉できない */ }
});
root.addEventListener('pointermove', (event) => {
  if (!pointerDrag.active || pointerDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - pointerDrag.x;
  const dy = event.clientY - pointerDrag.y;
  const length = Math.hypot(dx, dy);
  const deadZone = 9;
  const scale = clamp((length - deadZone) / 42, 0, 1);
  if (length > deadZone) {
    pointerDrag.moveX = dx / length * scale;
    pointerDrag.moveY = dy / length * scale;
  } else {
    pointerDrag.moveX = 0;
    pointerDrag.moveY = 0;
  }
});
const endPointer = (event) => {
  if (!pointerDrag.active || pointerDrag.pointerId !== event.pointerId) return;
  pointerDrag.active = false;
  pointerDrag.pointerId = -1;
  pointerDrag.moveX = 0;
  pointerDrag.moveY = 0;
};
root.addEventListener('pointerup', endPointer);
root.addEventListener('pointercancel', endPointer);
root.addEventListener('wheel', (event) => {
  if (!worldElement.contains(event.target)) return;
  event.preventDefault();
  cameraDistance = clamp(cameraDistance * Math.exp(event.deltaY * 0.001), Math.max(8, baseCameraDistance * 0.45), baseCameraDistance * 2.1);
}, { passive: false });
window.addEventListener('keydown', (event) => {
  if (event.target === stageSelect || event.target === soundButton) return;
  sfx.unlock();
  const key = event.key.toLowerCase();
  if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
  if (/^[1-5]$/.test(key) && !event.repeat) changeStage(STAGE_IDS[Number(key) - 1]);
  heldKeys.add(key);
});
window.addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { heldKeys.clear(); pointerDrag.active = false; pointerDrag.moveX = 0; pointerDrag.moveY = 0; });
window.addEventListener('resize', resize);

async function start() {
  const queryStage = q.get('stage') || 'demo';
  const initialId = STAGE_IDS.includes(queryStage) || queryStage === 'demo' ? queryStage : 'demo';
  const initialPack = await readStage(initialId);
  if (initialId !== 'demo') loadedHero = await readHero();
  installAvatar(loadedHero);
  installStage(initialPack);
  activeStageId = initialId;
  if (q.has('bloom')) fx.bloom = clamp(Number(q.get('bloom')) || 0, 0, 1);
  if (q.has('blur')) fx.blur = clamp(Number(q.get('blur')) || 0, 0, 1);
  paused = q.get('pause') === '1';
  updateFx();
  fadeElement.style.opacity = '0';
  renderFrame(0);
  await sleep(210);
  mode = 'playing';
  window.__ready = true;
  document.documentElement.dataset.dioramaReady = 'true';
  window.requestAnimationFrame(animate);
}

start().catch((error) => {
  console.error(error);
  document.documentElement.dataset.dioramaErrors = '1';
  document.documentElement.dataset.dioramaReady = 'false';
  mode = 'playing';
  window.__ready = true;
});
