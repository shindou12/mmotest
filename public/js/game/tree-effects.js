import { WEAPONS, DEFAULT_WEAPON } from '../../shared/data.js';
import { TREE_SKILLS } from '../skills.js';
import { WT_NODE, WT_REFUND_COST, WT_RESET_COST, gainProf, hasWTree, profLevel, profOf, wtCanRefund, wtChoose, wtLearn, wtOf, wtRefund, wtReset, wtSpent, WT_LEGACY } from '../weapon-tree.js';
import { clamp, now } from './util.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';
import { rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// 武器ツリー（weapon-tree.js）の効果の入り口と、共通の道具（クールタイム短縮・静かなバフ・熟練度・振り直し）
// ======================================================================
export const ATK_TYPES = ['normal', 'heavy', 'wskill', 'tskill'];
export function quietBuff(id, label, sec, mods, color) {
  state.me.buffs = state.me.buffs.filter((b) => b.id !== id);
  state.me.buffs.push({ id, label, t: sec, max: sec, mods, color });
}
export function cutCds(sec) { state.me.wsCd -= sec; for (const k in state.me.tcd) state.me.tcd[k] -= sec; }
// 武器ツリーの効果の入り口（中身は game/weapons/*.js が weapon-fx.js に登録する）
export function wtDmgMult(o, mb, crit) {
  const W = stats.S.wt;
  if (!W || o.type === 'dot') return 1;
  let k = fxReduce('dmgMult', 1, W, o, mb, crit);
  if (state.me.afterJust && ATK_TYPES.includes(o.type)) { state.me.afterJust = false; k *= 1.5; } // 後の先・影渡り: 次の1撃 +50%
  return fxReduce('dmgMultLast', k, W, o, mb, crit);
}
export function wtOnHit(mb, dmg, crit, o, mult) {
  if (o.type === 'dot' || o.type === 'proc' || o.wtNo) return;
  fxCall('onHit', mb, dmg, crit, o, mult);
}
// スキルを使った後（free: 幻剣のもう1回）
export function wtAfterCast(id, free = false) {
  const W = stats.S.wt;
  if (!W) return;
  fxCall('afterCast', id, free);
  fxCall('afterCastLate', id, free);
}
export const phantomReady = (id) => fxSome('phantomReady', id);
export function skillCd(id) {
  const sk = TREE_SKILLS[id];
  return (sk.cdOf && stats.S.wt ? sk.cdOf(stats.S.wt) : sk.cd) * (1 - stats.S.cdr / 100);
}
// 攻撃を受けた（受け流し・溜め中の効果・被弾の効果）。受け流せたら、ほかの効果は起きない
export function wtOnHurt(guarded) {
  fxCall('onHurtFirst');
  if (fxSome('parry')) return;
  if (state.me.charging) fxCall('onHurtCharging');
  if (guarded) return;
  fxCall('onHurt');
}
// ガードで受けた
export function wtOnGuard(raw, src) {
  const W = stats.S.wt;
  if (!W) return;
  fxCall('onGuard', raw, src);
}
// 被ダメージ軽減（武器ツリーの分）
export const wtDr = () => fxReduce('dr', 0);
// 会心率の上乗せ（武器ツリーの分）
export const wtCritAdd = (o) => fxReduce('critAdd', 0, o);
// 強攻撃の押し始め: 居合・踏み込み溜めで、溜めた状態から始める
export function wtChargeStart() {
  if (!stats.S?.wt) return;
  if (fxSome('chargeStart')) return; // 竜翔: 溜めなしでもう一度跳ぶ など
  if (state.me.iaiReady) { state.me.iaiReady = false; state.me.chargeT = stats.S.chargeMax; screen.floatText(state.me.x, 3, state.me.z, fxReduce('iaiLabel', '居合'), 'just'); }
  else if (state.me.primeCharge > 0) { state.me.chargeT = stats.S.chargeMax * state.me.primeCharge; state.me.primeCharge = 0; }
}
// 強攻撃を振ったとき（光波・地割れ など）
export function wtHeavy(lv) {
  const W = stats.S.wt;
  state.me.lastHeavyLv = lv; state.me.lastHeavyT = now(); state.me.eyeCharge = false;
  if (!W) return;
  fxCall('heavy', lv, rules.aimAngle());
}
// 武器ツリーの状態を、体と武器のまわりの光で見せる（中身は各武器の aura）
export const wtAuraAcc = { mom: 0, saint: 0, rev: 0, thunder: 0, soar: 0, bers: 0 };
// 1秒あたり rate 個の割合で粒を出す（フレームの速さに左右されない）
export function wtEmit(key, rate, dt, fn) { wtAuraAcc[key] = (wtAuraAcc[key] || 0) + rate * dt; while (wtAuraAcc[key] >= 1) { wtAuraAcc[key]--; fn(); } }
export function wtAura(dt) {
  const W = stats.S?.wt;
  if (!W || state.me.dead || state.me.crawl || !state.me.model) return;
  fxCall('aura', dt, W);
}
// 熟練度: 今の武器で経験値を得ると上がる
export function gainWeaponProf(n) {
  const wk = stats.S?.wk || state.char.eq.weapon?.kind || DEFAULT_WEAPON;
  const before = profLevel(state.char, wk);
  gainProf(state.char, wk, n);
  const after = profLevel(state.char, wk);
  if (after <= before) return;
  const name = WEAPONS[wk].name;
  view.audio.sfx('buff');
  view.fx.ringWave(state.me.x, state.me.z, 0x6ad0ff, 3.5, 0.5);
  screen.toast(hasWTree(wk) ? `${name}の熟練度 ${after}（ポイント +${after - before}・Kで武器ツリー）` : `${name}の熟練度 ${after}`, '#6ad0ff');
  stats.calcStats();
}
export function wtLearnNode(id) {
  if (!wtLearn(state.char, id)) { view.audio.sfx('ui'); return; }
  const n = WT_NODE[id], lv = state.char.wt[n.wk].lv[id];
  if (n.kind === 'skill' && lv === 1) {
    const i = state.char.slots.indexOf(null);
    if (i >= 0 && !state.char.slots.includes(id)) state.char.slots[i] = id;
  }
  if (lv === 3) screen.toast(`${n.name}：形を A・B から選べます`, '#ffd84a');
  view.audio.sfx('levelup');
  stats.calcStats(); state.saveChar();
}
export function wtChooseBranch(id, b) {
  if (!wtChoose(state.char, id, b)) { view.audio.sfx('ui'); return; }
  const n = WT_NODE[id];
  view.audio.sfx('perfect');
  screen.toast(`${n.name}が「${n[b].name}」に変化`, '#ffd84a');
  stats.calcStats(); state.saveChar();
}
// 右クリック: 1ポイントだけ戻す（ゴールドを払う）
export function wtRefundNode(id) {
  const n = WT_NODE[id];
  if (!n || !wtCanRefund(state.char, id)) { view.audio.sfx('ui'); return; }
  const cost = WT_REFUND_COST(wtSpent(wtOf(state.char, n.wk)));
  if ((state.char.gold || 0) < cost) { screen.toast(`1ポイント戻すには ${cost}G 必要です`, '#f88'); view.audio.sfx('ui'); return; }
  state.char.gold -= cost;
  wtRefund(state.char, id);
  if (!wtOf(state.char, n.wk).lv[id]) state.char.slots = state.char.slots.map((s) => (s === id ? null : s));
  view.audio.sfx('ui');
  screen.toast(`${n.name}を1ポイント戻しました（-${cost}G）`, '#9fe');
  stats.calcStats(); state.saveChar();
}
export function wtResetTree(wk) {
  const spent = wtSpent(wtOf(state.char, wk));
  if (!spent) return;
  const cost = WT_RESET_COST(spent);
  if ((state.char.gold || 0) < cost) { screen.toast(`振り直しには ${cost}G 必要です`, '#f88'); view.audio.sfx('ui'); return; }
  state.char.gold -= cost;
  const own = new Set(Object.keys(wtOf(state.char, wk).lv));
  wtReset(state.char, wk);
  state.char.slots = state.char.slots.map((s) => (own.has(s) ? null : s));
  fxCall('treeReset'); // 勢い・報復の蓄え・狙い澄まし などを戻す
  view.audio.sfx('ui');
  screen.toast(`${WEAPONS[wk].name}のツリーを振り直しました（-${cost}G）`, '#9fe');
  stats.calcStats(); state.saveChar();
}
// 旧ツリー（武器の枝）に振っていたポイントは返し、なくなった旧スキルはスロットから外す（一覧は各武器の legacy）。?prof=N でいまの武器の熟練度を決められる（確認用）
export function migrateWeaponTrees() {
  state.char.prof = state.char.prof || {}; state.char.wt = state.char.wt || {};
  let back = 0;
  for (const id of Object.keys(state.char.tree)) if (WT_LEGACY.prefixes.some((p) => id.startsWith(p))) { back += state.char.tree[id]; delete state.char.tree[id]; }
  const gone = WT_LEGACY.slots;
  state.char.slots = state.char.slots.map((id) => (id && (gone.includes(id) || !TREE_SKILLS[id]) ? null : id));
  if (back) rules.later(1, () => screen.toast(`すべての武器が新しい武器ツリーになりました。旧ツリーの ${back} ポイントを返しました`, '#ffd84a'));
  if (state.params.has('prof')) {
    const wk = state.char.eq.weapon?.kind || DEFAULT_WEAPON, p = profOf(state.char, wk);
    p.lv = clamp(Math.round(+state.params.get('prof')) || 1, 1, 20); p.xp = 0;
    state.char.profBest = Math.max(state.char.profBest || 0, p.lv);
  }
}
