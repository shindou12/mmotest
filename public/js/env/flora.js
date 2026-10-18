// エリアの見た目: 木・針葉樹・岩の形のバリエーション。種（R）から樹種・岩の型を選び、毎回違う形に作る
//   どれも Batch に足す（幹=木の皮、葉=葉の茂み、岩=岩の素材）。色は面ごとに塗り分ける（下・内側は暗く、上は明るく）
import * as THREE from 'three';
import { local } from './kit.js';
import { SURF } from './textures.js';

// ---- 道具 ----
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
const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 曲がりながら細くなる管（幹・枝・根）。path(t) → 中心、rad(t) → 太さ。なめらかな法線つき
function tube(path, rad, segs = 6, radial = 7, seed = 0) {
  const pos = [], idx = [], up = V(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = path(t), d = path(Math.min(1, t + 0.02)).sub(path(Math.max(0, t - 0.02))).normalize();
    const a = Math.abs(d.y) > 0.95 ? V(1, 0, 0) : up;
    const s1 = new THREE.Vector3().crossVectors(d, a).normalize(), s2 = new THREE.Vector3().crossVectors(d, s1).normalize();
    for (let j = 0; j < radial; j++) {
      const ang = j / radial * Math.PI * 2, r = rad(t) * (1 + (hash3(i, j, seed) - 0.5) * 0.18);
      pos.push(c.x + (s1.x * Math.cos(ang) + s2.x * Math.sin(ang)) * r, c.y + (s1.y * Math.cos(ang) + s2.y * Math.sin(ang)) * r, c.z + (s1.z * Math.cos(ang) + s2.z * Math.sin(ang)) * r);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial;
    idx.push(a, b, a + radial, b, b + radial, a + radial);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 凸凹に崩した塊（葉の房・岩）。cuts: 平らに削る面の数（岩の割れ面）
function lump(seed, { detail = 1, amp = 0.3, freq = 1.4, cuts = 0, cutAt = 0.75, flatBottom = false, extra = [] } = {}) {
  let s = seed >>> 0 || 1;
  const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  const planes = Array.from({ length: cuts }, () => [V(R() - 0.5, R() * 0.9 - 0.2, R() - 0.5).normalize(), cutAt + R() * 0.15]);
  if (flatBottom) planes.push([V(0, -1, 0), 0.45]);
  for (const [x, y, z, c] of extra) planes.push([V(x, y, z).normalize(), c]);
  const o = seed * 0.37;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (fbm(v.x * freq + o, v.y * freq + o * 0.5, v.z * freq) - 0.5) * 2 * amp);
    for (const [n, c] of planes) { const d = v.dot(n); if (d > c) v.addScaledVector(n, c - d); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 広葉樹。樹種: oak（横に広い）/ tall（縦長のポプラ）/ young（若木）/ twin（二股）/ birch（白樺）/ old（太い老木）
//   M: 置く位置（根元）。leaf・bark: 基本の色。size: 全体の大きさ
// ---------------------------------------------------------------------------
const SPECIES = ['oak', 'oak', 'tall', 'young', 'twin', 'birch', 'old'];
export function addTree(B, M, R, { leaf = 0x3f8f3a, bark = 0x6b4a2a, size = 1, species = null, fruit = 0 } = {}) {
  const sp = species || SPECIES[Math.floor(R() * SPECIES.length)];
  const seed = Math.floor(R() * 1e6);
  // 1本ごとの色の揺らぎ（ときどき少し黄ばんだ木）
  const lc = new THREE.Color(sp === 'birch' ? new THREE.Color(leaf).offsetHSL(0.03, 0.05, 0.08) : leaf).offsetHSL((R() - 0.5) * 0.04, (R() - 0.5) * 0.1, (R() - 0.5) * 0.06);
  if (R() < 0.12) lc.offsetHSL(-0.04, 0.05, 0.04);
  const bc = sp === 'birch' ? new THREE.Color(0xe8e4d8) : new THREE.Color(bark).offsetHSL(0, 0, (R() - 0.5) * 0.06);
  const P = {
    oak: { H: 3.0, r0: 0.3, lean: 0.25, br: [3, 5], brL: [1.3, 2.0], brUp: 0.55, cl: [8, 12], cs: [0.95, 1.35], spread: 1.0, flat: 0.8 },
    tall: { H: 4.4, r0: 0.24, lean: 0.12, br: [2, 3], brL: [0.6, 1.0], brUp: 1.4, cl: [10, 13], cs: [0.8, 1.05], spread: 0.45, flat: 1.0 },
    young: { H: 2.2, r0: 0.13, lean: 0.3, br: [1, 2], brL: [0.5, 0.8], brUp: 0.9, cl: [3, 5], cs: [0.55, 0.8], spread: 0.6, flat: 0.9 },
    twin: { H: 2.6, r0: 0.3, lean: 0.2, br: [2, 2], brL: [1.6, 2.0], brUp: 1.1, cl: [9, 12], cs: [0.85, 1.15], spread: 0.85, flat: 0.85 },
    birch: { H: 3.8, r0: 0.17, lean: 0.35, br: [3, 4], brL: [0.8, 1.2], brUp: 0.9, cl: [6, 8], cs: [0.6, 0.85], spread: 0.65, flat: 0.95 },
    old: { H: 2.6, r0: 0.5, lean: 0.35, br: [4, 5], brL: [1.6, 2.3], brUp: 0.45, cl: [10, 14], cs: [1.0, 1.45], spread: 1.15, flat: 0.75 },
  }[sp];
  const rr = (a) => a[0] + R() * (a[1] - a[0]), y0w = M.elements[13]; // 根元の高さ（面の色は根元からの高さで決める）
  const H = P.H * (0.85 + R() * 0.3), lx = (R() - 0.5) * P.lean, lz = (R() - 0.5) * P.lean, ph = R() * 6;
  const trunk = (t) => V(Math.sin(t * 2.3 + ph) * 0.12 + lx * t * t * H * 0.4, t * H, Math.cos(t * 1.9 + ph) * 0.1 + lz * t * t * H * 0.4);
  const S = (m) => local(M, 0, 0, 0, 0, 0, 0, size).multiply(m || new THREE.Matrix4());
  const barkC = (y0) => (c) => {
    const ly = (c.y - y0w) / size, k = Math.min(1, Math.max(0, (ly - y0) / 1.2));
    if (sp === 'birch') return hash3(Math.floor(ly * 4), seed, 1) < 0.3 ? new THREE.Color(0x3a3530) : bc.clone().offsetHSL(0, 0, (hash3(c.x, c.y, c.z) - 0.5) * 0.06);
    return bc.clone().offsetHSL(0, 0, 0.04 - 0.08 * (1 - k) + (hash3(c.x, c.y, c.z) - 0.5) * 0.05);
  };
  const add = (geo, color, opt) => B.add(geo, color, S(), opt);
  // 幹（二股は途中で分かれる）
  const tips = [];
  if (sp === 'twin') {
    const split = 0.4;
    add(tube((t) => trunk(t * split), (t) => P.r0 * (1.25 - t * 0.3) + Math.max(0, 0.15 - t) * 1.4, 4, 9, seed), barkC(0), { surf: SURF.bark });
    for (const s of [-1, 1]) {
      const b = trunk(split), a = ph + s * 1.2;
      const f = (t) => b.clone().add(V(Math.cos(a) * t * 1.1, t * H * 0.75, Math.sin(a) * t * 1.1));
      add(tube(f, (t) => P.r0 * (0.9 - t * 0.55), 6, 8, seed + s), barkC(0), { surf: SURF.bark });
      tips.push({ p: f(1), w: 0.8 });
      tips.push({ p: f(0.65).add(V(Math.cos(a + 1.6) * 0.7, 0.2, Math.sin(a + 1.6) * 0.7)), w: 0.6 });
    }
  } else {
    add(tube(trunk, (t) => P.r0 * (1 - t * 0.6) + Math.max(0, 0.12 - t) * P.r0 * 5, sp === 'tall' ? 8 : 6, sp === 'young' ? 6 : 9, seed), barkC(0), { surf: SURF.bark });
    tips.push({ p: trunk(1), w: 1 });
  }
  // 根（若木以外）
  if (sp !== 'young') for (let k = 0; k < (sp === 'old' ? 6 : 4); k++) {
    const a = k / (sp === 'old' ? 6 : 4) * Math.PI * 2 + R() * 0.8, L = (0.7 + R() * 0.5) * (sp === 'old' ? 1.5 : 1);
    add(tube((t) => V(Math.cos(a) * t * L, P.r0 * 1.2 * (1 - t) ** 2 - 0.05, Math.sin(a) * t * L), (t) => P.r0 * 0.45 * (1 - t) + 0.03, 4, 5, seed + k), barkC(0), { surf: SURF.bark });
  }
  // 枝: 幹の上半分から外向きに伸び、先に葉の房をつける
  const nb = Math.round(rr(P.br));
  for (let k = 0; k < nb; k++) {
    const t0 = sp === 'twin' ? 0.3 : 0.5 + R() * 0.35, b = trunk(t0), a = k / nb * Math.PI * 2 + R() * 0.9, L = rr(P.brL);
    const pth = (t) => V(b.x + Math.cos(a) * t * L, b.y + t * L * P.brUp + Math.sin(t * 3) * 0.08, b.z + Math.sin(a) * t * L);
    add(tube(pth, (t) => P.r0 * 0.42 * (1 - t * 0.7), 4, 5, seed + 10 + k), barkC(0.5), { surf: SURF.bark });
    tips.push({ p: pth(1), w: 0.75 });
  }
  // 老木の枯れ枝
  if (sp === 'old' && R() < 0.7) {
    const b = trunk(0.55), a = R() * 6.28;
    add(tube((t) => V(b.x + Math.cos(a) * t * 1.6, b.y + t * 0.6 - t * t * 0.4, b.z + Math.sin(a) * t * 1.6), (t) => 0.09 * (1 - t * 0.8) + 0.02, 4, 5, seed + 99), barkC(0.5), { surf: SURF.bark });
  }
  // 樹冠: 枝先の周りと、樹冠の外殻に房を散らす（横は spread、縦は flat で形を変える）
  const top = trunk(1), cTop = top.y + 0.8;
  const center = sp === 'tall' ? trunk(0.62) : top.clone().add(V(0, 0.2, 0));
  const ncl = Math.round(rr(P.cl));
  const rad = (sp === 'tall' ? 1.25 : 1.5) * P.spread, vert = rad * P.flat * (sp === 'tall' ? 3.2 : 1);
  // 芯: 樹冠の中を埋める大きな塊（房のすき間から向こうが透けないように）
  const pts = [{ p: center.clone().add(V(0, vert * 0.25, 0)), s: rad * 0.95, sy: vert * 0.85 / (rad * 0.95), core: true }];
  for (const t of tips) pts.push({ p: t.p.clone().add(V(0, 0.3, 0)), s: rr(P.cs) * t.w * 1.05 });
  for (let k = 0; k < ncl; k++) {
    const u = k / ncl * Math.PI * 2 + R() * 0.7, v = Math.acos(1 - R() * 1.3); // 上半分寄り
    const p = center.clone().add(V(Math.sin(v) * Math.cos(u) * rad, Math.cos(v) * vert * 0.85 + vert * 0.1, Math.sin(v) * Math.sin(u) * rad));
    pts.push({ p, s: rr(P.cs) * (0.8 + 0.3 * Math.cos(v)) });
  }
  const ymin = Math.min(...pts.map((q) => q.p.y)) - 0.8, ymax = Math.max(...pts.map((q) => q.p.y)) + 1;
  const leafC = (c, n) => {
    const h = Math.min(1, Math.max(0, ((c.y - y0w) / size - ymin) / (ymax - ymin)));
    const j = (hash3(c.x * 3.1, c.y * 3.7, c.z * 2.9) - 0.5) * 0.05;
    return lc.clone().offsetHSL(j * 0.3, 0, -0.16 + h * 0.2 + (n.y > 0.55 ? 0.05 : n.y < -0.35 ? -0.07 : 0) + j);
  };
  pts.forEach((q, k) => {
    const g = lump(seed * 7 + k * 13, { detail: q.core ? 2 : 1, amp: q.core ? 0.2 : 0.26, freq: 1.7, cuts: 2, cutAt: 0.85 });
    g.applyMatrix4(local(new THREE.Matrix4(), q.p.x, q.p.y, q.p.z, q.core ? 0 : R(), R() * 6, q.core ? 0 : R(), q.s, q.s * (q.sy ?? (0.78 + R() * 0.15)), q.s));
    B.add(g, leafC, S(), { surf: SURF.leaf }); // 法線は球のまま（やわらかい陰影）
  });
  // 実（りんご）
  if (fruit && R() < fruit) for (let k = 0; k < 5; k++) {
    const q = pts[Math.floor(R() * pts.length)], a = R() * 6.28;
    B.add(new THREE.SphereGeometry(0.1, 6, 4), 0xe0402a, S(local(new THREE.Matrix4(), q.p.x + Math.cos(a) * q.s * 0.95, q.p.y - q.s * 0.2, q.p.z + Math.sin(a) * q.s * 0.95)));
  }
  return { height: cTop * size, sp };
}

// ---------------------------------------------------------------------------
// 針葉樹: ぎざぎざの縁で垂れた枝の段。高さ・段数・細さ・傾きを変える
// ---------------------------------------------------------------------------
export function addPine(B, M, R, { leaf = 0x24553a, bark = 0x4a3a2a, size = 1, snow = false } = {}) {
  const seed = Math.floor(R() * 1e6), H = (4.8 + R() * 2.8), tiers = 5 + Math.floor(R() * 3), slim = 0.7 + R() * 0.4;
  const lc = new THREE.Color(leaf).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.08, 0.05 + (R() - 0.5) * 0.06);
  const S = () => local(M, 0, 0, 0, 0, R() * 6, 0, size);
  B.add(tube((t) => V(0, t * H, 0), (t) => 0.22 * (1 - t * 0.8), 4, 7, seed), (c) => new THREE.Color(bark).offsetHSL(0, 0, (hash3(c.x, c.y, c.z) - 0.5) * 0.06), S(), { surf: SURF.bark });
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, y = 0.9 + t * (H - 1.4), r = (2.0 - t * 1.65) * slim, h = 1.9 - t * 0.7;
    // 縁をぎざぎざにした円錐（下の頂点を揺らし、垂れ下がらせる）
    const g = new THREE.ConeGeometry(r, h, 11 + (i % 2), 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const yy = p.getY(k);
      if (yy < -h / 2 + 0.01) { const a = Math.atan2(p.getZ(k), p.getX(k)), w = 1 + (hash3(a * 3, i, seed) - 0.5) * 0.35; p.setXYZ(k, p.getX(k) * w, yy - hash3(a, i, seed + 1) * 0.35, p.getZ(k) * w); }
    }
    const shade = (c, n) => {
      if (snow && n.y > 0.6 && hash3(c.x * 2, c.y * 2, c.z * 2) < 0.55) return new THREE.Color(0xf4f8ff);
      return lc.clone().offsetHSL(0, 0, -0.06 + t * 0.12 + (n.y < 0 ? -0.1 : 0) + (hash3(c.x * 4, c.y * 4, c.z * 4) - 0.5) * 0.05);
    };
    B.add(g, shade, local(S(), 0, y + h / 2, 0, (R() - 0.5) * 0.08, i * 0.7, (R() - 0.5) * 0.08), { flat: true, surf: SURF.leaf });
  }
}

// ---------------------------------------------------------------------------
// 岩。型: boulder（丸い大岩）/ slab（平たい層状）/ cluster（小岩の集まり）/ spire（縦長）/ split（割れた岩）
//   moss: 上を向いた面を苔の色に。size: 大きさ
// ---------------------------------------------------------------------------
const ROCKS = ['boulder', 'boulder', 'slab', 'cluster', 'spire', 'split'];
export function addRock(B, M, R, { color = 0x8a8f96, moss = 0, size = 1, kind = null } = {}) {
  const k = kind || ROCKS[Math.floor(R() * ROCKS.length)], seed = Math.floor(R() * 1e6);
  const base = new THREE.Color(color).offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.05, (R() - 0.5) * 0.06);
  const mossC = new THREE.Color(0x5f8f3c);
  const shade = (c, n) => {
    if (moss && n.y > 0.6 && fbm(c.x * 0.9, c.y * 0.9, c.z * 0.9) + n.y * 0.3 > 1.15 - moss * 0.5) return mossC.clone().offsetHSL(0, 0, (hash3(c.z, c.x, c.y) - 0.5) * 0.08);
    return base.clone().offsetHSL(0, 0, (hash3(c.x * 2.3, c.y * 2.3, c.z * 2.3) - 0.5) * 0.07 + (n.y < -0.15 ? -0.1 : n.y > 0.5 ? 0.04 : 0));
  };
  const put = (sd, o, x, y, z, sx, sy, sz, ry = R() * 6.28, tilt = 0.12) => {
    const g = lump(sd, o);
    B.add(g, shade, local(M, x * size, y * size, z * size, (R() - 0.5) * tilt, ry, (R() - 0.5) * tilt, sx * size, sy * size, sz * size), { flat: true, surf: SURF.stone });
  };
  const pebbles = (n, d) => { for (let i = 0; i < n; i++) { const a = R() * 6.28, r = d * (1 + R() * 0.5), s = 0.15 + R() * 0.25; put(seed + 50 + i, { detail: 0, amp: 0.2, cuts: 2 }, Math.cos(a) * r, s * 0.3, Math.sin(a) * r, s, s * 0.7, s); } };
  if (k === 'boulder') { put(seed, { detail: 2, amp: 0.2, cuts: 9, cutAt: 0.56, flatBottom: true }, 0, 0.45, 0, 1.2, 0.85, 1.05); pebbles(2 + Math.floor(R() * 3), 1.3); }
  else if (k === 'slab') { for (let i = 0; i < 3; i++) put(seed + i, { detail: 1, amp: 0.15, cuts: 5, cutAt: 0.55, flatBottom: true }, (R() - 0.5) * 0.4, 0.18 + i * 0.32, (R() - 0.5) * 0.4, 1.5 - i * 0.35, 0.4, 1.2 - i * 0.25, R() * 6.28, 0.18); pebbles(3, 1.6); }
  else if (k === 'cluster') { const n = 3 + Math.floor(R() * 3); for (let i = 0; i < n; i++) { const a = i / n * 6.28 + R(), d = i ? 0.8 + R() * 0.5 : 0, s = i ? 0.45 + R() * 0.35 : 0.85; put(seed + i, { detail: 1, amp: 0.22, cuts: 5, cutAt: 0.6, flatBottom: true }, Math.cos(a) * d, s * 0.42, Math.sin(a) * d, s, s * (0.8 + R() * 0.5), s); } }
  else if (k === 'spire') { put(seed, { detail: 2, amp: 0.18, cuts: 6, cutAt: 0.55, flatBottom: true }, 0, 0.9, 0, 0.7, 1.8, 0.6, R() * 6.28, 0.25); put(seed + 1, { detail: 1, amp: 0.2, cuts: 4, flatBottom: true }, 0.6, 0.3, 0.3, 0.55, 0.5, 0.5); pebbles(3, 1.0); }
  else { for (const s of [-1, 1]) put(seed + s, { detail: 2, amp: 0.16, cuts: 6, cutAt: 0.58, flatBottom: true, extra: [[-s, 0, 0, 0.12]] }, s * 0.32, 0.5, 0, 0.95, 0.95, 1.05, s * 0.12, 0.04); pebbles(3, 1.3); }
  return k;
}
