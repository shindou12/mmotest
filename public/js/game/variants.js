import { BALANCE } from '../../shared/balance.js';
import { SV } from '../../shared/data.js';
import { now } from './util.js';
import { audio, fx } from './render.js';
import { me, mobs, world } from './state.js';
import { S, addBuff } from './stats.js';
import { addShake, aimAngle, aimPoint, dealDamage, later } from './combat.js';
import { combat, heal, strikes } from './actions.js';

// ======================================================================
// スキル変化（武器の特性）: 武器スキルの性質を大きく変える
// ======================================================================
export const tf = (id) => !!S?.tfx?.has(id); // 称号の効果が有効か
export const indoorNow = () => world.def.shape === 'grid';
export const weatherNow = () => !!world.def.weather && !indoorNow();
// 称号による移動速度・攻撃速度の上乗せ（%）
export function titleMove() {
  return (tf('t_delver') && indoorNow() ? 15 : 0) + (tf('t_traveler') && now() < (me.travelT || 0) ? 30 : 0) + (tf('t_storm') && weatherNow() ? 15 : 0);
}
export const titleAspd = () => (tf('t_storm') && weatherNow() ? 10 : 0);
// 称号による与ダメージ倍率（敵に応じて）
export function titleDmg(mb) {
  let k = 1;
  if (tf('t_reaper') && mb.hp < mb.mhp * 0.3) k *= 1.25;
  if (tf('t_berserk')) k *= 1.2;
  if (tf('t_hunter') && mb.kind !== 2 && !mb.elite) k *= 1.15;
  if (tf('t_breaker') && mb.stunT > 0) k *= 1.15;
  return k;
}
export const desperate = () => tf('t_boss3') && me.hp < S.mhp * 0.5; // 称号「砂王を屠りし者」
export function variantParams(v, second = false) {
  const t = v.t;
  const P = { mult: 1, range: 1, cd: 1 };
  if (v.key === 'sv_giant') { P.range = SV.giantRange(t); P.mult = SV.giantMult(t); P.cd = 1.3; }
  if (v.key === 'sv_rapid') { P.mult = SV.rapidMult; P.cd = Math.max(0.2, 1 - SV.rapidCd(t)); }
  if (v.key === 'sv_heavy') { P.mult = SV.heavyMult(t); P.cd = 1.8; }
  if (second) P.mult *= SV.twinMult(t); // 二連の2回目
  return P;
}
// スキルに渡すコンテキストを包んで、威力・範囲・色・当たったときの効果を差し込む
export function variantCtx(v, second = false) {
  const P = variantParams(v, second);
  const cast = { left: SV.stormChains(v.t), hitSet: new Set(), exploded: false, quakeT: 0 };
  const tag = (o = {}) => ({ ...o, sv: v, cast });
  const c = Object.create(combat);
  const color = () => v.color ?? combat.col();
  c.col = color;
  c.hit = (mb, mult, o) => strikes.hit(mb, mult * P.mult, tag(o));
  c.arc = (range, deg, mult, o) => strikes.arc(range * P.range, deg, mult * P.mult, tag(o));
  c.line = (len, w, mult, o) => strikes.line(len * P.range, w * P.range, mult * P.mult, tag(o));
  c.circle = (x, z, r, mult, o) => strikes.circle(x, z, r * P.range, mult * P.mult, tag(o));
  c.proj = (o) => strikes.proj({ ...tag(o), mult: (o.mult ?? 1.4) * P.mult, rad: (o.rad ?? 1.8) * P.range, life: (o.life ?? 0.7) * P.range, color: v.color ?? o.color });
  c.arrow = (o) => strikes.arrow({ ...tag(o), mult: (o.mult ?? 1) * P.mult, rad: (o.rad ?? 0.7) * P.range, color: v.color ?? o.color });
  // 見た目も大きさと色を合わせる
  const f = Object.create(fx);
  f.slash = (x, z, a, r, arc, col, ...rest) => fx.slash(x, z, a, r * P.range, arc, v.color ?? col, ...rest);
  f.ringWave = (x, z, col, r, ...rest) => fx.ringWave(x, z, v.color ?? col, r * P.range, ...rest);
  c.fx = f;
  return c;
}
export function castWeaponSkill(sk) {
  const v = S.sv;
  if (!v) { sk.run(combat); return; }
  const go = () => {
    sk.run(variantCtx(v));
    if (v.key === 'sv_twin') later(0.42, () => { if (!me.dead) { me.a = aimAngle(); sk.run(variantCtx(v, true)); fx.ringWave(me.x, me.z, 0xffffff, 2.5, 0.25); } });
  };
  if (v.key === 'sv_blink') {
    // 瞬身: 狙った方向へ一瞬で移動してから発動
    const a = aimAngle(), d = SV.blinkDist(v.t);
    fx.parts.burst(me.x, 1, me.z, 25, { color: 0x9affff, speed: 4, size: 0.5, life: 0.4 });
    strikes.dash(a, d, 0.1, 0.45);
    later(0.12, () => { fx.parts.burst(me.x, 1, me.z, 25, { color: 0x9affff, speed: 4, size: 0.5, life: 0.4 }); go(); });
  } else go();
  if (v.key === 'sv_gale') galeAt(aimPoint(), v);
  if (v.key === 'sv_holy') holyAt(aimPoint(), v);
  if (v.key === 'sv_meteor') meteorsAt(aimPoint(), v);
  if (v.key === 'sv_haste') addBuff('sv_haste', '疾駆', SV.hasteSec, { move: SV.haste(v.t), aspd: SV.haste(v.t) }, 0x9affc8);
  if (v.key === 'sv_ward') { addBuff('sv_ward', '守護', SV.wardSec, { dr: SV.ward(v.t) }, 0xbfe0ff); fx.ringWave(me.x, me.z, 0xbfe0ff, 2.4, 0.4); }
  if (v.key === 'sv_heavy') { addShake(0.25); fx.parts.burst(me.x, 1, me.z, 30, { color: 0xff5040, speed: 7, size: 0.6, life: 0.4 }); }
  if (v.color) fx.flash(me.x, 1.5, me.z, v.color, 30, 0.3);
}
export function onVariantHit(mb, dmg, o) {
  const v = o.sv, c = o.cast;
  if (v.key === 'sv_blaze') {
    mb.burnUntil = now() + 3; mb.burnPow = SV.blazeDot(v.t);
    if (!c.exploded) {
      c.exploded = true;
      fx.parts.burst(mb.x, 1, mb.z, 50, { color: 0xff7a20, speed: 8, size: 0.7, life: 0.6, gravity: -2 });
      fx.ringWave(mb.x, mb.z, 0xff6a20, 3, 0.35); fx.flash(mb.x, 1.5, mb.z, 0xff6a20, 40, 0.3);
      audio.sfx('flame'); addShake(0.2);
      later(0.05, () => strikes.circle(mb.x, mb.z, 2.6, SV.blazeBoom, { type: 'dot', noProc: true }));
    }
  }
  if (v.key === 'sv_storm' && c.left > 0) {
    c.hitSet.add(mb.id);
    let best = null, bd = 7;
    for (const m2 of mobs.values()) {
      if (c.hitSet.has(m2.id) || m2 === mb) continue;
      const d = Math.hypot(m2.x - mb.x, m2.z - mb.z);
      if (d < bd) { bd = d; best = m2; }
    }
    if (best) {
      c.left--; c.hitSet.add(best.id);
      const from = mb, to = best, pow = SV.stormMult(v.t);
      later(0.08, () => {
        fx.lightning(to.x, to.z, 0xffe040);
        for (let k = 0; k <= 8; k++) fx.parts.emit(from.x + (to.x - from.x) * k / 8, 1.3, from.z + (to.z - from.z) * k / 8, { color: 0xfff080, size: 0.5, life: 0.25, speed: 1, gravity: 0 });
        audio.sfx('thunder');
        dealDamage(to, pow, { type: 'wskill', noProc: true, sv: v, cast: c });
      });
    }
  }
  if (v.key === 'sv_drain') heal(dmg * SV.drain(v.t) * BALANCE.lifestealEfficiency, true);
  if (v.key === 'sv_venom' && o.type !== 'dot') {
    mb.poisonUntil = now() + SV.venomSec; mb.poisonPow = SV.venomDot(v.t);
    fx.parts.burst(mb.x, 1.2, mb.z, 14, { color: 0x8aff5a, speed: 3, size: 0.45, life: 0.6, gravity: -1 });
  }
  if (v.key === 'sv_quake' && now() - c.quakeT > 0.2) {
    c.quakeT = now();
    fx.ringWave(mb.x, mb.z, 0xd8b080, 3.5, 0.35);
    fx.parts.burst(mb.x, 0.3, mb.z, 20, { color: 0xb89870, speed: 6, size: 0.6, life: 0.5, up: 2 });
    addShake(0.15);
  }
  // 氷結: 当たった敵が凍り、1秒後に砕けて周りにも当たる（1回の発動で敵ごとに1回）
  if (v.key === 'sv_frost' && !c.hitSet.has(mb.id) && o.type !== 'dot') {
    c.hitSet.add(mb.id);
    const x = mb.x, z = mb.z;
    fx.parts.burst(x, 1, z, 16, { color: 0xbfefff, speed: 2, size: 0.5, life: 1, gravity: 0 });
    fx.ringWave(x, z, 0x80d8ff, 1.6, 0.9, 0.2, 0.4);
    later(1, () => {
      fx.parts.burst(x, 1, z, 40, { color: 0xd8f6ff, speed: 8, size: 0.55, life: 0.5, gravity: 6 });
      fx.ringWave(x, z, 0x80d8ff, 3.2, 0.3); fx.flash(x, 1.5, z, 0x80d8ff, 30, 0.25);
      audio.sfx('hit', { crit: true });
      strikes.circle(x, z, 3, SV.frost(v.t), { type: 'wskill', noProc: true });
    });
  }
}
// 旋風: 狙った場所に竜巻を残す
export function galeAt(p, v) {
  const life = SV.galeLife(v.t), pow = SV.galeMult(v.t);
  fx.ringWave(p.x, p.z, 0x8affb0, 3, 0.4);
  audio.sfx('wave');
  for (let k = 0; k * 0.1 < life; k++) {
    later(k * 0.1, () => {
      for (let j = 0; j < 4; j++) {
        const a = k * 0.9 + j * Math.PI / 2, h = (j + (k % 3)) * 0.8, r = 0.6 + h * 0.35;
        fx.parts.emit(p.x + Math.sin(a) * r, h, p.z + Math.cos(a) * r, { color: j % 2 ? 0x8affb0 : 0xe0fff0, size: 0.45, life: 0.35, speed: 1, gravity: -2 });
      }
      if (k % 4 === 0) strikes.circle(p.x, p.z, 2.6, pow, { type: 'wskill', noProc: true });
    });
  }
}
// 聖光: 少し遅れて光の柱が落ちる
export function holyAt(p, v) {
  fx.ringWave(p.x, p.z, 0xfff0a0, 2.8, 0.6, 0.15, 0.3);
  later(0.6, () => {
    fx.beam(p.x, p.z, 0xfff0a0, 16, 1.4, 0.45);
    fx.flash(p.x, 3, p.z, 0xfff0a0, 60, 0.4, 16);
    fx.parts.burst(p.x, 0.5, p.z, 50, { color: 0xfff6c0, speed: 6, size: 0.6, life: 0.6, gravity: -4 });
    audio.sfx('thunder'); addShake(0.2);
    strikes.circle(p.x, p.z, 3, SV.holyMult(v.t), { type: 'wskill', noProc: true });
    heal(S.mhp * SV.holyHeal(v.t) / 100, true);
  });
}
// 流星: 狙った場所の周りに、少しずつずれて流星が降る
export function meteorsAt(p, v) {
  const n = SV.meteorCount(v.t), pow = SV.meteorMult(v.t);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * 2;
    const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
    later(0.25 + i * 0.18, () => {
      fx.ringWave(x, z, 0xffa060, 2.2, 0.25, 0.1, 0.2);
      fx.beam(x, z, 0xffa060, 10, 0.5, 0.25);
      fx.parts.burst(x, 0.4, z, 30, { color: i % 2 ? 0xffd080 : 0xff7a30, speed: 7, size: 0.55, life: 0.5, up: 2 });
      audio.sfx('impact'); addShake(0.12);
      strikes.circle(x, z, 2.2, pow, { type: 'wskill', noProc: true });
    });
  }
}
