import { BALANCE } from '../../shared/balance.js';
import { RARITIES, SV } from '../../shared/data.js';
import { angDiff, now, rnd } from './util.js';
import { floatText } from './ui-bridge.js';
import { characterStore, settings } from './save.js';
import { audio, fx } from './render.js';
import { me, mobs, mouse, pending } from './state.js';
import { S, buffMod, hasBuff } from './stats.js';
import { net } from './net-client.js';
import { wtCritAdd, wtDmgMult, wtOnHit } from './tree-effects.js';
import { indoorNow, onVariantHit, tf, titleDmg } from './variants.js';
import { heal, strikes } from './actions.js';
import { fxReduce, fxSome } from './weapon-fx.js';

// ======================================================================
// 戦闘（プレイヤー側）
// ======================================================================
// ---- 狙い: マウス、またはスマホ（ボタンを引っぱった方向 → 自動ターゲット → 向いている方向） ----
export let shake = 0;
export const touch = { on: false, stick: { x: 0, y: 0 }, aim: null, aimLen: 0, target: null };
export function autoTarget() {
  if (!S) return null;
  const range = S.W.ranged ? S.W.range : S.W.range + 4;
  // 近さと、スティック（または向き）の方向との近さで選ぶ
  const sl = Math.hypot(touch.stick.x, touch.stick.y);
  const want = sl > 0.3 ? Math.atan2(touch.stick.x, touch.stick.y) : me.a;
  let best = null, bs = Infinity;
  for (const mb of mobs.values()) {
    if (mb.hp <= 0) continue;
    const d = Math.hypot(mb.x - me.x, mb.z - me.z);
    if (d > range + mb.rad) continue;
    const off = Math.abs(angDiff(Math.atan2(mb.x - me.x, mb.z - me.z), want));
    const s = d * (1 + off / Math.PI) * (mb.kind === 2 ? 0.8 : 1);
    if (s < bs) { bs = s; best = mb; }
  }
  return best;
}
export function aimAngle() {
  if (!touch.on) return Math.atan2(mouse.world.x - me.x, mouse.world.z - me.z);
  if (touch.aim != null) return touch.aim;
  const t = touch.target;
  return t ? Math.atan2(t.x - me.x, t.z - me.z) : me.a;
}
// 地点を狙うスキル（アローレインなど）
export function aimPoint() {
  if (!touch.on) return { x: mouse.world.x, z: mouse.world.z };
  if (touch.aim != null) { const r = 3 + touch.aimLen * 13; return { x: me.x + Math.sin(touch.aim) * r, z: me.z + Math.cos(touch.aim) * r }; }
  if (touch.target) return { x: touch.target.x, z: touch.target.z };
  return { x: me.x + Math.sin(me.a) * 8, z: me.z + Math.cos(me.a) * 8 };
}
export function addShake(v) { if (settings.shake) shake = Math.max(shake, v); }

export const TYPE_MOD = { normal: 'normp', heavy: 'heavyp', wskill: 'wskillp' };
// 攻撃のスタン値（ボスのスタンと、倒れた仲間を起こす量の両方に使う）。強攻撃ほど・近接武器ほど大きい
export function stunValue(o) {
  let st = o.stun ?? { normal: 1.2, heavy: 6, wskill: 3, tskill: 3 }[o.type] ?? 0;
  st *= S.W.stun * (S.W.melee ? 1 + (S.stunp + buffMod('stunp')) / 100 : 1);
  st = fxReduce('stun', st, o); // 武器ツリー（破砕・重圧・揺さぶり・重矢 など）
  if (o.sv?.key === 'sv_quake') st *= SV.quake(o.sv.t);
  if (tf('t_breaker')) st *= 1.3;
  return Math.round(st * 10) / 10;
}
export function dealDamage(mb, mult, o = {}) {
  if (characterStore.lost) return;
  if (!mb || mb.hp <= 0) return;
  const skill = o.type === 'wskill' || o.type === 'tskill';
  const tough = mb.kind === 2 || !!mb.elite;
  let crit = o.crit || (S.wt && fxSome('critAlways', o)) || o.sv?.key === 'sv_heavy' || Math.random() * 100 < S.crit + buffMod('crit') + wtCritAdd(o) + (tough && tf('t_shark') ? 15 : 0) + (tf('t_night') && indoorNow() ? 10 : 0) + (tf('t_lucky') ? 8 : 0) || (skill && S.fx.has('skillcrit'));
  let ambushed = false;
  if (!crit && me.ambush > 0 && !o.noProc) { crit = true; me.ambush--; ambushed = true; }
  if (!crit && fxSome('critAfter', mb, o)) crit = true; // 武器ツリー: 間合いの先端・砕骨・暗殺の背後 など
  const typeMult = 1 + ((S[TYPE_MOD[o.type]] || 0) + buffMod(TYPE_MOD[o.type])) / 100;
  const back = me.hp < S.mhp * 0.5 ? 1 + S.backwater / 100 : 1;
  const stunned = mb.stunT > 0 ? 1.3 : 1;
  const exec = S.flags.has('execute') && mb.hp < mb.mhp * 0.3 ? 1.5 : 1;
  const guardBonus = now() < me.atkBonusT ? me.atkBonus : 1;
  const bossT = mb.kind === 2 && tf('t_boss1') ? 1.15 : 1;
  let dmg = S.atk * (1 + buffMod('atkp') / 100) * mult * typeMult * back * stunned * exec * guardBonus * bossT * titleDmg(mb)
    * (1 + buffMod('dmgp') / 100) * (o.falloff ?? 1) * rnd(0.92, 1.08) * (crit ? S.critd / 100 : 1) * wtDmgMult(o, mb, crit) * fxReduce('ambushMult', 1, ambushed);
  dmg = Math.max(1, Math.round(dmg));
  dmg = fxReduce('finisher', dmg, mb, crit, o); // 必殺 など
  mb.hp -= dmg; mb.localT = now(); mb.flash = 1;
  // スタン値: 強攻撃で大きく溜まる。近接武器ほど溜めやすい
  const st = mb.kind === 2 && !(mb.stunT > 0) ? stunValue(o) : 0;
  net.send({ t: 'hit', id: mb.id, dmg, crit, st, tech: o.tech || fxReduce('hitTech', undefined, o, mb) }); // 間合い支配: 先端で当てた雑魚を押し戻す など
  if (o.healOnHit) heal(dmg * o.healOnHit, true);
  if (o.threat > 1) net.send({ t: 'threat', id: mb.id, n: Math.round(dmg * (o.threat - 1)) });
  // 武器パッシブ（攻撃が当たったとき）
  if (['normal', 'heavy', 'wskill', 'tskill'].includes(o.type)) {
    if (S.dStackPer > 0) { me.dStack = Math.min(S.dStackMax, me.dStack + 1); me.dStackT = S.dStackT; }
  }
  if (S.wt) wtOnHit(mb, dmg, crit, o, mult);
  floatText(mb.x, 2.2 * (mb.kind === 2 ? 2.5 : 1), mb.z, dmg, o.type === 'dot' ? 'poison' : crit ? 'crit' : '');
  if (o.type !== 'dot') {
    const wc = RARITIES[S.wr].color;
    fx.parts.burst(mb.x, 1.2, mb.z, crit ? 18 : 8, { color: crit ? 0xffd84a : wc, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 });
    audio.sfx('hit', { crit });
  }
  const vamp = S.vamp + buffMod('vamp');
  if (vamp > 0) heal(dmg * vamp / 100 * BALANCE.lifestealEfficiency, false);
  if (o.sv) onVariantHit(mb, dmg, o);
  // 称号「流星」: 武器スキルが当たると流れ星が降る（0.6秒に1回）
  if (o.type === 'wskill' && tf('t_star') && !o.noProc && now() - (me.starT || 0) > 0.6) {
    me.starT = now();
    const x = mb.x, z = mb.z;
    fx.parts.burst(x, 7, z, 20, { color: 0xfff0a0, speed: 3, size: 0.5, life: 0.4, gravity: 30 });
    later(0.25, () => {
      fx.flash(x, 1, z, 0xfff0a0, 30, 0.25); fx.ringWave(x, z, 0xfff0a0, 2.6, 0.3);
      strikes.circle(x, z, 2.4, 0.35, { type: 'proc', noProc: true });
    });
  }
  if (o.noProc) return;
  if (hasBuff('poison')) mb.poisonUntil = now() + 4;
  if (crit && S.fx.has('thunder')) {
    later(0.08, () => {
      fx.lightning(mb.x, mb.z); audio.sfx('thunder'); addShake(0.2);
      strikes.circle(mb.x, mb.z, 3.5, 1.5, { noProc: true });
    });
  }
  if (S.fx.has('flame') && Math.random() < 0.35) {
    fx.parts.burst(mb.x, 0.8, mb.z, 25, { color: 0xff6a20, speed: 4, size: 0.6, life: 0.7, gravity: 3 });
    audio.sfx('flame');
    for (const m2 of mobs.values()) if (m2 !== mb && Math.hypot(m2.x - mb.x, m2.z - mb.z) < 2.8 + m2.rad) dealDamage(m2, 0.6, { noProc: true });
  }
}

export function later(sec, fn) { pending.push({ at: now() + sec, fn }); }

export function setShake(v) { shake = v; }
