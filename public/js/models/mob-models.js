// 敵のモデル（形）の登録表。t（形の種類）ごとの関数。敵の種類を足すときは、ここに関数を足す（makeMob が t で選ぶ）
// k: 入れ物と材質 { root, body, parts（動かす部位を入れる）, c（色）, ac（目などの色）, m, mD, mL, eyeM, horn, boss }
import * as THREE from 'three';
import { mesh, sphere, capsule, cone, cyl, lathe, extrude } from './kit.js';
import { toon, glow } from '../toon.js';
import { makeWeapon } from '../models.js';

export const MOB_MODELS = {
  slime(k) {
    const { body, c, mD, parts } = k;
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
  },
  beast(k) {
    const { body, c, ac, m, mD, mL, eyeM, horn, parts, boss } = k;
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
  },
  golem(k) {
    const { body, c, ac, parts, boss } = k;
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
  },
  wisp(k) {
    const { body, c, ac, parts, boss } = k;
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
  },
  bat(k) { // コウモリ: 小さな体と、はばたく膜の翼
    const { body, m, mD, mL, eyeM, horn, parts } = k;
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
  },
  mushroom(k) { // キノコ: 大きな傘を揺らして胞子をまく
    const { body, m, mD, parts } = k;
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
  },
  scorpion(k) { // サソリ: 6本脚、はさみ、反り上がった尾と毒針
    const { body, ac, m, mD, mL, eyeM, parts } = k;
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
  },
  mage(k) { // 魔術師: ローブとフード、光る杖、周りを回る紋様
    const { body, c, ac, eyeM, parts } = k;
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
  },
  knight(k) { // 騎士（知らない t もこれになる）
    const { body, c, ac, eyeM, horn, parts, boss } = k;
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
  },
};
