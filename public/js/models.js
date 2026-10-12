// トゥーン調のキャラクター / 武器 / モンスター（プリミティブ＋押し出し形状で造形）
import * as THREE from 'three';
import { RARITIES } from '../shared/data.js';
import { toon, glow, outline, compact } from './toon.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
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

// ---------------------------------------------------------------------------
// 武器
// ---------------------------------------------------------------------------
export function makeWeapon(kind, rarity = 0) {
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
  const mkArm = (s) => {
    const arm = new THREE.Group(); arm.position.set(s * 0.36, 1.4, 0);
    arm.add(mesh(capsule(0.072, 0.2, 8), cloth, [0, -0.15, 0]));
    arm.add(mesh(capsule(0.068, 0.18, 8), clothD, [0, -0.4, 0]));
    arm.add(mesh(cyl(0.085, 0.08, 0.1, 10), leather, [0, -0.5, 0]));
    arm.add(mesh(sphere(0.07, 10, 8), leather, [0, -0.6, 0]));
    body.add(arm);
    return arm;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const hand = new THREE.Group(); hand.position.y = -0.62; armR.add(hand);
  // 背中のマント
  const cape = mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.0, 14, 4, true, Math.PI * 0.7, Math.PI * 0.6), coat, [0, 0.98, -0.02]);
  cape.userData.noOutline = true; cape.userData.keep = true; body.add(cape);

  const ring = mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
  ring.castShadow = false; root.add(ring);

  finish(body, 1);
  root.userData = { body, legs, armL, armR, hand, head, cape, ring, weapon: null, wKey: '' };
  return root;
}

export function setPlayerWeapon(model, kind, rarity) {
  const u = model.userData;
  const key = kind + rarity;
  if (u.wKey === key) return;
  u.wKey = key;
  if (u.weapon) u.hand.remove(u.weapon);
  if (u.shield) { u.armL.remove(u.shield); u.shield = null; }
  if (kind === 'spear') u.shield = makeShield(rarity, u.armL);
  // 見下ろし視点で刃が「線」に見えないよう、刃の平らな面を上に向けて持つ
  const w = makeWeapon(kind, rarity);
  w.rotation.y = Math.PI / 2;
  u.weapon = new THREE.Group();
  u.weapon.add(w);
  u.weapon.rotation.x = Math.PI / 2;
  if (kind === 'spear') u.weapon.position.z = -0.7;
  u.hand.add(u.weapon);
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
  // 腕の外側に、面を前へ向けて持つ
  g.position.set(-0.1, -0.45, 0.12);
  g.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  armL.add(g);
  return g;
}

export function animatePlayer(model, s) {
  const u = model.userData;
  const walk = s.moving ? Math.sin(s.walkT * 10) : 0;
  u.legs[0].rotation.x = walk * 0.75; u.legs[1].rotation.x = -walk * 0.75;
  if (s.guard) {
    // ガード: 盾を前に突き出して構える
    u.armL.rotation.set(-1.35, 0, 0.45);
    if (u.shield) u.shield.rotation.set(Math.PI / 2, 0, 0);
  } else {
    u.armL.rotation.set(-walk * 0.6, 0, -0.15);
    if (u.shield) u.shield.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  }
  u.body.position.y = s.moving ? Math.abs(Math.cos(s.walkT * 10)) * 0.07 : Math.sin(s.t * 2) * 0.015;
  u.head.rotation.x = s.moving ? 0.05 : Math.sin(s.t * 1.3) * 0.03;
  u.cape.rotation.x = s.moving ? -0.35 - Math.abs(walk) * 0.1 : -0.06 + Math.sin(s.t * 1.7) * 0.03;
  if (s.swing >= 0) {
    const k = s.swing;
    const e = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.3;
    const dir = s.combo % 2 === 0 ? 1 : -1;
    if (s.kind === 'spear') { u.armR.rotation.set(-Math.PI / 2 + 0.15, 0, 0); u.armR.position.z = -0.25 + e * 0.8; }
    else { u.armR.rotation.set(-1.4 + e * 0.2, 0, dir * (1.4 - e * 2.8)); u.armR.position.z = 0; }
    u.body.rotation.y = dir * (0.5 - e) * 0.6;
  } else if (s.spin >= 0) {
    u.body.rotation.y = s.spin * Math.PI * 4; u.armR.rotation.set(-Math.PI / 2, 0, 0);
  } else {
    u.armR.rotation.set(walk * 0.4 - 0.25, 0, 0.12); u.armR.position.z = 0; u.body.rotation.y = 0;
  }
  if (s.dodge > 0) { u.body.rotation.x = (1 - s.dodge) * Math.PI * 2; u.body.position.y = 0.4 * Math.sin((1 - s.dodge) * Math.PI); }
  else u.body.rotation.x = 0;
  model.visible = !s.dead;
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
  if (u.wings) u.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * (wind ? 14 : 4)) * 0.35); });
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
