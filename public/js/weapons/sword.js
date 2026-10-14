// 片手剣の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

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

// ---- 片手剣のスキル（Q/E）。run(c) の c.wt() で振ったレベルと分岐を読む ----
const skills = {
  sw_aircut: {
    name: '空裂斬', kind: 'sword', cd: 9.6, motion: 'sword_aircut', duration: T.sword_aircut.duration,
    motionOf: (W) => (W.br('sw_aircut') === 'A' ? 'sw_aircut_fan' : 'sword_aircut'),
    cdOf: (W) => (W.lv('sw_aircut') >= 2 ? 9.6 * 0.85 : 9.6),
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_aircut') >= 2 ? 3.6 : 2.8, b = W.br('sw_aircut');
      at(c, b === 'A' ? TREE_MOTIONS.sw_aircut_fan.hits[0] : T.sword_aircut.hits[0], () => {
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
    name: 'スラントラッシュ', kind: 'sword', cd: 10.8, motion: 'sw_slant', duration: TREE_MOTIONS.sw_slant.duration,
    motionOf: (W) => (W.br('sw_slant') === 'B' ? 'sw_slant_spin' : 'sw_slant'),
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
      if (b === 'B') at(c, TREE_MOTIONS.sw_slant_spin.hits[3], () => { c.circle(c.me.x, c.me.z, 3.6, 2.0, { type: 'tskill' }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.8, 0.35); c.sfx('wave'); });
    },
  },
  sw_side: {
    name: '霞返し', kind: 'sword', cd: 10.8, motion: 'sword_sideturn', duration: T.sword_sideturn.duration,
    motionOf: (W) => (W.br('sw_side') === 'A' ? 'sw_side_long' : 'sword_sideturn'),
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_side') >= 2 ? 4.4 : 3.4, b = W.br('sw_side');
      const sx = c.me.x, sz = c.me.z, side = a + Math.PI / 2, dist = b === 'A' ? 6 : 3;
      c.dash(side, dist, b === 'A' ? 0.3 : 0.22, b === 'A' ? 0.35 : 0.25); c.me.a = a;
      if (b === 'A') at(c, 0.15, () => c.line(dist, 1.8, 1.2, { type: 'tskill', a: side, sx, sz }));
      at(c, b === 'A' ? TREE_MOTIONS.sw_side_long.hits[0] : T.sword_sideturn.hits[0], () => {
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
    name: 'ブレイブハート', kind: 'sword', cd: 21.6, motion: 'sw_brave', duration: TREE_MOTIONS.sw_brave.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_brave') >= 2;
      at(c, TREE_MOTIONS.sw_brave.hits[0], () => c.buff('sw_brave', 'ブレイブハート', lv2 ? 10 : 8, { atkp: lv2 ? 28 : 20, crit: 15 }, 0xffb040));
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
  if (st.ks1 === 'sw_mage') mods.normp = (mods.normp || 0) - 10;
  if (br('sw_light') === 'B') mods.dodgecd = (mods.dodgecd || 0) + 20;
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['sword_'], slots: ['slant', 'brave', 'sword_parry', 'sword_aircut', 'sword_sideturn', 'sword_dance'] };

export default { wk: 'sword', tree: SWORD, skills, mods, legacy };
