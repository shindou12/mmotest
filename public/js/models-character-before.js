import * as THREE from 'three';
import { toon, glow, compact, outline } from './toon.js';
export { animatePlayer, setPlayerWeapon } from './models.js';

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

