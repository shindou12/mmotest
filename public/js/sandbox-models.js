// 箱庭: 作り直したモデル（岩・広葉樹・針葉樹・木組みの家）。積み木（球・箱をそのまま置く）ではなく、
// 形を崩し・削り・曲げて作る。どれも頂点色つきの1つのメッシュにまとめ、ゲームと同じトゥーンの陰影と輪郭線を付ける
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outline } from './toon.js';

// ---- 道具 ----
export const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const hash3 = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
const fbm3 = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;

// 部品を集めて1つのメッシュにする。add(geo, 色 または (面の中心, 面の法線, 番号) => 色, 行列)
class Kit {
  constructor() { this.parts = []; }
  add(geo, color, m = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals(); // 面ごとの法線（角ばった見た目）
    const p = g.attributes.position, n = g.attributes.normal, cols = new Float32Array(p.count * 3), c = new THREE.Color(), cen = new THREE.Vector3(), nor = new THREE.Vector3();
    for (let f = 0; f < p.count; f += 3) {
      cen.set((p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3);
      nor.set(n.getX(f), n.getY(f), n.getZ(f));
      c.set(typeof color === 'function' ? color(cen, nor, f / 3) : color);
      for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.parts.push(g);
    return this;
  }
  build(width = 1) {
    const mesh = new THREE.Mesh(mergeGeometries(this.parts), toon(0xffffff, { vertexColors: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    const g = new THREE.Group(); g.add(mesh); outline(g, width);
    return g;
  }
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const jitter = (hex, R, d = 0.06) => new THREE.Color(hex).offsetHSL((R() - 0.5) * d * 0.3, (R() - 0.5) * d, (R() - 0.5) * d);

// 曲がりながら細くなる管（幹・枝・根）。path(t) → 中心、rad(t) → 太さ
function tube(path, rad, segs = 6, radial = 7) {
  const pos = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = path(t), d = path(Math.min(1, t + 0.01)).sub(path(Math.max(0, t - 0.01))).normalize();
    const a = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up.clone();
    const s1 = new THREE.Vector3().crossVectors(d, a).normalize(), s2 = new THREE.Vector3().crossVectors(d, s1).normalize();
    for (let j = 0; j < radial; j++) {
      const ang = j / radial * Math.PI * 2, r = rad(t) * (1 + (hash3(i, j, 7) - 0.5) * 0.15);
      pos.push(c.x + (s1.x * Math.cos(ang) + s2.x * Math.sin(ang)) * r, c.y + (s1.y * Math.cos(ang) + s2.y * Math.sin(ang)) * r, c.z + (s1.z * Math.cos(ang) + s2.z * Math.sin(ang)) * r);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c2 = a + radial, d2 = b + radial;
    idx.push(a, c2, b, b, c2, d2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
// 凸凹に崩した塊（岩・葉の塊）。cuts: 平らに削る面の数
function lump(seed, { detail = 2, amp = 0.3, freq = 1.4, cuts = 0, cutAt = 0.75 } = {}) {
  const R = rng(seed), g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  const planes = Array.from({ length: cuts }, () => [new THREE.Vector3(R() - 0.5, R() * 0.8 - 0.2, R() - 0.5).normalize(), cutAt + R() * 0.15]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (fbm3(v.x * freq + seed, v.y * freq, v.z * freq) - 0.5) * 2 * amp);
    for (const [n, c] of planes) { const d = v.dot(n); if (d > c) v.addScaledVector(n, c - d); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// ---- 岩: 削った面と割れ目。下は平ら、窪みは暗く、上面に苔 ----
export function makeRock(seed = 1, { color = 0x7a7f86, moss = 0x5f8f3c } = {}) {
  const R = rng(seed), K = new Kit();
  const main = lump(seed, { detail: 2, amp: 0.22, cuts: 7, cutAt: 0.62 });
  const base = new THREE.Color(color);
  const shade = (c, n) => { const k = c.clone(); if (n.y > 0.78 && R() < 0.7) return k.lerp(new THREE.Color(moss), 0.6); return k.offsetHSL(0, 0, (R() - 0.5) * 0.06 + (n.y < -0.2 ? -0.08 : n.y > 0.3 ? 0.05 : 0)); };
  K.add(main, (c, n) => shade(base, n), M(0, 0.45, 0, 0, R() * 6, 0, 1.25, 0.8, 1.05));
  for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
    const a = R() * Math.PI * 2, d = 1.1 + R() * 0.5, s = 0.25 + R() * 0.3;
    K.add(lump(seed + 11 * k, { detail: 1, amp: 0.2, cuts: 4, cutAt: 0.6 }), (c, n) => shade(base, n), M(Math.cos(a) * d, s * 0.5, Math.sin(a) * d, R(), R() * 6, R(), s, s * 0.8, s));
  }
  return K.build(1); // 下は地面に少し埋めて、置いた感じを出す
}

// ---- 広葉樹: 曲がった幹・張った根・枝・凸凹の葉の塊（下は暗く上は明るい） ----
export function makeTree(seed = 1, { leaf = 0x3f8a46, bark = 0x6b4a32, height = 1 } = {}) {
  const R = rng(seed), K = new Kit(), H = 3.8 * height, lean = (R() - 0.5) * 0.5;
  const trunkPath = (t) => new THREE.Vector3(Math.sin(t * 2.2 + seed) * 0.25 + lean * t * t, t * H, Math.cos(t * 1.7 + seed) * 0.15);
  const barkC = (c, n, i) => jitter(bark, R, 0.08).offsetHSL(0, 0, (i % 3 === 0 ? -0.04 : 0));
  K.add(tube(trunkPath, (t) => 0.38 * (1 - t * 0.55) + (t < 0.12 ? (0.12 - t) * 2.5 : 0), 8, 8), barkC);
  for (let k = 0; k < 5; k++) { // 根
    const a = k / 5 * Math.PI * 2 + R(), L = 0.9 + R() * 0.5;
    K.add(tube((t) => new THREE.Vector3(Math.cos(a) * t * L, 0.35 * (1 - t) ** 2 - 0.05, Math.sin(a) * t * L), (t) => 0.16 * (1 - t) + 0.02, 4, 5), barkC);
  }
  const tips = [trunkPath(1)];
  for (let k = 0; k < 3 + Math.floor(R() * 2); k++) { // 枝
    const t0 = 0.55 + R() * 0.3, base = trunkPath(t0), a = k / 4 * Math.PI * 2 + R(), L = 1.2 + R() * 0.8;
    const pth = (t) => new THREE.Vector3(base.x + Math.cos(a) * t * L, base.y + t * L * 0.75 + Math.sin(t * 3) * 0.1, base.z + Math.sin(a) * t * L);
    K.add(tube(pth, (t) => 0.13 * (1 - t * 0.7), 4, 5), barkC);
    tips.push(pth(1));
  }
  const lc = new THREE.Color(leaf), top = H + 1.2;
  tips.forEach((tp, k) => { // 葉の塊（枝先と幹の上）
    const s = (k === 0 ? 1.3 : 0.95) + R() * 0.3, hue = (R() - 0.5) * 0.03;
    K.add(lump(seed * 7 + k, { detail: 1, amp: 0.28, freq: 1.8, cuts: 2, cutAt: 0.85 }), (c, n) => lc.clone().offsetHSL(hue, 0.02, -0.17 + Math.max(0, Math.min(1, c.y / top)) * 0.22 + (n.y > 0.5 ? 0.04 : n.y < -0.3 ? -0.06 : 0) + (R() - 0.5) * 0.03), M(tp.x, tp.y + s * 0.35, tp.z, R(), R() * 6, R(), s, s * 0.85, s));
  });
  return K.build(1);
}

// ---- 針葉樹: ぎざぎざの縁で垂れ下がる枝の段 ----
export function makePine(seed = 1, { leaf = 0x2a5c3a, bark = 0x4a3a2a, height = 1 } = {}) {
  const R = rng(seed), K = new Kit(), H = 5.2 * height;
  K.add(tube((t) => new THREE.Vector3(0, t * H * 0.85, 0), (t) => 0.22 * (1 - t * 0.8), 5, 6), () => jitter(bark, R));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const y = H * (0.22 + i * 0.16), r = 2.0 * (1 - i / tiers * 0.78), h = 1.5 - i * 0.12;
    const g = new THREE.ConeGeometry(r, h, 11, 2, true), p = g.attributes.position;
    for (let v = 0; v < p.count; v++) { // 縁をぎざぎざに、垂らす
      const py = p.getY(v);
      if (py < -h / 2 + 0.01) { const a = Math.atan2(p.getZ(v), p.getX(v)), k = 0.8 + hash3(i, Math.round(a * 10), seed) * 0.45; p.setX(v, p.getX(v) * k); p.setZ(v, p.getZ(v) * k); p.setY(v, py - (k - 0.8) * 0.5); }
    }
    K.add(g, (c, n) => new THREE.Color(leaf).offsetHSL((R() - 0.5) * 0.02, 0, -0.07 + i * 0.03 + (n.y > 0.4 ? 0.04 : -0.03) + (R() - 0.5) * 0.03), M(0, y, 0, 0, R() * 6, 0));
  }
  return K.build(1);
}

// ---- 木組みの家: 石の土台・漆喰の壁・木の梁と筋交い・厚みのある屋根に段々の板葺き・煙突・窓と鎧戸・扉 ----
export function makeHouse(seed = 1, { roof = 0xa8503a, plaster = 0xeae0c8, timber = 0x5a3e2a, stone = 0x8d8a82 } = {}) {
  const R = rng(seed), K = new Kit(), W = 6 + R() * 1.5, D = 4.6 + R(), WH = 3.0, wood = (h = timber) => jitter(h, R, 0.05);
  // 土台（石を積んだ帯）
  const fd = new THREE.BoxGeometry(W + 0.5, 0.7, D + 0.5, 8, 1, 6);
  K.add(fd, () => jitter(stone, R, 0.12), M(0, 0.35, 0));
  // 壁
  K.add(new THREE.BoxGeometry(W, WH, D), () => jitter(plaster, R, 0.03), M(0, 0.7 + WH / 2, 0));
  // 柱・梁・筋交い
  const beam = (x, y, z, sx, sy, sz, rz = 0, ry = 0) => K.add(new THREE.BoxGeometry(sx, sy, sz), () => wood(), M(x, y, z, 0, ry, rz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(sx * W / 2, 0.7 + WH / 2, sz * D / 2, 0.28, WH, 0.28);
  for (const y of [0.78, 0.7 + WH * 0.52, 0.7 + WH]) { beam(0, y, D / 2 + 0.02, W + 0.2, 0.2, 0.18); beam(0, y, -D / 2 - 0.02, W + 0.2, 0.2, 0.18); beam(W / 2 + 0.02, y, 0, 0.18, 0.2, D + 0.2); beam(-W / 2 - 0.02, y, 0, 0.18, 0.2, D + 0.2); }
  for (const sz of [-1, 1]) for (const x of [-W * 0.32, W * 0.32]) beam(x, 0.7 + WH * 0.26, sz * (D / 2 + 0.03), 0.16, WH * 0.62, 0.12, x > 0 ? 0.6 : -0.6); // 筋交い
  // 窓（枠・ガラス・鎧戸・窓台）
  const win = (x, y, z, ry) => {
    const m = M(x, y, z, 0, ry, 0), add = (geo, col, mm) => K.add(geo, col, m.clone().multiply(mm));
    add(new THREE.BoxGeometry(1.0, 1.1, 0.12), () => wood(0x3a2a1e), M(0, 0, 0));
    add(new THREE.BoxGeometry(0.8, 0.9, 0.06), () => new THREE.Color(0xffd88a), M(0, 0, 0.05));
    add(new THREE.BoxGeometry(0.06, 0.9, 0.08), () => wood(0x3a2a1e), M(0, 0, 0.09));
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.42, 1.0, 0.06), () => wood(0x6a7a5a), M(s * 0.74, 0, 0.08, 0, s * 0.35, 0));
    add(new THREE.BoxGeometry(1.2, 0.1, 0.3), () => wood(), M(0, -0.62, 0.12));
  };
  for (const x of [-W * 0.3, W * 0.3]) win(x, 0.7 + WH * 0.42, D / 2 + 0.05, 0);
  win(-W * 0.25, 0.7 + WH * 0.42, -D / 2 - 0.05, Math.PI);
  win(W / 2 + 0.05, 0.7 + WH * 0.42, 0, Math.PI / 2);
  // 扉（枠と小さなひさし）
  K.add(new THREE.BoxGeometry(1.1, 2.0, 0.12), () => wood(0x4a301e), M(0, 0.7 + 1.0, D / 2 + 0.06));
  for (const s of [-1, 1]) beam(s * 0.65, 0.7 + 1.05, D / 2 + 0.08, 0.16, 2.1, 0.16);
  K.add(new THREE.BoxGeometry(1.6, 0.12, 0.7), () => wood(), M(0, 0.7 + 2.25, D / 2 + 0.35, 0.25, 0, 0));
  // 屋根: 厚みのある2枚と、段々の板葺き（1段ごとに少し色と角度を変える）、棟木、妻壁
  const pitch = 0.62, run = D / 2 + 0.55, slope = run / Math.cos(pitch), ry0 = 0.7 + WH;
  for (const s of [-1, 1]) {
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows, z = s * run * t, y = ry0 + Math.tan(pitch) * run * (1 - t) + 0.12; // 棟から軒へ
      K.add(new THREE.BoxGeometry(W + 0.9, 0.14, slope / rows + 0.12, 10, 1, 1), () => new THREE.Color(roof).offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.08 - (i % 2) * 0.03), M(0, y, z, s * pitch + (R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.015));
    }
  }
  const ridgeY = ry0 + Math.tan(pitch) * run + 0.18;
  K.add(new THREE.BoxGeometry(W + 1.0, 0.24, 0.3), () => wood(), M(0, ridgeY, 0));
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * D / 2)]);
  for (const s of [-1, 1]) K.add(new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }), () => jitter(plaster, R, 0.03), M(s * (W / 2 - 0.05), ry0, 0, 0, Math.PI / 2, 0));
  // 煙突
  const cx = W * 0.25, cz = -D * 0.15, ch = ridgeY + 0.6 - ry0;
  K.add(new THREE.BoxGeometry(0.8, ch + 0.6, 0.8, 2, 4, 2), () => jitter(stone, R, 0.1), M(cx, ry0 + (ch + 0.6) / 2 - 0.3, cz));
  K.add(new THREE.BoxGeometry(1.0, 0.18, 1.0), () => jitter(0x5a5650, R), M(cx, ry0 + ch + 0.35, cz));
  // 樽と木箱
  const barrel = new THREE.CylinderGeometry(0.38, 0.38, 0.9, 10); barrel.scale(1, 1, 1);
  K.add(barrel, () => wood(0x8a6a44), M(W / 2 + 0.6, 0.45, D / 2 - 0.4));
  for (const y of [0.15, 0.75]) K.add(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10), () => new THREE.Color(0x3a3a40), M(W / 2 + 0.6, y, D / 2 - 0.4));
  K.add(new THREE.BoxGeometry(0.7, 0.6, 0.7), () => wood(0x9a7a4a), M(W / 2 + 0.6, 0.3, D / 2 + 0.5, 0, 0.3, 0));
  return K.build(1.1);
}
