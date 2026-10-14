import { MOTION_DURATIONS } from '../../shared/motion-catalog.js';
import { SPEAR_TIMINGS } from '../../shared/skill-timings.js';
import { counterAngle } from '../spear-motion.js';
import { BALANCE } from '../../shared/balance.js';
import * as THREE from 'three';
import { MAX_LEVEL, RARITIES, WEAPONS, xpToNext } from '../../shared/data.js';
import { collide } from '../../shared/areas.js';
import { makeWeapon } from '../models.js';
import { HEAVY, TREE_SKILLS } from '../skills.js';
import { angDiff, now } from './util.js';
import { banner, floatText, toast, ui } from './ui-bridge.js';
import { char, characterStore, saveChar } from './save.js';
import { audio, fx, scene } from './render.js';
import { bprojs, keys, me, mobs, projs, world } from './state.js';
import { S, addBuff, buffMod, calcStats, hasBuff } from './stats.js';
import { armCounter, guardDamage } from './input.js';
import { net } from './net-client.js';
import { downedAllies, onJustDodge, reviveHit, takeDamage, tryTech } from './hurt.js';
import { addShake, aimAngle, aimPoint, dealDamage, later, touch } from './combat.js';
import { gainWeaponProf, phantomReady, skillCd, wtAfterCast, wtHeavy, wtOnGuard } from './tree-effects.js';
import { castWeaponSkill, desperate, tf, titleAspd, variantParams } from './variants.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';

// スキルから使う戦闘コンテキスト（skills.js の c）
export const combat = {
  me,
  fx,
  S: () => S,
  wt: () => S.wt,
  resetCd(id) { me.tcd[id] = 0; },
  // 武器だけの道具（c.parry / c.primeCharge / c.poison / c.bleed / c.ambush / c.pay / c.trap）は、各武器のファイル（game/weapons/*.js）が足す
  aim: aimAngle,
  col: () => RARITIES[S.wr].color,
  later,
  sfx: (n, o) => audio.sfx(n, o),
  text: (t, cls) => floatText(me.x, 3, me.z, t, cls),
  shake: addShake,
  hit: (mb, mult, o) => dealDamage(mb, mult, o),
  heal: (frac) => heal(S.mhp * frac, true),
  buff: addBuff,
  taunt: (r) => net.send({ t: 'taunt', r }),
  point: aimPoint,
  area: () => world.area,
  targets: (x,z,r) => [...mobs.values()].filter(m=>m.hp>0&&Math.hypot(m.x-x,m.z-z)<r+m.rad),
  range: () => me.releaseRange || S.bowMax, // 弓: 離したときの射程
  arrow(o) {
    const color = o.color ?? RARITIES[S.wr].color;
    const mesh = arrowMesh(color, o.big);
    mesh.position.set(me.x, 1.2, me.z); mesh.rotation.y = o.a;
    // 射程: 指定がなければ、弓の通常攻撃は引かずに撃つ射程・スキルは最大射程（弓以外の投げナイフなどは24m）
    const range = o.range ?? (S.W.ranged ? (o.type === 'normal' ? S.bowBase : S.bowMax) : 24);
    projs.push({ mesh, arrow: true, x: me.x, z: me.z, sx: me.x, sz: me.z, a: o.a, t: 0, speed: o.speed ?? 42, life: (range + 0.6) / (o.speed ?? 42), range, rad: o.rad ?? 0.7, mult: o.mult ?? 1, type: o.type, pierce: !!o.pierce, hit: new Set(), color, sv: o.sv, cast: o.cast, tech: o.tech, poison: o.poison || 0, crit: o.crit, snipe: o.snipe, full: o.full, onHit: o.onHit });
    // 射出の閃光
    const fx0 = me.x + Math.sin(o.a) * 0.9, fz0 = me.z + Math.cos(o.a) * 0.9;
    fx.flash(fx0, 1.3, fz0, color, o.big ? 14 : 8, 0.15, 6);
    fx.parts.burst(fx0, 1.25, fz0, o.big ? 18 : 8, { color, speed: 5, size: 0.35, life: 0.25, gravity: 0 });
    audio.sfx('swing');
  },
  arc(range, deg, mult, o = {}) {
    const a = o.a ?? me.a, arc = THREE.MathUtils.degToRad(deg) / 2;
    for (const mb of [...mobs.values()]) {
      const dx = mb.x - me.x, dz = mb.z - me.z, d = Math.hypot(dx, dz);
      if (d > range + mb.rad) continue;
      if (Math.abs(angDiff(Math.atan2(dx, dz), a)) <= arc + mb.rad / Math.max(d, 0.5) || d < mb.rad + 0.6) dealDamage(mb, mult, fxReduce('hitOpts', o, d / (range + mb.rad)));
    }
    for (const p of downedAllies()) {
      const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
      if (d < range + 0.6 && (Math.abs(angDiff(Math.atan2(dx, dz), a)) <= arc + 0.6 / Math.max(d, 0.5) || d < 1.2)) reviveHit(p, o);
    }
  },
  line(len, w, mult, o = {}) {
    const a = o.a ?? me.a, sx = o.sx ?? me.x, sz = o.sz ?? me.z;
    const fx_ = Math.sin(a), fz = Math.cos(a);
    for (const mb of [...mobs.values()]) {
      const dx = mb.x - sx, dz = mb.z - sz;
      const along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
      if (along > -mb.rad && along < len + mb.rad && side < w / 2 + mb.rad) dealDamage(mb, mult, fxReduce('hitOpts', o, along / (len + mb.rad)));
    }
    for (const p of downedAllies()) {
      const dx = p.x - sx, dz = p.z - sz, along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
      if (along > -0.6 && along < len + 0.6 && side < w / 2 + 0.6) reviveHit(p, o);
    }
  },
  circle(x, z, r, mult, o = {}) {
    for (const mb of [...mobs.values()]) if (mb !== o.skip && Math.hypot(mb.x - x, mb.z - z) < r + mb.rad) dealDamage(mb, mult, o);
    for (const p of downedAllies()) if (Math.hypot(p.x - x, p.z - z) < r + 0.6) reviveHit(p, o);
  },
  proj(o) {
    const color = o.color ?? RARITIES[S.wr].color;
    const mesh = o.shape === 'axe' ? phantomAxe(color) : fx.waveMesh(color);
    mesh.position.set(o.sx ?? me.x, 1, o.sz ?? me.z); mesh.rotation.y = o.a;
    projs.push({ mesh, x: o.sx ?? me.x, z: o.sz ?? me.z, a: o.a, tech: o.tech, shape: o.shape, color, t: 0, speed: o.speed ?? 22, life: o.life ?? 0.7, rad: o.rad ?? 1.8, mult: o.mult ?? 1.4, type: o.type, hit: new Set(), sv: o.sv, cast: o.cast, wave: o.shape !== 'axe', wtNo: !!o.wtNo, stun: o.stun, eclipse: !!o.eclipse });
    audio.sfx('wave');
  },
  dash(a, dist, dur, iframe) {
    me.dashA = a; me.dashT = dur; me.dashSpeed = dist / dur; me.a = a;
    if (iframe) me.iframe = Math.max(me.iframe, iframe);
  },
  reach: (normal) => fxReduce('reach', 1, normal),
  nearest(range) {
    let best = null, bd = range;
    for (const mb of mobs.values()) { const d = Math.hypot(mb.x - me.x, mb.z - me.z); if (d < bd) { bd = d; best = mb; } }
    return best;
  },
};

export function canAct() { return S && !me.dead && !me.crawl &&me.dodgeT <= 0 && me.skillT < 0 && me.dashT <= 0 && !me.guarding && me.staggerT <= 0 && me.downT <= 0 && !(me.sweepT > 0); }

// 攻撃を始めるとき、盾槍のガードボーナスをこの攻撃に乗せる
export function startAttack() {
  me.motion = '';me.motionT = 0;
  me.atkBonus = me.nextAtkBonus; me.atkBonusT = now() + 0.7; me.nextAtkBonus = 1;
}

export function doSwing() {
  const W = S.W;
  startAttack();
  me.combo = now() - me.lastSwing < W.speed * 2.2 ? (me.combo + 1) % 3 : 0;
  me.lastSwing = now();
  me.swingT = 0;
  me.act++;
  me.swingDur = W.speed * (1 - Math.min(75, S.aspd + buffMod('aspd') + me.dStack * S.dStackPer + fxReduce('swingAspd', 0) + (desperate() ? 15 : 0) + titleAspd()) / 100) * (me.combo === 2 ? 1.25 : 1);
  me.sw++;
  me.a = aimAngle();
  const mult = W.mult * [1, 1.1, 1.6][me.combo];
  const col = RARITIES[S.wr].color;
  const a = me.a;
  if (W.ranged) {
    if (!fxSome('shoot', a, mult)) combat.arrow({ a, mult, type: 'normal' }); // 連射 など
    return;
  }
  const range = W.range * fxReduce('reach', 1, true);
  fx.slash(me.x, me.z, me.a, range, W.arc, fxReduce('swingColor', col), 1.0, me.combo % 2 === 1);
  audio.sfx('swing', { heavy: !!WEAPONS[S.wk]?.twoHanded || me.combo === 2 });
  later(0.06, () => combat.arc(range, W.arc, mult, { a, type: 'normal' }));
  fxCall('swingExtra', a, range, col); // 連突き・一点突破 など
  const waved = me.combo === 2 && S.fx.has('wave');
  if (waved) combat.proj({ a, mult: 1.4, type: 'normal' });
  fxCall('swingLate', a, waved); // 剣の心得A「閃光」・千本 など
  fxCall('swingLast', a); // 魔剣士 など
}

// 矢の見た目
export function arrowMesh(color, big) {
  // 小さくて見えにくかったので、光る矢じりと長い光の尾を付けて大きめにする
  const g = new THREE.Group();
  const s = big ? 2.0 : 1.5;
  const bright = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(2.2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.2 * s, 6), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.38 * s, 6), new THREE.MeshBasicMaterial({ color: bright }));
  head.rotation.x = Math.PI / 2; head.position.z = 0.75 * s; g.add(head);
  const glowM = new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 10, 8), glowM);
  orb.position.z = 0.7 * s; g.add(orb);
  for (const rz of [0, Math.PI / 2]) {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * s, 3.2 * s), new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trail.rotation.set(Math.PI / 2, 0, 0); trail.rotateY(rz); trail.position.z = -1.0 * s; g.add(trail);
  }
  g.userData.isArrow = true;
  return g;
}
export function phantomAxe(color) {
  const group=new THREE.Group(),weapon=makeWeapon('axe',S.wr,S.wst||0),oldMaterials=new Set();
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});
  weapon.traverse(part=>{if(part.material){oldMaterials.add(part.material);part.material=material;}});
  for(const mat of oldMaterials)mat.dispose();weapon.rotation.x=Math.PI/2;group.add(weapon);return group;
}

// 他プレイヤーの矢（見た目だけ）
export function fxArrow(x, z, a, color) {
  const m = arrowMesh(color, false);
  m.position.set(x, 1.2, z); m.rotation.y = a;
  fx.add(m, 0.6, (o, k) => { o.position.x = x + Math.sin(a) * 40 * k * 0.6; o.position.z = z + Math.cos(a) * 40 * k * 0.6; });
}

export function doHeavy(lv) {
  if (!canAct() || lv < 1) return;
  startAttack(); me.act++;
  fxCall('beforeHeavy'); // 報復者 など
  wtHeavy(lv);
  me.a = aimAngle();
  me.swingT = 0; me.swingDur = 0.5; me.combo = 2; me.sw++;
  audio.sfx('heavy');
  fx.flash(me.x, 1.5, me.z, RARITIES[S.wr].color, lv === 2 ? 30 : 15, 0.3);
  const counter = me.counterFire;
  if (counter) {
    // ガードカウンター: 演出を大きく。称号「不落の盾」はここで被ダメ軽減
    me.counterFire = false;
    floatText(me.x, 3.2, me.z, 'ガードカウンター!', 'just');
    fx.flash(me.x, 1.5, me.z, 0xbfe0ff, 60, 0.4);
    fx.ringWave(me.x, me.z, 0xbfe0ff, 5, 0.4);
    addShake(0.4);
    if (tf('t_guard')) addBuff('fort', '不落の盾', 4, { dr: 40 }, 0xbfe0ff);
    fxSome('guardCounter'); // 盾槍は回転なぎ払い、片手剣（守護騎士）は踏み込みの横斬り
    return;
  }
  if (fxSome('heavyOverride', lv)) return; // 竜騎士の跳躍・投斧 など
  fxCall('heavyStart', lv); // 武器ごとの強攻撃のモーション など
  HEAVY[S.wk].run(combat, lv);
  fxCall('heavyAfter', lv); // 影渡り など
}
// ガードカウンター: その場で一回転しながら、槍で周りを大きくなぎ払う（1回で大ダメージ）
//   溜め（wind）: ゆっくり回って振りかぶる → なぎ払い（slash）: 一気に速く回し切る → 残心（rest）
export const SWEEP = { ...SPEAR_TIMINGS.counter, r: 5.2, mult: 7.5, stun: 14 };
SWEEP.dur = SWEEP.wind + SWEEP.slash + SWEEP.rest;
SWEEP.hitAt = SWEEP.wind + SWEEP.slash * 0.5;
// 経過時間 → 体の回転角（ラジアン。この量だけ回る）
export const sweepAngle = counterAngle;

export function sweepTick(dt) {
  if (!(me.sweepT > 0)) return;
  const prev = me.sweepT;
  me.sweepT += dt;
  const t = me.sweepT, a = me.a + sweepAngle(t); // 上から見て反時計回り（体の回転と同じ向き）
  // 振りかぶり中は穂先に光が集まり、なぎ払い中は弧の軌跡を残す
  if (t < SWEEP.wind) {
    if (Math.random() < 0.6) fx.parts.emit(me.x + Math.sin(a) * 3.2, 1.15, me.z + Math.cos(a) * 3.2, { color: 0xbfe0ff, size: 0.4, life: 0.25, speed: 0.6, gravity: 0 });
  } else if (t < SWEEP.wind + SWEEP.slash + 0.05) {
    const a0 = me.a + sweepAngle(prev);
    // このフレームで通った範囲に斬撃の弧を描く（回転の軌跡が残る）
    const deg = Math.abs(a - a0) * 180 / Math.PI;
    if (deg > 1) fx.slash(me.x, me.z, (a + a0) / 2, SWEEP.r, Math.max(24, deg + 12), 0xbfe0ff, 1.1);
    for (let i = 0; i <= 8; i++) {
      const aa = a0 + (a - a0) * i / 8;
      for (const r of [SWEEP.r - 0.4, SWEEP.r - 1.4, SWEEP.r - 2.4]) fx.parts.emit(me.x + Math.sin(aa) * r, 1.15, me.z + Math.cos(aa) * r, { color: r > SWEEP.r - 1 ? 0xffffff : 0xbfe0ff, size: 0.6, life: 0.3, speed: 0.4, gravity: 0 });
    }
  }
  if (!me.sweepHit && prev < SWEEP.hitAt && me.sweepT >= SWEEP.hitAt) {
    me.sweepHit = true;
    const kk = (S.flags.has('bulwark') ? 1.3 : 1) * fxReduce('sweepPower', 0.5); // 反撃の心得で強くなる。盾槍以外（守護騎士）は半分
    combat.circle(me.x, me.z, SWEEP.r, SWEEP.mult * kk, { type: 'heavy', stun: SWEEP.stun * fxReduce('sweepStun', 1) });
    fx.ringWave(me.x, me.z, 0xbfe0ff, SWEEP.r + 0.5, 0.4, 1.0, 1.0);
    fx.flash(me.x, 1.2, me.z, 0xbfe0ff, 50, 0.3);
    audio.sfx('heavy'); addShake(0.45);
  }
  if (me.sweepT >= SWEEP.dur) me.sweepT = 0;
}

export function tryWeaponSkill() {
  if (!canAct()) return;
  const sk = S.ws;
  if (me.wsCd > 0) { if (phantomReady('ws')) { startSkill(sk); wtAfterCast('ws', true); } return; }
  me.wsCd = sk.cd * (1 - S.cdr / 100) * (S.sv ? variantParams(S.sv).cd : 1) * (tf('t_star') ? 0.8 : 1);
  startSkill(sk);
  wtAfterCast('ws');
}

export function tryTreeSkill(i) {
  if (!S) return;
  const id = char.slots?.[i];
  if (!id) { toast(`スロット${i + 1}は空です（Kでスキルツリー）`, '#aab'); return; }
  if (!S.actives.has(id)) { toast(`${TREE_SKILLS[id].name}は今の武器では使えません`, '#f99'); return; }
  if (!canAct()) return;
  const sk = TREE_SKILLS[id];
  if ((me.tcd[id] || 0) > 0) { if (phantomReady(id)) { startSkill(sk); wtAfterCast(id, true); } return; }
  me.tcd[id] = skillCd(id);
  startSkill(sk);
  wtAfterCast(id);
}

export function startSkill(sk) {
  startAttack(); me.act++;
  const mo = sk.motionOf && S.wt ? sk.motionOf(S.wt) : sk.motion; // 武器ツリーの分岐で動きが変わる技
  me.motion = mo || '';me.skillDuration = MOTION_DURATIONS[mo] || sk.duration || .55;me.motionT = 0;
  me.skillT = 0; me.spin = !!sk.spin; me.sk++;
  me.a = aimAngle();
  // 回転系以外のスキルは、武器を振る（槍は突く）モーションを出す。他のプレイヤーにも見える
  if (!sk.spin) { me.swingT = 0; me.swingDur = 0.45; me.combo = 2; me.sw++; }
  me.charging = false;
  audio.sfx('skill');
  floatText(me.x, 3, me.z, sk.name, 'info');
  fx.flash(me.x, 2, me.z, RARITIES[S.wr].color, 25, 0.4);
  if (sk === S.ws) castWeaponSkill(sk); else sk.run(combat);
}

// 矢・斬撃波が倒れている仲間に当たったら起こす（貫通しない矢はそこで止まる）
export function projRevive(w, arrow) {
  for (const p of downedAllies()) {
    const key = 'p' + p.id;
    if (w.hit.has(key) || Math.hypot(p.x - w.x, p.z - w.z) > w.rad + 0.6) continue;
    w.hit.add(key);
    reviveHit(p, { type: w.type, sv: w.sv });
    if (arrow && !w.pierce) return true;
  }
  return false;
}
export function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const w = projs[i];
    w.t += dt;
    w.x += Math.sin(w.a) * w.speed * dt; w.z += Math.cos(w.a) * w.speed * dt;
    if (w.arrow) {
      // 矢: 射程（離したときの円の大きさ）まで飛ぶ
      w.mesh.position.set(w.x, 1.2, w.z);
      if (Math.random() < 0.7) fx.parts.emit(w.x, 1.2, w.z, { color: w.color, size: 0.35, life: 0.25, speed: 0.4, gravity: 0 });
      let done = false;
      fxCall('arrowTick', w); // 射抜き など
      for (const mb of [...mobs.values()]) {
        if (w.hit.has(mb.id) || Math.hypot(mb.x - w.x, mb.z - w.z) > w.rad + mb.rad) continue;
        w.hit.add(mb.id);
        // 射程の中はどこでも本来のダメージ。遠矢（射程の端で +20%）は弓のファイル
        const d = Math.hypot(mb.x - w.sx, mb.z - w.sz), edge = fxSome('arrowEdge', w, d);
        const hawk = w.full && tf('t_hawk') && Math.random() < 0.3;
        dealDamage(mb, w.mult * (edge ? 1.2 : 1), { type: w.type, tech: w.tech, sv: w.sv, cast: w.cast, crit: hawk || w.crit || undefined, poison: w.poison, full: w.full, snipe: w.snipe });
        if (w.onHit) w.onHit(mb);
        fxCall('arrowHit', w, mb); // 鷹の目・狙い澄まし など
        if (edge) floatText(mb.x, 3.4, mb.z, '遠矢', 'info');
        fx.parts.burst(w.x, 1.2, w.z, w.full ? 18 : 8, { color: w.full ? 0xffd84a : 0xffffff, speed: 5, size: 0.4, life: 0.3 });
        if (!w.pierce) { done = true; break; }
      }
      if (!done) done = projRevive(w, true);
      const c = collide(world.def, w.x, w.z, 0.1, world.door);
      if (done || w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { fxCall('arrowGone', w); fx.dispose(w.mesh); projs.splice(i, 1); }
      continue;
    }
    w.mesh.position.set(w.x, 1, w.z);
    if(w.shape==='axe'){w.mesh.children[0].rotation.z+=dt*18;w.mesh.traverse(part=>{if(part.material)part.material.opacity=.9*(1-w.t/w.life);});}
    else {w.mesh.material.opacity = 0.9 * (1 - w.t / w.life);w.mesh.scale.setScalar(1 + w.t * 1.5);}
    fx.parts.emit(w.x, 1, w.z, { color: w.color ?? w.mesh.material.color, size: 0.4, life: 0.3, speed: 1, gravity: 0 });
    for (const mb of [...mobs.values()]) {
      if (w.hit.has(mb.id)) continue;
      if (Math.hypot(mb.x - w.x, mb.z - w.z) < w.rad + mb.rad) { w.hit.add(mb.id); dealDamage(mb, w.mult, { type: w.type, tech: w.tech, noProc: true, sv: w.sv, cast: w.cast, wave: w.wave, proj: w, wtNo: w.wtNo, stun: w.stun }); }
    }
    projRevive(w, false);
    const c = collide(world.def, w.x, w.z, 0.1, world.door);
    if (w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { fx.dispose(w.mesh); projs.splice(i, 1); }
  }
}

// ---- ボスの弾 ----
export function spawnBossProj(m) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(m.r, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(m.c).multiplyScalar(1.6) }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(m.r * 1.7, 14, 10), new THREE.MeshBasicMaterial({ color: m.c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(core, halo);
  g.position.set(m.x, 1.3, m.z);
  scene.add(g);
  bprojs.push({ ...m, mesh: g, dodged: false });
}
export function clearBossProjs() { for (const p of bprojs.splice(0)) fx.dispose(p.mesh); }
export function updateBossProjs(dt) {
  for (let i = bprojs.length - 1; i >= 0; i--) {
    const p = bprojs[i];
    p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
    p.mesh.position.set(p.x, 1.3, p.z);
    if (Math.random() < 0.6) fx.parts.emit(p.x, 1.3, p.z, { color: p.c, size: 0.4, life: 0.3, speed: 0.3, gravity: 0 });
    let gone = p.life <= 0;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (!gone && !me.dead && !me.crawl && d < p.r + 0.6) {
      const facing = Math.abs(angDiff(Math.atan2(p.x - me.x, p.z - me.z), me.a)) < THREE.MathUtils.degToRad(80);
      if (me.guarding && S.guard && facing) {
        // ガードで弾を消す
        net.send({ t: 'pblock', id: p.id });
        if (!guardDamage(p.dmg, false)) { floatText(me.x, 2.6, me.z, '防御', 'info'); armCounter(); wtOnGuard(p.dmg, mobs.get(p.src)); }
        audio.sfx('block');
        fx.parts.burst(p.x, 1.3, p.z, 20, { color: 0xbfe0ff, speed: 6, size: 0.4, life: 0.35 });
        gone = true;
      } else if (fxSome('counter', p)) {
        net.send({ t: 'pblock', id: p.id });
        gone = true; // 大剣カウンターで弾を受け流す
      } else if (me.iframe > 0) {
        if (!p.dodged) { p.dodged = true; onJustDodge(); }
      } else {
        net.send({ t: 'absorb', id: p.src });
        takeDamage(p.dmg * (tf('t_spell') ? 0.65 : 1), { x: p.x - p.vx, z: p.z - p.vz });
        fx.parts.burst(p.x, 1.3, p.z, 20, { color: p.c, speed: 6, size: 0.5, life: 0.4 });
        gone = true;
      }
    }
    if (gone) { fx.dispose(p.mesh); bprojs.splice(i, 1); }
  }
}

export function tryDodge() {
  audio.init();
  if (me.downT > 0) { tryTech(); return; } // ダウン中は受け身
  if (!S || me.dead || me.crawl || me.dodgeCd > 0 || me.dashT > 0 || me.staggerT > 0) return;
  let dx = 0, dz = 0;
  if (keys.has('w')) dz -= 1; if (keys.has('s')) dz += 1; if (keys.has('a')) dx -= 1; if (keys.has('d')) dx += 1;
  if (Math.hypot(touch.stick.x, touch.stick.y) > 0.25) { dx = touch.stick.x; dz = touch.stick.y; }
  if (!dx && !dz) { dx = Math.sin(me.a); dz = Math.cos(me.a); }
  const l = Math.hypot(dx, dz);
  const after = hasBuff('afterimage');
  me.dodgeDir = [dx / l, dz / l];
  me.dodgeT = 0.38;
  me.dodgeCd = S.dodgeCd * (after ? 0.25 : 1);
  me.iframe = (after ? 0.6 : 0.32) + S.iframeBonus;
  me.swingT = 9; me.skillT = -1; me.motion = '';me.charging = false; me.guarding = false;
  audio.sfx('dodge');
  fxCall('onDodge'); // 速射・罠師 など
  if (tf('t_wind')) { me.buffs = me.buffs.filter((b) => b.id !== 'wind'); me.buffs.push({ id: 'wind', label: '疾風', t: 1.9, max: 1.9, mods: { move: 40 }, color: 0x9affc8 }); }
  fx.parts.burst(me.x, 0.3, me.z, 12, { color: after ? 0x9affff : 0xdddddd, speed: 3, size: 0.4, life: 0.4, gravity: 1 });
}

export function usePotion() {
  if (!S || me.dead || me.crawl || me.potions <= 0 || me.potCd > 0 || me.hp >= S.mhp) return;
  me.potions--; me.potCd = BALANCE.potionCooldown;
  heal(S.mhp * BALANCE.potionHeal * (tf('t_spore') ? 1.4 : 1), true);
  audio.sfx('potion');
  fx.parts.burst(me.x, 1, me.z, 30, { color: 0x6aff8a, speed: 3, size: 0.4, life: 0.8, gravity: 3 });
}

export function heal(n, show) {
  if (characterStore.lost || me.crawl) return;
  const before = me.hp;
  me.hp = Math.min(S.mhp, me.hp + n);
  if (show && me.hp > before) floatText(me.x, 2.2, me.z, '+' + Math.round(me.hp - before), 'heal');
}

export function gainXp(n) {
  if (characterStore.lost) return;
  gainWeaponProf(n);
  if (char.lv >= MAX_LEVEL) return;
  char.xp += n;
  floatText(me.x, 3.0, me.z, `+${n} EXP`, 'info');
  let leveled = false;
  while (char.lv < MAX_LEVEL && char.xp >= xpToNext(char.lv)) {
    char.xp -= xpToNext(char.lv); char.lv++; leveled = true;
  }
  if (leveled) {
    calcStats(); me.hp = S.mhp;
    audio.sfx('levelup');
    fx.beam(me.x, me.z, 0xffd84a, 16, 1.0, 1.5);
    fx.parts.burst(me.x, 0.5, me.z, 80, { color: 0xffd84a, speed: 6, size: 0.5, life: 1.5, gravity: 2 });
    banner('LEVEL UP', `Lv ${char.lv}`, '#ffd84a');
    toast('スキルポイント +1（Kでスキルツリー）', '#ffd84a');
    ui.refresh();
  }
  saveChar();
}
