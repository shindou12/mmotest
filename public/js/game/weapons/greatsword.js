// 大剣の武器ツリーの効果（光波・一撃・カウンター・剛体・見切り眼 など）。差し込み口は game/weapon-fx.js
import { TREE_MOTIONS } from '../../../shared/tree-motions.js';
import { LIGHT_COLOR } from '../../weapon-tree.js';
import { now } from '../util.js';
import { floatText } from '../ui-bridge.js';
import { audio, fx } from '../render.js';
import { me } from '../state.js';
import { S, addBuff, hasBuff } from '../stats.js';
import { addShake, later } from '../combat.js';
import { cutCds, quietBuff } from '../tree-effects.js';
import { extendCombat, strikes } from '../actions.js';
import { registerWeaponFx } from '../weapon-fx.js';

// 見切り眼: JUST回避・受け流しのあと3秒間ダメージアップ（6秒に1回まで）
function eye() {
  const W = S.wt;
  if (!W?.lv('gt_eye') || now() - me.eyeT < 6) return;
  me.eyeT = now();
  quietBuff('gt_eye', '見切り眼', 3, { dmgp: W.lv('gt_eye') >= 2 ? 25 : 15 }, 0x9affff);
  if (W.br('gt_eye') === 'A') me.eyeCharge = true;
  if (W.br('gt_eye') === 'B') cutCds(2);
}

// スキルに渡す文脈に、溜めた状態から始める道具を足す（c.primeCharge: グランド・スラムB「踏み込み溜め」）
extendCombat({ primeCharge(frac) { me.primeCharge = frac; } });

registerWeaponFx('greatsword', {
  // 一撃: 溜めは +25% 長い / 溜めの心得A: 溜めが速い
  stats(S, WT) { S.chargeMax = S.chargeMax * (WT?.ks1 === 'gt_blow' ? 1.25 : 1) * (WT?.br('gt_charge') === 'A' ? 0.8 : 1); },
  dmgMult(k, W, o, mb) {
    const maxHeavy = o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8;
    if (W.ks1 === 'gt_wave' && o.type === 'heavy' && !o.wave) k *= 0.85;
    if (W.ks1 === 'gt_blow' && maxHeavy) k *= 1.4;
    if (W.br('gt_break') === 'A' && mb?.stunT > 0) k *= 1.2;
    if (o.exec && mb && mb.hp < mb.mhp * 0.3) k *= o.exec; // 断頭落としA「処断」
    return k;
  },
  // 断罪: 最大溜めの強攻撃の会心率 +35%
  critAdd: (v, o) => v + (S.wt?.ks2 === 'gt_judge' && o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8 ? 35 : 0),
  // 月蝕: 光波が最初に当たった敵のところで爆ぜる
  onHit(mb, dmg, crit, o) {
    if (o.proj?.eclipse && !o.proj.boomed) {
      o.proj.boomed = true;
      const x = mb.x, z = mb.z;
      later(0.05, () => { strikes.circle(x, z, 3, 1.5, { type: 'proc', wtNo: true }); fx.ringWave(x, z, LIGHT_COLOR, 3.4, 0.35); fx.flash(x, 1.2, z, LIGHT_COLOR, 30, 0.25); audio.sfx('wave'); });
    }
  },
  // 溜め中に攻撃を受けた: 不屈（溜めが最大に）/ 剛体A（溜めが進む）
  onHurtCharging() {
    const W = S.wt;
    if (W.ks2 === 'gt_unyield') me.chargeT = Math.max(me.chargeT, S.chargeMax);
    else if (W.br('gt_armor') === 'A') me.chargeT += 0.3;
  },
  // 溜め中の被ダメージ軽減（剛体lv2・剛体B・一撃）と破城の構えA
  dr(v) {
    const W = S.wt;
    if (!W) return v;
    let dr = 0;
    if (me.charging) {
      if (W.lv('gt_armor') >= 2) dr += 15;
      if (W.br('gt_armor') === 'B') dr += 10;
      if (W.ks1 === 'gt_blow') dr += 30;
    }
    if (W.br('gt_siege') === 'A' && hasBuff('gt_siege')) dr += 20;
    return v + dr;
  },
  // 剛体: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
  superArmor: () => (me.charging && (S.wt?.lv('gt_armor') ?? 0) >= 1) || (S.wt?.br('gt_siege') === 'A' && hasBuff('gt_siege')),
  noKnockdown: () => me.charging && S.wt?.br('gt_armor') === 'B',
  // 強攻撃を振ったとき: 光波・月の残滓・破城の構えB
  heavy(lv, a) {
    const W = S.wt;
    if (W.ks1 === 'gt_wave') {
      me.motion = 'gt_wave'; me.motionT = 0; // 振り抜いて光波を飛ばす
      const big = lv === 2, moon = big && W.ks2 === 'gt_fullmoon';
      strikes.proj({ a, mult: (big ? 2.0 : 1.0) * (moon ? 1.75 : 1), type: 'heavy', speed: big ? 22 : 24, life: big ? 0.75 : 0.55, rad: moon ? 3.4 : big ? 2.0 : 1.2, color: LIGHT_COLOR, stun: W.br('gt_break') === 'B' ? 6 : 1.5, eclipse: W.ks2 === 'gt_eclipse' });
      if (big) fx.flash(me.x, 1.5, me.z, LIGHT_COLOR, moon ? 60 : 35, 0.3);
    }
    if (W.lv('gt_moon')) {
      const n = W.br('gt_moon') === 'A' ? 2 : 1, m = W.lv('gt_moon') >= 2 ? 0.8 : 0.5;
      const stun = W.br('gt_moon') === 'B' || W.br('gt_break') === 'B' ? 4 : 0.5;
      for (let i = 0; i < n; i++) later(0.12 + i * 0.12, () => strikes.proj({ a: a + (n > 1 ? (i ? 0.12 : -0.12) : 0), mult: m, type: 'proc', speed: 24, life: 0.5, rad: 0.9, color: LIGHT_COLOR, wtNo: true, stun }));
    }
    if (W.br('gt_siege') === 'B' && hasBuff('gt_siege')) strikes.proj({ a, mult: 1.2, type: 'heavy', speed: 22, life: 0.6, rad: 1.6, color: LIGHT_COLOR, stun: 1.5 });
  },
  // カウンター: 強攻撃を押した直後に攻撃を受けたら、無傷で受け流して反撃する
  counter(src) {
    if (S.wt?.ks1 !== 'gt_counter' || !me.charging || now() - me.chargeStart > 0.35) return false;
    me.charging = false; me.chargeT = 0; me.chargeLv = 0;
    me.iframe = Math.max(me.iframe, 0.4);
    const a = src ? Math.atan2(src.x - me.x, src.z - me.z) : me.a;
    const M = TREE_MOTIONS.gt_riposte;
    me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
    floatText(me.x, 3.1, me.z, '見切り!', 'just');
    audio.sfx('perfect'); audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xffffff, 3, 0.3); fx.flash(me.x, 1.5, me.z, 0xffffff, 40, 0.25);
    later(M.hits[0], () => { strikes.arc(4, 200, 3.5, { type: 'heavy', a, stun: 8 }); fx.slash(me.x, me.z, a, 4, 200, 0xffffff, 1.6, true); audio.sfx('swing', { heavy: true }); addShake(0.25); });
    if (S.wt.ks2 === 'gt_iai') me.iaiReady = true;
    if (S.wt.ks2 === 'gt_mirror') addBuff('gt_mirror', '明鏡', 5, { dmgp: 30 }, 0xe0f0ff);
    eye();
    return true;
  },
  justDodge() { eye(); },
});
