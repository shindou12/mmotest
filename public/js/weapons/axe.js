// 大斧の武器ツリー: ツリーのデータ（段・ノード）・スキル（Q/E）・ツリーが足す能力値。登録は weapons/index.js
import { L3, T, at, spOff, inFront } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

// 大斧: 「重さ」「血」「崩し」。クラスは 狂戦士（HPが減るほど強い）/ 破砕（ボスを崩す）/ 投斧（強攻撃で斧を投げる）
const AXE = {
  name: '大斧',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'ax_hook', icon: '⟲', name: '引き裂き', base: '前の敵（ボス以外）を引き寄せてから叩く', lv: ['威力280%', '威力360%', L3], tags: ['break'],
        A: { name: '大引き', desc: '周り全体の敵を引き寄せる' }, B: { name: '叩き伏せ', desc: 'もう一度叩く（150%）' } },
      { id: 'ax_return', icon: '⟳', name: '返り刃', base: '斧の分身を投げる。8m先まで飛んで戻り、往復とも当たる', lv: ['各150%', '各190%', L3], tags: ['throw'],
        A: { name: '双刃', desc: '左右にも1本ずつ飛ぶ（各50%）' }, B: { name: '旋回', desc: '飛んだ先で1.5秒回り続けてから戻る（0.3秒ごとに40%）' } },
      { id: 'ax_stomp', icon: '⊚', name: 'ウォーストンプ', base: '地面を踏み鳴らし、周りの敵を揺さぶる（ボスを大きく崩す）', lv: ['威力180%', '威力230%', L3], tags: ['break'],
        A: { name: '地鳴り', desc: '1秒後にもう一度揺れる（100%）' }, B: { name: '大踏み', desc: '範囲 +50%' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'ax_heavy', icon: '◎', name: '剛力の心得', base: '強攻撃のダメージ', lv: ['+15%', '+25%', L3], tags: ['charge'], mods: [{ heavyp: 15 }, { heavyp: 25 }],
        A: { name: '地割れ', desc: '最大まで溜めた強攻撃で、前へ地割れが走る（120%）' }, B: { name: '重圧', desc: '強攻撃でボスを崩す力（スタン値）+50%', tags: ['break'] } },
      { id: 'ax_blood', icon: '♥', name: '血の心得', base: '与えたダメージの一部を回復', lv: ['2%', '3%', L3], tags: ['blood'], mods: [{ vamp: 2 }, { vamp: 3 }],
        A: { name: '渇き', desc: 'HPが半分以下の間、回復が2倍', tags: ['hurt'] }, B: { name: '血気', desc: 'HPが満タンの間、攻撃力 +10%' } },
      { id: 'ax_swing', icon: '⌒', name: '斧の心得', base: '通常攻撃のダメージ', lv: ['+10%', '+18%', L3], tags: [], mods: [{ normp: 10 }, { normp: 18 }],
        A: { name: '大振り', desc: '通常攻撃の届く距離 +20%' }, B: { name: '三段斬り', desc: '通常攻撃の3段目のダメージ +30%' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'ax_berserk', icon: '♨', name: '狂戦士', desc: '減ったHP10%ごとに、攻撃の速さとダメージ +3%（最大 +27%）', tags: ['hurt', 'blood'] },
      { id: 'ax_crush', icon: '✸', name: '破砕', desc: '強攻撃でボスを崩す力（スタン値）が2倍。ボスがスタンしたとき、周りに衝撃が走る（500%）', tags: ['break', 'charge'] },
      { id: 'ax_throw', icon: '⟳', name: '投斧', desc: '強攻撃で斧を投げる。斧は8m先まで飛んで戻り、往復とも当たる（最大溜めで各260%）', tags: ['throw', 'charge'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'ax_brk', icon: '✸', name: '崩しの心得', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: ['break'], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '砕き', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '揺さぶり', desc: '通常攻撃の3段目でボスを崩す力が3倍' } },
      { id: 'ax_rage', icon: '♨', name: '怒りの心得', base: '攻撃を受けると5秒間、攻撃力アップ', lv: ['+4%', '+7%', L3], tags: ['hurt'], rage: [4, 7],
        A: { name: '逆上', desc: '効果中、攻撃の速さ +15%' }, B: { name: '我慢', desc: '効果中、被ダメージ -15%' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'ax_exec', icon: '☩', name: '処刑斬', base: '近くの敵へ一撃。HPが30%以下の敵には2倍', lv: ['威力340%', '威力420%', L3], tags: ['break'],
        A: { name: '断頭', desc: 'この一撃で倒すと、クールタイムがすぐ戻る' }, B: { name: '薙ぎ処刑', desc: '前の広い範囲の敵すべてに当たる（各70%）' } },
      { id: 'ax_lust', icon: '♥', name: 'ブラッドラスト', base: '8秒間、攻撃力アップ・与えたダメージの一部を回復', lv: ['攻撃力+15%・回復5%', '攻撃力+20%・回復8%', L3], tags: ['blood'],
        A: { name: '血の代償', desc: '使うときHPを15%払い、効果中は攻撃の速さ +20%', tags: ['hurt'] }, B: { name: '長い渇き', desc: '効果時間 12秒' } },
      { id: 'ax_rush', icon: '»', name: '猛進断', base: '5m突進して叩き斬る（突進中は被ダメージ -30%）。ボス以外は押し戻す', lv: ['威力320%', '威力400%', L3], tags: ['break'],
        A: { name: '轢き', desc: '突進中に触れた敵にも当たる（100%）' }, B: { name: '二段', desc: '叩いたあと、足元の周りを叩く（200%）' } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'ax_undying', from: 'ax_berserk', icon: '✚', name: '不死身', desc: 'HPが0になる攻撃を受けても1で耐え、2秒間無敵（60秒に1回）', tags: ['hurt'] },
      { id: 'ax_reckless', from: 'ax_berserk', icon: '☠', name: '捨て身', desc: '狂戦士の上乗せが1.5倍（最大 +40%）。そのかわり被ダメージ +25%', tags: ['hurt'] },
      { id: 'ax_quake', from: 'ax_crush', icon: '⚡', name: '地砕き', desc: '強攻撃で前へ大きな地割れが走る（200%）', tags: ['break', 'charge'] },
      { id: 'ax_shatter', from: 'ax_crush', icon: '✷', name: '砕骨', desc: 'スタン中のボスへの強攻撃は必ず会心・ダメージ +50%', tags: ['break', 'crit'] },
      { id: 'ax_storm', from: 'ax_throw', icon: '✺', name: '旋風', desc: '投げた斧が先で2秒回り続け、周りを切り刻む（0.25秒ごとに50%）', tags: ['throw'] },
      { id: 'ax_catch', from: 'ax_throw', icon: '✋', name: '受け止め', desc: '戻ってきた斧を受け止めると、3秒間 攻撃の速さ +25%', tags: ['throw'] },
    ] },
  ],
};

// ---- 大斧のスキル（Q/E）。引き寄せ・押し戻しは技と同じ（tech: axe_hook / axe_rush）をサーバーで使う ----
const skills = {
  ax_hook: {
    name: '引き裂き', kind: 'axe', cd: 10.8, motion: 'axe_hook', duration: T.axe_hook.duration,
    motionOf: (W) => ({ A: 'ax_hook_spin', B: 'ax_hook_twin' })[W.br('ax_hook')] || 'axe_hook',
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_hook') >= 2 ? 3.6 : 2.8, b = W.br('ax_hook'), deg = b === 'A' ? 360 : 110;
      at(c, T.axe_hook.hits[0], () => { c.arc(b === 'A' ? 6 : 4.6, deg, 1, { type: 'tskill', a, tech: 'axe_hook', stun: 2 }); c.fx.slash(c.me.x, c.me.z, a, b === 'A' ? 6 : 4.6, deg, c.col(), 1.0); c.sfx('swing'); });
      at(c, T.axe_hook.hits[1], () => { c.arc(3.5, 120, m, { type: 'tskill', a, stun: 9 }); c.fx.slash(c.me.x, c.me.z, a, 3.5, 120, c.col(), 1.6); c.sfx('impact'); c.shake(0.3); });
      if (b === 'B') at(c, TREE_MOTIONS.ax_hook_twin.hits[2], () => { c.arc(3.5, 120, 1.5, { type: 'tskill', a, stun: 5 }); c.fx.ringWave(c.me.x + Math.sin(a) * 2, c.me.z + Math.cos(a) * 2, c.col(), 2.6, 0.3); c.sfx('impact'); c.shake(0.35); });
    },
  },
  ax_return: {
    name: '返り刃', kind: 'axe', cd: 10.8, motion: 'axe_return', duration: T.axe_return.duration,
    motionOf: (W) => (W.br('ax_return') === 'A' ? 'ax_return_tri' : 'axe_return'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_return') >= 2 ? 1.9 : 1.5, b = W.br('ax_return'), sx = c.me.x, sz = c.me.z;
      const far = spOff(sx, sz, a, 8), wait = b === 'B' ? 1.5 : 0;
      at(c, T.axe_return.hits[0], () => {
        c.proj({ a, mult: m, speed: 20, life: 0.4, rad: 1.3, shape: 'axe', type: 'tskill' });
        if (b === 'A') for (const d of [-0.35, 0.35]) c.proj({ a: a + d, mult: m * 0.5, speed: 20, life: 0.4, rad: 1.1, shape: 'axe', type: 'tskill' });
      });
      if (b === 'B') for (let k = 0; k < 5; k++) at(c, T.axe_return.hits[0] + 0.4 + k * 0.3, () => { c.circle(far.x, far.z, 2.2, 0.4, { type: 'tskill', stun: 1 }); c.fx.slash(far.x, far.z, k * 1.3, 2.2, 200, c.col(), 0.7); });
      at(c, T.axe_return.hits[1] + wait, () => c.proj({ a: a + Math.PI, mult: m, speed: 20, life: 0.4, rad: 1.3, shape: 'axe', type: 'tskill', sx: far.x, sz: far.z }));
    },
  },
  ax_stomp: {
    name: 'ウォーストンプ', kind: 'axe', cd: 12, motion: 'ax_stomp', duration: TREE_MOTIONS.ax_stomp.duration,
    run(c) {
      const W = c.wt(), m = W.lv('ax_stomp') >= 2 ? 2.3 : 1.8, b = W.br('ax_stomp'), r = b === 'B' ? 7.5 : 5;
      const quake = (mult, stun, rr) => { c.circle(c.me.x, c.me.z, rr, mult, { type: 'tskill', stun }); c.fx.ringWave(c.me.x, c.me.z, 0xd8b080, rr + 1, 0.45); c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xb89870, speed: 8, size: 0.6, life: 0.7, up: 2 }); c.sfx('heavy'); c.shake(0.5); };
      at(c, TREE_MOTIONS.ax_stomp.hits[0], () => quake(m, 22, r));
      if (b === 'A') at(c, TREE_MOTIONS.ax_stomp.hits[0] + 1, () => quake(1.0, 8, r));
    },
  },
  ax_exec: {
    name: '処刑斬', kind: 'axe', cd: 13.2, motion: 'axe_execute', duration: T.axe_execute.duration,
    motionOf: (W) => (W.br('ax_exec') === 'B' ? 'ax_exec_sweep' : 'axe_execute'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_exec') >= 2 ? 4.2 : 3.4, b = W.br('ax_exec');
      at(c, T.axe_execute.hits[0], () => {
        const low = (t) => (t.hp <= t.mhp * 0.3 ? 2 : 1);
        if (b === 'B') { for (const t of c.targets(c.me.x, c.me.z, 4.5)) if (inFront(c, t, a, 150)) c.hit(t, m * 0.7 * low(t), { type: 'tskill', stun: 10 }); c.fx.slash(c.me.x, c.me.z, a, 4.5, 150, c.col(), 2); }
        else { const t = c.nearest(4.2); if (t) { c.hit(t, m * low(t), { type: 'tskill', stun: 16 }); c.fx.slash(c.me.x, c.me.z, a, 4, 75, c.col(), 2); if (b === 'A' && t.hp <= 0) c.resetCd('ax_exec'); } }
        c.sfx('impact'); c.shake(0.4);
      });
    },
  },
  ax_lust: {
    name: 'ブラッドラスト', kind: 'axe', cd: 21.6, motion: 'ax_lust', duration: TREE_MOTIONS.ax_lust.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('ax_lust') >= 2, b = W.br('ax_lust');
      if (b === 'A') c.pay(0.15);
      c.buff('ax_lust', 'ブラッドラスト', b === 'B' ? 12 : 8, { atkp: lv2 ? 20 : 15, vamp: lv2 ? 8 : 5, ...(b === 'A' ? { aspd: 20 } : {}) }, 0xff3a3a);
      c.fx.ringWave(c.me.x, c.me.z, 0xff3a3a, 3, 0.4); c.fx.parts.burst(c.me.x, 1.2, c.me.z, 30, { color: 0xff3a3a, speed: 4, size: 0.5, life: 0.6, gravity: -2 });
      c.sfx('roar');
    },
  },
  ax_rush: {
    name: '猛進断', kind: 'axe', cd: 12, motion: 'axe_rush', duration: T.axe_rush.duration,
    motionOf: (W) => (W.br('ax_rush') === 'B' ? 'ax_rush_twin' : 'axe_rush'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_rush') >= 2 ? 4.0 : 3.2, b = W.br('ax_rush'), sx = c.me.x, sz = c.me.z;
      c.buff('ax_rush', '猛進', 0.4, { dr: 30 }, 0xd8b080);
      c.dash(a, 5, 0.28, 0);
      if (b === 'A') at(c, 0.28, () => c.line(5, 2, 1.0, { type: 'tskill', a, sx, sz, stun: 2 }));
      at(c, T.axe_rush.hits[0], () => { c.arc(3.5, 120, m, { type: 'tskill', a, tech: 'axe_rush', stun: 10 }); c.fx.slash(c.me.x, c.me.z, a, 3.5, 120, c.col(), 2); c.sfx('impact'); c.shake(0.4); });
      if (b === 'B') at(c, TREE_MOTIONS.ax_rush_twin.hits[1], () => { c.circle(c.me.x, c.me.z, 3, 2.0, { type: 'tskill', stun: 6 }); c.fx.ringWave(c.me.x, c.me.z, 0xd8b080, 3.6, 0.35); c.fx.parts.burst(c.me.x, 0.3, c.me.z, 40, { color: 0xb89870, speed: 7, size: 0.5, life: 0.6, up: 2 }); c.sfx('heavy'); c.shake(0.45); });
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['axe_'], slots: ['warstomp', 'bloodlust', 'axe_hook', 'axe_execute', 'axe_return', 'axe_blood', 'axe_rush'] };

export default { wk: 'axe', tree: AXE, skills, mods, legacy };
