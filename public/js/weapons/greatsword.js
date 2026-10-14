// 大剣の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at, slashAt } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

export const LIGHT_COLOR = 0xa8e4ff;
// 大剣: 「重い一撃」と「光波」と「受け」。クラスは 光波 / 一撃 / カウンター
const GREATSWORD = {
  name: '大剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'gt_rising', icon: '⤒', name: '払い上げ', base: '下から斬り上げる。ボスを大きく崩す', lv: ['威力420%', '威力520%', L3], tags: [],
        A: { name: '返し斬り', desc: 'すぐにもう一度振り下ろす（200%）' }, B: { name: '崩し上げ', desc: '崩す力（スタン値）が2倍' } },
      { id: 'gt_broad', icon: '⟷', name: '横一文字', base: '前方を広く薙ぎ払う', lv: ['威力420%', '威力530%', L3], tags: [],
        A: { name: '大薙ぎ', desc: '届く範囲がもっと広くなる' }, B: { name: '光の一文字', desc: '光波も飛ぶ（150%）', tags: ['light'] } },
      { id: 'gt_recoil', icon: '☾', name: '退き兜割り', base: '少し退いて、光波を放つ', lv: ['威力500%', '威力640%', L3], tags: ['light'],
        A: { name: '双波', desc: '光波が2発になる（各70%）' }, B: { name: '大光波', desc: '大きく、遠くまで届く（+15%）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'gt_charge', icon: '◎', name: '溜めの心得', base: '強攻撃のダメージ', lv: ['+15%', '+25%', L3], tags: ['charge'], mods: [{ heavyp: 15 }, { heavyp: 25 }],
        A: { name: '速溜め', desc: '溜めにかかる時間 -20%' }, B: { name: '振り抜き', desc: '最大まで溜めた強攻撃の範囲 +20%' } },
      { id: 'gt_armor', icon: '⛉', name: '剛体', base: '溜めている間の守り', lv: ['ひるまない', 'ひるまない・被ダメージ-15%', L3], tags: ['recv', 'charge'],
        A: { name: '鋼', desc: '溜めている間に攻撃を受けると、溜めが進む' }, B: { name: '踏ん張り', desc: '溜めている間は吹き飛ばされず、被ダメージがさらに -10%' } },
      { id: 'gt_moon', icon: '☽', name: '月の残滓', base: '強攻撃を振ると、小さな光波も飛ぶ', lv: ['威力50%', '威力80%', L3], tags: ['light'],
        A: { name: '双月', desc: '小さな光波が2発になる' }, B: { name: '残月', desc: 'この光波でもボスを崩せる' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'gt_wave', icon: '☾', name: '光波', desc: '強攻撃を振ると光波も飛ぶ（溜め1段目は100%、最大まで溜めると200%の大きな光波）。その代わり、剣そのものの強攻撃は -15%', tags: ['light', 'charge'] },
      { id: 'gt_blow', icon: '⚒', name: '一撃', desc: '最大まで溜めた強攻撃 +40%、溜めている間は被ダメージ -30%。その代わり、溜めにかかる時間が +25%', tags: ['charge', 'recv'] },
      { id: 'gt_counter', icon: '⚔', name: 'カウンター', desc: '強攻撃を押した直後（0.35秒）に攻撃を受けると、無傷で受け流して反撃する（350%）', tags: ['recv'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'gt_break', icon: '✸', name: '崩しの極意', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: [], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '崩れ打ち', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '崩しの波', desc: '光波でもボスを大きく崩せる', tags: ['light'] } },
      { id: 'gt_eye', icon: '◉', name: '見切り眼', base: 'JUST回避・受け流しのあと3秒間、ダメージアップ（6秒に1回まで）', lv: ['+15%', '+25%', L3], tags: ['recv'],
        A: { name: '研ぎ澄まし', desc: '次の強攻撃の溜めが2倍速', tags: ['charge'] }, B: { name: '返し刃', desc: '発動したとき、スキルのクールタイム -2秒' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'gt_guillo', icon: '⇓', name: '断頭落とし', base: '狭い前方へ振り下ろす。ボスを大きく崩す', lv: ['威力650%', '威力800%', L3], tags: [],
        A: { name: '処断', desc: 'HPが30%以下の敵には2倍' }, B: { name: '地走り', desc: '振り下ろしたあと、前へ衝撃が走る（200%）' } },
      { id: 'gt_slam', icon: '⤓', name: 'グランド・スラム', base: '跳んで叩きつける（広い範囲）', lv: ['威力520%', '威力650%', L3], tags: [],
        A: { name: '隕鉄', desc: '範囲 +50%' }, B: { name: '踏み込み溜め', desc: '着地したあとの強攻撃は、溜めが半分から始まる', tags: ['charge'] } },
      { id: 'gt_siege', icon: '♜', name: '破城の構え', base: 'ボスを崩す力 +80%・移動が少し遅くなる', lv: ['5秒間・強攻撃+30%', '7秒間・強攻撃+45%', L3], tags: ['charge'],
        A: { name: '不動の構え', desc: '効果中はひるまず、被ダメージ -20%', tags: ['recv'] }, B: { name: '月光の構え', desc: '効果中、強攻撃から光波も飛ぶ（120%）', tags: ['light'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'gt_fullmoon', from: 'gt_wave', icon: '○', name: '満月', desc: '最大まで溜めた光波が特大になる（×1.75）', tags: ['light'] },
      { id: 'gt_eclipse', from: 'gt_wave', icon: '●', name: '月蝕', desc: '光波が敵に当たると爆ぜて、周りも巻き込む（150%）', tags: ['light'] },
      { id: 'gt_judge', from: 'gt_blow', icon: '⚖', name: '断罪', desc: '最大まで溜めた強攻撃の会心率 +35%', tags: ['charge'] },
      { id: 'gt_unyield', from: 'gt_blow', icon: '⛰', name: '不屈', desc: '溜めている間に攻撃を受けると、溜めが一気に最大になる', tags: ['charge', 'recv'] },
      { id: 'gt_iai', from: 'gt_counter', icon: '⚡', name: '居合', desc: '反撃のあと、次の強攻撃は溜めなしで最大まで溜めた一撃になる', tags: ['charge', 'recv'] },
      { id: 'gt_mirror', from: 'gt_counter', icon: '◇', name: '明鏡', desc: '反撃に成功すると、5秒間ダメージ +30%', tags: ['recv'] },
    ] },
  ],
};

// ---- 大剣のスキル（Q/E） ----
const skills = {
  gt_rising: {
    name: '払い上げ', kind: 'greatsword', cd: 10.8, motion: 'gs_rising', duration: T.gs_rising.duration,
    motionOf: (W) => (W.br('gt_rising') === 'A' ? 'gt_rising_twin' : 'gs_rising'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_rising') >= 2 ? 5.2 : 4.2, b = W.br('gt_rising');
      at(c, T.gs_rising.hits[0], () => slashAt(c, a, 3.7, 100, m, { stun: b === 'B' ? 36 : 18 }));
      if (b === 'A') at(c, TREE_MOTIONS.gt_rising_twin.hits[1], () => { slashAt(c, a, 3.4, 80, 2.0, { stun: 5 }); c.shake(0.3); });
    },
  },
  gt_broad: {
    name: '横一文字', kind: 'greatsword', cd: 12, motion: 'gs_broad', duration: T.gs_broad.duration,
    motionOf: (W) => (W.br('gt_broad') === 'A' ? 'gt_broad_wide' : 'gs_broad'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_broad') >= 2 ? 5.3 : 4.2, b = W.br('gt_broad');
      at(c, T.gs_broad.hits[0], () => {
        if (b === 'A') slashAt(c, a, 5.6, 300, m, { stun: 8 }); else slashAt(c, a, 4.7, 230, m, { stun: 8 });
        if (b === 'B') c.proj({ a, mult: 1.5, speed: 22, life: 0.6, rad: 1.6, type: 'tskill', color: LIGHT_COLOR });
      });
    },
  },
  gt_recoil: {
    name: '退き兜割り', kind: 'greatsword', cd: 13.2, motion: 'gs_recoil', duration: T.gs_recoil.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_recoil') >= 2 ? 6.4 : 5.0, b = W.br('gt_recoil');
      c.dash(a + Math.PI, 2, 0.18, 0); c.me.a = a;
      at(c, T.gs_recoil.hits[0], () => {
        if (b === 'A') for (const d of [-0.18, 0.18]) c.proj({ a: a + d, mult: m * 0.7, speed: 21, life: 0.45, rad: 1.3, type: 'tskill', color: LIGHT_COLOR });
        else if (b === 'B') c.proj({ a, mult: m * 1.15, speed: 23, life: 0.65, rad: 2.1, type: 'tskill', color: LIGHT_COLOR });
        else c.proj({ a, mult: m, speed: 21, life: 0.42, rad: 1.3, type: 'tskill', color: LIGHT_COLOR });
        c.sfx('heavy');
      });
    },
  },
  gt_guillo: {
    name: '断頭落とし', kind: 'greatsword', cd: 14.4, motion: 'gs_guillotine', duration: T.gs_guillotine.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_guillo') >= 2 ? 8.0 : 6.5, b = W.br('gt_guillo');
      at(c, T.gs_guillotine.hits[0], () => {
        c.line(4.5, 1.8, m, { type: 'tskill', a, stun: 22, exec: b === 'A' ? 2 : 0 });
        c.fx.slash(c.me.x, c.me.z, a, 4.5, 50, c.col(), 2.2); c.shake(0.5); c.sfx('impact');
        if (b === 'B') {
          const sx = c.me.x + Math.sin(a) * 4, sz = c.me.z + Math.cos(a) * 4;
          at(c, 0.15, () => {
            c.line(6, 2.2, 2.0, { type: 'tskill', a, sx, sz, stun: 4 });
            for (let d = 0; d < 6; d += 0.6) c.fx.parts.burst(sx + Math.sin(a) * d, 0.3, sz + Math.cos(a) * d, 6, { color: 0xc8b090, speed: 5, size: 0.5, life: 0.4, up: 2 });
          });
        }
      });
    },
  },
  gt_slam: {
    name: 'グランド・スラム', kind: 'greatsword', cd: 12, motion: 'gt_slam', duration: TREE_MOTIONS.gt_slam.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_slam') >= 2 ? 6.5 : 5.2, b = W.br('gt_slam'), r = b === 'A' ? 7.2 : 4.8;
      c.dash(a, 6, 0.35, 0.45);
      at(c, TREE_MOTIONS.gt_slam.hits[0], () => {
        c.circle(c.me.x, c.me.z, r, m, { type: 'tskill', stun: 8 });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), r + 1.2, 0.45);
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xc8b090, speed: 9, size: 0.6, life: 0.7, up: 2 });
        c.sfx('heavy'); c.shake(0.6);
        if (b === 'B') c.primeCharge(0.5);
      });
    },
  },
  gt_siege: {
    name: '破城の構え', kind: 'greatsword', cd: 22.8, motion: 'gs_siege', duration: T.gs_siege.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('gt_siege') >= 2;
      at(c, T.gs_siege.hits[0], () => { c.buff('gt_siege', '破城の構え', lv2 ? 7 : 5, { heavyp: lv2 ? 45 : 30, stunp: 80, move: -25 }, c.col()); c.fx.ringWave(c.me.x, c.me.z, c.col(), 2.6, 0.35); });
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['greatsword_', 'gs_'], slots: ['gslam', 'fortress', 'gs_guillotine', 'gs_rising', 'gs_broad', 'gs_recoil', 'gs_siege'] };

export default { wk: 'greatsword', tree: GREATSWORD, skills, mods, legacy };
