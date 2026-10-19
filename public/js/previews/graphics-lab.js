// グラフィック実験場: 森 → 小径 → 軽い坂 → 川の橋 → こみち → コテージ を一続きに置いた見本の場所
//   ゲームと同じトゥーン・輪郭線・木と岩・草・仕上げ（ブルームと色）で描く。見え方を確かめるためのページ（lab.html）
//   ?view=all|forest|river|bridge|lane|cottage|walk|game / ?style=ro（RO風: 手描き風の地面・背景の線なし・やわらかい陰影・望遠の見下ろし） / ?time=day|evening|night / ?post=0（仕上げを切る）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Batch, toon, glow, outline, OCC, gradientMap } from '../toon.js';
import { roGroundMaterial, paintedTree } from './ro-style.js';
import { seeded, local, I, noise2 } from '../env/kit.js';
import { groundDetail, SURF } from '../env/textures.js';
import { addTree, addPine, addRock } from '../env/flora.js';
import { makeSky, makeGrass } from '../env/landmarks.js';
import { makeProp } from '../env/props.js';
import { dotTexture } from '../env/ambient.js';

const q = new window.URLSearchParams(location.search);
const R = seeded(Number(q.get('seed') || 5));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const state0 = {}; // 動かすもの（塔の飾り）

// ======================================================================
// 地形: 川・道・斜面・コテージの平地を高さ関数にまとめる
// ======================================================================
const riverZ = (x) => Math.sin(x * 0.06) * 2.5 + Math.sin(x * 0.17 + 1) * 0.8; // 川の中心（x ごとの z）
const WATER_Y = -0.75;
const BRIDGE_X = 8;
const COTTAGE = { x: -10, z: -46 };

// 道（中心線）: 森の中の小径 → 橋 → こみち
const curve = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const bz = riverZ(BRIDGE_X), BR_A = bz + 7.5, BR_B = bz - 7.5; // 橋のたもと（南・北）
const southPath = curve([[0, 78], [-1, 62], [-6, 46], [1, 32], [6, 20], [BRIDGE_X, 13], [BRIDGE_X, BR_A]]);
const northPath = curve([[BRIDGE_X, BR_B], [BRIDGE_X - 0.5, -10], [5, -17], [-1, -24], [-6, -31], [-9, -37], [COTTAGE.x, -40.5]]);
const pathPts = [...southPath.getSpacedPoints(160), ...northPath.getSpacedPoints(110)];
function pathDist(x, z) {
  let m = 1e9;
  for (const p of pathPts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; }
  // 橋の上も道のうち
  if (Math.abs(x - BRIDGE_X) < 2 && z < BR_A && z > BR_B) m = Math.min(m, (x - BRIDGE_X) ** 2);
  return Math.sqrt(m);
}

function rawHeight(x, z) {
  let h = noise2(x, z) * 0.35;
  // 北東の斜面（川の北、こみちの東）
  h += smooth(14, 44, x) * smooth(-4, -22, z) * 9 * (0.85 + 0.15 * Math.sin(z * 0.2 + x * 0.1));
  // 川の両岸は少し高く（坂を上って橋へ）、川の中は掘る
  const d = Math.abs(z - riverZ(x));
  h += 1.7 * smooth(20, 6.5, d);
  h = lerp(h, -1.7, smooth(6, 2.8, d));
  // コテージの平地
  const dc = Math.hypot(x - COTTAGE.x, z - COTTAGE.z);
  h = lerp(h, 0.35, smooth(13, 7, dc));
  // 外周はゆるく盛り上げて地平線を隠す
  const r = Math.hypot(x * 0.9, z * 0.8);
  h += Math.max(0, r - 72) * 0.5;
  return h;
}
// 道の上は凸凹をならす
const heightAt = (x, z) => {
  const h = rawHeight(x, z), k = smooth(3.2, 0.8, pathDist(x, z));
  return k > 0 ? lerp(h, h - noise2(x, z) * 0.35 * 0.8, k) : h;
};

// ======================================================================
// レンダラー・光・仕上げ（game/render.js と同じ組み立て）
// ======================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.95);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 }, contrast: { value: 1.04 }, vig: { value: 0.22 }, lift: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float contrast; uniform float vig; uniform vec3 lift; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += lift * (1.0 - l); // 暗いところを色で持ち上げる（影を黒でなく青紫に）
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c.rgb *= 1.0 - vig * smoothstep(0.35, 0.85, length(d));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
});
composer.addPass(gradePass);

// 時間帯: 空・霧・光・窓明かり
const TIMES = {
  day: { name: '昼', skyTop: 0x5fa8f0, skyBot: 0xdcefff, sunC: 0xfff2c0, fog: 0xcfe6f7, near: 70, far: 190, hemiS: 0xd8ecff, hemiG: 0x4a5a30, hemiI: 1.05, sunI: 2.2, sunP: [30, 45, 18], exp: 1.0, win: 0.55 },
  evening: { name: '夕方', skyTop: 0x5a5a9a, skyBot: 0xffb070, sunC: 0xffc070, fog: 0xe8b090, near: 55, far: 170, hemiS: 0xffc8a0, hemiG: 0x40304a, hemiI: 0.8, sunI: 1.8, sunP: [45, 14, -10], exp: 1.0, win: 1.1 },
  night: { name: '夜', skyTop: 0x0a1030, skyBot: 0x283a68, sunC: 0x000000, fog: 0x1a2440, near: 35, far: 130, hemiS: 0x6a80c0, hemiG: 0x10141e, hemiI: 0.55, sunI: 0.55, sunP: [-20, 40, 25], exp: 1.15, win: 1.6 },
};
const sky = makeSky({ skyTop: TIMES.day.skyTop, skyBot: TIMES.day.skyBot, sun: TIMES.day.sunC }, false);
scene.add(sky);
const sunOff = new THREE.Vector3();
const windowMat = glow(0xffd890);
const lampMat = glow(0xffc870);
function setTime(key) {
  const t = TIMES[key];
  sky.material.uniforms.top.value.set(t.skyTop); sky.material.uniforms.bot.value.set(t.skyBot); sky.material.uniforms.sunC.value.set(t.sunC);
  scene.fog = new THREE.Fog(t.fog, t.near, t.far);
  hemi.color.set(t.hemiS); hemi.groundColor.set(t.hemiG); hemi.intensity = t.hemiI * (state.ro ? 1.45 : 1);
  sun.intensity = t.sunI * (state.ro ? 0.6 : 1); sun.color.set(key === 'night' ? 0x8aa0e0 : t.sunC);
  sunOff.set(...t.sunP);
  renderer.toneMappingExposure = t.exp;
  windowMat.color.set(0xffd890).multiplyScalar(t.win);
  lampMat.color.set(0xffc870).multiplyScalar(t.win * 1.1);
  state.time = key;
  for (const sp of treeSprites.children) sp.material.color.set(key === 'night' ? 0x5a6a9a : key === 'evening' ? 0xffd2a8 : 0xffffff);
  blobShadows.material.opacity = key === 'night' ? 0.12 : 0.3;
}

// ======================================================================
// 地面（頂点色: 草・森の土・道・川岸・斜面の岩肌）
// ======================================================================
const SIZE = 220, SEG = 220;
const groundMats = {};
let ground;
{
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal, cols = new Float32Array(pos.count * 3), splat = new Float32Array(pos.count * 3), shade = new Float32Array(pos.count * 3);
  const grass1 = new THREE.Color(0x5f9a45), grass2 = new THREE.Color(0x86b44e), forest = new THREE.Color(0x3f6c34),
    dirt = new THREE.Color(0x9a7a52), bank = new THREE.Color(0x857458), rock = new THREE.Color(0x7d7a6c), c = new THREE.Color();
  const Rg = seeded(77);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09);
    c.copy(grass1).lerp(grass2, k * 0.85 + Rg() * 0.15);
    c.lerp(forest, smooth(14, 26, z) * 0.75 * (0.8 + 0.2 * k)); // 南の森の下は暗い土と苔
    c.lerp(rock, smooth(0.86, 0.7, nrm.getY(i)) * 0.8); // 急な面は岩肌
    const d = Math.abs(z - riverZ(x));
    c.lerp(bank, smooth(7.5, 5, d) * 0.8);
    if (y < WATER_Y + 0.25 && d < 8) c.lerp(new THREE.Color(0x5a5a48), 0.5);
    const pd = pathDist(x, z);
    c.lerp(dirt, smooth(2.4, 1.2, pd) * (0.75 + Rg() * 0.15));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    // RO風の地面: 模様の割合（草・土・岸）と色の掛け算
    const steep = smooth(0.86, 0.7, nrm.getY(i)), forestK = smooth(14, 26, z);
    splat[i * 3] = 1; splat[i * 3 + 1] = smooth(2.6, 1.2, pd); splat[i * 3 + 2] = Math.max(smooth(7, 5, d), smooth(0.8, 0.62, nrm.getY(i)), y < WATER_Y + 0.3 && d < 8 ? 1 : 0);
    const sh = (0.94 + k * 0.1) * (1 - forestK * 0.2) * (y < WATER_Y + 0.25 && d < 8 ? 0.75 : 1);
    shade[i * 3] = sh * (1 - forestK * 0.05); shade[i * 3 + 1] = sh; shade[i * 3 + 2] = sh * (1 + forestK * 0.04);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 3)); g.setAttribute('shade', new THREE.BufferAttribute(shade, 3));
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SIZE / 7, uv.getY(i) * SIZE / 7);
  groundMats.toon = toon(0xffffff, { vertexColors: true, noOcc: true, map: groundDetail() });
  groundMats.ro = roGroundMaterial();
  ground = new THREE.Mesh(g, groundMats.toon);
  ground.receiveShadow = true; scene.add(ground);
}

// ======================================================================
// 川の水面（流れの筋と岸の白い泡が動く）
// ======================================================================
const waterU = { uTime: { value: 0 } };
{
  const g = new THREE.PlaneGeometry(SIZE, 12, 220, 6); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + riverZ(pos.getX(i)));
  g.computeVertexNormals();
  const m = new THREE.MeshToonMaterial({ color: 0x3a8ad0, transparent: true, opacity: 0.86 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterU);
    sh.vertexShader = 'varying vec3 vWW; varying float vAcross;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWW = (modelMatrix * vec4(position, 1.0)).xyz; vAcross = uv.y;');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWW; varying float vAcross;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float e = abs(vAcross - 0.5) * 2.0;
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.45, 0.78, 0.86), smoothstep(0.35, 0.8, e));
      float s = sin(vWW.x * 0.7 - uTime * 2.2 + sin(vWW.z * 1.1 + vWW.x * 0.2) * 2.0) * sin(vWW.x * 0.23 + uTime * 0.4 + vWW.z * 0.5);
      diffuseColor.rgb += vec3(0.9, 0.97, 1.0) * smoothstep(0.72, 0.8, s) * 0.45;
      float foam = smoothstep(0.78, 0.9, e + sin(vWW.x * 2.3 - uTime * 3.0) * 0.04);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.98, 1.0), foam * 0.85);
      diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`);
  };
  const water = new THREE.Mesh(g, m); water.position.y = WATER_Y; water.receiveShadow = true;
  water.userData.noOutline = true; scene.add(water);
}

// ======================================================================
// 森・斜面・川岸の木と岩、花、キノコ
// ======================================================================
const B = new Batch({ chunk: 24 });
const FB = new Batch({ chunk: 24 }); // 花（小さいので輪郭線を付けない）
const riverD = (x, z) => Math.abs(z - riverZ(x));
const nearCottage = (x, z, pad = 0) => Math.hypot(x - COTTAGE.x, z - COTTAGE.z) < 11 + pad;
const free = (x, z, pad) => pathDist(x, z) > pad && riverD(x, z) > 6 + pad * 0.3 && !nearCottage(x, z, pad);
function place(fn, tries, area, pad) {
  for (let i = 0; i < tries; i++) {
    const x = lerp(area[0], area[1], R()), z = lerp(area[2], area[3], R());
    if (!free(x, z, pad)) continue;
    fn(x, z, local(I, x, heightAt(x, z) - 0.05, z, 0, R() * 6.28, 0));
  }
}
const SPECIES = ['oak', 'tall', 'young', 'twin', 'birch', 'old'];
// 木は別の入れ物（RO風では絵の木に差し替えるので、まとめて隠せるように）。置いた場所を覚えておく
const TB = new Batch({ chunk: 24 }), trees = [];
const tree = (M, x, z, o) => { addTree(TB, M, R, o); trees.push({ x, z, kind: 'broad', size: o.size || 1, v: o.species === 'birch' || o.species === 'young' ? 2 : o.fruit && R() < 0.3 ? 1 : R() < 0.7 ? 0 : 2 }); };
const pine = (M, x, z, o) => { addPine(TB, M, R, o); trees.push({ x, z, kind: 'pine', size: o.size || 1, v: Math.floor(R() * 2) }); };
// 南の森（道の両側に密に、道から離れるほど針葉樹）
place((x, z, M) => {
  if (R() < 0.25 + smooth(10, 40, Math.abs(x)) * 0.4) pine(M, x, z, { size: 0.9 + R() * 0.5 });
  else tree(M, x, z, { species: SPECIES[Math.floor(R() * SPECIES.length)], size: 0.85 + R() * 0.55, leaf: new THREE.Color(0x3f8f3a).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.08).getHex() });
}, 260, [-75, 75, 14, 85], 3.6);
// 森の下草: 岩・キノコ・花
place((x, z, M) => addRock(B, M, R, { moss: 0.8, size: 0.5 + R() * 0.7 }), 45, [-50, 50, 14, 75], 2.2);
place((x, z, M) => makeProp(B, 'mushroom', M, R, 0xd04a3a, 0xf0e6d0, {}), 30, [-30, 30, 14, 70], 1.6);
// 川の南岸の木（まばら）
place((x, z, M) => tree(M, x, z, { species: R() < 0.5 ? 'birch' : 'young', size: 0.8 + R() * 0.4 }), 40, [-70, 70, 4, 14], 3);
// 北東の斜面: 針葉樹と岩
place((x, z, M) => (R() < 0.6 ? pine(M, x, z, { size: 0.9 + R() * 0.6 }) : addRock(B, M, R, { kind: R() < 0.5 ? 'slab' : 'boulder', moss: 0.5, size: 0.9 + R() * 1.2 })), 160, [16, 80, -80, -8], 2.5);
// 北西（コテージの裏）の木立
place((x, z, M) => tree(M, x, z, { species: SPECIES[Math.floor(R() * 6)], size: 0.9 + R() * 0.5, fruit: 0.3 }), 70, [-75, -2, -85, -52], 3);
place((x, z, M) => tree(M, x, z, { species: 'old', size: 1.2 }), 10, [-75, -25, -50, -20], 4);
// 川岸の石
for (let i = 0; i < 70; i++) {
  const x = lerp(-80, 80, R()); if (Math.abs(x - BRIDGE_X) < 4) continue;
  const side = R() < 0.5 ? -1 : 1, z = riverZ(x) + side * (4.2 + R() * 2.5);
  addRock(B, local(I, x, heightAt(x, z) - 0.2, z, 0, R() * 6.28, 0), R, { kind: R() < 0.5 ? 'cluster' : 'boulder', moss: 0.4, size: 0.35 + R() * 0.5 });
}
// 草地の花（こみちの周りとコテージの庭に多く）
place((x, z, M) => makeProp(FB, 'flower', M, R, [0xf0d040, 0xe06a8a, 0xb08ae0, 0xffffff][Math.floor(R() * 4)], 0xf08a3a, {}), 500, [-40, 30, -60, -6], 1.2);

// ======================================================================
// 橋: 両岸の石の土台と、ゆるく反った木の床・手すり
// ======================================================================
const wood = (c) => new THREE.Color(c).offsetHSL(0, 0, (R() - 0.5) * 0.06);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
const bridgeY = [];
{
  const hA = heightAt(BRIDGE_X, BR_A), hB = heightAt(BRIDGE_X, BR_B), N = 26;
  const deckAt = (t) => lerp(hA, hB, t) + Math.sin(Math.PI * t) * 1.1 + 0.12;
  for (const [z, h, s] of [[BR_A - 0.6, hA, 1], [BR_B + 0.6, hB, -1]]) {
    B.add(box(4.4, 3.2, 2.6), 0x9a948a, local(I, BRIDGE_X, h - 1.3, z), { surf: SURF.masonry });
    for (const sx of [-1, 1]) B.add(cyl(0.32, 0.4, 1.5, 8), 0x8a8478, local(I, BRIDGE_X + sx * 1.9, h + 0.6, z + s * 0.4), { surf: SURF.stone });
  }
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = lerp(BR_A, BR_B, t), y = deckAt(t);
    bridgeY.push([z, y]);
    const slope = Math.atan2(deckAt(Math.min(1, t + 0.01)) - deckAt(Math.max(0, t - 0.01)), (BR_A - BR_B) * 0.02);
    B.add(box(3.2, 0.14, 0.5), wood(0x8a5a32), local(I, BRIDGE_X + (R() - 0.5) * 0.08, y, z, slope, (R() - 0.5) * 0.03, 0), { surf: SURF.wood });
    if (i % 3 === 0) {
      const posts = [-1, 1].map((sx) => new THREE.Vector3(BRIDGE_X + sx * 1.55, y + 0.5, z));
      for (const p of posts) B.add(box(0.16, 1.1, 0.16), wood(0x6a4226), local(I, p.x, p.y, p.z), { surf: SURF.wood });
      if (prev) for (let k = 0; k < 2; k++) {
        const a = prev[k], b = posts[k], mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
        const ang = Math.atan2(b.y - a.y, -(b.z - a.z));
        B.add(box(0.12, 0.12, len + 0.1), wood(0x7a4c2a), local(I, mid.x, mid.y + 0.42, mid.z, ang, 0, 0), { surf: SURF.wood });
      }
      prev = posts;
    }
  }
  // 床の下の桁（2本の反った梁）
  for (const sx of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, z0 = lerp(BR_A, BR_B, t0), z1 = lerp(BR_A, BR_B, t1), y0 = deckAt(t0) - 0.2, y1 = deckAt(t1) - 0.2;
    B.add(box(0.22, 0.3, Math.hypot(z1 - z0, y1 - y0) + 0.05), 0x5a3a22, local(I, BRIDGE_X + sx * 1.2, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(y1 - y0, -(z1 - z0)), 0, 0), { surf: SURF.wood });
  }
}
// 道の上の高さ（橋の上は床の高さ）
const walkY = (x, z) => {
  if (Math.abs(x - BRIDGE_X) < 1.7 && z <= BR_A && z >= BR_B) {
    for (let i = 1; i < bridgeY.length; i++) if (bridgeY[i][0] <= z) { const [z0, y0] = bridgeY[i - 1], [z1, y1] = bridgeY[i]; return lerp(y0, y1, (z - z0) / (z1 - z0)) + 0.07; }
  }
  return heightAt(x, z);
};

// ======================================================================
// こみち: 橋の先は飛び石と低い石垣、ランタンの道しるべ
// ======================================================================
{
  const pts = northPath.getSpacedPoints(60);
  for (let i = 6; i < pts.length - 1; i++) {
    const p = pts[i], n = pts[i + 1], dx = n.x - p.x, dz = n.z - p.z, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (const off of [-0.45, 0.45]) {
      if (R() < 0.25) continue;
      const x = p.x + nx * (off + (R() - 0.5) * 0.3), z = p.z + nz * (off + (R() - 0.5) * 0.3);
      B.add(cyl(0.38 + R() * 0.15, 0.45 + R() * 0.15, 0.16, 7), new THREE.Color(0xa8a498).offsetHSL(0, 0, (R() - 0.5) * 0.08), local(I, x, heightAt(x, z) + 0.03, z, (R() - 0.5) * 0.08, R() * 6, 0, 1, 1, 0.8 + R() * 0.4), { surf: SURF.stone });
    }
    // 道の脇の低い石垣（ところどころ）
    if (i % 2 === 0 && i > 14 && i < 50) for (const side of [-1, 1]) {
      if (R() < 0.4) continue;
      const x = p.x + nx * side * 2.3, z = p.z + nz * side * 2.3;
      B.add(new THREE.DodecahedronGeometry(0.35, 0), new THREE.Color(0x908c80).offsetHSL(0, 0, (R() - 0.5) * 0.1), local(I, x, heightAt(x, z) + 0.15, z, R(), R() * 6, R(), 1.2, 0.8, 1), { surf: SURF.stone, flat: true });
    }
  }
}
// ランタンの柱（道に沿って）
function lantern(x, z) {
  const y = heightAt(x, z), G = local(I, x, y, z);
  B.add(cyl(0.08, 0.1, 2.4, 6), 0x3a2a1e, local(G, 0, 1.2, 0), { surf: SURF.wood });
  B.add(box(0.7, 0.08, 0.08), 0x3a2a1e, local(G, 0.3, 2.35, 0));
  B.add(cyl(0.16, 0.13, 0.32, 6), 0x2a2420, local(G, 0.58, 2.05, 0));
  B.add(cyl(0.2, 0.16, 0.12, 6), 0x2a2420, local(G, 0.58, 2.27, 0));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMat); lamp.position.set(x + 0.58, y + 2.05, z); scene.add(lamp);
}
for (const [x, z] of [[1.5, 58], [4.2, 22], [10.2, 9.5], [10, -10], [-3.2, -24.5], [-12, -38]]) lantern(x, z);

// ======================================================================
// ファンタジーなコテージ: 石の土台・漆喰と木組み・急なとんがり屋根・丸い塔・煙突・丸窓・丸い戸
// ======================================================================
const smokeOrigin = new THREE.Vector3();
{
  const y0 = heightAt(COTTAGE.x, COTTAGE.z), C = local(I, COTTAGE.x, y0, COTTAGE.z, 0, 0.12, 0);
  const W = 7, D = 5.4, H = 3.1, base = 0.6;
  const plaster = 0xf2e4c6, beam = 0x5a3820, roofC = 0x5e5aa8, stone = 0x9c968a;
  B.add(box(W + 0.4, base, D + 0.4), stone, local(C, 0, base / 2, 0), { surf: SURF.masonry });
  B.add(box(W, H, D), plaster, local(C, 0, base + H / 2, 0), { surf: SURF.plaster });
  // 木組み（柱・梁・筋かい）
  for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) B.add(box(0.22, H, 0.22), beam, local(C, sx * W / 2, base + H / 2, sz * (D / 2 + 0.04)), { surf: SURF.wood });
  for (const sx of [-1, 1]) for (const sz of [-0.33, 0.33]) B.add(box(0.22, H, 0.22), beam, local(C, sx * (W / 2 + 0.04), base + H / 2, sz * D / 2), { surf: SURF.wood });
  for (const yy of [base + 0.1, base + H * 0.55, base + H - 0.08]) {
    for (const sz of [-1, 1]) B.add(box(W + 0.1, 0.2, 0.2), beam, local(C, 0, yy, sz * (D / 2 + 0.06)), { surf: SURF.wood });
    for (const sx of [-1, 1]) B.add(box(0.2, 0.2, D + 0.1), beam, local(C, sx * (W / 2 + 0.06), yy, 0), { surf: SURF.wood });
  }
  for (const sx of [-1, 1]) B.add(box(0.16, 1.9, 0.16), beam, local(C, sx * W * 0.33, base + H * 0.28, D / 2 + 0.07, 0, 0, sx * 0.62), { surf: SURF.wood });
  // 屋根: 急な切妻を少し反らせ、軒を深く。2枚を数段に分けて反りを出す
  const pitch = 0.95, half = D / 2 + 0.9, rise = Math.tan(pitch) * (D / 2);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4, sag = (t) => Math.sin(Math.PI * t) * 0.25;
    const z0 = s * lerp(half, 0, t0), z1 = s * lerp(half, 0, t1);
    const y0r = base + H - 0.35 + lerp(-0.6, rise + 0.25, t0) - sag(t0), y1r = base + H - 0.35 + lerp(-0.6, rise + 0.25, t1) - sag(t1);
    const len = Math.hypot(z1 - z0, y1r - y0r) + 0.08;
    B.add(box(W + 1.4, 0.32, len), new THREE.Color(roofC).offsetHSL(0, 0, -k * 0.015), local(C, 0, (y0r + y1r) / 2, (z0 + z1) / 2, s * Math.atan2(y1r - y0r, Math.abs(z1 - z0)), 0, 0), { surf: SURF.roof });
  }
  B.add(cyl(0.18, 0.18, W + 1.6, 8), 0x4a3a6a, local(C, 0, base + H + rise - 0.1, 0, 0, 0, Math.PI / 2), { surf: SURF.wood });
  // 妻壁（三角）と丸窓
  const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)]);
  for (const sx of [-1, 1]) {
    B.add(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), plaster, local(C, sx * (W / 2 - 0.1), base + H, 0, 0, Math.PI / 2, 0), { surf: SURF.plaster });
    const wy = base + H + rise * 0.4;
    B.add(new THREE.TorusGeometry(0.42, 0.09, 6, 16), beam, local(C, sx * (W / 2 + 0.12), wy, 0, 0, Math.PI / 2, 0));
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), windowMat);
    win.applyMatrix4(local(C, sx * (W / 2 + 0.13), wy, 0, 0, sx * Math.PI / 2, 0)); scene.add(win);
  }
  // 屋根窓（ドーマー）
  {
    const dz = D / 2 - 0.3, dy = base + H + 0.55;
    B.add(box(1.4, 1.2, 1.6), plaster, local(C, 1.4, dy, dz - 0.4), { surf: SURF.plaster });
    for (const s of [-1, 1]) B.add(box(0.95, 0.12, 1.9), roofC, local(C, 1.4 + s * 0.42, dy + 0.85, dz - 0.4, 0, 0, -s * 0.75), { surf: SURF.roof });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.7), windowMat); win.applyMatrix4(local(C, 1.4, dy - 0.05, dz + 0.41)); scene.add(win);
    B.add(box(0.06, 0.72, 0.05), beam, local(C, 1.4, dy - 0.05, dz + 0.43));
  }
  // 前面: 丸い戸・窓・花箱
  const fz = D / 2 + 0.05;
  B.add(box(1.3, 1.65, 0.12), 0x7a4a2a, local(C, -0.6, base + 0.83, fz + 0.02), { surf: SURF.wood });
  B.add(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 16, 1, false, -Math.PI / 2, Math.PI), 0x7a4a2a, local(C, -0.6, base + 1.65, fz + 0.02, Math.PI / 2, 0, 0), { surf: SURF.wood });
  B.add(new THREE.TorusGeometry(0.78, 0.12, 6, 16, Math.PI), stone, local(C, -0.6, base + 1.65, fz + 0.06), { surf: SURF.stone });
  for (const sx of [-1, 1]) B.add(box(0.24, 1.65, 0.24), stone, local(C, -0.6 + sx * 0.78, base + 0.83, fz + 0.06), { surf: SURF.stone });
  B.add(new THREE.SphereGeometry(0.07, 8, 6), 0xe0b84a, local(C, -0.2, base + 0.95, fz + 0.12));
  B.add(box(1.8, 0.2, 0.9), stone, local(C, -0.6, 0.1, fz + 0.6), { surf: SURF.stone });
  for (const [wx, wy, wz, ry] of [[1.9, base + 1.6, fz + 0.04, 0], [-2.6, base + 1.6, fz + 0.04, 0], [W / 2 + 0.04, base + 1.6, -0.8, Math.PI / 2], [-W / 2 - 0.04, base + 1.6, 1.0, -Math.PI / 2]]) {
    const M = local(C, wx, wy, wz, 0, ry, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), windowMat); win.applyMatrix4(local(M, 0, 0, 0.03)); scene.add(win);
    B.add(box(0.08, 1.0, 0.06), beam, local(M, 0, 0, 0.06)); B.add(box(0.9, 0.08, 0.06), beam, local(M, 0, 0, 0.06));
    B.add(box(1.15, 0.12, 0.14), beam, local(M, 0, 0.56, 0.06)); B.add(box(1.15, 0.12, 0.2), beam, local(M, 0, -0.56, 0.08));
    for (const s of [-1, 1]) B.add(box(0.42, 1.05, 0.06), 0x4a6a8a, local(M, s * 0.72, 0, 0.08, 0, s * 0.35, 0), { surf: SURF.wood }); // 鎧戸
    B.add(box(1.0, 0.24, 0.3), 0x6a4226, local(M, 0, -0.75, 0.2), { surf: SURF.wood }); // 花箱
    for (let k = 0; k < 6; k++) B.add(new THREE.SphereGeometry(0.09, 6, 4), [0xe0507a, 0xf0d040, 0xffffff][k % 3], local(M, -0.4 + k * 0.16, -0.58, 0.22 + (k % 2) * 0.08));
  }
  // 丸い塔（左前）: 石積み、とんがり帽子の屋根が少し傾く、先に光る飾り
  const T = local(C, -W / 2 - 0.3, 0, D / 2 - 0.6);
  B.add(cyl(1.35, 1.5, 5.4, 14), 0xb0a898, local(T, 0, 2.7, 0), { surf: SURF.masonry });
  B.add(new THREE.TorusGeometry(1.4, 0.14, 6, 18), 0x8a8478, local(T, 0, 5.35, 0, Math.PI / 2, 0, 0), { surf: SURF.stone });
  const hat = new THREE.LatheGeometry([[0.01, -0.12], [1.9, -0.12], [1.95, 0], [1.55, 0.25], [1.05, 1.2], [0.6, 2.4], [0.25, 3.4], [0.01, 4.2]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  B.add(hat, roofC, local(T, 0, 5.4, 0, 0.06, 0, 0.13), { surf: SURF.roof });
  for (const [a, yy] of [[0.4, 3.2], [2.6, 1.6]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.7), windowMat);
    win.applyMatrix4(local(T, Math.sin(a) * 1.44, yy, Math.cos(a) * 1.44, 0, a, 0)); scene.add(win);
    B.add(new THREE.TorusGeometry(0.28, 0.06, 5, 10, Math.PI), beam, local(T, Math.sin(a) * 1.46, yy + 0.33, Math.cos(a) * 1.46, 0, a, 0));
  }
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), glow(new THREE.Color(0x9ae8ff).multiplyScalar(1.6)));
  orb.applyMatrix4(local(T, 0.55, 5.4 + 4.35, 0.25)); scene.add(orb); state0.orb = orb;
  // 煙突（右奥）
  const ch = local(C, W / 2 - 1.2, 0, -0.9);
  B.add(box(0.9, 3.4, 0.9), 0x8a7a6a, local(ch, 0, base + H + 1.3, 0), { surf: SURF.masonry });
  B.add(box(1.1, 0.25, 1.1), 0x6a5a4a, local(ch, 0, base + H + 3.05, 0), { surf: SURF.stone });
  smokeOrigin.set(0, base + H + 3.2, 0).applyMatrix4(ch);
  // 庭: 白い柵、薪の山、樽、井戸
  for (let i = -7; i <= 7; i++) {
    if (Math.abs(i + 0.3) < 1.4) continue; // 入口
    const px = i * 0.62, pz = D / 2 + 3.6;
    B.add(box(0.12, 0.85, 0.06), 0xf2ece0, local(C, px, 0.42, pz), { plain: true });
    B.add(new THREE.ConeGeometry(0.09, 0.16, 4), 0xf2ece0, local(C, px, 0.92, pz, 0, Math.PI / 4, 0), { plain: true });
  }
  for (const s of [-1, 1]) for (const yy of [0.3, 0.65]) B.add(box(3.6, 0.07, 0.05), 0xe8e0d0, local(C, s * 2.75, yy, D / 2 + 3.58), { plain: true });
  for (let k = 0; k < 9; k++) B.add(cyl(0.16, 0.16, 1.1, 7), 0x8a6a42, local(C, W / 2 + 0.7, 0.18 + Math.floor(k / 4) * 0.3, -1.6 + (k % 4) * 0.34 + Math.floor(k / 4) * 0.17, Math.PI / 2, 0, 0), { surf: SURF.bark });
  B.add(cyl(0.38, 0.38, 0.9, 12), 0x7a5232, local(C, W / 2 + 0.6, 0.45, 1.2), { surf: SURF.wood });
  for (const yy of [0.15, 0.75]) B.add(new THREE.TorusGeometry(0.39, 0.04, 4, 14), 0x3a3a3a, local(C, W / 2 + 0.6, yy, 1.2, Math.PI / 2, 0, 0));
  // 庭の花壇
  for (let k = 0; k < 40; k++) {
    const gx = (R() - 0.5) * 9, gz = D / 2 + 1.2 + R() * 2;
    if (Math.abs(gx + 0.6) < 1.2) continue;
    makeProp(FB, 'flower', local(C, gx, 0, gz), R, [0xe0507a, 0xf0d040, 0xb08ae0, 0xffffff][k % 4], 0xf08a3a, {});
  }
}
scene.add(B.build());
const treeGroup = TB.build(); scene.add(treeGroup);
// RO風の木: 筆で描いた絵の板（いつもカメラを向く）と、足元の丸い影
const treeSprites = new THREE.Group(); treeSprites.visible = false; scene.add(treeSprites);
const blobShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1c2c18, transparent: true, opacity: 0.3, depthWrite: false }), trees.length);
blobShadows.visible = false; blobShadows.renderOrder = 1; scene.add(blobShadows);
for (const [i, t] of trees.entries()) {
  const { tex, aspect } = paintedTree(t.kind, t.v), h = (t.kind === 'pine' ? 8.5 : 7.2) * t.size;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: true }));
  sp.center.set(0.5, 0.01); sp.scale.set(h * aspect, h, 1);
  const y = heightAt(t.x, t.z) - 0.15; sp.position.set(t.x, y, t.z); sp.userData.h = h; treeSprites.add(sp);
  const r = (t.kind === 'pine' ? 1.9 : 2.6) * t.size;
  blobShadows.setMatrixAt(i, local(I, t.x, heightAt(t.x, t.z) + 0.06, t.z, 0, 0, 0, r, 1, r * 0.8));
}
{
  const fl = FB.build(), hulls = [];
  fl.traverse((o) => { if (o.userData.noOutline) hulls.push(o); });
  for (const h of hulls) h.parent.remove(h);
  scene.add(fl);
}

// 煙突の煙（ふわっと上がって消える）
const smoke = [];
{
  const tex = dotTexture();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xe8e4e0, transparent: true, depthWrite: false, opacity: 0 }));
    m.userData.t = i / 14; scene.add(m); smoke.push(m);
  }
}

// 草（ゲームと同じ、風で揺れる）
const grass = makeGrass({ n: 1 }, 88, heightAt, R, (x, z) => pathDist(x, z) < 1.7 || riverD(x, z) < 5.6 || Math.hypot(x - COTTAGE.x, z - COTTAGE.z) < 7 || heightAt(x, z) > 3.5, 0.65);
scene.add(grass.mesh); grass.U.uPlayer.value.set(1e4, 1e4);

// 大きさの目安: 人の背丈（約1.7m）の人形。道を歩く
const walker = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 4, 10), toon(0x3a6ac0)); body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toon(0xf2d0b0)); head.position.y = 1.5;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x6a3a2a)); hair.position.y = 1.55;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.95, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), toon(0xc0403a, { side: THREE.DoubleSide })); cape.position.set(0, 0.85, -0.05);
  walker.add(body, head, hair, cape);
  walker.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(walker, 1);
  // 人形は RO風でも段の陰影のまま（背景だけやわらかくする）
  const own = gradientMap().clone(); own.image = { data: new Uint8Array(gradientMap().image.data), width: 4, height: 1 }; own.needsUpdate = true;
  walker.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) { o.material = o.material.clone(); o.material.gradientMap = own; } });
  scene.add(walker);
}
const route = [...southPath.getSpacedPoints(200), ...northPath.getSpacedPoints(140)];
let routeLen = 0; const routeAcc = [0];
for (let i = 1; i < route.length; i++) { routeLen += route[i].distanceTo(route[i - 1]); routeAcc.push(routeLen); }
function routeAt(s) {
  s = ((s % routeLen) + routeLen) % routeLen;
  let i = 1; while (routeAcc[i] < s) i++;
  const a = route[i - 1], b = route[i], t = (s - routeAcc[i - 1]) / (routeAcc[i] - routeAcc[i - 1] || 1);
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dir: Math.atan2(b.x - a.x, b.z - a.z) };
}

// ======================================================================
// 視点・操作
// ======================================================================
const VIEWS = {
  all: { name: '全景', pos: [70, 70, 70], tgt: [0, 0, 5] },
  forest: { name: '森', pos: [-9, 6, 52], tgt: [-2, 2, 36] },
  river: { name: '川', pos: [-30, 3.2, riverZ(-30)], tgt: [BRIDGE_X, 1, bz] },
  bridge: { name: '橋', pos: [20, 6, 14], tgt: [BRIDGE_X, 1.5, bz] },
  lane: { name: 'こみち', pos: [12, 7, -4], tgt: [-2, 1, -26] },
  cottage: { name: 'コテージ', pos: [2, 6, -27], tgt: [COTTAGE.x, 2.5, COTTAGE.z] },
  walk: { name: '自分で歩く', walk: 'free' },
  game: { name: '自動で歩く', walk: 'auto' },
};
const ctl = new OrbitControls(camera, renderer.domElement);
ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.49;
const state = { view: 'all', time: 'day', walk: null, s: 0, zoom: 1, post: q.get('post') !== '0', ro: false };
const me = { x: 0, z: 70, dir: Math.PI, step: 0 }; // 自分で歩くときの人形
function setView(key) {
  const v = VIEWS[key]; state.view = key; state.walk = v.walk || null;
  if (v.walk === 'auto') { state.s = 0; walker.visible = true; }
  else if (v.walk === 'free') { walker.visible = true; Object.assign(me, { x: 0, z: 70, dir: Math.PI }); focus.set(me.x, heightAt(me.x, me.z) + 1.2, me.z); }
  else { camera.position.set(...v.pos); ctl.target.set(...v.tgt); if (state.ro) camera.position.sub(ctl.target).multiplyScalar(FOV_K).add(ctl.target); walker.visible = key !== 'all'; if (walker.visible) { const p = routeAt(key === 'forest' ? 30 : key === 'bridge' ? 77 : key === 'lane' ? 105 : key === 'cottage' ? routeLen - 3 : 60); walker.position.set(p.x, walkY(p.x, p.z), p.z); walker.rotation.y = p.dir; } }
  ctl.enabled = !v.walk; ctl.update(); stick.el.hidden = v.walk !== 'free'; refreshUI();
}

// ---- 画面の部品（スマホでも押しやすい大きさ。メニューは畳める） ----
const css = document.createElement('style');
css.textContent = `
#ui{position:fixed;z-index:10;left:calc(8px + env(safe-area-inset-left,0px));top:calc(8px + env(safe-area-inset-top,0px));background:rgba(20,18,28,.62);color:#fff;padding:6px 8px;border-radius:8px;max-width:calc(100vw - 32px);font:13px system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#ui .row{margin:4px 0;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
#ui button{font:13px system-ui,sans-serif;min-height:30px;padding:4px 10px;border:1px solid rgba(255,255,255,.28);border-radius:6px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
#ui button.on{background:#ffd27a;border-color:#ffd27a;color:#2a2230}
#ui button:focus-visible{outline:2px solid #ffd27a;outline-offset:1px}
#ui .head{display:flex;gap:8px;align-items:center;justify-content:space-between}
#ui .hint{opacity:.8;font-size:12px}
#stick{position:fixed;z-index:10;left:calc(24px + env(safe-area-inset-left,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));width:132px;height:132px;border-radius:50%;background:rgba(20,18,28,.35);border:2px solid rgba(255,255,255,.45);touch-action:none}
#stick i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.75)}
canvas{touch-action:none}
`;
document.head.append(css);
const ui = document.getElementById('ui');
ui.textContent = '';
const head = document.createElement('div'); head.className = 'head';
const title = document.createElement('b'); title.textContent = 'グラフィック実験場';
const fold = document.createElement('button'); fold.id = 'fold'; fold.textContent = 'たたむ';
head.append(title, fold); ui.append(head);
const body = document.createElement('div'); ui.append(body);
const hint = document.createElement('div'); hint.className = 'hint'; body.append(hint);
fold.onclick = () => { body.hidden = !body.hidden; fold.textContent = body.hidden ? 'メニュー' : 'たたむ'; };
if (innerWidth < 600) fold.onclick();
const rows = {};
function row(label, items, cur, on) {
  const d = document.createElement('div'); d.className = 'row'; d.append(label);
  for (const [k, name] of items) { const b = document.createElement('button'); b.textContent = name; b.dataset.k = k; b.onclick = () => on(k); d.append(b); }
  body.append(d); rows[label] = { d, cur };
}
row('視点', Object.entries(VIEWS).map(([k, v]) => [k, v.name]), () => state.view, setView);
row('時間', Object.entries(TIMES).map(([k, v]) => [k, v.name]), () => state.time, (k) => { setTime(k); refreshUI(); });
row('スタイル', [['now', '今の見た目'], ['ro', 'RO風']], () => (state.ro ? 'ro' : 'now'), (k) => setStyle(k === 'ro'));
row('仕上げ', [['on', 'ゲームと同じ'], ['off', 'なし']], () => (state.post ? 'on' : 'off'), (k) => { state.post = k === 'on'; refreshUI(); });
function refreshUI() {
  for (const { d, cur } of Object.values(rows)) for (const b of d.querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === cur());
  hint.textContent = state.walk === 'free' ? '左下のスティック（WASD・矢印キー）で歩く。2本指でつまむ・ホイールで寄る'
    : state.walk ? '道に沿って歩きます。ゲームと同じカメラ'
    : '1本指（ドラッグ）で回す・2本指で動かす・つまんで寄る';
}

// ---- スティック（自分で歩く）とキー ----
const stick = { el: document.createElement('div'), x: 0, y: 0, id: null };
{
  const knob = document.createElement('i'); stick.el.id = 'stick'; stick.el.append(knob); stick.el.hidden = true; document.body.append(stick.el);
  const move = (e) => {
    const r = stick.el.getBoundingClientRect(), max = r.width / 2 - 14;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const L = Math.hypot(dx, dy); if (L > max) { dx *= max / L; dy *= max / L; }
    stick.x = dx / max; stick.y = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const end = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stick.el.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; stick.el.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
  stick.el.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) move(e); });
  stick.el.addEventListener('pointerup', end); stick.el.addEventListener('pointercancel', end);
}
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
// 歩くときの寄り・引き（ホイール・2本指でつまむ）
const clampZoom = (z) => Math.min(1.8, Math.max(0.5, z));
renderer.domElement.addEventListener('wheel', (e) => { if (state.walk) state.zoom = clampZoom(state.zoom * Math.exp(e.deltaY * 0.001)); }, { passive: true });
{
  const pts = new Map(); let d0 = 0, z0 = 1;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); z0 = state.zoom; } });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    if (state.walk && pts.size === 2 && d0 > 0) { const [a, b] = [...pts.values()]; state.zoom = clampZoom(z0 * d0 / Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, (e) => { pts.delete(e.pointerId); d0 = 0; });
}

const focus = new THREE.Vector3();

// ---- スタイルの切替: 今の見た目 / RO風 ----
//   RO風: 地面は手描き風の模様、背景の輪郭線を消し、陰影をやわらかく、3D の草を消す、
//   カメラは望遠（画角 30°）で高い角度から、色は淡く明るく、影を青紫に
const hulls = [];
scene.traverse((o) => { if (o.isMesh && o.userData.noOutline && o.material.side === THREE.BackSide && !walker.getObjectById(o.id)) hulls.push(o); });
const RO_FOV = 30, FOV = 50, FOV_K = Math.tan(FOV / 2 * Math.PI / 180) / Math.tan(RO_FOV / 2 * Math.PI / 180);
const GRAD = { now: [70, 150, 215, 255], ro: [150, 188, 222, 255] };
function setStyle(ro, init = false) {
  if (ro === state.ro && !init) return;
  const was = state.ro; state.ro = ro;
  ground.material = ro ? groundMats.ro : groundMats.toon;
  for (const h of hulls) h.visible = !ro;
  grass.mesh.visible = !ro;
  treeGroup.visible = !ro; treeSprites.visible = ro; blobShadows.visible = ro;
  const gm = gradientMap(); gm.image.data.set(GRAD[ro ? 'ro' : 'now']);
  gm.magFilter = gm.minFilter = ro ? THREE.LinearFilter : THREE.NearestFilter; gm.needsUpdate = true;
  gradePass.uniforms.sat.value = ro ? 0.94 : 1.08; gradePass.uniforms.contrast.value = ro ? 0.9 : 1.04; gradePass.uniforms.vig.value = ro ? 0.1 : 0.22;
  gradePass.uniforms.lift.value.set(...(ro ? [0.035, 0.03, 0.09] : [0, 0, 0]));
  bloomPass.strength = ro ? 0.25 : 0.5;
  // 画角を変えても同じ範囲が映るように、注目点からの距離を変える
  camera.fov = ro ? RO_FOV : FOV; camera.updateProjectionMatrix();
  if (!state.walk && was !== ro) camera.position.sub(ctl.target).multiplyScalar(ro ? FOV_K : 1 / FOV_K).add(ctl.target);
  ctl.maxDistance = ro ? 400 : 250;
  setTime(state.time); refreshUI();
}
setTime(TIMES[q.get('time')] ? q.get('time') : 'day');
setView(VIEWS[q.get('view')] ? q.get('view') : 'all');
setStyle(q.get('style') === 'ro', true);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock(), tmpF = new THREE.Vector3();
// 歩く人形の向きをなめらかに変える
const turn = (to, dt) => { walker.rotation.y += (((to - walker.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-10 * dt)); };
(function loop() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  waterU.uTime.value = t; grass.U.uTime.value = t;
  if (state0.orb) { state0.orb.rotation.y = t * 1.2; }
  for (const m of smoke) {
    m.userData.t = (m.userData.t + dt * 0.12) % 1; const k = m.userData.t;
    m.position.set(smokeOrigin.x + Math.sin(k * 5 + t * 0.3) * 0.4 + k * 1.6, smokeOrigin.y + k * 6, smokeOrigin.z - k * 0.8);
    m.scale.setScalar(0.6 + k * 2.4); m.material.opacity = Math.sin(Math.PI * k) * 0.55 * (state.time === 'night' ? 0.4 : 1);
  }
  if (state.walk) {
    let px, pz, bob;
    if (state.walk === 'auto') {
      state.s += dt * 4.2; // 歩く速さ（m/s）
      const p = routeAt(state.s); px = p.x; pz = p.z; turn(p.dir, dt); bob = state.s;
    } else {
      // カメラは北（-z）を向いているので、スティックの上 = 北
      let ix = stick.x, iz = stick.y;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (keys.has('w') || keys.has('arrowup')) iz -= 1; if (keys.has('s') || keys.has('arrowdown')) iz += 1;
      const L = Math.hypot(ix, iz);
      if (L > 0.12) {
        const sp = 5.5 * Math.min(1, L) / Math.max(1, L);
        const nx = me.x + ix * sp * dt, nz = me.z + iz * sp * dt;
        if (Math.hypot(nx * 0.9, nz * 0.8) < 70) { me.x = nx; me.z = nz; }
        me.dir = Math.atan2(ix, iz); me.step += Math.min(1, L) * sp * dt;
      }
      turn(me.dir, dt); px = me.x; pz = me.z; bob = me.step;
    }
    const y = walkY(px, pz);
    walker.position.set(px, y + Math.abs(Math.sin(bob * 2.2)) * 0.06, pz);
    focus.lerp(tmpF.set(px, y + 1.2, pz), 1 - Math.exp(-8 * dt));
    // ゲームのカメラ（距離 19.5、標準のズーム）。RO風は望遠で遠くから、高い角度（約 55°）で見下ろす
    const [cy, cz] = state.ro ? [27.8, 19.5] : [12.6, 14.9];
    camera.position.set(focus.x, focus.y + cy * state.zoom, focus.z + cz * state.zoom); camera.lookAt(focus);
    grass.U.uPlayer.value.set(px, pz);
  } else { ctl.update(); focus.copy(ctl.target); grass.U.uPlayer.value.set(walker.position.x, walker.position.z); }
  // RO風で歩くとき: 人形の手前にある絵の木を薄くする
  if (state.ro) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, sx = focus.x - cx, sy = focus.y - cy, sz = focus.z - cz, L2 = sx * sx + sy * sy + sz * sz;
    for (const sp of treeSprites.children) {
      let a = 1;
      if (state.walk) {
        const px = sp.position.x - cx, py = sp.position.y + sp.userData.h * 0.55 - cy, pz = sp.position.z - cz;
        const t = Math.max(0, Math.min(1, (px * sx + py * sy + pz * sz) / L2));
        const d = Math.hypot(px - sx * t, py - sy * t, pz - sz * t);
        if (t < 0.97) a = 0.25 + 0.75 * smooth(sp.userData.h * 0.3, sp.userData.h * 0.55, d);
      }
      sp.material.opacity = a; sp.material.alphaTest = a < 1 ? 0.05 : 0.5;
    }
  }
  // 全景は遠くから見るので霧を遠ざける
  const fk = (state.view === 'all' ? 1.8 : 1) * (state.ro ? 1.5 : 1), ft = TIMES[state.time];
  scene.fog.near = ft.near * fk; scene.fog.far = ft.far * fk;
  // 影はいま見ている場所の周りに落とす
  sun.target.position.copy(focus); sun.position.copy(focus).add(sunOff);
  // ゲームと同じ近景の透過（カメラと注目点の間・カメラの近くを抜く）
  OCC.uOccCam.value.copy(camera.position); OCC.uOccTgt.value.copy(focus);
  OCC.uOccR.value = state.walk ? 2.6 : 0; // 歩くときだけ、人形の手前を抜く OCC.uOccNear.value = Math.min(state.ro ? 4 : 6, camera.position.distanceTo(focus) * 0.5);
  if (state.post) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(loop);
})();
window.__ready = true;
