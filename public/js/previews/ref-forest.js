// 見本の再現（ref-forest.html）: 森の小道の分かれ道。左に岩の崖、奥に岩の壁、真ん中にもみの木と茂み、
//   右に大きな広葉樹と苔むした石像、手前にソテツ、右下は崖で下がる。RO風の手順（docs/ro-look-method.md）で描く。
//   配置は見本の画面上の位置（u: 左0〜右1, v: 上0〜下1）で決め、カメラから地面へ投げて世界の位置にする。
//   URL: ?pitch=50&dist=17&fov=30（カメラ） ?post=0（仕上げなし）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { toon, outline, gradientMap } from '../toon.js';
import { seeded } from '../env/kit.js';
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
// 地形: 奥の台地（左の崖と奥の岩の壁）、右下へ下がる崖、道
// ======================================================================
// 奥の台地の縁（崖の下の線）。線の左側（奥）が高い
const northEdge = line([[-0.1, 0.57], [0.08, 0.56], [0.2, 0.53], [0.28, 0.45], [0.33, 0.33], [0.42, 0.3], [0.52, 0.29], [0.57, 0.2], [0.59, -0.2]]);
// 右下の崖の縁。線の右側（手前・右）が低い
const seEdge = line([[0.62, 1.2], [0.67, 0.92], [0.71, 0.8], [0.8, 0.76], [0.92, 0.73], [1.2, 0.71]]);
// 道（中心線）と、分かれ道の広場
const pathLine = line([[0.645, -0.15], [0.625, 0.1], [0.59, 0.3], [0.575, 0.45], [0.55, 0.6], [0.5, 0.72], [0.43, 0.83], [0.34, 0.95], [0.26, 1.15]]);
const clearing = at(0.55, 0.57);
// 左下へ分かれる道
const branchLine = line([[0.5, 0.7], [0.53, 0.85], [0.55, 1.15]]);
const PLATEAU = 3.8, DROP = 7;
function pathDist(x, z) { return Math.min(Math.abs(sideDist(x, z, pathLine)), Math.abs(sideDist(x, z, branchLine)) + 1.0); }
function northIn(x, z) { return -sideDist(x, z, northEdge) + (fbm(x * 0.7, z * 0.7) - 0.5) * 1.4; }
function seIn(x, z) { return sideDist(x, z, seEdge) + (fbm(x * 0.6 + 3, z * 0.6) - 0.5) * 1.0; }
function heightAt(x, z) {
  let h = (fbm(x * 0.15, z * 0.15) - 0.5) * 0.5;
  const n = northIn(x, z);
  // 崖: ほぼ垂直に上がり、途中に段（岩の層）
  h += PLATEAU * smooth(-0.3, 0.9, n) + 0.6 * smooth(1.4, 2.4, n) + (fbm(x * 0.5, z * 0.5) - 0.5) * 1.2 * smooth(0.5, 2, n);
  const s = seIn(x, z);
  h -= DROP * smooth(-0.2, 2.2, s);
  // 道はならす
  h -= smooth(2.2, 0.6, pathDist(x, z)) * 0.08;
  return h;
}

const GW = 44, GD = 40, SEG = 260;
const ground = (() => {
  const g = new THREE.PlaneGeometry(GW, GD, SEG, Math.round(SEG * GD / GW));
  g.rotateX(-Math.PI / 2); g.translate(0, 0, -6);
  const p = g.attributes.position, n = p.count;
  for (let i = 0; i < n; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const splat = new Float32Array(n * 3), shade = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i), pd = pathDist(x, z), cd = Math.hypot(x - clearing.x, z - clearing.z);
    const dirt = Math.max(smooth(1.8, 0.8, pd + (fbm(x, z) - 0.5) * 1.4), smooth(4.2, 2.2, cd + (fbm(x * 0.8, z) - 0.5) * 1.6) * 0.95);
    splat[i * 3 + 1] = dirt * (p.getY(i) < 1 && p.getY(i) > -1 ? 1 : 0);
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
      g *= mix(vec3(0.86, 0.92, 0.8), vec3(1.1, 1.08, 0.9), mac) * vec3(1.32, 1.02, 0.95); // 見本の草は黄みが強く、彩度は低め
      vec3 d = texture2D(tDirt, xz / 6.0).rgb * vec3(0.86, 1.0, 0.8); // 見本の道は黄緑がかる
      float n = (texture2D(tGrass, xz / 3.1).g - 0.45) * 0.9;
      float wd = smoothstep(0.35, 0.65, vSplat.y + n);
      vec3 col = mix(g, d, wd);
      // 急な面は岩肌（上向きの縁には苔）
      vec3 nn = normalize(vRN);
      float rk = smoothstep(0.78, 0.6, nn.y + n * 0.25);
      col = mix(col, rockTri(tRock, vRW, nn, 4.5), rk);
      diffuseColor.rgb *= col * vShade;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
})();

// ======================================================================
// 岩: 崖の面から張り出す板状の岩、奥の岩の壁、右下の崖の岩、石像
// ======================================================================
const rocks = [];
function rock(x, y, z, seed, opt, rotY = R() * 6.28) {
  const m = new THREE.Mesh(rockGeometry(seed, opt), roRockMaterial());
  m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true;
  scene.add(m); rocks.push(m); return m;
}
// 崖の面に角ばった岩の塊を埋め込む（なめらかな地形の崖を、割れた岩の塊の集まりに見せる）
// 崖の面を横切る向きに数歩ずつ進み、その場所の地形の高さに岩を置く（面に張りつく）
//   inside(x, z): 崖の内側（高い側）ほど大きくなる値。o0〜o1 の範囲を横切る
function cliffChunks(edge, inside, o0, o1, step, seed) {
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1], L = a.distanceTo(b), steps = Math.ceil(L / step), ang = Math.atan2(b.z - a.z, b.x - a.x);
    let nx = Math.sin(ang), nz = -Math.cos(ang);
    if (inside(a.x + nx, a.z + nz) < inside(a.x - nx, a.z - nz)) { nx = -nx; nz = -nz; } // 内側へ向ける
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
cliffChunks(northEdge, northIn, -0.4, 1.3, 1.0, 100);
// 右下の崖の面
cliffChunks(seEdge, (x, z) => -seIn(x, z), -2.3, 0.2, 1.1, 500);

// 見えない枝葉: 画面の外（上）の木の茂りで、地面にまだらの大きな影を落とす（見本の暗い木陰）
{
  const S = new FoliageBuilder(), Rs = seeded(31);
  for (const [u, v, y, r] of [[0.2, 0.7, 9, 2.6], [0.62, 0.22, 10, 3], [0.7, 0.4, 10, 2.6], [0.95, 0.95, 9, 3]]) {
    const p = at(u, v); S.clump('broad', new THREE.Vector3(p.x + y * sun.position.x / sun.position.y, y, p.z + y * sun.position.z / sun.position.y), r * 1.2, r * 0.6, Math.round(r * r * 14), Rs, new THREE.Color(1, 1, 1), { size: 2.2 });
  }
  const g = S.build();
  g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.colorWrite = false; o.material.depthWrite = false; o.receiveShadow = false; o.castShadow = true; } });
  scene.add(g);
}
// 石像（苔むした小さな像）: 台座・胴・頭
{
  const p = at(0.71, 0.585), y = heightAt(p.x, p.z);
  rock(p.x, y + 0.25, p.z, 901, { sx: 0.55, sy: 0.4, sz: 0.5, rough: 0.15 }, 0.3);
  rock(p.x, y + 0.85, p.z, 902, { sx: 0.38, sy: 0.6, sz: 0.36, rough: 0.12 }, 0.5);
  rock(p.x + 0.05, y + 1.45, p.z, 903, { sx: 0.24, sy: 0.26, sz: 0.24, rough: 0.08 }, 0);
}
// 道ばたの小石
for (let i = 0; i < 18; i++) {
  const p = at(0.4 + R() * 0.35, 0.35 + R() * 0.6); if (pathDist(p.x, p.z) < 1.1 || seIn(p.x, p.z) > -0.5 || northIn(p.x, p.z) > -0.5) continue;
  rock(p.x, heightAt(p.x, p.z) + 0.02, p.z, 700 + i, { sx: 0.18 + R() * 0.15, sy: 0.12, sz: 0.18, rough: 0.2, detail: 1 }).material = roRockMaterial({ flat: true, moss: 0 });
}

// ======================================================================
// 水たまり（右上、木の陰）
// ======================================================================
{
  const p = at(0.86, 0.2);
  const w = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshLambertMaterial({ color: 0x3a6a8a }));
  w.rotation.x = -Math.PI / 2; w.position.set(p.x, heightAt(p.x, p.z) + 0.12, p.z); w.receiveShadow = true; scene.add(w);
}

// ======================================================================
// 植物
// ======================================================================
const F = new FoliageBuilder(), Rf = seeded(4242);
const occupied = [];
const onGround = (u, v) => { const p = at(u, v); for (let k = 0; k < 4; k++) { const y = heightAt(p.x, p.z); const p2 = at(u, v, y); p.x = p2.x; p.z = p2.z; } p.y = heightAt(p.x, p.z); return p; };
function treeAt(u, v, opt, kind = 'tree') { const p = onGround(u, v); const r = kind === 'pine' ? F.pine(p.x, p.y, p.z, Rf, opt) : F.tree(p.x, p.y, p.z, Rf, opt); occupied.push({ x: p.x, z: p.z, r: r.r }); return p; }
// もみの木（真ん中左）
treeAt(0.355, 0.56, { size: 0.9, leaf: new THREE.Color(1.45, 1.3, 1.25) }, 'pine'); // 見本のもみは明るく黄みがかる（1 を超える色で絵を明るく）
// 右の大きな広葉樹と、その奥の木（右上を覆う）
const DARK = new THREE.Color(0.75, 0.7, 0.82); // 見本の広葉樹は暗く彩度が低い
treeAt(0.83, 0.6, { size: 0.95, trunk: 1.6, leaf: DARK });
treeAt(0.74, 0.12, { size: 1.0, leaf: DARK });
treeAt(0.95, 0.3, { size: 1.0, leaf: DARK });
treeAt(0.66, 0.0, { size: 0.9 });
// 左上（台地の上）の木
treeAt(0.06, 0.06, { size: 1.1 });
treeAt(0.0, 0.2, { size: 0.9 });
treeAt(0.14, 0.12, { size: 0.8 });
treeAt(0.2, -0.02, { size: 1.0 });
treeAt(0.42, -0.06, { size: 1.0 });
// クローバーの茂み: もみの木の根元と、石像のまわり
for (const [u, v, s] of [[0.29, 0.63, 1.2], [0.355, 0.67, 1.3], [0.42, 0.635, 1.1], [0.26, 0.57, 1.0], [0.445, 0.58, 0.7], [0.32, 0.58, 1.0],
  [0.73, 0.69, 1.1], [0.79, 0.71, 1.2], [0.85, 0.675, 1.0], [0.76, 0.75, 1.0], [0.89, 0.71, 0.9]]) {
  const p = onGround(u, v); F.cloverBush(p.x, p.y, p.z, Rf, { size: s });
}
// ソテツ（手前）と右端・左上
for (const [u, v, s, t] of [[0.42, 0.885, 1.15, 1.2], [0.985, 0.72, 0.7, 0.6], [0.03, 0.66, 0.6, 0.4]]) { const p = onGround(u, v); F.cycad(p.x, p.y, p.z, Rf, { size: s, trunk: t }); }
// 黄色い花（人物の左）
{
  const p = onGround(0.455, 0.575);
  for (let i = 0; i < 9; i++) F.tuft(p.x + (Rf() - 0.5) * 0.7, p.y, p.z + (Rf() - 0.5) * 0.5, Rf, { size: 2.0 + Rf() * 0.6, col: new THREE.Color(1.6, 1.4, 0.5) });
}
// シダ: 崖の下と木の根元
for (let i = 0; i < 90; i++) {
  const p = at(R() * 1.1 - 0.05, R() * 1.1 - 0.05); const y = heightAt(p.x, p.z);
  const nIn = northIn(p.x, p.z), sIn = seIn(p.x, p.z);
  const nearCliff = nIn > -2.2 && nIn < -0.4, top = nIn > 2.5;
  if (pathDist(p.x, p.z) < 2 || sIn > -0.6 || (!nearCliff && !top && R() > 0.25)) continue;
  F.fern(p.x, y, p.z, Rf, { size: 0.55 + R() * 0.35 });
}
// 草の房: 道の縁に多く、全体にまばら。崖の面と道の上は避ける
const sunC = new THREE.Color(1.25, 1.12, 0.9), shadeC = new THREE.Color(0.95, 0.95, 0.8); // 見本の草の房は黄みが強い
for (let i = 0; i < 26000; i++) {
  const x = lerp(-16, 16, R()), z = lerp(-22, 9, R()), y = heightAt(x, z);
  const pd = pathDist(x, z), nIn = northIn(x, z), sIn = seIn(x, z);
  if (pd < 1.6 || Math.hypot(x - clearing.x, z - clearing.z) < 3.2) continue;
  if ((nIn > -0.4 && nIn < 2.0) || (sIn > -0.4 && sIn < 1.4)) continue; // 崖の面
  const edge = smooth(2.6, 1.2, pd), clump = vnoise(x * 0.35, z * 0.35), keep = 0.02 + clump * 0.1 + edge * 0.3;
  if (R() > keep) continue;
  const sh = occupied.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r);
  F.tuft(x, y, z, Rf, { size: 0.8 + R() * 0.5 + edge * 0.3, col: sh ? shadeC : sunC });
}
scene.add(F.build());

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
  const p = onGround(0.48, 0.6); w.position.copy(p); w.rotation.y = 0.3;
  scene.add(w);
}

// ======================================================================
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); tilt.uniforms.res.value.set(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  FOLIAGE_U.uTime.value = clock.elapsedTime;
  if (q.get('post') === '0') renderer.render(scene, camera); else composer.render();
});
window.__ready = true;
