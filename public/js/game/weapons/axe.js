// 大斧の武器ツリーの効果（狂戦士・破砕・投斧・血・怒り など）。差し込み口は game/weapon-fx.js
import { TREE_MOTIONS } from '../../../shared/tree-motions.js';
import { RARITIES } from '../../../shared/data.js';
import { clamp, now, rnd } from '../util.js';
import { floatText } from '../ui-bridge.js';
import { audio, fx } from '../render.js';
import { me, mobs } from '../state.js';
import { S } from '../stats.js';
import { addShake, aimAngle, later } from '../combat.js';
import { quietBuff, wtEmit } from '../tree-effects.js';
import { extendCombat, strikes } from '../actions.js';
import { registerWeaponFx } from '../weapon-fx.js';

// 狂戦士: 減ったHP10%ごとに +3%（捨て身は1.5倍）
function axBers() {
  if (S?.wt?.ks1 !== 'ax_berserk' || !(S.mhp > 0)) return 0;
  const n = Math.floor(clamp(1 - me.hp / S.mhp, 0, 0.999) * 10) * 3;
  return S.wt.ks2 === 'ax_reckless' ? Math.min(40, n * 1.5) : n;
}
// 地割れ: 前へ一直線に地面が裂ける
function axCrack(a, len, mult, stun) {
  const sx = me.x, sz = me.z;
  strikes.line(len, 2.2, mult, { type: 'heavy', a, sx, sz, stun, wtNo: true });
  for (let d = 1; d < len; d += 0.6) later(d * 0.02, () => fx.parts.burst(sx + Math.sin(a) * d, 0.2, sz + Math.cos(a) * d, 6, { color: 0xb89870, speed: 5, size: 0.5, life: 0.5, up: 3 }));
  fx.slash(sx, sz, a, len, 12, 0xd8b080, 1.2);
}
// 投斧（強攻撃）: 斧を投げる。8m先まで飛んで戻り、往復とも当たる
function axThrow(lv) {
  const a = aimAngle(), M = TREE_MOTIONS.ax_throw, m = lv === 2 ? 2.6 : 1.6, W = S.wt, col = RARITIES[S.wr].color;
  me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration;
  const far = { x: me.x + Math.sin(a) * 8, z: me.z + Math.cos(a) * 8 }, rad = lv === 2 ? 1.6 : 1.2;
  later(M.hits[0], () => strikes.proj({ a, mult: m, type: 'heavy', speed: 20, life: 0.4, rad, shape: 'axe', stun: 6 }));
  const spin = W.ks2 === 'ax_storm' ? 2 : 0;
  for (let k = 0; k < spin * 4; k++) later(M.hits[0] + 0.4 + k * 0.25, () => { strikes.circle(far.x, far.z, 2.4, 0.5, { type: 'proc', stun: 1, wtNo: true }); fx.slash(far.x, far.z, k * 1.4, 2.4, 220, col, 0.8); });
  later(M.hits[0] + 0.4 + spin, () => {
    const ra = Math.atan2(me.x - far.x, me.z - far.z), t = Math.max(0.1, Math.hypot(me.x - far.x, me.z - far.z) / 20);
    strikes.proj({ a: ra, mult: m, type: 'heavy', speed: 20, life: t, rad, shape: 'axe', sx: far.x, sz: far.z, stun: 6 });
    if (W.ks2 === 'ax_catch') later(t, () => {
      if (me.dead) return;
      quietBuff('ax_catch', '受け止め', 3, { aspd: 25 }, 0xffb040);
      floatText(me.x, 3, me.z, '受け止め', 'just'); fx.ringWave(me.x, me.z, 0xffb040, 2, 0.3); audio.sfx('block');
    });
  });
}

// スキルに渡す文脈に、HPを払う道具を足す（c.pay: ブラッドラストA「血の代償」。0にはならない）
extendCombat({
  pay(frac) { const d = Math.min(me.hp - 1, Math.round(S.mhp * frac)); if (d > 0) { me.hp -= d; floatText(me.x, 2.2, me.z, d, 'me'); } },
});

registerWeaponFx('axe', {
  dmgMult(k, W, o, mb) {
    if (o.type !== 'proc') k *= 1 + axBers() / 100;
    if (W.br('ax_swing') === 'B' && o.type === 'normal' && me.combo === 2) k *= 1.3;
    if (W.br('ax_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
    if (W.ks2 === 'ax_shatter' && o.type === 'heavy' && mb?.kind === 2 && mb.stunT > 0) k *= 1.5;
    return k;
  },
  // 砕骨: スタン中のボスへの強攻撃は必ず会心
  critAfter: (mb, o) => S.wt?.ks2 === 'ax_shatter' && o.type === 'heavy' && mb.kind === 2 && mb.stunT > 0,
  // スタン値: 破砕・重圧（強攻撃）/ 揺さぶり（通常攻撃の3段目）
  stun(st, o) {
    const W = S.wt;
    if (W && o.type === 'heavy') st *= (W.ks1 === 'ax_crush' ? 2 : 1) * (W.br('ax_heavy') === 'B' ? 1.5 : 1); // 破砕・重圧
    if (W?.br('ax_brk') === 'B' && o.type === 'normal' && me.combo === 2) st *= 3; // 揺さぶり
    return st;
  },
  // 怒りの心得: 攻撃を受けると攻撃力アップ
  onHurt() {
    const W = S.wt;
    if (W.lv('ax_rage')) quietBuff('ax_rage', '怒り', 5, { atkp: W.v('ax_rage', 'rage'), ...(W.br('ax_rage') === 'A' ? { aspd: 15 } : {}), ...(W.br('ax_rage') === 'B' ? { dr: 15 } : {}) }, 0xff6a3a);
  },
  incoming: (raw) => (S.wt?.ks2 === 'ax_reckless' ? raw * 1.25 : raw), // 捨て身
  // 不死身: HPが0になる攻撃を1で耐える（60秒に1回）
  cheatDeath() {
    if (!(S.wt?.ks2 === 'ax_undying' && now() - (me.undyingT ?? -999) > 60)) return false;
    me.hp = 1; me.undyingT = now(); me.iframe = Math.max(me.iframe, 2);
    floatText(me.x, 2.8, me.z, '不死身!', 'just'); audio.sfx('perfect');
    fx.ringWave(me.x, me.z, 0xff3a3a, 3, 0.5); fx.flash(me.x, 1.5, me.z, 0xff3a3a, 50, 0.4);
    return true;
  },
  // 地砕き・剛力の心得A「地割れ」
  heavy(lv, a) {
    const W = S.wt;
    if (S.wk === 'axe' && W.ks1 !== 'ax_throw') {
      if (W.ks2 === 'ax_quake') later(0.16, () => axCrack(a, 9, 2.0, 6));
      else if (lv === 2 && W.br('ax_heavy') === 'A') later(0.16, () => axCrack(a, 7, 1.2, 3));
    }
  },
  heavyOverride(lv) { if (S.wt?.ks1 !== 'ax_throw') return false; axThrow(lv); return true; },
  swingAspd: (v) => v + axBers(),
  reach: (k, normal) => (S.wk !== 'axe' ? k : k * (normal && S.wt?.br('ax_swing') === 'A' ? 1.2 : 1)),
  aura(dt, W) {
    // 血の心得（渇き・血気）
    if (W.br('ax_blood') === 'A' && me.hp < S.mhp * 0.5) quietBuff('ax_thirst', '渇き', 0.3, { vamp: W.lv('ax_blood') >= 2 ? 3 : 2 }, 0xff3a3a);
    if (W.br('ax_blood') === 'B' && me.hp >= S.mhp) quietBuff('ax_full', '血気', 0.3, { atkp: 10 }, 0xff9a9a);
    // 破砕: ボスがスタンしたとき、周りに衝撃が走る
    if (W.ks1 === 'ax_crush') for (const mb of mobs.values()) {
      if (mb.kind !== 2) continue;
      if (!(mb.stunT > 0)) { mb.axBoom = false; continue; }
      if (mb.axBoom || now() - (mb.localT || 0) > 3) continue;
      mb.axBoom = true;
      const x = mb.x, z = mb.z;
      strikes.circle(x, z, 4 + mb.rad, 5.0, { type: 'proc', noProc: true });
      fx.ringWave(x, z, 0xffb040, 5 + mb.rad, 0.45); fx.flash(x, 1.5, z, 0xffb040, 60, 0.35);
      fx.parts.burst(x, 0.4, z, 60, { color: 0xc8a070, speed: 9, size: 0.6, life: 0.7, up: 3 });
      floatText(x, 4, z, '破砕!', 'just'); audio.sfx('impact'); addShake(0.5);
    }
    // 狂戦士: HPが減るほど、体から赤い湯気が立つ
    if (axBers() > 0) wtEmit('bers', axBers() * 1.2, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 1.6), me.z + rnd(-0.5, 0.5), { color: axBers() >= 20 ? 0xff2a1a : 0xff6a4a, size: 0.3, life: 0.6, speed: 1.2, gravity: -4 }));
  },
});
