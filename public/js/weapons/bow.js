// 弓の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at, spOff } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

// 弓: 「射程」「手数」「罠」。クラスは 狙撃手（最大まで引く）/ 連射（通常攻撃）/ 罠師（回避で罠）
// 弓を引くと射程の円が広がる仕組み（最大射程・弓を引く速さ）は弓そのものの特性
const BOW = {
  name: '弓',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'bw_double', icon: '⇉', name: '二段射ち', base: '二本を時間差で放つ（2本目は倍の威力）', lv: ['90%→180%', '115%→230%', L3], tags: ['zone'],
        A: { name: '三段', desc: '3本目も放つ（120%）' }, B: { name: '貫き', desc: '2本目が敵を貫通する' } },
      { id: 'bw_tether', icon: '⊸', name: '足留め矢', base: '当たったボス以外の敵の足を4秒遅くする', lv: ['威力160%', '威力210%', L3], tags: ['zone'],
        A: { name: '拡散', desc: '当たった敵の周り3mにも足留め（50%）' }, B: { name: '狙い印', desc: '当てると5秒間、ダメージ +15%' } },
      { id: 'bw_back', icon: '↶', name: 'バックショット', base: '後ろへ跳びながら3本放つ（跳んでいる間は無敵）', lv: ['各100%', '各125%', L3], tags: ['dodge'],
        A: { name: '扇撃ち', desc: '5本を扇に放つ（各80%）' }, B: { name: '影走り', desc: '跳んだあと2秒間、弓を引く速さ2倍', tags: ['charge'] } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'bw_zone', icon: '◎', name: '遠見の心得', base: '最大射程', lv: ['+3m', '+5m', L3], tags: ['zone'], rng: [3, 5],
        A: { name: '張り弦', desc: '引かずに撃つ矢の射程 +4m' }, B: { name: '遠矢', desc: '射程の端（8割より先）で当たった矢のダメージ +20%' } },
      { id: 'bw_draw', icon: '◉', name: '弓引きの心得', base: '強攻撃のダメージ', lv: ['+15%', '+25%', L3], tags: ['charge'], mods: [{ heavyp: 15 }, { heavyp: 25 }],
        A: { name: '速引き', desc: '弓を引く速さ +30%' }, B: { name: '重矢', desc: '強攻撃の矢が太くなり、ボスを崩す力 +50%' } },
      { id: 'bw_roll', icon: '➶', name: '身のこなし', base: '回避のクールタイム', lv: ['-10%', '-18%', L3], tags: ['dodge'], mods: [{ dodgecd: 10 }, { dodgecd: 18 }],
        A: { name: '受け身引き', desc: '回避のあと1秒間、弓を引く速さ2倍', tags: ['charge'] }, B: { name: 'すり抜け', desc: '回避の無敵時間 +0.1秒' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'bw_sniper', icon: '◎', name: '狙撃手', desc: '最大まで引いた矢は必ず会心になる', tags: ['charge', 'crit'] },
      { id: 'bw_rapid', icon: '⇶', name: '連射', desc: '通常攻撃で矢を2本ずつ放つ（各75%）', tags: ['zone'] },
      { id: 'bw_trapper', icon: '⌖', name: '罠師', desc: '回避すると、その場に罠を置く（2秒に1回・同時に2つまで）。踏んだ敵に200%、ボス以外の足を遅くする', tags: ['trap', 'dodge'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'bw_crit', icon: '✦', name: '急所の心得', base: '会心率', lv: ['+5%', '+8%', L3], tags: ['crit'], mods: [{ crit: 5 }, { crit: 8 }],
        A: { name: '急所射ち', desc: '最大まで引いた矢の会心率 +15%', tags: ['charge'] }, B: { name: '致命', desc: '会心ダメージ +25%' } },
      { id: 'bw_quiver', icon: '⟲', name: '矢筒の心得', base: 'スキルのクールタイム', lv: ['-8%', '-12%', L3], tags: ['cd'], mods: [{ cdr: 8 }, { cdr: 12 }],
        A: { name: '鋭矢', desc: 'スキルの矢の会心率 +15%', tags: ['crit'] }, B: { name: '余勢', desc: 'スキルを使ったあと2秒間、攻撃の速さ +25%' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'bw_trap', icon: '⌖', name: '置き矢', base: '8m以内に罠を置く（5秒）。踏んだ敵に大ダメージ、ボス以外の足を遅くする', lv: ['威力260%', '威力330%', L3], tags: ['trap'],
        A: { name: '三つ罠', desc: '罠を3つ並べて置く（各60%）' }, B: { name: '大罠', desc: '範囲 +50%・ボスを大きく崩す' } },
      { id: 'bw_chime', icon: '◌', name: '弦鳴り', base: '弦を弾き、周り3mに衝撃。ボス以外を押し戻す', lv: ['威力140%', '威力180%', L3], tags: [],
        A: { name: '残響', desc: '0.6秒後にもう一度鳴る（100%）' }, B: { name: '跳び退き', desc: '鳴らしたあと後ろへ4m跳ぶ（無敵）', tags: ['dodge'] } },
      { id: 'bw_side', icon: '⇋', name: '跳弦射撃', base: '左へ3.5m跳び、二本の矢を放つ（跳んでいる間は無敵）', lv: ['各120%', '各150%', L3], tags: ['dodge'],
        A: { name: '三連', desc: '3本放つ' }, B: { name: '回り込み', desc: '跳ぶ距離 +50%・最初の1本は必ず会心', tags: ['crit'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'bw_hawk', from: 'bw_sniper', icon: '⚡', name: '鷹の目', desc: '最大まで引いた矢が当たると、次の強攻撃は引かずに最大になる（8秒に1回）', tags: ['charge', 'zone'] },
      { id: 'bw_aim', from: 'bw_sniper', icon: '◎', name: '狙い澄まし', desc: '最大まで引いた矢を続けて当てると、1回ごとに威力 +10%（最大 +30%）。外すと戻る', tags: ['charge', 'zone'] },
      { id: 'bw_storm', from: 'bw_rapid', icon: '☔', name: '矢嵐', desc: '通常攻撃を5回放つごとに、狙った場所へ矢の雨が降る（5本・各50%）', tags: ['zone'] },
      { id: 'bw_quick', from: 'bw_rapid', icon: '»', name: '速射', desc: '回避のあと1.5秒間、攻撃の速さ +40%', tags: ['dodge'] },
      { id: 'bw_shot', from: 'bw_trapper', icon: '✸', name: '射抜き', desc: '自分の罠を矢で射抜くと大爆発する（350%・半径3.5m）', tags: ['trap'] },
      { id: 'bw_lure', from: 'bw_trapper', icon: '⌖', name: '罠の名手', desc: '罠を同時に4つまで置ける。罠の威力 +30%・ボスを大きく崩す', tags: ['trap'] },
    ] },
  ],
};

// ---- 弓のスキル（Q/E）。足留め・罠・押し戻しは技と同じ（tech: bow_tether / bow_trap / bow_chime）をサーバーで使う ----
const skills = {
  bw_double: {
    name: '二段射ち', kind: 'bow', cd: 9.6, motion: 'bow_double', duration: T.bow_double.duration,
    motionOf: (W) => (W.br('bw_double') === 'A' ? 'bw_double_tri' : 'bow_double'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_double') >= 2 ? 1.15 : 0.9, b = W.br('bw_double'), H = b === 'A' ? TREE_MOTIONS.bw_double_tri.hits : T.bow_double.hits;
      at(c, H[0], () => c.arrow({ a, mult: m, type: 'tskill' }));
      at(c, H[1], () => c.arrow({ a, mult: m * 2, type: 'tskill', big: true, pierce: b === 'B' }));
      if (b === 'A') at(c, H[2], () => c.arrow({ a, mult: 1.2, type: 'tskill' }));
    },
  },
  bw_tether: {
    name: '足留め矢', kind: 'bow', cd: 12, motion: 'bow_tether', duration: T.bow_tether.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_tether') >= 2 ? 2.1 : 1.6, b = W.br('bw_tether');
      at(c, T.bow_tether.hits[0], () => c.arrow({ a, mult: m, type: 'tskill', tech: 'bow_tether', color: 0x85d9ff, onHit: b ? (mb) => {
        if (b === 'A') { c.circle(mb.x, mb.z, 3, m * 0.5, { type: 'tskill', tech: 'bow_tether', noProc: true, skip: mb }); c.fx.ringWave(mb.x, mb.z, 0x85d9ff, 3.2, 0.35); }
        if (b === 'B') c.buff('bw_mark', '狙い印', 5, { dmgp: 15 }, 0xffd84a);
      } : null }));
    },
  },
  bw_back: {
    name: 'バックショット', kind: 'bow', cd: 9.6, motion: 'bw_back', duration: TREE_MOTIONS.bw_back.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_back') >= 2 ? 1.25 : 1.0, b = W.br('bw_back');
      c.dash(a + Math.PI, 5, 0.22, 0.3); c.me.a = a;
      const spread = b === 'A' ? [-0.24, -0.12, 0, 0.12, 0.24] : [-0.1, 0, 0.1];
      at(c, TREE_MOTIONS.bw_back.hits[0], () => { for (const d of spread) c.arrow({ a: a + d, mult: m * (b === 'A' ? 0.8 : 1), type: 'tskill' }); });
      if (b === 'B') c.buff('bw_shadow', '影走り', 2.2, { chargeRate: 100 }, 0x9ae8ff);
    },
  },
  bw_trap: {
    name: '置き矢', kind: 'bow', cd: 16.8, motion: 'bow_trap', duration: T.bow_trap.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_trap') >= 2 ? 3.3 : 2.6, b = W.br('bw_trap');
      const p = c.point(), d = Math.min(8, Math.hypot(p.x - c.me.x, p.z - c.me.z)), spot = spOff(c.me.x, c.me.z, a, d);
      const spots = b === 'A' ? [spOff(spot.x, spot.z, a + Math.PI / 2, 2.2), spot, spOff(spot.x, spot.z, a - Math.PI / 2, 2.2)] : [spot];
      at(c, T.bow_trap.hits[0], () => { for (const q of spots) c.trap(q.x, q.z, { mult: m * (b === 'A' ? 0.6 : 1), r: b === 'B' ? 2.7 : 1.8, stun: b === 'B' ? 16 : 3, life: 5, arm: 0.2, color: 0x85d9ff }); });
    },
  },
  bw_chime: {
    name: '弦鳴り', kind: 'bow', cd: 15.6, motion: 'bow_chime', duration: T.bow_chime.duration,
    motionOf: (W) => (W.br('bw_chime') === 'B' ? 'bw_chime_leap' : 'bow_chime'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_chime') >= 2 ? 1.8 : 1.4, b = W.br('bw_chime');
      const ring = (mult) => { c.circle(c.me.x, c.me.z, 3, mult, { type: 'tskill', tech: 'bow_chime' }); c.fx.ringWave(c.me.x, c.me.z, 0x85d9ff, 3.2, 0.3); c.sfx('wave'); };
      at(c, T.bow_chime.hits[0], () => ring(m));
      if (b === 'A') at(c, T.bow_chime.hits[0] + 0.6, () => ring(1.0));
      if (b === 'B') at(c, T.bow_chime.hits[0] + 0.05, () => { c.dash(a + Math.PI, 4, 0.22, 0.35); c.me.a = a; });
    },
  },
  bw_side: {
    name: '跳弦射撃', kind: 'bow', cd: 12, motion: 'bow_side', duration: T.bow_side.duration,
    motionOf: (W) => (W.br('bw_side') === 'A' ? 'bw_side_tri' : 'bow_side'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('bw_side') >= 2 ? 1.5 : 1.2, b = W.br('bw_side');
      c.dash(a - Math.PI / 2, b === 'B' ? 5.25 : 3.5, 0.22, 0.3); c.me.a = a;
      const H = b === 'A' ? TREE_MOTIONS.bw_side_tri.hits : T.bow_side.hits, off = b === 'A' ? [-0.05, 0, 0.05] : [-0.035, 0.035];
      H.forEach((h, i) => at(c, h, () => c.arrow({ a: c.aim() + off[i], mult: m, type: 'tskill', crit: (b === 'B' && i === 0) || undefined })));
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['bow_'], slots: ['backshot', 'focus', 'bow_double', 'bow_tether', 'bow_side', 'bow_trap', 'bow_chime'] };

// tab: 武器ツリー画面のタブの並び / glyph: 装備アイコンの文字
export default { wk: 'bow', tab: 6, glyph: '弓', tree: BOW, skills, mods, legacy };
