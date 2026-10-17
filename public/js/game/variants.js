import { BALANCE } from '../../shared/balance.js';
import { SV } from '../../shared/data.js';
import { now } from './util.js';
import { rules, state, stats, view } from './ports.js';

// ======================================================================
// スキル変化（武器の特性）: 武器スキルの性質を大きく変える
// ======================================================================
export const tf = (id) => !!stats.S?.tfx?.has(id); // 称号の効果が有効か
export const indoorNow = () => state.world.def.shape === 'grid';
export const weatherNow = () => !!state.world.def.weather && !indoorNow();
// 称号による移動速度・攻撃速度の上乗せ（%）
export function titleMove() {
  return (tf('t_delver') && indoorNow() ? 15 : 0) + (tf('t_traveler') && now() < (state.me.travelT || 0) ? 30 : 0) + (tf('t_storm') && weatherNow() ? 15 : 0);
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
export const desperate = () => tf('t_boss3') && state.me.hp < stats.S.mhp * 0.5; // 称号「砂王を屠りし者」
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
  const c = Object.create(rules.combat);
  const color = () => v.color ?? rules.combat.col();
  c.col = color;
  c.hit = (mb, mult, o) => rules.strikes.hit(mb, mult * P.mult, tag(o));
  c.arc = (range, deg, mult, o) => rules.strikes.arc(range * P.range, deg, mult * P.mult, tag(o));
  c.line = (len, w, mult, o) => rules.strikes.line(len * P.range, w * P.range, mult * P.mult, tag(o));
  c.circle = (x, z, r, mult, o) => rules.strikes.circle(x, z, r * P.range, mult * P.mult, tag(o));
  c.proj = (o) => rules.strikes.proj({ ...tag(o), mult: (o.mult ?? 1.4) * P.mult, rad: (o.rad ?? 1.8) * P.range, life: (o.life ?? 0.7) * P.range, color: v.color ?? o.color });
  c.arrow = (o) => rules.strikes.arrow({ ...tag(o), mult: (o.mult ?? 1) * P.mult, rad: (o.rad ?? 0.7) * P.range, color: v.color ?? o.color });
  // 見た目も大きさと色を合わせる
  const f = Object.create(view.fx);
  f.slash = (x, z, a, r, arc, col, ...rest) => view.fx.slash(x, z, a, r * P.range, arc, v.color ?? col, ...rest);
  f.ringWave = (x, z, col, r, ...rest) => view.fx.ringWave(x, z, v.color ?? col, r * P.range, ...rest);
  c.fx = f;
  return c;
}
export function castWeaponSkill(sk) {
  const v = stats.S.sv;
  if (!v) { sk.run(rules.combat); return; }
  const go = () => {
    sk.run(variantCtx(v));
    if (v.key === 'sv_twin') rules.later(0.42, () => { if (!state.me.dead) { state.me.a = rules.aimAngle(); sk.run(variantCtx(v, true)); view.fx.ringWave(state.me.x, state.me.z, 0xffffff, 2.5, 0.25); } });
  };
  if (v.key === 'sv_blink') {
    // 瞬身: 狙った方向へ一瞬で移動してから発動
    const a = rules.aimAngle(), d = SV.blinkDist(v.t);
    view.fx.parts.burst(state.me.x, 1, state.me.z, 25, { color: 0x9affff, speed: 4, size: 0.5, life: 0.4 });
    rules.strikes.dash(a, d, 0.1, 0.45);
    rules.later(0.12, () => { view.fx.parts.burst(state.me.x, 1, state.me.z, 25, { color: 0x9affff, speed: 4, size: 0.5, life: 0.4 }); go(); });
  } else go();
  if (v.key === 'sv_gale') galeAt(rules.aimPoint(), v);
  if (v.key === 'sv_holy') holyAt(rules.aimPoint(), v);
  if (v.key === 'sv_meteor') meteorsAt(rules.aimPoint(), v);
  if (v.key === 'sv_haste') stats.addBuff('sv_haste', '疾駆', SV.hasteSec, { move: SV.haste(v.t), aspd: SV.haste(v.t) }, 0x9affc8);
  if (v.key === 'sv_ward') { stats.addBuff('sv_ward', '守護', SV.wardSec, { dr: SV.ward(v.t) }, 0xbfe0ff); view.fx.ringWave(state.me.x, state.me.z, 0xbfe0ff, 2.4, 0.4); }
  if (v.key === 'sv_heavy') { rules.addShake(0.25); view.fx.parts.burst(state.me.x, 1, state.me.z, 30, { color: 0xff5040, speed: 7, size: 0.6, life: 0.4 }); }
  if (v.color) view.fx.flash(state.me.x, 1.5, state.me.z, v.color, 30, 0.3);
}
export function onVariantHit(mb, dmg, o) {
  const v = o.sv, c = o.cast;
  if (v.key === 'sv_blaze') {
    mb.burnUntil = now() + 3; mb.burnPow = SV.blazeDot(v.t);
    if (!c.exploded) {
      c.exploded = true;
      view.fx.parts.burst(mb.x, 1, mb.z, 50, { color: 0xff7a20, speed: 8, size: 0.7, life: 0.6, gravity: -2 });
      view.fx.ringWave(mb.x, mb.z, 0xff6a20, 3, 0.35); view.fx.flash(mb.x, 1.5, mb.z, 0xff6a20, 40, 0.3);
      view.audio.sfx('flame'); rules.addShake(0.2);
      rules.later(0.05, () => rules.strikes.circle(mb.x, mb.z, 2.6, SV.blazeBoom, { type: 'dot', noProc: true }));
    }
  }
  if (v.key === 'sv_storm' && c.left > 0) {
    c.hitSet.add(mb.id);
    let best = null, bd = 7;
    for (const m2 of state.mobs.values()) {
      if (c.hitSet.has(m2.id) || m2 === mb) continue;
      const d = Math.hypot(m2.x - mb.x, m2.z - mb.z);
      if (d < bd) { bd = d; best = m2; }
    }
    if (best) {
      c.left--; c.hitSet.add(best.id);
      const from = mb, to = best, pow = SV.stormMult(v.t);
      rules.later(0.08, () => {
        view.fx.lightning(to.x, to.z, 0xffe040);
        for (let k = 0; k <= 8; k++) view.fx.parts.emit(from.x + (to.x - from.x) * k / 8, 1.3, from.z + (to.z - from.z) * k / 8, { color: 0xfff080, size: 0.5, life: 0.25, speed: 1, gravity: 0 });
        view.audio.sfx('thunder');
        rules.dealDamage(to, pow, { type: 'wskill', noProc: true, sv: v, cast: c });
      });
    }
  }
  if (v.key === 'sv_drain') rules.heal(dmg * SV.drain(v.t) * BALANCE.lifestealEfficiency, true);
  if (v.key === 'sv_venom' && o.type !== 'dot') {
    mb.poisonUntil = now() + SV.venomSec; mb.poisonPow = SV.venomDot(v.t);
    view.fx.parts.burst(mb.x, 1.2, mb.z, 14, { color: 0x8aff5a, speed: 3, size: 0.45, life: 0.6, gravity: -1 });
  }
  if (v.key === 'sv_quake' && now() - c.quakeT > 0.2) {
    c.quakeT = now();
    view.fx.ringWave(mb.x, mb.z, 0xd8b080, 3.5, 0.35);
    view.fx.parts.burst(mb.x, 0.3, mb.z, 20, { color: 0xb89870, speed: 6, size: 0.6, life: 0.5, up: 2 });
    rules.addShake(0.15);
  }
  // 氷結: 当たった敵が凍り、1秒後に砕けて周りにも当たる（1回の発動で敵ごとに1回）
  if (v.key === 'sv_frost' && !c.hitSet.has(mb.id) && o.type !== 'dot') {
    c.hitSet.add(mb.id);
    const x = mb.x, z = mb.z;
    view.fx.parts.burst(x, 1, z, 16, { color: 0xbfefff, speed: 2, size: 0.5, life: 1, gravity: 0 });
    view.fx.ringWave(x, z, 0x80d8ff, 1.6, 0.9, 0.2, 0.4);
    rules.later(1, () => {
      view.fx.parts.burst(x, 1, z, 40, { color: 0xd8f6ff, speed: 8, size: 0.55, life: 0.5, gravity: 6 });
      view.fx.ringWave(x, z, 0x80d8ff, 3.2, 0.3); view.fx.flash(x, 1.5, z, 0x80d8ff, 30, 0.25);
      view.audio.sfx('hit', { crit: true });
      rules.strikes.circle(x, z, 3, SV.frost(v.t), { type: 'wskill', noProc: true });
    });
  }
}
// 旋風: 狙った場所に竜巻を残す
export function galeAt(p, v) {
  const life = SV.galeLife(v.t), pow = SV.galeMult(v.t);
  view.fx.ringWave(p.x, p.z, 0x8affb0, 3, 0.4);
  view.audio.sfx('wave');
  for (let k = 0; k * 0.1 < life; k++) {
    rules.later(k * 0.1, () => {
      for (let j = 0; j < 4; j++) {
        const a = k * 0.9 + j * Math.PI / 2, h = (j + (k % 3)) * 0.8, r = 0.6 + h * 0.35;
        view.fx.parts.emit(p.x + Math.sin(a) * r, h, p.z + Math.cos(a) * r, { color: j % 2 ? 0x8affb0 : 0xe0fff0, size: 0.45, life: 0.35, speed: 1, gravity: -2 });
      }
      if (k % 4 === 0) rules.strikes.circle(p.x, p.z, 2.6, pow, { type: 'wskill', noProc: true });
    });
  }
}
// 聖光: 少し遅れて光の柱が落ちる
export function holyAt(p, v) {
  view.fx.ringWave(p.x, p.z, 0xfff0a0, 2.8, 0.6, 0.15, 0.3);
  rules.later(0.6, () => {
    view.fx.beam(p.x, p.z, 0xfff0a0, 16, 1.4, 0.45);
    view.fx.flash(p.x, 3, p.z, 0xfff0a0, 60, 0.4, 16);
    view.fx.parts.burst(p.x, 0.5, p.z, 50, { color: 0xfff6c0, speed: 6, size: 0.6, life: 0.6, gravity: -4 });
    view.audio.sfx('thunder'); rules.addShake(0.2);
    rules.strikes.circle(p.x, p.z, 3, SV.holyMult(v.t), { type: 'wskill', noProc: true });
    rules.heal(stats.S.mhp * SV.holyHeal(v.t) / 100, true);
  });
}
// 流星: 狙った場所の周りに、少しずつずれて流星が降る
export function meteorsAt(p, v) {
  const n = SV.meteorCount(v.t), pow = SV.meteorMult(v.t);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * 2;
    const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
    rules.later(0.25 + i * 0.18, () => {
      view.fx.ringWave(x, z, 0xffa060, 2.2, 0.25, 0.1, 0.2);
      view.fx.beam(x, z, 0xffa060, 10, 0.5, 0.25);
      view.fx.parts.burst(x, 0.4, z, 30, { color: i % 2 ? 0xffd080 : 0xff7a30, speed: 7, size: 0.55, life: 0.5, up: 2 });
      view.audio.sfx('impact'); rules.addShake(0.12);
      rules.strikes.circle(x, z, 2.2, pow, { type: 'wskill', noProc: true });
    });
  }
}
