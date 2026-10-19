// RO風の岩と崖（実験）: 明るい灰色の岩肌に割れ目を描いた模様を、向きによらず貼る（三方向から投影）。
//   上を向いた面には苔をのせる。岩の塊は、球をノイズで凸凹にした形。地形の急な面にも同じ岩肌を使う
import * as THREE from 'three';
import { seeded } from '../env/kit.js';
import { PAINT } from './ro-style.js';

let rockTex = null;
// 岩肌: 明暗のまだら、層のような横の割れ目と縦の割れ目、割れ目の上側の明るい縁
export function rockTexture() {
  if (rockTex) return rockTex;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = seeded(9071);
  g.fillStyle = '#cdd2b6'; g.fillRect(0, 0, S, S);
  const wrap = (x, y, r, f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (Math.abs(x + dx - S / 2) < S / 2 + r && Math.abs(y + dy - S / 2) < S / 2 + r) f(x + dx, y + dy); };
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 80, c = ['#9ea29a', '#c8cac0', '#949890', '#bec2b6', '#a6ac9a'][Math.floor(R() * 5)];
    wrap(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, c + 'aa'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
  }
  // 割れ目: 横に長い層の線と、短い縦の線。下側に暗い影、上側に明るい縁
  const crack = (pts, w) => {
    for (const [col, dy, lw] of [['rgba(250,250,240,0.4)', -2, w * 0.9], ['rgba(80,84,76,0.45)', 0, w * 0.8], ['rgba(90,94,86,0.25)', 3, w * 3]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = g.lineCap = 'round';
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x + ox, y + oy + dy) : g.moveTo(x + ox, y + oy + dy))); g.stroke(); }
    }
  };
  for (let i = 0; i < 9; i++) {
    let x = R() * S, y = R() * S; const pts = [[x, y]], n = 5 + Math.floor(R() * 6);
    for (let k = 0; k < n; k++) { x += 25 + R() * 45; y += (R() - 0.5) * 30; pts.push([x, y]); }
    crack(pts, 3 + R() * 2);
    // 層の線から下へ短い縦の割れ目
    for (let k = 1; k < pts.length - 1; k += 2) { const [px, py] = pts[k]; crack([[px, py], [px + (R() - 0.5) * 14, py + 20 + R() * 40], [px + (R() - 0.5) * 20, py + 40 + R() * 50]], 2 + R() * 1.5); }
  }
  // 細かい点（ざらつき）
  for (let i = 0; i < 3000; i++) { g.fillStyle = R() < 0.5 ? 'rgba(80,78,70,0.18)' : 'rgba(255,255,245,0.2)'; g.fillRect(R() * S, R() * S, 2, 2); }
  rockTex = new THREE.CanvasTexture(cv); rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping; rockTex.colorSpace = THREE.SRGBColorSpace; rockTex.anisotropy = 4;
  return rockTex;
}

// 三方向投影で岩肌を貼り、上向きの面に苔（草の模様）をのせる部品。fragment の色にかける
export const ROCK_GLSL = `
  vec3 rockTri(sampler2D t, vec3 p, vec3 n, float sc) {
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return texture2D(t, p.zy / sc).rgb * w.x + texture2D(t, p.xz / sc).rgb * w.y + texture2D(t, p.xy / sc).rgb * w.z;
  }
  vec3 rockMoss(sampler2D tr, sampler2D tg, vec3 p, vec3 n, float mossAmt) {
    vec3 rc = rockTri(tr, p, n, 4.5);
    vec3 mc = texture2D(tg, p.xz / 5.0).rgb * vec3(0.92, 1.0, 0.82);
    float nz = texture2D(tg, p.xz / 2.3 + p.y * 0.1).g;
    float m = smoothstep(0.35, 0.75, n.y + (nz - 0.5) * 0.9) * mossAmt;
    return mix(rc, mc, m);
  }
`;

// 岩の材質（頂点色で明るさを少し変えられる）
const rockMats = {};
// flat: 面ごとに陰影を分ける（角ばった岩の塊）
export function roRockMaterial({ flat = false, moss = 1 } = {}) {
  const key = flat + ':' + moss;
  if (rockMats[key]) return rockMats[key];
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: flat });
  const U = { tRock: { value: rockTexture() }, tGrassR: { value: PAINT.grass() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vRW; varying vec3 vRN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRW = (modelMatrix * vec4(position, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'uniform sampler2D tRock; uniform sampler2D tGrassR; varying vec3 vRW; varying vec3 vRN;\n' + ROCK_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
      diffuseColor.rgb *= rockMoss(tRock, tGrassR, vRW, normalize(vRN), ${moss.toFixed(2)});`);
  };
  m.customProgramCacheKey = () => 'ro-rock' + key;
  return (rockMats[key] = m);
}

// 割れた岩の塊: 箱を少しだけ丸め、面をノイズで傾ける。平らな面と鋭い角が残る（崖の層・割れた岩）
export function blockGeometry(seed, { sx = 1, sy = 1, sz = 1, round = 0.35, rough = 0.3 } = {}) {
  const g = new THREE.BoxGeometry(2, 2, 2, 2, 2, 2), p = g.attributes.position, R = seeded(seed);
  const cut = Array.from({ length: 5 }, () => [new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.8, R() - 0.5).normalize(), 0.7 + R() * 0.25]); // 角を斜めに切り落とす面
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    w.copy(v).normalize().multiplyScalar(Math.sqrt(3) * 0.8);
    v.lerp(w, round);
    for (const [d, c] of cut) { const k = v.dot(d) - c * 1.2; if (k > 0) v.addScaledVector(d, -k); }
    const n = Math.sin(v.x * 2.1 + seed) * Math.cos(v.z * 1.7 + seed * 0.3) + Math.sin(v.y * 2.7 + seed * 0.7) * 0.6;
    v.multiplyScalar(1 + n * rough * 0.5);
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const c = new Float32Array(ng.attributes.position.count * 3).fill(1); ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return ng;
}
// 岩の塊: 球を低い周波数のノイズで凸凹にし、平たくつぶす。下を地面に埋めて使う
export function rockGeometry(seed, { sx = 1, sy = 0.7, sz = 1, rough = 0.28, detail = 3, flatTop = true } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, R = seeded(seed);
  const waves = Array.from({ length: 6 }, () => [new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), 1.5 + R() * 3, R() * 6.28, 0.3 + R() * 0.7]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1;
    for (const [d, f, ph, a] of waves) k += Math.sin(v.dot(d) * f + ph) * rough * a / 3;
    // 上を少し平らに（板状の岩）
    v.multiplyScalar(k); if (flatTop && v.y > 0.35) v.y = 0.35 + (v.y - 0.35) * 0.55;
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  const c = new Float32Array(p.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
