// トゥーン調のキャラクター / 武器 / モンスター（プリミティブ＋押し出し形状で造形）
import * as THREE from 'three';
import { animatePlayer } from './player-motion.js';
export { animatePlayer } from './player-motion.js';
import { GRIP_Y } from './weapon-pose.js';
import { RARITIES } from '../shared/data.js';
import { toon, glow, outline, compact, gradientMap } from './toon.js';

function mesh(geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = true;
  return m;
}
const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);
const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1, r2, h, seg = 14, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
function extrude(pts, depth, bevel = 0.012) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const finish = (root, w = 1) => { compact(root); outline(root, w); return root; };


function bowString(g, tip, sx, color) {
  const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(sx, -tip, 0), new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx, tip, 0),
  ]), new THREE.LineBasicMaterial({ color }));
  g.add(string);
  const arrow = new THREE.Group();
  arrow.add(mesh(cyl(.008, .008, .72, 5), toon(0xd9c7a0), [.36, 0, 0], [0, 0, -Math.PI / 2]));
  arrow.add(mesh(cone(.025, .10, 5), toon(0xdfe7f0), [.76, 0, 0], [0, 0, -Math.PI / 2]));
  arrow.visible = false;g.add(arrow);
  g.userData.bow = { string, arrow, sx, tip };
}

// ---------------------------------------------------------------------------
// 武器
// ---------------------------------------------------------------------------
// 武器の形のバリエーション（style 1・2 = 形違い、3 = 伝説・神器の専用形）。style 0 は基本形（makeWeapon 内）
function weaponVariant(kind, style, C) {
  const { g, steel, gold, grip, gem, edge, handle, rc, rarity } = C;
  const glowM = (k = 1) => glow(rc.clone().multiplyScalar(k));
  const blade = (pts, depth, y = 0.12, mat = steel) => { edge(pts.map(([x, yy]) => [x, yy]), depth); const m = mesh(extrude(pts, depth), mat, [0, y, 0]); g.add(m); return m; };
  if (kind === 'sword') {
    if (style === 1) { // 刀: 反りのある片刃
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x + 0.045, y]); }
      for (let i = 10; i >= 0; i--) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x - (t > 0.92 ? 0 : 0.03), y]); }
      blade(pts, 0.03);
      g.add(mesh(cyl(0.1, 0.1, 0.03, 14), gold, [0, 0.1, 0], [Math.PI / 2, 0, 0]));
      handle(0.5, 0.032);
      return true;
    }
    if (style === 2) { // 幅広の葉形
      blade([[-0.06, 0], [0.06, 0], [0.13, 0.55], [0.1, 0.95], [0, 1.25], [-0.1, 0.95], [-0.13, 0.55]], 0.04);
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), gold, [0, 0.08, 0]));
      g.add(mesh(sphere(0.05, 10, 8), gem, [0, 0.08, 0.05]));
      handle(0.38);
      return true;
    }
    if (style === 3) { // 専用: 光の結晶の刃と翼の鍔
      const pts = [[-0.07, 0], [0.07, 0], [0.09, 0.8], [0.04, 1.3], [0, 1.5], [-0.04, 1.3], [-0.09, 0.8]];
      blade(pts, 0.03, 0.12, glowM(1.3));
      g.add(mesh(extrude(pts.map(([x, y]) => [x * 0.55, y * 0.96]), 0.045), steel, [0, 0.14, 0]));
      for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.42, 0.18], [0.36, 0.05], [0.5, -0.02], [0.2, -0.06]].map(([x, y]) => [x * s, y]), 0.03), gold, [0, 0.08, 0]));
      g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 0.1, 0.03]));
      handle(0.42);
      return true;
    }
  }
  if (kind === 'greatsword') {
    if (style === 1) { // 大包丁: 四角い幅広の刃
      blade([[-0.18, 0], [0.18, 0], [0.24, 1.8], [-0.05, 2.0], [-0.24, 1.75]], 0.07);
      g.add(mesh(cyl(0.05, 0.05, 0.08, 12), gold, [0.1, 1.6, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.16), gold, [0, 0.08, 0]));
      handle(0.6, 0.05);
      return true;
    }
    if (style === 2) { // ツヴァイハンダー: 細長い刃と返し
      blade([[-0.1, 0], [0.1, 0], [0.11, 2.1], [0, 2.45], [-0.11, 2.1]], 0.05);
      for (const s of [-1, 1]) g.add(mesh(cone(0.04, 0.2, 6), steel, [s * 0.16, 0.5, 0], [0, 0, -s * 1.57]));
      g.add(mesh(new THREE.BoxGeometry(0.95, 0.07, 0.1), gold, [0, 0.08, 0]));
      handle(0.75, 0.042);
      return true;
    }
    if (style === 3) { // 専用: 波打つ炎の刃（フランベルジュ）
      const L = 2.3, pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([0.17 + Math.sin(t * 18) * 0.04 - t * 0.08, t * L]); }
      pts.push([0, L + 0.25]);
      for (let i = 12; i >= 0; i--) { const t = i / 12; pts.push([-(0.17 + Math.sin(t * 18 + 1) * 0.04 - t * 0.08), t * L]); }
      blade(pts, 0.06);
      g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.8, 0.08), glowM(1.4), [0, 0.12 + L * 0.42, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16, Math.PI), gold, [0, 0.0, 0], [0, 0, Math.PI]));
      g.add(mesh(sphere(0.08, 10, 8), gem, [0, 0.1, 0.07]));
      handle(0.6, 0.048);
      return true;
    }
  }
  if (kind === 'spear') {
    const shaft = (len, col = 0x6a4428) => g.add(mesh(cyl(0.035, 0.04, len, 8), toon(col), [0, len / 2 - 0.5, 0]));
    if (style === 1) { // ハルバード: 斧頭と突起
      shaft(2.9);
      blade([[0, 0], [0.06, 0.25], [0, 0.6], [-0.06, 0.25]].map(([x, y]) => [x, y]), 0.04, 2.4);
      blade([[0.03, -0.18], [0.42, -0.3], [0.48, 0], [0.42, 0.3], [0.03, 0.18]], 0.05, 2.2);
      g.add(mesh(cone(0.04, 0.22, 6), steel, [-0.13, 2.2, 0], [0, 0, 1.57]));
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10), gold, [0, 2.0, 0], [Math.PI / 2, 0, 0]));
      return true;
    }
    if (style === 2) { // 三叉槍
      shaft(2.8, 0x4a4a58);
      for (const s of [-1, 0, 1]) blade([[-0.035, 0], [0.035, 0], [0, s ? 0.45 : 0.6]], 0.03, 2.35 + (s ? 0 : 0.05)).position.x = s * 0.15;
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), gold, [0, 2.33, 0]));
      g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.26, 0]));
      return true;
    }
    if (style === 3) { // 専用: 翼のある光の槍
      shaft(3.1, 0xe8e0d0);
      blade([[0, 0], [0.12, 0.25], [0.06, 0.8], [0, 1.0], [-0.06, 0.8], [-0.12, 0.25]], 0.04, 2.45, glowM(1.3));
      for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.4, 0.3], [0.3, 0.1], [0.45, 0.05], [0.1, -0.1]].map(([x, y]) => [x * s, y]), 0.025), gold, [0, 2.35, 0]));
      g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 2.38, 0]));
      return true;
    }
  }
  if (kind === 'axe') {
    const haft = (len) => g.add(mesh(cyl(0.05, 0.06, len, 8), toon(0x5a3a22), [0, len / 2 - 0.3, 0]));
    if (style === 1) { // 髭斧: 片刃で下に伸びる刃
      haft(1.9);
      blade([[0, 0.2], [0.35, 0.3], [0.6, 0.1], [0.55, -0.45], [0.3, -0.6], [0.25, -0.2], [0, -0.1]], 0.07, 1.4);
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.36, 0.12), gold, [0, 1.42, 0]));
      return true;
    }
    if (style === 2) { // 戦鎚
      haft(1.8);
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.34, 0.34), steel, [0, 1.45, 0]));
      for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), gold, [s * 0.32, 1.45, 0]));
      g.add(mesh(cone(0.08, 0.3, 6), steel, [0, 1.75, 0]));
      if (rarity >= 3) g.add(mesh(new THREE.BoxGeometry(0.64, 0.06, 0.36), glowM(1.2), [0, 1.45, 0]));
      return true;
    }
    if (style === 3) { // 専用: ルーンの大三日月
      haft(2.0);
      const b = [[0, -0.42], [0.3, -0.55], [0.75, -0.8], [0.85, 0], [0.75, 0.8], [0.3, 0.55], [0, 0.42]];
      blade(b, 0.07, 1.45);
      blade(b.map(([x, y]) => [-x, y]), 0.07, 1.45);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), glowM(1.5), [0.45, 1.45 + (i - 1) * 0.22, 0]));
      g.add(mesh(new THREE.OctahedronGeometry(0.1), gem, [0, 1.45, 0.06]));
      return true;
    }
  }
  if (kind === 'bow') {
    const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
    const string = (tip, sx) => bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
    if (style === 1 || style === 2) { // 1: リカーブ（先端が反る） 2: ロングボウ（長い）
      const R = style === 2 ? 1.25 : 0.75, arc = style === 2 ? Math.PI * 0.62 : Math.PI * 0.66;
      const limb = new THREE.TorusGeometry(R, style === 2 ? 0.04 : 0.05, 6, 28, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
      g.add(mesh(limb, wood));
      const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
      if (style === 1) for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI * 0.8), wood, [sx + 0.1, s * tip, 0], [0, 0, s > 0 ? 0.3 : Math.PI - 0.3]));
      string(tip, sx);
      g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip));
      g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
      return true;
    }
    if (style === 3) { // 専用: 三日月と刃の翼
      const R = 0.85, arc = Math.PI * 0.8;
      const limb = new THREE.TorusGeometry(R, 0.05, 6, 32, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
      g.add(mesh(limb, toon(0xe8e0d0)));
      const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
      for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.18, 0.1 * s], [0.35, 0.45 * s], [0.12, 0.25 * s]], 0.025), glowM(1.3), [0.02, s * 0.2, 0]));
      string(tip, sx);
      g.add(mesh(cyl(0.06, 0.06, 0.3, 8), gold));
      g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0.06, 0, 0]));
      return true;
    }
  }
  if (kind === 'dagger') {
    if (style === 1) { // クナイ: 菱形の刃と輪の柄頭
      blade([[0, 0], [0.07, 0.25], [0, 0.65], [-0.07, 0.25]], 0.035);
      g.add(mesh(cyl(0.028, 0.028, 0.3, 8), grip, [0, -0.08, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 12), gold, [0, -0.28, 0]));
      return true;
    }
    if (style === 2) { // クリス: 波打つ刃
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.05 + Math.sin(t * 14) * 0.025 - t * 0.04, t * 0.7]); }
      pts.push([0, 0.78]);
      for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push([-(0.05 + Math.sin(t * 14 + 1.2) * 0.025 - t * 0.04), t * 0.7]); }
      blade(pts, 0.03);
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), gold, [0, 0.1, 0]));
      handle(0.28, 0.028);
      return true;
    }
    if (style === 3) { // 専用: 月の形の双刃
      blade([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]], 0.03, 0.12, glowM(1.2));
      g.add(mesh(extrude([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]].map(([x, y]) => [-x * 0.7, y * 0.8]), 0.025), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.OctahedronGeometry(0.05), gem, [0, 0.1, 0.03]));
      handle(0.3, 0.03);
      return true;
    }
  }
  return false;
}

// 装備から武器の形を決める: 伝説・神器は専用形（3）、それ以外は名前から 0〜2
export function weaponStyle(it) {
  if (!it) return 0;
  if (it.rarity >= 4) return 3;
  const s = [...String(it.name || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return s % 3;
}

export function makeWeapon(kind, rarity = 0, style = 0) {
  const g = new THREE.Group();
  const rc = new THREE.Color(RARITIES[rarity].color);
  const steel = toon(rarity >= 4 ? new THREE.Color(0xe8eef6).lerp(rc, 0.35) : 0xdfe7f0, rarity >= 3 ? { emissive: rc, emissiveIntensity: 0.15 + (rarity - 3) * 0.15 } : {});
  const gold = toon(rarity >= 3 ? 0xf2c14e : 0x9a7a4a);
  const grip = toon(0x3a2418);
  const gem = glow(rc.clone().multiplyScalar(rarity >= 2 ? 1.6 : 1));
  const edge = (pts, depth) => {
    if (rarity < 3) return;
    const e = mesh(extrude(pts, depth * 0.4, 0), glow(rc.clone().multiplyScalar(0.9 + (rarity - 3) * 0.2)));
    e.scale.set(1.18, 1.03, 1); e.position.y = -0.02; e.userData.noOutline = true; e.userData.keep = true;
    g.add(e);
  };
  const handle = (len, r = 0.035) => {
    g.add(mesh(cyl(r, r * 1.1, len, 8), grip, [0, -len / 2 + 0.05, 0]));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(r * 1.05, 0.008, 4, 10), gold, [0, -len * (0.15 + i * 0.22) + 0.05, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(sphere(r * 1.6, 10, 8), gold, [0, -len + 0.03, 0]));
  };
  if (style && weaponVariant(kind, style, { g, steel, gold, grip, gem, edge, handle, rc, rarity })) return finish(g, 0.8);
  switch (kind) {
    case 'greatsword': {
      const w = 0.17, L = 2.2;
      const pts = [[-w, 0], [w, 0], [w * 1.1, L * 0.55], [w * 0.8, L - 0.35], [0, L], [-w * 0.8, L - 0.35], [-w * 1.1, L * 0.55]];
      edge(pts, 0.06);
      g.add(mesh(extrude(pts, 0.06), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.7, 0.075), toon(0x9aa4b4), [0, 0.12 + L * 0.38, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.78, 0.1, 0.14), gold, [0, 0.1, 0]));
      for (const s of [-1, 1]) g.add(mesh(cone(0.06, 0.22, 6), gold, [s * 0.45, 0.13, 0], [0, 0, -s * 1.3]));
      g.add(mesh(sphere(0.07, 10, 8), gem, [0, 0.1, 0.07]));
      handle(0.55, 0.045);
      break;
    }
    case 'spear': {
      g.add(mesh(cyl(0.035, 0.04, 2.9, 8), toon(0x6a4428), [0, 0.95, 0]));
      for (const y of [0.1, 0.55, 2.3]) g.add(mesh(new THREE.TorusGeometry(0.045, 0.014, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
      const pts = [[0, 0], [0.11, 0.18], [0.07, 0.55], [0, 0.78], [-0.07, 0.55], [-0.11, 0.18]];
      edge(pts.map(([x, y]) => [x, y + 2.42]), 0.04);
      g.add(mesh(extrude(pts, 0.04), steel, [0, 2.42, 0]));
      g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.4, 0]));
      const tassel = mesh(cone(0.08, 0.35, 8), toon(rarity >= 2 ? rc : 0xb03030), [0, 2.18, 0], [Math.PI, 0, 0]);
      g.add(tassel);
      break;
    }
    case 'axe': {
      g.add(mesh(cyl(0.05, 0.06, 1.9, 8), toon(0x5a3a22), [0, 0.65, 0]));
      for (const y of [0.0, 1.45]) g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
      // 三日月形の刃（両刃）
      const blade = [[0, -0.32], [0.18, -0.36], [0.5, -0.55], [0.62, -0.1], [0.62, 0.1], [0.5, 0.55], [0.18, 0.36], [0, 0.32]];
      edge(blade.map(([x, y]) => [x + 0.04, y + 1.45]), 0.07);
      g.add(mesh(extrude(blade, 0.07), steel, [0.04, 1.45, 0]));
      g.add(mesh(extrude(blade.map(([x, y]) => [x * 0.6, y * 0.7]), 0.07), steel, [-0.04, 1.45, 0], [0, Math.PI, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.12), gold, [0, 1.45, 0]));
      g.add(mesh(cone(0.06, 0.3, 6), steel, [0, 1.75, 0]));
      g.add(mesh(sphere(0.06, 8, 6), gem, [0, 1.45, 0.07]));
      break;
    }
    case 'bow': {
      const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
      const R = 0.8, arc = Math.PI * 0.72;
      const limb = new THREE.TorusGeometry(R, 0.045, 6, 28, arc);
      limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
      g.add(mesh(limb, wood));
      const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
      bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
      g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip, [0, 0, 0]));
      for (const s of [-1, 1]) g.add(mesh(sphere(0.06, 8, 6), gold, [sx, s * tip, 0]));
      g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
      break;
    }
    case 'dagger': {
      const pts = [[-0.06, 0], [0.065, 0], [0.07, 0.4], [0.02, 0.72], [-0.04, 0.5]];
      edge(pts, 0.03);
      g.add(mesh(extrude(pts, 0.03), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), gold, [0, 0.1, 0]));
      g.add(mesh(sphere(0.035, 8, 6), gem, [0, 0.11, 0.03]));
      handle(0.3, 0.03);
      break;
    }
    default: {
      const w = 0.075, L = 1.3;
      const pts = [[-w, 0], [w, 0], [w, L - 0.22], [0, L], [-w, L - 0.22]];
      edge(pts, 0.035);
      g.add(mesh(extrude(pts, 0.035), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.022, L * 0.7, 0.05), toon(0x9aa4b4), [0, 0.12 + L * 0.4, 0]));
      const guard = mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 16, Math.PI * 0.7), gold, [0, -0.05, 0], [0, 0, Math.PI * 0.15]);
      g.add(guard);
      g.add(mesh(sphere(0.05, 10, 8), gem, [0, 0.1, 0.04]));
      handle(0.42);
    }
  }
  return finish(g, 0.8);
}

// ---------------------------------------------------------------------------
// プレイヤー（デフォルメ頭身）
// ---------------------------------------------------------------------------
export function makePlayer(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const cloth = toon(c), clothD = toon(c.clone().multiplyScalar(0.55)), coat = toon(c.clone().lerp(new THREE.Color(0x15161e), 0.7), { side: THREE.DoubleSide });
  const skin = toon(0xffd9bf), hairM = toon(c.clone().lerp(new THREE.Color(0x2a1f2c), 0.75));
  const leather = toon(0x4a3020), metal = toon(0xc8d0dc), gold = toon(0xe0b04a);

  // 胴体
  body.add(mesh(lathe([[0, 0.92], [0.24, 0.94], [0.27, 1.05], [0.25, 1.25], [0.28, 1.38], [0.2, 1.5], [0, 1.52]]), cloth));
  body.add(mesh(lathe([[0.2, 1.12], [0.285, 1.2], [0.3, 1.33], [0.22, 1.47]], 16), metal, null, [0, 0, 0], [1, 1, 0.8]));
  body.add(mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 20), leather, [0, 0.98, 0], [Math.PI / 2, 0, 0]));
  body.add(mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), gold, [0, 0.98, 0.27]));
  const skirt = mesh(cyl(0.27, 0.44, 0.58, 18, true), coat, [0, 0.72, -0.01]);
  skirt.userData.noOutline = true; body.add(skirt);
  for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, [s * 0.3, 1.43, 0], [0, 0, -s * 0.5], [1, 0.75, 1]));
  body.add(mesh(cyl(0.08, 0.09, 0.12, 10), skin, [0, 1.55, 0]));
  const scarf = mesh(new THREE.TorusGeometry(0.14, 0.055, 8, 16), cloth, [0, 1.53, 0], [Math.PI / 2, 0, 0]); body.add(scarf);
  body.add(mesh(capsule(0.05, 0.25, 6), cloth, [0.1, 1.38, -0.16], [0.5, 0, 0.3]));

  // 頭
  const head = new THREE.Group(); head.position.y = 1.83; body.add(head);
  head.add(mesh(sphere(0.33, 20, 16), skin, null, null, [1, 1.02, 0.98]));
  head.add(mesh(new THREE.SphereGeometry(0.355, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, [0, 0.03, -0.02], [-0.2, 0, 0]));
  const spikes = [[0, 0.32, -0.12, -0.6, 0], [0.18, 0.26, -0.18, -0.9, 0.5], [-0.18, 0.26, -0.18, -0.9, -0.5], [0.28, 0.08, -0.12, -0.4, 1.3], [-0.28, 0.08, -0.12, -0.4, -1.3], [0, 0.12, -0.32, -1.6, 0], [0.15, -0.05, -0.28, -2.2, 0.4], [-0.15, -0.05, -0.28, -2.2, -0.4]];
  for (const [x, y, z, rx, rz] of spikes) head.add(mesh(cone(0.1, 0.32, 7), hairM, [x, y, z], [rx, 0, rz]));
  for (const [x, rz] of [[-0.16, 0.25], [0, 0], [0.16, -0.25], [0.26, -0.5], [-0.26, 0.5]]) head.add(mesh(cone(0.075, 0.26, 6), hairM, [x, 0.12, 0.25], [2.6, 0, rz]));
  const eyeW = glow(0xffffff), eyeD = glow(c.clone().lerp(new THREE.Color(0x101018), 0.6));
  for (const s of [-1, 1]) {
    head.add(mesh(sphere(0.062, 12, 10), eyeD, [s * 0.12, -0.02, 0.29], null, [0.85, 1.25, 0.4]));
    head.add(mesh(sphere(0.02, 6, 4), eyeW, [s * 0.12 + 0.02, 0.02, 0.315]));
    head.add(mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), hairM, [s * 0.12, 0.09, 0.3], [0, 0, s * 0.15]));
  }
  head.add(mesh(sphere(0.03, 6, 4), toon(0xffb0a0), [0, -0.13, 0.31], null, [1.2, 0.5, 0.5]));

  // 脚
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0.92, 0);
    leg.add(mesh(capsule(0.1, 0.28, 10), clothD, [0, -0.22, 0]));
    leg.add(mesh(capsule(0.105, 0.18, 10), leather, [0, -0.6, 0]));
    leg.add(mesh(sphere(0.11, 10, 8), leather, [0, -0.8, 0.07], null, [1, 0.6, 1.5]));
    leg.add(mesh(new THREE.TorusGeometry(0.11, 0.02, 5, 12), gold, [0, -0.48, 0], [Math.PI / 2, 0, 0]));
    body.add(leg); legs.push(leg);
  }
  // 腕
  const mkArm = (side) => {
    const arm = new THREE.Group();arm.position.set(side * 0.36, 1.4, 0);
    arm.add(mesh(capsule(0.072, 0.2, 8), cloth, [0, -0.15, 0]));
    const elbow = new THREE.Group();elbow.position.y = -.30;arm.add(elbow);
    elbow.add(mesh(sphere(.073, 8, 6), clothD));
    elbow.add(mesh(capsule(.068, .18, 8), clothD, [0, -.11, 0]));
    elbow.add(mesh(cyl(.085, .08, .1, 10), leather, [0, -.20, 0]));
    const hand = new THREE.Group();hand.position.y = -.30;elbow.add(hand);
    hand.add(mesh(sphere(.07, 10, 8), leather));
    arm.userData = { elbow, hand };body.add(arm);return arm;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const elbowL = armL.userData.elbow, elbowR = armR.userData.elbow;
  const hand = armR.userData.hand, handL = armL.userData.hand;
  // 背中のマント
  const cape = mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.0, 14, 4, true, Math.PI * 0.7, Math.PI * 0.6), coat, [0, 0.98, -0.02]);
  cape.userData.noOutline = true; cape.userData.keep = true; body.add(cape);

  const ring = mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
  ring.castShadow = false; root.add(ring);

  finish(body, 1);
  root.userData = { body, legs, armL, armR, elbowL, elbowR, hand, handL, head, cape, ring, weapon: null, wKey: '', color: c, armor: null, armorLook: 0 };
  return root;
}

// ---------------------------------------------------------------------------
// 防具の見た目: 軽装・中装・重装 × 2種類（1〜6、0 は防具なし）
// ---------------------------------------------------------------------------
const ARMOR_CLS = { light: 0, medium: 1, heavy: 2 };
const ARMOR_IDS = ['cloth', 'tunic', 'hunter', 'robe', 'ninja', 'bard', 'leather', 'chain', 'scale', 'brigandine', 'ranger', 'dragonhide', 'breast', 'plate', 'knight', 'oyoroi', 'paladin', 'fortress'];
export const ARMOR_LOOK_NAMES = ['なし', 'フード', '忍びの襟巻き', '革の肩当てとマント', '鎖頭巾', '騎士の兜と大肩当て', '角兜と重マント'];
export function armorLook(it) {
  if (!it || it.slot !== 'armor') return 0;
  const cls = ARMOR_CLS[it.armor || 'medium'];
  const idx = Math.max(0, ARMOR_IDS.indexOf(it.atype));
  return cls * 2 + (idx % 2) + 1;
}
export function setPlayerArmor(model, look) {
  const u = model.userData;
  if (u.armorLook === look) return;
  u.armorLook = look;
  if (u.armor) { for (const [parent, g] of u.armor) parent.remove(g); }
  u.armor = [];
  u.cape.visible = true;
  if (!look) return;
  const c = u.color || new THREE.Color(0x4488ff);
  const cloth = toon(c.clone().lerp(new THREE.Color(0x2a2a3a), 0.35), { side: THREE.DoubleSide });
  const dark = toon(c.clone().lerp(new THREE.Color(0x101018), 0.7), { side: THREE.DoubleSide });
  const leather = toon(0x6a4428), steel = toon(0xc8d0dc), steelD = toon(0x7a8494), gold = toon(0xe0b04a), chain = toon(0x9aa4b2);
  const onBody = new THREE.Group(), onHead = new THREE.Group();
  const add = (grp, m) => { grp.add(m); return m; };
  switch (look) {
    case 1: { // 軽装: フード（頭を覆う布と、肩までの短い肩掛け）
      add(onHead, mesh(new THREE.SphereGeometry(0.43, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, [0, 0.04, -0.04], [-0.35, 0, 0]));
      add(onHead, mesh(cone(0.16, 0.34, 8), cloth, [0, 0.12, -0.42], [-2.2, 0, 0]));
      add(onBody, mesh(cyl(0.3, 0.42, 0.26, 16, true), cloth, [0, 1.42, 0]));
      break;
    }
    case 2: { // 軽装: 忍びの襟巻き（長くたなびく布と口元の覆い）
      add(onHead, mesh(new THREE.SphereGeometry(0.335, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), dark, [0, 0, 0.01]));
      add(onBody, mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 16), toon(0xc03030), [0, 1.56, 0], [Math.PI / 2, 0, 0]));
      for (const s of [-1, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.1, 0.75, 0.025), toon(0xc03030), [s * 0.08, 1.2, -0.3], [0.35, 0, s * 0.12]));
      add(onBody, mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), leather, [0, 1.0, 0]));
      break;
    }
    case 3: { // 中装: 革の肩当てと長いマント
      for (const s of [-1, 1]) {
        add(onBody, mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), leather, [s * 0.33, 1.44, 0], [0, 0, -s * 0.45], [1.1, 0.8, 1.1]));
        add(onBody, mesh(new THREE.TorusGeometry(0.12, 0.02, 5, 12), gold, [s * 0.36, 1.4, 0], [Math.PI / 2, 0, -s * 0.45]));
      }
      add(onBody, mesh(new THREE.CylinderGeometry(0.32, 0.6, 1.35, 14, 4, true, Math.PI * 0.62, Math.PI * 0.76), cloth, [0, 0.85, -0.04]));
      u.cape.visible = false;
      break;
    }
    case 4: { // 中装: 鎖頭巾と胸当て
      add(onHead, mesh(new THREE.SphereGeometry(0.41, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), chain, [0, 0.02, -0.02], [-0.25, 0, 0]));
      add(onBody, mesh(cyl(0.2, 0.33, 0.22, 16), chain, [0, 1.48, 0]));
      add(onBody, mesh(lathe([[0.22, 1.08], [0.29, 1.18], [0.3, 1.32], [0.24, 1.42]], 16), steelD, null, null, [1.03, 1, 0.85]));
      break;
    }
    case 5: { // 重装: 騎士の兜（バイザーと羽飾り）と大きな肩当て
      add(onHead, mesh(new THREE.SphereGeometry(0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.7), steel, [0, 0.03, 0]));
      add(onHead, mesh(new THREE.BoxGeometry(0.46, 0.06, 0.08), steelD, [0, -0.02, 0.33]));
      add(onHead, mesh(new THREE.BoxGeometry(0.05, 0.3, 0.42), toon(0xc03030), [0, 0.42, -0.05]));
      for (const s of [-1, 1]) {
        add(onBody, mesh(new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, [s * 0.36, 1.43, 0], [0, 0, -s * 0.5], [1.2, 0.9, 1.15]));
        add(onBody, mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold, [s * 0.37, 1.39, 0], [0, 0, -s * 0.5], [1.25, 0.6, 1.2]));
      }
      add(onBody, mesh(lathe([[0.24, 1.0], [0.3, 1.15], [0.31, 1.32], [0.25, 1.46]], 16), steel, null, null, [1.04, 1, 0.9]));
      break;
    }
    case 6: { // 重装: 角兜と重いマント、腰当て
      add(onHead, mesh(new THREE.SphereGeometry(0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), steelD, [0, 0.04, 0]));
      for (const s of [-1, 1]) add(onHead, mesh(cone(0.07, 0.42, 8), toon(0xe8dcc0), [s * 0.36, 0.28, 0], [0, 0, -s * 0.9]));
      add(onHead, mesh(new THREE.BoxGeometry(0.1, 0.22, 0.05), gold, [0, 0.12, 0.38]));
      for (const s of [-1, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.3, 0.12, 0.36), steelD, [s * 0.36, 1.46, 0], [0, 0, -s * 0.35]));
      add(onBody, mesh(new THREE.CylinderGeometry(0.36, 0.62, 1.3, 14, 4, true, Math.PI * 0.6, Math.PI * 0.8), dark, [0, 0.88, -0.05]));
      for (const s of [-1, 0, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.2, 0.3, 0.05), steelD, [s * 0.2, 0.76, 0.27 - Math.abs(s) * 0.04], [0.15, s * 0.4, 0]));
      u.cape.visible = false;
      break;
    }
  }
  for (const [parent, g] of [[u.body, onBody], [u.head, onHead]]) {
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outline(g, 1);
    parent.add(g);
    u.armor.push([parent, g]);
  }
}

export function setPlayerWeapon(model, kind, rarity, style = 0) {
  const u = model.userData;
  const key = kind + rarity + ':' + style;
  if (u.wKey === key) return;
  u.wKey = key;
  if (u.weapon) u.weapon.removeFromParent();
  if (u.shield) { u.shield.removeFromParent(); u.shield = null; }
  if (kind === 'spear') u.shield = makeShield(rarity, u.armL);
  const w = makeWeapon(kind, rarity, style);
  u.weaponModel = w;
  u.weapon = new THREE.Group();
  u.weapon.name = kind + '-grip';
  u.weapon.add(w);
  w.position.y = -GRIP_Y[kind];
  w.rotation.y = kind === 'bow' ? -Math.PI / 2 : 0;
  u.wKind = kind;
  (kind === 'bow' ? u.handL : u.hand).add(u.weapon);
  u.elbowL.rotation.set(0, 0, 0);u.elbowR.rotation.set(0, 0, 0);
  animatePlayer(model, { t: 0, moving: false, walkT: 0, kind, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 });

}

// 盾槍の盾（左腕に持つ）
function makeShield(rarity, armL) {
  const rc = new THREE.Color(RARITIES[rarity].color);
  const g = new THREE.Group();
  const face = toon(rarity >= 3 ? new THREE.Color(0x5a6a8a).lerp(rc, 0.3) : 0x5a6a8a);
  const rim = toon(rarity >= 3 ? 0xf2c14e : 0xb8c0cc);
  g.add(mesh(extrude([[-0.42, 0.55], [0.42, 0.55], [0.42, -0.1], [0, -0.62], [-0.42, -0.1]], 0.08), face));
  g.add(mesh(extrude([[-0.12, 0.25], [0.12, 0.25], [0.12, -0.05], [0, -0.3], [-0.12, -0.05]], 0.03, 0), rarity >= 2 ? glow(rc.clone().multiplyScalar(1.2)) : rim, [0, 0, 0.06]));
  g.add(mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 20, Math.PI), rim, [0, 0.05, 0.02], [0, 0, 0], [0.85, 1, 1]));
  finish(g, 0.9);
  // ガード中だけ光る縁（ガードゲージの残りで 青 → 黄 → 赤）。この盾だけの材質にする
  const gm = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const gl = new THREE.Mesh(extrude([[-0.48, 0.61], [0.48, 0.61], [0.48, -0.13], [0, -0.7], [-0.48, -0.13]], 0.02, 0), gm);
  gl.position.z = 0.1; gl.renderOrder = 2;
  g.add(gl);
  g.userData.gauge = gm;
  // 腕の外側に、面を前へ向けて持つ
  g.position.set(-0.08, -0.14, 0.12);
  g.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  armL.userData.elbow.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// モンスター
// ---------------------------------------------------------------------------
export function makeMob(t, color, scale = 1, accent = null, boss = false) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const ac = new THREE.Color(accent ?? 0xff4030);
  const m = toon(c), mD = toon(c.clone().multiplyScalar(0.55)), mL = toon(c.clone().lerp(new THREE.Color(0xffffff), 0.35));
  const eyeM = glow(ac.clone().multiplyScalar(1.6));
  const horn = toon(0xf0e6d0);
  const parts = { body, root };
  switch (t) {
    case 'slime': {
      const jelly = toon(c, { transparent: true, opacity: 0.82 });
      const b = new THREE.Group(); b.position.y = 0.55; body.add(b);
      b.add(mesh(lathe([[0, -0.55], [0.55, -0.5], [0.78, -0.25], [0.72, 0.1], [0.5, 0.42], [0.18, 0.62], [0, 0.66]], 24), jelly));
      b.add(mesh(sphere(0.32, 14, 10), mD, [0, -0.15, 0]));
      b.add(mesh(sphere(0.14, 10, 8), glow(0xffffff), [-0.3, 0.32, 0.38], null, [1, 0.6, 0.4]));
      for (const s of [-1, 1]) {
        b.add(mesh(sphere(0.1, 12, 10), glow(0x15101a), [s * 0.22, 0.08, 0.62], null, [0.8, 1.2, 0.5]));
        b.add(mesh(sphere(0.035, 6, 4), glow(0xffffff), [s * 0.22 + 0.03, 0.13, 0.67]));
      }
      b.add(mesh(new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI), glow(0x15101a), [0, -0.08, 0.66], [0, 0, Math.PI]));
      for (let i = 0; i < 5; i++) { const a = i * 1.25; b.add(mesh(sphere(0.12, 8, 6), jelly, [Math.sin(a) * 0.68, -0.48, Math.cos(a) * 0.68])); }
      parts.squash = b;
      break;
    }
    case 'beast': {
      body.add(mesh(capsule(0.42, 0.9, 14), m, [0, 1.0, -0.05], [Math.PI / 2, 0, 0], [1, 1, 0.95]));
      body.add(mesh(sphere(0.47, 14, 12), m, [0, 1.12, 0.45], null, [1, 1, 0.9]));
      body.add(mesh(sphere(0.3, 12, 10), mL, [0, 0.92, 0.72], null, [1, 0.8, 0.7]));
      const head = new THREE.Group(); head.position.set(0, 1.35, 0.95); body.add(head);
      head.add(mesh(sphere(0.36, 14, 12), m, null, null, [1, 0.95, 1.05]));
      head.add(mesh(capsule(0.17, 0.3, 10), mL, [0, -0.1, 0.35], [Math.PI / 2, 0, 0]));
      head.add(mesh(sphere(0.07, 8, 6), toon(0x1a1418), [0, -0.05, 0.56]));
      head.add(mesh(new THREE.BoxGeometry(0.22, 0.04, 0.3), toon(0xf4ece0), [0, -0.24, 0.3]));
      for (const s of [-1, 1]) {
        head.add(mesh(sphere(0.06, 8, 6), eyeM, [s * 0.16, 0.08, 0.3], null, [1, 0.7, 0.6]));
        head.add(mesh(cone(0.1, 0.3, 6), m, [s * 0.2, 0.36, -0.05], [-0.2, 0, -s * 0.35]));
        head.add(mesh(cone(0.04, 0.18, 6), horn, [s * 0.08, -0.25, 0.42], [Math.PI, 0, 0]));
        if (boss) head.add(mesh(cone(0.09, 0.6, 8), horn, [s * 0.25, 0.3, 0.05], [-0.7, 0, -s * 0.6]));
      }
      parts.head = head;
      for (let i = 0; i < 5; i++) body.add(mesh(cone(0.09, 0.32 - i * 0.03, 6), mD, [0, 1.45 - i * 0.04, 0.5 - i * 0.28], [-0.5, 0, 0]));
      parts.legs = [];
      for (const [x, z] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.5], [0.3, -0.5]]) {
        const leg = new THREE.Group(); leg.position.set(x, 0.85, z);
        leg.add(mesh(capsule(0.14, 0.3, 8), m, [0, -0.2, 0]));
        leg.add(mesh(capsule(0.1, 0.25, 8), mD, [0, -0.55, 0.03]));
        leg.add(mesh(sphere(0.12, 8, 6), mD, [0, -0.75, 0.08], null, [1, 0.5, 1.3]));
        body.add(leg); parts.legs.push(leg);
      }
      const tail = new THREE.Group(); tail.position.set(0, 1.15, -0.85); body.add(tail);
      for (let i = 0; i < 5; i++) tail.add(mesh(sphere(0.13 - i * 0.018, 8, 6), i === 4 ? mL : m, [0, i * 0.12, -i * 0.14]));
      parts.tail = tail;
      if (boss) {
        for (const s of [-1, 1]) {
          const wing = new THREE.Group(); wing.position.set(s * 0.35, 1.5, 0.1); body.add(wing);
          const wm = toon(ac.clone().lerp(new THREE.Color(0x200810), 0.55), { side: THREE.DoubleSide });
          const w = mesh(extrude([[0, 0], [0.7, 0.55], [1.7, 0.75], [2.0, -0.15], [1.55, -0.2], [1.3, -0.55], [0.95, -0.3], [0.65, -0.7], [0.3, -0.35]], 0.02, 0), wm, null, [0, 0, 0], [s, 1, 1]);
          wing.add(w);
          const bone = toon(c.clone().multiplyScalar(0.5));
          wing.add(mesh(capsule(0.06, 1.75, 6), bone, [s * 0.85, 0.375, 0], [0, 0, -s * Math.atan2(1.7, 0.75)]));
          for (const [ex, ey] of [[2.0, -0.15], [1.3, -0.55], [0.65, -0.7]]) {
            const len = Math.hypot(ex - 1.7, ey - 0.75);
            wing.add(mesh(capsule(0.035, len, 5), bone, [s * (1.7 + ex) / 2, (0.75 + ey) / 2, 0], [0, 0, -s * Math.atan2(ex - 1.7, ey - 0.75)]));
          }
          wing.add(mesh(cone(0.07, 0.3, 6), horn, [s * 1.75, 0.9, 0], [0, 0, -s * 0.3]));
          wing.rotation.x = -0.3;
          parts.wings = parts.wings || []; parts.wings.push(wing);
        }
      }
      break;
    }
    case 'golem': {
      const rock = toon(c, { flatShading: true }), rockD = toon(c.clone().multiplyScalar(0.6), { flatShading: true });
      const rune = glow(ac.clone().multiplyScalar(1.5));
      body.add(mesh(new THREE.DodecahedronGeometry(0.85, 1), rock, [0, 1.65, 0], [0.3, 0.4, 0], [1.25, 1, 0.9]));
      body.add(mesh(new THREE.DodecahedronGeometry(0.5, 0), rockD, [0, 1.0, 0], null, [1.2, 0.8, 0.9]));
      body.add(mesh(new THREE.DodecahedronGeometry(0.34, 0), rock, [0, 2.55, 0.15], [0.2, 0.7, 0]));
      for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), rune, [s * 0.13, 2.58, 0.45]));
      body.add(mesh(new THREE.OctahedronGeometry(0.2), rune, [0, 1.7, 0.78]));
      for (let i = 0; i < 3; i++) body.add(mesh(new THREE.BoxGeometry(0.5 - i * 0.12, 0.035, 0.03), rune, [0, 1.35 + i * 0.15 + (i === 2 ? 0.4 : 0), 0.82]));
      for (let i = 0; i < 4; i++) body.add(mesh(new THREE.OctahedronGeometry(0.15 + Math.random() * 0.1), boss ? rune : rockD, [(Math.random() - 0.5) * 1.4, 2.2 + Math.random() * 0.3, -0.3 - Math.random() * 0.3], [Math.random(), 0, Math.random()], [0.6, 1.6, 0.6]));
      parts.arms = [];
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(s * 1.15, 2.05, 0);
        arm.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), rockD, [0, 0, 0]));
        arm.add(mesh(new THREE.DodecahedronGeometry(0.34, 0), rock, [0, -0.6, 0.05], null, [1, 1.2, 1]));
        arm.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), rock, [0, -1.2, 0.1], [0.5, 0.2, 0]));
        body.add(arm); parts.arms.push(arm);
      }
      for (const s of [-1, 1]) {
        body.add(mesh(new THREE.DodecahedronGeometry(0.32, 0), rockD, [s * 0.42, 0.55, 0], null, [1, 1.3, 1]));
        body.add(mesh(new THREE.DodecahedronGeometry(0.3, 0), rock, [s * 0.45, 0.15, 0.08], null, [1.1, 0.6, 1.3]));
      }
      break;
    }
    case 'wisp': {
      const core = glow(c.clone().multiplyScalar(1.5));
      const shellM = toon(c, { transparent: true, opacity: 0.35, emissive: c, emissiveIntensity: 0.4 });
      const f = new THREE.Group(); f.position.y = 1.6; body.add(f);
      f.add(mesh(sphere(0.42, 18, 14), core));
      f.add(mesh(new THREE.IcosahedronGeometry(0.72, 1), shellM));
      f.add(mesh(cone(0.38, 1.1, 14), shellM, [0, -0.7, -0.15], [Math.PI + 0.4, 0, 0]));
      for (const s of [-1, 1]) {
        f.add(mesh(sphere(0.08, 10, 8), glow(0x0a0814), [s * 0.15, 0.08, 0.38], null, [0.8, 1.3, 0.5]));
        f.add(mesh(cone(0.12, 0.45, 6), shellM, [s * 0.45, 0.3, 0], [0, 0, -s * 0.9]));
      }
      const orbit = new THREE.Group(); f.add(orbit);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; orbit.add(mesh(sphere(0.1, 8, 6), core, [Math.sin(a) * 1, 0, Math.cos(a) * 1])); }
      if (boss) {
        const halo = mesh(new THREE.TorusGeometry(1.2, 0.05, 6, 40), glow(ac.clone().multiplyScalar(1.5)), [0, 0.9, 0], [Math.PI / 2 - 0.3, 0, 0]);
        f.add(halo);
      }
      parts.float = true; parts.shell = orbit;
      break;
    }
    case 'bat': { // コウモリ: 小さな体と、はばたく膜の翼
      const f = new THREE.Group(); f.position.y = 1.5; body.add(f);
      f.add(mesh(sphere(0.32, 14, 10), m, null, null, [1, 0.9, 1.1]));
      f.add(mesh(sphere(0.2, 12, 8), mL, [0, -0.05, 0.22]));
      for (const s of [-1, 1]) {
        f.add(mesh(cone(0.09, 0.28, 6), m, [s * 0.15, 0.3, 0.05], [0, 0, -s * 0.3]));
        f.add(mesh(sphere(0.06, 8, 6), eyeM, [s * 0.1, 0.05, 0.3]));
        f.add(mesh(cone(0.025, 0.08, 4), horn, [s * 0.05, -0.12, 0.33], [Math.PI, 0, 0]));
      }
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Group(); w.position.set(s * 0.25, 0.05, 0); f.add(w);
        w.add(mesh(extrude([[0, 0.1], [0.4, 0.35], [0.85, 0.25], [0.95, -0.1], [0.7, -0.05], [0.55, -0.25], [0.35, -0.1], [0.15, -0.2], [0, -0.1]].map(([x, y]) => [x * s, y]), 0.02, 0), mD, null, [Math.PI / 2, 0, 0]));
        for (const x of [0.4, 0.75]) w.add(mesh(cyl(0.015, 0.015, 0.45, 4), m, [x * s, 0, 0.05], [Math.PI / 2, 0, s * 0.4]));
        wings.push(w);
      }
      parts.wings = wings; parts.float = true; parts.flap = true;
      break;
    }
    case 'mushroom': { // キノコ: 大きな傘を揺らして胞子をまく
      const b = new THREE.Group(); b.position.y = 0.55; body.add(b);
      b.add(mesh(cyl(0.28, 0.36, 0.75, 14), toon(0xf2e6d0), [0, -0.15, 0]));
      const cap = new THREE.Group(); cap.position.y = 0.25; b.add(cap);
      cap.add(mesh(new THREE.SphereGeometry(0.75, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, null, null, [1, 0.7, 1]));
      cap.add(mesh(cyl(0.72, 0.6, 0.08, 20), mD, [0, 0.02, 0]));
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.45 : 0; cap.add(mesh(sphere(0.1, 8, 6), toon(0xfff4e0), [Math.sin(a) * r, 0.45 - r * 0.25, Math.cos(a) * r], null, [1, 0.5, 1])); }
      for (const s of [-1, 1]) {
        b.add(mesh(sphere(0.06, 8, 6), glow(0x201010), [s * 0.12, 0.0, 0.32], null, [0.8, 1.3, 0.5]));
        b.add(mesh(capsule(0.06, 0.1, 6), toon(0xf2e6d0), [s * 0.22, -0.48, 0.08]));
      }
      parts.squash = b; parts.cap = cap;
      break;
    }
    case 'scorpion': { // サソリ: 6本脚、はさみ、反り上がった尾と毒針
      const seg = (r, z, y = 0.45) => body.add(mesh(sphere(r, 12, 8), m, [0, y, z], null, [1.2, 0.6, 1]));
      seg(0.42, 0.2); seg(0.36, -0.25); seg(0.3, -0.62);
      body.add(mesh(sphere(0.3, 12, 8), mD, [0, 0.5, 0.6], null, [1.1, 0.6, 0.9]));
      for (const s of [-1, 1]) body.add(mesh(sphere(0.05, 6, 4), eyeM, [s * 0.1, 0.62, 0.82]));
      const legs = [];
      for (let i = 0; i < 6; i++) {
        const s = i % 2 ? 1 : -1, z = 0.35 - Math.floor(i / 2) * 0.35;
        const leg = new THREE.Group(); leg.position.set(s * 0.35, 0.45, z); body.add(leg);
        leg.add(mesh(capsule(0.05, 0.4, 5), mD, [s * 0.25, -0.12, 0], [0, 0, s * 1.1]));
        leg.add(mesh(capsule(0.045, 0.35, 5), mD, [s * 0.5, -0.32, 0], [0, 0, s * 0.3]));
        legs.push(leg);
      }
      parts.legs = legs;
      const arms = [];
      for (const s of [-1, 1]) {
        const a = new THREE.Group(); a.position.set(s * 0.3, 0.5, 0.7); body.add(a);
        a.add(mesh(capsule(0.07, 0.35, 6), m, [s * 0.1, 0, 0.2], [Math.PI / 2, 0, -s * 0.4]));
        a.add(mesh(sphere(0.16, 10, 8), mL, [s * 0.2, 0, 0.5], null, [1, 0.7, 1.3]));
        a.add(mesh(cone(0.07, 0.3, 6), mL, [s * 0.28, 0, 0.72], [Math.PI / 2, 0, -s * 0.3]));
        a.add(mesh(cone(0.06, 0.25, 6), mL, [s * 0.12, 0, 0.7], [Math.PI / 2, 0, s * 0.3]));
        arms.push(a);
      }
      parts.arms = arms;
      const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.8); body.add(tail);
      let p = tail;
      for (let i = 0; i < 5; i++) {
        const j = new THREE.Group(); j.position.set(0, i ? 0.24 : 0, i ? -0.06 : 0); j.rotation.x = -0.45; p.add(j);
        j.add(mesh(sphere(0.15 - i * 0.015, 10, 8), m, [0, 0.12, 0], null, [1, 1.3, 1]));
        p = j;
      }
      p.add(mesh(cone(0.09, 0.35, 8), glow(ac.clone().multiplyScalar(1.4)), [0, 0.35, 0.12], [0.9, 0, 0]));
      parts.tail = tail;
      break;
    }
    case 'mage': { // 魔術師: ローブとフード、光る杖、周りを回る紋様
      const robe = toon(c), robeD = toon(c.clone().multiplyScalar(0.5));
      body.add(mesh(cone(0.55, 1.5, 16), robe, [0, 0.75, 0]));
      body.add(mesh(cyl(0.56, 0.58, 0.08, 16), toon(0xe0b04a), [0, 0.06, 0]));
      const head = new THREE.Group(); head.position.y = 1.7; body.add(head);
      head.add(mesh(sphere(0.3, 14, 10), robeD, [0, 0, 0], null, [1, 1.1, 1]));
      head.add(mesh(cone(0.3, 0.6, 12), robe, [0, 0.28, -0.12], [-0.5, 0, 0]));
      head.add(mesh(sphere(0.24, 12, 8), glow(0x050508), [0, -0.02, 0.1], null, [1, 0.9, 0.7]));
      for (const s of [-1, 1]) head.add(mesh(sphere(0.045, 6, 4), eyeM, [s * 0.08, 0, 0.3]));
      parts.head = head;
      const arm = new THREE.Group(); arm.position.set(0.42, 1.3, 0.05); body.add(arm);
      arm.add(mesh(capsule(0.08, 0.3, 6), robe, [0, -0.2, 0]));
      arm.add(mesh(cyl(0.03, 0.035, 1.6, 6), toon(0x5a3a22), [0, -0.1, 0.12]));
      arm.add(mesh(new THREE.OctahedronGeometry(0.14), glow(ac.clone().multiplyScalar(1.6)), [0, 0.75, 0.12]));
      parts.arm = arm;
      const orbit = new THREE.Group(); orbit.position.y = 1.0; body.add(orbit);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; orbit.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), glow(ac.clone().multiplyScalar(1.3)), [Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85], [0, a, Math.PI / 4])); }
      parts.shell = orbit; parts.hover = true;
      break;
    }
    default: { // knight
      const armor = toon(c), armorD = toon(c.clone().multiplyScalar(0.55)), trim = toon(boss ? 0xf2c14e : 0xb8c0cc);
      const cloth = toon(ac.clone().lerp(new THREE.Color(0x202020), 0.35), { side: THREE.DoubleSide });
      body.add(mesh(lathe([[0, 0.95], [0.33, 0.98], [0.38, 1.2], [0.42, 1.45], [0.3, 1.7], [0, 1.72]]), armor));
      body.add(mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 18), trim, [0, 1.0, 0], [Math.PI / 2, 0, 0]));
      body.add(mesh(new THREE.BoxGeometry(0.4, 0.75, 0.04), cloth, [0, 0.72, 0.36], [0.08, 0, 0]));
      body.add(mesh(cyl(0.34, 0.45, 0.45, 16, true), armorD, [0, 0.78, 0]));
      const head = new THREE.Group(); head.position.y = 2.0; body.add(head);
      head.add(mesh(lathe([[0, -0.3], [0.26, -0.28], [0.3, -0.05], [0.28, 0.15], [0.16, 0.3], [0, 0.34]], 18), armor));
      head.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.08), eyeM, [0, 0, 0.26]));
      head.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.06), trim, [0, 0.05, 0.28]));
      const plume = new THREE.Group(); plume.position.set(0, 0.3, -0.05); head.add(plume);
      for (let i = 0; i < 4; i++) plume.add(mesh(cone(0.07, 0.45, 6), cloth, [0, 0.1, -i * 0.1], [-0.6 - i * 0.35, 0, 0]));
      if (boss) for (const s of [-1, 1]) head.add(mesh(cone(0.08, 0.7, 8), horn, [s * 0.28, 0.25, 0], [0, 0, -s * 0.7]));
      for (const s of [-1, 1]) {
        body.add(mesh(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor, [s * 0.5, 1.62, 0], [0, 0, -s * 0.4]));
        body.add(mesh(new THREE.TorusGeometry(0.2, 0.03, 5, 14, Math.PI), trim, [s * 0.5, 1.6, 0], [0, Math.PI / 2, -s * 0.4]));
      }
      const legs = [];
      for (const s of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(s * 0.17, 0.95, 0);
        leg.add(mesh(capsule(0.12, 0.3, 8), armorD, [0, -0.22, 0]));
        leg.add(mesh(capsule(0.13, 0.25, 8), armor, [0, -0.62, 0]));
        leg.add(mesh(sphere(0.13, 8, 6), armorD, [0, -0.85, 0.08], null, [1, 0.55, 1.5]));
        body.add(leg); legs.push(leg);
      }
      parts.legs2 = legs;
      const arm = new THREE.Group(); arm.position.set(0.55, 1.55, 0);
      arm.add(mesh(capsule(0.1, 0.25, 8), armorD, [0, -0.18, 0]));
      arm.add(mesh(capsule(0.11, 0.2, 8), armor, [0, -0.45, 0]));
      const sw = makeWeapon(boss ? 'greatsword' : 'sword', boss ? 3 : 1); sw.rotation.set(Math.PI / 2, Math.PI / 2, 0); sw.position.y = -0.62;
      arm.add(sw); body.add(arm); parts.arm = arm;
      const sh = new THREE.Group(); sh.position.set(-0.62, 1.25, 0.15); sh.rotation.y = -0.4; body.add(sh);
      sh.add(mesh(extrude([[-0.32, 0.35], [0.32, 0.35], [0.3, -0.1], [0, -0.5], [-0.3, -0.1]], 0.08), armor, null, [0, Math.PI / 2, 0]));
      sh.add(mesh(extrude([[-0.12, 0.15], [0.12, 0.15], [0, -0.2]], 0.02, 0), toon(ac), [0.06, 0, 0], [0, Math.PI / 2, 0]));
      if (boss) {
        const cape = mesh(new THREE.CylinderGeometry(0.45, 0.85, 1.7, 16, 4, true, Math.PI * 0.7, Math.PI * 0.6), cloth, [0, 0.85, -0.05]);
        cape.userData.noOutline = true; cape.userData.keep = true; body.add(cape); parts.cape = cape;
      }
      break;
    }
  }
  if (boss) {
    const aura = new THREE.PointLight(ac, 3, 12); aura.position.y = 2; root.add(aura);
    parts.aura = aura;
    const sigil = mesh(new THREE.RingGeometry(0.9, 1.0, 40), glow(ac, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }), [0, 0.04, 0], [-Math.PI / 2, 0, 0]);
    sigil.castShadow = false; root.add(sigil); parts.sigil = sigil;
  }
  finish(body, boss ? 0.8 : 1);
  root.scale.setScalar(scale);
  parts.mats = [];
  body.traverse((o) => { if (o.isMesh && o.material.emissive && !o.userData.noOutline) parts.mats.push({ m: o.material, e: o.material.emissive.clone(), ei: o.material.emissiveIntensity }); });
  parts.mats = [...new Map(parts.mats.map((x) => [x.m.uuid, x])).values()];
  root.userData = parts;
  return root;
}

export function animateMob(model, s) {
  const u = model.userData;
  const t = s.t;
  const moving = s.st === 1, wind = s.st === 2, atk = s.st === 3;
  if (u.squash) {
    const k = moving ? Math.abs(Math.sin(t * 8)) : Math.sin(t * 3) * 0.3 + 0.5;
    const w = wind ? 0.25 : 0;
    u.squash.scale.set(1 + (1 - k) * 0.18 + w, 0.75 + k * 0.25 - w, 1 + (1 - k) * 0.18 + w);
    u.squash.position.y = 0.55 + (moving ? k * 0.35 : 0);
  }
  if (u.legs) { const w = moving ? Math.sin(t * 12) * 0.6 : 0; u.legs.forEach((l, i) => { l.rotation.x = (i % 2 === 0 ? 1 : -1) * (i < 2 ? w : -w); }); }
  if (u.legs2) { const w = moving ? Math.sin(t * 9) * 0.6 : 0; u.legs2[0].rotation.x = w; u.legs2[1].rotation.x = -w; }
  if (u.tail) { u.tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.4; u.tail.rotation.x = -0.3; }
  if (u.head) u.head.rotation.x = wind ? -0.35 : atk ? 0.3 : Math.sin(t * 2) * 0.05;
  if (u.wings) u.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * (u.flap ? (wind ? 26 : 16) : wind ? 14 : 4)) * (u.flap ? 0.7 : 0.35)); });
  if (u.cap) { u.cap.scale.setScalar(wind ? 1.12 + Math.sin(t * 20) * 0.05 : 1 + Math.sin(t * 2) * 0.03); u.cap.rotation.z = Math.sin(t * 1.7) * 0.08; }
  if (u.hover) { u.body.position.y = 0.15 + Math.sin(t * 2) * 0.1; if (u.shell) u.shell.rotation.y = t * (wind ? 6 : 1.5); }
  if (u.arms) u.arms.forEach((a, i) => { a.rotation.x = wind ? -2.2 : atk ? 0.4 : Math.sin(t * 2 + i) * 0.15; });
  if (u.arm) u.arm.rotation.x = wind ? -2.4 : atk ? 0.6 : -0.3 + Math.sin(t * 2) * 0.05;
  if (u.cape) u.cape.rotation.x = moving ? -0.3 : -0.08 + Math.sin(t * 1.5) * 0.04;
  if (u.float) { u.body.position.y = Math.sin(t * 2.5) * 0.3; if (u.shell) { u.shell.rotation.y = t * 2; u.shell.rotation.x = Math.sin(t) * 0.4; } }
  if (u.sigil) { u.sigil.rotation.z = t; u.sigil.scale.setScalar(s.enraged ? 2.2 + Math.sin(t * 8) * 0.2 : 1.8); }
  u.body.rotation.x = wind ? -0.2 : atk ? 0.22 : 0;
  const flash = s.flash || 0, warn = wind ? (Math.sin(t * 30) * 0.5 + 0.5) : 0;
  for (const mm of u.mats) {
    if (flash > 0) { mm.m.emissive.setRGB(1, 1, 1); mm.m.emissiveIntensity = flash * 1.5; }
    else if (warn > 0) { mm.m.emissive.setRGB(1, 0.15, 0.1); mm.m.emissiveIntensity = warn * 0.6 + mm.ei * 0.5; }
    else { mm.m.emissive.copy(mm.e); mm.m.emissiveIntensity = mm.ei; }
  }
  if (u.aura) u.aura.intensity = s.enraged ? 6 + Math.sin(t * 10) * 2 : 3;
}

// ドロップアイテムのオーブ
// ゴールド: 硬貨（たくさん出るのでジオメトリとマテリアルは共有）と金貨袋
let coinParts = null;
function coinShared() {
  if (coinParts) return coinParts;
  const geo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14); geo.rotateX(Math.PI / 2);
  const rim = new THREE.TorusGeometry(0.17, 0.018, 5, 16);
  const mat = new THREE.MeshToonMaterial({ color: 0xffc83a, emissive: 0x8a5a00, emissiveIntensity: 0.6, gradientMap: gradientMap() });
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0a0).multiplyScalar(1.6) });
  for (const o of [geo, rim]) o.userData.shared = true;
  for (const o of [mat, rimMat]) o.userData.shared = true;
  coinParts = { geo, rim, mat, rimMat };
  return coinParts;
}
export function makeCoin() {
  const P = coinShared();
  const g = new THREE.Group();
  const body = new THREE.Mesh(P.geo, P.mat);
  body.add(new THREE.Mesh(P.rim, P.rimMat));
  body.castShadow = true;
  g.add(body);
  g.userData.body = body;
  return g;
}
export function makeGoldBag() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const cloth = toon(0x8a5a2e), tie = toon(0xd8b060), gold = toon(0xffc83a, { emissive: 0x7a4a00, emissiveIntensity: 0.6 });
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), cloth); sack.scale.set(1, 0.85, 1); sack.position.y = 0.36; body.add(sack);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.18, 12), cloth); neck.position.y = 0.76; body.add(neck);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 16), tie); band.rotation.x = Math.PI / 2; band.position.y = 0.72; body.add(band);
  const flap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 10, 1, true), cloth); flap.position.y = 0.92; flap.rotation.x = Math.PI; body.add(flap);
  const mark = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), gold); mark.position.set(0, 0.4, 0.365); body.add(mark);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), gold); c.position.set(Math.cos(i * 1.7) * 0.35, 0.03, Math.sin(i * 1.7) * 0.35); c.rotation.z = 0.2; body.add(c); }
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(body, 1);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04; g.add(halo);
  g.userData.body = body; g.userData.halo = halo;
  g.scale.setScalar(1.4);
  return g;
}

export function makeLootOrb(rarity) {
  const c = new THREE.Color(RARITIES[rarity].color);
  const g = new THREE.Group();
  const orb = new THREE.Group(); orb.position.y = 0.8; g.add(orb);
  orb.add(mesh(new THREE.OctahedronGeometry(0.26 + rarity * 0.04), glow(c.clone().multiplyScalar(1.2 + rarity * 0.2))));
  const ring = mesh(new THREE.TorusGeometry(0.42 + rarity * 0.04, 0.025, 6, 24), glow(c), null, [Math.PI / 2, 0, 0]);
  orb.add(ring);
  g.userData.orb = orb;
  return g;
}

