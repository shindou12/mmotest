import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { BALANCE } from '../../shared/balance.js';
import * as THREE from 'three';
import { RARITIES, WEAPONS } from '../../shared/data.js';
import { TREE_SKILLS } from '../skills.js';
import { LIGHT_COLOR, WT_NODE, WT_RESET_COST, gainProf, hasWTree, profLevel, profOf, wtChoose, wtLearn, wtOf, wtReset, wtSpent } from '../weapon-tree.js';
import { angDiff, clamp, now, rnd } from './util.js';
import { floatText, toast } from './ui-bridge.js';
import { char, params, saveChar } from './save.js';
import { audio, fx } from './render.js';
import { me, mobs, world } from './state.js';
import { S, addBuff, calcStats, hasBuff } from './stats.js';
import { net } from './net-client.js';
import { heightAt } from './area.js';
import { setHitStop } from './hurt.js';
import { addShake, aimAngle, aimPoint, dealDamage, later } from './combat.js';
import { combat, heal } from './actions.js';

// ======================================================================
// 武器ツリー（weapon-tree.js）の効果。今は片手剣だけ。S.wt が null の武器では何もしない
// ======================================================================
export const ATK_TYPES = ['normal', 'heavy', 'wskill', 'tskill'];
export function quietBuff(id, label, sec, mods, color) {
  me.buffs = me.buffs.filter((b) => b.id !== id);
  me.buffs.push({ id, label, t: sec, max: sec, mods, color });
}
export function cutCds(sec) { me.wsCd -= sec; for (const k in me.tcd) me.tcd[k] -= sec; }
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
export function wtDmgMult(o, mb, crit) {
  const W = S.wt;
  if (!W || o.type === 'dot') return 1;
  let k = 1;
  // 短剣
  if (W.ks2 === 'dk_spread' && mb?.vStack) k *= 1 + 0.04 * mb.vStack;
  if (W.br('dk_combo') === 'B' && me.dStack >= S.dStackMax) k *= 1.06;
  if (W.ks1 === 'dk_assassin' && o.type !== 'proc' && wtBehind(mb)) k *= 1.2 * (W.ks2 === 'dk_exec' && crit && mb.kind === 2 ? 1.4 : 1);
  // 弓: 狙い澄まし
  if (W.ks2 === 'bw_aim' && o.snipe) k *= 1 + 0.1 * me.aimN;
  // 大斧
  if (o.type !== 'proc') k *= 1 + axBers() / 100;
  if (W.br('ax_swing') === 'B' && o.type === 'normal' && me.combo === 2) k *= 1.3;
  if (W.br('ax_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
  if (W.ks2 === 'ax_shatter' && o.type === 'heavy' && mb?.kind === 2 && mb.stunT > 0) k *= 1.5;
  // 盾槍
  const tip = spTip(o);
  if (tip === 1) k *= 1.25; else if (tip === -1) k *= 0.8;
  if (hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy')) k *= 1.2;
  if (W.br('sp_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
  // 大剣
  const maxHeavy = o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8;
  if (W.ks1 === 'gt_wave' && o.type === 'heavy' && !o.wave) k *= 0.85;
  if (W.ks1 === 'gt_blow' && maxHeavy) k *= 1.4;
  if (W.br('gt_break') === 'A' && mb?.stunT > 0) k *= 1.2;
  if (o.exec && mb && mb.hp < mb.mhp * 0.3) k *= o.exec;
  if (W.ks1 === 'sw_glad') k *= 1 + me.mom * 0.03;
  if (W.br('sw_tough') === 'B' && me.hp < S.mhp * 0.5) k *= 1.15;
  if (o.wave && W.br('sw_dance') === 'B' && hasBuff('sw_dance')) k *= 1.5;
  if (me.afterJust && ATK_TYPES.includes(o.type)) { me.afterJust = false; k *= 1.5; }
  if ((o.type === 'tskill' || o.type === 'wskill') && now() < me.phantomUntil) k *= 0.7;
  return k;
}
export function wtOnHit(mb, dmg, crit, o, mult) {
  const W = S.wt;
  if (o.type === 'dot' || o.type === 'proc' || o.wtNo) return;
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
  // 盾槍: 先端の連続（一点突破）と雷槍
  if (W.ks1 === 'sp_reach' && me.tipAct !== me.act && ATK_TYPES.includes(o.type)) {
    me.tipAct = me.act;
    me.tipRun = spTip(o) === 1 ? me.tipRun + 1 : 0;
    if (W.ks2 === 'sp_pierce' && me.tipRun >= 3 && !me.pierceReady) { me.pierceReady = true; me.tipRun = 0; floatText(me.x, 3.1, me.z, '一点突破', 'just'); fx.ringWave(me.x, me.z, 0xfff0a0, 1.8, 0.3); }
  }
  if (spTip(o) === 1) fx.flash(mb.x, 1.3, mb.z, 0xfff0a0, 14, 0.12);
  if (W.ks2 === 'sp_bolt' && hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy') && now() - me.boltT > 0.3) {
    me.boltT = now();
    const x = mb.x, z = mb.z;
    later(0.06, () => { fx.lightning(x, z, 0x9ad8ff); combat.circle(x, z, 2.5, 0.6, { type: 'proc', noProc: true }); audio.sfx('thunder'); });
  }
  // 短剣: 毒・出血を重ねる / 連刃の二重斬り
  if (o.poison) addPoison(mb, o.poison);
  if (W.ks1 === 'dk_venom') addPoison(mb, 1);
  if (hasBuff('dk_poison')) addPoison(mb, 1);
  if (W.br('dk_toxin') === 'B' && o.type === 'normal' && me.combo === 2) addPoison(mb, 1);
  if (crit && W.br('dk_vitalp') === 'B') addBleed(mb, 0.2, false, 3);
  if (W.ks1 === 'dk_blades' && me.dStack >= S.dStackMax && o.type === 'normal') later(0.07, () => { if (mb.hp > 0) { dealDamage(mb, mult * 0.4, { type: 'proc', noProc: true, wtNo: true }); fx.slash(mb.x, mb.z, me.a + Math.PI, 1.6, 120, 0xcab4ff, 0.6, true); } });
  if (W.ks2 === 'sw_berserk' && me.mom > 0) heal(dmg * me.mom / 100 * BALANCE.lifestealEfficiency, false);
  if (crit && W.br('sw_edge') === 'A' && now() - me.edgeT > 0.5) {
    me.edgeT = now();
    combat.proj({ a: Math.atan2(mb.x - me.x, mb.z - me.z), mult: 0.5, type: 'proc', speed: 26, life: 0.45, rad: 0.9, wtNo: true });
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
  // 月蝕: 光波が最初に当たった敵のところで爆ぜる
  if (o.proj?.eclipse && !o.proj.boomed) {
    o.proj.boomed = true;
    const x = mb.x, z = mb.z;
    later(0.05, () => { combat.circle(x, z, 3, 1.5, { type: 'proc', wtNo: true }); fx.ringWave(x, z, LIGHT_COLOR, 3.4, 0.35); fx.flash(x, 1.2, z, LIGHT_COLOR, 30, 0.25); audio.sfx('wave'); });
  }
  // 天剣: 斬撃波1発につき1回
  if (o.wave && W.ks2 === 'sw_heaven' && o.proj && !o.proj.heaven) {
    o.proj.heaven = true; cutCds(0.15);
    // 天剣: 当たった所から光の粒が持ち主へ戻ってくる（クールタイムが縮んだ合図）
    const dx = me.x - mb.x, dz = me.z - mb.z, d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 6; i++) fx.parts.emit(mb.x, 1.3, mb.z, { color: 0xfff0a0, size: 0.32, life: Math.min(0.6, d / 14), dir: [dx / d, 0.05, dz / d], speed: 14, spread: 0.15, gravity: 0, drag: 0 });
    fx.parts.burst(me.x, 1.3, me.z, 6, { color: 0xfff0a0, speed: 2.5, size: 0.3, life: 0.35 });
  }
}
// スキルを使った後（free: 幻剣のもう1回）
export function wtAfterCast(id, free = false) {
  const W = S.wt;
  if (!W) return;
  if (W.ks1 === 'sw_mage') me.mageT = now() + 3;
  if (W.br('sw_cycle') === 'B') quietBuff('sw_cycleB', '余勢', 2, { aspd: 12 }, 0x9affc8);
  if (W.br('bw_quiver') === 'B') quietBuff('bw_quiverB', '余勢', 2, { aspd: 25 }, 0x9affc8);
  if (id === 'sw_dance') me.danceExt = 0;
  if (free) {
    me.phantom = null; me.phantomUntil = now() + 1.2;
    floatText(me.x, 3.4, me.z, '幻剣', 'just');
    fx.ringWave(me.x, me.z, 0xb86cff, 2.6, 0.35);
  } else if (W.ks2 === 'sw_phantom') me.phantom = { id, until: now() + 3 };
}
export const phantomReady = (id) => S.wt?.ks2 === 'sw_phantom' && me.phantom?.id === id && now() < me.phantom.until;
export function skillCd(id) {
  const sk = TREE_SKILLS[id];
  return (sk.cdOf && S.wt ? sk.cdOf(S.wt) : sk.cd) * (1 - S.cdr / 100);
}
// 攻撃を受けた（受け流し・不撓A・勢いのリセット）
export function wtOnHurt(guarded) {
  const W = S.wt;
  if (W.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder();
  if (now() < me.parryUntil && !me.parryDone) {
    me.parryDone = true;
    floatText(me.x, 3, me.z, '受け流し!', 'just');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xbfe0ff, 2.4, 0.3);
    if (W.br('sw_parry') === 'A') cutCds(3);
    if (W.br('sw_parry') === 'B') addBuff('sw_parryB', '奮い立ち', 5, { atkp: 25 }, 0xffb040);
    return;
  }
  if (me.charging) {
    if (W.ks2 === 'gt_unyield') me.chargeT = Math.max(me.chargeT, S.chargeMax);
    else if (W.br('gt_armor') === 'A') me.chargeT += 0.3;
  }
  if (guarded) return;
  if (W.lv('ax_rage')) quietBuff('ax_rage', '怒り', 5, { atkp: W.v('ax_rage', 'rage'), ...(W.br('ax_rage') === 'A' ? { aspd: 15 } : {}), ...(W.br('ax_rage') === 'B' ? { dr: 15 } : {}) }, 0xff6a3a);
  if (W.br('sw_tough') === 'A') cutCds(1);
  if (W.ks1 === 'sw_glad' && W.ks2 !== 'sw_berserk') setMom(0);
}
// ガードで受けた（守護騎士）
export function wtOnGuard(raw, src) {
  const W = S.wt;
  if (!W) return;
  if (W.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder();
  if (W.br('sp_shield') === 'B' && src?.hp > 0) dealDamage(src, 0.3, { type: 'proc', stun: 6, noProc: true }); // 盾の重み
  if (W.ks2 === 'sw_paladin' && now() - me.paladinT > 1.5) {
    me.paladinT = now();
    heal(S.mhp * 0.05, true);
    net.send({ t: 'taunt', r: 8 });
    fx.ringWave(me.x, me.z, 0xfff0a0, 4, 0.4);
  }
  if (W.ks2 === 'sw_avenger') { me.revenge = Math.min(S.mhp, me.revenge + raw); fx.ringWave(me.x, me.z, 0xff4a3a, 1.6 + Math.min(1, me.revenge / (S.mhp * 0.5)) * 1.6, 0.3); }
}
// 報復者: 溜めたダメージを次の強攻撃（ガードカウンター）に上乗せ
export function wtRevenge() {
  if (!(me.revenge > 0) || S.wt?.ks2 !== 'sw_avenger') return;
  const mult = me.revenge / S.atk;
  me.revenge = 0;
  later(0.15, () => {
    combat.circle(me.x, me.z, 3.6, mult, { type: 'heavy' });
    fx.ringWave(me.x, me.z, 0xff6a5a, 4, 0.4); fx.flash(me.x, 1.5, me.z, 0xff6a5a, 40, 0.3);
    floatText(me.x, 3.2, me.z, '報復!', 'just'); addShake(0.3);
  });
}
// 大剣: 溜め中の被ダメージ軽減（剛体lv2・剛体B・一撃）と破城の構えA
export function wtDr() {
  const W = S.wt;
  if (!W) return 0;
  let dr = 0;
  if (me.charging) {
    if (W.lv('gt_armor') >= 2) dr += 15;
    if (W.br('gt_armor') === 'B') dr += 10;
    if (W.ks1 === 'gt_blow') dr += 30;
  }
  if (W.br('gt_siege') === 'A' && hasBuff('gt_siege')) dr += 20;
  return dr;
}
// 断罪: 最大溜めの強攻撃の会心率 +35%
export const wtCritAdd = (o) => (S.wt?.ks2 === 'gt_judge' && o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8 ? 35 : 0) + (S.wt?.br('bw_crit') === 'A' && o.full ? 15 : 0) + (S.wt?.br('bw_quiver') === 'A' && o.type === 'tskill' && S.wk === 'bow' ? 15 : 0); // 急所射ち・鋭矢
// 強攻撃の押し始め: 居合・踏み込み溜めで、溜めた状態から始める
export function wtChargeStart() {
  if (!S?.wt) return;
  if (me.soarReady && now() < me.soarReady && !me.dead && me.downT <= 0 && me.staggerT <= 0) { // 竜翔: 溜めなしでもう一度跳ぶ
    me.soarReady = 0; me.charging = false; me.skillT = -1;
    floatText(me.x, 3, me.z, '竜翔', 'just');
    spJump(2, true);
    return;
  }
  if (me.iaiReady) { me.iaiReady = false; me.chargeT = S.chargeMax; floatText(me.x, 3, me.z, S.wk === 'bow' ? '鷹の目' : '居合', 'just'); }
  else if (me.primeCharge > 0) { me.chargeT = S.chargeMax * me.primeCharge; me.primeCharge = 0; }
}
// 強攻撃を振ったとき: 光波・月の残滓・破城の構えB
export function wtHeavy(lv) {
  const W = S.wt;
  me.lastHeavyLv = lv; me.lastHeavyT = now(); me.eyeCharge = false;
  if (!W) return;
  const a = aimAngle();
  if (W.ks1 === 'gt_wave') {
    me.motion = 'gt_wave'; me.motionT = 0; // 振り抜いて光波を飛ばす
    const big = lv === 2, moon = big && W.ks2 === 'gt_fullmoon';
    combat.proj({ a, mult: (big ? 2.0 : 1.0) * (moon ? 1.75 : 1), type: 'heavy', speed: big ? 22 : 24, life: big ? 0.75 : 0.55, rad: moon ? 3.4 : big ? 2.0 : 1.2, color: LIGHT_COLOR, stun: W.br('gt_break') === 'B' ? 6 : 1.5, eclipse: W.ks2 === 'gt_eclipse' });
    if (big) fx.flash(me.x, 1.5, me.z, LIGHT_COLOR, moon ? 60 : 35, 0.3);
  }
  if (W.lv('gt_moon')) {
    const n = W.br('gt_moon') === 'A' ? 2 : 1, m = W.lv('gt_moon') >= 2 ? 0.8 : 0.5;
    const stun = W.br('gt_moon') === 'B' || W.br('gt_break') === 'B' ? 4 : 0.5;
    for (let i = 0; i < n; i++) later(0.12 + i * 0.12, () => combat.proj({ a: a + (n > 1 ? (i ? 0.12 : -0.12) : 0), mult: m, type: 'proc', speed: 24, life: 0.5, rad: 0.9, color: LIGHT_COLOR, wtNo: true, stun }));
  }
  if (S.wk === 'axe' && W.ks1 !== 'ax_throw') {
    if (W.ks2 === 'ax_quake') later(0.16, () => axCrack(a, 9, 2.0, 6));
    else if (lv === 2 && W.br('ax_heavy') === 'A') later(0.16, () => axCrack(a, 7, 1.2, 3));
  }
  if (W.br('gt_siege') === 'B' && hasBuff('gt_siege')) combat.proj({ a, mult: 1.2, type: 'heavy', speed: 22, life: 0.6, rad: 1.6, color: LIGHT_COLOR, stun: 1.5 });
}
// 大剣カウンター: 強攻撃を押した直後に攻撃を受けたら、無傷で受け流して反撃する
export function wtCounter(src) {
  if (S.wt?.ks1 !== 'gt_counter' || !me.charging || now() - me.chargeStart > 0.35) return false;
  me.charging = false; me.chargeT = 0; me.chargeLv = 0;
  me.iframe = Math.max(me.iframe, 0.4);
  const a = src ? Math.atan2(src.x - me.x, src.z - me.z) : me.a;
  const M = TREE_MOTIONS.gt_riposte;
  me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
  floatText(me.x, 3.1, me.z, '見切り!', 'just');
  audio.sfx('perfect'); audio.sfx('block');
  fx.ringWave(me.x, me.z, 0xffffff, 3, 0.3); fx.flash(me.x, 1.5, me.z, 0xffffff, 40, 0.25);
  later(M.hits[0], () => { combat.arc(4, 200, 3.5, { type: 'heavy', a, stun: 8 }); fx.slash(me.x, me.z, a, 4, 200, 0xffffff, 1.6, true); audio.sfx('swing', { heavy: true }); addShake(0.25); });
  if (S.wt.ks2 === 'gt_iai') me.iaiReady = true;
  if (S.wt.ks2 === 'gt_mirror') addBuff('gt_mirror', '明鏡', 5, { dmgp: 30 }, 0xe0f0ff);
  wtEye();
  return true;
}
// 見切り眼: JUST回避・受け流しのあと3秒間ダメージアップ（6秒に1回まで）
export function wtEye() {
  const W = S.wt;
  if (!W?.lv('gt_eye') || now() - me.eyeT < 6) return;
  me.eyeT = now();
  quietBuff('gt_eye', '見切り眼', 3, { dmgp: W.lv('gt_eye') >= 2 ? 25 : 15 }, 0x9affff);
  if (W.br('gt_eye') === 'A') me.eyeCharge = true;
  if (W.br('gt_eye') === 'B') cutCds(2);
}
// 武器ツリーの状態を、体と剣のまわりの光で見せる（勢い・剣聖の全会心・報復者の蓄え）
export const wtHandPos = new THREE.Vector3();
export const wtAuraAcc = { mom: 0, saint: 0, rev: 0, thunder: 0, soar: 0, bers: 0 };
// 1秒あたり rate 個の割合で粒を出す（フレームの速さに左右されない）
export function wtEmit(key, rate, dt, fn) { wtAuraAcc[key] += rate * dt; while (wtAuraAcc[key] >= 1) { wtAuraAcc[key]--; fn(); } }
export function wtAura(dt) {
  const W = S?.wt;
  if (!W || me.dead || me.crawl || !me.model) return;
  bwTrapTick();
  // 大斧: 血の心得（渇き・血気）と、破砕の衝撃（ボスがスタンしたとき）
  if (W.br('ax_blood') === 'A' && me.hp < S.mhp * 0.5) quietBuff('ax_thirst', '渇き', 0.3, { vamp: W.lv('ax_blood') >= 2 ? 3 : 2 }, 0xff3a3a);
  if (W.br('ax_blood') === 'B' && me.hp >= S.mhp) quietBuff('ax_full', '血気', 0.3, { atkp: 10 }, 0xff9a9a);
  if (W.ks1 === 'ax_crush') for (const mb of mobs.values()) {
    if (mb.kind !== 2) continue;
    if (!(mb.stunT > 0)) { mb.axBoom = false; continue; }
    if (mb.axBoom || now() - (mb.localT || 0) > 3) continue;
    mb.axBoom = true;
    const x = mb.x, z = mb.z;
    combat.circle(x, z, 4 + mb.rad, 5.0, { type: 'proc', noProc: true });
    fx.ringWave(x, z, 0xffb040, 5 + mb.rad, 0.45); fx.flash(x, 1.5, z, 0xffb040, 60, 0.35);
    fx.parts.burst(x, 0.4, z, 60, { color: 0xc8a070, speed: 9, size: 0.6, life: 0.7, up: 3 });
    floatText(x, 4, z, '破砕!', 'just'); audio.sfx('impact'); addShake(0.5);
  }
  // 狂戦士: HPが減るほど、体から赤い湯気が立つ
  if (axBers() > 0) wtEmit('bers', axBers() * 1.2, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 1.6), me.z + rnd(-0.5, 0.5), { color: axBers() >= 20 ? 0xff2a1a : 0xff6a4a, size: 0.3, life: 0.6, speed: 1.2, gravity: -4 }));
  // 旗手: 旗のそばにいる間は守りと攻めが上がる
  if (me.banner) {
    if (now() > me.banner.until) me.banner = null;
    else if (Math.hypot(me.x - me.banner.x, me.z - me.banner.z) < 5) quietBuff('sp_banner', '旗手', 0.3, { dr: 20, atkp: 15 }, 0x6ab0ff);
  }
  // 騎士: 雷をまとう間、槍の穂先から火花
  if (hasBuff('sp_thunder')) {
    me.model.userData.hand?.getWorldPosition(wtHandPos);
    wtEmit('thunder', 30, dt, () => fx.parts.emit(wtHandPos.x + rnd(-0.4, 0.4), wtHandPos.y + rnd(0, 1.2), wtHandPos.z + rnd(-0.4, 0.4), { color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, size: 0.28, life: 0.2, speed: 3, gravity: 0 }));
  }
  if (me.soarReady && now() < me.soarReady) wtEmit('soar', 20, dt, () => fx.parts.emit(me.x + rnd(-0.4, 0.4), 0.2, me.z + rnd(-0.4, 0.4), { color: 0x9affc8, size: 0.3, life: 0.5, speed: 1.5, gravity: -5 }));
  // 疾風: 連撃が最大の間は移動が速い
  if (W.ks2 === 'dk_gale' && me.dStack >= S.dStackMax) quietBuff('dk_gale', '疾風', 0.3, { move: 25 }, 0x9affc8);
  // 剣闘士: 勢いが溜まるほど、橙の火の粉が体から立ちのぼる（最大で足元に炎の輪）
  if (W.ks1 === 'sw_glad' && me.mom > 0) {
    wtEmit('mom', me.mom * 7, dt, () => fx.parts.emit(me.x + rnd(-0.55, 0.55), rnd(0.1, 1.5), me.z + rnd(-0.55, 0.55), { color: me.mom >= 10 ? 0xffc040 : 0xff7a2a, size: 0.3 + me.mom * 0.03, life: 0.7, speed: 1.4, gravity: -4 }));
    if (me.mom >= 10 && now() - (me.momFxT || 0) > 0.7) { me.momFxT = now(); fx.ringWave(me.x, me.z, 0xff9a2e, 1.8, 0.45); }
  }
  // 剣聖: 全会心の間は、剣から金の光がこぼれ、足元に金の輪
  if (hasBuff('sw_saint')) {
    me.model.userData.hand?.getWorldPosition(wtHandPos);
    wtEmit('saint', 45, dt, () => fx.parts.emit(wtHandPos.x + rnd(-0.35, 0.35), wtHandPos.y + rnd(-0.2, 0.7), wtHandPos.z + rnd(-0.35, 0.35), { color: 0xffe070, size: 0.34, life: 0.45, speed: 0.6, gravity: -2 }));
    if (now() - (me.saintFxT || 0) > 0.5) { me.saintFxT = now(); fx.ringWave(me.x, me.z, 0xffd84a, 2.2, 0.4); }
  }
  // 報復者: 溜めたダメージが多いほど、赤い揺らめきが濃くなり、足元の赤い輪が脈打つ
  if (W.ks2 === 'sw_avenger' && me.revenge > 0) {
    const k = Math.min(1, me.revenge / (S.mhp * 0.5));
    wtEmit('rev', 12 + 45 * k, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.1, 1.3), me.z + rnd(-0.5, 0.5), { color: k > 0.7 ? 0xff2a2a : 0xff6a5a, size: 0.28 + 0.28 * k, life: 0.6, speed: 0.9, gravity: -2.5 }));
    if (now() - (me.revFxT || 0) > 1.1 - 0.6 * k) { me.revFxT = now(); fx.ringWave(me.x, me.z, 0xff4a3a, 1.4 + k, 0.4); }
  }
}
// 短剣: 敵の背後にいるか（敵の向きから120度以上うしろ）
export function wtBehind(mb) {
  if (!mb || mb.a == null) return false;
  return Math.abs(angDiff(Math.atan2(me.x - mb.x, me.z - mb.z), mb.a)) > THREE.MathUtils.degToRad(120);
}
// 毒・出血の強さ（毒の心得）と時間（長毒）
export const wtToxMul = () => 1 + (S.wt?.lv('dk_toxin') ? (S.wt.lv('dk_toxin') >= 2 ? 50 : 30) : 0) / 100;
export const wtToxDur = () => 4 * (S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
// 毒を重ねる（最大5。1つにつき毎秒15%）。猛毒は5つで破裂
export function addPoison(mb, n) {
  if (!mb || mb.hp <= 0 || !(n > 0)) return;
  mb.vStack = Math.min(5, (mb.vStack || 0) + n);
  mb.poisonUntil = now() + wtToxDur();
  if (S.wt?.ks2 === 'dk_burst' && mb.vStack >= 5) {
    mb.vStack = 0; mb.poisonUntil = 0;
    later(0.05, () => {
      if (mb.hp <= 0) return;
      dealDamage(mb, 3.0, { type: 'proc', noProc: true, wtNo: true });
      fx.parts.burst(mb.x, 1.2, mb.z, 40, { color: 0x8aff5a, speed: 7, size: 0.6, life: 0.6, gravity: 1 });
      fx.ringWave(mb.x, mb.z, 0x8aff5a, 2.6, 0.35); audio.sfx('hit', { crit: true });
    });
  }
}
// 毒の1回（0.5秒ごと）のダメージ。ポイズン・エッジA「致死毒」の効果中は2倍
export const wtPoisonTick = (mb) => 0.075 * mb.vStack * wtToxMul() * (S.wt?.br('dk_poison') === 'A' && hasBuff('dk_poison') ? 2 : 1);
// 出血（毎秒 perSec。stack なら最大3まで重なる）
export function addBleed(mb, perSec, stack = false, sec = 4) {
  if (!mb || mb.hp <= 0) return;
  mb.bleedN = stack ? Math.min(3, (mb.bleedN || 0) + 1) : 1;
  mb.bleedPow = Math.max(stack ? perSec * mb.bleedN : perSec, mb.bleedUntil > now() && !stack ? mb.bleedPow || 0 : 0);
  mb.bleedUntil = now() + sec * (S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
}
// ---- 盾槍 ----
// 攻撃が槍の先端で当たったか（間合い）: 1 = 先端 / -1 = 近すぎ / 0 = それ以外・対象外
export function spTip(o) {
  if (S.wt?.ks1 !== 'sp_reach' || o.tip == null || !ATK_TYPES.includes(o.type)) return 0;
  return o.tip >= 0.7 ? 1 : o.tip < 0.4 ? -1 : 0;
}
// 突きの届く距離の倍率（槍の心得A「長柄」は通常攻撃だけ・騎士の雷は突き全部）
export const spReach = (normal) => (S.wk === 'axe' ? (normal && S.wt?.br('ax_swing') === 'A' ? 1.2 : 1) : S.wk !== 'spear' ? 1 : (normal && S.wt?.br('sp_spear') === 'A' ? 1.2 : 1) * (hasBuff('sp_thunder') ? 1.5 : 1));
// 騎士: 突きが雷をまとう
export function spThunder() {
  if (!hasBuff('sp_thunder')) { fx.lightning(me.x, me.z, 0x9ad8ff); audio.sfx('thunder'); }
  quietBuff('sp_thunder', '雷槍', 3, {}, 0x9ad8ff);
}
// 竜騎士の強攻撃: 高く跳んで狙った場所へ突き降りる（空中は無敵）
export const JUMP = { air: 0.55, mult: [0, 5.0, 7.5], range: [0, 5, 8], r: 2.5 };
export function spJump(lv, soared = false) {
  const p = aimPoint(), a = Math.atan2(p.x - me.x, p.z - me.z);
  const d = Math.min(JUMP.range[lv], Math.hypot(p.x - me.x, p.z - me.z));
  const M = TREE_MOTIONS.sp_jump;
  me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
  combat.dash(a, Math.max(0.01, d), JUMP.air, JUMP.air + 0.15);
  fx.parts.burst(me.x, 0.3, me.z, 18, { color: 0xd8c8a8, speed: 4, size: 0.45, life: 0.4, up: 3 });
  audio.sfx('dodge');
  later(JUMP.air, () => {
    if (me.dead) return;
    combat.circle(me.x, me.z, JUMP.r, JUMP.mult[lv], { type: 'heavy', stun: 10 });
    fx.ringWave(me.x, me.z, RARITIES[S.wr].color, JUMP.r + 0.6, 0.35); fx.flash(me.x, 1, me.z, 0xffffff, 40, 0.25);
    fx.parts.burst(me.x, 0.3, me.z, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
    audio.sfx('heavy'); addShake(lv === 2 ? 0.5 : 0.3); setHitStop(0.06);
    if (S.wt?.ks2 === 'sp_fang') later(0.08, () => { // 竜の牙: 着地点から衝撃が広がる
      combat.circle(me.x, me.z, 4.5, 3.0, { type: 'heavy', stun: 20 });
      fx.ringWave(me.x, me.z, 0xff8a4a, 5, 0.45); fx.parts.burst(me.x, 0.4, me.z, 50, { color: 0xff8a4a, speed: 9, size: 0.55, life: 0.6, up: 2 }); addShake(0.4);
    });
    if (S.wt?.ks2 === 'sp_soar' && !soared) { me.soarReady = now() + 1.5; fx.ringWave(me.x, me.z, 0x9affc8, 1.6, 0.3); }
  });
}
// 旗手: ガードカウンターした場所に旗を立てる
export function spBanner(x, z) {
  const old = me.banner && fx.items.find((it) => it.obj === me.banner.mesh);
  if (old) old.life = 0; // 前の旗は消す
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }));
  pole.position.y = 1.6; g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color: 0x6ab0ff, side: THREE.DoubleSide }));
  flag.position.set(0.55, 2.8, 0); g.add(flag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.8, 5, 48), new THREE.MeshBasicMaterial({ color: 0x6ab0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  g.position.set(x, 0, z);
  fx.add(g, 8, (o, k) => { flag.rotation.y = Math.sin(k * 40) * 0.3; ring.material.opacity = 0.35 * (1 - k * 0.5); });
  me.banner = { x, z, until: now() + 8, mesh: g };
  fx.beam(x, z, 0x6ab0ff, 4, 0.5, 0.5);
}
// ---- 弓 ----
// 最大まで引いた矢（狙撃手）が当たった / 外れた: 鷹の目・狙い澄まし
export function bwSnipe(hit) {
  const W = S.wt;
  if (W?.ks2 === 'bw_hawk' && hit && now() - me.hawkT > 8) { me.hawkT = now(); me.iaiReady = true; fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3); }
  if (W?.ks2 === 'bw_aim') {
    me.aimN = hit ? Math.min(3, me.aimN + 1) : 0;
    me.buffs = me.buffs.filter((b) => b.id !== 'bw_aim');
    if (me.aimN > 0) me.buffs.push({ id: 'bw_aim', label: `狙い澄まし +${me.aimN * 10}%`, t: 1e9, max: 1e9, mods: {}, color: 0xffd84a });
  }
}
// 矢嵐: 狙った場所に矢の雨
export function bwRain(p) {
  for (let i = 0; i < 5; i++) later(0.12 + i * 0.07, () => {
    const x = p.x + rnd(-1.6, 1.6), z = p.z + rnd(-1.6, 1.6);
    fx.parts.burst(x, 6, z, 6, { color: 0xbfe8ff, speed: 2, size: 0.35, life: 0.3, gravity: 40 });
    later(0.15, () => { combat.circle(x, z, 1.5, 0.5, { type: 'proc', noProc: true }); fx.ringWave(x, z, 0xbfe8ff, 1.6, 0.2); });
  });
}
// 罠（罠師の回避・置き矢）: 踏まれると発動。dodge: 罠師の罠（数に上限がある）
export function bwTrap(x, z, o) {
  const g = new THREE.Group(), col = o.color ?? 0xffc860;
  const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.12, o.r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
    const a = i / 6 * Math.PI * 2; sp.position.set(Math.sin(a) * o.r * 0.45, 0.15, Math.cos(a) * o.r * 0.45); g.add(sp);
  }
  g.position.set(x, heightAt(x, z), z);
  const t = { x, z, ...o, armAt: now() + (o.arm ?? 0.5), until: now() + o.life, area: world.area, mesh: g };
  fx.add(g, o.life + 0.2, (obj) => { ring.material.opacity = now() < t.armAt ? 0.2 : 0.4 + Math.sin(now() * 8) * 0.15; });
  if (o.dodge) {
    const mine = me.traps.filter((q) => q.dodge);
    if (mine.length >= (S.wt?.ks2 === 'bw_lure' ? 4 : 2)) bwTrapGone(mine[0]);
  }
  me.traps.push(t);
  fx.parts.burst(x, 0.3, z, 10, { color: col, speed: 2, size: 0.3, life: 0.3 });
  return t;
}
export function bwTrapGone(t) {
  me.traps = me.traps.filter((q) => q !== t);
  const it = fx.items.find((q) => q.obj === t.mesh);
  if (it) it.life = 0;
}
export function bwTrapTick() {
  for (const t of [...me.traps]) {
    if (t.area !== world.area || now() > t.until) { bwTrapGone(t); continue; }
    if (now() < t.armAt) continue;
    if (![...mobs.values()].some((mb) => mb.hp > 0 && Math.hypot(mb.x - t.x, mb.z - t.z) < t.r + mb.rad * 0.5)) continue;
    bwTrapGone(t);
    combat.circle(t.x, t.z, t.r, t.mult, { type: t.dodge ? 'proc' : 'tskill', tech: 'bow_trap', stun: t.stun, noProc: t.dodge });
    fx.parts.burst(t.x, 0.4, t.z, 30, { color: t.color ?? 0xffc860, speed: 6, size: 0.4, life: 0.4, up: 3 }); fx.ringWave(t.x, t.z, t.color ?? 0xffc860, t.r + 0.4, 0.3);
    audio.sfx('hit');
  }
}
// 射抜き: 罠を矢で撃ち抜いて大爆発
export function bwBlast(t) {
  bwTrapGone(t);
  combat.circle(t.x, t.z, 3.5, 3.5, { type: 'proc', noProc: true, stun: 6 });
  fx.ringWave(t.x, t.z, 0xff9a4a, 4, 0.4); fx.flash(t.x, 1.2, t.z, 0xff9a4a, 50, 0.3);
  fx.parts.burst(t.x, 0.6, t.z, 50, { color: 0xffb060, speed: 9, size: 0.55, life: 0.5, up: 3 });
  floatText(t.x, 2.6, t.z, '射抜き!', 'just'); audio.sfx('impact'); addShake(0.35);
}
// 回避した（速射・罠師）
export function wtOnDodge() {
  const W = S.wt;
  if (!W) return;
  if (W.br('bw_roll') === 'A') quietBuff('bw_rollA', '受け身引き', 1.4, { chargeRate: 100 }, 0x9ae8ff);
  if (W.ks2 === 'bw_quick') quietBuff('bw_quick', '速射', 1.5 + 0.38, { aspd: 40 }, 0x9affc8);
  if (W.ks1 === 'bw_trapper' && now() - me.trapT >= 2) {
    me.trapT = now();
    const lure = W.ks2 === 'bw_lure';
    bwTrap(me.x, me.z, { mult: 2.0 * (lure ? 1.3 : 1), r: 1.8, stun: lure ? 15 : 3, life: 15, arm: 0.5, dodge: true });
  }
}
// ---- 大斧 ----
// 狂戦士: 減ったHP10%ごとに +3%（捨て身は1.5倍）
export function axBers() {
  if (S?.wt?.ks1 !== 'ax_berserk' || !(S.mhp > 0)) return 0;
  const n = Math.floor(clamp(1 - me.hp / S.mhp, 0, 0.999) * 10) * 3;
  return S.wt.ks2 === 'ax_reckless' ? Math.min(40, n * 1.5) : n;
}
// 地割れ: 前へ一直線に地面が裂ける
export function axCrack(a, len, mult, stun) {
  const sx = me.x, sz = me.z;
  combat.line(len, 2.2, mult, { type: 'heavy', a, sx, sz, stun, wtNo: true });
  for (let d = 1; d < len; d += 0.6) later(d * 0.02, () => fx.parts.burst(sx + Math.sin(a) * d, 0.2, sz + Math.cos(a) * d, 6, { color: 0xb89870, speed: 5, size: 0.5, life: 0.5, up: 3 }));
  fx.slash(sx, sz, a, len, 12, 0xd8b080, 1.2);
}
// 投斧（強攻撃）: 斧を投げる。8m先まで飛んで戻り、往復とも当たる
export function axThrow(lv) {
  const a = aimAngle(), M = TREE_MOTIONS.ax_throw, m = lv === 2 ? 2.6 : 1.6, W = S.wt, col = RARITIES[S.wr].color;
  me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration;
  const far = { x: me.x + Math.sin(a) * 8, z: me.z + Math.cos(a) * 8 }, rad = lv === 2 ? 1.6 : 1.2;
  later(M.hits[0], () => combat.proj({ a, mult: m, type: 'heavy', speed: 20, life: 0.4, rad, shape: 'axe', stun: 6 }));
  const spin = W.ks2 === 'ax_storm' ? 2 : 0;
  for (let k = 0; k < spin * 4; k++) later(M.hits[0] + 0.4 + k * 0.25, () => { combat.circle(far.x, far.z, 2.4, 0.5, { type: 'proc', stun: 1, wtNo: true }); fx.slash(far.x, far.z, k * 1.4, 2.4, 220, col, 0.8); });
  later(M.hits[0] + 0.4 + spin, () => {
    const ra = Math.atan2(me.x - far.x, me.z - far.z), t = Math.max(0.1, Math.hypot(me.x - far.x, me.z - far.z) / 20);
    combat.proj({ a: ra, mult: m, type: 'heavy', speed: 20, life: t, rad, shape: 'axe', sx: far.x, sz: far.z, stun: 6 });
    if (W.ks2 === 'ax_catch') later(t, () => {
      if (me.dead) return;
      quietBuff('ax_catch', '受け止め', 3, { aspd: 25 }, 0xffb040);
      floatText(me.x, 3, me.z, '受け止め', 'just'); fx.ringWave(me.x, me.z, 0xffb040, 2, 0.3); audio.sfx('block');
    });
  });
}
// 熟練度: 今の武器で経験値を得ると上がる
export function gainWeaponProf(n) {
  const wk = S?.wk || char.eq.weapon?.kind || 'sword';
  const before = profLevel(char, wk);
  gainProf(char, wk, n);
  const after = profLevel(char, wk);
  if (after <= before) return;
  const name = WEAPONS[wk].name;
  audio.sfx('buff');
  fx.ringWave(me.x, me.z, 0x6ad0ff, 3.5, 0.5);
  toast(hasWTree(wk) ? `${name}の熟練度 ${after}（ポイント +${after - before}・Kで武器ツリー）` : `${name}の熟練度 ${after}`, '#6ad0ff');
  calcStats();
}
export function wtLearnNode(id) {
  if (!wtLearn(char, id)) { audio.sfx('ui'); return; }
  const n = WT_NODE[id], lv = char.wt[n.wk].lv[id];
  if (n.kind === 'skill' && lv === 1) {
    const i = char.slots.indexOf(null);
    if (i >= 0 && !char.slots.includes(id)) char.slots[i] = id;
  }
  if (lv === 3) toast(`${n.name}：形を A・B から選べます`, '#ffd84a');
  audio.sfx('levelup');
  calcStats(); saveChar();
}
export function wtChooseBranch(id, b) {
  if (!wtChoose(char, id, b)) { audio.sfx('ui'); return; }
  const n = WT_NODE[id];
  audio.sfx('perfect');
  toast(`${n.name}が「${n[b].name}」に変化`, '#ffd84a');
  calcStats(); saveChar();
}
export function wtResetTree(wk) {
  const spent = wtSpent(wtOf(char, wk));
  if (!spent) return;
  const cost = WT_RESET_COST(spent);
  if ((char.gold || 0) < cost) { toast(`振り直しには ${cost}G 必要です`, '#f88'); audio.sfx('ui'); return; }
  char.gold -= cost;
  const own = new Set(Object.keys(wtOf(char, wk).lv));
  wtReset(char, wk);
  char.slots = char.slots.map((s) => (own.has(s) ? null : s));
  setMom(0); me.revenge = 0; me.aimN = 0;
  audio.sfx('ui');
  toast(`${WEAPONS[wk].name}のツリーを振り直しました（-${cost}G）`, '#9fe');
  calcStats(); saveChar();
}
// 旧ツリーの片手剣に振っていたポイントは返す。?prof=N でいまの武器の熟練度を決められる（確認用）
export function migrateWeaponTrees() {
  char.prof = char.prof || {}; char.wt = char.wt || {};
  let back = 0;
  for (const id of Object.keys(char.tree)) if (id.startsWith('sword_') || id.startsWith('greatsword_') || id.startsWith('gs_') || id.startsWith('dagger_') || id.startsWith('spear_') || id.startsWith('axe_') || id.startsWith('bow_')) { back += char.tree[id]; delete char.tree[id]; }
  const gone = ['slant', 'brave', 'sword_parry', 'sword_aircut', 'sword_sideturn', 'sword_dance', 'gslam', 'fortress', 'gs_guillotine', 'gs_rising', 'gs_broad', 'gs_recoil', 'gs_siege', 'poison', 'smoke', 'dagger_flank', 'dagger_vital', 'dagger_bleed', 'dagger_pin', 'dagger_quicken', 'shieldbash', 'taunt', 'spear_fan', 'spear_sweep', 'spear_press', 'spear_stake', 'spear_intercept', 'warstomp', 'bloodlust', 'axe_hook', 'axe_execute', 'axe_return', 'axe_blood', 'axe_rush', 'backshot', 'focus', 'bow_double', 'bow_tether', 'bow_side', 'bow_trap', 'bow_chime'];
  char.slots = char.slots.map((id) => (id && (gone.includes(id) || !TREE_SKILLS[id]) ? null : id));
  if (back) later(1, () => toast(`すべての武器が新しい武器ツリーになりました。旧ツリーの ${back} ポイントを返しました`, '#ffd84a'));
  if (params.has('prof')) {
    const wk = char.eq.weapon?.kind || 'sword', p = profOf(char, wk);
    p.lv = clamp(Math.round(+params.get('prof')) || 1, 1, 20); p.xp = 0;
    char.profBest = Math.max(char.profBest || 0, p.lv);
  }
}
