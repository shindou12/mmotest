// 葉の板を重ねた植物（実験）: 木・茂み・シダ・草の房・針葉樹
//   葉は「葉っぱの房を描いた絵（透明の抜きつき）」を小さな板に貼り、たくさん重ねて形を作る。
//   板の法線は茂みの中心から外向きにそろえる（丸い茂みとしてやわらかく陰影がつく）。
//   抜きのある影を落とすので、地面に木漏れ日の影ができる。絵はどれもコードで描く（画像のアセットはいらない）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from '../env/kit.js';
import { OCC } from '../toon.js';

// ---------------------------------------------------------------------------
// 絵（2×2 のマスに、形違いを4つ）。白黒ではなく緑で描き、頂点色で木ごとの色に寄せる
// ---------------------------------------------------------------------------
const texCache = {};
function atlas(key, cell, draw) {
  if (texCache[key]) return texCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = cell * 2;
  const g = cv.getContext('2d');
  for (let i = 0; i < 4; i++) { g.save(); g.translate((i % 2) * cell, Math.floor(i / 2) * cell); g.beginPath(); g.rect(0, 0, cell, cell); g.clip(); draw(g, cell, seeded(i * 131 + key.length * 7), i); g.restore(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return (texCache[key] = t);
}
// 星形の葉（5つにとがった葉）。中心から明るい葉脈
function starLeaf(g, x, y, r, rot, fill, vein) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = fill; g.beginPath();
  const n = 5;
  for (let k = 0; k <= n * 2; k++) {
    const a = -Math.PI / 2 + k * Math.PI / n, rr = k % 2 ? r * 0.42 : r * (k === 0 || k === n * 2 ? 1 : 0.8 + (k % 4) * 0.05);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py); else g.quadraticCurveTo(Math.cos(a - Math.PI / n / 2) * rr * 0.9, Math.sin(a - Math.PI / n / 2) * rr * 0.9, px, py);
  }
  g.fill();
  g.strokeStyle = vein; g.lineWidth = Math.max(1, r * 0.08);
  for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / n; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75); g.stroke(); }
  g.restore();
}
const GREENS = ['#3c7a2c', '#4e9034', '#62a63c', '#78b846', '#94ca54', '#b4dc6a'];
export const FOLIAGE_TEX = {
  // 広葉の房: 星形の葉を丸く集める。下と奥は暗く、上と手前は明るい
  broad: () => atlas('broad', 256, (g, S, R) => {
    const cx = S / 2, cy = S / 2;
    for (let i = 0; i < 24; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * S * 0.3, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
      const shade = Math.min(5, Math.max(0, Math.round(2.4 - (y - cy) / S * 5 + (R() - 0.5) * 1.6 + i / 24 * 1.8)));
      starLeaf(g, x, y, 24 + R() * 14, R() * 6.28, GREENS[shade], 'rgba(230,255,190,0.4)');
    }
  }),
  // シダ: 曲がった軸の両側に、先へ行くほど小さくなる小葉
  fern: () => atlas('fern', 256, (g, S, R, v) => {
    const len = S * 0.92, bend = 0.25 + v * 0.08;
    const P = (t) => [S * 0.5 + Math.sin(t * 2) * S * bend * t, S * 0.97 - t * len];
    for (let i = 0; i < 26; i++) {
      const t = 0.06 + i / 26 * 0.9, [x, y] = P(t), [x2, y2] = P(t + 0.02), ang = Math.atan2(y2 - y, x2 - x);
      const L = S * 0.2 * (1 - t * 0.75), c = GREENS[Math.min(5, 1 + Math.floor(t * 4 + R() * 1.5))];
      for (const s of [-1, 1]) {
        g.save(); g.translate(x, y); g.rotate(ang + s * (Math.PI / 2 - 0.35)); g.fillStyle = c;
        g.beginPath(); g.ellipse(L * 0.5, 0, L * 0.5, L * 0.16, 0, 0, 7); g.fill(); g.restore();
      }
    }
    g.strokeStyle = '#4a7a30'; g.lineWidth = 3; g.beginPath();
    for (let t = 0; t <= 1; t += 0.05) { const [x, y] = P(t); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }),
  // 草の房: 根元から扇形に広がる細い葉。根元は暗く先は明るい
  grass: () => atlas('grass', 128, (g, S, R, v) => {
    for (let i = 0; i < 26; i++) {
      const bx = S * (0.35 + R() * 0.3), a = (R() - 0.5) * 1.3, L = S * (0.55 + R() * 0.4), ex = bx + Math.sin(a) * L, ey = S - Math.cos(a) * L;
      const gr = g.createLinearGradient(bx, S, ex, ey); gr.addColorStop(0, '#3a6a28'); gr.addColorStop(1, v === 3 ? '#c8d880' : R() < 0.5 ? '#9ccc5c' : '#b4d86c');
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - 2.5, S); g.quadraticCurveTo(bx + Math.sin(a) * L * 0.5 - 1, S - Math.cos(a) * L * 0.5, ex, ey); g.quadraticCurveTo(bx + Math.sin(a) * L * 0.5 + 1, S - Math.cos(a) * L * 0.5, bx + 2.5, S); g.fill();
    }
    if (v === 2) for (let i = 0; i < 6; i++) { g.fillStyle = R() < 0.5 ? '#fff4c0' : '#ffe060'; g.beginPath(); g.arc(S * (0.3 + R() * 0.4), S * (0.15 + R() * 0.3), 3, 0, 7); g.fill(); }
  }),
  // 針葉の枝: シダのような形の枝（上から見ると星形に広がる、もみの木の枝）
  pine: () => atlas('pine', 256, (g, S, R, v) => {
    const PAL = ['#2c5a40', '#386c4a', '#4a8256', '#5e9862', '#78ae72'];
    const P = (t) => [S * 0.5 + Math.sin(t * 2.2) * S * 0.06 * (v - 1.5), S * 0.03 + t * S * 0.94];
    for (let i = 0; i < 30; i++) {
      const t = 0.04 + i / 30 * 0.94, [x, y] = P(t), L = S * 0.26 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95));
      for (const s of [-1, 1]) {
        const c = PAL[Math.min(4, Math.max(0, Math.round(3.2 - t * 2 + (R() - 0.5) * 1.6)))];
        g.save(); g.translate(x, y); g.rotate(s * (Math.PI / 2 - 0.55) + Math.PI / 2 * 0); g.fillStyle = c;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * L * 0.5, L * 0.12 - 3, s * L, L * 0.38); g.quadraticCurveTo(s * L * 0.5, L * 0.18 + 3, 0, 4); g.fill(); g.restore();
      }
    }
    g.strokeStyle = '#3a3226'; g.lineWidth = 3; g.beginPath();
    for (let t = 0; t <= 1; t += 0.05) { const [x, y] = P(t); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  }),
};

// ---------------------------------------------------------------------------
// 材質: 抜き・やわらかい陰影（裏面でも暗くしない）・風の揺れ。影も抜きの形で落とす
// ---------------------------------------------------------------------------
export const FOLIAGE_U = { uTime: { value: 0 } };
const matCache = {};
export function foliageMaterial(kind, { sway = 0.05 } = {}) {
  const key = kind + sway;
  if (matCache[key]) return matCache[key];
  const map = FOLIAGE_TEX[kind]();
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide });
  const swayV = `
    { float h = max(0.0, uv2y);
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      float w = sin(uTime * 1.6 + wp.x * 0.35 + wp.z * 0.27) + sin(uTime * 2.7 + wp.x * 1.1) * 0.35;
      transformed.x += w * ${sway.toFixed(3)} * h; transformed.z += w * ${(sway * 0.6).toFixed(3)} * h; }`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_U);
    sh.vertexShader = 'uniform float uTime; attribute float swayK;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float uv2y = swayK;' + swayV);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    // カメラと自キャラの間の葉はディザで抜く（toon.js の近景の透過と同じ uniform）
    Object.assign(sh.uniforms, OCC);
    sh.vertexShader = 'varying vec3 vOccW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vOccW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform vec3 uOccCam; uniform vec3 uOccTgt; uniform float uOccR; varying vec3 vOccW;\n` + sh.fragmentShader.replace('void main() {', `void main() {
      if (uOccR > 0.0) {
        vec3 seg = uOccTgt - uOccCam; float t = clamp(dot(vOccW - uOccCam, seg) / max(dot(seg, seg), 1e-4), 0.0, 1.0);
        float k = smoothstep(uOccR * 1.6, uOccR * 0.6, length(vOccW - (uOccCam + seg * t))) * smoothstep(0.95, 0.8, t);
        vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
        float th = (mod(q.x, 2.0) * 2.0 + mod(q.y, 2.0) + floor(q.x / 2.0) * 0.5 + floor(q.y / 2.0) * 0.25) / 4.0 + 0.06;
        if (k * 0.9 > th) discard;
      }`);
  };
  m.customProgramCacheKey = () => 'foliage' + key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_U);
    sh.vertexShader = 'uniform float uTime; attribute float swayK;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float uv2y = swayK;' + swayV);
  };
  depth.customProgramCacheKey = () => 'foliage-depth' + key;
  m.userData.depth = depth;
  return (matCache[key] = m);
}

// ---------------------------------------------------------------------------
// 形を溜める入れ物: 板（card）と幹（solid）を種類ごとに溜めて、最後に1メッシュずつにする
// ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export class FoliageBuilder {
  constructor() { this.cards = {}; this.bark = []; }
  // 板1枚: c 中心 / d 向き（法線の目安）/ size 大きさ / spin 回転 / n 陰影に使う法線 / col 色 / cell 絵のマス / sway 揺れの強さ / up 板の上下を世界の上にそろえる
  card(kind, c, d, size, spin, n, col, cell, sway = 1, { up = false, h = size } = {}) {
    const L = (this.cards[kind] ||= { pos: [], nor: [], uv: [], col: [], sw: [] });
    d = d.clone().normalize();
    let u, v;
    if (up) { u = new THREE.Vector3(0, 1, 0).cross(d).normalize(); if (u.lengthSq() < 0.01) u.set(1, 0, 0); v = d.clone().cross(u).normalize(); if (v.y < 0) v.negate(); }
    else { const a = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0); u = a.clone().cross(d).normalize(); v = d.clone().cross(u).normalize(); const cs = Math.cos(spin), sn = Math.sin(spin); const u2 = u.clone().multiplyScalar(cs).addScaledVector(v, sn); v = v.clone().multiplyScalar(cs).addScaledVector(u, -sn); u = u2; }
    const hw = size / 2, cu = (cell % 2) * 0.5, cv = Math.floor(cell / 2) * 0.5;
    const corners = up ? [[-hw, 0, 0, 0], [hw, 0, 1, 0], [hw, h, 1, 1], [-hw, h, 0, 1]] : [[-hw, -hw, 0, 0], [hw, -hw, 1, 0], [hw, hw, 1, 1], [-hw, hw, 0, 1]];
    const vs = corners.map(([a, b, tu, tv]) => ({ p: c.clone().addScaledVector(u, a).addScaledVector(v, b), t: [cu + tu * 0.5, 1 - (cv + (1 - tv) * 0.5)], k: up ? tv : 1 }));
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = vs[i];
      L.pos.push(q.p.x, q.p.y, q.p.z);
      const nn = typeof n === 'function' ? n(q.p) : n; L.nor.push(nn.x, nn.y, nn.z);
      L.uv.push(q.t[0], q.t[1]); L.col.push(col.r, col.g, col.b); L.sw.push(sway * q.k);
    }
  }
  solid(geo, color) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) { const k = 0.75 + Math.min(1, Math.max(0, (p.getY(i) - this._y0) / 2.5)) * 0.25; arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.bark.push(g);
  }
  build() {
    const group = new THREE.Group();
    for (const [kind, L] of Object.entries(this.cards)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.setAttribute('swayK', new THREE.Float32BufferAttribute(L.sw, 1));
      const sway = kind === 'grass' ? 0.12 : kind === 'fern' ? 0.06 : 0.035;
      const mat = foliageMaterial(kind, { sway });
      const mesh = new THREE.Mesh(g, mat); mesh.customDepthMaterial = mat.userData.depth;
      mesh.castShadow = kind !== 'grass'; mesh.receiveShadow = true; mesh.frustumCulled = false;
      group.add(mesh);
    }
    if (this.bark.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.bark), new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    }
    return group;
  }

  // ---- 植物 ----
  // 枝: 根元 a から先 b まで細くなる円柱
  limb(a, b, r0, r1, color) {
    const L = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, L, 7, 1, true);
    g.translate(0, L / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
    this.solid(g, color);
  }
  // 茂みの塊: 中心 c、半径 rx/ry、板の数 n。法線は塊の中心から外向き（少し上向き）
  clump(kind, c, rx, ry, n, R, base, { size = 1.6, sway = 1, light = 0.35 } = {}) {
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = 0.55 + Math.sqrt(R()) * 0.45;
      const d = V(Math.cos(a) * s, u * 0.9 + 0.15, Math.sin(a) * s).normalize();
      const p = V(c.x + d.x * rx * rr, c.y + d.y * ry * rr, c.z + d.z * rx * rr);
      const k = (d.y * 0.5 + 0.5); // 上ほど明るく黄みを帯びる
      // 奥（塊の内側）ほど暗く、上ほど明るく少し黄みに
      col.copy(base).multiplyScalar((0.5 + rr * 0.5) * (0.78 + k * light) + (R() - 0.5) * 0.1).lerp(new THREE.Color(1, 0.95, 0.72), k * 0.08);
      const nf = (q) => q.clone().sub(c).multiply(V(1 / rx, 1 / ry, 1 / rx)).add(V(0, 0.35, 0)).normalize();
      this.card(kind, p, d.clone().add(V((R() - 0.5) * 0.6, 0.2, (R() - 0.5) * 0.6)), size * (0.8 + R() * 0.45), R() * 6.28, nf, col, Math.floor(R() * 4), sway * (0.5 + d.y * 0.5));
    }
  }
  // 広葉樹: 幹と2〜4本の枝、それぞれの先に茂みの塊
  tree(x, y, z, R, { size = 1, leaf = 0xffffff, bark = 0x7a5838 } = {}) {
    this._y0 = y;
    const H = (3.2 + R() * 1.2) * size, base = V(x, y, z), top = V(x + (R() - 0.5) * 0.6 * size, y + H, z + (R() - 0.5) * 0.6 * size);
    const bc = new THREE.Color(bark).offsetHSL(0, 0, (R() - 0.5) * 0.05), lc = new THREE.Color(leaf).multiplyScalar(0.92 + R() * 0.12);
    this.limb(base.clone().add(V(0, -0.3, 0)), top, 0.32 * size, 0.16 * size, bc);
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + R(); this.limb(base, base.clone().add(V(Math.cos(a) * 0.7 * size, 0.25, Math.sin(a) * 0.7 * size)), 0.18 * size, 0.04 * size, bc); } // 根の張り
    const nb = 2 + Math.floor(R() * 3), heads = [{ p: top.clone().add(V(0, 0.6 * size, 0)), r: 2.0 * size }];
    for (let k = 0; k < nb; k++) {
      const a = k / nb * Math.PI * 2 + R(), t = 0.55 + R() * 0.3, from = base.clone().lerp(top, t);
      const to = from.clone().add(V(Math.cos(a) * (1.6 + R()) * size, (0.9 + R() * 0.8) * size, Math.sin(a) * (1.6 + R()) * size));
      this.limb(from, to, 0.13 * size, 0.05 * size, bc);
      heads.push({ p: to, r: (1.3 + R() * 0.5) * size });
    }
    for (const h of heads) this.clump('broad', h.p, h.r * 1.15, h.r * 0.85, Math.round(20 * h.r * h.r / (size * size)) + 8, R, lc, { size: 2.0 * size, sway: 1 });
    return { r: 3.2 * size, h: H };
  }
  // 針葉樹: まっすぐな幹に、垂れる枝の板を段々に
  pine(x, y, z, R, { size = 1, leaf = 0xf4fbe8 } = {}) {
    this._y0 = y;
    const H = (6 + R() * 2.5) * size, lc = new THREE.Color(leaf).multiplyScalar(0.92 + R() * 0.12);
    this.limb(V(x, y - 0.3, z), V(x, y + H, z), 0.26 * size, 0.05 * size, 0x6a4c34);
    const col = new THREE.Color(), tiers = 9;
    for (let t = 0; t < tiers; t++) {
      const k = t / tiers, yy = y + H * (0.22 + k * 0.78), rad = (2.3 * (1 - k) + 0.35) * size, n = Math.round(9 - k * 5);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + t * 0.7 + R() * 0.4, d = V(Math.cos(a), -0.15, Math.sin(a));
        col.copy(lc).multiplyScalar(0.8 + k * 0.3 + (R() - 0.5) * 0.1);
        const c = V(x + d.x * rad * 0.5, yy - 0.2 * size, z + d.z * rad * 0.5);
        const nf = (q) => V(q.x - x, (q.y - yy) * 0.6 + 0.7, q.z - z).normalize();
        // 外へ垂れる枝: 板の面を斜め下向きに倒す
        this.card('pine', c, V(d.x * 0.35, 1, d.z * 0.35), rad * 1.2, a + Math.PI / 2, nf, col, Math.floor(R() * 4), 0.6);
        this.card('pine', c.clone().add(V(0, 0.15, 0)), V(-d.z, 0.25, d.x), rad * 1.0, 0, nf, col.clone().multiplyScalar(0.92), Math.floor(R() * 4), 0.6);
      }
    }
    return { r: 2.4 * size, h: H };
  }
  // 茂み（低木）
  bush(x, y, z, R, { size = 1, leaf = 0xe8f4dc } = {}) {
    const r = (0.8 + R() * 0.6) * size;
    this.clump('broad', V(x, y + r * 0.55, z), r * 1.1, r * 0.75, Math.round(14 * r * r) + 6, R, new THREE.Color(leaf).multiplyScalar(0.9 + R() * 0.15), { size: 1.2 * size, sway: 0.7, light: 0.3 });
  }
  // シダ: 根元から放射状に垂れる葉
  fern(x, y, z, R, { size = 1 } = {}) {
    const n = 6 + Math.floor(R() * 4), col = new THREE.Color(0xf0fae8).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + R() * 0.5, tilt = 0.55 + R() * 0.35, L = (1.0 + R() * 0.5) * size;
      const d = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const side = V(-Math.sin(a), 0, Math.cos(a));
      const nrm = d.clone().cross(side).normalize(); if (nrm.y < 0) nrm.negate();
      this.card('fern', V(x, y, z), nrm, L * 0.8, 0, nrm.clone().add(V(0, 0.8, 0)).normalize(), col.clone().multiplyScalar(0.9 + R() * 0.15), Math.floor(R() * 4), 0.8, { up: true, h: L });
    }
  }
  // 草の房: 十字に組んだ2枚の板
  tuft(x, y, z, R, { size = 1, col = new THREE.Color(0xffffff) } = {}) {
    const a = R() * Math.PI, h = (0.55 + R() * 0.4) * size, w = h * 1.25, cell = R() < 0.08 ? 2 : R() < 0.15 ? 3 : Math.floor(R() * 2);
    for (const da of [0, Math.PI / 2]) {
      const d = V(Math.cos(a + da), 0, Math.sin(a + da));
      this.card('grass', V(x, y - 0.03, z), d, w, 0, V(0, 1, 0), col, cell, 1, { up: true, h });
    }
  }
}
