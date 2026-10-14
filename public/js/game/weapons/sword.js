// 片手剣の武器ツリーの効果（勢い・剣聖・幻剣・守護騎士・報復者 など）。差し込み口は game/weapon-fx.js
import * as THREE from 'three';
import { TREE_MOTIONS } from '../../../shared/tree-motions.js';
import { BALANCE } from '../../../shared/balance.js';
import { clamp, now, rnd } from '../util.js';
import { floatText } from '../ui-bridge.js';
import { audio, fx } from '../render.js';
import { me } from '../state.js';
import { S, addBuff, hasBuff } from '../stats.js';
import { net } from '../net-client.js';
import { addShake, later } from '../combat.js';
import { cutCds, quietBuff, wtEmit } from '../tree-effects.js';
import { extendCombat, heal, strikes, SWEEP } from '../actions.js';
import { registerWeaponFx } from '../weapon-fx.js';

// 剣闘士の「勢い」（バフ欄に数を出す）
export function setMom(n) {
  n = clamp(n, 0, 10);
  if (n === me.mom) return;
  const up = n > me.mom;
  me.mom = n;
  if (up && n === 10 && me.model) { fx.ringWave(me.x, me.z, 0xffb040, 3, 0.35); fx.flash(me.x, 1.4, me.z, 0xffb040, 25, 0.25); } // 勢いが最大になった合図
  me.buffs = me.buffs.filter((b) => b.id !== 'sw_mom');
  if (n > 0) me.buffs.push({ id: 'sw_mom', label: `勢い ${n}`, t: 1e9, max: 1e9, mods: {}, color: 0xff9a2e });
}
// 片手剣のガードカウンター（守護騎士）: 踏み込みながら大きく横に斬り払う。威力は盾槍の回転なぎ払いの半分
export function swordCounter() {
  const M = TREE_MOTIONS.sw_counter, a = me.a;
  me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration;
  strikes.dash(a, 1.4, 0.16, 0.3);
  audio.sfx('swing', { heavy: true });
  later(M.hits[0], () => {
    strikes.arc(4.2, 300, SWEEP.mult * 0.5, { type: 'heavy', stun: SWEEP.stun, a });
    fx.slash(me.x, me.z, a, 4.2, 300, 0xbfe0ff, 1.4);
    fx.ringWave(me.x, me.z, 0xbfe0ff, 4.6, 0.35);
    audio.sfx('heavy'); addShake(0.35);
  });
}
const handPos = new THREE.Vector3();

// スキルに渡す文脈に、受け流しの構えを足す（c.parry）
extendCombat({
  parry(sec, dr) { addBuff('sw_parry', '受け流し', sec, { dr }, 0xbfe0ff); me.parryUntil = now() + sec; me.parryDone = false; },
});

registerWeaponFx('sword', {
  // 能力値: 守護騎士はガードできる・軽身（回避の距離と無敵）
  stats(S, WT) {
    S.guard = S.guard || WT?.ks1 === 'sw_guard';
    if (WT?.br('sw_light') === 'B') S.dodgeDist = 1.3;
    S.iframeBonus = S.iframeBonus + (WT ? WT.v('sw_light', 'iframe') : 0);
  },
  afterStats() { if (S.wt?.ks1 !== 'sw_glad' && me.mom) setMom(0); },
  treeReset() { setMom(0); me.revenge = 0; },
  // 剣聖: 全会心
  critAlways: (o) => hasBuff('sw_saint') && o.type !== 'dot',
  dmgMult(k, W, o) {
    if (W.ks1 === 'sw_glad') k *= 1 + me.mom * 0.03;
    if (W.br('sw_tough') === 'B' && me.hp < S.mhp * 0.5) k *= 1.15;
    if (o.wave && W.br('sw_dance') === 'B' && hasBuff('sw_dance')) k *= 1.5;
    return k;
  },
  // 幻剣で出したもう1回は威力 -30%（後の先の +50% のあと）
  dmgMultLast: (k, W, o) => ((o.type === 'tskill' || o.type === 'wskill') && now() < me.phantomUntil ? k * 0.7 : k),
  onHit(mb, dmg, crit, o) {
    const W = S.wt;
    // 技の巡り: 1回の攻撃で1回まで
    if (W.lv('sw_cycle') && me.cycleAct !== me.act) { me.cycleAct = me.act; cutCds(W.v('sw_cycle', 'cut') * (crit && W.br('sw_cycle') === 'A' ? 2 : 1)); }
    if (W.ks1 === 'sw_glad') {
      setMom(me.mom + 1);
      if (W.ks2 === 'sw_saint' && me.mom >= 10 && !me.saintOn) {
        me.saintOn = true;
        addBuff('sw_saint', '剣聖・全会心', 3, {}, 0xffd84a);
        floatText(me.x, 3.2, me.z, '剣聖!', 'just');
      }
    }
    if (W.ks2 === 'sw_berserk' && me.mom > 0) heal(dmg * me.mom / 100 * BALANCE.lifestealEfficiency, false);
    if (crit && W.br('sw_edge') === 'A' && now() - me.edgeT > 0.5) {
      me.edgeT = now();
      strikes.proj({ a: Math.atan2(mb.x - me.x, mb.z - me.z), mult: 0.5, type: 'proc', speed: 26, life: 0.45, rad: 0.9, wtNo: true });
    }
    if (crit && W.br('sw_edge') === 'B' && now() - me.edgeHealT > 0.15) { me.edgeHealT = now(); heal(S.mhp * 0.01, false); }
    if (o.type === 'normal' && W.br('sw_norm') === 'B') {
      if (me.normHealAct !== me.act) { me.normHealAct = me.act; me.normHeals = 0; }
      if (me.normHeals < 2) { me.normHeals++; heal(S.mhp * 0.005, false); }
    }
    if (o.type === 'normal' && W.br('sw_dance') === 'A' && me.danceAct !== me.act && me.danceExt < 4) {
      const b = me.buffs.find((q) => q.id === 'sw_dance');
      if (b) { me.danceAct = me.act; me.danceExt += 0.2; b.t += 0.2; b.max = Math.max(b.max, b.t); }
    }
    // 天剣: 斬撃波1発につき1回
    if (o.wave && W.ks2 === 'sw_heaven' && o.proj && !o.proj.heaven) {
      o.proj.heaven = true; cutCds(0.15);
      // 天剣: 当たった所から光の粒が持ち主へ戻ってくる（クールタイムが縮んだ合図）
      const dx = me.x - mb.x, dz = me.z - mb.z, d = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 6; i++) fx.parts.emit(mb.x, 1.3, mb.z, { color: 0xfff0a0, size: 0.32, life: Math.min(0.6, d / 14), dir: [dx / d, 0.05, dz / d], speed: 14, spread: 0.15, gravity: 0, drag: 0 });
      fx.parts.burst(me.x, 1.3, me.z, 6, { color: 0xfff0a0, speed: 2.5, size: 0.3, life: 0.35 });
    }
  },
  // スキルを使った後（free: 幻剣のもう1回）
  afterCast(id, free) {
    const W = S.wt;
    if (W.ks1 === 'sw_mage') me.mageT = now() + 3;
    if (W.br('sw_cycle') === 'B') quietBuff('sw_cycleB', '余勢', 2, { aspd: 12 }, 0x9affc8);
  },
  afterCastLate(id, free) {
    const W = S.wt;
    if (id === 'sw_dance') me.danceExt = 0;
    if (free) {
      me.phantom = null; me.phantomUntil = now() + 1.2;
      floatText(me.x, 3.4, me.z, '幻剣', 'just');
      fx.ringWave(me.x, me.z, 0xb86cff, 2.6, 0.35);
    } else if (W.ks2 === 'sw_phantom') me.phantom = { id, until: now() + 3 };
  },
  phantomReady: (id) => S.wt?.ks2 === 'sw_phantom' && me.phantom?.id === id && now() < me.phantom.until,
  // 受け流し（構えている間に受けた）: ほかの被弾の効果は起きない
  parry() {
    const W = S.wt;
    if (!(now() < me.parryUntil && !me.parryDone)) return false;
    me.parryDone = true;
    floatText(me.x, 3, me.z, '受け流し!', 'just');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xbfe0ff, 2.4, 0.3);
    if (W.br('sw_parry') === 'A') cutCds(3);
    if (W.br('sw_parry') === 'B') addBuff('sw_parryB', '奮い立ち', 5, { atkp: 25 }, 0xffb040);
    return true;
  },
  // 攻撃を受けた（不撓A・勢いのリセット）
  onHurt() {
    const W = S.wt;
    if (W.br('sw_tough') === 'A') cutCds(1);
    if (W.ks1 === 'sw_glad' && W.ks2 !== 'sw_berserk') setMom(0);
  },
  // ガードで受けた（守護騎士・報復者）
  onGuard(raw) {
    const W = S.wt;
    if (W.ks2 === 'sw_paladin' && now() - me.paladinT > 1.5) {
      me.paladinT = now();
      heal(S.mhp * 0.05, true);
      net.send({ t: 'taunt', r: 8 });
      fx.ringWave(me.x, me.z, 0xfff0a0, 4, 0.4);
    }
    if (W.ks2 === 'sw_avenger') { me.revenge = Math.min(S.mhp, me.revenge + raw); fx.ringWave(me.x, me.z, 0xff4a3a, 1.6 + Math.min(1, me.revenge / (S.mhp * 0.5)) * 1.6, 0.3); }
  },
  // 報復者: 溜めたダメージを次の強攻撃（ガードカウンター）に上乗せ
  beforeHeavy() {
    if (!(me.revenge > 0) || S.wt?.ks2 !== 'sw_avenger') return;
    const mult = me.revenge / S.atk;
    me.revenge = 0;
    later(0.15, () => {
      strikes.circle(me.x, me.z, 3.6, mult, { type: 'heavy' });
      fx.ringWave(me.x, me.z, 0xff6a5a, 4, 0.4); fx.flash(me.x, 1.5, me.z, 0xff6a5a, 40, 0.3);
      floatText(me.x, 3.2, me.z, '報復!', 'just'); addShake(0.3);
    });
  },
  // 守護騎士のガードカウンター（盾槍以外）
  guardCounter() { if (S.wk === 'spear') return false; swordCounter(); return true; },
  // 不撓B「背水」
  drLowHp: (dr) => dr + (S.wt?.br('sw_tough') === 'B' && me.hp < S.mhp * 0.5 ? 15 : 0),
  // 狂剣士: 勢いの分だけ被ダメージが増える
  incoming: (raw) => (S.wt?.ks2 === 'sw_berserk' ? raw * (1 + 0.02 * me.mom) : raw),
  swingAspd: (v) => v + (S.wt?.ks1 === 'sw_glad' ? me.mom * 2 : 0),
  // 3段目: 剣の心得A「閃光」（斬撃波の特性がないとき）/ 魔剣士の光波
  swingLate(a, waved) {
    if (!waved && me.combo === 2 && S.wt?.br('sw_norm') === 'A') strikes.proj({ a, mult: 1.2, type: 'normal' }); // 剣の心得A「閃光」
  },
  swingLast(a) {
    if (S.wt?.ks1 === 'sw_mage' && now() < me.mageT) strikes.proj({ a, mult: 0.8, type: 'normal', speed: 26, life: 0.5, rad: 1.1 }); // 魔剣士
  },
  justDodge() { if (S.wt?.br('sw_light') === 'A') { me.afterJust = true; floatText(me.x, 3.0, me.z, '後の先', 'just'); } },
  // ブレイブハートB「速攻」: 効果中はクールタイムが早く戻る
  cooldownDt: (dt) => (S?.wt?.br('sw_brave') === 'B' && hasBuff('sw_brave') ? dt / 0.7 : dt),
  tick() { if (me.saintOn && !hasBuff('sw_saint')) { me.saintOn = false; setMom(0); } }, // 剣聖の全会心が終わったら勢いは0
  // とどめを刺した（直前に当てた）: ブレイブハートA「猛り」
  onKill(mb) { if (mb && S?.wt?.br('sw_brave') === 'A' && now() - mb.localT < 1.2) { const b = me.buffs.find((q) => q.id === 'sw_brave'); if (b) { b.t += 2; b.max = Math.max(b.max, b.t); } } },
  aura(dt, W) {
    // 剣闘士: 勢いが溜まるほど、橙の火の粉が体から立ちのぼる（最大で足元に炎の輪）
    if (W.ks1 === 'sw_glad' && me.mom > 0) {
      wtEmit('mom', me.mom * 7, dt, () => fx.parts.emit(me.x + rnd(-0.55, 0.55), rnd(0.1, 1.5), me.z + rnd(-0.55, 0.55), { color: me.mom >= 10 ? 0xffc040 : 0xff7a2a, size: 0.3 + me.mom * 0.03, life: 0.7, speed: 1.4, gravity: -4 }));
      if (me.mom >= 10 && now() - (me.momFxT || 0) > 0.7) { me.momFxT = now(); fx.ringWave(me.x, me.z, 0xff9a2e, 1.8, 0.45); }
    }
    // 剣聖: 全会心の間は、剣から金の光がこぼれ、足元に金の輪
    if (hasBuff('sw_saint')) {
      me.model.userData.hand?.getWorldPosition(handPos);
      wtEmit('saint', 45, dt, () => fx.parts.emit(handPos.x + rnd(-0.35, 0.35), handPos.y + rnd(-0.2, 0.7), handPos.z + rnd(-0.35, 0.35), { color: 0xffe070, size: 0.34, life: 0.45, speed: 0.6, gravity: -2 }));
      if (now() - (me.saintFxT || 0) > 0.5) { me.saintFxT = now(); fx.ringWave(me.x, me.z, 0xffd84a, 2.2, 0.4); }
    }
    // 報復者: 溜めたダメージが多いほど、赤い揺らめきが濃くなり、足元の赤い輪が脈打つ
    if (W.ks2 === 'sw_avenger' && me.revenge > 0) {
      const k = Math.min(1, me.revenge / (S.mhp * 0.5));
      wtEmit('rev', 12 + 45 * k, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.1, 1.3), me.z + rnd(-0.5, 0.5), { color: k > 0.7 ? 0xff2a2a : 0xff6a5a, size: 0.28 + 0.28 * k, life: 0.6, speed: 0.9, gravity: -2.5 }));
      if (now() - (me.revFxT || 0) > 1.1 - 0.6 * k) { me.revFxT = now(); fx.ringWave(me.x, me.z, 0xff4a3a, 1.4 + k, 0.4); }
    }
  },
});
