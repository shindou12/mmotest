// トゥーン調のキャラクター / 武器 / モンスター（プリミティブ＋押し出し形状で造形）
import * as THREE from 'three';
import { animatePlayer } from './player-motion.js';
export { animatePlayer } from './player-motion.js';
import { GRIP_Y } from './weapon-pose.js';
import { RARITIES, WEAPONS, DEFAULT_WEAPON } from '../shared/data.js';
import { toon, glow, outline, gradientMap } from './toon.js';
import { mesh, sphere, capsule, cyl, lathe, extrude, finish } from './models/kit.js';
import { WEAPON_MODELS } from './models/weapon-models.js';
import { MOB_MODELS } from './models/mob-models.js';
import { BOSS_MODELS } from './models/boss-models.js';
import { applyBossMotion, endBossMotion } from './models/boss-motion.js';
import { ARMOR_LOOKS } from './models/armor-looks.js';
import { SHIELD_MODELS } from './models/shield-models.js';

// 共通の道具（mesh・sphere・extrude・finish・bowString など）は models/kit.js

// ---------------------------------------------------------------------------
// 武器
// ---------------------------------------------------------------------------

// 装備から武器の形を決める: 伝説・神器は専用形（3）、それ以外は名前から 0〜2
export function weaponStyle(it) {
  if (!it) return 0;
  if (it.rarity >= 6) return 3;
  const s = [...String(it.name || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return s % 3;
}
// 武器の飾りの段階（0〜5）: レアリティ8段（粗悪〜神器）を、金具・光る縁などの見た目の段階にまとめる
const visTier = (r) => (r >= 6 ? r - 2 : Math.max(0, r - 1));

export function makeWeapon(kind, rarityIn = 0, style = 0) {
  const g = new THREE.Group();
  const rc = new THREE.Color(RARITIES[rarityIn].color);
  const rarity = visTier(rarityIn);
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
  // 形違い（style 1〜3）があればそれを、なければ基本の形（style 0）を作る。形は models/weapon-models.js の登録表
  const M = WEAPON_MODELS[kind] || WEAPON_MODELS.sword;
  const glowM = (k = 1) => glow(rc.clone().multiplyScalar(k));
  const blade = (pts, depth, y = 0.12, mat = steel) => { edge(pts.map(([x, yy]) => [x, yy]), depth); const m = mesh(extrude(pts, depth), mat, [0, y, 0]); g.add(m); return m; };
  const k = { g, steel, gold, grip, gem, edge, handle, rc, rarity, glowM, blade, style };
  const V = WEAPON_MODELS[kind];
  if (style && V?.styles[style]) { V.styles[style](V.prep ? { ...k, ...V.prep(k) } : k); return finish(g, 0.8); }
  M.base(k);
  return finish(g, 0.8);
}

// ---------------------------------------------------------------------------
// プレイヤー（デフォルメ頭身）
// ---------------------------------------------------------------------------
export function makePlayer(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const cloth = toon(c.clone().lerp(new THREE.Color(0x24394b), .32));
  const clothD = toon(c.clone().lerp(new THREE.Color(0x18232e), .70));
  const coat = toon(c.clone().lerp(new THREE.Color(0x101a26), .62), { side: THREE.DoubleSide });
  const skin = toon(0xf2d2b9), hairM = toon(new THREE.Color(0x17232d).lerp(c,.12));
  const leather = toon(0x293039), metal = toon(0xc2ced8), metalD=toon(0x7e94a5), gold = toon(0xc7ab6a);
  const plate=(pts, depth, mat, pos=[0,0,0], rot=[0,0,0]) => mesh(extrude(pts,depth,.008),mat,pos,rot);

  const baseGear=new THREE.Group();baseGear.name="base-chest-gear";body.add(baseGear);
  const shoulders=new THREE.Group();shoulders.name="base-shoulder-gear";body.add(shoulders);

  // A fitted torso, layered chest plate and a diagonal leather sword belt.
  body.add(mesh(lathe([[0,.93],[.20,.95],[.205,1.06],[.225,1.29],[.245,1.39],[.19,1.48],[0,1.51]],16),cloth,null,null,[1,1,.82]));
  baseGear.add(plate([[-.17,.17],[.17,.17],[.165,-.055],[.045,-.16],[-.135,-.12]],.038,metal,[0,1.275,.195]));
  baseGear.add(plate([[-.075,.14],[.075,.14],[.055,-.04],[0,-.105],[-.055,-.04]],.012,metalD,[0,1.275,.223]));
  baseGear.add(mesh(new THREE.BoxGeometry(.075,.48,.021),leather,[-.025,1.245,.250],[0,0,-.60]));
  baseGear.add(mesh(new THREE.BoxGeometry(.086,.058,.028),gold,[-.015,1.226,.272],[0,0,-.60]));
  body.add(mesh(cyl(.22,.23,.082,12),leather,[0,.98,0],null,[1,1,.86]));
  body.add(mesh(new THREE.BoxGeometry(.10,.072,.040),gold,[.015,.98,.22]));
  // Separate coat tails expose the trousers and the stance instead of a solid skirt.
  for(const side of [-1,1]){
    const pts=[[.025,.0],[.225,.0],[.275,-.285],[.155,-.35],[.04,-.28]].map(([x,y])=>[x*side,y]);
    body.add(plate(pts,.025,coat,[0,.91,.13],[.11,-side*.12,0]));
    body.add(plate([[.17,-.272],[.265,-.277],[.155,-.322],[.17,-.30]].map(([x,y])=>[x*side,y]),.006,gold,[0,.91,.150]));
  }
  body.add(mesh(cyl(.067,.083,.14,10),skin,[0,1.555,0]));
  // A high asymmetric collar and compact scarf clasp.
  body.add(mesh(new THREE.TorusGeometry(.12,.030,6,14),clothD,[0,1.515,0],[Math.PI/2,0,0]));
  body.add(plate([[-.14,.09],[-.07,.12],[-.065,-.08],[-.17,-.03]],.025,clothD,[0,1.47,.12],[.1,0,-.08]));
  body.add(plate([[.06,.11],[.16,.09],[.17,-.04],[.08,-.065]],.025,clothD,[0,1.47,.12],[.1,0,.08]));
  body.add(mesh(new THREE.OctahedronGeometry(.027,0),gold,[0,1.47,.23]));
  // One stronger shoulder plate gives a purposeful, asymmetric silhouette.
  for(const side of [-1,1]){
    const pad=mesh(new THREE.SphereGeometry(side<0?.15:.115,12,8,0,Math.PI*2,0,Math.PI/2),side<0?metal:leather,[side*.31,1.43,0],[0,0,-side*.45],[1.1,.62,1.05]);shoulders.add(pad);
    if(side<0)shoulders.add(plate([[-.13,.015],[.12,.015],[.10,-.055],[-.09,-.075]],.024,metalD,[side*.32,1.435,.10],[0,0,.16]));
  }

  // Smaller head with a tapered jaw, narrow eyes, ears and a restrained expression.
  const head=new THREE.Group();head.position.y=1.83;body.add(head);
  const face=sphere(.245,18,14),positions=face.attributes.position;
  for(let i=0;i<positions.count;i++){const y=positions.getY(i),jaw=y<0?1+(y/.245)*.24:1;positions.setXYZ(i,positions.getX(i)*jaw,y*.99,positions.getZ(i)*.94*jaw);}face.computeVertexNormals();
  head.add(mesh(face,skin));
  // Hair is a distinct group so covering headwear can hide it without hiding the face.
  const hair = new THREE.Group(); hair.name = 'player-hair'; head.add(hair);
  hair.add(mesh(new THREE.SphereGeometry(0.355, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, [0, 0.03, -0.02], [-0.2, 0, 0]));
  // Curved, tapered oval locks: roots sit inside the cap, avoiding exposed end faces.
  const lock = (centers, widths, depths) => {
    const pos=[],idx=[],radial=10;
    for(let j=0;j<centers.length-1;j++){
      const at=new THREE.Vector3(...centers[j]);
      const tangent=new THREE.Vector3(...centers[j+1]).sub(at).normalize();
      const width=new THREE.Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize();
      const depth=new THREE.Vector3().crossVectors(tangent,width).normalize();
      for(let k=0;k<radial;k++){const ang=k/radial*Math.PI*2;const v=at.clone().addScaledVector(width,Math.cos(ang)*widths[j]).addScaledVector(depth,Math.sin(ang)*depths[j]);pos.push(...v.toArray());}
    }
    const last=(centers.length-2)*radial,tip=pos.length/3;pos.push(...centers.at(-1));
    for(let j=0;j<centers.length-2;j++)for(let k=0;k<radial;k++){const n=(k+1)%radial,a=j*radial+k,b=j*radial+n,c=(j+1)*radial+k,d=(j+1)*radial+n;idx.push(a,b,c,b,d,c);}
    for(let k=0;k<radial;k++)idx.push(last+k,last+(k+1)%radial,tip);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();hair.add(mesh(geo,hairM));
  };
  lock([[0,.26,.215],[-.005,.125,.302],[-.025,.01,.335]], [.13,.105], [.045,.047]);
  for(const side of [-1,1]){
    lock([[side*.18,.22,.18],[side*.215,.095,.265],[side*.26,-.08,.243]], [.095,.085], [.045,.045]);
    lock([[side*.26,.18,-.03],[side*.333,.055,-.10],[side*.32,-.11,-.17]], [.09,.073], [.055,.054]);
    lock([[side*.12,.20,-.23],[side*.14,.065,-.333],[side*.16,-.13,-.29]], [.13,.10], [.050,.043]);
  }

  hair.scale.set(.75,.75,.75);
  const eyeW=glow(0xf3f1e6),eyeD=glow(0x34556b),lineM=glow(0x24313b);
  for(const side of [-1,1]){
    head.add(mesh(sphere(.045,10,8),eyeW,[side*.081,.009,.224],[0,0,side*.12],[1.16,.37,.19]));
    head.add(mesh(sphere(.018,8,6),eyeD,[side*.081,.004,.239],null,[.65,.91,.25]));
    head.add(mesh(new THREE.BoxGeometry(.106,.012,.013),lineM,[side*.081,.025,.234],[0,0,side*.12]));
    head.add(mesh(new THREE.BoxGeometry(.105,.014,.016),hairM,[side*.086,.068,.214],[0,0,side*-.10]));
    head.add(mesh(sphere(.035,8,6),skin,[side*.235,.005,-.008],null,[.55,1.0,.68]));
  }
  const nose=plate([[-.013,.020],[.013,.020],[.007,-.017],[-.006,-.012]],.027,skin,[0,-.040,.217]);nose.userData.noOutline=true;nose.userData.keep=true;head.add(nose);
  head.add(mesh(new THREE.BoxGeometry(.047,.006,.008),lineM,[0,-.120,.195]));

  // Slim trousers, articulated boots and separate greaves. Rig pivots remain compatible.
  const legs=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.13,.92,0);
    leg.add(mesh(capsule(.086,.30,10),clothD,[0,-.215,0]));
    leg.add(mesh(capsule(.092,.19,10),leather,[0,-.595,0]));
    leg.add(mesh(new THREE.BoxGeometry(.17,.29,.043),metalD,[0,-.592,.080],[.04,0,0]));
    leg.add(plate([[-.072,.115],[.072,.115],[.062,-.104],[0,-.135],[-.062,-.104]],.025,metal,[0,-.593,.110]));
    leg.add(mesh(cyl(.101,.100,.042,10),leather,[0,-.45,0]));
    leg.add(mesh(sphere(.103,10,8),leather,[0,-.804,.085],null,[.90,.52,1.58]));
    leg.add(mesh(new THREE.BoxGeometry(.18,.032,.235),leather,[0,-.846,.059]));
    leg.add(mesh(sphere(.078,10,6),metalD,[0,-.795,.174],null,[1,.40,.76]));
    body.add(leg);legs.push(leg);
  }
  const mkArm=side=>{
    const arm=new THREE.Group();arm.position.set(side*.36,1.4,0);
    arm.add(mesh(capsule(.067,.205,8),cloth,[0,-.15,0]));
    const elbow=new THREE.Group();elbow.position.y=-.30;arm.add(elbow);
    elbow.add(mesh(sphere(.065,8,6),clothD));
    elbow.add(mesh(capsule(.063,.18,8),clothD,[0,-.11,0]));
    elbow.add(plate([[-.065,.085],[.065,.085],[.054,-.094],[-.044,-.105]],.023,metalD,[0,-.119,.061]));
    elbow.add(mesh(cyl(.080,.076,.092,8),leather,[0,-.205,0]));
    const hand=new THREE.Group();hand.position.y=-.30;elbow.add(hand);
    hand.add(mesh(sphere(.066,10,8),leather));
    hand.add(mesh(new THREE.BoxGeometry(.065,.033,.015),metal,[0,0,.056]));
    arm.userData={elbow,hand};body.add(arm);return arm;
  };
  const armL=mkArm(-1),armR=mkArm(1),elbowL=armL.userData.elbow,elbowR=armR.userData.elbow,hand=armR.userData.hand,handL=armL.userData.hand;
  // Short mantle, with the old motion pivot retained.
  const capeGeo=new THREE.CylinderGeometry(.24,.35,.72,14,4,true,Math.PI*.7,Math.PI*.6);capeGeo.translate(0,.11,0);
  const cape=mesh(capeGeo,coat,[0,.98,-.02]);cape.userData.noOutline=true;cape.userData.keep=true;body.add(cape);
  const capeHem=mesh(new THREE.CylinderGeometry(.338,.35,.023,14,1,true,Math.PI*.7,Math.PI*.6),clothD,[0,-.238,0]);capeHem.userData.noOutline=true;cape.add(capeHem);
  const ring=mesh(new THREE.RingGeometry(.5,.62,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}),[0,.06,0],[-Math.PI/2,0,0]);ring.castShadow=false;root.add(ring);
  finish(body,.85);
  root.userData={body,legs,armL,armR,elbowL,elbowR,hand,handL,head,hair,cape,ring,baseGear,shoulders,weapon:null,wKey:'',color:c,armor:null,armorLook:0};return root;
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
  if(u.baseGear)u.baseGear.visible=![4,5,6].includes(look);
  if(u.shoulders)u.shoulders.visible=![3,5,6].includes(look);
  if (u.hair) u.hair.visible = ![1, 4, 5, 6].includes(look);
  if (!look) return;
  const c = u.color || new THREE.Color(0x4488ff);
  const cloth = toon(c.clone().lerp(new THREE.Color(0x2a2a3a), 0.35), { side: THREE.DoubleSide });
  const dark = toon(c.clone().lerp(new THREE.Color(0x101018), 0.7), { side: THREE.DoubleSide });
  const leather = toon(0x6a4428), steel = toon(0xc8d0dc), steelD = toon(0x7a8494), gold = toon(0xe0b04a), chain = toon(0x9aa4b2);
  const onBody = new THREE.Group(), onHead = new THREE.Group();
  const add = (grp, m) => { grp.add(m); return m; };
  // 見た目は models/armor-looks.js の登録表（look ごと）
  ARMOR_LOOKS[look]?.({ u, c, cloth, dark, leather, steel, steelD, gold, chain, onBody, onHead, add });
  for (const [parent, g] of [[u.body, onBody], [u.head, onHead]]) {
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (parent === u.head) g.scale.set(.76,.80,.76);
    outline(g, .85);
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
  if (WEAPONS[kind]?.shield) u.shield = makeShield(rarity, u.armL, WEAPONS[kind].shield);
  const w = makeWeapon(kind, rarity, style);
  u.weaponModel = w;
  u.weapon = new THREE.Group();
  u.weapon.name = kind + '-grip';
  u.weapon.add(w);
  w.position.y = -GRIP_Y[kind];
  const offHand = !!WEAPONS[kind]?.offHand; // 弓は左手で持ち、弦が体のほうを向く
  w.rotation.y = offHand ? -Math.PI / 2 : 0;
  u.wKind = kind;
  (offHand ? u.handL : u.hand).add(u.weapon);
  u.elbowL.rotation.set(0, 0, 0);u.elbowR.rotation.set(0, 0, 0);
  animatePlayer(model, { t: 0, moving: false, walkT: 0, kind, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 });

}

// 盾（左腕に持つ）。形は models/shield-models.js の登録表（武器の表の shield が形の名前）
function makeShield(rarityIn, armL, shape) {
  const g = SHIELD_MODELS[shape]({ rarityIn, rc: new THREE.Color(RARITIES[rarityIn].color), rarity: visTier(rarityIn) });
  // 腕の外側に、面を前へ向けて持つ
  g.position.set(-0.08, -0.14, 0.12);
  g.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  armL.userData.elbow.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// モンスター
// ---------------------------------------------------------------------------
export function makeMob(t, color, scale = 1, accent = null, boss = false, appearance = null) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = new THREE.Color(color);
  const ac = new THREE.Color(accent ?? 0xff4030);
  const m = toon(c), mD = toon(c.clone().multiplyScalar(0.55)), mL = toon(c.clone().lerp(new THREE.Color(0xffffff), 0.35));
  const eyeM = glow(ac.clone().multiplyScalar(1.6));
  const horn = toon(0xf0e6d0);
  const parts = { body, root };
  // 専用ボスは外観の登録表、それ以外は通常の敵の登録表を使う。
  const dedicated = boss && Object.hasOwn(BOSS_MODELS, appearance) ? BOSS_MODELS[appearance] : null;
  if (dedicated) Object.assign(parts, dedicated.build(body, ac));
  else (MOB_MODELS[t] ?? MOB_MODELS.knight)({ root, body, parts, c, ac, m, mD, mL, eyeM, horn, boss, scale, color, accent });
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
  if (Object.hasOwn(BOSS_MODELS, u.identity)) BOSS_MODELS[u.identity].animate?.(u, s);
  // 技ごとの動き（s.act: { p, age, sp }）。終わったら構えに戻して act.done を立てる。
  // 途中で別の技に替わった・取り消された（スタンなど）ときも、前の動きを構えに戻す
  const motions = BOSS_MODELS[u.identity]?.motions;
  if (u.curAct && u.curAct !== s.act) { endBossMotion(u, motions?.[u.curAct.p]); u.curAct = null; }
  if (s.act && !s.act.done) {
    u.curAct = s.act;
    if (!applyBossMotion(u, motions?.[s.act.p], s.act)) { endBossMotion(u, motions?.[s.act.p]); s.act.done = true; u.curAct = null; }
  }
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
// 強化の欠片: 水色に光る結晶のかけら（大きい1本と小さい2本）。body を回す
export function makeShard() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const core = glow(new THREE.Color(0x8ae8ff).multiplyScalar(1.4));
  const pale = toon(0xd8f6ff, { emissive: 0x4ab8ff, emissiveIntensity: 0.5 });
  const shard = (h, r, x, z, tilt, m) => {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), m);
    s.scale.set(1, h / r, 1); s.position.set(x, h * 0.5, z); s.rotation.z = tilt; s.castShadow = true;
    body.add(s);
  };
  shard(0.26, 0.09, 0, 0, 0.1, core);
  shard(0.16, 0.06, 0.09, 0.04, -0.5, pale);
  shard(0.13, 0.05, -0.08, -0.03, 0.6, pale);
  g.userData.body = body;
  g.scale.setScalar(1.9);
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

// 地面に落ちている装備（寝かせた実物）。item: 落ちた物を回して飛ばす中身 / glow: 足元の淡い光（アンコモン以上）
export function makeLootItem(it) {
  const r = it.rarity, c = new THREE.Color(RARITIES[r].color);
  const g = new THREE.Group(), item = new THREE.Group();
  g.add(item);
  if (it.slot === 'weapon') {
    const w = makeWeapon(it.kind || DEFAULT_WEAPON, r, weaponStyle(it));
    w.rotation.x = Math.PI / 2; w.scale.setScalar(0.8);
    item.add(w);
  } else if (it.slot === 'armor') {
    const m = toon(it.armor === 'heavy' ? 0x9aa6b4 : it.armor === 'light' ? 0x6b4a32 : 0x4a5a7a);
    item.add(mesh(new THREE.BoxGeometry(0.62, 0.16, 0.5), m, [0, 0.08, 0]));
    item.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.26), m, [0.38, 0.06, -0.1]));
    item.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.26), m, [-0.38, 0.06, -0.1]));
  } else if (it.slot === 'title') {
    item.add(mesh(cyl(0.07, 0.07, 0.6, 10), toon(0xf2e6c4), [0, 0.07, 0], [0, 0, Math.PI / 2]));
    item.add(mesh(cyl(0.025, 0.025, 0.7, 6), toon(0x7a4a2a), [0, 0.07, 0], [0, 0, Math.PI / 2]));
  } else {
    item.add(mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 18), toon(0xf2c14e), [0, 0.05, 0], [Math.PI / 2, 0, 0]));
    item.add(mesh(new THREE.OctahedronGeometry(0.08), glow(c.clone().multiplyScalar(1.5)), [0, 0.1, 0.16]));
  }
  let halo = null;
  if (r >= 2) {
    halo = new THREE.Mesh(new THREE.CircleGeometry(0.6 + r * 0.08, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18 + r * 0.04, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03;
    g.add(halo);
  }
  g.userData.item = item; g.userData.halo = halo;
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


