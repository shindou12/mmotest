import { BALANCE } from '../../shared/balance.js';
import { RARITIES, SV } from '../../shared/data.js';
import { angDiff, now, rnd } from './util.js';
import { fxReduce, fxSome } from './weapon-fx.js';
import { link, rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// 戦闘（プレイヤー側）
// ======================================================================
// ---- 狙い: マウス、またはスマホ（ボタンを引っぱった方向 → 自動ターゲット → 向いている方向） ----
export let shake = 0;
export const touch = { on: false, stick: { x: 0, y: 0 }, aim: null, aimLen: 0, target: null };
export function autoTarget() {
  if (!stats.S) return null;
  const range = stats.S.W.ranged ? stats.S.W.range : stats.S.W.range + 4;
  // 近さと、スティック（または向き）の方向との近さで選ぶ
  const sl = Math.hypot(touch.stick.x, touch.stick.y);
  const want = sl > 0.3 ? Math.atan2(touch.stick.x, touch.stick.y) : state.me.a;
  let best = null, bs = Infinity;
  for (const mb of state.mobs.values()) {
    if (mb.hp <= 0) continue;
    const d = Math.hypot(mb.x - state.me.x, mb.z - state.me.z);
    if (d > range + mb.rad) continue;
    const off = Math.abs(angDiff(Math.atan2(mb.x - state.me.x, mb.z - state.me.z), want));
    const s = d * (1 + off / Math.PI) * (mb.kind === 2 ? 0.8 : 1);
    if (s < bs) { bs = s; best = mb; }
  }
  return best;
}
export function aimAngle() {
  if (!touch.on) return Math.atan2(state.mouse.world.x - state.me.x, state.mouse.world.z - state.me.z);
  if (touch.aim != null) return touch.aim;
  const t = touch.target;
  return t ? Math.atan2(t.x - state.me.x, t.z - state.me.z) : state.me.a;
}
// 地点を狙うスキル（アローレインなど）
export function aimPoint() {
  if (!touch.on) return { x: state.mouse.world.x, z: state.mouse.world.z };
  if (touch.aim != null) { const r = 3 + touch.aimLen * 13; return { x: state.me.x + Math.sin(touch.aim) * r, z: state.me.z + Math.cos(touch.aim) * r }; }
  if (touch.target) return { x: touch.target.x, z: touch.target.z };
  return { x: state.me.x + Math.sin(state.me.a) * 8, z: state.me.z + Math.cos(state.me.a) * 8 };
}
export function addShake(v) { if (state.settings.shake) shake = Math.max(shake, v); }

export const TYPE_MOD = { normal: 'normp', heavy: 'heavyp', wskill: 'wskillp' };
// 攻撃のスタン値（ボスのスタンと、倒れた仲間を起こす量の両方に使う）。強攻撃ほど・近接武器ほど大きい
export function stunValue(o) {
  let st = o.stun ?? { normal: 1.2, heavy: 6, wskill: 3, tskill: 3 }[o.type] ?? 0;
  st *= stats.S.W.stun * (stats.S.W.melee ? 1 + (stats.S.stunp + stats.buffMod('stunp')) / 100 : 1);
  st = fxReduce('stun', st, o); // 武器ツリー（破砕・重圧・揺さぶり・重矢 など）
  if (o.sv?.key === 'sv_quake') st *= SV.quake(o.sv.t);
  if (rules.tf('t_breaker')) st *= 1.3;
  return Math.round(st * 10) / 10;
}
export function dealDamage(mb, mult, o = {}) {
  if (state.characterStore.lost) return;
  if (!mb || mb.hp <= 0) return;
  if (mb.act?.p === 'burrow' && mb.act.age > 0.45 && mb.act.age < (mb.act.d || 0) - 0.7) return; // 砂に潜っている間は当たらない（サーバーも受け付けない）
  const skill = o.type === 'wskill' || o.type === 'tskill';
  const tough = mb.kind === 2 || !!mb.elite;
  let crit = o.crit || (stats.S.wt && fxSome('critAlways', o)) || o.sv?.key === 'sv_heavy' || Math.random() * 100 < stats.S.crit + stats.buffMod('crit') + rules.wtCritAdd(o) + (tough && rules.tf('t_shark') ? 15 : 0) + (rules.tf('t_night') && rules.indoorNow() ? 10 : 0) + (rules.tf('t_lucky') ? 8 : 0) || (skill && stats.S.fx.has('skillcrit'));
  let ambushed = false;
  if (!crit && state.me.ambush > 0 && !o.noProc) { crit = true; state.me.ambush--; ambushed = true; }
  if (!crit && fxSome('critAfter', mb, o)) crit = true; // 武器ツリー: 間合いの先端・砕骨・暗殺の背後 など
  const typeMult = 1 + ((stats.S[TYPE_MOD[o.type]] || 0) + stats.buffMod(TYPE_MOD[o.type])) / 100;
  const back = state.me.hp < stats.S.mhp * 0.5 ? 1 + stats.S.backwater / 100 : 1;
  const stunned = mb.stunT > 0 ? 1.3 : 1;
  const exec = stats.S.flags.has('execute') && mb.hp < mb.mhp * 0.3 ? 1.5 : 1;
  const guardBonus = now() < state.me.atkBonusT ? state.me.atkBonus : 1;
  const bossT = mb.kind === 2 && rules.tf('t_boss1') ? 1.15 : 1;
  let dmg = stats.S.atk * (1 + stats.buffMod('atkp') / 100) * mult * typeMult * back * stunned * exec * guardBonus * bossT * rules.titleDmg(mb)
    * (1 + stats.buffMod('dmgp') / 100) * (o.falloff ?? 1) * rnd(0.92, 1.08) * (crit ? stats.S.critd / 100 : 1) * rules.wtDmgMult(o, mb, crit) * fxReduce('ambushMult', 1, ambushed);
  dmg = Math.max(1, Math.round(dmg));
  dmg = fxReduce('finisher', dmg, mb, crit, o); // 必殺 など
  // 番兵の盾: 正面からの攻撃は 3 割しか通らない（攻撃の後の隙と背後は盾が効かない）
  const blocked = mb.guard && o.type !== 'dot' && Math.abs(angDiff(Math.atan2(state.me.x - mb.x, state.me.z - mb.z), mb.a)) < GUARD_ARC;
  if (blocked) dmg = Math.max(1, Math.round(dmg * GUARD_PASS));
  mb.hp -= dmg; mb.localT = now(); mb.flash = 1;
  // スタン値: 強攻撃で大きく溜まる。近接武器ほど溜めやすい
  const st = mb.kind === 2 && !(mb.stunT > 0) ? stunValue(o) : 0;
  link.net.send({ t: 'hit', id: mb.id, dmg, crit, st, tech: o.tech || fxReduce('hitTech', undefined, o, mb) }); // 間合い支配: 先端で当てた雑魚を押し戻す など
  if (o.healOnHit) rules.heal(dmg * o.healOnHit, true);
  if (o.threat > 1) link.net.send({ t: 'threat', id: mb.id, n: Math.round(dmg * (o.threat - 1)) });
  // 武器パッシブ（攻撃が当たったとき）
  if (['normal', 'heavy', 'wskill', 'tskill'].includes(o.type)) {
    if (stats.S.dStackPer > 0) { state.me.dStack = Math.min(stats.S.dStackMax, state.me.dStack + 1); state.me.dStackT = stats.S.dStackT; }
  }
  if (stats.S.wt) rules.wtOnHit(mb, dmg, crit, o, mult);
  screen.floatText(mb.x, 2.2 * (mb.kind === 2 ? 2.5 : 1), mb.z, dmg, o.type === 'dot' ? 'poison' : crit ? 'crit' : '');
  if (o.type !== 'dot') {
    const wc = RARITIES[stats.S.wr].color;
    view.fx.parts.burst(mb.x, 1.2, mb.z, crit ? 18 : 8, { color: crit ? 0xffd84a : wc, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 });
    view.audio.sfx(blocked ? 'block' : 'hit', { crit });
    if (blocked) { view.fx.parts.burst(mb.x + Math.sin(mb.a) * 0.9, 1.6, mb.z + Math.cos(mb.a) * 0.9, 16, { color: 0xbfe0ff, speed: 9, size: 0.35, life: 0.3 }); view.audio.sfx('impact'); }
    // 被弾の揺れ（小さく短く）。スタン中のボスは重い音・黄色い火花・ほんの一瞬の止めで「今が攻め時」の手応え
    jolt(mb, stunned > 1 ? 0.12 : 0.08, stunned > 1 ? 0.22 : crit ? 0.1 : 0.06);
    if (stunned > 1) { view.audio.sfx('stunHit'); view.fx.parts.burst(mb.x, 2.2, mb.z, 14, { color: 0xffe060, speed: 11, size: 0.55, life: 0.35 }); rules.setHitStop(Math.max(rules.hitStop, 0.035)); }
  }
  const vamp = stats.S.vamp + stats.buffMod('vamp');
  // HP吸収は一定の間隔に1回だけ、その一撃のダメージから（重い一撃ほど大きく戻り、手数では増えない）。継続ダメージは対象外
  if (vamp > 0 && o.type !== 'dot' && now() - (state.me.vampT || -1e9) >= BALANCE.lifestealGap) {
    state.me.vampT = now();
    rules.heal(dmg * vamp / 100 * BALANCE.lifestealEfficiency, false);
  }
  if (o.sv) rules.onVariantHit(mb, dmg, o);
  // 称号「流星」: 武器スキルが当たると流れ星が降る（0.6秒に1回）
  if (o.type === 'wskill' && rules.tf('t_star') && !o.noProc && now() - (state.me.starT || 0) > 0.6) {
    state.me.starT = now();
    const x = mb.x, z = mb.z;
    view.fx.parts.burst(x, 7, z, 20, { color: 0xfff0a0, speed: 3, size: 0.5, life: 0.4, gravity: 30 });
    later(0.25, () => {
      view.fx.flash(x, 1, z, 0xfff0a0, 30, 0.25); view.fx.ringWave(x, z, 0xfff0a0, 2.6, 0.3);
      rules.strikes.circle(x, z, 2.4, 0.35, { type: 'proc', noProc: true });
    });
  }
  if (o.noProc) return;
  if (stats.hasBuff('poison')) mb.poisonUntil = now() + 4;
  if (crit && stats.S.fx.has('thunder')) {
    later(0.08, () => {
      view.fx.lightning(mb.x, mb.z); view.audio.sfx('thunder'); addShake(0.2);
      rules.strikes.circle(mb.x, mb.z, 3.5, 1.5, { noProc: true });
    });
  }
  if (stats.S.fx.has('flame') && Math.random() < 0.35) {
    view.fx.parts.burst(mb.x, 0.8, mb.z, 25, { color: 0xff6a20, speed: 4, size: 0.6, life: 0.7, gravity: 3 });
    view.audio.sfx('flame');
    for (const m2 of state.mobs.values()) if (m2 !== mb && Math.hypot(m2.x - mb.x, m2.z - mb.z) < 2.8 + m2.rad) dealDamage(m2, 0.6, { noProc: true });
  }
}

export function later(sec, fn) { state.pending.push({ at: now() + sec, fn }); }

export function setShake(v) { shake = v; }

// 敵をビクッと揺らす（sec 秒で収まる。amp はずれの大きさ m）
const GUARD_ARC = 1.0, GUARD_PASS = 0.3; // 番兵の盾: 正面 ±57° からの攻撃を 3 割に

export function jolt(mb, sec, amp) {
  if (mb.jolt > 0 && mb.joltAmp > amp) return; // 大きい揺れの最中は上書きしない
  mb.jolt = sec; mb.joltMax = sec; mb.joltAmp = amp;
}
