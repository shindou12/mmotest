// エリアの見た目の作り込み（段階 mapq 2〜4）。エリアの scape（shared/areas.js）を読んで、
//   段階2: 起伏の大きな形（丘）・外周の林・群れで置く装飾（林・岩場・花畑）・根元の小物・地面の塗り分け
//   段階3: 区画の目印（環状列石・古い祠・丘の一本木）・道の縁取り（石灯籠・敷石・道標・柵）
//   段階4: 遠景の象徴（迷宮区の塔）・重なる遠い丘・木漏れ日の光の筋・蝶
// 見た目だけで、当たり・敵の動き（サーバー）は変えない。戦う場所（中央・道）はなだらかなまま
import * as THREE from 'three';
import { boundR, angOf, exitsOf } from '../../shared/areas.js';
import { glow } from '../toon.js';
import { seeded, hashStr, local, I } from './kit.js';
import { makeProp } from './props.js';
import { motes } from '../models/bosses/fx-parts.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 中心から各出口への道（open.js の小道と同じ曲がり方）までの距離
export function pathDist(def, x, z) {
  let best = 1e9;
  for (const e of exitsOf(def)) {
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L;
    const along = x * ux + z * uz;
    if (along < 0 || along > L) continue;
    best = Math.min(best, Math.abs(x * uz - z * ux + Math.sin(along * 0.12) * 2.5));
  }
  return best;
}

// 段階2以上の高さの上乗せ（丘・外周の立ち上がり）。道と出口の近くでは消える
export function scapeLift(def, q) {
  const S = def.scape;
  if (!S || q < 2) return null;
  const exits = exitsOf(def);
  return (x, z) => {
    let h = 0;
    for (const [hx, hz, r, hh] of S.hills) {
      const d = Math.hypot(x - hx, z - hz);
      if (d < r) h += hh * (0.5 + 0.5 * Math.cos(Math.PI * d / r));
    }
    // 中くらいのうねり（なだらか）
    h += (Math.sin(x * 0.06 + 1.3) * Math.cos(z * 0.07 - 0.4) + Math.sin(x * 0.023 - z * 0.031) * 0.8) * 0.35;
    h *= smooth(2.5, 7, pathDist(def, x, z));
    for (const e of exits) h *= smooth(4, 10, Math.hypot(x - e.x, z - e.z));
    // 外周: 境界の手前 6m からゆるく上がり、外はしっかり立ち上がる（その上に林が載る）
    const br = boundR(def, angOf(x, z)), r = Math.hypot(x, z);
    const near = exits.some((e) => Math.hypot(x - e.x, z - e.z) < 9);
    if (!near) h += smooth(br - 6, br, r) * 0.9 + Math.max(0, r - br) * (0.7 + 0.3 * Math.sin(angOf(x, z) * 7));
    return h;
  };
}

// 段階2以上の配置の計画（地面の塗り分けと、置く物の両方で使う）
export function planScape(def, q, avoid) {
  const S = def.scape;
  if (!S || q < 2) return null;
  const R = seeded(hashStr(def.id) ^ 0x5ca9e);
  const clusters = [];
  const far = (x, z, d) => clusters.every((c) => Math.hypot(c.x - x, c.z - z) > d);
  const zoneAt = (x, z, pad) => (q >= 3 ? (S.zones || []).some((zn) => Math.hypot(zn.x - x, zn.z - z) < zn.r + pad) : false);
  const pick = (kind, n, [f0, f1], gap) => {
    for (let i = 0, tries = 0; i < n && tries < 600; tries++) {
      const a = R() * Math.PI * 2, f = f0 + R() * (f1 - f0), br = boundR(def, a);
      const x = Math.sin(a) * br * f, z = -Math.cos(a) * br * f;
      if (avoid(x, z, 2) || pathDist(def, x, z) < 6 || !far(x, z, gap) || zoneAt(x, z, 4)) continue;
      const r = kind === 'grove' ? 4 + R() * 3.5 : kind === 'rocks' ? 2.5 + R() * 1.5 : 2.8 + R() * 2.2;
      clusters.push({ kind, x, z, r, seed: Math.floor(R() * 1e9) });
      i++;
    }
  };
  pick('grove', S.groves, [0.5, 0.92], 12);
  pick('rocks', S.rocks, [0.4, 0.9], 10);
  pick('beds', S.beds, [0.25, 0.8], 9);
  return { clusters, R };
}

// 地面の色の塗り分け（群れの下の林床・岩場の土・丘の上の明るさ・くぼみの暗さ）
export function scapeTint(plan, x, z, h, tmp, C) {
  if (!plan) return;
  for (const c of plan.clusters) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > c.r * 1.5) continue;
    const k = smooth(c.r * 1.5, c.r * 0.5, d);
    if (c.kind === 'grove') tmp.lerp(C.forest, k * 0.55);
    else if (c.kind === 'rocks') tmp.lerp(C.dirt, k * 0.35);
    else tmp.lerp(C.bloom, k * 0.25);
  }
  if (h > 0.5) tmp.lerp(C.sunny, Math.min(0.35, (h - 0.5) * 0.18));
  else if (h < -0.15) tmp.multiplyScalar(0.92);
}

// 置く物（段階2: 群れ・外周の林・まばらな単体・小石 / 段階3: 区画・道の縁取り / 段階4: 遠景・光の筋・蝶）
export function buildScape(B, group, anims, ctx) {
  const { def, fdef, q, plan, heightAt, avoid } = ctx;
  const S = def.scape, R = plan.R;
  const [, tree, rock, flower] = [null, fdef.props.find((p) => p[0] === 'tree'), fdef.props.find((p) => p[0] === 'rock'), fdef.props.find((p) => p[0] === 'flower')];
  const put = (type, x, z, s, col, rot = R() * Math.PI * 2, tilt = 0) => makeProp(B, type, local(I, x, heightAt(x, z), z, tilt * (R() - 0.5), rot, tilt * (R() - 0.5), s), R, col?.[2], col?.[3], fdef, q);
  const scatter = (c, r) => { const a = R() * Math.PI * 2, d = r * Math.sqrt(R()); return [c.x + Math.sin(a) * d, c.z + Math.cos(a) * d]; };
  const leaf = [0, 0, tree[2], tree[3]], moss = [0, 0, 0x4f7d3a, 0x6b4a2a], stone = [0, 0, rock[2]], peb = [0, 0, 0x9a968c];

  // 群れ
  for (const c of plan.clusters) {
    if (c.kind === 'grove') {
      const n = Math.round(c.r * 1.6 + R() * 4);
      for (let i = 0; i < n; i++) {
        const [x, z] = scatter(c, c.r); if (avoid(x, z, 0.5)) continue;
        const k = 1 - Math.hypot(x - c.x, z - c.z) / c.r;
        put('tree', x, z, 0.8 + k * 0.7 + R() * 0.25, tree, undefined, 0.08);
      }
      for (let i = 0; i < 8 + R() * 6; i++) {
        const a = R() * Math.PI * 2, d = c.r * (0.85 + R() * 0.5), x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
        if (!avoid(x, z, 0)) put('bush', x, z, 0.7 + R() * 0.6, leaf);
      }
      if (R() < 0.6) { const [x, z] = scatter(c, c.r * 1.1); if (!avoid(x, z, 0.5)) put(R() < 0.5 ? 'log' : 'stump', x, z, 0.9 + R() * 0.3, moss); }
      for (let i = 0; i < 10; i++) { const [x, z] = scatter(c, c.r * 1.2); if (!avoid(x, z, 0)) put('pebble', x, z, 0.6 + R() * 0.8, peb); }
      for (let i = 0; i < 6; i++) { const [x, z] = scatter(c, c.r * 1.3); if (!avoid(x, z, 0)) put('flower', x, z, 0.8 + R() * 0.4, flower); }
    } else if (c.kind === 'rocks') {
      put('rock', c.x, c.z, 2.0 + R() * 0.9, stone);
      for (let i = 0; i < 2 + R() * 3; i++) { const [x, z] = scatter(c, c.r); if (!avoid(x, z, 0)) put('rock', x, z, 0.8 + R() * 0.6, stone); }
      for (let i = 0; i < 12; i++) { const [x, z] = scatter(c, c.r * 1.4); if (!avoid(x, z, 0)) put('pebble', x, z, 0.6 + R() * 1.0, peb); }
      for (let i = 0; i < 2 + R() * 3; i++) { const [x, z] = scatter(c, c.r * 1.2); if (!avoid(x, z, 0)) put('bush', x, z, 0.5 + R() * 0.4, leaf); }
    } else {
      const main = R() < 0.5 ? 2 : 3;
      for (let i = 0; i < 70 + c.r * 25; i++) {
        const [x, z] = scatter(c, c.r); if (avoid(x, z, 0)) continue;
        const fc = R() < 0.88 ? flower[main] : flower[5 - main];
        put('flower', x, z, 1.2 + R() * 0.5, [0, 0, fc, fc]);
      }
    }
  }
  // 広場のまばらな単体（余白は残す）
  for (let i = 0, tries = 0; i < S.singles && tries < 200; tries++) {
    const a = R() * Math.PI * 2, f = 0.25 + R() * 0.45, br = boundR(def, a), x = Math.sin(a) * br * f, z = -Math.cos(a) * br * f;
    if (avoid(x, z, 2) || pathDist(def, x, z) < 5) continue;
    if (R() < 0.5) put('tree', x, z, 0.9 + R() * 0.4, tree); else put('rock', x, z, 0.8 + R() * 0.5, stone);
    for (let k = 0; k < 4; k++) { const xx = x + (R() - 0.5) * 4, zz = z + (R() - 0.5) * 4; if (!avoid(xx, zz, 0)) put('pebble', xx, zz, 0.6 + R() * 0.6, peb); }
    i++;
  }
  // 外周の林（境界の外の斜面に、木と低木を帯状に）
  const exits = exitsOf(def);
  for (let a = 0; a < Math.PI * 2; a += 0.035) {
    const br = boundR(def, a);
    for (let row = 0; row < 3; row++) {
      if (R() > [0.55, 0.75, 0.85][row]) continue;
      const d = br + 1 + row * 3.2 + R() * 2.5, x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < 9)) continue;
      if (row === 0 && R() < 0.5) put('bush', x, z, 0.8 + R() * 0.6, leaf);
      else put('tree', x, z, 1.1 + row * 0.2 + R() * 0.5, tree, undefined, 0.1);
    }
  }

  if (q >= 3) zones(B, group, anims, ctx, put);
  if (q >= 4) farAndLight(group, anims, ctx);
}

// 段階3: 区画の目印と道の縁取り
function zones(B, group, anims, ctx, put) {
  const { def, plan, heightAt } = ctx;
  const R = plan.R, stoneC = 0xa8a294, darkC = 0x7a7568, woodC = 0x7a5a3a;
  for (const zn of def.scape.zones || []) {
    const y = heightAt(zn.x, zn.z), M = local(I, zn.x, y, zn.z, 0, zn.rot || 0, 0);
    if (zn.kind === 'stones') {
      // 環状列石: 立石を輪に並べ、中央に光るルーンの石
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, x = zn.x + Math.sin(a) * 5.2, z = zn.z + Math.cos(a) * 5.2, h = 2.2 + R() * 1.4;
        if (i === 4) { B.add(new THREE.BoxGeometry(0.9, 0.6, h), darkC, local(I, x, heightAt(x, z) + 0.3, z, 0, a, 0.15)); continue; } // 倒れた石
        B.add(new THREE.BoxGeometry(0.9, h, 0.6), new THREE.Color(stoneC).offsetHSL(0, 0, (R() - 0.5) * 0.06), local(I, x, heightAt(x, z) + h / 2 - 0.2, z, (R() - 0.5) * 0.12, a, (R() - 0.5) * 0.12), { flat: true });
      }
      B.add(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 8), darkC, local(M, 0, 0.1, 0), { flat: true });
      B.add(new THREE.BoxGeometry(1.0, 3.4, 0.8), stoneC, local(M, 0, 1.9, 0, 0, 0.4, 0), { flat: true });
      for (let k = 0; k < 3; k++) B.add(new THREE.BoxGeometry(0.5, 0.08, 0.04), 0x9af0ff, local(M, 0, 1.4 + k * 0.6, 0.42, 0, 0.4, 0), { glowing: true });
    } else if (zn.kind === 'shrine') {
      // 古い祠: 石の基壇、4本の柱（2本は折れている）、落ちた屋根の板、苔
      B.add(new THREE.BoxGeometry(6, 0.5, 6), stoneC, local(M, 0, 0.25, 0), { flat: true });
      B.add(new THREE.BoxGeometry(4.6, 0.3, 4.6), darkC, local(M, 0, 0.62, 0));
      [[-1.8, -1.8, 4.2], [1.8, -1.8, 1.6], [-1.8, 1.8, 2.1], [1.8, 1.8, 4.2]].forEach(([x, z, h]) => {
        B.add(new THREE.CylinderGeometry(0.32, 0.38, h, 10), stoneC, local(M, x, 0.7 + h / 2, z));
        B.add(new THREE.BoxGeometry(0.9, 0.25, 0.9), darkC, local(M, x, 0.75, z));
      });
      B.add(new THREE.BoxGeometry(5.2, 0.35, 2.4), woodC, local(M, 0.5, 2.5, -1.8, 0, 0, 0.12));
      B.add(new THREE.BoxGeometry(3.4, 0.25, 1.8), 0x6a4a36, local(M, 1.0, 0.9, 2.4, 0.45, 0.3, 0.25)); // 落ちた屋根の板
      B.add(new THREE.BoxGeometry(1.2, 1.4, 0.9), stoneC, local(M, 0, 1.4, 0));
      B.add(new THREE.SphereGeometry(0.28, 10, 8), 0xffd88a, local(M, 0, 2.3, 0), { glowing: true });
      for (let k = 0; k < 8; k++) B.add(new THREE.SphereGeometry(0.4, 8, 6), 0x5a8a3a, local(M, (R() - 0.5) * 5.4, 0.6, (R() - 0.5) * 5.4, 0, 0, 0, 1, 0.35, 1));
    } else if (zn.kind === 'bigtree') {
      // 丘の一本木: ひときわ大きな木と、根元の石のベンチ
      put('tree', zn.x, zn.z, 2.4, ctx.fdef.props.find((p) => p[0] === 'tree'), 0.5);
      for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(1.8, 0.3, 0.6), stoneC, local(M, s * 3.2, 0.5, 2.2, 0, s * 0.5, 0));
    }
  }
  // 道の縁取り: 北（迷宮区へ）の古道は石灯籠と敷石、ほかの道は木の杭と柵がところどころ
  for (const e of exitsOf(def)) {
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L, road = e.to === def.scape.road;
    for (let along = road ? 10 : L - 22; along < L - 6; along += road ? 6.5 : 2.1) {
      const off = Math.sin(along * 0.12) * 2.5;
      for (const s of [-1, 1]) {
        if (!road && R() < 0.12) continue; // 出口の手前だけ柵で縁取る（ところどころ抜ける）
        const side = s * (road ? 3.6 : 3.2) - off, x = ux * along + uz * side, z = uz * along - ux * side, y = heightAt(x, z);
        if (road) {
          const m = local(I, x, y, z, 0, Math.atan2(ux, uz), 0);
          B.add(new THREE.BoxGeometry(0.7, 0.3, 0.7), darkC, local(m, 0, 0.15, 0));
          B.add(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6), stoneC, local(m, 0, 0.9, 0));
          B.add(new THREE.BoxGeometry(0.6, 0.45, 0.6), stoneC, local(m, 0, 1.7, 0));
          B.add(new THREE.BoxGeometry(0.3, 0.25, 0.62), 0xffe0a0, local(m, 0, 1.7, 0), { glowing: true });
          B.add(new THREE.ConeGeometry(0.55, 0.4, 4), darkC, local(m, 0, 2.1, 0, 0, Math.PI / 4, 0));
        } else {
          const m = local(I, x, y, z, 0, Math.atan2(ux, uz) + Math.PI / 2, 0);
          for (const p of [-1, 1]) B.add(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 6), woodC, local(m, p * 0.9, 0.5, 0));
          B.add(new THREE.BoxGeometry(2.0, 0.1, 0.08), 0x8a6a48, local(m, 0, 0.75, 0));
        }
      }
      if (road) for (let k = 0; k < 5; k++) {
        const side = (R() - 0.5) * 3 - off, a2 = along + (R() - 0.5) * 5, x = ux * a2 + uz * side, z = uz * a2 - ux * side;
        B.add(new THREE.CylinderGeometry(0.5 + R() * 0.3, 0.55 + R() * 0.3, 0.12, 6), new THREE.Color(0xb0aa98).offsetHSL(0, 0, (R() - 0.5) * 0.08), local(I, x, heightAt(x, z) + 0.03, z, 0, R() * 3, 0), { flat: true });
      }
    }
  }
  // 中央の道標（出口の方向へ板を向ける）
  const sx = 3.2, sz = 3.2, sy = heightAt(sx, sz);
  B.add(new THREE.CylinderGeometry(0.13, 0.16, 2.8, 6), woodC, local(I, sx, sy + 1.4, sz));
  exitsOf(def).forEach((e, i) => {
    const a = Math.atan2(e.x, e.z);
    B.add(new THREE.BoxGeometry(0.08, 0.32, 1.3), 0xb08a5a, local(I, sx, sy + 2.5 - i * 0.38, sz, 0, a, 0).multiply(local(I, 0, 0, 0.55)));
  });
}

// 段階4: 遠景の象徴（迷宮区の塔）・重なる遠い丘・木漏れ日の光の筋・蝶
function farAndLight(group, anims, ctx) {
  const { def, fdef, plan, heightAt } = ctx;
  const R = plan.R, fogC = new THREE.Color(fdef.fog);
  const far = new THREE.Group();
  const mat = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(fogC, k), fog: false });
  // 重なる遠い丘（遠いほど霞む）
  for (let ring = 0; ring < 3; ring++) {
    const m = mat(fdef.ground, 0.35 + ring * 0.2);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + R() * 0.2, d = 125 + ring * 50 + R() * 15, s = 18 + R() * 12 + ring * 8;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
      h.position.set(Math.sin(a) * d, -2, -Math.cos(a) * d); h.scale.set(s, 8 + R() * 14 + ring * 6, s * 0.8); far.add(h);
    }
  }
  // 迷宮区の塔（北の出口の方向。どこからでも見える）
  const T = def.scape.tower;
  if (T) {
    const a = T.ang * Math.PI / 180, x = Math.sin(a) * T.dist, z = -Math.cos(a) * T.dist;
    const stoneM = mat(0xb8b4c8, 0.3), roofM = mat(0x5a5a8a, 0.3);
    const tw = new THREE.Group(); tw.position.set(x, 0, z);
    const part = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; tw.add(o); };
    part(new THREE.CylinderGeometry(7, 10, T.h, 10), stoneM, T.h / 2);
    for (let k = 1; k < 4; k++) part(new THREE.CylinderGeometry(8.4 - k * 0.6, 8.4 - k * 0.6, 1.5, 10), roofM, T.h * k / 4);
    part(new THREE.ConeGeometry(8, 18, 10), roofM, T.h + 9);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), glow(new THREE.Color(0x9ad8ff).multiplyScalar(1.6)));
    beacon.position.y = T.h + 20; beacon.material.fog = false; tw.add(beacon);
    far.add(tw);
    anims.push((t) => beacon.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15));
  }
  far.traverse((o) => { o.castShadow = o.receiveShadow = false; });
  group.add(far);
  // 木漏れ日: 林の上から斜めに差す光の板（ゆっくり明滅）
  const shaftM = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const groves = plan.clusters.filter((c) => c.kind === 'grove');
  groves.forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + R() * 1.2, 14), shaftM.clone());
      const x = c.x + (R() - 0.5) * c.r, z = c.z + (R() - 0.5) * c.r;
      sh.position.set(x, heightAt(x, z) + 6, z); sh.rotation.set(0, R() * Math.PI, 0.35);
      group.add(sh);
      const ph = i * 1.7 + k;
      anims.push((t) => { sh.material.opacity = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.6 + ph)); });
    }
  });
  // 蝶（花畑の上をひらひら）
  const beds = plan.clusters.filter((c) => c.kind === 'beds');
  if (beds.length) {
    const n = beds.length * 6;
    const fly = motes(n, 0xfff0b0, 0.35, (i, t, v) => {
      const c = beds[i % beds.length], a = t * (0.6 + (i % 5) * 0.1) + i * 2.3, rr = c.r * (0.4 + (i % 3) * 0.25);
      v.set(c.x + Math.sin(a) * rr, heightAt(c.x, c.z) + 0.8 + Math.abs(Math.sin(t * 5 + i)) * 0.5, c.z + Math.cos(a * 1.3) * rr);
    });
    group.add(fly);
    anims.push((t) => fly.update(t));
  }
}
