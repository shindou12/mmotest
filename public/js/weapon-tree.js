// 武器ツリー（新）: 武器熟練度でポイントを得て、その武器を持っているときだけ効く
//
// - 熟練度は、その武器を装備して経験値を得ると上がる（最大20）。熟練度1つにつき1ポイント
// - ほかの武器も「過去の最大熟練度の半分」から始まる
// - 段は熟練度 1 / 3 / 6 / 9 / 12 / 16 で開く
// - スキル・パッシブは3lvまで。lv1 は「ある無しが大きい」、lv2 は「伸びが感じられる」、
//   lv3 は lv2 の数値のまま A/B どちらかの形に変わる
// - クラス（3つから1つ）・マスター（クラスごとに2つから1つ）は1ポイント。強化・分岐なし（コード上は ks1 / ks2）
// 今は片手剣だけ。ほかの武器は旧ツリー（skills.js の TREES）のまま
import { TECHNIQUES } from '../shared/techniques.js';
import { xpToNext } from '../shared/data.js';

export const PROF_MAX = 20;
export const ROW_REQ = [1, 3, 6, 9, 12, 16];
export const profNeed = (lv) => xpToNext(2 * lv + 1);
export const WT_RESET_COST = (spent) => 100 + spent * 20;

const L3 = 'lv2の効果のまま、A・Bどちらかの形に変わる';
// tags: 共通の要素（画面の絞り込み用）
export const WT_TAGS = {
  wave: { name: '斬撃波', icon: '〰' }, cd: { name: 'クールタイム', icon: '⟲' }, crit: { name: '会心', icon: '✦' },
  dodge: { name: '回避', icon: '➶' }, hurt: { name: '被弾', icon: '⛨' },
};

const SWORD = {
  name: '片手剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'sw_aircut', icon: '〰', name: '空裂斬', base: '斬撃波を前へ飛ばす', lv: ['威力280%', '威力360%・CT-15%', L3], tags: ['wave'],
        A: { name: '三日月', desc: '3方向に飛ぶ（各70%）' }, B: { name: '断空', desc: '大きく、遠くまで飛ぶ' } },
      { id: 'sw_parry', icon: '⛨', name: '受け流し', base: '構えている間に受けた攻撃を軽減し、前へ突く', lv: ['0.4秒・軽減70%・突き220%', '0.55秒・軽減80%・突き300%', L3], tags: ['hurt'],
        A: { name: '巡り返し', desc: '受け流せたら、スキルのクールタイムが全部 -3秒', tags: ['cd'] }, B: { name: '奮い立ち', desc: '受け流せたら、5秒間攻撃力 +25%' } },
      { id: 'sw_slant', icon: '⟫', name: 'スラントラッシュ', base: '3回踏み込んで斬る', lv: ['各200%', '各260%', L3], tags: [],
        A: { name: '疾風', desc: '踏み込むたびに斬撃波も飛ぶ（各60%）', tags: ['wave'] }, B: { name: '旋', desc: '最後に周りをまとめて斬る（200%）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sw_norm', icon: '⚔', name: '剣の心得', base: '通常攻撃のダメージ', lv: ['+12%', '+20%', L3], tags: [], mods: [{ normp: 12 }, { normp: 20 }],
        A: { name: '閃光', desc: '3段目が斬撃波になって飛ぶ（120%）', tags: ['wave'] }, B: { name: '血振り', desc: '通常攻撃が当たるたびにHPを0.5%回復（1振り2回まで）' } },
      { id: 'sw_light', icon: '➶', name: '軽身', base: '回避の無敵時間', lv: ['+0.12秒', '+0.2秒', L3], tags: ['dodge'], iframe: [0.12, 0.2],
        A: { name: '後の先', desc: 'JUST回避した後の1撃目のダメージ +50%' }, B: { name: '早足', desc: '回避のクールタイム -20%・回避の距離 +30%' } },
      { id: 'sw_cycle', icon: '⟲', name: '技の巡り', base: '攻撃を当てるとスキルのクールタイムが縮む（1回の攻撃で1回まで）', lv: ['-0.1秒', '-0.15秒', L3], tags: ['cd'], cut: [0.1, 0.15],
        A: { name: '冴え巡り', desc: '会心のときは縮み方が2倍', tags: ['crit'] }, B: { name: '余勢', desc: 'スキルを使った後2秒間、攻撃の速さ +12%' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'sw_mage', icon: '✧', name: '魔剣士', desc: 'スキルを使うと、3秒間は通常攻撃から斬撃波（80%）も飛ぶ。その代わり通常攻撃 -10%', tags: ['wave', 'cd'] },
      { id: 'sw_glad', icon: '♨', name: '剣闘士', desc: '攻撃を当てるたびに「勢い」が1つ溜まる（最大10）。1つにつきダメージ +3%・攻撃の速さ +2%。攻撃を受けるとなくなる', tags: ['hurt'] },
      { id: 'sw_guard', icon: '⛉', name: '守護騎士', desc: '強攻撃を溜めている間は剣で身を守る。守ったあとに離すと、周りをなぎ払う反撃（ガードカウンター）', tags: ['hurt'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sw_edge', icon: '✦', name: '剣の冴え', base: '会心率', lv: ['+6%', '+10%', L3], tags: ['crit'], mods: [{ crit: 6 }, { crit: 10 }],
        A: { name: '残光', desc: '会心のときに小さな斬撃波が出る（50%・0.5秒に1回まで）', tags: ['wave'] }, B: { name: '吸精', desc: '会心のときにHPを1%回復' } },
      { id: 'sw_tough', icon: '⛨', name: '不撓', base: '被ダメージ', lv: ['-6%', '-10%', L3], tags: ['hurt'], mods: [{ def: 6 }, { def: 10 }],
        A: { name: '転じ', desc: '攻撃を受けるたびに、スキルのクールタイム -1秒', tags: ['cd'] }, B: { name: '背水', desc: 'HPが50%以下の間は、被ダメージ -15%・ダメージ +15%' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'sw_side', icon: '↷', name: '霞返し', base: '横へ跳んで斬り返す（移動中無敵）', lv: ['威力340%', '威力440%', L3], tags: ['dodge'],
        A: { name: '霞斬り', desc: '跳ぶ距離が2倍になり、通り抜けた敵も斬る（120%）' }, B: { name: '霞飛ばし', desc: '斬り返しが斬撃波になって飛ぶ', tags: ['wave'] } },
      { id: 'sw_dance', icon: '♪', name: '連撃の構え', base: '攻撃の速さ +15%', lv: ['5秒間・通常攻撃+30%', '7秒間・通常攻撃+40%', L3], tags: [],
        A: { name: '途切れず', desc: '効果中、通常攻撃を当てるたびに効果時間 +0.2秒（最大+4秒）' }, B: { name: '波の構え', desc: '効果中、斬撃波のダメージ +50%', tags: ['wave'] } },
      { id: 'sw_brave', icon: '♥', name: 'ブレイブハート', base: '会心率 +15%', lv: ['8秒間・攻撃力+20%', '10秒間・攻撃力+28%', L3], tags: ['crit'],
        A: { name: '猛り', desc: '効果中に敵を倒すと、効果時間 +2秒' }, B: { name: '速攻', desc: '効果中、スキルのクールタイムの戻りが速い（-30%）', tags: ['cd'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'sw_heaven', from: 'sw_mage', icon: '☼', name: '天剣', desc: '斬撃波が当たるたびに、スキルのクールタイム -0.15秒（1発につき1回）', tags: ['wave', 'cd'] },
      { id: 'sw_phantom', from: 'sw_mage', icon: '◐', name: '幻剣', desc: 'スキルを使った後3秒以内なら、同じスキルをもう1回だけ威力70%・クールタイムなしで使える', tags: ['cd'] },
      { id: 'sw_saint', from: 'sw_glad', icon: '✪', name: '剣聖', desc: '勢いが10になると、3秒間すべての攻撃が会心になる。終わると勢いは0に戻る', tags: ['crit'] },
      { id: 'sw_berserk', from: 'sw_glad', icon: '☠', name: '狂剣士', desc: '攻撃を受けても勢いが減らない。その代わり勢い1つにつき被ダメージ +2%・与えたダメージの1%を回復', tags: ['hurt'] },
      { id: 'sw_paladin', from: 'sw_guard', icon: '✚', name: '聖騎士', desc: 'ガードで受けると、HPを5%回復して周りの敵を引きつける', tags: ['hurt'] },
      { id: 'sw_avenger', from: 'sw_guard', icon: '⚡', name: '報復者', desc: 'ガードで受けたダメージを溜めておき、次の強攻撃・ガードカウンターに上乗せする', tags: ['hurt'] },
    ] },
  ],
};
export const WTREES = { sword: SWORD };
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
  if (st.ks1 === 'sw_mage') mods.normp = (mods.normp || 0) - 10;
  if (br('sw_light') === 'B') mods.dodgecd = (mods.dodgecd || 0) + 20;
  return { st, lv, br, v, ks1: st.ks1, ks2: st.ks2, mods, actives, has: (id) => st.ks1 === id || st.ks2 === id };
}

// ---- 片手剣のスキル（Q/E）。run(c) の c.wt() で振ったレベルと分岐を読む ----
const T = TECHNIQUES;
const at = (c, sec, fn) => c.later(sec, fn);
export const WT_SKILLS = {
  sw_aircut: {
    name: '空裂斬', kind: 'sword', cd: 9.6, motion: 'sword_aircut', duration: T.sword_aircut.duration,
    cdOf: (W) => (W.lv('sw_aircut') >= 2 ? 9.6 * 0.85 : 9.6),
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_aircut') >= 2 ? 3.6 : 2.8, b = W.br('sw_aircut');
      at(c, T.sword_aircut.hits[0], () => {
        if (b === 'A') for (const d of [-0.32, 0, 0.32]) c.proj({ a: a + d, mult: p * 0.7, speed: 24, life: 0.55, rad: 1, type: 'tskill' });
        else if (b === 'B') c.proj({ a, mult: p, speed: 26, life: 0.85, rad: 1.6, type: 'tskill' });
        else c.proj({ a, mult: p, speed: 24, life: 0.55, rad: 1, type: 'tskill' });
        c.fx.slash(c.me.x, c.me.z, a, 3, 100, c.col(), 0.9);
      });
    },
  },
  sw_parry: {
    name: '受け流し', kind: 'sword', cd: 12, motion: 'sword_parry', duration: T.sword_parry.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_parry') >= 2, a = c.aim();
      c.parry(lv2 ? 0.55 : 0.4, lv2 ? 80 : 70);
      at(c, T.sword_parry.hits[0] + (lv2 ? 0.1 : 0), () => {
        c.line(4.3, 1.8, lv2 ? 3.0 : 2.2, { type: 'tskill', a });
        for (let d = 0.7; d < 4.3; d += 0.5) c.fx.parts.emit(c.me.x + Math.sin(a) * d, 1.2, c.me.z + Math.cos(a) * d, { color: c.col(), size: 0.42, life: 0.25, speed: 1, gravity: 0 });
        c.sfx('swing');
      });
    },
  },
  sw_slant: {
    name: 'スラントラッシュ', kind: 'sword', cd: 10.8,
    run(c) {
      const W = c.wt(), each = W.lv('sw_slant') >= 2 ? 2.6 : 2.0, b = W.br('sw_slant');
      for (let i = 0; i < 3; i++) {
        at(c, i * 0.2, () => {
          const a = c.aim();
          c.dash(a, 3, 0.1, 0.15);
          at(c, 0.08, () => {
            c.arc(3.2, 140, each, { type: 'tskill', a }); c.fx.slash(c.me.x, c.me.z, a, 3.2, 140, c.col(), 1.0, i % 2 === 1); c.sfx('swing');
            if (b === 'A') c.proj({ a, mult: 0.6, speed: 24, life: 0.45, rad: 0.9, type: 'tskill' });
          });
        });
      }
      if (b === 'B') at(c, 0.72, () => { c.circle(c.me.x, c.me.z, 3.6, 2.0, { type: 'tskill' }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.8, 0.35); c.sfx('wave'); });
    },
  },
  sw_side: {
    name: '霞返し', kind: 'sword', cd: 10.8, motion: 'sword_sideturn', duration: T.sword_sideturn.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_side') >= 2 ? 4.4 : 3.4, b = W.br('sw_side');
      const sx = c.me.x, sz = c.me.z, side = a + Math.PI / 2, dist = b === 'A' ? 6 : 3;
      c.dash(side, dist, b === 'A' ? 0.3 : 0.22, b === 'A' ? 0.35 : 0.25); c.me.a = a;
      if (b === 'A') at(c, 0.15, () => c.line(dist, 1.8, 1.2, { type: 'tskill', a: side, sx, sz }));
      at(c, T.sword_sideturn.hits[0] + (b === 'A' ? 0.08 : 0), () => {
        if (b === 'B') c.proj({ a, mult: p, speed: 24, life: 0.55, rad: 1.2, type: 'tskill' });
        else c.arc(3.7, 150, p, { type: 'tskill', a });
        c.fx.slash(c.me.x, c.me.z, a, 3.7, 150, c.col(), 1.15); c.sfx('swing');
      });
    },
  },
  sw_dance: {
    name: '連撃の構え', kind: 'sword', cd: 20.4, motion: 'sword_dance', duration: T.sword_dance.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_dance') >= 2;
      at(c, T.sword_dance.hits[0], () => { c.buff('sw_dance', '連撃の構え', lv2 ? 7 : 5, { normp: lv2 ? 40 : 30, aspd: 15 }, c.col()); c.fx.ringWave(c.me.x, c.me.z, c.col(), 2.6, 0.35); });
    },
  },
  sw_brave: {
    name: 'ブレイブハート', kind: 'sword', cd: 21.6,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_brave') >= 2;
      c.buff('sw_brave', 'ブレイブハート', lv2 ? 10 : 8, { atkp: lv2 ? 28 : 20, crit: 15 }, 0xffb040);
    },
  },
};
for (const [id, s] of Object.entries(WT_SKILLS)) s.desc = WT_NODE[id].base;
