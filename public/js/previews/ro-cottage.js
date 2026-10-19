// 森の家（ro-cottage.html）: 森に囲まれた小さなコテージと前庭。RO風の手順（docs/ro-look-method.md）で描く。
//   雛形は ref-forest.js（レンダラー・カメラ・光・仕上げ・配置の道具はそのまま）。見本は RO3 の明るい森のフィールド（4枚）。
//   左上は岩の崖の台地、真ん中奥にコテージ（石の土台・漆喰と木組み・とんがり屋根・丸い塔・煙突）、前に石畳の前庭と芝の境目、
//   手前から土の道が上がってきて右へ分かれる。右に大きな広葉樹、まわりにもみ・茂み・シダ・ソテツ・花・草の房。
//   配置は画面上の位置（u: 左0〜右1, v: 上0〜下1）で決め、カメラから地面へ投げて世界の位置にする。
//   URL: ?pitch=50&dist=23&fov=30（カメラ） ?post=0（仕上げなし）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { toon, outline, gradientMap, glow, Batch } from '../toon.js';
import { seeded, local, I } from '../env/kit.js';
import { SURF } from '../env/textures.js';
import { makeProp } from '../env/props.js';
import { PAINT } from './ro-style.js';
import { FoliageBuilder, FOLIAGE_U } from './foliage.js';
import { rockTexture, ROCK_GLSL, roRockMaterial, rockGeometry, blockGeometry } from './ro-rock.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
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
scene.background = new THREE.Color(0x6a8a40);
const camera = new THREE.PerspectiveCamera(num('fov', 30), innerWidth / innerHeight, 0.5, 200);
{
  const P = num('pitch', 50) * Math.PI / 180, D = num('dist', 23);
  camera.position.set(0, D * Math.sin(P), D * Math.cos(P)); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
}
const hemi = new THREE.HemisphereLight(0xe8f0e0, 0x5a6a3a, 1.3);
const sun = new THREE.DirectionalLight(0xffe6b8, 2.7);
sun.position.set(32, 23, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
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

// 見本の画面上の位置 (u, v) から、高さ y の水平面上の世界の位置へ
const ray = new THREE.Raycaster();
function at(u, v, y = 0) {
  ray.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), camera);
  const o = ray.ray.origin, d = ray.ray.direction, t = (y - o.y) / d.y;
  return new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t);
}
const line = (pts, y = 0) => pts.map(([u, v]) => at(u, v, y));
// 折れ線までの距離と、どちら側か（x 右・z 手前の地面で、線の進む向きの右が正。画面では線の手前側が正）
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
// なめらかな値ノイズ
function vnoise(x, z) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), sx), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), sx), sz);
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.3 + 5, z * 2.3) * 0.28 + vnoise(x * 5.1, z * 5.1 + 9) * 0.12;


// ======================================================================
// 地形: 左上の台地（岩の崖）、コテージの平地、土の道（手前から上がって右へ分かれる）
// ======================================================================
// 台地の縁（崖の下の線）。線の左側（奥・左）が高い
const cliffEdge = line([[-0.1, 0.5], [0.06, 0.48], [0.16, 0.42], [0.22, 0.3], [0.25, 0.16], [0.29, 0.05], [0.31, -0.25]]);
// 道（中心線）と分かれ道
const pathLine = line([[0.5, 1.2], [0.52, 0.98], [0.49, 0.84], [0.46, 0.72], [0.45, 0.64]]);
const branchLine = line([[0.49, 0.84], [0.6, 0.79], [0.74, 0.77], [0.88, 0.71], [1.2, 0.65]]);
const PLATEAU = 4.2;
// コテージ（画面の真ん中やや上）と前庭の石畳
const COT = at(0.45, 0.34);   // 屋根の先まで画面に入る位置
const COT_RY = 0.08, COT_S = 0.75;   // 人物が画面の高さの 12% の縮尺で、家が画面を占めすぎないように小ぶりに
const YARD = { x: COT.x, z: COT.z + 3.6, w: 5.8, d: 2.4 };   // 石畳（コテージの正面の前）
function pathDist(x, z) { return Math.min(Math.abs(sideDist(x, z, pathLine)), Math.abs(sideDist(x, z, branchLine)) + 0.25); }
function cliffIn(x, z) { return -sideDist(x, z, cliffEdge) + (fbm(x * 0.7, z * 0.7) - 0.5) * 1.4; }
const inYard = (x, z, pad = 0) => Math.abs(x - YARD.x) < YARD.w / 2 + pad && Math.abs(z - YARD.z) < YARD.d / 2 + pad;
const nearCot = (x, z, pad = 0) => Math.abs(x - COT.x) < 4.0 + pad && z > COT.z - 3.2 - pad && z < COT.z + 2.6 + pad;
function heightAt(x, z) {
  let h = (fbm(x * 0.15, z * 0.15) - 0.5) * 0.5;
  const n = cliffIn(x, z);
  // 崖: ほぼ垂直に上がり、途中に段（岩の層）
  h += PLATEAU * smooth(-0.3, 0.9, n) + 0.6 * smooth(1.4, 2.4, n) + (fbm(x * 0.5, z * 0.5) - 0.5) * 1.2 * smooth(0.5, 2, n);
  // コテージと前庭は平らにならす
  const flat = Math.max(smooth(2.5, 0, Math.max(Math.abs(x - COT.x) - 5, 0) + Math.max(Math.abs(z - (COT.z + 1.5)) - 5, 0)), 0);
  h = lerp(h, 0.05, flat * smooth(0.5, -0.5, n));
  h -= smooth(2.2, 0.6, pathDist(x, z)) * 0.08;
  return h;
}

const GW = 46, GD = 42, SEG = 260;
const ground = (() => {
  const g = new THREE.PlaneGeometry(GW, GD, SEG, Math.round(SEG * GD / GW));
  g.rotateX(-Math.PI / 2); g.translate(0, 0, -6);
  const p = g.attributes.position, n = p.count;
  for (let i = 0; i < n; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const splat = new Float32Array(n * 3), shade = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i), pd = pathDist(x, z);
    // 道の半幅 1.1m。縁は (fbm - 0.5) * 1.4 で崩す。戸口の前（石畳の手前）も少し土
    const dirt = Math.max(smooth(1.8, 0.8, pd + (fbm(x, z) - 0.5) * 1.4), smooth(1.6, 0.4, Math.hypot(x - YARD.x, z - (YARD.z + YARD.d / 2 + 0.6)) + (fbm(x * 0.9, z) - 0.5) * 1.2) * 0.9);
    splat[i * 3 + 1] = inYard(x, z, -0.1) ? 0 : dirt * (cliffIn(x, z) < 0 ? 1 : 0);
    shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = 1;
  }
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 3));
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const U = { tGrass: { value: PAINT.grass() }, tDirt: { value: PAINT.dirt() }, tRock: { value: rockTexture() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 splat; attribute vec3 shade; varying vec3 vSplat; varying vec3 vShade; varying vec3 vRW; varying vec3 vRN;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat; vShade = shade; vRW = (modelMatrix * vec4(position, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; varying vec3 vSplat; varying vec3 vShade; varying vec3 vRW; varying vec3 vRN;\n' + ROCK_GLSL
      + sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 xz = vRW.xz;
      vec3 g = mix(texture2D(tGrass, xz / 7.0).rgb, texture2D(tGrass, xz / 19.0 + 0.37).rgb, 0.35);
      vec2 q = xz * 0.06; vec2 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
      #define H2(v) fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5)
      float mac = mix(mix(H2(qi), H2(qi + vec2(1, 0)), qf.x), mix(H2(qi + vec2(0, 1)), H2(qi + vec2(1, 1)), qf.x), qf.y);
      g *= mix(vec3(0.86, 0.92, 0.8), vec3(1.1, 1.08, 0.9), mac) * vec3(1.5, 1.12, 0.92); // 見本（RO3 の日なたの草地）の草は黄みが強く明るい
      vec3 d = texture2D(tDirt, xz / 6.0).rgb * vec3(0.86, 1.0, 0.8); // 見本の道は黄緑がかる
      float n = (texture2D(tGrass, xz / 3.1).g - 0.45) * 0.9;
      float wd = smoothstep(0.35, 0.65, vSplat.y + n);
      vec3 col = mix(g, d, wd);
      vec3 nn = normalize(vRN);
      float rk = smoothstep(0.78, 0.6, nn.y + n * 0.25);
      col = mix(col, rockTri(tRock, vRW, nn, 4.5), rk);
      diffuseColor.rgb *= col * vShade;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
})();
// 木の下の地面を暗くする（木の半径の 1.15 倍で最小 0.72）。植物を置いたあとで呼ぶ
function shadeUnder(occ) {
  const g = ground.geometry, p = g.attributes.position, sh = g.attributes.shade;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); let k = 1;
    for (const o of occ) { const d = Math.hypot(x - o.x, z - o.z) / (o.r * 1.15); if (d < 1) k = Math.min(k, lerp(0.72, 1, smooth(0.35, 1, d))); }
    sh.setXYZ(i, k, k, k);
  }
  sh.needsUpdate = true;
}

// ======================================================================
// 岩: 崖の面に張りつく角ばった塊（2層の崖）・道ばたの小石・崖の下の大岩
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
// 崖の下の大岩（苔 0.4）と、道ばたの小石（苔なし）
for (const [u, v, s] of [[0.27, 0.5, 0.7], [0.33, 0.27, 0.55], [0.08, 0.6, 0.6]]) {
  const p = at(u, v); if (cliffIn(p.x, p.z) > -0.2) continue;
  rock(p.x, heightAt(p.x, p.z) + 0.1, p.z, 300 + Math.round(u * 100), { sx: s * 1.3, sy: s * 0.8, sz: s, rough: 0.18 }).material = roRockMaterial({ flat: true, moss: 0.4 });
}
for (let i = 0; i < 22; i++) {
  const p = at(0.3 + R() * 0.6, 0.45 + R() * 0.55); if (pathDist(p.x, p.z) < 1.1 || pathDist(p.x, p.z) > 2.6 || cliffIn(p.x, p.z) > -0.5 || inYard(p.x, p.z, 0.5)) continue;
  rock(p.x, heightAt(p.x, p.z) + 0.02, p.z, 700 + i, { sx: 0.18 + R() * 0.15, sy: 0.12, sz: 0.18, rough: 0.2, detail: 1 }).material = roRockMaterial({ flat: true, moss: 0 });
}

// 見えない枝葉: 画面の外（上・右・左下）の木の茂りで、地面にまだらの大きな影を落とす
{
  const S = new FoliageBuilder(), Rs = seeded(31);
  for (const [u, v, y, r] of [[0.9, 0.62, 9, 3.2], [0.08, 0.95, 9, 2.6]]) { // 見本は日なたの広い草地に、大きな木陰が1つ落ちる
    const p = at(u, v); S.clump('broad', new THREE.Vector3(p.x + y * sun.position.x / sun.position.y, y, p.z + y * sun.position.z / sun.position.y), r * 1.2, r * 0.6, Math.round(r * r * 14), Rs, new THREE.Color(1, 1, 1), { size: 2.2 });
  }
  const g = S.build();
  g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.colorWrite = false; o.material.depthWrite = false; o.receiveShadow = false; o.castShadow = true; } });
  scene.add(g);
}

// ======================================================================
// コテージ（実験場 lab.html のコテージと同じ作り）: 石の土台・漆喰と木組み・とんがり屋根・丸い塔・煙突・丸窓・丸い戸・花箱。
//   前庭: 石畳と縁石（芝との境目をはっきり）、角灯の柱、樽、薪、花壇。背景なので輪郭線は付けない（RO風）
// ======================================================================
const B = new Batch({ chunk: 24 }), FB = new Batch({ chunk: 24 });
const windowMat = glow(0xffd890), lampMat = glow(0xffc870);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
const smokeOrigin = new THREE.Vector3();
let orb = null;
{
  const y0 = heightAt(COT.x, COT.z), C = local(I, COT.x, y0, COT.z, 0, COT_RY, 0, COT_S);
  const W = 7, D = 5.4, H = 3.1, base = 0.6;
  const plaster = 0xf2e4c6, beam = 0x5a3820, roofC = 0xc4764e, stone = 0x9c968a; // 屋根は暖かい素焼きの色（見本の画面は暖色の日なたが多い。鮮やかな紫・暗い灰青は画面を取りすぎる）
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
  // 薪の山と樽（右の壁ぎわ）
  for (let k = 0; k < 9; k++) B.add(cyl(0.16, 0.16, 1.1, 7), 0x8a6a42, local(C, W / 2 + 0.7, 0.18 + Math.floor(k / 4) * 0.3, -1.6 + (k % 4) * 0.34 + Math.floor(k / 4) * 0.17, Math.PI / 2, 0, 0), { surf: SURF.bark });
  B.add(cyl(0.38, 0.38, 0.9, 12), 0x7a5232, local(C, W / 2 + 0.6, 0.45, 1.2), { surf: SURF.wood });
  for (const yy of [0.15, 0.75]) B.add(new THREE.TorusGeometry(0.39, 0.04, 4, 14), 0x3a3a3a, local(C, W / 2 + 0.6, yy, 1.2, Math.PI / 2, 0, 0));
  // 壁ぎわの花壇
  for (let k = 0; k < 26; k++) {
    const gx = (R() - 0.5) * (W - 0.6), gz = D / 2 + 0.35 + R() * 0.45;
    if (Math.abs(gx + 0.6) < 1.1) continue;
    makeProp(FB, 'flower', local(C, gx, 0.02, gz), R, [0xe0507a, 0xf0d040, 0xb08ae0, 0xffffff][k % 4], 0xf08a3a, {});
  }
}
// 前庭の石畳（見本3: 芝との境目がはっきりした四角い敷石と縁石）
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
    if (Math.abs(x + 0.6) < 0.8) continue; // 戸口の前から道へ抜ける所は縁石なし
    B.add(box(0.48, 0.16, 0.2), 0x9c968a, local(Y, x, 0.07, YARD.d / 2 + 0.08), { surf: SURF.stone });
  }
  for (const sx of [-1, 1]) for (let z = -YARD.d / 2; z <= YARD.d / 2; z += 0.5) B.add(box(0.2, 0.16, 0.48), 0x9c968a, local(Y, sx * (YARD.w / 2 + 0.08), 0.07, z), { surf: SURF.stone });
  // 角灯の柱（前庭の角）
  for (const sx of [-1, 1]) {
    const G = local(Y, sx * (YARD.w / 2 + 0.5), 0, YARD.d / 2 + 0.4);
    B.add(cyl(0.08, 0.1, 2.4, 6), 0x3a2a1e, local(G, 0, 1.2, 0), { surf: SURF.wood });
    B.add(box(0.7, 0.08, 0.08), 0x3a2a1e, local(G, -sx * 0.3, 2.35, 0));
    B.add(cyl(0.16, 0.13, 0.32, 6), 0x2a2420, local(G, -sx * 0.58, 2.05, 0)); B.add(cyl(0.2, 0.16, 0.12, 6), 0x2a2420, local(G, -sx * 0.58, 2.27, 0));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMat); lamp.applyMatrix4(local(G, -sx * 0.58, 2.05, 0)); scene.add(lamp);
  }
  // 木箱（見本のテントと荷の代わりに、家の脇の荷）
  for (const [x, z, s, ry] of [[YARD.w / 2 + 1.4, -0.6, 0.7, 0.3], [YARD.w / 2 + 1.9, 0.3, 0.6, -0.2], [YARD.w / 2 + 1.5, -0.2, 0.55, 0.6]]) {
    const M = local(Y, x, s / 2 + (s < 0.56 ? 0.7 : 0), z, 0, ry, 0);
    B.add(box(s, s, s), 0xa07a4a, M, { surf: SURF.wood });
    for (const e of [-1, 1]) B.add(box(s + 0.04, 0.08, s + 0.04), 0x6a4a2a, local(M, 0, e * (s / 2 - 0.05), 0));
  }
}
// 背景なので輪郭線を外す（実験場の RO風と同じ）
for (const grp of [B.build(), FB.build()]) {
  const hulls = []; grp.traverse((o) => { if (o.userData.noOutline && o.material?.side === THREE.BackSide) hulls.push(o); });
  for (const h of hulls) h.parent.remove(h);
  scene.add(grp);
}
// 煙突の煙
const smoke = [];
for (let i = 0; i < 7; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf2eee6, transparent: true, opacity: 0, depthWrite: false }));
  m.userData.t = i / 7; scene.add(m); smoke.push(m);
}

// ======================================================================
// 植物（FoliageBuilder）: 木・もみ・茂み・ソテツ・シダ・草の房・花
// ======================================================================
const F = new FoliageBuilder(), Rf = seeded(4242);
const occupied = [];
const onGround = (u, v) => { const p = at(u, v); for (let k = 0; k < 4; k++) { const y = heightAt(p.x, p.z); const p2 = at(u, v, y); p.x = p2.x; p.z = p2.z; } p.y = heightAt(p.x, p.z); return p; };
const SUNLEAF = new THREE.Color(1.3, 1.22, 1.02), SUNPINE = new THREE.Color(1.45, 1.3, 1.2); // 見本の木は日なたで明るく黄みがかる（1 を超える色で絵を明るく）
function treeAt(u, v, opt, kind = 'tree') { opt = { leaf: kind === 'pine' ? SUNPINE : SUNLEAF, ...opt }; const p = onGround(u, v); const r = kind === 'pine' ? F.pine(p.x, p.y, p.z, Rf, opt) : F.tree(p.x, p.y, p.z, Rf, opt); occupied.push({ x: p.x, z: p.z, r: r.r }); return p; }
// 右の大きな広葉樹（幹を見せる）と、上の木立（コテージの裏）
treeAt(0.84, 0.48, { size: 1.05, trunk: 1.6 });
treeAt(0.72, 0.12, { size: 1.0 });
treeAt(0.9, 0.18, { size: 1.0 });
treeAt(0.6, -0.02, { size: 0.9 });
treeAt(0.32, -0.06, { size: 0.9 });
// 台地の上の木
treeAt(0.04, 0.1, { size: 1.1 });
treeAt(0.12, 0.26, { size: 0.9 });
treeAt(0.0, 0.34, { size: 0.85 });
// もみ（崖の下とコテージの右奥）
treeAt(0.25, 0.62, { size: 0.85 }, 'pine');
treeAt(0.68, 0.3, { size: 0.8 }, 'pine');
// 手前の木（左下と右下の角）
treeAt(0.03, 0.95, { size: 0.95 });
treeAt(1.0, 0.98, { size: 0.9 });
// クローバーの茂み: 道の脇と木の根元
for (const [u, v, s] of [[0.36, 0.72, 1.1], [0.38, 0.86, 1.0], [0.58, 0.9, 1.1], [0.62, 0.62, 1.0], [0.3, 0.6, 1.2], [0.2, 0.7, 1.0],
  [0.78, 0.6, 1.1], [0.9, 0.58, 1.0], [0.74, 0.86, 1.0], [0.66, 0.4, 0.9], [0.24, 0.4, 0.9]]) {
  const p = onGround(u, v); if (pathDist(p.x, p.z) < 1.4 || inYard(p.x, p.z, 0.6) || nearCot(p.x, p.z)) continue;
  F.cloverBush(p.x, p.y, p.z, Rf, { size: s });
}
// ソテツ（見本の明るい葉の主役。手前の両脇）
for (const [u, v, s, t] of [[0.14, 0.82, 1.1, 1.0], [0.92, 0.76, 0.9, 0.8]]) { const p = onGround(u, v); F.cycad(p.x, p.y, p.z, Rf, { size: s, trunk: t }); }
// 黄色い花（芝に点々）とラベンダー色の花（前庭の脇）
for (const [u, v, n, col] of [[0.3, 0.78, 7, new THREE.Color(1.6, 1.4, 0.5)], [0.66, 0.82, 6, new THREE.Color(1.6, 1.4, 0.5)], [0.27, 0.47, 6, new THREE.Color(1.15, 0.95, 1.6)], [0.64, 0.5, 6, new THREE.Color(1.15, 0.95, 1.6)]]) {
  const p = onGround(u, v);
  for (let i = 0; i < n; i++) F.tuft(p.x + (Rf() - 0.5) * 0.9, p.y, p.z + (Rf() - 0.5) * 0.6, Rf, { size: 1.8 + Rf() * 0.6, col });
}
// シダ: 崖の下と木の根元
for (let i = 0; i < 90; i++) {
  const p = at(R() * 1.1 - 0.05, R() * 1.1 - 0.05); const y = heightAt(p.x, p.z);
  const nIn = cliffIn(p.x, p.z), nearCliff = nIn > -2.2 && nIn < -0.4, top = nIn > 2.5;
  if (pathDist(p.x, p.z) < 2 || inYard(p.x, p.z, 0.8) || nearCot(p.x, p.z, 0.5) || (!nearCliff && !top && R() > 0.25)) continue;
  F.fern(p.x, y, p.z, Rf, { size: 0.55 + R() * 0.35 });
}
// 草の房: 道の縁に多く、全体にまばら。崖の面・道・前庭・家は避ける
const sunC = new THREE.Color(1.25, 1.12, 1.02), shadeC = new THREE.Color(0.95, 0.95, 0.9); // 見本は日なたも影も青みが少し残る
for (let i = 0; i < 26000; i++) {
  const x = lerp(-17, 17, R()), z = lerp(-24, 10, R()), y = heightAt(x, z);
  const pd = pathDist(x, z), nIn = cliffIn(x, z);
  if (pd < 1.6 || inYard(x, z, 0.4) || nearCot(x, z, 0.3)) continue;
  if (nIn > -0.4 && nIn < 2.0) continue;
  const edge = smooth(2.6, 1.2, pd), clump = vnoise(x * 0.35, z * 0.35), keep = 0.02 + clump * 0.1 + edge * 0.3;
  if (R() > keep) continue;
  const sh = occupied.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r);
  F.tuft(x, y, z, Rf, { size: 0.8 + R() * 0.5 + edge * 0.3, col: sh ? shadeC : sunC });
}
scene.add(F.build());
shadeUnder(occupied);

// ======================================================================
// 人物（大きさの目安。キャラは見本と合わせない）
// ======================================================================
{
  const w = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 4, 10), toon(0x3a6ac0)); body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toon(0xf2d0b0)); head.position.y = 1.5;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x6a3a2a)); hair.position.y = 1.55;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.95, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), toon(0xc0403a, { side: THREE.DoubleSide })); cape.position.set(0, 0.85, -0.05);
  w.add(body, head, hair, cape);
  w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(w, 1);
  const p = onGround(0.47, 0.7); w.position.copy(p); w.rotation.y = 0.3;
  scene.add(w);
}

// ======================================================================
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); tilt.uniforms.res.value.set(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.elapsedTime;
  FOLIAGE_U.uTime.value = t;
  if (orb) orb.rotation.y = t * 1.2;
  for (const m of smoke) {
    m.userData.t = (m.userData.t + 0.0016) % 1; const k = m.userData.t;
    m.position.set(smokeOrigin.x + Math.sin(k * 5 + t * 0.3) * 0.4 + k * 1.6, smokeOrigin.y + k * 6, smokeOrigin.z - k * 0.8);
    m.scale.setScalar(0.6 + k * 2.4); m.material.opacity = Math.sin(Math.PI * k) * 0.55;
  }
  if (q.get('post') === '0') renderer.render(scene, camera); else composer.render();
});
window.__ready = true;
