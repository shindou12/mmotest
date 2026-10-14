// 短剣の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

export const KNIFE_COLOR = 0xcab4ff;
// 短剣: 「速さ」「急所」「毒」。クラスは 毒刃 / 暗殺 / 連刃
const DAGGER = {
  name: '短剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'dk_flank', icon: '»', name: '抜け駆け', base: '横へすり抜けて斬る（移動中無敵）', lv: ['威力390%', '威力490%', L3], tags: ['move'],
        A: { name: '返し抜け', desc: 'すり抜けた先から、もう一度抜けて斬る（150%）' }, B: { name: '影抜け', desc: 'この斬撃は必ず会心になる', tags: ['crit'] } },
      { id: 'dk_vital', icon: '✕', name: '急所穿ち', base: '近くの敵を突く。HPが半分以下の敵には大ダメージ', lv: ['280%（半分以下は540%）', '360%（半分以下は680%）', L3], tags: ['crit'],
        A: { name: 'とどめ', desc: 'この突きで倒すと、クールタイムがすぐ戻る' }, B: { name: '抉り', desc: '突いた敵に出血（4秒・毎秒40%）', tags: ['poison'] } },
      { id: 'dk_bleed', icon: '≋', name: '裂傷連舞', base: '前を二度斬り、出血させる（4秒）', lv: ['各150%・出血 毎秒45%', '各190%・出血 毎秒60%', L3], tags: ['poison'],
        A: { name: '深裂', desc: '出血が重なる（最大3）' }, B: { name: '血風', desc: '周り全体を斬る' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'dk_combo', icon: '⚡', name: '連撃の心得', base: '攻撃を当てるたびに攻撃の速さが上がる（最大10・3秒）', lv: ['1つにつき+3%', '1つにつき+4%', L3], tags: ['move'], per: [3, 4],
        A: { name: '途切れぬ連撃', desc: '連撃が切れるまでの時間 5秒' }, B: { name: '連撃の刃', desc: '連撃が最大の間、ダメージ +6%' } },
      { id: 'dk_agile', icon: '➶', name: '身軽', base: '回避のクールタイム', lv: ['-15%', '-25%', L3], tags: ['move'], mods: [{ dodgecd: 15 }, { dodgecd: 25 }],
        A: { name: '残影', desc: 'JUST回避した後の1撃は必ず会心', tags: ['crit'] }, B: { name: '軽業', desc: '回避の距離 +30%・移動の速さ +10%' } },
      { id: 'dk_vitalp', icon: '✦', name: '急所の心得', base: '会心ダメージ', lv: ['+20%', '+35%', L3], tags: ['crit'], mods: [{ critd: 20 }, { critd: 35 }],
        A: { name: '急所見切り', desc: '会心率 +8%' }, B: { name: '深手', desc: '会心が出ると出血させる（3秒・毎秒20%）', tags: ['poison'] } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'dk_venom', icon: '☠', name: '毒刃', desc: '攻撃が当たると敵に毒が1つ重なる（最大5。1つにつき毎秒15%）', tags: ['poison'] },
      { id: 'dk_assassin', icon: '◣', name: '暗殺', desc: '敵の背後から当てた攻撃は必ず会心になり、ダメージ +20%', tags: ['crit'] },
      { id: 'dk_blades', icon: '⚡', name: '連刃', desc: '連撃の上限が15になり、最大のときは斬撃が二重に当たる（追撃40%）', tags: ['move'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'dk_toxin', icon: '⚗', name: '毒の心得', base: '毒・出血のダメージ', lv: ['+30%', '+50%', L3], tags: ['poison'],
        A: { name: '長毒', desc: '毒・出血の時間 +50%' }, B: { name: '毒の牙', desc: '通常攻撃の3段目で毒が1つ重なる' } },
      { id: 'dk_shadow', icon: '◌', name: '影歩き', base: '移動の速さ', lv: ['+8%', '+12%', L3], tags: ['move'], mods: [{ move: 8 }, { move: 12 }],
        A: { name: '影の衣', desc: '瞬影の距離 +30%・無敵 +0.2秒' }, B: { name: '影の刃', desc: '瞬影で通り抜けた敵に毒が2つ重なる', tags: ['poison'] } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'dk_poison', icon: '☠', name: 'ポイズン・エッジ', base: '刃に毒を塗る。効果中は攻撃で毒が重なる', lv: ['8秒間', '10秒間', L3], tags: ['poison'],
        A: { name: '致死毒', desc: '効果中、毒のダメージ2倍' }, B: { name: '毒霧', desc: '使った瞬間、周りの敵に毒が3つ重なる' } },
      { id: 'dk_smoke', icon: '☁', name: 'スモーク・ステップ', base: '煙幕で後ろへ跳ぶ（1秒無敵）。次の攻撃が必ず会心', lv: ['次の3撃', '次の4撃', L3], tags: ['crit', 'move'],
        A: { name: '影走り', desc: '跳んだあと3秒間、移動の速さ +40%' }, B: { name: '奇襲', desc: 'この会心のダメージ +50%' } },
      { id: 'dk_pin', icon: '†', name: '影縫い', base: 'ナイフを投げ、ボス以外の敵の足を3秒止める', lv: ['威力260%', '威力340%', L3], tags: [],
        A: { name: '三本縫い', desc: '3本を扇状に投げる（各70%）' }, B: { name: '毒ナイフ', desc: '当たった敵に毒が3つ重なる', tags: ['poison'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'dk_burst', from: 'dk_venom', icon: '✺', name: '猛毒', desc: '毒が5つ重なると破裂して大きなダメージ（300%）。毒は消える', tags: ['poison'] },
      { id: 'dk_spread', from: 'dk_venom', icon: '❋', name: '蝕み', desc: '毒が重なっている敵へのダメージ +4%（重ね1つにつき）', tags: ['poison'] },
      { id: 'dk_step', from: 'dk_assassin', icon: '↶', name: '影渡り', desc: '瞬影ですり抜けたあと敵のほうへ向き直り、次の1撃 +50%', tags: ['move', 'crit'] },
      { id: 'dk_exec', from: 'dk_assassin', icon: '☩', name: '必殺', desc: '背後からの会心で、HPが25%以下の雑魚はとどめ。ボスにはダメージ +40%', tags: ['crit'] },
      { id: 'dk_thousand', from: 'dk_blades', icon: '⋔', name: '千本', desc: '連撃が最大の間、通常攻撃の3段目でナイフが3本飛ぶ（各35%）', tags: ['move'] },
      { id: 'dk_gale', from: 'dk_blades', icon: '≫', name: '疾風', desc: '連撃が切れるまでの時間が2倍。連撃が最大の間、移動の速さ +25%', tags: ['move'] },
    ] },
  ],
};

// ---- 短剣のスキル（Q/E）。毒・出血は c.poison / c.bleed で重ねる ----
const skills = {
  dk_flank: {
    name: '抜け駆け', kind: 'dagger', cd: 9.6, motion: 'dagger_flank', duration: T.dagger_flank.duration,
    motionOf: (W) => (W.br('dk_flank') === 'A' ? 'dk_flank_twin' : 'dagger_flank'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('dk_flank') >= 2 ? 4.9 : 3.9, b = W.br('dk_flank');
      c.dash(a + Math.PI / 2, 4, 0.18, 0.25); c.me.a = a;
      at(c, T.dagger_flank.hits[0], () => { c.arc(3.1, 100, m, { type: 'tskill', a, crit: b === 'B' || undefined }); c.fx.slash(c.me.x, c.me.z, a, 3.1, 100, c.col(), 1.15); c.sfx('swing'); });
      if (b === 'A') at(c, TREE_MOTIONS.dk_flank_twin.hits[1] - 0.16, () => { c.dash(a - Math.PI / 2, 4, 0.18, 0.25); c.me.a = a; at(c, 0.16, () => { c.arc(3.1, 100, 1.5, { type: 'tskill', a }); c.fx.slash(c.me.x, c.me.z, a, 3.1, 100, c.col(), 1.15, true); c.sfx('swing'); }); });
    },
  },
  dk_vital: {
    name: '急所穿ち', kind: 'dagger', cd: 10.8, motion: 'dagger_vital', duration: T.dagger_vital.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_vital') >= 2, b = W.br('dk_vital'), a = c.aim();
      at(c, T.dagger_vital.hits[0], () => {
        const t = c.nearest(3.5);
        if (!t) return;
        c.hit(t, t.hp <= t.mhp * 0.5 ? (lv2 ? 6.8 : 5.4) : (lv2 ? 3.6 : 2.8), { type: 'tskill' });
        c.fx.slash(t.x, t.z, a, 1.4, 60, c.col(), 0.8);
        if (b === 'B') c.bleed(t, 0.4);
        if (b === 'A' && t.hp <= 0) c.resetCd('dk_vital');
      });
    },
  },
  dk_bleed: {
    name: '裂傷連舞', kind: 'dagger', cd: 13.2, motion: 'dagger_bleed', duration: T.dagger_bleed.duration,
    motionOf: (W) => (W.br('dk_bleed') === 'B' ? 'dk_bleed_spin' : 'dagger_bleed'),
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_bleed') >= 2, b = W.br('dk_bleed'), a = c.aim();
      T.dagger_bleed.hits.forEach((h, i) => at(c, h, () => {
        for (const t of c.targets(c.me.x, c.me.z, b === 'B' ? 3.2 : 2.8)) {
          const ang = Math.atan2(t.x - c.me.x, t.z - c.me.z);
          if (b !== 'B' && Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) > 1.3) continue;
          c.hit(t, lv2 ? 1.9 : 1.5, { type: 'tskill' });
          if (i === 0) c.bleed(t, lv2 ? 0.6 : 0.45, b === 'A');
        }
        c.fx.slash(c.me.x, c.me.z, a + (i ? -0.3 : 0.3), b === 'B' ? 3.2 : 2.8, b === 'B' ? 360 : 150, 0xff7283, 0.9, i === 1); c.sfx('swing');
      }));
    },
  },
  dk_poison: {
    name: 'ポイズン・エッジ', kind: 'dagger', cd: 18, motion: 'dk_poison', duration: TREE_MOTIONS.dk_poison.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_poison') >= 2;
      c.buff('dk_poison', 'ポイズン・エッジ', lv2 ? 10 : 8, {}, 0x8aff5a);
      if (W.br('dk_poison') === 'B') { for (const t of c.targets(c.me.x, c.me.z, 4.5)) c.poison(t, 3); c.fx.ringWave(c.me.x, c.me.z, 0x8aff5a, 4.5, 0.5); c.fx.parts.burst(c.me.x, 0.8, c.me.z, 50, { color: 0x8aff5a, speed: 5, size: 0.8, life: 0.9, gravity: 0.5 }); }
    },
  },
  dk_smoke: {
    name: 'スモーク・ステップ', kind: 'dagger', cd: 12, motion: 'dk_smoke', duration: TREE_MOTIONS.dk_smoke.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_smoke') >= 2;
      c.fx.parts.burst(c.me.x, 0.8, c.me.z, 50, { color: 0x8a8a9a, speed: 4, size: 0.9, life: 1.0, gravity: 0.5 });
      c.dash(c.aim() + Math.PI, 5, 0.2, 1.0);
      c.ambush(lv2 ? 4 : 3);
      if (W.br('dk_smoke') === 'A') c.buff('dk_smokeA', '影走り', 3, { move: 40 }, 0x9a9aaa);
    },
  },
  dk_pin: {
    name: '影縫い', kind: 'dagger', cd: 12, motion: 'dagger_pin', duration: T.dagger_pin.duration,
    motionOf: (W) => (W.br('dk_pin') === 'A' ? 'dk_pin_fan' : 'dagger_pin'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('dk_pin') >= 2 ? 3.4 : 2.6, b = W.br('dk_pin');
      at(c, T.dagger_pin.hits[0], () => {
        const spread = b === 'A' ? [-0.25, 0, 0.25] : [0];
        for (const d of spread) c.arrow({ a: a + d, mult: m * (b === 'A' ? 0.7 : 1), type: 'tskill', tech: 'dagger_pin', noZone: true, speed: 38, color: KNIFE_COLOR, poison: b === 'B' ? 3 : 0 });
      });
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
  if (br('dk_agile') === 'B') mods.move = (mods.move || 0) + 10;
  if (br('dk_vitalp') === 'A') mods.crit = (mods.crit || 0) + 8;
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['dagger_'], slots: ['poison', 'smoke', 'dagger_flank', 'dagger_vital', 'dagger_bleed', 'dagger_pin', 'dagger_quicken'] };

// tab: 武器ツリー画面のタブの並び / glyph: 装備アイコンの文字
export default { wk: 'dagger', tab: 5, glyph: '短', tree: DAGGER, skills, mods, legacy };
