// 地形エリア「ひだまりの谷」（1階の草原）の見た目。env/terrain.js が組み立てる（proto/stage.html でも単体で見られる）
//
// 地形（北が -z）:
//   南  … 入口の草地となだらかな丘（風車の丘）。中央の広い草地が戦う場所
//   中央 … 西から東へ蛇行する川。石橋が1つ。川沿いに葦と砂利
//   北  … 川から林の斜面を上がると、崖で切り立った台地（+8m）。崖の切れ目の坂道から上がれる。台地の縁に崩れた見張り塔
//   東  … さらに高い岩山（+15m）から滝が落ちて、滝つぼの池から川へ
//   西  … 小高い丘の上に古い大樹
//   遠景 … 重なる山並みと、北の空に浮かぶ迷宮区の塔
import * as THREE from 'three';
import { toon, glow, outline, Batch } from '../toon.js';
import { local, I, seeded } from './kit.js';
import { makeProp } from './props.js';
import { makeSky } from './landmarks.js';
import { W, D, WATER, ss, lerp, riverZ, cliffZ, RAMP, BLUFF, POND, KNOLL, MILL, groundAt, heightAt as walkAt, PATHS, pathDist, BRIDGE } from '../../shared/terrain/meadow.js';
import { motes } from '../models/bosses/fx-parts.js';

// 地形の形（高さ・川・崖・道）はサーバーと共通（shared/terrain/meadow.js）。ここは見た目だけ
const heightAt = groundAt; // 物を置く高さは地面（橋の上ではない）
// ---- 組み立て ---------------------------------------------------------------
export function buildMeadow(opts = {}) {
  const group = new THREE.Group();
  const anims = [];
  const R = seeded(20261016);
  const fdef = { skyTop: 0x5aa8ff, skyBot: 0xd8f0ff, sun: 0xfff1d6, fog: 0xc8e6ff, n: 1, props: [['tree', 0, 0x3f8f3a, 0x6b4a2a], ['rock', 0, 0x8f9298], ['flower', 0, 0xffe36b, 0xff8fb3]] };
  group.add(makeSky(fdef, false));

  // 地形のメッシュ: 傾き・高さ・水辺・道で塗り分け。崖は岩の縞
  const NX = 330, NZ = 255;
  const geo = new THREE.PlaneGeometry(W + 120, D + 120, NX, NZ); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const C = {
    grass: new THREE.Color(0x5c9a3e), grass2: new THREE.Color(0x86bd55), forest: new THREE.Color(0x3d6a2c), sunny: new THREE.Color(0xa9c95e),
    rock: new THREE.Color(0x8a8378), rock2: new THREE.Color(0xa49c8e), dirt: new THREE.Color(0x9c8460), sand: new THREE.Color(0xcdbb8a), mud: new THREE.Color(0x6f6650),
  };
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), slope = 1 - nrm.getY(i);
    const k = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.cos(z * 0.05) * 2) * Math.cos(z * 0.06);
    tmp.copy(C.grass).lerp(C.grass2, k * 0.7 + R() * 0.1);
    if (z < riverZ(x) - 3 && z > cliffZ(x) - 2) tmp.lerp(C.forest, 0.45); // 林の斜面
    if (y > 2.5 && slope < 0.15) tmp.lerp(C.sunny, Math.min(0.4, (y - 2.5) * 0.08)); // 高いところは日当たりよく
    const pd = pathDist(x, z);
    if (pd < 2.8) tmp.lerp(C.dirt, pd < 1.8 ? 0.85 : 0.45);
    if (y < WATER + 0.9) tmp.lerp(y < WATER + 0.2 ? C.mud : C.sand, ss(WATER + 0.9, WATER + 0.2, y));
    if (slope > 0.28) { // 崖: 高さで縞
      const band = 0.5 + 0.5 * Math.sin(y * 2.4 + Math.sin(x * 0.3) * 0.8);
      tmp.copy(C.rock).lerp(C.rock2, band).multiplyScalar(0.92 + R() * 0.08);
      if (slope < 0.42) tmp.lerp(C.forest, 0.35);
    }
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, noOcc: true }));
  ground.receiveShadow = true; group.add(ground);

  group.add(makeWater(anims));
  const B = new Batch();
  vegetation(B, R, fdef);
  landmarks(B, group, anims, R);
  group.add(B.build());
  const grass = makeGrassField(R); group.add(grass.mesh);
  group.add(farLands(fdef, R, anims));
  // 花畑の蝶・林の木漏れ日・滝のしぶき
  ambience(group, anims, R);

  return {
    group, heightAt: walkAt, fdef,
    light: { hemi: 1.15, sun: 2.3, fog: 0xc8e6ff, fogNear: 60, fogFar: 230, hemiC: [0xcfe8ff, 0x3a5a2a] },
    update(t, px = 0, pz = 0) { for (const a of anims) a(t); grass.U.uTime.value = t; grass.U.uPlayer.value.set(px, pz); },
  };
}

// ---- 水（川と池）: 地形の高さを焼いたテクスチャで、浅いところを明るく、岸に泡 -------------
function makeWater(anims) {
  const N = 256, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1) - 0.5) * W, z = (j / (N - 1) - 0.5) * D;
    data[j * N + i] = Math.max(0, Math.min(255, Math.round((WATER - heightAt(x, z)) * 80)));
  }
  const depth = new THREE.DataTexture(data, N, N, THREE.RedFormat); depth.magFilter = depth.minFilter = THREE.LinearFilter; depth.needsUpdate = true;
  const U = { uTime: { value: 0 }, uDepth: { value: depth } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform sampler2D uDepth; varying vec2 vW;
      void main(){
        vec2 uv = vec2(vW.x / ${W.toFixed(1)} + 0.5, vW.y / ${D.toFixed(1)} + 0.5);
        float d = texture2D(uDepth, uv).r * 255.0 / 80.0;
        if (d <= 0.0) discard;
        vec3 shallow = vec3(0.45, 0.80, 0.78), deep = vec3(0.10, 0.36, 0.52);
        vec3 c = mix(shallow, deep, smoothstep(0.0, 1.6, d));
        float w1 = sin(vW.x * 0.9 + uTime * 1.6 + sin(vW.y * 0.7) * 2.0) * sin(vW.y * 1.1 - uTime * 1.2);
        float w2 = sin(vW.x * 2.3 - uTime * 2.1 + vW.y * 1.7);
        c += vec3(0.9, 0.95, 1.0) * smoothstep(0.82, 0.98, w1 * 0.6 + w2 * 0.4) * 0.35;
        float foam = smoothstep(0.22, 0.04, d) * (0.6 + 0.4 * sin(uTime * 2.0 + vW.x * 1.3 + vW.y));
        c = mix(c, vec3(0.95, 0.98, 1.0), foam);
        gl_FragColor = vec4(c, mix(0.72, 0.9, smoothstep(0.0, 1.2, d)) + foam * 0.1);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = WATER; m.renderOrder = 2;
  anims.push((t) => { U.uTime.value = t; });
  return m;
}

// ---- 草（風で揺れる。崖・水・道には生えない） ------------------------------------
function makeGrassField(R) {
  const blade = new THREE.BufferGeometry();
  const hs = [0, 0.35, 0.7, 1], ws = [0.07, 0.055, 0.03, 0], vp = [], vc = [], idx = [];
  const cB = new THREE.Color(0x2f6a26), cT = new THREE.Color(0xb0e478);
  hs.forEach((h, i) => { for (const s of [-1, 1]) { vp.push(s * ws[i], h, 0); const c = cB.clone().lerp(cT, h); vc.push(c.r, c.g, c.b); } });
  for (let i = 0; i < 3; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  blade.setIndex(idx);
  const U = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() } };
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime; uniform vec2 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 ip = instanceMatrix * vec4(transformed, 1.0);
      float h = position.y;
      vec2 bp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      float gust = sin(uTime * 0.7 + bp.x * 0.05 + bp.y * 0.03);
      float sway = (sin(uTime * 1.8 + bp.x * 0.3 + bp.y * 0.22) * 0.12 + gust * 0.12) ;
      ip.x += sway * h * h; ip.z += sway * 0.5 * h * h;
      vec2 d = bp - uPlayer; float dl = length(d) + 0.001;
      float push = smoothstep(1.6, 0.2, dl) * h; ip.xz += d / dl * push * 0.8; ip.y -= push * 0.35;
      vec4 mvPosition = modelViewMatrix * ip; gl_Position = projectionMatrix * mvPosition;`);
  };
  const count = 52000, inst = new THREE.InstancedMesh(blade, mat, count), col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 4; tries++) {
    const x = (R() - 0.5) * (W - 10), z = (R() - 0.5) * (D - 10), y = heightAt(x, z);
    if (y < WATER + 0.5 || pathDist(x, z) < 1.8) continue;
    const e = 0.6, sl = Math.max(Math.abs(heightAt(x + e, z) - y), Math.abs(heightAt(x, z + e) - y)) / e;
    if (sl > 0.5) continue;
    const clump = 0.5 + 0.5 * Math.sin(x * 0.4 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.35);
    if (R() > 0.3 + clump * 0.7) continue;
    const s = 0.9 * (0.55 + R() * 0.6) * (0.7 + clump * 0.5);
    inst.setMatrixAt(n, local(I, x, y - 0.02, z, 0, R() * Math.PI, 0, 1 + R() * 0.6, s, 1));
    inst.setColorAt(n, col.setHSL(0, 0, 0.82 + R() * 0.3));
    n++;
  }
  inst.count = n; inst.frustumCulled = false;
  return { mesh: inst, U };
}

// ---- 植物と岩: 場所の性格ごとに群れで置く -------------------------------------------
function vegetation(B, R, fdef) {
  const tree = [0, 0, 0x3f8f3a, 0x6b4a2a], dark = [0, 0, 0x2f6e34, 0x5a3e24], pine = [0, 0, 0x2a5c3a, 0x4a3a2a];
  const rock = [0, 0, 0x8f9298], moss = [0, 0, 0x4f7d3a, 0x6b4a2a], peb = [0, 0, 0x9a968c];
  const put = (type, x, z, s, col, tilt = 0.06) => makeProp(B, type, local(I, x, heightAt(x, z), z, tilt * (R() - 0.5), R() * Math.PI * 2, tilt * (R() - 0.5), s), R, col[2], col[3], fdef, 3);
  const slopeAt = (x, z) => { const y = heightAt(x, z), e = 0.8; return Math.max(Math.abs(heightAt(x + e, z) - y), Math.abs(heightAt(x, z + e) - y)) / e; };
  const free = (x, z, pad = 2.5) => pathDist(x, z) > pad && heightAt(x, z) > WATER + 0.6 && Math.hypot(x - 10, z + 44) > 9 && Math.hypot(x - MILL.x, z - MILL.z) > 6;
  // 林の斜面（川の北岸〜崖の足元）: 濃い林。木漏れ日のために少し隙間
  for (let i = 0; i < 520; i++) {
    const x = (R() - 0.5) * 200, z = lerp(cliffZ(x) + 2, riverZ(x) - 5, R());
    if (!free(x, z) || slopeAt(x, z) > 0.45) continue;
    if (0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.13) < 0.3) continue; // 林の中の空き地
    if (R() < 0.82) put('tree', x, z, 0.9 + R() * 0.6, R() < 0.5 ? tree : dark); else put('bush', x, z, 0.8 + R() * 0.5, dark);
  }
  // 台地の上: 針葉樹の木立と岩
  for (let g = 0; g < 14; g++) {
    const cx = (R() - 0.5) * 180, cz = cliffZ(cx) - 10 - R() * 35;
    for (let i = 0; i < 9; i++) { const x = cx + (R() - 0.5) * 14, z = cz + (R() - 0.5) * 12; if (free(x, z) && slopeAt(x, z) < 0.4 && z < cliffZ(x) - 4) put('pine', x, z, 0.9 + R() * 0.6, pine); }
    for (let i = 0; i < 3; i++) { const x = cx + (R() - 0.5) * 18, z = cz + (R() - 0.5) * 16; if (free(x, z) && z < cliffZ(x) - 3) put('rock', x, z, 1 + R() * 1.2, rock); }
  }
  // 崖の足元と縁: 崩れた岩（崖の輪郭を強める）
  for (let x = -105; x < 105; x += 3.2) {
    if (Math.abs(x - RAMP.x) < RAMP.w + 4) continue;
    const zf = cliffZ(x) + 2.5 + R() * 2.5;
    if (R() < 0.55 && free(x, zf, 2)) put('rock', x, zf, 0.9 + R() * 1.4, rock, 0.3);
    const zt = cliffZ(x) - 2.6 - R() * 1.5;
    if (R() < 0.35) put(R() < 0.5 ? 'bush' : 'rock', x, zt, 0.7 + R() * 0.6, R() < 0.5 ? dark : rock);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.12) { // 岩山の足元
    const x = BLUFF.x + Math.cos(a) * (BLUFF.r + 1) / 0.9, z = BLUFF.z + Math.sin(a) * (BLUFF.r + 1);
    if (R() < 0.6 && free(x, z, 2) && Math.abs(x) < 108 && Math.abs(z) < 82) put('rock', x, z, 1.1 + R() * 1.6, rock, 0.3);
  }
  // 南の草地: 林の群れ（外側寄り）・花畑・岩場・まばらな木。中央は広く空ける
  const open = (x, z) => Math.hypot(x - 5, z - 30) < 22; // 戦う場所
  const cluster = (cx, cz, r, fn) => { for (let i = 0; i < r * 3; i++) { const a = R() * Math.PI * 2, d = r * Math.sqrt(R()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z) && !open(x, z)) fn(x, z, 1 - d / r); } };
  const groves = [[-85, 55, 9], [-40, 64, 7], [25, 66, 8], [80, 60, 9], [92, 15, 7], [-88, 25, 8], [-30, 50, 5], [-60, 52, 6], [55, 22, 5], [-75, 8, 6], [40, 62, 5], [8, 50, 4]];
  for (const [cx, cz, r] of groves) {
    cluster(cx, cz, r, (x, z, k) => { if (R() < 0.45) put('tree', x, z, 0.8 + k * 0.8, R() < 0.6 ? tree : dark); });
    for (let i = 0; i < 10; i++) { const a = R() * 6.28, d = r * (0.9 + R() * 0.5), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z) && !open(x, z)) put('bush', x, z, 0.7 + R() * 0.6, tree); }
    for (let i = 0; i < 2; i++) { const x = cx + (R() - 0.5) * r, z = cz + (R() - 0.5) * r; if (free(x, z)) put(R() < 0.5 ? 'log' : 'stump', x, z, 1, moss); }
  }
  const beds = [[-18, 46, 6, 2], [30, 38, 5, 3], [-48, 14, 5, 3], [62, 30, 6, 2], [12, 60, 4, 3]];
  for (const [cx, cz, r, ci] of beds) for (let i = 0; i < 140; i++) {
    const a = R() * 6.28, d = r * Math.sqrt(R()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!free(x, z, 1.5)) continue;
    const c = R() < 0.88 ? fdef.props[2][ci] : fdef.props[2][5 - ci];
    put('flower', x, z, 1.2 + R() * 0.5, [0, 0, c, c], 0);
  }
  for (const [cx, cz] of [[38, 58], [-70, 50], [70, 40], [-60, 0]]) {
    put('rock', cx, cz, 2.4 + R(), rock, 0.2);
    for (let i = 0; i < 4; i++) { const x = cx + (R() - 0.5) * 6, z = cz + (R() - 0.5) * 6; if (free(x, z, 1)) put('rock', x, z, 0.8 + R() * 0.6, rock); }
    for (let i = 0; i < 14; i++) { const x = cx + (R() - 0.5) * 9, z = cz + (R() - 0.5) * 9; if (free(x, z, 1)) put('pebble', x, z, 0.7 + R(), peb); }
  }
  // 外周の山の斜面: 針葉樹の森
  for (let i = 0; i < 1400; i++) {
    const x = (R() - 0.5) * 300, z = (R() - 0.5) * 240, e = Math.max((Math.abs(x) - 92) / 26, (Math.abs(z) - 64) / 22);
    if (e < 0.02 || e > 1.3 || slopeAt(x, z) > 0.7 || heightAt(x, z) < WATER + 1) continue;
    put('pine', x, z, 1.0 + R() * 0.8, R() < 0.5 ? pine : [0, 0, 0x335f40, 0x4a3a2a]);
  }
  // 川辺: 葦と砂利
  for (let i = 0; i < 900; i++) {
    const x = (R() - 0.5) * 210, side = R() < 0.5 ? -1 : 1, z = riverZ(x) + side * (3.8 + R() * 3);
    const y = heightAt(x, z);
    if (y < WATER - 0.1 || y > WATER + 1.0 || pathDist(x, z) < 3) continue;
    if (R() < 0.6) reed(B, R, x, y, z); else put('pebble', x, z, 0.6 + R() * 0.8, peb);
  }
}
function reed(B, R, x, y, z) {
  for (let k = 0; k < 5; k++) {
    const h = 0.9 + R() * 0.9, ox = (R() - 0.5) * 0.5, oz = (R() - 0.5) * 0.5;
    B.add(new THREE.ConeGeometry(0.035, h, 3), new THREE.Color(0x6a9a40).offsetHSL(0, 0, (R() - 0.5) * 0.1), local(I, x + ox, y + h / 2, z + oz, (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3));
    if (R() < 0.35) B.add(new THREE.CapsuleGeometry(0.05, 0.22, 2, 5), 0x7a5232, local(I, x + ox, y + h * 0.9, z + oz));
  }
}

// ---- 目印: 石橋・見張り塔・坂道の柵・風車・大樹・道標・滝 -------------------------------
function landmarks(B, group, anims, R) {
  const stone = 0xb0aa9a, stoneD = 0x857f72, wood = 0x7a5a3a, woodL = 0x9a7a52;
  // 石橋（アーチ）
  {
    const z0 = riverZ(0), M = local(I, 0, WATER + 0.4, z0, 0, 0, 0);
    for (const s of [-1, 1]) {
      B.add(new THREE.TorusGeometry(5.5, 0.55, 6, 18, Math.PI), stone, local(M, s * 2.1, -1.2, 0, 0, Math.PI / 2, 0), { flat: true });
      for (let k = -4; k <= 4; k++) { const zz = k * 1.35, yy = 0.15 + 4.3 * Math.cos(zz / 5.6 * Math.PI / 2) * 0.25; B.add(new THREE.BoxGeometry(0.35, 0.9, 1.2), stoneD, local(M, s * 2.15, yy + 1.4, zz)); }
    }
    for (let k = -6; k <= 6; k++) { const zz = k * 1.0, yy = 1.6 * Math.cos(Math.min(1, Math.abs(zz) / 7) * Math.PI / 2); B.add(new THREE.BoxGeometry(4.4, 0.35, 1.0), new THREE.Color(stone).offsetHSL(0, 0, (R() - 0.5) * 0.06), local(M, 0, yy + 0.4, zz, Math.atan2(-Math.sign(zz) * 0.22, 1), 0, 0)); }
  }
  // 崩れた見張り塔（台地の縁。遠くから見える）
  {
    const x = 10, z = -44, y = heightAt(x, z), M = local(I, x, y, z, 0, 0.4, 0);
    B.add(new THREE.CylinderGeometry(4.2, 4.6, 1.2, 12), stoneD, local(M, 0, 0.4, 0), { flat: true });
    for (let k = 0; k < 7; k++) {
      const h = [9, 12, 7, 4, 10.5, 2.5, 8][k];
      for (let j = 0; j < 14; j++) {
        const a = j / 14 * Math.PI * 2;
        if (j > 9 && k > 3) continue; // 崩れて欠けた側
        B.add(new THREE.BoxGeometry(1.75, 1.6, 0.9), new THREE.Color(stone).offsetHSL(0, 0, (R() - 0.5) * 0.08), local(M, Math.sin(a) * 3.4, 1.8 + k * 1.6, Math.cos(a) * 3.4, 0, a + (k % 2) * 0.22, 0), { flat: true });
      }
      void h;
    }
    B.add(new THREE.BoxGeometry(1.4, 2.4, 0.3), 0x3a2a1a, local(M, 0, 2.3, 3.5));
    for (let k = 0; k < 9; k++) B.add(new THREE.BoxGeometry(1.2 + R(), 0.9, 1 + R()), stone, local(M, 4 + R() * 4, 0.3, -2 + R() * 6, R(), R() * 3, R()), { flat: true });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4, 8, 1), toon(0xc0504a, { side: THREE.DoubleSide }));
    const pole = new THREE.Vector3(x + 0.5, y + 13.6, z);
    B.add(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), wood, local(I, pole.x, pole.y, pole.z));
    flag.position.set(pole.x + 1.2, pole.y + 1.2, pole.z); group.add(flag);
    const fp = flag.geometry.attributes.position, base = fp.array.slice();
    anims.push((t) => { for (let i = 0; i < fp.count; i++) { const u = base[i * 3] + 1.2; fp.setZ(i, Math.sin(t * 5 - u * 2.5) * 0.18 * u); } fp.needsUpdate = true; });
  }
  // 坂道の柵と杭
  for (let z = -26; z > -44; z -= 2.2) for (const s of [-1, 1]) {
    const x = RAMP.x + s * 3.4, y = heightAt(x, z);
    B.add(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6), wood, local(I, x, y + 0.55, z));
    B.add(new THREE.BoxGeometry(0.08, 0.1, 2.3), woodL, local(I, x, y + 0.85, z - 1.1, Math.atan2(heightAt(x, z - 2.2) - y, 2.2), 0, 0));
  }
  // 風車の丘
  {
    const y = heightAt(MILL.x, MILL.z), M = local(I, MILL.x, y, MILL.z, 0, -0.5, 0);
    B.add(new THREE.CylinderGeometry(2.2, 3.0, 8, 8), 0xe8dcc4, local(M, 0, 4, 0), { flat: true });
    B.add(new THREE.ConeGeometry(3.0, 3, 8), 0x9a4a3a, local(M, 0, 9.5, 0), { flat: true });
    B.add(new THREE.BoxGeometry(1.4, 2.2, 0.2), 0x5a3a20, local(M, 0, 1.1, 2.9));
    const hub = new THREE.Group(); hub.position.set(MILL.x + Math.sin(-0.5) * 3.2, y + 7.4, MILL.z + Math.cos(-0.5) * 3.2); hub.rotation.y = -0.5;
    const blades = new THREE.Group(); hub.add(blades);
    const bm = toon(0xd8c8a8), fm = toon(0x7a5a3a);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6.5, 0.2), fm); spar.position.y = 3.3; arm.add(spar);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5, 0.06), bm); sail.position.set(0.85, 3.8, 0); arm.add(sail);
      blades.add(arm);
    }
    outline(hub, 1); group.add(hub);
    anims.push((t) => { blades.rotation.z = t * 0.6; });
  }
  // 西の丘の大樹と石のベンチ
  {
    const x = KNOLL.x, z = KNOLL.z;
    makeProp(B, 'tree', local(I, x, heightAt(x, z), z, 0, 0.7, 0, 3.0), R, 0x4a9a3a, 0x6a4628, { n: 1 }, 3);
    for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(2, 0.3, 0.6), stone, local(I, x + s * 4, heightAt(x + s * 4, z + 3) + 0.5, z + 3, 0, s * 0.4, 0));
  }
  // 中央の道標
  {
    const x = -1, z = 33, y = heightAt(x, z);
    B.add(new THREE.CylinderGeometry(0.13, 0.16, 2.8, 6), wood, local(I, x, y + 1.4, z));
    [[0, -1], [1, -0.3], [-1, 0.1]].forEach(([dx, dz], i) => B.add(new THREE.BoxGeometry(0.08, 0.32, 1.4), woodL, local(I, x, y + 2.5 - i * 0.4, z, 0, Math.atan2(dx, dz), 0).multiply(local(I, 0, 0, 0.6))));
  }
  // 道沿いの石の杭（ところどころ）
  for (const p of PATHS) for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], L = Math.hypot(bx - ax, bz - az);
    for (let d = 3; d < L; d += 7) {
      if (R() < 0.4) continue;
      const t = d / L, nx = -(bz - az) / L, nz = (bx - ax) / L, s = R() < 0.5 ? -1 : 1;
      const x = ax + (bx - ax) * t + nx * s * 2.8, z = az + (bz - az) * t + nz * s * 2.8, y = heightAt(x, z);
      if (y < WATER + 0.4) continue;
      B.add(new THREE.BoxGeometry(0.35, 0.7 + R() * 0.4, 0.3), stoneD, local(I, x, y + 0.3, z, (R() - 0.5) * 0.2, R() * 3, (R() - 0.5) * 0.2), { flat: true });
    }
  }
  // 滝: 岩山の縁から滝つぼへ
  {
    const top = new THREE.Vector3(POND.x + 7, 0, POND.z - 9), bot = new THREE.Vector3(POND.x + 3, WATER, POND.z - 3);
    top.y = heightAt(top.x, top.z) + 0.2;
    const U = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vU;
        void main(){
          float s = sin(vU.x * 40.0 + sin(vU.x * 13.0) * 2.0) * 0.5 + 0.5;
          float f = fract(vU.y * 3.0 + uTime * 1.6 + s * 0.3);
          vec3 c = mix(vec3(0.55, 0.82, 0.95), vec3(1.0), smoothstep(0.55, 0.95, f) * (0.5 + 0.5 * s));
          float edge = smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x);
          gl_FragColor = vec4(c, (0.75 + 0.2 * s) * edge);
        }`,
    });
    const geo = new THREE.PlaneGeometry(5, 1, 1, 24), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { // 上で前へ張り出し、下へ落ちる弧
      const v = 0.5 - p.getY(i), x = p.getX(i);
      const y = lerp(top.y, bot.y, v * v), out = Math.sin(v * Math.PI) * 1.5 + v * 0.5;
      p.setXYZ(i, lerp(top.x, bot.x, v) + x * 0.95, y, lerp(top.z, bot.z, v) + out);
    }
    geo.computeVertexNormals();
    const fall = new THREE.Mesh(geo, mat); fall.renderOrder = 3; group.add(fall);
    anims.push((t) => { U.uTime.value = t; });
    const mist = motes(70, 0xffffff, 0.9, (i, t, v) => {
      const k = (i * 0.137 + t * 0.35) % 1, a = i * 2.4;
      v.set(bot.x + Math.sin(a) * (0.5 + k * 3), WATER + 0.2 + k * 2.5, bot.z + Math.cos(a) * (0.5 + k * 3));
    });
    mist.material.opacity = 0.35; group.add(mist); anims.push((t) => mist.update(t));
    // 池の睡蓮
    for (let k = 0; k < 10; k++) {
      const a = R() * 6.28, d = 2 + R() * (POND.r - 3), x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
      B.add(new THREE.CircleGeometry(0.45 + R() * 0.25, 10, 0.3, Math.PI * 1.8), 0x4a8a3a, local(I, x, WATER + 0.03, z, -Math.PI / 2, 0, R() * 6));
      if (R() < 0.4) B.add(new THREE.SphereGeometry(0.14, 8, 6), 0xffd0e0, local(I, x, WATER + 0.12, z));
    }
  }
}

// ---- 遠景: 重なる山並み・浮遊島・迷宮区の塔 ----------------------------------------
function farLands(fdef, R, anims) {
  const far = new THREE.Group(), fogC = new THREE.Color(0xc8e6ff);
  const mat = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(fogC, k), fog: false });
  for (let ring = 0; ring < 3; ring++) {
    const m = mat(ring ? 0x6a8aa0 : 0x5a8a6a, 0.35 + ring * 0.18);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2 + R() * 0.15, d = 270 + ring * 70 + R() * 25, s = 40 + R() * 30 + ring * 12;
      const h = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), m);
      h.position.set(Math.cos(a) * d, -4, Math.sin(a) * d * 0.85); h.scale.set(s, 25 + R() * 35 + ring * 25, s * 0.8); h.position.y += h.scale.y / 2 - 6;
      far.add(h);
    }
  }
  // 迷宮区の塔（北の空）
  const tw = new THREE.Group(); tw.position.set(-20, 0, -260);
  const st = mat(0xbcb8d0, 0.35), rf = mat(0x5a5a8a, 0.35);
  const part = (g, m, y) => { const o = new THREE.Mesh(g, m); o.position.y = y; tw.add(o); };
  part(new THREE.CylinderGeometry(10, 15, 120, 12), st, 60);
  for (let k = 1; k < 5; k++) part(new THREE.CylinderGeometry(13 - k, 13 - k, 2.5, 12), rf, k * 24);
  part(new THREE.ConeGeometry(12, 30, 12), rf, 135);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 10), glow(new THREE.Color(0x9ad8ff).multiplyScalar(1.7))); beacon.material.fog = false; beacon.position.y = 156; tw.add(beacon);
  far.add(tw); anims.push((t) => beacon.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15));
  // 浮遊島
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, d = 200 + R() * 80, g = new THREE.Group(); g.position.set(Math.cos(a) * d, 45 + R() * 40, Math.sin(a) * d); g.scale.setScalar(8 + R() * 8);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 8), mat(0x7a6a50, 0.45)); c1.rotation.x = Math.PI; c1.position.y = -0.9;
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1, 0.2, 10), mat(0x5a9a3a, 0.4));
    g.add(c1, c2); far.add(g);
  }
  far.traverse((o) => { o.castShadow = o.receiveShadow = false; });
  return far;
}

// ---- 空気: 蝶・木漏れ日・舞う花びら ---------------------------------------------
function ambience(group, anims, R) {
  const beds = [[-18, 46, 6], [30, 38, 5], [-48, 14, 5], [62, 30, 6], [12, 60, 4]];
  const fly = motes(beds.length * 6, 0xfff0b0, 0.4, (i, t, v) => {
    const [cx, cz, r] = beds[i % beds.length], a = t * (0.6 + (i % 5) * 0.1) + i * 2.3, rr = r * (0.4 + (i % 3) * 0.25);
    v.set(cx + Math.sin(a) * rr, heightAt(cx, cz) + 0.9 + Math.abs(Math.sin(t * 5 + i)) * 0.5, cz + Math.cos(a * 1.3) * rr);
  });
  group.add(fly); anims.push((t) => fly.update(t));
  const shaftM = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (let k = 0; k < 14; k++) {
    const x = (R() - 0.5) * 180, z = lerp(cliffZ(x) + 4, riverZ(x) - 6, R());
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2 + R() * 2, 16), shaftM.clone());
    sh.position.set(x, heightAt(x, z) + 7, z); sh.rotation.set(0, R() * Math.PI, 0.35); group.add(sh);
    anims.push((t) => { sh.material.opacity = 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.5 + k)); });
  }
  const petals = motes(120, 0xffd0e0, 0.22, (i, t, v) => {
    const k = (i * 0.0831 + t * 0.04) % 1, x = -100 + k * 200 + Math.sin(i) * 10, z = -20 + (i % 13) * 7 + Math.sin(t + i) * 2;
    v.set(x, heightAt(x, z) + 1.5 + Math.sin(t * 2 + i) * 0.8 + (i % 5) * 0.5, z);
  });
  group.add(petals); anims.push((t) => petals.update(t));
}
