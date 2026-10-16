import { MOTION_DURATIONS } from '../../shared/motion-catalog.js';
import { SPEAR_TIMINGS } from '../../shared/skill-timings.js';
import { counterAngle } from '../spear-motion.js';
import { BALANCE } from '../../shared/balance.js';
import { MAX_LEVEL, RARITIES, WEAPONS, xpToNext } from '../../shared/data.js';
import { collide } from '../../shared/areas.js';
import { HEAVY, TREE_SKILLS } from '../skills.js';
import { angDiff, now, degToRad } from './util.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';
import { link, rules, screen, state, stats, view } from './ports.js';

// スキル（skills.js の c）と武器の効果に渡す戦闘コンテキスト。役目ごとの小さな形に分けてある
// 使う側は必要な形だけを読む（例: 武器の効果は strikes で当て、feedback で見せる）
// 中身は組み立て役（game/wiring.js）が、ポートを埋めたあとに buildCombat() で入れる（入れ物の形は変わらない）
export const senses = {}, strikes = {}, feedback = {}, selfCare = {}, party = {}, combat = {};
export function buildCombat() {
  // 見る・狙う（自分の状態・向き・狙った場所・近くの敵）
  Object.assign(senses, {
    me: state.me,
    S: () => stats.S,
    wt: () => stats.S.wt,
    aim: rules.aimAngle,
    point: rules.aimPoint,
    area: () => state.world.area,
    targets: (x,z,r) => [...state.mobs.values()].filter(m=>m.hp>0&&Math.hypot(m.x-x,m.z-z)<r+m.rad),
    range: () => state.me.releaseRange || stats.S.bowMax, // 弓: 離したときの射程
    col: () => RARITIES[stats.S.wr].color,
    reach: (normal) => fxReduce('reach', 1, normal),
    nearest(range) {
      let best = null, bd = range;
      for (const mb of state.mobs.values()) { const d = Math.hypot(mb.x - state.me.x, mb.z - state.me.z); if (d < bd) { bd = d; best = mb; } }
      return best;
    },
  });
  // 当てる（ダメージ・範囲・飛び道具・突進）
  Object.assign(strikes, {
    hit: (mb, mult, o) => rules.dealDamage(mb, mult, o),
    arc(range, deg, mult, o = {}) {
      const a = o.a ?? state.me.a, arc = degToRad(deg) / 2;
      for (const mb of [...state.mobs.values()]) {
        const dx = mb.x - state.me.x, dz = mb.z - state.me.z, d = Math.hypot(dx, dz);
        if (d > range + mb.rad) continue;
        if (Math.abs(angDiff(Math.atan2(dx, dz), a)) <= arc + mb.rad / Math.max(d, 0.5) || d < mb.rad + 0.6) rules.dealDamage(mb, mult, fxReduce('hitOpts', o, d / (range + mb.rad)));
      }
      for (const p of rules.downedAllies()) {
        const dx = p.x - state.me.x, dz = p.z - state.me.z, d = Math.hypot(dx, dz);
        if (d < range + 0.6 && (Math.abs(angDiff(Math.atan2(dx, dz), a)) <= arc + 0.6 / Math.max(d, 0.5) || d < 1.2)) rules.reviveHit(p, o);
      }
    },
    line(len, w, mult, o = {}) {
      const a = o.a ?? state.me.a, sx = o.sx ?? state.me.x, sz = o.sz ?? state.me.z;
      const fx_ = Math.sin(a), fz = Math.cos(a);
      for (const mb of [...state.mobs.values()]) {
        const dx = mb.x - sx, dz = mb.z - sz;
        const along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
        if (along > -mb.rad && along < len + mb.rad && side < w / 2 + mb.rad) rules.dealDamage(mb, mult, fxReduce('hitOpts', o, along / (len + mb.rad)));
      }
      for (const p of rules.downedAllies()) {
        const dx = p.x - sx, dz = p.z - sz, along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
        if (along > -0.6 && along < len + 0.6 && side < w / 2 + 0.6) rules.reviveHit(p, o);
      }
    },
    circle(x, z, r, mult, o = {}) {
      for (const mb of [...state.mobs.values()]) if (mb !== o.skip && Math.hypot(mb.x - x, mb.z - z) < r + mb.rad) rules.dealDamage(mb, mult, o);
      for (const p of rules.downedAllies()) if (Math.hypot(p.x - x, p.z - z) < r + 0.6) rules.reviveHit(p, o);
    },
    proj(o) {
      const color = o.color ?? RARITIES[stats.S.wr].color;
      const shape = view.projShape(o.shape), mesh = shape.make(color, view.fx, stats.S.wr, stats.S.wst||0);
      mesh.position.set(o.sx ?? state.me.x, 1, o.sz ?? state.me.z); mesh.rotation.y = o.a;
      state.projs.push({ mesh, x: o.sx ?? state.me.x, z: o.sz ?? state.me.z, a: o.a, tech: o.tech, shape: o.shape, color, t: 0, speed: o.speed ?? 22, life: o.life ?? 0.7, rad: o.rad ?? 1.8, mult: o.mult ?? 1.4, type: o.type, hit: new Set(), sv: o.sv, cast: o.cast, wave: shape.wave, wtNo: !!o.wtNo, stun: o.stun, eclipse: !!o.eclipse });
      view.audio.sfx('wave');
    },
    arrow(o) {
      const color = o.color ?? RARITIES[stats.S.wr].color;
      const mesh = view.arrowMesh(color, o.big);
      mesh.position.set(state.me.x, 1.2, state.me.z); mesh.rotation.y = o.a;
      // 射程: 指定がなければ、弓の通常攻撃は引かずに撃つ射程・スキルは最大射程（弓以外の投げナイフなどは24m）
      const range = o.range ?? (stats.S.W.ranged ? (o.type === 'normal' ? stats.S.bowBase : stats.S.bowMax) : 24);
      state.projs.push({ mesh, arrow: true, x: state.me.x, z: state.me.z, sx: state.me.x, sz: state.me.z, a: o.a, t: 0, speed: o.speed ?? 42, life: (range + 0.6) / (o.speed ?? 42), range, rad: o.rad ?? 0.7, mult: o.mult ?? 1, type: o.type, pierce: !!o.pierce, hit: new Set(), color, sv: o.sv, cast: o.cast, tech: o.tech, poison: o.poison || 0, crit: o.crit, snipe: o.snipe, full: o.full, onHit: o.onHit });
      // 射出の閃光
      const fx0 = state.me.x + Math.sin(o.a) * 0.9, fz0 = state.me.z + Math.cos(o.a) * 0.9;
      view.fx.flash(fx0, 1.3, fz0, color, o.big ? 14 : 8, 0.15, 6);
      view.fx.parts.burst(fx0, 1.25, fz0, o.big ? 18 : 8, { color, speed: 5, size: 0.35, life: 0.25, gravity: 0 });
      view.audio.sfx('swing');
    },
    dash(a, dist, dur, iframe) {
      state.me.dashA = a; state.me.dashT = dur; state.me.dashSpeed = dist / dur; state.me.a = a;
      if (iframe) state.me.iframe = Math.max(state.me.iframe, iframe);
    },
  });
  // 見せる・鳴らす（エフェクト・音・文字・揺れ・時間差）
  Object.assign(feedback, {
    fx: view.fx,
    sfx: (n, o) => view.audio.sfx(n, o),
    text: (t, cls) => screen.floatText(state.me.x, 3, state.me.z, t, cls),
    shake: rules.addShake,
    later: rules.later,
  });
  // 自分を整える（回復・バフ・クールタイム）
  Object.assign(selfCare, {
    heal: (frac) => heal(stats.S.mhp * frac, true),
    buff: stats.addBuff,
    resetCd(id) { state.me.tcd[id] = 0; },
  });
  // 仲間・敵への合図（挑発）
  Object.assign(party, {
    taunt: (r) => link.net.send({ t: 'taunt', r }),
  });
  // スキルに渡す c は全部をまとめたもの
  Object.assign(combat, senses, strikes, feedback, selfCare, party);
}
// 武器だけの道具（c.parry / c.primeCharge / c.poison / c.bleed / c.ambush / c.pay / c.trap）は、各武器のファイル（js/weapons/*.js の effects）がここで足す
export const extendCombat = (tools) => Object.assign(combat, tools);

export function canAct() { return stats.S && !state.me.dead && !state.me.crawl &&state.me.dodgeT <= 0 && state.me.skillT < 0 && state.me.dashT <= 0 && !state.me.guarding && state.me.staggerT <= 0 && state.me.downT <= 0 && !(state.me.sweepT > 0); }

// 攻撃を始めるとき、盾槍のガードボーナスをこの攻撃に乗せる
export function startAttack() {
  state.me.motion = '';state.me.motionT = 0;
  state.me.atkBonus = state.me.nextAtkBonus; state.me.atkBonusT = now() + 0.7; state.me.nextAtkBonus = 1;
}

export function doSwing() {
  const W = stats.S.W;
  startAttack();
  state.me.combo = now() - state.me.lastSwing < W.speed * 2.2 ? (state.me.combo + 1) % 3 : 0;
  state.me.lastSwing = now();
  state.me.swingT = 0;
  state.me.act++;
  state.me.swingDur = W.speed * (1 - Math.min(75, stats.S.aspd + stats.buffMod('aspd') + state.me.dStack * stats.S.dStackPer + fxReduce('swingAspd', 0) + (rules.desperate() ? 15 : 0) + rules.titleAspd()) / 100) * (state.me.combo === 2 ? 1.25 : 1);
  state.me.sw++;
  state.me.a = rules.aimAngle();
  const mult = W.mult * [1, 1.1, 1.6][state.me.combo];
  const col = RARITIES[stats.S.wr].color;
  const a = state.me.a;
  if (W.ranged) {
    if (!fxSome('shoot', a, mult)) strikes.arrow({ a, mult, type: 'normal' }); // 連射 など
    return;
  }
  const range = W.range * fxReduce('reach', 1, true);
  view.fx.slash(state.me.x, state.me.z, state.me.a, range, W.arc, fxReduce('swingColor', col), 1.0, state.me.combo % 2 === 1);
  view.audio.sfx('swing', { heavy: !!WEAPONS[stats.S.wk]?.twoHanded || state.me.combo === 2 });
  rules.later(0.06, () => strikes.arc(range, W.arc, mult, { a, type: 'normal' }));
  fxCall('swingExtra', a, range, col); // 連突き・一点突破 など
  const waved = state.me.combo === 2 && stats.S.fx.has('wave');
  if (waved) strikes.proj({ a, mult: 1.4, type: 'normal' });
  fxCall('swingLate', a, waved); // 剣の心得A「閃光」・千本 など
  fxCall('swingLast', a); // 魔剣士 など
}


// 他プレイヤーの矢（見た目だけ）
export function fxArrow(x, z, a, color) {
  const m = view.arrowMesh(color, false);
  m.position.set(x, 1.2, z); m.rotation.y = a;
  view.fx.add(m, 0.6, (o, k) => { o.position.x = x + Math.sin(a) * 40 * k * 0.6; o.position.z = z + Math.cos(a) * 40 * k * 0.6; });
}

export function doHeavy(lv) {
  if (!canAct() || lv < 1) return;
  startAttack(); state.me.act++;
  fxCall('beforeHeavy'); // 報復者 など
  rules.wtHeavy(lv);
  state.me.a = rules.aimAngle();
  state.me.swingT = 0; state.me.swingDur = 0.5; state.me.combo = 2; state.me.sw++;
  view.audio.sfx('heavy');
  view.fx.flash(state.me.x, 1.5, state.me.z, RARITIES[stats.S.wr].color, lv === 2 ? 30 : 15, 0.3);
  const counter = state.me.counterFire;
  if (counter) {
    // ガードカウンター: 演出を大きく。称号「不落の盾」はここで被ダメ軽減
    state.me.counterFire = false;
    screen.floatText(state.me.x, 3.2, state.me.z, 'ガードカウンター!', 'just');
    view.fx.flash(state.me.x, 1.5, state.me.z, 0xbfe0ff, 60, 0.4);
    view.fx.ringWave(state.me.x, state.me.z, 0xbfe0ff, 5, 0.4);
    rules.addShake(0.4);
    if (rules.tf('t_guard')) stats.addBuff('fort', '不落の盾', 4, { dr: 40 }, 0xbfe0ff);
    fxSome('guardCounter'); // 盾槍は回転なぎ払い、片手剣（守護騎士）は踏み込みの横斬り
    return;
  }
  if (fxSome('heavyOverride', lv)) return; // 竜騎士の跳躍・投斧 など
  fxCall('heavyStart', lv); // 武器ごとの強攻撃のモーション など
  HEAVY[stats.S.wk].run(combat, lv);
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
  if (!(state.me.sweepT > 0)) return;
  const prev = state.me.sweepT;
  state.me.sweepT += dt;
  const t = state.me.sweepT, a = state.me.a + sweepAngle(t); // 上から見て反時計回り（体の回転と同じ向き）
  // 振りかぶり中は穂先に光が集まり、なぎ払い中は弧の軌跡を残す
  if (t < SWEEP.wind) {
    if (Math.random() < 0.6) view.fx.parts.emit(state.me.x + Math.sin(a) * 3.2, 1.15, state.me.z + Math.cos(a) * 3.2, { color: 0xbfe0ff, size: 0.4, life: 0.25, speed: 0.6, gravity: 0 });
  } else if (t < SWEEP.wind + SWEEP.slash + 0.05) {
    const a0 = state.me.a + sweepAngle(prev);
    // このフレームで通った範囲に斬撃の弧を描く（回転の軌跡が残る）
    const deg = Math.abs(a - a0) * 180 / Math.PI;
    if (deg > 1) view.fx.slash(state.me.x, state.me.z, (a + a0) / 2, SWEEP.r, Math.max(24, deg + 12), 0xbfe0ff, 1.1);
    for (let i = 0; i <= 8; i++) {
      const aa = a0 + (a - a0) * i / 8;
      for (const r of [SWEEP.r - 0.4, SWEEP.r - 1.4, SWEEP.r - 2.4]) view.fx.parts.emit(state.me.x + Math.sin(aa) * r, 1.15, state.me.z + Math.cos(aa) * r, { color: r > SWEEP.r - 1 ? 0xffffff : 0xbfe0ff, size: 0.6, life: 0.3, speed: 0.4, gravity: 0 });
    }
  }
  if (!state.me.sweepHit && prev < SWEEP.hitAt && state.me.sweepT >= SWEEP.hitAt) {
    state.me.sweepHit = true;
    const kk = (stats.S.flags.has('bulwark') ? 1.3 : 1) * fxReduce('sweepPower', 0.5); // 反撃の心得で強くなる。盾槍以外（守護騎士）は半分
    strikes.circle(state.me.x, state.me.z, SWEEP.r, SWEEP.mult * kk, { type: 'heavy', stun: SWEEP.stun * fxReduce('sweepStun', 1) });
    view.fx.ringWave(state.me.x, state.me.z, 0xbfe0ff, SWEEP.r + 0.5, 0.4, 1.0, 1.0);
    view.fx.flash(state.me.x, 1.2, state.me.z, 0xbfe0ff, 50, 0.3);
    view.audio.sfx('heavy'); rules.addShake(0.45);
  }
  if (state.me.sweepT >= SWEEP.dur) state.me.sweepT = 0;
}

export function tryWeaponSkill() {
  if (!canAct()) return;
  const sk = stats.S.ws;
  if (state.me.wsCd > 0) { if (rules.phantomReady('ws')) { startSkill(sk); rules.wtAfterCast('ws', true); } return; }
  state.me.wsCd = sk.cd * (1 - stats.S.cdr / 100) * (stats.S.sv ? rules.variantParams(stats.S.sv).cd : 1) * (rules.tf('t_star') ? 0.8 : 1);
  startSkill(sk);
  rules.wtAfterCast('ws');
}

export function tryTreeSkill(i) {
  if (!stats.S) return;
  const id = state.char.slots?.[i];
  if (!id) { screen.toast(`スロット${i + 1}は空です（Kでスキルツリー）`, '#aab'); return; }
  if (!stats.S.actives.has(id)) { screen.toast(`${TREE_SKILLS[id].name}は今の武器では使えません`, '#f99'); return; }
  if (!canAct()) return;
  const sk = TREE_SKILLS[id];
  if ((state.me.tcd[id] || 0) > 0) { if (rules.phantomReady(id)) { startSkill(sk); rules.wtAfterCast(id, true); } return; }
  state.me.tcd[id] = rules.skillCd(id);
  startSkill(sk);
  rules.wtAfterCast(id);
}

export function startSkill(sk) {
  startAttack(); state.me.act++;
  const mo = sk.motionOf && stats.S.wt ? sk.motionOf(stats.S.wt) : sk.motion; // 武器ツリーの分岐で動きが変わる技
  state.me.motion = mo || '';state.me.skillDuration = MOTION_DURATIONS[mo] || sk.duration || .55;state.me.motionT = 0;
  state.me.skillT = 0; state.me.spin = !!sk.spin; state.me.sk++;
  state.me.a = rules.aimAngle();
  // 回転系以外のスキルは、武器を振る（槍は突く）モーションを出す。他のプレイヤーにも見える
  if (!sk.spin) { state.me.swingT = 0; state.me.swingDur = 0.45; state.me.combo = 2; state.me.sw++; }
  state.me.charging = false;
  view.audio.sfx('skill');
  screen.floatText(state.me.x, 3, state.me.z, sk.name, 'info');
  view.fx.flash(state.me.x, 2, state.me.z, RARITIES[stats.S.wr].color, 25, 0.4);
  if (sk === stats.S.ws) rules.castWeaponSkill(sk); else sk.run(combat);
}

// 矢・斬撃波が倒れている仲間に当たったら起こす（貫通しない矢はそこで止まる）
export function projRevive(w, arrow) {
  for (const p of rules.downedAllies()) {
    const key = 'p' + p.id;
    if (w.hit.has(key) || Math.hypot(p.x - w.x, p.z - w.z) > w.rad + 0.6) continue;
    w.hit.add(key);
    rules.reviveHit(p, { type: w.type, sv: w.sv });
    if (arrow && !w.pierce) return true;
  }
  return false;
}
export function updateProjs(dt) {
  for (let i = state.projs.length - 1; i >= 0; i--) {
    const w = state.projs[i];
    w.t += dt;
    w.x += Math.sin(w.a) * w.speed * dt; w.z += Math.cos(w.a) * w.speed * dt;
    if (w.arrow) {
      // 矢: 射程（離したときの円の大きさ）まで飛ぶ
      w.mesh.position.set(w.x, 1.2, w.z);
      if (Math.random() < 0.7) view.fx.parts.emit(w.x, 1.2, w.z, { color: w.color, size: 0.35, life: 0.25, speed: 0.4, gravity: 0 });
      let done = false;
      fxCall('arrowTick', w); // 射抜き など
      for (const mb of [...state.mobs.values()]) {
        if (w.hit.has(mb.id) || Math.hypot(mb.x - w.x, mb.z - w.z) > w.rad + mb.rad) continue;
        w.hit.add(mb.id);
        // 射程の中はどこでも本来のダメージ。遠矢（射程の端で +20%）は弓のファイル
        const d = Math.hypot(mb.x - w.sx, mb.z - w.sz), edge = fxSome('arrowEdge', w, d);
        const hawk = w.full && rules.tf('t_hawk') && Math.random() < 0.3;
        rules.dealDamage(mb, w.mult * (edge ? 1.2 : 1), { type: w.type, tech: w.tech, sv: w.sv, cast: w.cast, crit: hawk || w.crit || undefined, poison: w.poison, full: w.full, snipe: w.snipe });
        if (w.onHit) w.onHit(mb);
        fxCall('arrowHit', w, mb); // 鷹の目・狙い澄まし など
        if (edge) screen.floatText(mb.x, 3.4, mb.z, '遠矢', 'info');
        view.fx.parts.burst(w.x, 1.2, w.z, w.full ? 18 : 8, { color: w.full ? 0xffd84a : 0xffffff, speed: 5, size: 0.4, life: 0.3 });
        if (!w.pierce) { done = true; break; }
      }
      if (!done) done = projRevive(w, true);
      const c = collide(state.world.def, w.x, w.z, 0.1, state.world.door);
      if (done || w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { fxCall('arrowGone', w); view.fx.dispose(w.mesh); state.projs.splice(i, 1); }
      continue;
    }
    w.mesh.position.set(w.x, 1, w.z);
    view.projShape(w.shape).tick(w, dt);
    view.fx.parts.emit(w.x, 1, w.z, { color: w.color ?? w.mesh.material.color, size: 0.4, life: 0.3, speed: 1, gravity: 0 });
    for (const mb of [...state.mobs.values()]) {
      if (w.hit.has(mb.id)) continue;
      if (Math.hypot(mb.x - w.x, mb.z - w.z) < w.rad + mb.rad) { w.hit.add(mb.id); rules.dealDamage(mb, w.mult, { type: w.type, tech: w.tech, noProc: true, sv: w.sv, cast: w.cast, wave: w.wave, proj: w, wtNo: w.wtNo, stun: w.stun }); }
    }
    projRevive(w, false);
    const c = collide(state.world.def, w.x, w.z, 0.1, state.world.door);
    if (w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { view.fx.dispose(w.mesh); state.projs.splice(i, 1); }
  }
}

// ---- ボスの弾 ----
export function spawnBossProj(m) {
  const g = view.bossProjMesh(m);
  g.position.set(m.x, 1.3, m.z);
  view.scene.add(g);
  state.bprojs.push({ ...m, mesh: g, dodged: false });
}
export function clearBossProjs() { for (const p of state.bprojs.splice(0)) view.fx.dispose(p.mesh); }
export function updateBossProjs(dt) {
  for (let i = state.bprojs.length - 1; i >= 0; i--) {
    const p = state.bprojs[i];
    p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
    p.mesh.position.set(p.x, 1.3, p.z);
    if (Math.random() < 0.6) view.fx.parts.emit(p.x, 1.3, p.z, { color: p.c, size: 0.4, life: 0.3, speed: 0.3, gravity: 0 });
    let gone = p.life <= 0;
    const d = Math.hypot(p.x - state.me.x, p.z - state.me.z);
    if (!gone && !state.me.dead && !state.me.crawl && d < p.r + 0.6) {
      const facing = Math.abs(angDiff(Math.atan2(p.x - state.me.x, p.z - state.me.z), state.me.a)) < degToRad(80);
      if (rules.guardUp() && stats.S.guard && facing) {
        // ガードで弾を消す
        link.net.send({ t: 'pblock', id: p.id });
        if (!rules.guardDamage(p.dmg, false)) { screen.floatText(state.me.x, 2.6, state.me.z, '防御', 'info'); rules.armCounter(); rules.wtOnGuard(p.dmg, state.mobs.get(p.src)); }
        view.audio.sfx('block');
        view.fx.parts.burst(p.x, 1.3, p.z, 20, { color: 0xbfe0ff, speed: 6, size: 0.4, life: 0.35 });
        gone = true;
      } else if (fxSome('counter', p)) {
        link.net.send({ t: 'pblock', id: p.id });
        gone = true; // 大剣カウンターで弾を受け流す
      } else if (state.me.iframe > 0) {
        if (!p.dodged) { p.dodged = true; rules.onJustDodge(); }
      } else {
        link.net.send({ t: 'absorb', id: p.src });
        rules.takeDamage(p.dmg * (rules.tf('t_spell') ? 0.65 : 1), { x: p.x - p.vx, z: p.z - p.vz });
        view.fx.parts.burst(p.x, 1.3, p.z, 20, { color: p.c, speed: 6, size: 0.5, life: 0.4 });
        gone = true;
      }
    }
    if (gone) { view.fx.dispose(p.mesh); state.bprojs.splice(i, 1); }
  }
}

export function tryDodge() {
  view.audio.init();
  if (state.me.downT > 0) { rules.tryTech(); return; } // ダウン中は受け身
  if (!stats.S || state.me.dead || state.me.crawl || state.me.dodgeCd > 0 || state.me.dashT > 0 || state.me.staggerT > 0) return;
  let dx = 0, dz = 0;
  if (state.keys.has('w')) dz -= 1; if (state.keys.has('s')) dz += 1; if (state.keys.has('a')) dx -= 1; if (state.keys.has('d')) dx += 1;
  if (Math.hypot(rules.touch.stick.x, rules.touch.stick.y) > 0.25) { dx = rules.touch.stick.x; dz = rules.touch.stick.y; }
  if (!dx && !dz) { dx = Math.sin(state.me.a); dz = Math.cos(state.me.a); }
  const l = Math.hypot(dx, dz);
  const after = stats.hasBuff('afterimage');
  state.me.dodgeDir = [dx / l, dz / l];
  state.me.dodgeT = 0.38;
  state.me.dodgeCd = stats.S.dodgeCd * (after ? 0.25 : 1);
  state.me.iframe = (after ? 0.6 : 0.32) + stats.S.iframeBonus;
  state.me.swingT = 9; state.me.skillT = -1; state.me.motion = '';state.me.charging = false; state.me.guarding = false;
  view.audio.sfx('dodge');
  fxCall('onDodge'); // 速射・罠師 など
  if (rules.tf('t_wind')) { state.me.buffs = state.me.buffs.filter((b) => b.id !== 'wind'); state.me.buffs.push({ id: 'wind', label: '疾風', t: 1.9, max: 1.9, mods: { move: 40 }, color: 0x9affc8 }); }
  view.fx.parts.burst(state.me.x, 0.3, state.me.z, 12, { color: after ? 0x9affff : 0xdddddd, speed: 3, size: 0.4, life: 0.4, gravity: 1 });
}

export function usePotion() {
  if (!stats.S || state.me.dead || state.me.crawl || state.me.potions <= 0 || state.me.potCd > 0 || state.me.hp >= stats.S.mhp) return;
  state.me.potions--; state.me.potCd = BALANCE.potionCooldown;
  heal(stats.S.mhp * BALANCE.potionHeal * (rules.tf('t_spore') ? 1.4 : 1), true);
  view.audio.sfx('potion');
  view.fx.parts.burst(state.me.x, 1, state.me.z, 30, { color: 0x6aff8a, speed: 3, size: 0.4, life: 0.8, gravity: 3 });
}

export function heal(n, show) {
  if (state.characterStore.lost || state.me.crawl) return;
  const before = state.me.hp;
  state.me.hp = Math.min(stats.S.mhp, state.me.hp + n);
  if (show && state.me.hp > before) screen.floatText(state.me.x, 2.2, state.me.z, '+' + Math.round(state.me.hp - before), 'heal');
}

export function gainXp(n) {
  if (state.characterStore.lost) return;
  rules.gainWeaponProf(n);
  if (state.char.lv >= MAX_LEVEL) return;
  state.char.xp += n;
  screen.floatText(state.me.x, 3.0, state.me.z, `+${n} EXP`, 'info');
  let leveled = false;
  while (state.char.lv < MAX_LEVEL && state.char.xp >= xpToNext(state.char.lv)) {
    state.char.xp -= xpToNext(state.char.lv); state.char.lv++; leveled = true;
  }
  if (leveled) {
    stats.calcStats(); state.me.hp = stats.S.mhp;
    view.audio.sfx('levelup');
    view.fx.beam(state.me.x, state.me.z, 0xffd84a, 16, 1.0, 1.5);
    view.fx.parts.burst(state.me.x, 0.5, state.me.z, 80, { color: 0xffd84a, speed: 6, size: 0.5, life: 1.5, gravity: 2 });
    screen.banner('LEVEL UP', `Lv ${state.char.lv}`, '#ffd84a');
    screen.toast('スキルポイント +1（Kでスキルツリー）', '#ffd84a');
    screen.ui.refresh();
  }
  state.saveChar();
}
