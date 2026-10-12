// プリミティブで組むキャラクター / 武器 / モンスター
import * as THREE from 'three';
import { RARITIES } from '../shared/data.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, flatShading: true, ...o });
const shadow = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };

export function makeWeapon(kind, rarity = 0) {
  const g = new THREE.Group();
  const rc = new THREE.Color(RARITIES[rarity].color);
  const glow = rarity >= 2 ? 0.4 + rarity * 0.5 : 0;
  const blade = new THREE.MeshStandardMaterial({ color: rarity >= 4 ? rc : 0xdfe6ee, metalness: 0.9, roughness: 0.2, emissive: rc, emissiveIntensity: glow });
  const hilt = mat(rarity >= 4 ? 0xffd27a : 0x5a3a22, { metalness: 0.5 });
  switch (kind) {
    case 'greatsword': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.08), blade); b.position.y = 1.45; g.add(b);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.4, 4), blade); tip.position.y = 2.75; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3; g.add(tip);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.16), hilt); gd.position.y = 0.32; g.add(gd);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), hilt); g.add(h);
      break;
    }
    case 'spear': {
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.0), hilt); sh.position.y = 0.9; g.add(sh);
      const hd = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 4), blade); hd.position.y = 2.75; g.add(hd);
      if (rarity >= 3) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12), blade); r.position.y = 2.35; r.rotation.x = Math.PI / 2; g.add(r); }
      break;
    }
    case 'dagger': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.04), blade); b.position.y = 0.55; g.add(b);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 4), blade); tip.position.y = 1.0; tip.scale.z = 0.3; g.add(tip);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), hilt); gd.position.y = 0.18; g.add(gd);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3), hilt); g.add(h);
      break;
    }
    default: {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.05), blade); b.position.y = 0.95; g.add(b);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.3, 4), blade); tip.position.y = 1.75; tip.scale.z = 0.3; g.add(tip);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), hilt); gd.position.y = 0.28; g.add(gd);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45), hilt); g.add(h);
    }
  }
  return shadow(g);
}

// プレイヤー（簡易人型）
export function makePlayer(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const cloth = mat(c), dark = mat(c.clone().multiplyScalar(0.45)), skin = mat(0xf2d0b0);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8), cloth); torso.position.y = 1.15; body.add(torso);
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.6, 8, 1, true), dark); coat.position.y = 0.75; body.add(coat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin); head.position.y = 1.85; body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x2a2030)); hair.position.y = 1.9; hair.rotation.x = -0.25; body.add(hair);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeM); e.position.set(s * 0.1, 1.87, 0.25); body.add(e); }
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.15, 0.7, 0);
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 6), dark); lm.position.y = -0.35; leg.add(lm);
    body.add(leg); legs.push(leg);
  }
  const armL = new THREE.Group(); armL.position.set(-0.45, 1.5, 0);
  const al = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.7, 6), cloth); al.position.y = -0.33; armL.add(al); body.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.45, 1.5, 0);
  const ar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.7, 6), cloth); ar.position.y = -0.33; armR.add(ar); body.add(armR);
  const hand = new THREE.Group(); hand.position.y = -0.68; armR.add(hand);
  // 足元のリング（自分の色）
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; root.add(ring);
  shadow(body);
  root.userData = { body, legs, armL, armR, hand, weapon: null, wKey: '', torso };
  return root;
}

export function setPlayerWeapon(model, kind, rarity) {
  const u = model.userData;
  const key = kind + rarity;
  if (u.wKey === key) return;
  u.wKey = key;
  if (u.weapon) { u.hand.remove(u.weapon); }
  u.weapon = makeWeapon(kind, rarity);
  u.weapon.rotation.x = Math.PI / 2;
  if (kind === 'spear') u.weapon.position.y = -0.6;
  u.hand.add(u.weapon);
}

// アニメーション: swing(0..1), dodge, walk phase
export function animatePlayer(model, s) {
  const u = model.userData;
  const walk = s.moving ? Math.sin(s.walkT * 10) : 0;
  u.legs[0].rotation.x = walk * 0.7; u.legs[1].rotation.x = -walk * 0.7;
  u.armL.rotation.x = -walk * 0.5;
  u.body.position.y = s.moving ? Math.abs(Math.cos(s.walkT * 10)) * 0.08 : Math.sin(s.t * 2) * 0.02;
  if (s.swing >= 0) {
    const k = s.swing;
    const e = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.3;
    const dir = s.combo % 2 === 0 ? 1 : -1;
    if (s.kind === 'spear') { u.armR.rotation.set(-Math.PI / 2 + 0.2, 0, 0); u.armR.position.z = -0.2 + e * 0.9; }
    else { u.armR.rotation.set(-1.4 + e * 0.2, 0, dir * (1.4 - e * 2.8)); u.armR.position.z = 0; }
    u.body.rotation.y = dir * (0.5 - e) * 0.6;
  } else if (s.spin >= 0) {
    u.body.rotation.y = s.spin * Math.PI * 4; u.armR.rotation.set(-Math.PI / 2, 0, 0);
  } else {
    u.armR.rotation.set(walk * 0.3 - 0.3, 0, 0.15); u.armR.position.z = 0; u.body.rotation.y = 0;
  }
  if (s.dodge > 0) { u.body.rotation.x = (1 - s.dodge) * Math.PI * 2; u.body.position.y = 0.4 * Math.sin((1 - s.dodge) * Math.PI); }
  else u.body.rotation.x = 0;
  model.visible = !s.dead;
}

// --- モンスター ---
export function makeMob(t, color, scale = 1, accent = null, boss = false) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const m = mat(c), m2 = mat(c.clone().multiplyScalar(0.6));
  const eyeCol = accent ?? 0xff3322;
  const eyeM = new THREE.MeshStandardMaterial({ color: eyeCol, emissive: eyeCol, emissiveIntensity: 3 });
  const parts = { body, root };
  switch (t) {
    case 'slime': {
      const sm = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.85, roughness: 0.2, emissive: c, emissiveIntensity: 0.25 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), sm); b.position.y = 0.6; b.scale.y = 0.8; body.add(b);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(s * 0.22, 0.8, 0.6); body.add(e); }
      parts.squash = b;
      break;
    }
    case 'beast': {
      const tor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.6), m); tor.position.y = 0.9; body.add(tor);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.7), m); head.position.set(0, 1.15, 1.0); body.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), m2); snout.position.set(0, 1.0, 1.45); body.add(snout);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), eyeM); e.position.set(s * 0.2, 1.25, 1.36); body.add(e);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), mat(0xeeeedd)); horn.position.set(s * 0.22, 1.5, 0.95); horn.rotation.z = -s * 0.4; body.add(horn);
      }
      parts.legs = [];
      for (const [x, z] of [[-0.35, 0.55], [0.35, 0.55], [-0.35, -0.55], [0.35, -0.55]]) {
        const leg = new THREE.Group(); leg.position.set(x, 0.65, z);
        const lm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), m2); lm.position.y = -0.32; leg.add(lm);
        body.add(leg); parts.legs.push(leg);
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), m2); tail.position.set(0, 1.1, -1.0); tail.rotation.x = -1.0; body.add(tail);
      break;
    }
    case 'golem': {
      const tor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), m); tor.position.y = 1.6; tor.scale.set(1.2, 1, 0.9); body.add(tor);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.55), m2); head.position.set(0, 2.45, 0.1); body.add(head);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.05), eyeM); e.position.set(s * 0.15, 2.5, 0.38); body.add(e); }
      parts.arms = [];
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(s * 1.05, 2.0, 0);
        const am = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), m2); am.position.y = -0.7; am.scale.y = 1.6; arm.add(am);
        body.add(arm); parts.arms.push(arm);
      }
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.45), m2); l.position.set(s * 0.4, 0.45, 0); body.add(l); }
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), eyeM); core.position.set(0, 1.7, 0.72); body.add(core);
      break;
    }
    case 'wisp': {
      const wm = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), wm); core.position.y = 1.6; body.add(core);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, wireframe: true, transparent: true, opacity: 0.6 }));
      shell.position.y = 1.6; body.add(shell); parts.shell = shell;
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0x000000 })); e.position.set(s * 0.15, 1.7, 0.45); body.add(e); }
      parts.float = true;
      break;
    }
    default: { // knight
      const armor = mat(c, { metalness: 0.7, roughness: 0.35 });
      const tor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.0, 8), armor); tor.position.y = 1.3; body.add(tor);
      const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.5, 8), armor); helm.position.y = 2.05; body.add(helm);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.1), eyeM); visor.position.set(0, 2.08, 0.3); body.add(visor);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), mat(accent ?? 0xaa2222)); plume.position.y = 2.5; body.add(plume);
      for (const s of [-1, 1]) {
        const sh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor); sh.position.set(s * 0.52, 1.7, 0); body.add(sh);
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.85, 6), m2); l.position.set(s * 0.18, 0.42, 0); body.add(l);
      }
      const arm = new THREE.Group(); arm.position.set(0.6, 1.65, 0);
      const am = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.75, 6), armor); am.position.y = -0.35; arm.add(am);
      const sw = makeWeapon(boss ? 'greatsword' : 'sword', boss ? 3 : 0); sw.rotation.x = Math.PI / 2; sw.position.y = -0.7; arm.add(sw);
      body.add(arm); parts.arm = arm;
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.6), armor); shield.position.set(-0.62, 1.3, 0.15); body.add(shield);
      break;
    }
  }
  if (boss) {
    const crown = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5, metalness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 4), cm);
      const a = i / 6 * Math.PI * 2; sp.position.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3); crown.add(sp);
    }
    const top = t === 'beast' ? [0, 1.65, 1.0] : t === 'golem' ? [0, 2.85, 0.1] : t === 'wisp' ? [0, 2.4, 0] : t === 'slime' ? [0, 1.25, 0] : [0, 2.45, 0];
    crown.position.set(...top); body.add(crown);
    const aura = new THREE.PointLight(accent, 3, 12); aura.position.y = 2; root.add(aura);
    parts.aura = aura;
  }
  root.scale.setScalar(scale);
  shadow(body);
  // 被弾フラッシュ用にマテリアル収集
  parts.mats = [];
  body.traverse((o) => { if (o.isMesh && o.material.emissive) parts.mats.push({ m: o.material, e: o.material.emissive.clone(), ei: o.material.emissiveIntensity }); });
  root.userData = parts;
  return root;
}

export function animateMob(model, s) {
  const u = model.userData;
  const t = s.t;
  const moving = s.st === 1, wind = s.st === 2, atk = s.st === 3;
  if (u.squash) {
    const k = moving ? Math.abs(Math.sin(t * 8)) : Math.sin(t * 3) * 0.3 + 0.5;
    u.squash.scale.set(1 + (1 - k) * 0.2 + (wind ? 0.25 : 0), 0.7 + k * 0.25 - (wind ? 0.25 : 0), 1 + (1 - k) * 0.2 + (wind ? 0.25 : 0));
    u.body.position.y = moving ? k * 0.3 : 0;
  }
  if (u.legs) { const w = moving ? Math.sin(t * 12) * 0.6 : 0; u.legs.forEach((l, i) => { l.rotation.x = (i % 2 === 0 ? 1 : -1) * (i < 2 ? w : -w); }); }
  if (u.arms) { u.arms.forEach((a, i) => { a.rotation.x = wind ? -2.2 : atk ? 0.4 : Math.sin(t * 2 + i) * 0.15; }); }
  if (u.arm) { u.arm.rotation.x = wind ? -2.4 : atk ? 0.6 : -0.3; u.arm.rotation.z = 0; }
  if (u.float) { u.body.position.y = Math.sin(t * 2.5) * 0.3; if (u.shell) { u.shell.rotation.y = t; u.shell.rotation.x = t * 0.6; } }
  u.body.rotation.x = wind ? -0.25 : atk ? 0.25 : 0;
  const flash = s.flash || 0, warn = wind ? (Math.sin(t * 30) * 0.5 + 0.5) : 0;
  for (const mm of u.mats) {
    if (flash > 0) { mm.m.emissive.setRGB(1, 1, 1); mm.m.emissiveIntensity = flash * 2; }
    else if (warn > 0) { mm.m.emissive.setRGB(1, 0.15, 0.1); mm.m.emissiveIntensity = warn * 0.8 + mm.ei * 0.5; }
    else { mm.m.emissive.copy(mm.e); mm.m.emissiveIntensity = mm.ei; }
  }
  if (u.aura) u.aura.intensity = s.enraged ? 6 + Math.sin(t * 10) * 2 : 3;
}

// ドロップアイテムのオーブ
export function makeLootOrb(rarity) {
  const c = new THREE.Color(RARITIES[rarity].color);
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 + rarity * 0.04), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5 + rarity * 0.5 }));
  orb.position.y = 0.8; g.add(orb);
  g.userData.orb = orb;
  return g;
}
