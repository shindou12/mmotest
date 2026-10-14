// 武器ツリー（新）: 武器熟練度でポイントを得て、その武器を持っているときだけ効く
//
// - 熟練度は、その武器を装備して経験値を得ると上がる（最大20）。熟練度1つにつき1ポイント
// - ほかの武器も「過去の最大熟練度の半分」から始まる
// - 段は熟練度 1 / 3 / 6 / 9 / 12 / 16 で開く
// - スキル・パッシブは3lvまで。lv1 は「ある無しが大きい」、lv2 は「伸びが感じられる」、
//   lv3 は lv2 の数値のまま A/B どちらかの形に変わる
// - クラス（3つから1つ）・マスター（クラスごとに2つから1つ）は1ポイント。強化・分岐なし（コード上は ks1 / ks2）
// 全武器の武器ツリーの仕組み（熟練度・振り分け・効果のまとめ）。武器ごとの中身は weapons/ の各ファイル
import { xpToNext } from '../shared/data.js';
import { WEAPON_DEFS } from './weapons/index.js';

export const PROF_MAX = 20;
export const ROW_REQ = [1, 3, 6, 9, 12, 16];
export const profNeed = (lv) => xpToNext(2 * lv + 1);
export const WT_RESET_COST = (spent) => 100 + spent * 20;

// tags: 共通の要素（画面の絞り込み用）
export const WT_TAGS = {
  wave: { name: '斬撃波', icon: '〰' }, cd: { name: 'クールタイム', icon: '⟲' }, crit: { name: '会心', icon: '✦' },
  dodge: { name: '回避', icon: '➶' }, hurt: { name: '被弾', icon: '⛨' },
  charge: { name: '溜め', icon: '◎' }, light: { name: '光波', icon: '☾' }, recv: { name: '受け', icon: '⛉' },
  poison: { name: '毒', icon: '☠' }, move: { name: '機動', icon: '»' },
  shield: { name: '盾', icon: '⛉' }, thrust: { name: '突き', icon: '➹' }, break: { name: '崩し', icon: '✸' },
  blood: { name: '血', icon: '♥' }, throw: { name: '投擲', icon: '⟳' }, zone: { name: '射程', icon: '◎' }, trap: { name: '罠', icon: '⌖' },
};

// 武器ごとのツリー・スキル・追加の能力値は weapons/ の各ファイル（登録は weapons/index.js）
const DEFS = Object.fromEntries(WEAPON_DEFS.map((d) => [d.wk, d]));
export const WTREES = Object.fromEntries(WEAPON_DEFS.map((d) => [d.wk, d.tree]));
export const WT_NODE = {};
for (const [wk, T] of Object.entries(WTREES)) T.rows.forEach((r, ri) => r.nodes.forEach((n) => { WT_NODE[n.id] = { ...n, wk, row: ri, kind: r.kind, req: ROW_REQ[ri] }; }));
export const hasWTree = (wk) => !!WTREES[wk];

// ---- 熟練度 ----
export function profOf(char, wk) {
  char.prof = char.prof || {};
  return char.prof[wk] || (char.prof[wk] = { lv: 1, xp: 0 });
}
// 実際の熟練度: 自分の熟練度と「過去の最大熟練度の半分」の高いほう
export const profLevel = (char, wk) => Math.min(PROF_MAX, Math.max(profOf(char, wk).lv, Math.floor((char.profBest || 0) / 2), 1));
// 経験値を足す。上がった熟練度の配列を返す
export function gainProf(char, wk, n) {
  const p = profOf(char, wk), ups = [];
  if (p.lv < profLevel(char, wk)) p.lv = profLevel(char, wk); // 引き継ぎ分から積み上げる
  if (p.lv >= PROF_MAX) return ups;
  p.xp += n;
  while (p.lv < PROF_MAX && p.xp >= profNeed(p.lv)) { p.xp -= profNeed(p.lv); p.lv++; ups.push(p.lv); }
  if (p.lv >= PROF_MAX) p.xp = 0;
  char.profBest = Math.max(char.profBest || 0, p.lv);
  return ups;
}

// ---- 振り分け ----
export function wtOf(char, wk) {
  char.wt = char.wt || {};
  return char.wt[wk] || (char.wt[wk] = { lv: {}, br: {}, ks1: null, ks2: null });
}
export const wtSpent = (st) => Object.values(st.lv).reduce((a, b) => a + b, 0) + (st.ks1 ? 1 : 0) + (st.ks2 ? 1 : 0);
export const wtLeft = (char, wk) => profLevel(char, wk) - wtSpent(wtOf(char, wk));
export function wtCanLearn(char, id) {
  const n = WT_NODE[id];
  if (!n) return false;
  const st = wtOf(char, n.wk);
  if (profLevel(char, n.wk) < n.req || wtLeft(char, n.wk) <= 0) return false;
  if (n.kind === 'ks1') return !st.ks1;
  if (n.kind === 'ks2') return !st.ks2 && st.ks1 === n.from;
  return (st.lv[id] || 0) < 3;
}
export function wtLearn(char, id) {
  if (!wtCanLearn(char, id)) return false;
  const n = WT_NODE[id], st = wtOf(char, n.wk);
  if (n.kind === 'ks1' || n.kind === 'ks2') st[n.kind] = id;
  else st.lv[id] = (st.lv[id] || 0) + 1;
  return true;
}
export function wtChoose(char, id, b) {
  const n = WT_NODE[id];
  if (!n || (b !== 'A' && b !== 'B')) return false;
  const st = wtOf(char, n.wk);
  if (st.lv[id] !== 3 || st.br[id]) return false;
  st.br[id] = b;
  return true;
}
export function wtReset(char, wk) { char.wt[wk] = { lv: {}, br: {}, ks1: null, ks2: null }; }

// 今の武器のツリーの効果。武器ツリーがない武器は null
export function wtEffects(char, wk) {
  if (!hasWTree(wk)) return null;
  const st = wtOf(char, wk);
  const mods = {}, actives = new Set();
  const lv = (id) => st.lv[id] || 0, br = (id) => (st.lv[id] === 3 ? st.br[id] || null : null);
  const v = (id, k) => (lv(id) ? WT_NODE[id][k][Math.min(2, lv(id)) - 1] : 0);
  for (const id of Object.keys(st.lv)) {
    const n = WT_NODE[id];
    if (!n || !st.lv[id]) continue;
    if (n.kind === 'skill') actives.add(id);
    if (n.mods) for (const [k, x] of Object.entries(n.mods[Math.min(2, st.lv[id]) - 1])) mods[k] = (mods[k] || 0) + x;
  }
  DEFS[wk].mods(st, br, mods);
  return { st, lv, br, v, ks1: st.ks1, ks2: st.ks2, mods, actives, has: (id) => st.ks1 === id || st.ks2 === id };
}

// スキル（Q/E）: 全武器のスキルをまとめる（skills.js の TREE_SKILLS に入る）
export const WT_SKILLS = Object.assign({}, ...WEAPON_DEFS.map((d) => d.skills));
export { LIGHT_COLOR } from './weapons/greatsword.js';
export { KNIFE_COLOR } from './weapons/dagger.js';
for (const [id, s] of Object.entries(WT_SKILLS)) s.desc = WT_NODE[id].base;
