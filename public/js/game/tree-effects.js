import { WEAPONS, DEFAULT_WEAPON } from '../../shared/data.js';
import { TREE_SKILLS } from '../skills.js';
import { WT_NODE, WT_RESET_COST, gainProf, hasWTree, profLevel, profOf, wtChoose, wtLearn, wtOf, wtReset, wtSpent, WT_LEGACY } from '../weapon-tree.js';
import { clamp, now } from './util.js';
import { floatText, toast } from './ui-bridge.js';
import { char, params, saveChar } from './save.js';
import { audio, fx } from './render.js';
import { me } from './state.js';
import { S, calcStats } from './stats.js';
import { aimAngle, later } from './combat.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';

// ======================================================================
// 武器ツリー（weapon-tree.js）の効果の入り口と、共通の道具（クールタイム短縮・静かなバフ・熟練度・振り直し）
// ======================================================================
export const ATK_TYPES = ['normal', 'heavy', 'wskill', 'tskill'];
export function quietBuff(id, label, sec, mods, color) {
  me.buffs = me.buffs.filter((b) => b.id !== id);
  me.buffs.push({ id, label, t: sec, max: sec, mods, color });
}
export function cutCds(sec) { me.wsCd -= sec; for (const k in me.tcd) me.tcd[k] -= sec; }
// 武器ツリーの効果の入り口（中身は game/weapons/*.js が weapon-fx.js に登録する）
export function wtDmgMult(o, mb, crit) {
  const W = S.wt;
  if (!W || o.type === 'dot') return 1;
  let k = fxReduce('dmgMult', 1, W, o, mb, crit);
  if (me.afterJust && ATK_TYPES.includes(o.type)) { me.afterJust = false; k *= 1.5; } // 後の先・影渡り: 次の1撃 +50%
  return fxReduce('dmgMultLast', k, W, o, mb, crit);
}
export function wtOnHit(mb, dmg, crit, o, mult) {
  if (o.type === 'dot' || o.type === 'proc' || o.wtNo) return;
  fxCall('onHit', mb, dmg, crit, o, mult);
}
// スキルを使った後（free: 幻剣のもう1回）
export function wtAfterCast(id, free = false) {
  const W = S.wt;
  if (!W) return;
  fxCall('afterCast', id, free);
  fxCall('afterCastLate', id, free);
}
export const phantomReady = (id) => fxSome('phantomReady', id);
export function skillCd(id) {
  const sk = TREE_SKILLS[id];
  return (sk.cdOf && S.wt ? sk.cdOf(S.wt) : sk.cd) * (1 - S.cdr / 100);
}
// 攻撃を受けた（受け流し・溜め中の効果・被弾の効果）。受け流せたら、ほかの効果は起きない
export function wtOnHurt(guarded) {
  fxCall('onHurtFirst');
  if (fxSome('parry')) return;
  if (me.charging) fxCall('onHurtCharging');
  if (guarded) return;
  fxCall('onHurt');
}
// ガードで受けた
export function wtOnGuard(raw, src) {
  const W = S.wt;
  if (!W) return;
  fxCall('onGuard', raw, src);
}
// 被ダメージ軽減（武器ツリーの分）
export const wtDr = () => fxReduce('dr', 0);
// 会心率の上乗せ（武器ツリーの分）
export const wtCritAdd = (o) => fxReduce('critAdd', 0, o);
// 強攻撃の押し始め: 居合・踏み込み溜めで、溜めた状態から始める
export function wtChargeStart() {
  if (!S?.wt) return;
  if (fxSome('chargeStart')) return; // 竜翔: 溜めなしでもう一度跳ぶ など
  if (me.iaiReady) { me.iaiReady = false; me.chargeT = S.chargeMax; floatText(me.x, 3, me.z, fxReduce('iaiLabel', '居合'), 'just'); }
  else if (me.primeCharge > 0) { me.chargeT = S.chargeMax * me.primeCharge; me.primeCharge = 0; }
}
// 強攻撃を振ったとき（光波・地割れ など）
export function wtHeavy(lv) {
  const W = S.wt;
  me.lastHeavyLv = lv; me.lastHeavyT = now(); me.eyeCharge = false;
  if (!W) return;
  fxCall('heavy', lv, aimAngle());
}
// 武器ツリーの状態を、体と武器のまわりの光で見せる（中身は各武器の aura）
export const wtAuraAcc = { mom: 0, saint: 0, rev: 0, thunder: 0, soar: 0, bers: 0 };
// 1秒あたり rate 個の割合で粒を出す（フレームの速さに左右されない）
export function wtEmit(key, rate, dt, fn) { wtAuraAcc[key] = (wtAuraAcc[key] || 0) + rate * dt; while (wtAuraAcc[key] >= 1) { wtAuraAcc[key]--; fn(); } }
export function wtAura(dt) {
  const W = S?.wt;
  if (!W || me.dead || me.crawl || !me.model) return;
  fxCall('aura', dt, W);
}
// 熟練度: 今の武器で経験値を得ると上がる
export function gainWeaponProf(n) {
  const wk = S?.wk || char.eq.weapon?.kind || DEFAULT_WEAPON;
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
  fxCall('treeReset'); // 勢い・報復の蓄え・狙い澄まし などを戻す
  audio.sfx('ui');
  toast(`${WEAPONS[wk].name}のツリーを振り直しました（-${cost}G）`, '#9fe');
  calcStats(); saveChar();
}
// 旧ツリー（武器の枝）に振っていたポイントは返し、なくなった旧スキルはスロットから外す（一覧は各武器の legacy）。?prof=N でいまの武器の熟練度を決められる（確認用）
export function migrateWeaponTrees() {
  char.prof = char.prof || {}; char.wt = char.wt || {};
  let back = 0;
  for (const id of Object.keys(char.tree)) if (WT_LEGACY.prefixes.some((p) => id.startsWith(p))) { back += char.tree[id]; delete char.tree[id]; }
  const gone = WT_LEGACY.slots;
  char.slots = char.slots.map((id) => (id && (gone.includes(id) || !TREE_SKILLS[id]) ? null : id));
  if (back) later(1, () => toast(`すべての武器が新しい武器ツリーになりました。旧ツリーの ${back} ポイントを返しました`, '#ffd84a'));
  if (params.has('prof')) {
    const wk = char.eq.weapon?.kind || DEFAULT_WEAPON, p = profOf(char, wk);
    p.lv = clamp(Math.round(+params.get('prof')) || 1, 1, 20); p.xp = 0;
    char.profBest = Math.max(char.profBest || 0, p.lv);
  }
}
