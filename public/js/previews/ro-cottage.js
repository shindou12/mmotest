// 森の家（ro-cottage.html）: 森に囲まれたコテージのまわりを歩けるマップ。RO風の手順（docs/ro-look-method.md）で描く。
//   雛形は ref-forest.js（レンダラー・光・仕上げ・地面の材質・崖の岩の塊・見えない枝葉はそのまま）。見本は RO3 の明るい森のフィールド（4枚）。
//   場所: 真ん中にコテージと石畳の前庭（芝との境目）。南の入口から土の道が上がってきて、東は菜園と池へ、西は坂を上って崖の上の見晴らしへ、
//         コテージの裏は森の小道。まわりは木と丘で囲む。
//   形: 地形・草・木・崖はコード（three.js）。コテージ・前庭・岩は Blender で面取りと陰（AO）を足した形に差し替え（tools/blender/ro_cottage_refine.py）、
//       コテージの瓦・石・蔦と庭の小物は Blender で作った形（tools/blender/ro_props.py）。材質はコード（Lambert・頂点の色。輪郭線なし）
//   歩く: WASD / 矢印 / 画面左下のスティック。ホイールで寄る・引く。カメラは実験場の歩く視点（高さ 24.8・後ろ 23.2、画角 30°）
//   配置は、決まった視点（画角 30°・見下ろし 50°・距離 23、16:9）の画面上の位置（u, v）を地面へ投げて決める（窓の大きさで変わらない）
//   URL: ?view=fixed（はじめの構図で止める。見本と比べる用）?post=0（仕上げなし）?blender=0（Blender の形を使わない。書き出し用）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toon, outline, gradientMap, glow, Batch, OCC } from '../toon.js';
import { seeded, local, I } from '../env/kit.js';
import { SURF } from '../env/textures.js';
import { makeProp } from '../env/props.js';
import { PAINT } from './ro-style.js';
import { FoliageBuilder, FOLIAGE_U } from './foliage.js';
import { rockTexture, ROCK_GLSL, roRockMaterial, rockGeometry, blockGeometry } from './ro-rock.js';

const q = new URLSearchParams(location.search);
const FIXED = q.get('view') === 'fixed';
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const R = seeded(77);

// ======================================================================
// レンダラー・カメラ・光・仕上げ（RO風の値）
// ======================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8aa860);
scene.fog = new THREE.Fog(0x9ab878, 70, 150);   // 遠くの森を少しかすませて奥行きを出す（近くには掛からない）
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 260);
// 配置を決めるカメラ（決まった視点・16:9。窓の大きさで配置が変わらないように）
const LC = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 200);
{
  const P = 50 * Math.PI / 180, D = 23;
  for (const c of [LC, camera]) { c.position.set(0, D * Math.sin(P), D * Math.cos(P)); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix(); }
}
const hemi = new THREE.HemisphereLight(0xe8f0e0, 0x5a6a3a, 1.3);
const sun = new THREE.DirectionalLight(0xffe6b8, 2.6);
const SUN_OFF = new THREE.Vector3(30, 26, 10);   // 右手前の高い所から（影は左奥へ。崖の面にも日が当たる）
sun.position.copy(SUN_OFF); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);
{ const gm = gradientMap(); gm.image.data.set([150, 188, 222, 255]); gm.magFilter = gm.minFilter = THREE.LinearFilter; gm.needsUpdate = true; }

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.45, 0.95));
composer.addPass(new OutputPass());
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 0.88);
      c.rgb = (c.rgb - 0.5) * 1.12 + 0.5;
      c.rgb += vec3(0.03, 0.03, 0.02) * (1.0 - l);
      c.rgb *= mix(vec3(1.0), vec3(1.1, 1.03, 0.94), smoothstep(0.2, 0.8, l));
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c.rgb *= 1.0 - 0.2 * smoothstep(0.35, 0.85, length(d));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
}));
const tilt = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
    void main(){
      float k = smoothstep(0.22, 0.5, abs(vUv.y - 0.48)) * 3.5;
      if (k < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 acc = vec4(0.0);
      for (int i = 0; i < 12; i++) { float a = float(i) * 2.399, r = sqrt(float(i) + 0.5) / 3.5; acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * k / res); }
      gl_FragColor = acc / 12.0;
    }`,
});
composer.addPass(tilt);

// 決まった視点の画面上の位置 (u, v) から、高さ y の水平面上の世界の位置へ
const ray = new THREE.Raycaster();
function at(u, v, y = 0) {
  ray.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), LC);
  const o = ray.ray.origin, d = ray.ray.direction, t = (y - o.y) / d.y;
  return new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t);
}
const line = (pts, y = 0) => pts.map(([u, v]) => at(u, v, y));
const W3 = (x, z) => new THREE.Vector3(x, 0, z);
function sideDist(x, z, P) {
  let best = 1e9, side = 1;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; side = Math.sign(dx * (z - a.z) - dz * (x - a.x)) || 1; }
  }
  return side * best;
}
function vnoise(x, z) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), sx), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), sx), sz);
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.3 + 5, z * 2.3) * 0.28 + vnoise(x * 5.1, z * 5.1 + 9) * 0.12;
// 折れ線を両端で延ばす（画面の外まで続く崖の縁・道）
function extend(P, a = 0, b = 0) {
  const out = P.map((p) => p.clone());
  if (a) { const d = out[0].clone().sub(out[1]).normalize(); out.unshift(out[0].clone().addScaledVector(d, a)); }
  if (b) { const n = out.length, d = out[n - 1].clone().sub(out[n - 2]).normalize(); out.push(out[n - 1].clone().addScaledVector(d, b)); }
  return out;
}

// ======================================================================
// 地形: 西の台地（岩の崖。西の端に坂）、コテージの平地、東南の池、外周の丘。道は5本
// ======================================================================
const cliffEdge = extend(line([[-0.1, 0.5], [0.06, 0.48], [0.16, 0.42], [0.22, 0.3], [0.25, 0.16], [0.29, 0.05], [0.31, -0.25]]), 30, 30);
const COT = at(0.45, 0.34);
const COT_RY = 0.08, COT_S = 0.75;   // 人物が画面の高さの 12% の縮尺で、家が画面を占めすぎないように小ぶりに
const YARD = { x: COT.x, z: COT.z + 3.6, w: 5.8, d: 2.4 };
const RAMP = at(-0.05, 0.6);                 // 台地へ上がる坂の中ほど（崖の縁の西）
const POND = W3(COT.x + 14, COT.z + 13), POND_R = 4.6;
const CENTER = W3(COT.x, COT.z + 6), RX = 40, RZ = 38;   // 歩ける範囲（楕円）
const LOOKOUT = W3(RAMP.x - 7, RAMP.z - 9);  // 台地の上の見晴らし
const GARDEN = W3(COT.x + 13, COT.z + 2);    // 東の菜園
const ENTRY = W3(COT.x + 1, COT.z + 30);     // 南の入口
const nearMain = line([[0.5, 1.2], [0.52, 0.98], [0.49, 0.84], [0.46, 0.72], [0.45, 0.64]]);
const PATHS = [
  // 南の入口から前庭へ（はじめの画面の道につなぐ）
  { pts: [ENTRY, W3(ENTRY.x - 2.5, ENTRY.z - 7), W3(nearMain[0].x + 1.5, nearMain[0].z + 4), ...nearMain], w: 1.0 },
  // 分かれ道から東の菜園・池へ
  { pts: [...line([[0.49, 0.84], [0.6, 0.79], [0.74, 0.77], [0.88, 0.71]]), W3(GARDEN.x, GARDEN.z + 5), W3(POND.x - 6.5, POND.z - 2)], w: 0.9 },
  // 前庭の西から坂を上って見晴らしへ
  { pts: [W3(YARD.x - YARD.w / 2 - 0.8, YARD.z + 0.6), W3(RAMP.x + 5, RAMP.z + 2.5), W3(RAMP.x + 1, RAMP.z), W3(RAMP.x - 3, RAMP.z - 4), LOOKOUT], w: 0.85 },
  // 菜園から北へ、コテージの裏の森を回る小道
  { pts: [W3(GARDEN.x - 1, GARDEN.z - 3), W3(COT.x + 9, COT.z - 9), W3(COT.x + 2, COT.z - 12), W3(COT.x - 5, COT.z - 11)], w: 0.7 },
];
function pathDist(x, z) { let m = 1e9; for (const p of PATHS) m = Math.min(m, Math.abs(sideDist(x, z, p.pts)) - (p.w - 1)); return m; }
function rampK(x, z) { return smooth(9, 3, Math.hypot(x - RAMP.x, z - RAMP.z)); }
function cliffIn(x, z) { return -sideDist(x, z, cliffEdge) + (fbm(x * 0.7, z * 0.7) - 0.5) * 1.4 * (1 - rampK(x, z)); }
const inYard = (x, z, pad = 0) => Math.abs(x - YARD.x) < YARD.w / 2 + pad && Math.abs(z - YARD.z) < YARD.d / 2 + pad;
const nearCot = (x, z, pad = 0) => Math.abs(x - COT.x) < 4.0 + pad && z > COT.z - 3.2 - pad && z < COT.z + 2.6 + pad;
const ell = (x, z) => Math.hypot((x - CENTER.x) / RX, (z - CENTER.z) / RZ);
const PLATEAU = 4.2;
function heightAt(x, z) {
  let h = (fbm(x * 0.15, z * 0.15) - 0.5) * 0.5;
  const n = cliffIn(x, z), rk = rampK(x, z);
  // 崖: ほぼ垂直に上がり、途中に段（岩の層）。坂のところはゆるく上がる
  const w0 = lerp(-0.3, -5.5, rk), w1 = lerp(0.9, 5.5, rk);
  h += PLATEAU * smooth(w0, w1, n) + (0.6 * smooth(1.4, 2.4, n) + (fbm(x * 0.5, z * 0.5) - 0.5) * 1.2 * smooth(0.5, 2, n)) * (1 - rk);
  // コテージと前庭は平らにならす
  const flat = smooth(2.5, 0, Math.max(Math.abs(x - COT.x) - 5, 0) + Math.max(Math.abs(z - (COT.z + 1.5)) - 5, 0));
  h = lerp(h, 0.05, flat * smooth(0.5, -0.5, n));
  // 池（くぼみ）
  const dp = Math.hypot(x - POND.x, z - POND.z);
  h -= 1.1 * smooth(POND_R + 1.6, POND_R - 1.2, dp);
  // 外周の丘（地平線を隠す）
  h += smooth(0.9, 1.25, ell(x, z)) * 7;
  h -= smooth(2.2, 0.6, pathDist(x, z)) * 0.08;
  return h;
}
const WATER_Y = -0.62;

const GW = 120, GD = 116, SEG = 440;   // 0.27m 間隔（広いマップなので手順書の 0.17m より少し粗く。草の模様はシェーダーで細かい）
const GROUND_C = W3(CENTER.x, CENTER.z - 4);
const ground = (() => {
  const g = new THREE.PlaneGeometry(GW, GD, SEG, Math.round(SEG * GD / GW));
  g.rotateX(-Math.PI / 2); g.translate(GROUND_C.x, 0, GROUND_C.z);
  const p = g.attributes.position, n = p.count;
  for (let i = 0; i < n; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const splat = new Float32Array(n * 3), shade = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i), pd = pathDist(x, z), y = p.getY(i);
    const dirt = Math.max(smooth(1.8, 0.8, pd + (fbm(x, z) - 0.5) * 1.4), smooth(1.6, 0.4, Math.hypot(x - YARD.x, z - (YARD.z + YARD.d / 2 + 0.6)) + (fbm(x * 0.9, z) - 0.5) * 1.2) * 0.9);
    const bank = smooth(POND_R + 1.8, POND_R + 0.2, Math.hypot(x - POND.x, z - POND.z) + (fbm(x * 1.3, z) - 0.5) * 1.0);
    splat[i * 3 + 1] = inYard(x, z, -0.1) ? 0 : dirt * (cliffIn(x, z) < 0 || rampK(x, z) > 0.3 ? 1 : 0);
    splat[i * 3 + 2] = bank;
    shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = 1;
  }
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 3));
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const U = { tGrass: { value: PAINT.grass() }, tDirt: { value: PAINT.dirt() }, tBank: { value: PAINT.bank ? PAINT.bank() : PAINT.dirt() }, tRock: { value: rockTexture() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 splat; attribute vec3 shade; varying vec3 vSplat; varying vec3 vShade; varying vec3 vRW; varying vec3 vRN;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat; vShade = shade; vRW = (modelMatrix * vec4(position, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tBank; uniform sampler2D tRock; varying vec3 vSplat; varying vec3 vShade; varying vec3 vRW; varying vec3 vRN;\n' + ROCK_GLSL
      + sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 xz = vRW.xz;
      vec3 g = mix(texture2D(tGrass, xz / 7.0).rgb, texture2D(tGrass, xz / 19.0 + 0.37).rgb, 0.35);
      vec2 q = xz * 0.06; vec2 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
      #define H2(v) fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5)
      float mac = mix(mix(H2(qi), H2(qi + vec2(1, 0)), qf.x), mix(H2(qi + vec2(0, 1)), H2(qi + vec2(1, 1)), qf.x), qf.y);
      g *= mix(vec3(0.86, 0.92, 0.8), vec3(1.1, 1.08, 0.9), mac) * vec3(1.5, 1.12, 0.92); // 見本（RO3 の日なたの草地）の草は黄みが強く明るい
      vec3 d = texture2D(tDirt, xz / 6.0).rgb * vec3(0.86, 1.0, 0.8);
      vec3 bk = texture2D(tBank, xz / 5.0).rgb;
      float n = (texture2D(tGrass, xz / 3.1).g - 0.45) * 0.9;
      float wd = smoothstep(0.35, 0.65, vSplat.y + n);
      vec3 col = mix(g, d, wd);
      col = mix(col, bk, smoothstep(0.35, 0.65, vSplat.z + n));
      vec3 nn = normalize(vRN);
      float rk = smoothstep(0.78, 0.6, nn.y + n * 0.25);
      col = mix(col, rockTri(tRock, vRW, nn, 4.5), rk);
      diffuseColor.rgb *= col * vShade;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
})();
// 池の水面（やわらかい青緑。空と木を映した色）
{
  const w = new THREE.Mesh(new THREE.CircleGeometry(POND_R + 0.4, 48), new THREE.MeshLambertMaterial({ color: 0x5a9aa0, transparent: true, opacity: 0.88 }));
  w.rotation.x = -Math.PI / 2; w.position.set(POND.x, WATER_Y, POND.z); w.receiveShadow = true; scene.add(w);
  const shine = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  shine.rotation.x = -Math.PI / 2; shine.position.set(POND.x + 1, WATER_Y + 0.01, POND.z - 0.6); scene.add(shine);
  var pondShine = shine;
}
function shadeUnder(occ) {
  const g = ground.geometry, p = g.attributes.position, sh = g.attributes.shade;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); let k = 1;
    for (const o of occ) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx) > o.r * 1.2 || Math.abs(dz) > o.r * 1.2) continue; const d = Math.hypot(dx, dz) / (o.r * 1.15); if (d < 1) k = Math.min(k, lerp(0.72, 1, smooth(0.35, 1, d))); }
    sh.setXYZ(i, k, k, k);
  }
  sh.needsUpdate = true;
}

// ======================================================================
// 当たり判定（円と、向きのある長方形）。歩くときに使う
// ======================================================================
const solids = [];   // { x, z, r } または { x, z, w, d, ry }
const addCircle = (x, z, r) => solids.push({ x, z, r });

// ======================================================================
// 岩: 崖の面に張りつく角ばった塊・崖の下の大岩・道ばたの小石
// ======================================================================
const rocks = [];
function rock(x, y, z, seed, opt, rotY = R() * 6.28) {
  const m = new THREE.Mesh(rockGeometry(seed, opt), roRockMaterial());
  m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true;
  scene.add(m); rocks.push(m); return m;
}
function cliffChunks(edge, inside, o0, o1, step, seed) {
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1], L = a.distanceTo(b), steps = Math.ceil(L / step), ang = Math.atan2(b.z - a.z, b.x - a.x);
    let nx = Math.sin(ang), nz = -Math.cos(ang);
    if (inside(a.x + nx, a.z + nz) < inside(a.x - nx, a.z - nz)) { nx = -nx; nz = -nz; }
    for (let k = 0; k < steps; k++) {
      const t = (k + R()) / steps, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
      if (rampK(x, z) > 0.35 || ell(x, z) > 1.15) continue;   // 坂には岩を張らない
      for (let o = o0 + R() * 0.3; o < o1; o += 0.45 + R() * 0.35) {
        const px = x + nx * o, pz = z + nz * o, y = heightAt(px, pz), s = 0.45 + R() * 0.35;
        const m = rock(px - nx * 0.35, y - 0.2, pz - nz * 0.35, 0, {}, -ang + (R() - 0.5) * 0.5);
        m.geometry = blockGeometry(seed + i * 97 + k * 13 + Math.round(o * 31), { sx: s * (1.1 + R() * 0.6), sy: s * (0.7 + R() * 0.5), sz: s * 0.8 });
        m.rotation.z = (R() - 0.5) * 0.25; m.material = roRockMaterial({ flat: true, moss: 0.4 });
      }
    }
  }
}
cliffChunks(cliffEdge, cliffIn, -0.4, 1.3, 1.0, 100);
for (const [x, z, s] of [[COT.x - 9.5, COT.z + 6.5, 0.7], [COT.x - 6, COT.z - 4, 0.55], [POND.x - 4.5, POND.z + 3.5, 0.8], [POND.x + 4.8, POND.z - 1.5, 0.65], [POND.x + 2, POND.z + 5, 0.5],
  [ENTRY.x - 5, ENTRY.z - 3, 0.9], [ENTRY.x + 6, ENTRY.z - 8, 0.7], [GARDEN.x + 6, GARDEN.z - 6, 0.8], [LOOKOUT.x + 3, LOOKOUT.z + 2, 0.75], [LOOKOUT.x - 4, LOOKOUT.z - 3, 1.0]]) {
  if (cliffIn(x, z) > -0.4 && cliffIn(x, z) < 1.6) continue;
  rock(x, heightAt(x, z) + 0.1, z, 300 + Math.round(x * 7 + z), { sx: s * 1.3, sy: s * 0.8, sz: s, rough: 0.18 }).material = roRockMaterial({ flat: true, moss: 0.4 });
  addCircle(x, z, s * 1.2);
}
for (let i = 0; i < 70; i++) {
  const p = PATHS[i % PATHS.length].pts, a = p[Math.floor(R() * (p.length - 1))], b = p[p.indexOf(a) + 1] || a, t = R();
  const x0 = lerp(a.x, b.x, t), z0 = lerp(a.z, b.z, t), side = R() < 0.5 ? -1 : 1, off = 1.2 + R() * 1.0;
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, x = x0 - dz / L * off * side, z = z0 + dx / L * off * side;
  if (pathDist(x, z) < 1.1 || cliffIn(x, z) > -0.5 || inYard(x, z, 0.5) || Math.hypot(x - POND.x, z - POND.z) < POND_R + 0.5) continue;
  rock(x, heightAt(x, z) + 0.02, z, 700 + i, { sx: 0.18 + R() * 0.15, sy: 0.12, sz: 0.18, rough: 0.2, detail: 1 }).material = roRockMaterial({ flat: true, moss: 0 });
}

// ======================================================================
// コテージ（実験場のコテージと同じ作り）と前庭の石畳。背景なので輪郭線は付けない
// ======================================================================
const B = new Batch({ chunk: 24 }), FB = new Batch({ chunk: 24 });
const windowMat = glow(0xffd890), lampMat = glow(0xffc870);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
const smokeOrigin = new THREE.Vector3();
const lampPos = [];
let orb = null, COT_M = null;
{
  const y0 = heightAt(COT.x, COT.z), C = local(I, COT.x, y0, COT.z, 0, COT_RY, 0, COT_S); COT_M = C;
  const W = 7, D = 5.4, H = 3.1, base = 0.6;
  const plaster = 0xf2e4c6, beam = 0x5a3820, roofC = 0xc4764e, stone = 0x9c968a; // 屋根は暖かい素焼きの色
  B.add(box(W + 0.4, base, D + 0.4), stone, local(C, 0, base / 2, 0), { surf: SURF.masonry });
  B.add(box(W, H, D), plaster, local(C, 0, base + H / 2, 0), { surf: SURF.plaster });
  for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) B.add(box(0.22, H, 0.22), beam, local(C, sx * W / 2, base + H / 2, sz * (D / 2 + 0.04)), { surf: SURF.wood });
  for (const sx of [-1, 1]) for (const sz of [-0.33, 0.33]) B.add(box(0.22, H, 0.22), beam, local(C, sx * (W / 2 + 0.04), base + H / 2, sz * D / 2), { surf: SURF.wood });
  for (const yy of [base + 0.1, base + H * 0.55, base + H - 0.08]) {
    for (const sz of [-1, 1]) B.add(box(W + 0.1, 0.2, 0.2), beam, local(C, 0, yy, sz * (D / 2 + 0.06)), { surf: SURF.wood });
    for (const sx of [-1, 1]) B.add(box(0.2, 0.2, D + 0.1), beam, local(C, sx * (W / 2 + 0.06), yy, 0), { surf: SURF.wood });
  }
  for (const sx of [-1, 1]) B.add(box(0.16, 1.9, 0.16), beam, local(C, sx * W * 0.33, base + H * 0.28, D / 2 + 0.07, 0, 0, sx * 0.62), { surf: SURF.wood });
  const pitch = 0.95, half = D / 2 + 0.9, rise = Math.tan(pitch) * (D / 2);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4, sag = (t) => Math.sin(Math.PI * t) * 0.25;
    const z0 = s * lerp(half, 0, t0), z1 = s * lerp(half, 0, t1);
    const y0r = base + H - 0.35 + lerp(-0.6, rise + 0.25, t0) - sag(t0), y1r = base + H - 0.35 + lerp(-0.6, rise + 0.25, t1) - sag(t1);
    const len = Math.hypot(z1 - z0, y1r - y0r) + 0.08;
    B.add(box(W + 1.4, 0.32, len), new THREE.Color(roofC).offsetHSL(0, 0, -k * 0.015), local(C, 0, (y0r + y1r) / 2, (z0 + z1) / 2, s * Math.atan2(y1r - y0r, Math.abs(z1 - z0)), 0, 0), { surf: SURF.roof });
  }
  B.add(cyl(0.18, 0.18, W + 1.6, 8), 0x7a4a32, local(C, 0, base + H + rise - 0.1, 0, 0, 0, Math.PI / 2), { surf: SURF.wood });
  const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)]);
  for (const sx of [-1, 1]) {
    B.add(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), plaster, local(C, sx * (W / 2 - 0.1), base + H, 0, 0, Math.PI / 2, 0), { surf: SURF.plaster });
    const wy = base + H + rise * 0.4;
    B.add(new THREE.TorusGeometry(0.42, 0.09, 6, 16), beam, local(C, sx * (W / 2 + 0.12), wy, 0, 0, Math.PI / 2, 0));
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), windowMat);
    win.applyMatrix4(local(C, sx * (W / 2 + 0.13), wy, 0, 0, sx * Math.PI / 2, 0)); scene.add(win);
  }
  {
    const dz = D / 2 - 0.3, dy = base + H + 0.55;
    B.add(box(1.4, 1.2, 1.6), plaster, local(C, 1.4, dy, dz - 0.4), { surf: SURF.plaster });
    for (const s of [-1, 1]) B.add(box(0.95, 0.12, 1.9), roofC, local(C, 1.4 + s * 0.42, dy + 0.85, dz - 0.4, 0, 0, -s * 0.75), { surf: SURF.roof });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.7), windowMat); win.applyMatrix4(local(C, 1.4, dy - 0.05, dz + 0.41)); scene.add(win);
    B.add(box(0.06, 0.72, 0.05), beam, local(C, 1.4, dy - 0.05, dz + 0.43));
  }
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
    for (const s of [-1, 1]) B.add(box(0.42, 1.05, 0.06), 0x4a6a8a, local(M, s * 0.72, 0, 0.08, 0, s * 0.35, 0), { surf: SURF.wood });
    B.add(box(1.0, 0.24, 0.3), 0x6a4226, local(M, 0, -0.75, 0.2), { surf: SURF.wood });
    for (let k = 0; k < 6; k++) B.add(new THREE.SphereGeometry(0.09, 6, 4), [0xe0507a, 0xf0d040, 0xffffff][k % 3], local(M, -0.4 + k * 0.16, -0.58, 0.22 + (k % 2) * 0.08));
  }
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
  orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), glow(new THREE.Color(0x9ae8ff).multiplyScalar(1.6)));
  orb.applyMatrix4(local(T, 0.55, 5.4 + 4.35, 0.25)); scene.add(orb);
  const ch = local(C, W / 2 - 1.2, 0, -0.9);
  B.add(box(0.9, 3.4, 0.9), 0x8a7a6a, local(ch, 0, base + H + 1.3, 0), { surf: SURF.masonry });
  B.add(box(1.1, 0.25, 1.1), 0x6a5a4a, local(ch, 0, base + H + 3.05, 0), { surf: SURF.stone });
  smokeOrigin.set(0, base + H + 3.2, 0).applyMatrix4(ch);
  for (let k = 0; k < 9; k++) B.add(cyl(0.16, 0.16, 1.1, 7), 0x8a6a42, local(C, W / 2 + 0.7, 0.18 + Math.floor(k / 4) * 0.3, -1.6 + (k % 4) * 0.34 + Math.floor(k / 4) * 0.17, Math.PI / 2, 0, 0), { surf: SURF.bark });
  for (let k = 0; k < 26; k++) {
    const gx = (R() - 0.5) * (W - 0.6), gz = D / 2 + 0.35 + R() * 0.45;
    if (Math.abs(gx + 0.6) < 1.1) continue;
    makeProp(FB, 'flower', local(C, gx, 0.02, gz), R, [0xe0507a, 0xf0d040, 0xb08ae0, 0xffffff][k % 4], 0xf08a3a, {});
  }
  // 当たり判定: 家（土台の外形）と塔
  const hw = (W / 2 + 0.6) * COT_S, hd = (D / 2 + 0.5) * COT_S;
  solids.push({ x: COT.x, z: COT.z, w: hw * 2 + 1.4 * COT_S, d: hd * 2, ry: COT_RY });
  const tp = new THREE.Vector3().setFromMatrixPosition(T); addCircle(tp.x, tp.z, 1.6 * COT_S);
}
// 前庭の石畳（見本3: 芝との境目がはっきりした四角い敷石と縁石）と角灯
{
  const Y = local(I, YARD.x, heightAt(YARD.x, YARD.z), YARD.z, 0, COT_RY, 0);
  const rows = 6, rh = YARD.d / rows;
  for (let r = 0; r < rows; r++) {
    let x = -YARD.w / 2 + (r % 2 ? 0.3 : 0);
    while (x < YARD.w / 2 - 0.1) {
      const w = Math.min(0.55 + R() * 0.35, YARD.w / 2 - x);
      if (w > 0.2) B.add(box(w - 0.05, 0.1, rh - 0.05), new THREE.Color(0xc8c2b4).offsetHSL(0, 0, (R() - 0.5) * 0.1), local(Y, x + w / 2, 0.04, -YARD.d / 2 + (r + 0.5) * rh, 0, (R() - 0.5) * 0.03, 0), { surf: SURF.stone });
      x += w;
    }
  }
  for (let x = -YARD.w / 2; x <= YARD.w / 2 + 0.01; x += 0.5) {
    if (Math.abs(x + 0.6) < 0.8) continue;
    B.add(box(0.48, 0.16, 0.2), 0x9c968a, local(Y, x, 0.07, YARD.d / 2 + 0.08), { surf: SURF.stone });
  }
  for (const sx of [-1, 1]) for (let z = -YARD.d / 2; z <= YARD.d / 2; z += 0.5) B.add(box(0.2, 0.16, 0.48), 0x9c968a, local(Y, sx * (YARD.w / 2 + 0.08), 0.07, z), { surf: SURF.stone });
  for (const sx of [-1, 1]) {
    const G = local(Y, sx * (YARD.w / 2 + 0.5), 0, YARD.d / 2 + 0.4);
    B.add(cyl(0.08, 0.1, 2.4, 6), 0x3a2a1e, local(G, 0, 1.2, 0), { surf: SURF.wood });
    B.add(box(0.7, 0.08, 0.08), 0x3a2a1e, local(G, -sx * 0.3, 2.35, 0));
    B.add(cyl(0.16, 0.13, 0.32, 6), 0x2a2420, local(G, -sx * 0.58, 2.05, 0)); B.add(cyl(0.2, 0.16, 0.12, 6), 0x2a2420, local(G, -sx * 0.58, 2.27, 0));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMat); lamp.applyMatrix4(local(G, -sx * 0.58, 2.05, 0)); scene.add(lamp);
    const gp = new THREE.Vector3().setFromMatrixPosition(G); addCircle(gp.x, gp.z, 0.25); lampPos.push(new THREE.Vector3().setFromMatrixPosition(lamp.matrix));
  }
}
const models = {};   // 名前 → メッシュ（Blender との受け渡し用）
for (const [tag, grp] of [['house', B.build()], ['flowers', FB.build()]]) {
  const hulls = []; grp.traverse((o) => { if (o.userData.noOutline && o.material?.side === THREE.BackSide) hulls.push(o); });
  for (const h of hulls) h.parent.remove(h);
  let k = 0; grp.traverse((o) => { if (o.isMesh) { o.name = `${tag}_${k++}`; models[o.name] = o; } });
  scene.add(grp);
}
rocks.forEach((m, i) => { m.name = `rock_${i}`; models[m.name] = m; });
// 煙突の煙: ふちのぼけた丸い絵の板（球だと灰色の玉に見える）
const smoke = [];
{
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,252,244,0.9)'); gr.addColorStop(0.5, 'rgba(250,246,236,0.45)'); gr.addColorStop(1, 'rgba(250,246,236,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    m.userData.t = i / 9; scene.add(m); smoke.push(m);
  }
}

// ======================================================================
// 植物（FoliageBuilder）: 木・もみ・茂み・ソテツ・シダ・草の房・花
// ======================================================================
const F = new FoliageBuilder(), Rf = seeded(4242);
const occupied = [];
const SUNLEAF = new THREE.Color(1.3, 1.22, 1.02), SUNPINE = new THREE.Color(1.45, 1.3, 1.2); // 見本の木は日なたで明るく黄みがかる
const blocked = (x, z, pad = 0) => pathDist(x, z) < 1.6 + pad || inYard(x, z, 0.8 + pad) || nearCot(x, z, 0.6 + pad) || Math.hypot(x - POND.x, z - POND.z) < POND_R + 1 + pad
  || Math.hypot(x - GARDEN.x, z - GARDEN.z) < 4.5 + pad || Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) < 2.5 + pad || Math.hypot(x - ENTRY.x, z - ENTRY.z) < 3 + pad;
function plantTree(x, z, opt, kind = 'tree') {
  opt = { leaf: kind === 'pine' ? SUNPINE : SUNLEAF, ...opt };
  const y = heightAt(x, z), r = kind === 'pine' ? F.pine(x, y, z, Rf, opt) : F.tree(x, y, z, Rf, opt);
  occupied.push({ x, z, r: r.r }); addCircle(x, z, 0.45 * (opt.size || 1) * (opt.trunk ? 1.2 : 1)); return r;
}
const treeAtUV = (u, v, opt, kind) => { const p = at(u, v); for (let k = 0; k < 4; k++) { const p2 = at(u, v, heightAt(p.x, p.z)); p.x = p2.x; p.z = p2.z; } return plantTree(p.x, p.z, opt, kind); };
// はじめの画面の木（構図はそのまま）
treeAtUV(0.84, 0.48, { size: 1.05, trunk: 1.6 });
treeAtUV(0.72, 0.12, { size: 1.0 }); treeAtUV(0.9, 0.18, { size: 1.0 }); treeAtUV(0.6, -0.02, { size: 0.9 }); treeAtUV(0.32, -0.06, { size: 0.9 });
treeAtUV(0.04, 0.1, { size: 1.1 }); treeAtUV(0.12, 0.26, { size: 0.9 }); treeAtUV(0.0, 0.34, { size: 0.85 });
treeAtUV(0.25, 0.62, { size: 0.85 }, 'pine'); treeAtUV(0.68, 0.3, { size: 0.8 }, 'pine');
treeAtUV(0.03, 0.95, { size: 0.95 }); treeAtUV(1.0, 0.98, { size: 0.9 });
// まわりの森: 歩ける範囲の縁ほど密に。道・前庭・池・菜園は空ける
{
  const Rt = seeded(91);
  for (let i = 0; i < 2600 && occupied.length < 190; i++) {
    const a = Rt() * 6.2832, e = Math.sqrt(Rt()) * 1.32, x = CENTER.x + Math.cos(a) * RX * e, z = CENTER.z + Math.sin(a) * RZ * e;
    const edge = smooth(0.55, 0.95, e), keep = 0.08 + edge * 0.9;
    if (Rt() > keep || blocked(x, z, 1.2) || occupied.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.75 + 1.5)) continue;
    const ci = cliffIn(x, z); if (ci > -1.2 && ci < 1.6 && rampK(x, z) < 0.3) continue;   // 崖の面には生やさない
    const pine = Rt() < 0.18 + smooth(0.5, 3, ci) * 0.35;
    plantTree(x, z, { size: 0.8 + Rt() * 0.45, ...(Rt() < 0.2 ? { trunk: 1.4 } : {}) }, pine ? 'pine' : 'tree');
  }
}
// クローバーの茂み: 道の縁と木の根元
{
  const Rb = seeded(17);
  for (let i = 0; i < 900; i++) {
    const o = occupied[Math.floor(Rb() * occupied.length)], a = Rb() * 6.28, d = o.r * (0.4 + Rb() * 0.8);
    const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
    if (Rb() < 0.5 && !blocked(x, z, -0.2) && ell(x, z) < 1.05 && Math.abs(cliffIn(x, z)) > 1) F.cloverBush(x, heightAt(x, z), z, Rf, { size: 0.8 + Rb() * 0.5 });
  }
  for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i], b = p.pts[i + 1], L = a.distanceTo(b);
    for (let t = 0; t < L; t += 2.6) {
      const s = Rb() < 0.5 ? -1 : 1, off = p.w + 1.6 + Rb() * 1.2, k = t / L;
      const x = lerp(a.x, b.x, k) - (b.z - a.z) / L * off * s, z = lerp(a.z, b.z, k) + (b.x - a.x) / L * off * s;
      if (Rb() < 0.55 && !blocked(x, z, -0.4) && Math.abs(cliffIn(x, z)) > 1) F.cloverBush(x, heightAt(x, z), z, Rf, { size: 0.8 + Rb() * 0.6 });
    }
  }
}
// ソテツ（明るい葉の主役。日なたに少し）
for (const [x, z, s, t] of [[COT.x - 6.2, COT.z + 9.4, 1.1, 1.0], [COT.x + 6.6, COT.z + 9, 0.9, 0.8], [ENTRY.x + 4, ENTRY.z - 2, 1.0, 0.9], [POND.x - 6, POND.z + 4, 0.9, 0.7], [LOOKOUT.x + 2.5, LOOKOUT.z - 2.5, 0.8, 0.6]]) {
  F.cycad(x, heightAt(x, z), z, Rf, { size: s, trunk: t }); addCircle(x, z, 0.3);
}
// 花: 黄色い花の群れ・ラベンダー色の群れ（芝に点々）
{
  const Rp = seeded(23), YEL = new THREE.Color(1.6, 1.4, 0.5), LAV = new THREE.Color(1.15, 0.95, 1.6), WHT = new THREE.Color(1.5, 1.5, 1.4);
  for (let i = 0; i < 46; i++) {
    const a = Rp() * 6.28, e = Math.sqrt(Rp()) * 0.85, x = CENTER.x + Math.cos(a) * RX * e, z = CENTER.z + Math.sin(a) * RZ * e;
    if (blocked(x, z, -0.6) || Math.abs(cliffIn(x, z)) < 1.5) continue;
    const col = [YEL, YEL, LAV, WHT][i % 4], y = heightAt(x, z);
    for (let k = 0; k < 7; k++) F.tuft(x + (Rp() - 0.5) * 1.1, y, z + (Rp() - 0.5) * 0.8, Rf, { size: 1.8 + Rp() * 0.6, col });
  }
  // 池の葦（細長い草の房を水ぎわに）
  for (let i = 0; i < 40; i++) {
    const a = Rp() * 6.28, d = POND_R + (Rp() - 0.3) * 0.9, x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    if (pathDist(x, z) < 1.2) continue;
    F.tuft(x, heightAt(x, z), z, Rf, { size: 2.2 + Rp() * 0.8, col: new THREE.Color(1.0, 1.1, 0.75) });
  }
}
// シダ: 崖の下と森の縁
{
  const Rs = seeded(29);
  for (let i = 0; i < 700; i++) {
    const a = Rs() * 6.28, e = Math.sqrt(Rs()) * 1.1, x = CENTER.x + Math.cos(a) * RX * e, z = CENTER.z + Math.sin(a) * RZ * e;
    const nIn = cliffIn(x, z), nearCliff = nIn > -2.2 && nIn < -0.4 && rampK(x, z) < 0.3, edge = e > 0.8;
    if (blocked(x, z, 0.4) || (!nearCliff && !edge && Rs() > 0.08)) continue;
    F.fern(x, heightAt(x, z), z, Rf, { size: 0.55 + Rs() * 0.35 });
  }
}
// 草の房: 道の縁に多く、全体にまばら。崖の面・道・前庭・家・池は避ける
{
  const sunC = new THREE.Color(1.25, 1.12, 1.02), shadeC = new THREE.Color(0.95, 0.95, 0.9);
  const Rg = seeded(37);
  for (let i = 0; i < 150000; i++) {
    const x = CENTER.x + (Rg() - 0.5) * RX * 2.1, z = CENTER.z + (Rg() - 0.5) * RZ * 2.1;
    if (ell(x, z) > 1.04) continue;
    const pd = pathDist(x, z), nIn = cliffIn(x, z);
    if (pd < 1.6 || inYard(x, z, 0.4) || nearCot(x, z, 0.3) || Math.hypot(x - POND.x, z - POND.z) < POND_R + 0.3) continue;
    if (nIn > -0.4 && nIn < 2.0 && rampK(x, z) < 0.3) continue;
    const edge = smooth(2.6, 1.2, pd), clump = vnoise(x * 0.35, z * 0.35), keep = 0.02 + clump * 0.1 + edge * 0.3;
    if (Rg() > keep) continue;
    const sh = occupied.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r);
    F.tuft(x, heightAt(x, z), z, Rf, { size: 0.8 + Rg() * 0.5 + edge * 0.3, col: sh ? shadeC : sunC });
  }
}
scene.add(F.build());
shadeUnder(occupied);
// 見えない枝葉: 大きな木陰を 1〜2 か所（見本は日なたの広い草地に、大きな木陰が1つ）
{
  const S = new FoliageBuilder(), Rs = seeded(31);
  for (const [x, z, y, r] of [[COT.x + 10, COT.z + 9, 9, 3.2], [COT.x - 9, COT.z + 16, 9, 2.6], [ENTRY.x + 3, ENTRY.z - 12, 9, 3]]) {
    S.clump('broad', new THREE.Vector3(x + y * SUN_OFF.x / SUN_OFF.y, y, z + y * SUN_OFF.z / SUN_OFF.y), r * 1.2, r * 0.6, Math.round(r * r * 14), Rs, new THREE.Color(1, 1, 1), { size: 2.2 });
  }
  const g = S.build();
  g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.colorWrite = false; o.material.depthWrite = false; o.receiveShadow = false; o.castShadow = true; } });
  scene.add(g);
}

// ======================================================================
// Blender の形: コテージ・前庭・岩の仕上げ（差し替え）と、コテージの飾り・庭の小物（ro-props.glb）
// ======================================================================
const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });   // 背景は Lambert でやわらかく（輪郭線なし）
// 小物の置き場所（x, z, 向き, 大きさ, 当たり判定の半径）
const PROPS = [
  ['well', COT.x - 7.4, COT.z + 1.5, 0.3, 1, 1.15], ['bench', COT.x - 7.6, COT.z + 4.6, -0.2, 1, 0.8], ['laundry', COT.x - 6.8, COT.z - 2.8, 1.3, 1, 0],
  ['barrel', COT.x + 3.6, COT.z + 2.2, 0, 1, 0.45], ['crates', COT.x + 4.4, COT.z + 0.4, 0.4, 1, 0.9], ['sacks', COT.x + 4.0, COT.z + 3.2, 0, 1, 0.6],
  ['pot_pink', YARD.x - 1.6, YARD.z - 0.75, 0, 1, 0.3], ['pot_yellow', YARD.x + 0.4, YARD.z - 0.75, 0, 1, 0.3], ['pot_purple', YARD.x + 2.4, YARD.z - 0.6, 0, 1, 0.3],
  ['signpost', nearMain[1].x + 1.6, nearMain[1].z + 0.4, 2.6, 1, 0.25], ['signpost', ENTRY.x + 2.2, ENTRY.z - 1, 2.2, 1, 0.25],
  ['lantern', ENTRY.x - 2, ENTRY.z - 4, 0.2, 1, 0.25], ['lantern', GARDEN.x - 4.5, GARDEN.z + 4.2, 1.5, 1, 0.25], ['lantern', RAMP.x + 3.2, RAMP.z + 3.6, 2.6, 1, 0.25], ['lantern', POND.x - 5.8, POND.z - 4.6, 0.8, 1, 0.25],
  ['vegbed', GARDEN.x - 1.2, GARDEN.z - 1.4, 0.05, 1, 0], ['vegbed', GARDEN.x + 1.6, GARDEN.z + 0.4, 0.05, 1, 0], ['vegbed', GARDEN.x - 1.0, GARDEN.z + 1.6, 0.05, 1, 0],
  ['pumpkins', GARDEN.x + 2.6, GARDEN.z - 2.2, 0.4, 1, 0.6], ['wheelbarrow', GARDEN.x + 3.0, GARDEN.z + 2.8, 2.4, 1, 0.8], ['wateringcan', GARDEN.x + 0.2, GARDEN.z - 2.9, 0.6, 1, 0],
  ['stump', GARDEN.x + 4.6, GARDEN.z - 4.4, 0.5, 1, 0.6], ['log', COT.x + 4, COT.z - 10.5, 0.4, 1, 0], ['stump', COT.x - 4, COT.z - 9, 1.2, 0.8, 0.5],
  ['bench', LOOKOUT.x + 0.5, LOOKOUT.z + 0.8, 2.9, 1, 0.8], ['bench', POND.x - 3.4, POND.z - 4.2, 0.6, 1, 0.8], ['log', POND.x + 5.5, POND.z + 2.5, 1.9, 0.9, 0],
  ['barrel', ENTRY.x - 3.5, ENTRY.z - 6, 0, 0.9, 0.45], ['crates', ENTRY.x - 4.2, ENTRY.z - 7.4, 1.0, 0.9, 0.9],
];
// 菜園の柵（2m ずつ）と、入口の道の両脇の柵
const FENCES = [];
{
  const gx = GARDEN.x, gz = GARDEN.z, hw = 3.6, hd = 3.4;
  for (let i = -1; i <= 1; i++) { FENCES.push([gx + i * 2.1, gz - hd, 0]); FENCES.push([gx + hw, gz + i * 2.1, Math.PI / 2]); }
  for (let i = -1; i <= 1; i += 2) FENCES.push([gx + i * 2.1, gz + hd, 0]);   // 正面の真ん中は入口
  for (let i = -1; i <= 1; i++) FENCES.push([gx - hw, gz + i * 2.1, Math.PI / 2]);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) FENCES.push([ENTRY.x - 2.5 * (k / 3) + s * 2.4, ENTRY.z - 1 - k * 2.2, Math.PI / 2 + 0.3]);
}
const REFINED = './assets/models/blender/ro-cottage-refined.glb', PROPS_GLB = './assets/models/blender/ro-props.glb';
async function useBlender() {
  if (q.get('blender') === '0') return;
  const loader = new GLTFLoader();
  // 1) コテージ・前庭・岩: 面取りと AO を足した形に差し替える（材質はそのまま）
  try {
    const gltf = await loader.loadAsync(REFINED); let n = 0;
    gltf.scene.traverse((o) => { const m = o.isMesh && models[o.name]; if (!m || !o.geometry.attributes.color) return; m.geometry.dispose(); m.geometry = o.geometry; n++; });
    console.log('Blender で仕上げた形', n);
  } catch (e) { console.warn('仕上げた形を読めない', e); }
  // 2) コテージの飾りと庭の小物
  let lib;
  try { lib = await loader.loadAsync(PROPS_GLB); } catch (e) { console.warn('小物を読めない', e); return; }
  const geo = {}; lib.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
  const put = (g, M) => { const m = new THREE.Mesh(g, propMat); m.applyMatrix4(M); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  // 瓦は Lambert だと、コードの屋根（なだらかな段の陰影）より暗く沈むので、材質の掛け算で明るくする（見本の暖色の日なたに合わせる）
  // 瓦は影を落とさない（段ごとに上の段の影が下の段に落ちて、屋根全体が暗くなる。家の影は下のコードの屋根が落とす）
  for (const k of ['cot_roof', 'cot_tower', 'cot_walls']) if (geo[k]) { const m = put(geo[k], COT_M); if (k !== 'cot_walls') m.castShadow = false; }
  for (const [k, x, z, ry, s, r] of PROPS) {
    if (!geo['prop_' + k]) continue;
    const M = local(I, x, heightAt(x, z) - 0.02, z, 0, ry, 0, s); put(geo['prop_' + k], M); if (r) addCircle(x, z, r * s);
    if (k === 'lantern') { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), lampMat); lamp.applyMatrix4(local(M, 0.6, 1.98, 0)); scene.add(lamp); }   // 角灯の灯り
  }
  for (const [x, z, ry] of FENCES) { if (!geo.prop_fence) break; put(geo.prop_fence, local(I, x, heightAt(x, z) - 0.03, z, 0, ry, 0)); solids.push({ x, z, w: 2.1, d: 0.3, ry }); }
}

// ======================================================================
// 光の粒（花粉）と蝶: 日なたの空気に動きを足す
// ======================================================================
const motes = (() => {
  const n = 260, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = CENTER.x + (Math.random() - 0.5) * 60; pos[i * 3 + 1] = 0.5 + Math.random() * 5; pos[i * 3 + 2] = CENTER.z + (Math.random() - 0.5) * 60; seed[i] = Math.random() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff2b8, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; scene.add(m); return { m, pos, seed, n };
})();
const butterflies = [];
for (let i = 0; i < 10; i++) {
  const col = [0xfff4a0, 0xffffff, 0xf0b0e0, 0xa8d8ff][i % 4], g = new THREE.Group();
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); w.position.x = s * 0.09; w.scale.set(1, 0.75, 1); g.add(w); }
  const home = [GARDEN, POND, W3(YARD.x, YARD.z + 3), W3(COT.x - 7, COT.z + 6), ENTRY][i % 5];
  g.userData = { home, ph: Math.random() * 10, r: 2 + Math.random() * 3 };
  scene.add(g); butterflies.push(g);
}

// ======================================================================
// 人物（トゥーンと輪郭線のまま）と歩く仕組み
// ======================================================================
const walker = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 4, 10), toon(0x3a6ac0)); body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toon(0xf2d0b0)); head.position.y = 1.5;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x6a3a2a)); hair.position.y = 1.55;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.95, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), toon(0xc0403a, { side: THREE.DoubleSide })); cape.position.set(0, 0.85, -0.05);
  walker.add(body, head, hair, cape);
  walker.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(walker, 1);
  scene.add(walker);
}
const start = at(0.47, 0.7);
const me = { x: start.x, z: start.z, dir: Math.PI + 0.3, step: 0 };
// 押し出し: 円・向きのある長方形・崖（急な段）・水・歩ける範囲
function collide(x, z, px, pz) {
  const rad = 0.4;
  for (let pass = 0; pass < 2; pass++) for (const s of solids) {
    if (s.r !== undefined) {
      const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), m = s.r + rad;
      if (d < m && d > 1e-4) { x = s.x + dx / d * m; z = s.z + dz / d * m; }
    } else {
      const c = Math.cos(s.ry), sn = Math.sin(s.ry), dx = x - s.x, dz = z - s.z;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c, hw = s.w / 2 + rad, hd = s.d / 2 + rad;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        let nx = lx, nz = lz; if (hw - Math.abs(lx) < hd - Math.abs(lz)) nx = Math.sign(lx) * hw; else nz = Math.sign(lz) * hd;
        x = s.x + nx * c + nz * sn; z = s.z - nx * sn + nz * c;
      }
    }
  }
  if (Math.hypot(x - POND.x, z - POND.z) < POND_R - 0.4) return { x: px, z: pz };
  if (ell(x, z) > 0.96) return { x: px, z: pz };
  if (Math.abs(heightAt(x, z) - heightAt(px, pz)) > 0.35) return { x: px, z: pz };   // 崖の段は上り下りできない（坂はゆるいので通れる）
  return { x, z };
}
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let zoom = 1;
addEventListener('wheel', (e) => { zoom = Math.min(1.35, Math.max(0.7, zoom * (e.deltaY > 0 ? 1.06 : 0.94))); }, { passive: true });
const stick = { el: document.createElement('div'), x: 0, y: 0, id: null };
{
  const st = document.createElement('style');
  st.textContent = `#stick{position:fixed;z-index:10;left:calc(24px + env(safe-area-inset-left,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));width:132px;height:132px;border-radius:50%;background:rgba(20,18,28,.3);border:2px solid rgba(255,255,255,.45);touch-action:none}
#stick i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.75)}
#hint{position:fixed;z-index:10;left:12px;top:10px;font:13px/1.4 sans-serif;color:#fff;text-shadow:0 1px 2px #0008;opacity:.85}`;
  document.head.append(st);
  const knob = document.createElement('i'); stick.el.id = 'stick'; stick.el.append(knob); document.body.append(stick.el);
  const move = (e) => {
    const r = stick.el.getBoundingClientRect(), max = r.width / 2 - 14;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const L = Math.hypot(dx, dy); if (L > max) { dx *= max / L; dy *= max / L; }
    stick.x = dx / max; stick.y = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const end = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stick.el.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; stick.el.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
  stick.el.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) move(e); });
  stick.el.addEventListener('pointerup', end); stick.el.addEventListener('pointercancel', end);
  const hint = document.createElement('div'); hint.id = 'hint'; hint.textContent = 'WASD・矢印・スティックで歩く / ホイールで寄る・引く'; document.body.append(hint);
  if (FIXED) { stick.el.hidden = true; hint.hidden = true; }
}

// ======================================================================
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); tilt.uniforms.res.value.set(innerWidth, innerHeight);
});
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
const clock = new THREE.Clock(), focus = new THREE.Vector3(me.x, heightAt(me.x, me.z) + 1.2, me.z);
const turn = (to, dt) => { walker.rotation.y += (((to - walker.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-10 * dt)); };
walker.rotation.y = me.dir;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  FOLIAGE_U.uTime.value = t;
  if (orb) orb.rotation.y = t * 1.2;
  if (typeof pondShine !== 'undefined') { const k = (t * 0.2) % 1; pondShine.scale.setScalar(1 + k * 1.8); pondShine.material.opacity = 0.3 * (1 - k); }
  for (const m of smoke) {
    m.userData.t = (m.userData.t + dt * 0.1) % 1; const k = m.userData.t;
    m.position.set(smokeOrigin.x + Math.sin(k * 5 + t * 0.3) * 0.4 + k * 1.6, smokeOrigin.y + k * 6, smokeOrigin.z - k * 0.8);
    m.scale.setScalar(0.9 + k * 3.2); m.material.opacity = Math.sin(Math.PI * k) * 0.42;
  }
  for (let i = 0; i < motes.n; i++) {
    const s = motes.seed[i]; motes.pos[i * 3] += Math.sin(t * 0.3 + s) * dt * 0.25; motes.pos[i * 3 + 1] += Math.sin(t * 0.5 + s * 2) * dt * 0.12; motes.pos[i * 3 + 2] += Math.cos(t * 0.27 + s) * dt * 0.25;
  }
  motes.m.geometry.attributes.position.needsUpdate = true;
  for (const b of butterflies) {
    const u = b.userData, a = t * 0.5 + u.ph, x = u.home.x + Math.cos(a) * u.r + Math.sin(a * 2.3) * 0.8, z = u.home.z + Math.sin(a * 0.8) * u.r;
    b.position.set(x, heightAt(x, z) + 0.8 + Math.sin(a * 3) * 0.3, z); b.rotation.y = -a; const f = Math.sin(t * 22 + u.ph) * 0.9;
    b.children[0].rotation.y = f; b.children[1].rotation.y = -f;
  }
  // 歩く
  if (!FIXED) {
    let ix = stick.x, iz = stick.y;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('w') || keys.has('arrowup')) iz -= 1; if (keys.has('s') || keys.has('arrowdown')) iz += 1;
    const L = Math.hypot(ix, iz);
    if (L > 0.12) {
      const sp = 5.5 * Math.min(1, L) / Math.max(1, L);
      const p = collide(me.x + ix * sp * dt, me.z + iz * sp * dt, me.x, me.z);
      me.step += Math.hypot(p.x - me.x, p.z - me.z); me.x = p.x; me.z = p.z; me.dir = Math.atan2(ix, iz);
    }
  }
  turn(me.dir, dt);
  const y = heightAt(me.x, me.z);
  walker.position.set(me.x, y + Math.abs(Math.sin(me.step * 2.2)) * 0.06, me.z);
  if (FIXED) { camera.position.copy(LC.position); camera.quaternion.copy(LC.quaternion); focus.copy(walker.position); }
  else {
    focus.lerp(new THREE.Vector3(me.x, y + 1.2, me.z), 1 - Math.exp(-8 * dt));
    camera.position.set(focus.x, focus.y + 24.8 * zoom, focus.z + 23.2 * zoom); camera.lookAt(focus);   // 実験場の歩く視点（RO風）
  }
  // 影は見ている場所の周りに落とす
  sun.target.position.copy(focus); sun.position.copy(focus).add(SUN_OFF);
  // 手前の木を抜く（歩くとき 2.6、決まった視点では 4 とカメラの近く）
  OCC.uOccCam.value.copy(camera.position); OCC.uOccTgt.value.copy(focus);
  OCC.uOccR.value = FIXED ? 0 : 2.6; FOLIAGE_U.uOccR.value = FIXED ? 4 : 2.6;
  FOLIAGE_U.uOccNear.value = FIXED ? camera.position.distanceTo(focus) * 0.55 : 0;
  if (q.get('post') === '0') renderer.render(scene, camera); else composer.render();
});
window.__models = models; window.__scene = scene;
window.__map = { me, collide, heightAt, solids, zoom: (z) => { zoom = z; }, snap: () => focus.set(me.x, heightAt(me.x, me.z) + 1.2, me.z) }; window.__start = { x: me.x, z: me.z };
window.__spots = { COT, GARDEN, POND, LOOKOUT, ENTRY, RAMP };
useBlender().finally(() => { window.__ready = true; });
