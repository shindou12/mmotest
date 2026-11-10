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
const loadingBar = document.getElementById('loading-bar');
const loadingFill = loadingBar.querySelector('span');
const hudElement = document.getElementById('hud');
const stageButtons = document.getElementById('stage-buttons');
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
scene.background = new THREE.Color('#1d2b2b');
const camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 0.15, 900);
const FAR_PITCH = THREE.MathUtils.degToRad(46);
const NEAR_PITCH = THREE.MathUtils.degToRad(36);
const CAMERA_NEAR_DISTANCE = 18;
const yaw = THREE.MathUtils.degToRad(14);   // 見本と同じ、ほぼ正面からの見下ろし
const cameraForwardXZ = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
const cameraRightXZ = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
const cameraGoal = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraCenter = new THREE.Vector3();
const focusDirection = new THREE.Vector3();
const focusOffset = new THREE.Vector3();
let cameraDistance = 26;
let baseCameraDistance = 26;
const sunDirection = new THREE.Vector3(-0.55, 0.82, -0.25).normalize();

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
sunLight.shadow.bias = -0.00012;
sunLight.shadow.normalBias = 0.018;
sunLight.shadow.radius = 2;
scene.add(sunLight);
scene.add(sunLight.target);
const fillLight = new THREE.DirectionalLight('#61b8a7', 0.9);
fillLight.castShadow = false;
scene.add(fillLight);
scene.add(fillLight.target);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.62, 0.78);
bloomPass.threshold = 0.9;
bloomPass.highPassUniforms.luminosityThreshold.value = 0.9;
composer.addPass(bloomPass);
const bokehPass = new BokehPass(scene, camera, { focus: 24, aperture: 0.02, maxblur: 0.0048 });
composer.addPass(bokehPass);
const edgeBlurPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight) }, uBlur: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uBlur; varying vec2 vUv;
    void main(){ float edge=min(vUv.y,1.0-vUv.y); float mask=1.0-smoothstep(0.085,0.205,edge);
      float radius=uBlur*7.0*mask; vec2 stepY=vec2(0.0,uTexel.y*radius);
      vec4 color=texture2D(tDiffuse,vUv)*0.4;
      color+=texture2D(tDiffuse,vUv+stepY*0.65)*0.24; color+=texture2D(tDiffuse,vUv-stepY*0.65)*0.24;
      color+=texture2D(tDiffuse,vUv+stepY*1.5)*0.06; color+=texture2D(tDiffuse,vUv-stepY*1.5)*0.06;
      gl_FragColor=color; }`,
});
composer.addPass(edgeBlurPass);
const finishPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.45 }, uSaturation: { value: 0.9 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSaturation; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
      c.rgb=mix(vec3(l),c.rgb,uSaturation); float d=length((vUv-0.5)*vec2(1.414,1.414));
      c.rgb*=1.0-uVignette*smoothstep(0.66,0.99,d); gl_FragColor=vec4(c.rgb,1.0); }`,
});
composer.addPass(finishPass);
composer.addPass(new OutputPass());

let mode = 'loading';
let activeStageId = 'demo';
let activeStage = null;
let activeStageGroup = null;
let waterMaterials = [];
let fallMaterials = [];
let glowMaterials = [];
let glowSparkSystems = [];
let foamSystems = [];
let liquidSources = [];
let loadedHero = null;
let heroLoadAttempted = false;
let avatar = null;
let avatarParts = {};
let avatarBaseRotations = new Map();
let avatarBasePositions = new Map();
let shadowDisc = null;
let markerRing = null;
let markerTriangle = null;
let particleField = null;
let walkState = null;
let requestedStage = null;
let switching = false;
let paused = false;
let lastFrameTime = 0;
let frameInfo = { calls: 0, triangles: 0 };
let fx = { bloom: 0.35, blur: 0.18 };
let farShadowExtent = 32;
let cameraFarTargetY = 0;
let cameraFarShiftY = 0;
let lastFlowUpdate = 0;
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

function setLoadingProgress(value = null) {
  if (value === null || !Number.isFinite(value)) {
    loadingBar.dataset.indeterminate = 'true';
    loadingFill.style.transform = 'none';
    return;
  }
  delete loadingBar.dataset.indeterminate;
  loadingFill.style.transform = `scaleX(${clamp(value, 0, 1)})`;
}

async function readResponseBytes(response, start, end) {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    setLoadingProgress(end);
    return buffer;
  }
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const fraction = total > 0 ? loaded / total : Math.min(0.94, Math.log1p(loaded) / 18);
    setLoadingProgress(start + (end - start) * fraction);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  setLoadingProgress(end);
  return bytes.buffer;
}

async function readStage(id) {
  if (id === 'demo') return { stage: stageForDemo('demo'), model: null, atlas: null };
  try {
    setLoadingProgress(0.04);
    const response = await fetch(`./stages/${encodeURIComponent(id)}.json`);
    if (!response.ok) return { stage: stageForDemo(id), model: null, atlas: null };
    const stage = normalizeStage(await response.json(), id);
    if (!stage) return { stage: stageForDemo(id), model: null, atlas: null };
    let model = null;
    let atlas = null;
    setLoadingProgress(0.06);
    const modelResponse = await fetch(`./stages/${encodeURIComponent(id)}.glb`).catch(() => null);
    if (modelResponse?.ok) model = await parseGlb(await readResponseBytes(modelResponse, 0.06, 0.92));
    setLoadingProgress(0.93);
    const atlasResponse = await fetch('./tex/atlas.png').catch(() => null);
    if (atlasResponse?.ok) atlas = await readAtlas(atlasResponse);
    setLoadingProgress(0.99);
    return { stage, model, atlas };
  } catch {
    return { stage: stageForDemo(id), model: null, atlas: null };
  }
}

async function readAtlas(response) {
  try {
    const bitmap = await createImageBitmap(await response.blob());
    const texture = new THREE.CanvasTexture(bitmap);
    texture.userData.dioramaOwnedTexture = true;
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
    return await parseGlb(await readResponseBytes(response, 0.93, 0.98), new URL('./models/', location.href).href);
  } catch {
    return null;
  }
}

function waterVertexColorRange(geometry) {
  const color = geometry.getAttribute('color');
  if (!color?.count) return null;
  const stride = Math.max(1, Math.floor(color.count / 4096));
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index < color.count; index += stride) {
    const brightness = color.getX(index) * 0.2126 + color.getY(index) * 0.7152 + color.getZ(index) * 0.0722;
    minimum = Math.min(minimum, brightness);
    maximum = Math.max(maximum, brightness);
  }
  return maximum - minimum > 0.08 ? [minimum, maximum] : null;
}

function addWaterBoundaryAttributes(objects, stage) {
  const [width, depth] = stage.size;
  const attributes = new Map();
  for (const { object, kind } of objects) {
    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    if (!positions?.count) continue;
    object.updateWorldMatrix(true, false);
    const values = [];
    let hasBoundary = false;
    for (let index = 0; index < positions.count; index++) {
      const point = new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)).applyMatrix4(object.matrixWorld);
      const gridI = Math.round(point.x);
      const gridK = Math.round(point.z);
      let wet = false;
      let dry = false;
      if (Math.abs(point.x - gridI) < 0.08 && Math.abs(point.z - gridK) < 0.08) {
        for (const [cellI, cellK] of [[gridI - 1, gridK - 1], [gridI, gridK - 1], [gridI - 1, gridK], [gridI, gridK]]) {
          const inside = cellI >= 0 && cellK >= 0 && cellI < width && cellK < depth;
          const liquid = inside ? Number(stage.liquid[cellK * width + cellI] || 0) : 0;
          if (liquid === kind) wet = true;
          else dry = true;
        }
      }
      const boundary = wet && dry ? 1 : 0;
      values.push(boundary);
      if (boundary) hasBoundary = true;
    }
    geometry.setAttribute('shoreEdge', new THREE.Float32BufferAttribute(values, 1));
    attributes.set(object, hasBoundary);
  }
  return attributes;
}

function createWaterMaterial(baseColor = '#3fc4b2', foamColor = '#effff4', emissive = false, gridWater = false, deepColor = '#1f7f86', useVertexColors = false, colorShoreRange = null, meshShore = false) {
  const material = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(baseColor) },
      uDeep: { value: new THREE.Color(deepColor) },
      uFoam: { value: new THREE.Color(foamColor) },
      uEmissive: { value: emissive ? 1 : 0 },
      uGridWater: { value: gridWater ? 1 : 0 },
      uUseVertexColors: { value: useVertexColors ? 1 : 0 },
      uColorShore: { value: colorShoreRange ? 1 : 0 },
      uColorRange: { value: new THREE.Vector2(...(colorShoreRange || [0, 1])) },
      uMeshShore: { value: meshShore ? 1 : 0 },
    },
    vertexShader: `${gridWater ? 'attribute vec4 shoreEdges;' : 'attribute float shoreEdge;'}${useVertexColors ? 'attribute vec3 color;' : ''}
      varying vec2 vUv; varying vec3 vWorld; varying vec4 vShore; varying vec3 vColor; varying float vShoreEdge;
      void main(){ vUv=uv; vShore=${gridWater ? 'shoreEdges' : 'vec4(0.0)'}; vShoreEdge=${gridWater ? '0.0' : 'shoreEdge'}; vColor=${useVertexColors ? 'color' : 'vec3(1.0)'}; vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform float uEmissive; uniform float uGridWater; uniform float uUseVertexColors; uniform float uColorShore; uniform float uMeshShore; uniform vec2 uColorRange;
      varying vec2 vUv; varying vec3 vWorld; varying vec4 vShore; varying vec3 vColor; varying float vShoreEdge;
      float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise21(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y); }
      void main(){
        float depth=noise21(vWorld.xz*0.12+vec2(uTime*0.006,-uTime*0.004));
        float shallows=smoothstep(0.42,0.76,depth);
        vec3 color=mix(uDeep,uShallow,shallows)*mix(vec3(1.0),vColor,uUseVertexColors);
        vec2 waveCoord=vec2(dot(vWorld.xz,vec2(0.305,0.952)),dot(vWorld.xz,vec2(0.952,-0.305)))*0.2;
        waveCoord.x+=uTime*0.02;
        vec2 waveCell=floor(waveCoord), waveLocal=fract(waveCoord);
        float waveLine=1.0-smoothstep(0.025,0.06,abs(waveLocal.y-(0.43+hash21(waveCell)*0.14)));
        float waveStart=0.08+hash21(waveCell+vec2(4.0,17.0))*0.28;
        float waveLength=0.16+hash21(waveCell+vec2(31.0,8.0))*0.16;
        float waveSegment=smoothstep(waveStart,waveStart+0.035,waveLocal.x)*(1.0-smoothstep(waveStart+waveLength,waveStart+waveLength+0.04,waveLocal.x));
        float glint=waveLine*waveSegment*step(0.78,hash21(waveCell+vec2(19.0,3.0)));
        color=mix(color,uFoam*1.2,glint*0.6);
        float shore=0.0;
        if(uGridWater>0.5){
          float shoreDistance=1.0;
          if(vShore.x>0.5) shoreDistance=min(shoreDistance,vUv.x);
          if(vShore.y>0.5) shoreDistance=min(shoreDistance,1.0-vUv.x);
          if(vShore.z>0.5) shoreDistance=min(shoreDistance,vUv.y);
          if(vShore.w>0.5) shoreDistance=min(shoreDistance,1.0-vUv.y);
          shore=1.0-smoothstep(0.006,0.04,shoreDistance);
        } else if(uMeshShore>0.5){
          shore=smoothstep(0.62,0.92,vShoreEdge);
        } else if(uColorShore>0.5){
          float brightness=dot(vColor,vec3(0.2126,0.7152,0.0722));
          float colorRange=max(0.001,uColorRange.y-uColorRange.x);
          float shoreLevel=clamp((brightness-uColorRange.x)/colorRange,0.0,1.0);
          float shoreBand=smoothstep(0.86,0.98,shoreLevel);
          float shoreGradient=smoothstep(0.003,0.03,fwidth(brightness));
          shore=shoreBand*shoreGradient;
        }
        color=mix(color,uFoam,shore*0.86);
        if(uEmissive>0.5){ float pulse=0.86+0.14*sin(uTime*1.6+vWorld.x*0.5+vWorld.z*0.3); color*=1.05+pulse*0.8; }
        gl_FragColor=vec4(color,1.0);
      }`,
  });
  material.userData.dioramaLiquid = true;
  waterMaterials.push(material);
  return material;
}

function createFallMaterial(stage) {
  const lava = stage.id === 'volcano';
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uWater: { value: new THREE.Color(lava ? '#ff6a28' : '#2bb8a8') },
      uFoam: { value: new THREE.Color(lava ? '#ffe48a' : '#f1fff7') },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv=uv; vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uWater; uniform vec3 uFoam; varying vec2 vUv; varying vec3 vWorld;
      float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise21(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y); }
      void main(){
        float widthNoise=noise21(vec2(floor(vUv.x*8.0),floor(vUv.y*3.0-uTime*0.16)));
        float warpedX=vUv.x*9.0+(noise21(vec2(vUv.x*3.0,vUv.y*2.0-uTime*0.12))-0.5)*0.72;
        float streakDistance=abs(fract(warpedX)-0.5);
        float streakWidth=0.12+widthNoise*0.19;
        float streak=1.0-smoothstep(streakWidth,streakWidth+0.12,streakDistance);
        float moving=0.5+0.5*sin(vUv.y*21.0-uTime*2.0+noise21(vec2(vUv.x*6.0,vUv.y*4.0))*3.0);
        float white=streak*smoothstep(0.32,0.83,moving);
        vec3 color=mix(uWater*0.78,uWater,0.65+0.2*streak);
        color=mix(color,uFoam,white*0.78);
        float topFoam=1.0-smoothstep(0.0,0.055,vUv.y);
        float bottomFoam=1.0-smoothstep(0.0,0.17,1.0-vUv.y);
        float endFoam=max(topFoam,bottomFoam);
        color=mix(color,uFoam,endFoam*0.96);
        gl_FragColor=vec4(color,1.0); }`,
  });
  fallMaterials.push(material);
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

function addLiquidSurfaces(stage, include = { water: true, lava: true }) {
  const [width, depth] = stage.size;
  const waterCells = [];
  const lavaCells = [];
  for (let index = 0; index < width * depth; index++) {
    const kind = Number(stage.liquid?.[index] || 0);
    if (kind === 1 && include.water) waterCells.push(index);
    if (kind === 2 && include.lava) lavaCells.push(index);
  }
  const makeGeometry = (cells, kind) => {
    if (!cells.length) return null;
    const cellSet = new Set(cells);
    const shoreDepth = new Map();
    const frontier = [];
    for (const index of cells) {
      const i = index % width;
      const k = Math.floor(index / width);
      const atShore = i === 0 || !cellSet.has(index - 1) || i + 1 >= width || !cellSet.has(index + 1)
        || k === 0 || !cellSet.has(index - width) || k + 1 >= depth || !cellSet.has(index + width);
      if (atShore) { shoreDepth.set(index, 0); frontier.push(index); }
      else shoreDepth.set(index, Infinity);
    }
    for (let head = 0; head < frontier.length; head++) {
      const index = frontier[head];
      const nextDepth = shoreDepth.get(index) + 1;
      const i = index % width;
      const k = Math.floor(index / width);
      const neighbors = [[i - 1, k], [i + 1, k], [i, k - 1], [i, k + 1]]
        .filter(([neighborI, neighborK]) => neighborI >= 0 && neighborK >= 0 && neighborI < width && neighborK < depth)
        .map(([neighborI, neighborK]) => neighborK * width + neighborI);
      for (const neighbor of neighbors) {
        if (!cellSet.has(neighbor) || nextDepth >= shoreDepth.get(neighbor)) continue;
        shoreDepth.set(neighbor, nextDepth);
        frontier.push(neighbor);
      }
    }
    const positions = [];
    const uvs = [];
    const shores = [];
    const colors = [];
    const indices = [];
    const waterLevel = Number(stage.waterLevel);
    const vertexTint = (vertexI, vertexK) => {
      let total = 0;
      let samples = 0;
      for (const cellK of [vertexK - 1, vertexK]) for (const cellI of [vertexI - 1, vertexI]) {
        const cellIndex = cellK * width + cellI;
        if (cellI < 0 || cellK < 0 || cellI >= width || cellK >= depth || !cellSet.has(cellIndex)) continue;
        total += shoreDepth.get(cellIndex) || 0;
        samples++;
      }
      const depthFromShore = samples ? total / samples : 0;
      return 0.8 + (1.08 - 0.8) * (1 - THREE.MathUtils.smoothstep(depthFromShore, 0, 4));
    };
    for (const index of cells) {
      const i = index % width;
      const k = Math.floor(index / width);
      const ground = Number(stage.height[index]) || 0;
      const y = kind === 2 ? ground + 0.045 : Math.max(Number.isFinite(waterLevel) ? waterLevel : ground + 0.04, ground + 0.04);
      const base = positions.length / 3;
      positions.push(i, y, k, i + 1, y, k, i + 1, y, k + 1, i, y, k + 1);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (const [vertexI, vertexK] of [[i, k], [i + 1, k], [i + 1, k + 1], [i, k + 1]]) {
        const tint = vertexTint(vertexI, vertexK);
        colors.push(tint, tint, tint);
      }
      const edges = [
        i === 0 || !cellSet.has(index - 1),
        i + 1 >= width || !cellSet.has(index + 1),
        k === 0 || !cellSet.has(index - width),
        k + 1 >= depth || !cellSet.has(index + width),
      ].map((edge) => edge ? 1 : 0);
      for (let vertex = 0; vertex < 4; vertex++) shores.push(...edges);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('shoreEdges', new THREE.Float32BufferAttribute(shores, 4));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  for (const [kind, cells] of [[1, waterCells], [2, lavaCells]]) {
    const geometry = makeGeometry(cells, kind);
    if (!geometry) continue;
    const material = kind === 2
      ? createWaterMaterial(stage.id === 'volcano' ? '#ff6a28' : '#ff7a3e', '#ffe48a', true, true, '#a83b2c', true)
      : createWaterMaterial('#3fc4b2', '#f1fff7', false, true, '#1f7f86', true);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind === 2 ? 'liquid-lava' : 'liquid-water';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    activeStageGroup.add(mesh);
  }
}

function addFallbackProps(stage) {
  const [width] = stage.size;
  const placeable = (i, k) => {
    const index = k * width + i;
    if (i < 0 || k < 0 || i >= width || k >= stage.size[1] || Number(stage.height[index]) < 0) return null;
    return { height: Number(stage.height[index]) || 0 };
  };
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#755138', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: stage.id === 'snow' ? '#477867' : stage.id === 'skyisles' ? '#3e9b91' : '#548a4b', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
  const glowColor = stage.id === 'volcano' ? '#ff632c' : stage.id === 'skyisles' ? '#8deaff' : '#f2d47b';
  const glowMaterial = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 3.2, roughness: 0.35, metalness: 0, flatShading: true, toneMapped: false });
  const crystalMaterial = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2.8, roughness: 0.25, metalness: 0, flatShading: true, toneMapped: false });
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
    addGlowSparks(glow, stage, glowColor);
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
    addGlowSparks(crystal, stage, glowColor);
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
  const plateMaterial = new THREE.MeshStandardMaterial({ color: stage.id === 'volcano' ? '#3f3538' : '#594a42', roughness: 0.94, metalness: 0, flatShading: true, toneMapped: false });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.52, 0.46, depth + 0.52), plateMaterial);
  plate.position.set(width / 2, baseY - 0.23, depth / 2);
  plate.castShadow = true;
  plate.receiveShadow = true;
  activeStageGroup.add(plate);

  const groups = new Map();
  const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
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
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
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
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    for (const texture of child.userData?.dioramaOwnedTextures || []) textures.add(texture);
    if (child.material) {
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    texture.image?.close?.();
    texture.dispose();
  }
}

function addGlowSparks(object, stage) {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(center.x) || size.lengthSq() < 0.01) return;
  const count = 8;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const fades = new Float32Array(count);
  const origins = [];
  const lifetimes = [];
  const speeds = [];
  const rises = [];
  let seed = (Number(stage.seed) || stage.id.length * 317) + object.id * 7919;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const peach = new THREE.Color('#ffc0dd');
  const cyan = new THREE.Color('#a9efff');
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.max(0.18, Math.max(size.x, size.z) * (0.18 + random() * 0.45));
    const origin = new THREE.Vector3(center.x + Math.cos(angle) * radius, bounds.max.y - random() * 0.18, center.z + Math.sin(angle) * radius);
    const life = random();
    origins.push(origin);
    lifetimes.push(life);
    speeds.push(0.14 + random() * 0.12);
    rises.push(0.65 + random() * 0.75);
    positions[index * 3] = origin.x;
    positions[index * 3 + 1] = origin.y + life * rises[index];
    positions[index * 3 + 2] = origin.z;
    const tint = index % 2 === 0 ? peach : cyan;
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
    fades[index] = 1 - THREE.MathUtils.smoothstep(life, 0.78, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSparkFade', new THREE.BufferAttribute(fades, 1));
  const texture = makeParticleTexture();
  texture.userData.dioramaOwnedTexture = true;
  const material = new THREE.PointsMaterial({ color: '#ffffff', vertexColors: true, size: 0.2, map: texture, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSparkFade;\nvarying float vSparkFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSparkFade = aSparkFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSparkFade;')
      .replace('#include <output_fragment>', 'diffuseColor.a *= vSparkFade;\n#include <output_fragment>');
  };
  material.customProgramCacheKey = () => 'diorama-glow-spark-v1';
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  activeStageGroup.add(points);
  glowSparkSystems.push({ points, geometry, material, baseOpacity: material.opacity, phase: object.id * 0.37, origins, lifetimes, speeds, rises });
}

function addFallFoam(object, stage) {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(center.x) || size.lengthSq() < 0.01) return;
  const count = 10;
  const positions = new Float32Array(count * 3);
  const origins = [];
  let seed = (Number(stage.seed) || stage.id.length * 719) + object.id * 1049;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.18 + random() * 1.15;
    const origin = new THREE.Vector3(center.x + Math.cos(angle) * radius, bounds.min.y + 0.12 + random() * 0.3, center.z + Math.sin(angle) * radius);
    origins.push(origin);
    positions.set(origin.toArray(), index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const texture = makeParticleTexture();
  texture.userData.dioramaOwnedTexture = true;
  const material = new THREE.PointsMaterial({ color: stage.id === 'volcano' ? '#ffe8a4' : '#effff7', size: 0.25, map: texture, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  activeStageGroup.add(points);
  foamSystems.push({ points, geometry, material, origins, phase: object.id * 0.29 });
}

function prepareGlb(model, stage, atlas) {
  if (!model) return null;
  const rootObject = new THREE.Group();
  rootObject.add(model);
  rootObject.userData.dioramaOwnedTextures = atlas ? [atlas] : [];
  rootObject.userData.hasWater = false;
  rootObject.userData.hasLava = false;
  const glowObjects = [];
  const fallObjects = [];
  const sourceMaterials = new Set();
  const sourceTextures = new Set();
  const waterMeshes = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    const meshName = `${object.name} ${object.parent?.name || ''}`.toLowerCase();
    const isLava = /lava/i.test(meshName) || (stage.id === 'volcano' && /glow/i.test(meshName));
    if (isLava) waterMeshes.push({ object, kind: 2 });
    else if (/water/i.test(meshName) && stage.id !== 'snow') waterMeshes.push({ object, kind: 1 });
  });
  const meshShoreAttributes = addWaterBoundaryAttributes(waterMeshes, stage);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = !/water/i.test(object.name);
    object.receiveShadow = true;
    object.frustumCulled = false;
    const materialNames = Array.isArray(object.material) ? object.material : [object.material];
    for (const source of materialNames) {
      if (!source) continue;
      sourceMaterials.add(source);
      for (const value of Object.values(source)) if (value?.isTexture) sourceTextures.add(value);
    }
    const meshName = `${object.name} ${object.parent?.name || ''}`.toLowerCase();
    const isWater = /water/i.test(meshName);
    const isFall = /fall/i.test(meshName);
    const isGlow = /glow|lava|crystal|mushroom/i.test(meshName);
    const isLava = /lava/i.test(meshName) || (stage.id === 'volcano' && /glow/i.test(meshName));
    const colorShoreRange = isWater || isLava ? waterVertexColorRange(object.geometry) : null;
    const meshShore = meshShoreAttributes.get(object) || false;
    if (isWater) {
      rootObject.userData.hasWater = stage.id !== 'snow';
      if (stage.id === 'snow') {
        object.material = new THREE.MeshStandardMaterial({ name: 'ice', color: '#e7fbff', map: atlas || null, vertexColors: object.geometry.hasAttribute('color'), roughness: 0.2, metalness: 0, toneMapped: false });
      } else {
        object.material = createWaterMaterial('#3fc4b2', '#effff7', false, false, '#1f7f86', object.geometry.hasAttribute('color'), colorShoreRange, meshShore);
      }
      object.castShadow = false;
      return;
    }
    if (isFall) {
      object.material = createFallMaterial(stage);
      object.castShadow = false;
      object.receiveShadow = false;
      fallObjects.push(object);
      return;
    }
    if (isLava) {
      rootObject.userData.hasLava = true;
      object.material = createWaterMaterial('#ff6a28', '#ffe48a', true, false, '#a83b2c', object.geometry.hasAttribute('color'), colorShoreRange, meshShore);
      object.castShadow = false;
      fallObjects.push(object);
      return;
    }
    const converted = materialNames.map((source) => {
      const name = `${object.name} ${source?.name || ''}`;
      const base = source?.color?.clone?.() || new THREE.Color('#ffffff');
      if (base.r > 0.94 && base.g > 0.94 && base.b > 0.94) base.set(stageColor(name, stageColor(stage.materials[0], '#8a8b78')));
      const isIce = /ice/i.test(name) || stage.id === 'snow' && /water/i.test(name);
      const material = new THREE.MeshStandardMaterial({
        name: source?.name || object.name,
        color: atlas ? '#ffffff' : base,
        map: atlas || null,
        vertexColors: object.geometry.hasAttribute('color'),
        roughness: isIce ? 0.22 : 0.9,
        metalness: 0,
        side: source?.side ?? THREE.FrontSide,
        transparent: Boolean(source?.transparent),
        alphaTest: source?.alphaTest ?? 0,
        flatShading: false,
        toneMapped: false,
      });
      if (atlas) material.map = atlas;
      if (isGlow) {
        if (isLava) rootObject.userData.hasLava = true;
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
  for (const material of sourceMaterials) material.dispose();
  for (const texture of sourceTextures) { texture.image?.close?.(); texture.dispose(); }
  rootObject.updateMatrixWorld(true);
  for (const object of fallObjects) {
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    liquidSources.push({ x: center.x, z: center.z, kind: stage.id === 'volcano' ? 'lava' : 'water' });
    if (/fall/i.test(object.name)) addFallFoam(object, stage);
  }
  for (const entry of glowMaterials) {
    if (entry.mesh && !glowObjects.includes(entry.mesh)) glowObjects.push(entry.mesh);
  }
  for (const object of glowObjects) addGlowSparks(object, stage);
  return rootObject;
}

function buildStageGroup(pack) {
  waterMaterials = [];
  fallMaterials = [];
  glowMaterials = [];
  glowSparkSystems = [];
  foamSystems = [];
  liquidSources = [];
  activeStageGroup = new THREE.Group();
  activeStageGroup.name = `stage-${pack.stage.id}`;
  const preparedModel = prepareGlb(pack.model, pack.stage, pack.atlas);
  if (preparedModel) {
    activeStageGroup.add(preparedModel);
    addLiquidSurfaces(pack.stage, { water: !preparedModel.userData.hasWater, lava: !preparedModel.userData.hasLava });
  } else {
    if (pack.atlas) { pack.atlas.image?.close?.(); pack.atlas.dispose(); }
    buildFallbackScene(pack.stage);
  }
  const [width, depth] = pack.stage.size;
  for (let index = 0; index < pack.stage.liquid.length; index++) {
    const kind = Number(pack.stage.liquid[index] || 0);
    if (kind !== 1 && kind !== 2) continue;
    liquidSources.push({ x: index % width + 0.5, z: Math.floor(index / width) + 0.5, kind: kind === 2 ? 'lava' : 'water' });
  }
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
  const cloth = new THREE.MeshStandardMaterial({ color: '#d8aa75', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
  const shirt = new THREE.MeshStandardMaterial({ color: '#477989', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
  const trousers = new THREE.MeshStandardMaterial({ color: '#384955', roughness: 0.9, metalness: 0, flatShading: true, toneMapped: false });
  const capeMaterial = new THREE.MeshStandardMaterial({ color: '#9e5550', roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide, toneMapped: false });
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
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#26333b', toneMapped: false });
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
    const scale = 1.9 / Math.max(size.y, 0.1);
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material) material.toneMapped = false;
      }
    });
    avatar.add(model);
  } else {
    avatar.add(makeDummyAvatar());
  }
  avatarParts = findAvatarParts(avatar);
  avatarBaseRotations = new Map();
  avatarBasePositions = new Map();
  for (const object of Object.values(avatarParts)) {
    avatarBaseRotations.set(object, object.rotation.clone());
    avatarBasePositions.set(object, object.position.clone());
  }
  scene.add(avatar);
  shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: '#101d1d', transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }));
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  shadowDisc.renderOrder = 3;
  scene.add(shadowDisc);
  markerRing = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.2, 48), new THREE.MeshBasicMaterial({ color: '#f4fff3', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.035;
  markerRing.renderOrder = 2;
  scene.add(markerRing);
  markerTriangle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 3), new THREE.MeshBasicMaterial({ color: '#f7fff9', transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false }));
  markerTriangle.renderOrder = 4;
  scene.add(markerTriangle);
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
  if (markerRing) {
    scene.remove(markerRing);
    disposeObjectTree(markerRing);
  }
  if (markerTriangle) {
    scene.remove(markerTriangle);
    disposeObjectTree(markerTriangle);
  }
  avatar = null;
  shadowDisc = null;
  markerRing = null;
  markerTriangle = null;
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
  texture.userData.dioramaOwnedTexture = true;
  return texture;
}

function setParticles(stage) {
  if (particleField) {
    particleField.points.parent?.remove(particleField.points);
    particleField.geometry.dispose();
    particleField.material.dispose();
    particleField.material.map?.dispose();
  }
  const [width, depth] = stage.size;
  const validHeights = stage.height.filter((height) => height >= 0);
  const lowY = (validHeights.length ? Math.min(...validHeights) : 0) - 1;
  const highY = (validHeights.length ? Math.max(...validHeights) : 1) + 7;
  const count = clamp(Math.round(Math.max(width, depth) * 5.5), 220, 400);
  const positions = new Float32Array(count * 3);
  let seed = (Number(stage.seed) || stage.id.length * 551) >>> 0;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    positions[i * 3] = random() * width;
    positions[i * 3 + 1] = lowY + random() * (highY - lowY);
    positions[i * 3 + 2] = random() * depth;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: particleColor(stage.particles, stage), size: stage.particles === 'snow' ? 0.24 : 0.21, map: makeParticleTexture(), transparent: true, opacity: 0.68, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  activeStageGroup.add(points);
  particleField = { points, geometry, material, velocities: Array.from({ length: count }, () => 0.12 + random() * 0.42), kind: stage.particles, lowY, highY, width, depth };
}

function backgroundColorFromLight(light, stageId) {
  if (stageId === 'meadow') return new THREE.Color('#1d2b2b');
  const color = new THREE.Color(light.bgBottom || light.fog || '#263239');
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, clamp(Math.max(hsl.s, 0.2) * 1.12, 0.18, 0.62), 0.105);
  return color;
}

function cameraDistanceForStage(stage) {
  const [width, depth] = stage.size;
  const valid = stage.height.filter((height) => height >= 0);
  const minHeight = valid.length ? Math.min(...valid) : 0;
  const maxHeight = valid.length ? Math.max(...valid) : 1;
  const bottom = minHeight - 6;
  cameraFarTargetY = (bottom + maxHeight) * 0.5;
  const depthHalf = (Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * depth) * 0.5;
  const rightHalf = (Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth) * 0.5;
  const verticalHalf = (maxHeight - bottom) * 0.5;
  const pitchSin = Math.sin(FAR_PITCH);
  const pitchCos = Math.cos(FAR_PITCH);
  const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const aspect = Math.max(0.25, camera.aspect);
  const maxScreenRatios = (distance) => {
    let verticalMaximum = 0;
    let horizontalMaximum = 0;
    for (const horizontal of [-depthHalf, depthHalf]) {
      for (const vertical of [-verticalHalf, verticalHalf]) {
        const viewHeight = Math.abs(-horizontal * pitchSin + vertical * pitchCos);
        const viewDepth = distance - horizontal * pitchCos - vertical * pitchSin;
        const denominator = Math.max(1, viewDepth) * halfFovTangent;
        verticalMaximum = Math.max(verticalMaximum, viewHeight / denominator);
        horizontalMaximum = Math.max(horizontalMaximum, rightHalf / (denominator * aspect));
      }
    }
    return { vertical: verticalMaximum, horizontal: horizontalMaximum };
  };
  let low = Math.max(CAMERA_NEAR_DISTANCE + 1, depthHalf + verticalHalf + 1);
  let high = Math.max(64, low * 2);
  const fits = (distance) => {
    const ratio = maxScreenRatios(distance);
    return ratio.vertical <= 0.928 && ratio.horizontal <= 0.94;
  };
  while (!fits(high)) high *= 1.5;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) * 0.5;
    if (!fits(middle)) low = middle;
    else high = middle;
  }
  cameraFarShiftY = high * halfFovTangent * 0.143 / Math.max(0.1, pitchCos);
  return high;
}

function zoomBlend() {
  const range = Math.max(1, baseCameraDistance - CAMERA_NEAR_DISTANCE);
  return THREE.MathUtils.smoothstep(clamp((baseCameraDistance - cameraDistance) / range, 0, 1), 0, 1);
}

function updateShadowExtent(extent) {
  if (Math.abs(sunLight.shadow.camera.right - extent) < 0.1) return;
  const cameraShadow = sunLight.shadow.camera;
  cameraShadow.left = -extent;
  cameraShadow.right = extent;
  cameraShadow.top = extent;
  cameraShadow.bottom = -extent;
  cameraShadow.updateProjectionMatrix();
}

function setLight(stage) {
  const light = stage.light;
  const [width, depth] = stage.size;
  const size = Math.max(width, depth);
  const centerX = stage.size[0] / 2;
  const centerZ = stage.size[1] / 2;
  const valid = stage.height.filter((height) => height >= 0);
  const maxHeight = valid.length ? Math.max(...valid) : 1;
  const minHeight = valid.length ? Math.min(...valid) : 0;
  const centerY = (maxHeight + minHeight - 6) * 0.5;
  cameraFarTargetY = centerY;
  sunDirection.set(-0.5, 0.8, 0.42).normalize();   // 左手前の上から（手前を向いた崖に日が当たる）
  const center = new THREE.Vector3(centerX, centerY, centerZ);
  fillLight.color.set('#61b8a7');
  fillLight.intensity = 0.9;
  fillLight.target.position.copy(center);
  fillLight.position.copy(center).addScaledVector(sunDirection, -Math.max(40, size * 1.2));
  hemiLight.color.set(light.skyColor || '#c6e6ff');
  hemiLight.groundColor.set(light.groundColor || '#635747');
  const scale = clamp(Number(light.sunPower ?? 3) / 3, 0.65, 1.15);
  // r160 の光は π で割られるので、日なたが白飛びしない範囲で π 前後の強さにする（影の中は日なたの 55% くらい）
  hemiLight.intensity = Math.max(1.5, 2.1 * Number(light.hemiPower ?? 0.9) / 0.9);
  sunLight.color.set(light.sunColor || '#ffe7bf');
  sunLight.intensity = 2.3 * scale;
  const lightDistance = Math.max(40, size * 1.2);
  sunLight.position.copy(center).addScaledVector(sunDirection, lightDistance);
  sunLight.target.position.copy(center);
  farShadowExtent = Math.hypot(width, depth) * 0.5 + (maxHeight - minHeight + 6) * 0.3 + 5;
  updateShadowExtent(farShadowExtent);
  sunLight.shadow.camera.far = Math.max(160, farShadowExtent * 5);
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.mapSize.set(4096, 4096);
  scene.fog = null;
  scene.background.copy(backgroundColorFromLight(light, stage.id));
  renderer.toneMappingExposure = Math.min(Number(light.exposure ?? 1), 0.9);
  document.documentElement.dataset.dioramaExposure = renderer.toneMappingExposure.toFixed(3);
  fx.bloom = clamp(Number(light.bloom ?? 0.32), 0, 1);
  bloomPass.strength = fx.bloom;
  updateFx();
}

function updateFx() {
  bloomPass.strength = fx.bloom;
  bokehPass.uniforms.aperture.value = 0.00012 + fx.blur * 0.00018;
  bokehPass.uniforms.maxblur.value = 0.00015 + fx.blur * 0.006;
  edgeBlurPass.uniforms.uBlur.value = fx.blur;
  const close = zoomBlend() > 0.025;
  bokehPass.enabled = close;
  edgeBlurPass.enabled = !close;
  document.documentElement.dataset.dioramaBloom = fx.bloom.toFixed(3);
  document.documentElement.dataset.dioramaBlur = fx.blur.toFixed(3);
}

function updateCamera(dt = 0) {
  if (!activeStage || !walkState || !avatar) return;
  const width = activeStage.size[0];
  const depth = activeStage.size[1];
  const close = zoomBlend();
  cameraCenter.set(width / 2, cameraFarTargetY - cameraFarShiftY * (1 - close), depth / 2);
  const follow = new THREE.Vector3(walkState.x, walkState.y + walkState.jumpHeight + 0.95, walkState.z);
  cameraGoal.copy(cameraCenter).lerp(follow, close);
  if (!cameraLook.lengthSq() || !dt) cameraLook.copy(cameraGoal);
  else cameraLook.lerp(cameraGoal, Math.min(1, dt * 4.2));
  const pitch = THREE.MathUtils.lerp(FAR_PITCH, NEAR_PITCH, close);
  const horizontal = cameraDistance * Math.cos(pitch);
  camera.position.set(
    cameraLook.x + Math.sin(yaw) * horizontal,
    cameraLook.y + cameraDistance * Math.sin(pitch),
    cameraLook.z + Math.cos(yaw) * horizontal,
  );
  camera.lookAt(cameraLook);
  const shadowTarget = cameraCenter.clone().lerp(new THREE.Vector3(walkState.x, walkState.y * 0.35, walkState.z), close);
  sunLight.target.position.copy(shadowTarget);
  sunLight.position.copy(shadowTarget).addScaledVector(sunDirection, Math.max(40, Math.max(width, depth) * 1.2));
  fillLight.target.position.copy(shadowTarget);
  fillLight.position.copy(shadowTarget).addScaledVector(sunDirection, -Math.max(40, Math.max(width, depth) * 1.2));
  updateShadowExtent(THREE.MathUtils.lerp(farShadowExtent, Math.max(12, cameraDistance * 0.45), close));
  sunLight.target.updateMatrixWorld();
  sunLight.updateMatrixWorld();
  fillLight.target.updateMatrixWorld();
  fillLight.updateMatrixWorld();
  focusOffset.set(walkState.x, walkState.y + walkState.jumpHeight + 0.95, walkState.z).sub(camera.position);
  camera.getWorldDirection(focusDirection);
  bokehPass.uniforms.focus.value = Math.max(camera.near + 0.1, focusOffset.dot(focusDirection));
  updateFx();
}

function setHudStage(stage) {
  for (const button of stageButtons.querySelectorAll('[data-stage]')) {
    if (button.dataset.stage === stage.id) button.textContent = stage.name;
    button.setAttribute('aria-pressed', String(button.dataset.stage === stage.id));
  }
}

function updateFacingAndPose(timeSeconds) {
  if (!avatar || !walkState) return;
  const moving = Math.hypot(walkState.velocityX, walkState.velocityZ) > 0.18;
  avatar.position.set(walkState.x, walkState.y + walkState.jumpHeight, walkState.z);
  avatar.rotation.y = walkState.facing;
  const gait = moving ? Math.sin(walkState.phase) : Math.sin(timeSeconds * 1.15) * 0.07;
  const air = walkState.jumpHeight > 0.03;
  const bodyBreath = moving ? Math.abs(Math.sin(walkState.phase * 2)) * 0.045 : Math.sin(timeSeconds * 2.1) * 0.022;
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
    if (name === 'body') {
      const basePosition = avatarBasePositions.get(part);
      if (basePosition) part.position.set(basePosition.x, basePosition.y + bodyBreath, basePosition.z);
    }
  }
  if (shadowDisc) {
    shadowDisc.position.set(walkState.x, walkState.y + 0.018, walkState.z);
    const shrink = clamp(1 - walkState.jumpHeight * 0.1, 0.58, 1);
    shadowDisc.scale.set(shrink, shrink, shrink);
    shadowDisc.material.opacity = 0.24 * shrink;
  }
  if (markerRing) {
    const close = zoomBlend();
    markerRing.visible = close < 0.86;
    markerRing.position.set(walkState.x, walkState.y + 0.035, walkState.z);
    const pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(timeSeconds * 0.75));
    markerRing.material.opacity = 0.82 * pulse * (1 - close / 0.86);
    if (markerTriangle) {
      markerTriangle.visible = close < 0.86;
      markerTriangle.position.set(walkState.x, walkState.y + walkState.jumpHeight + 2.04, walkState.z);
      markerTriangle.material.opacity = 0.88 * (1 - close / 0.86);
    }
  }
}

function updateParticles(dt) {
  if (!particleField) return;
  const position = particleField.geometry.attributes.position;
  const fall = particleField.kind === 'snow' || particleField.kind === 'ember' ? 1 : -1;
  for (let index = 0; index < position.count; index++) {
    let y = position.getY(index) + particleField.velocities[index] * dt * fall;
    if (fall < 0 && y > particleField.highY) y = particleField.lowY;
    if (fall > 0 && y < particleField.lowY) y = particleField.highY;
    position.setY(index, y);
    let x = position.getX(index) + Math.sin(index * 1.7 + performance.now() * 0.0002) * dt * 0.18;
    let z = position.getZ(index) + Math.cos(index * 1.3 + performance.now() * 0.00016) * dt * 0.14;
    if (x < 0) x += particleField.width;
    if (x > particleField.width) x -= particleField.width;
    if (z < 0) z += particleField.depth;
    if (z > particleField.depth) z -= particleField.depth;
    position.setX(index, x);
    position.setZ(index, z);
  }
  position.needsUpdate = true;
}

function animateStage(dt, timeSeconds) {
  for (const material of waterMaterials) material.uniforms.uTime.value = timeSeconds;
  for (const material of fallMaterials) material.uniforms.uTime.value = timeSeconds;
  for (const entry of glowMaterials) {
    const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 1.25 + entry.mesh.id * 0.17);
    if (entry.material.emissiveIntensity !== undefined) entry.material.emissiveIntensity = entry.baseIntensity * pulse;
    if (entry.mesh.userData.floatBaseY !== undefined) entry.mesh.position.y = entry.mesh.userData.floatBaseY + Math.sin(timeSeconds * 0.75 + entry.mesh.id) * 0.035;
  }
  for (const entry of glowSparkSystems) {
    const position = entry.geometry.attributes.position;
    const fade = entry.geometry.attributes.aSparkFade;
    for (let index = 0; index < entry.origins.length; index++) {
      const life = (entry.lifetimes[index] + dt * entry.speeds[index]) % 1;
      entry.lifetimes[index] = life;
      const origin = entry.origins[index];
      const sway = Math.sin(timeSeconds * 0.65 + index * 1.9 + entry.phase) * 0.07;
      position.setXYZ(index, origin.x + sway, origin.y + life * entry.rises[index], origin.z + Math.cos(timeSeconds * 0.57 + index * 1.4) * 0.06);
      fade.setX(index, THREE.MathUtils.smoothstep(life, 0.02, 0.15) * (1 - THREE.MathUtils.smoothstep(life, 0.76, 1)));
    }
    position.needsUpdate = true;
    fade.needsUpdate = true;
    entry.material.opacity = entry.baseOpacity * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(timeSeconds * 2.7 + entry.phase)));
  }
  for (const entry of foamSystems) {
    const position = entry.geometry.attributes.position;
    for (let index = 0; index < entry.origins.length; index++) {
      const origin = entry.origins[index];
      const phase = timeSeconds * 3.1 + index * 1.7 + entry.phase;
      position.setXYZ(index, origin.x + Math.sin(phase) * 0.12, origin.y + Math.abs(Math.sin(phase)) * 0.55, origin.z + Math.cos(phase) * 0.12);
    }
    position.needsUpdate = true;
    entry.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(timeSeconds * 4.0 + entry.phase));
  }
  updateParticles(dt);
}

function updateFlowDistance(timeSeconds) {
  if (!walkState || timeSeconds - lastFlowUpdate < 0.18) return;
  lastFlowUpdate = timeSeconds;
  let distance = Infinity;
  let kind = 'water';
  for (const source of liquidSources) {
    const candidate = Math.hypot(walkState.x - source.x, walkState.z - source.z);
    if (candidate < distance) { distance = candidate; kind = source.kind; }
  }
  sfx.setFlowDistance(distance, kind);
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
    updateFlowDistance(timeSeconds);
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
  cameraDistance = cameraDistanceForStage(activeStage);
  baseCameraDistance = cameraDistance;
  cameraLook.set(activeStage.size[0] / 2, cameraFarTargetY, activeStage.size[1] / 2);
  setParticles(activeStage);
  setHudStage(activeStage);
  sfx.changeAmbience(activeStage.ambience);
  updateFacingAndPose(performance.now() / 1000);
  updateCamera(0);
  updateFlowDistance(performance.now() / 1000);
}

async function changeStage(id) {
  const stageId = STAGE_IDS.includes(id) || id === 'demo' ? id : 'demo';
  if (mode === 'loading') { requestedStage = stageId; return; }
  if (switching) { requestedStage = stageId; return; }
  if (stageId === activeStageId) return;
  switching = true;
  mode = 'switching';
  setLoadingProgress(0);
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
    if (requestedStage) { setLoadingProgress(0); nextId = requestedStage; }
    else break;
  } while (true);
  setLoadingProgress(1);
  await sleep(16);
  fadeElement.style.opacity = '0';
  setLoadingProgress(0);
  await sleep(200);
  switching = false;
  mode = 'playing';
  if (requestedStage && requestedStage !== activeStageId) changeStage(requestedStage);
}

function resize() {
  const close = zoomBlend();
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  if (activeStage) {
    baseCameraDistance = cameraDistanceForStage(activeStage);
    cameraDistance = THREE.MathUtils.lerp(baseCameraDistance, CAMERA_NEAR_DISTANCE, close);
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  edgeBlurPass.uniforms.uTexel.value.set(1 / Math.max(1, window.innerWidth), 1 / Math.max(1, window.innerHeight));
  updateCamera(0);
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
window.__shotProbes = () => {
  if (!walkState || !activeStage) return null;
  const project = (point) => {
    const projected = point.clone().project(camera);
    return { x: (projected.x + 1) * 0.5 * window.innerWidth, y: (1 - projected.y) * 0.5 * window.innerHeight, visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 };
  };
  const hero = project(new THREE.Vector3(walkState.x, walkState.y + 1.3, walkState.z));
  let far = null;
  for (const distance of [30, 28, 26, 24, 22, 20, 18, 15, 12, 10, 8]) {
    const i = Math.floor(walkState.x + cameraForwardXZ.x * distance);
    const k = Math.floor(walkState.z + cameraForwardXZ.y * distance);
    const tile = tileAt(activeStage, i, k);
    if (tile) {
      const point = project(new THREE.Vector3(i + 0.5, tile.height + 0.2, k + 0.5));
      if (point.visible) { far = { ...point, distance }; break; }
    }
  }
  return { hero, far, size: activeStage.size, cameraDistance, pitch: THREE.MathUtils.radToDeg(THREE.MathUtils.lerp(FAR_PITCH, NEAR_PITCH, zoomBlend())) };
};
window.__viewMetrics = () => {
  if (!activeStage) return null;
  const [width, depth] = activeStage.size;
  const valid = activeStage.height.filter((height) => height >= 0);
  const minHeight = valid.length ? Math.min(...valid) - 6 : -6;
  const maxHeight = valid.length ? Math.max(...valid) : 1;
  const projected = [];
  for (const x of [0, width]) for (const y of [minHeight, maxHeight]) for (const z of [0, depth]) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    projected.push({ x: (point.x + 1) * 0.5 * window.innerWidth, y: (1 - point.y) * 0.5 * window.innerHeight });
  }
  const left = Math.min(...projected.map((point) => point.x));
  const right = Math.max(...projected.map((point) => point.x));
  const top = Math.min(...projected.map((point) => point.y));
  const bottom = Math.max(...projected.map((point) => point.y));
  const hud = hudElement.getBoundingClientRect();
  const overlapsHudX = right > hud.left && left < hud.right;
  const hudOverlap = overlapsHudX ? Math.max(0, Math.min(bottom, hud.bottom) - Math.max(top, hud.top)) : 0;
  const fitsViewport = left >= 0 && right <= window.innerWidth && top >= 0 && bottom <= hud.top;
  return {
    top: Number(top.toFixed(1)), bottom: Number(bottom.toFixed(1)), heightRatio: (bottom - top) / window.innerHeight,
    left: Number(left.toFixed(1)), right: Number(right.toFixed(1)), widthRatio: (right - left) / window.innerWidth,
    hudTop: Number(hud.top.toFixed(1)), hudOverlap: Number(hudOverlap.toFixed(1)), overlapsHud: hudOverlap > 0, fitsViewport,
  };
};
window.__lightingSamples = () => {
  const stats = { candidates: 0, visible: 0 };
  if (!activeStage || !activeStageGroup || !camera) return { shadow: [], sun: [], leafShadow: [], leafSun: [], stats };
  const [width, depth] = activeStage.size;
  const horizontalLength = Math.hypot(sunDirection.x, sunDirection.z);
  const rayX = sunDirection.x / horizontalLength;
  const rayZ = sunDirection.z / horizontalLength;
  const lightSlope = sunDirection.y / horizontalLength;
  const stride = Math.max(1, Math.ceil(width * depth / 440));
  const samples = { shadow: [], sun: [], leafShadow: [], leafSun: [] };
  const lightBlocked = (x, z, height) => {
    for (let distance = 0.8; distance < Math.max(width, depth) * 0.6; distance += 0.8) {
      const sampleI = Math.floor(x + rayX * distance);
      const sampleK = Math.floor(z + rayZ * distance);
      if (sampleI < 0 || sampleK < 0 || sampleI >= width || sampleK >= depth) break;
      const sampleIndex = sampleK * width + sampleI;
      const terrainTop = Number(activeStage.height[sampleIndex]);
      const propTop = activeStage.blocked?.[sampleIndex] ? terrainTop + 8 : terrainTop;
      if (terrainTop >= 0 && Math.max(terrainTop, propTop) > height + distance * lightSlope - 0.35) return true;
    }
    return false;
  };
  for (let index = 0; index < width * depth; index += stride) {
    const materialName = activeStage.materials[Number(activeStage.surface[index]) || 0] || 'grass';
    if (!/grass|turf/i.test(materialName) || Number(activeStage.height[index]) < 0) continue;
    stats.candidates++;
    const i = index % width;
    const k = Math.floor(index / width);
    const height = Number(activeStage.height[index]);
    const screen = new THREE.Vector3(i + 0.5, height + 0.04, k + 0.5).project(camera);
    if (screen.z <= -1 || screen.z >= 1 || Math.abs(screen.x) > 0.94 || Math.abs(screen.y) > 0.94) continue;
    stats.visible++;
    const screenPoint = { x: (screen.x + 1) * 0.5 * window.innerWidth, y: (1 - screen.y) * 0.5 * window.innerHeight, material: materialName, i, k };
    const key = lightBlocked(i + 0.5, k + 0.5, height) ? 'shadow' : 'sun';
    if (samples[key].length < 32) samples[key].push(screenPoint);
    if (samples.shadow.length >= 32 && samples.sun.length >= 32) break;
  }
  const leafMeshes = [];
  activeStageGroup.traverse((object) => {
    if (!object.isMesh || leafMeshes.length >= 160) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const labels = `${object.name} ${materials.map((material) => material?.name || '').join(' ')}`.toLowerCase();
    const namedFoliage = /leaf|leaves|foliage|canopy|tree|grass|bush|plant/.test(labels);
    const greenMaterial = materials.some((material) => {
      if (!material?.color) return false;
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      return hsl.h > 0.16 && hsl.h < 0.48 && hsl.s > 0.18;
    });
    if (namedFoliage || greenMaterial && /leaf|foliage|tree|grass|bush|plant/.test(labels)) leafMeshes.push(object);
  });
  for (const object of leafMeshes) {
    const vertices = object.geometry.attributes.position;
    if (!vertices?.count) continue;
    object.updateWorldMatrix(true, false);
    const sampleCount = Math.min(24, vertices.count);
    for (let sample = 0; sample < sampleCount; sample++) {
      if (samples.leafShadow.length >= 32 && samples.leafSun.length >= 32) break;
      const vertexIndex = Math.floor((sample + 0.5) * vertices.count / sampleCount);
      const point = new THREE.Vector3().fromBufferAttribute(vertices, vertexIndex).applyMatrix4(object.matrixWorld);
      const screen = point.clone().project(camera);
      if (screen.z <= -1 || screen.z >= 1 || Math.abs(screen.x) > 0.94 || Math.abs(screen.y) > 0.94) continue;
      stats.leafVisible = (stats.leafVisible || 0) + 1;
      const pointData = { x: (screen.x + 1) * 0.5 * window.innerWidth, y: (1 - screen.y) * 0.5 * window.innerHeight, material: object.name };
      const key = lightBlocked(point.x, point.z, point.y) ? 'leafShadow' : 'leafSun';
      if (samples[key].length < 32) samples[key].push(pointData);
    }
  }
  stats.leafCandidates = leafMeshes.length;
  stats.leafShadow = samples.leafShadow.length;
  stats.leafSun = samples.leafSun.length;
  return { ...samples, stats };
};
window.__setFx = (values = {}) => {
  if (Number.isFinite(Number(values.bloom))) fx.bloom = clamp(Number(values.bloom), 0, 1);
  if (Number.isFinite(Number(values.blur))) fx.blur = clamp(Number(values.blur), 0, 1);
  updateFx();
  return { ...fx };
};
window.__memoryProbe = async () => {
  if (!activeStage || !activeStageId) return null;
  renderFrame(0);
  const initialStage = activeStageId;
  const baseline = renderer.info.memory.geometries;
  const targets = ['meadow', 'canyon', 'snow'].filter((id) => id !== initialStage).slice(0, 2).concat(initialStage);
  const samples = [{ stage: initialStage, geometries: baseline }];
  for (const id of targets) {
    await changeStage(id);
    updateCamera(0);
    renderFrame(0);
    samples.push({ stage: id, geometries: renderer.info.memory.geometries });
  }
  const final = renderer.info.memory.geometries;
  return { samples, baseline, final, delta: final - baseline, sameStageDoesNotGrow: final <= baseline };
};
window.__sfxProbe = async () => {
  const originalAudioContext = window.AudioContext;
  const originalWebkitAudioContext = window.webkitAudioContext;
  const originalSetTimeout = window.setTimeout;
  const sampleRate = 44100;
  const duration = 1;
  const signals = new Map();
  const samples = {};
  const actions = [
    ['footstep-grass', (player) => player.footstep('grass')],
    ['footstep-stone', (player) => player.footstep('stone')],
    ['footstep-water', (player) => player.footstep('water', true)],
    ['jump', (player) => player.jump()],
    ['land', (player) => player.land(1, 'grass')],
    ...['meadow', 'desert', 'snow', 'volcano', 'sky'].map((kind) => [`ambience-${kind}`, (player) => player.changeAmbience(kind)]),
  ];
  try {
    window.setTimeout = (callback, milliseconds, ...args) => milliseconds > 1000 ? 0 : originalSetTimeout(callback, milliseconds, ...args);
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const [name, play] = actions[actionIndex];
      let offlineContext = null;
      const makeOfflineContext = function () {
        offlineContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
        return offlineContext;
      };
      window.AudioContext = makeOfflineContext;
      window.webkitAudioContext = makeOfflineContext;
      const player = new DioramaSfx();
      let seed = 9137 + actionIndex * 101;
      player.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      player._ensureContext();
      play(player);
      if (player.birdTimer) { originalSetTimeout(() => clearTimeout(player.birdTimer), 0); player.birdTimer = 0; }
      const audio = await offlineContext.startRendering();
      const signal = new Float32Array(audio.getChannelData(0));
      signals.set(name, signal);
      let sumSquares = 0;
      let peak = 0;
      for (const value of signal) { sumSquares += value * value; peak = Math.max(peak, Math.abs(value)); }
      samples[name] = { rms: Math.sqrt(sumSquares / signal.length), max: peak };
    }
  } finally {
    window.AudioContext = originalAudioContext;
    window.webkitAudioContext = originalWebkitAudioContext;
    window.setTimeout = originalSetTimeout;
  }
  const waveformDifference = (leftName, rightName) => {
    const left = signals.get(leftName);
    const right = signals.get(rightName);
    if (!left || !right || left.length !== right.length) return null;
    let sumSquares = 0;
    for (let index = 0; index < left.length; index++) { const difference = left[index] - right[index]; sumSquares += difference * difference; }
    return Math.sqrt(sumSquares / left.length);
  };
  const footsteps = {
    grassStone: waveformDifference('footstep-grass', 'footstep-stone'),
    grassWater: waveformDifference('footstep-grass', 'footstep-water'),
    stoneWater: waveformDifference('footstep-stone', 'footstep-water'),
  };
  const withinLimits = Object.values(samples).every((sample) => sample.rms >= 0.005 && sample.max <= 0.9);
  const footstepsDiffer = Object.values(footsteps).every((difference) => difference !== null && difference > 0.0001);
  return { sampleRate, seconds: duration, samples, footsteps, withinLimits, footstepsDiffer };
};

root.addEventListener('change', (event) => {
  if (event.target.matches('[data-stage]')) changeStage(event.target.dataset.stage);
});
root.addEventListener('click', (event) => {
  const stageButton = event.target.closest('[data-stage]');
  if (stageButton) { changeStage(stageButton.dataset.stage); return; }
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
  cameraDistance = clamp(cameraDistance * Math.exp(event.deltaY * 0.001), CAMERA_NEAR_DISTANCE, baseCameraDistance * 1.25);
}, { passive: false });
window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('#hud')) return;
  sfx.unlock();
  const key = event.key.toLowerCase();
  if (key === 'home') {
    cameraDistance = baseCameraDistance;
    updateFx();
    updateCamera(0);
    event.preventDefault();
    return;
  }
  if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
  if (/^[1-5]$/.test(key) && !event.repeat) changeStage(STAGE_IDS[Number(key) - 1]);
  heldKeys.add(key);
});
window.addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { heldKeys.clear(); pointerDrag.active = false; pointerDrag.moveX = 0; pointerDrag.moveY = 0; });
window.addEventListener('resize', resize);

async function start() {
  const queryStage = q.get('stage') || 'meadow';
  const initialId = STAGE_IDS.includes(queryStage) || queryStage === 'demo' ? queryStage : 'demo';
  setLoadingProgress(0);
  const initialPack = await readStage(initialId);
  if (initialId !== 'demo') loadedHero = await readHero();
  installAvatar(loadedHero);
  installStage(initialPack);
  activeStageId = initialId;
  if (q.has('at')) {
    const [i, k] = q.get('at').split(',').map(Number);
    if (Number.isFinite(i) && Number.isFinite(k)) teleport(i, k);
  }
  if (q.get('zoom') === 'near') cameraDistance = CAMERA_NEAR_DISTANCE;
  else if (q.get('zoom') === 'far') cameraDistance = baseCameraDistance;
  if (q.has('bloom')) fx.bloom = clamp(Number(q.get('bloom')) || 0, 0, 1);
  if (q.has('blur')) fx.blur = clamp(Number(q.get('blur')) || 0, 0, 1);
  updateFacingAndPose(performance.now() / 1000);
  updateCamera(0);
  paused = q.get('pause') === '1';
  updateFx();
  setLoadingProgress(1);
  fadeElement.style.opacity = '0';
  renderFrame(0);
  if (paused) {
    document.documentElement.dataset.dioramaProbes = JSON.stringify(window.__shotProbes());
    document.documentElement.dataset.dioramaLightingSamples = JSON.stringify(window.__lightingSamples());
  }
  await sleep(210);
  mode = 'playing';
  if (q.get('sfx') === '1') {
    const samples = await window.__sfxProbe();
    document.documentElement.dataset.dioramaSfx = JSON.stringify(samples);
  }
  if (q.get('memory') === '1') {
    const memory = await window.__memoryProbe();
    document.documentElement.dataset.dioramaMemory = JSON.stringify(memory);
  }
  updateCamera(0);
  renderFrame(0);
  document.documentElement.dataset.dioramaViewMetrics = JSON.stringify(window.__viewMetrics());
  document.documentElement.dataset.dioramaLightingSamples = JSON.stringify(window.__lightingSamples());
  window.__ready = true;
  document.documentElement.dataset.dioramaReady = 'true';
  setLoadingProgress(0);
  window.requestAnimationFrame(animate);
}

start().catch((error) => {
  console.error(error);
  document.documentElement.dataset.dioramaErrors = '1';
  document.documentElement.dataset.dioramaReady = 'false';
  mode = 'playing';
  window.__ready = true;
});
