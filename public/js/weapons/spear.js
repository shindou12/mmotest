// 盾槍の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at, spOff } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

// 盾槍: 「盾」「突き」「崩し」。クラスは 竜騎士（槍メイン）/ 間合い / 騎士（受けて返す）
// 溜め中のガードと、受けてから離すガードカウンターは盾槍の基本の操作（竜騎士だけガードの代わりに跳躍）
const SPEAR = {
  name: '盾槍',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'sp_fan', icon: '⋔', name: '扇突き', base: '正面と左右へ突く', lv: ['各130%', '各165%', L3], tags: ['thrust'],
        A: { name: '竜爪', desc: '跳び上がって突き降ろし、周りにも当たる（100%）' }, B: { name: '長扇', desc: '届く距離 +50%' } },
      { id: 'sp_sweep', icon: '⌒', name: '足払い', base: '前方を低く薙ぎ、ボス以外の敵の足を3秒遅くする', lv: ['威力240%', '威力300%', L3], tags: ['break'],
        A: { name: '大回し', desc: '周り全体を薙ぐ' }, B: { name: '崩し払い', desc: 'ボスを崩す力（スタン値）が2倍' } },
      { id: 'sp_bash', icon: '⛉', name: 'シールドバッシュ', base: '盾で前を殴る。ボスを大きく崩し、狙いを引きつける', lv: ['威力280%', '威力350%', L3], tags: ['shield', 'break'],
        A: { name: '連打', desc: 'もう一度殴る（150%）' }, B: { name: '盾突進', desc: '3m踏み込んで殴る（踏み込み中は無敵）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sp_iron', icon: '⛨', name: '鉄壁の心得', base: '被ダメージ', lv: ['-6%', '-10%', L3], tags: ['shield'], mods: [{ def: 6 }, { def: 10 }],
        A: { name: '不動', desc: 'ガードで受けても押し戻されない' }, B: { name: '頑健', desc: '最大HP +10%' } },
      { id: 'sp_shield', icon: '◈', name: '盾の心得', base: 'ガードで受けたときのガードゲージの減り', lv: ['-20%', '-35%', L3], tags: ['shield'], gauge: [20, 35],
        A: { name: '立て直し', desc: 'ガードゲージの回復が2倍速い' }, B: { name: '盾の重み', desc: 'ガードで受けると、その敵を崩す', tags: ['break'] } },
      { id: 'sp_spear', icon: '➹', name: '槍の心得', base: '通常攻撃・強攻撃のダメージ', lv: ['+10%', '+18%', L3], tags: ['thrust'], mods: [{ normp: 10, heavyp: 10 }, { normp: 18, heavyp: 18 }],
        A: { name: '長柄', desc: '通常攻撃の届く距離 +20%' }, B: { name: '連突き', desc: '通常攻撃の3段目でもう一度突く（60%）' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'sp_dragoon', icon: '⇑', name: '竜騎士', desc: '盾を背負い、槍を両手で持つ。ガードはできないが攻撃の速さ +30%。強攻撃は高く跳んで、狙った場所へ突き降りる（空中は無敵・750%）', tags: ['thrust'] },
      { id: 'sp_reach', icon: '↦', name: '間合い', desc: '槍の先端（届くぎりぎりの距離）で当てた攻撃は必ず会心・ダメージ +25%。近すぎると -20%', tags: ['thrust'] },
      { id: 'sp_knight', icon: '♞', name: '騎士', desc: 'ガードカウンターのあと3秒間、突きが雷をまとう（ダメージ +20%・届く距離 +50%）', tags: ['shield', 'thrust'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sp_brk', icon: '✸', name: '崩しの心得', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: ['break'], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '崩れ突き', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '盾の一撃', desc: 'ガードカウンターでボスを崩す力が2倍', tags: ['shield'] } },
      { id: 'sp_ctr', icon: '↺', name: '反撃の心得', base: 'ガードカウンターの威力', lv: ['+20%', '+35%', L3], tags: ['shield'], ctr: [20, 35],
        A: { name: '反撃の守り', desc: 'ガードカウンターの間は無敵' }, B: { name: '二段反撃', desc: 'ガードカウンターのあと、もう一度突く（150%）', tags: ['thrust'] } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'sp_stake', icon: '⚡', name: '杭打ち', base: '狙った地点（6m以内）に雷の杭を打つ', lv: ['威力380%', '威力480%', L3], tags: ['break'],
        A: { name: '雷杭', desc: '杭が3秒残り、雷を落とし続ける（0.5秒ごとに40%）' }, B: { name: '三連杭', desc: '杭を3本打つ（各60%）' } },
      { id: 'sp_intercept', icon: '⛊', name: '迎撃の構え', base: '3秒間守りを固めて敵を引きつけ、前へ2回突く', lv: ['被ダメージ-35%・各150%', '被ダメージ-35%・各190%', L3], tags: ['shield', 'thrust'],
        A: { name: '雷の構え', desc: '構えている間に攻撃を受けると、3秒間突きが雷をまとう' }, B: { name: '鉄の構え', desc: '構えている間の被ダメージ -60%' } },
      { id: 'sp_taunt', icon: '!', name: '挑発', base: '周りの敵の狙いを6秒間自分に向ける', lv: ['被ダメージ-30%', '被ダメージ-40%', L3], tags: ['shield'],
        A: { name: '威圧', desc: '効果中、ガードゲージが減らない' }, B: { name: '鼓舞', desc: '効果中、攻撃力 +20%' } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'sp_fang', from: 'sp_dragoon', icon: '✷', name: '竜の牙', desc: '突き降りた場所に衝撃が広がり（300%）、ボスを大きく崩す', tags: ['break'] },
      { id: 'sp_soar', from: 'sp_dragoon', icon: '⇈', name: '竜翔', desc: '突き降りてから1.5秒以内なら、溜めなしでもう一度跳べる（1回だけ）', tags: ['thrust'] },
      { id: 'sp_pierce', from: 'sp_reach', icon: '➶', name: '一点突破', desc: '先端で3回続けて当てると、次の突きが前方を貫く衝撃になる（160%）', tags: ['thrust'] },
      { id: 'sp_hold', from: 'sp_reach', icon: '⇤', name: '間合い支配', desc: '先端で当てたボス以外の敵を押し戻す', tags: ['thrust'] },
      { id: 'sp_banner', from: 'sp_knight', icon: '⚑', name: '旗手', desc: 'ガードカウンターした場所に旗が立つ（8秒）。そばにいる間は被ダメージ -20%・攻撃力 +15%', tags: ['shield'] },
      { id: 'sp_bolt', from: 'sp_knight', icon: '☇', name: '雷槍', desc: '雷をまとった突きが当たると、その周りに雷が落ちる（60%）', tags: ['thrust'] },
    ] },
  ],
};

// ---- 盾槍のスキル（Q/E）。足払いは技と同じ足止め（tech: spear_sweep）をサーバーで使う ----
const skills = {
  sp_fan: {
    name: '扇突き', kind: 'spear', cd: 9.6, motion: 'spear_fan', duration: T.spear_fan.duration,
    motionOf: (W) => (W.br('sp_fan') === 'A' ? 'sp_fan_leap' : 'spear_fan'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_fan') >= 2 ? 1.65 : 1.3, b = W.br('sp_fan'), len = b === 'B' ? 7.5 : 5;
      if (b === 'A') c.dash(a, 2.5, 0.2, 0.3);
      (b === 'A' ? TREE_MOTIONS.sp_fan_leap : T.spear_fan).hits.forEach((h, i) => at(c, h, () => {
        const ang = a + (i - 1) * 0.5;
        c.line(len, 1.5, m, { type: 'tskill', a: ang });
        for (let d = 0.7; d < len; d += 0.5) c.fx.parts.emit(c.me.x + Math.sin(ang) * d, 1.2, c.me.z + Math.cos(ang) * d, { color: c.col(), size: 0.42, life: 0.25, speed: 1, gravity: 0 });
        c.sfx('swing');
      }));
      if (b === 'A') at(c, TREE_MOTIONS.sp_fan_leap.hits[0], () => { c.circle(c.me.x, c.me.z, 3, 1.0, { type: 'tskill', stun: 4 }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.4, 0.3); c.shake(0.25); });
    },
  },
  sp_sweep: {
    name: '足払い', kind: 'spear', cd: 12, motion: 'spear_sweep', duration: T.spear_sweep.duration,
    motionOf: (W) => (W.br('sp_sweep') === 'A' ? 'sp_sweep_spin' : 'spear_sweep'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_sweep') >= 2 ? 3.0 : 2.4, b = W.br('sp_sweep'), deg = b === 'A' ? 360 : 180;
      at(c, b === 'A' ? TREE_MOTIONS.sp_sweep_spin.hits[0] : T.spear_sweep.hits[0], () => { c.arc(4, deg, m, { type: 'tskill', a, tech: 'spear_sweep', stun: b === 'B' ? 12 : 6 }); c.fx.slash(c.me.x, c.me.z, a, 4, deg, c.col(), 0.5); c.sfx('swing'); });
    },
  },
  sp_bash: {
    name: 'シールドバッシュ', kind: 'spear', cd: 8.4, motion: 'sp_bash', duration: TREE_MOTIONS.sp_bash.duration,
    motionOf: (W) => ({ A: 'sp_bash_twin', B: 'sp_bash_rush' })[W.br('sp_bash')] || 'sp_bash',
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_bash') >= 2 ? 3.5 : 2.8, b = W.br('sp_bash');
      c.dash(a, b === 'B' ? 3 : 1.5, b === 'B' ? 0.16 : 0.1, b === 'B' ? 0.3 : 0);
      const bash = (mult, stun) => { c.arc(3.4, 110, mult, { type: 'tskill', a, threat: 4, stun }); c.fx.ringWave(c.me.x + Math.sin(a) * 2, c.me.z + Math.cos(a) * 2, 0xbfd8ff, 3, 0.3); c.sfx('block'); c.shake(0.3); };
      at(c, b === 'B' ? TREE_MOTIONS.sp_bash_rush.hits[0] : TREE_MOTIONS.sp_bash.hits[0], () => bash(m, 14));
      if (b === 'A') at(c, TREE_MOTIONS.sp_bash_twin.hits[1], () => bash(1.5, 8));
    },
  },
  sp_stake: {
    name: '杭打ち', kind: 'spear', cd: 13.2, motion: 'spear_stake', duration: T.spear_stake.duration,
    motionOf: (W) => (W.br('sp_stake') === 'B' ? 'sp_stake_tri' : 'spear_stake'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_stake') >= 2 ? 4.8 : 3.8, b = W.br('sp_stake');
      const p = c.point(), d = Math.min(6, Math.hypot(p.x - c.me.x, p.z - c.me.z)), spot = spOff(c.me.x, c.me.z, a, d);
      const spots = b === 'B' ? [spot, spOff(spot.x, spot.z, a + 2.1, 1.8), spOff(spot.x, spot.z, a - 2.1, 1.8)] : [spot];
      for (const q of spots) c.fx.ringWave(q.x, q.z, c.col(), 1.8, 0.4);
      if (b === 'B') { // 右・正面・左の順に打つ
        [spots[2], spots[0], spots[1]].forEach((q, i) => at(c, TREE_MOTIONS.sp_stake_tri.hits[i], () => { c.circle(q.x, q.z, 1.8, m * 0.6, { type: 'tskill', threat: 3, stun: 5 }); c.fx.lightning(q.x, q.z, c.col()); c.sfx('thunder'); }));
        return;
      }
      at(c, T.spear_stake.hits[0], () => {
        for (const q of spots) { c.circle(q.x, q.z, 1.8, m, { type: 'tskill', threat: 3, stun: 10 }); c.fx.lightning(q.x, q.z, c.col()); }
        c.sfx('thunder');
        if (b === 'A') for (let k = 1; k <= 6; k++) at(c, k * 0.5, () => { c.circle(spot.x, spot.z, 1.8, 0.4, { type: 'tskill', stun: 1 }); c.fx.lightning(spot.x, spot.z, 0xbfd8ff); });
      });
    },
  },
  sp_intercept: {
    name: '迎撃の構え', kind: 'spear', cd: 19.2, motion: 'spear_intercept', duration: T.spear_intercept.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_intercept') >= 2 ? 1.9 : 1.5, b = W.br('sp_intercept');
      c.buff('sp_intercept', '迎撃の構え', 3, { dr: b === 'B' ? 60 : 35 }, 0xbfd8ff); c.taunt(8);
      T.spear_intercept.hits.forEach((h) => at(c, h, () => { c.line(5.5, 2, m, { type: 'tskill', a, threat: 3 }); c.sfx('swing'); }));
    },
  },
  sp_taunt: {
    name: '挑発', kind: 'spear', cd: 16.8, motion: 'sp_taunt', duration: TREE_MOTIONS.sp_taunt.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sp_taunt') >= 2;
      c.taunt(14);
      c.buff('sp_taunt', '挑発', 6, { dr: lv2 ? 40 : 30, ...(W.br('sp_taunt') === 'B' ? { atkp: 20 } : {}) }, 0xff6a4a);
      c.fx.ringWave(c.me.x, c.me.z, 0xff6a4a, 14, 0.6);
      c.text('こっちだ！', 'info'); c.sfx('roar');
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
  if (st.ks1 === 'sp_dragoon') mods.aspd = (mods.aspd || 0) + 30;
  if (br('sp_iron') === 'B') mods.hpp = (mods.hpp || 0) + 10;
}

export default { wk: 'spear', tree: SPEAR, skills, mods };
