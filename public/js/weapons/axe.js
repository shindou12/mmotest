// 大斧のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・武器ツリーの効果。
// 登録は weapons/index.js に1行。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）は shared/data.js の WEAPONS
import * as THREE from 'three';
import { L3, T, at, spOff, inFront, fwd } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { RARITIES } from '../../shared/data.js';
import { clamp, now, rnd } from '../game/util.js';
import { cone, cyl, extrude, mesh, sphere } from '../models/kit.js';
import { toon } from '../toon.js';

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

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '大地砕き', desc: '斧を振り下ろし、前方の地面ごと叩き割る。スタン値が非常に高い',
    run(c, lv) {
      const a = c.aim(), [dx, dz] = fwd(a, 2.4), x = c.me.x + dx, z = c.me.z + dz;
      c.fx.slash(c.me.x, c.me.z, a, 3.2, 70, c.col(), 2.4);
      c.later(0.16, () => {
        c.circle(x, z, lv === 2 ? 3.4 : 2.8, lv === 2 ? 5.0 : 3.2, { type: 'heavy', stun: lv === 2 ? 16 : 10 });
        c.fx.ringWave(x, z, 0xd8b080, lv === 2 ? 4.5 : 3.5, 0.4);
        c.fx.parts.burst(x, 0.3, z, 50, { color: 0xb89870, speed: 8, size: 0.6, life: 0.7, up: 2.5 });
        c.shake(lv === 2 ? 0.6 : 0.35); c.sfx('impact');
      });
    },
  };

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  rampage: {
    name: 'ランペイジ', kind: 'axe', cd: 7, desc: '前進しながら3回叩き斬る。スタン値が高い',
    run(c) {
      for (let i = 0; i < 3; i++) {
        c.later(i * 0.22, () => {
          const a = c.aim();
          c.dash(a, 1.6, 0.1, 0);
          c.later(0.08, () => {
            c.arc(3.4, 130, 1.5, { type: 'wskill', a, stun: 6 });
            c.fx.slash(c.me.x, c.me.z, a, 3.4, 130, c.col(), 1.2, i % 2 === 1);
            c.sfx('swing', { heavy: true });
          });
        });
      }
    },
  },
  tomahawk: {
    name: 'トマホーク', kind: 'axe', cd: 6, desc: '斧を回転させて投げ、直線上の敵を切り裂く',
    run(c) { c.proj({ a: c.aim(), mult: 2.8, speed: 26, life: 0.7, rad: 1.6, type: 'wskill', color: 0xd8b080 }); },
  },
  earthsplit: {
    name: '大地割り', kind: 'axe', cd: 8, desc: '地面を叩き割り、前方へ一直線に地割れを走らせる',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.shake(0.3); c.sfx('heavy');
      for (let i = 0; i < 5; i++) {
        c.later(0.08 + i * 0.08, () => {
          const [dx, dz] = fwd(a, 2 + i * 2.2), x = sx + dx, z = sz + dz;
          c.circle(x, z, 2, 1.3, { type: 'wskill', stun: 3 });
          c.fx.parts.burst(x, 0.2, z, 22, { color: 0xb89870, speed: 6, size: 0.6, life: 0.5, up: 3 });
          if (i % 2 === 0) c.sfx('impact');
        });
      }
    },
  },
  bloodaxe: {
    name: 'ブラッドアクス', kind: 'axe', cd: 10, desc: '自分のHPを8%削り、渾身の一撃を叩き込む（威力とスタン値が非常に高い）',
    run(c) {
      const S = c.S(), a = c.aim();
      c.me.hp = Math.max(1, c.me.hp - S.mhp * 0.08);
      c.fx.parts.burst(c.me.x, 1.2, c.me.z, 30, { color: 0xff3040, speed: 4, size: 0.5, life: 0.6 });
      c.later(0.25, () => {
        c.arc(4.2, 120, 5.0, { type: 'wskill', a, stun: 14 });
        c.fx.slash(c.me.x, c.me.z, a, 4.2, 120, 0xff3040, 2.2);
        c.fx.ringWave(c.me.x + Math.sin(a) * 2.5, c.me.z + Math.cos(a) * 2.5, 0xff3040, 3, 0.35);
        c.shake(0.7); c.sfx('impact');
      });
    },
  },
};

// ---------------------------------------------------------------------------
// 形（models.js の makeWeapon が使う）。base が基本の形、styles が形違い
// ---------------------------------------------------------------------------
const model = {
  base(k) {
    const { g, steel, gold, gem, edge } = k;
    g.add(mesh(cyl(0.05, 0.06, 1.9, 8), toon(0x5a3a22), [0, 0.65, 0]));
    for (const y of [0.0, 1.45]) g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
    // 三日月形の刃（両刃）
    const blade = [[0, -0.32], [0.18, -0.36], [0.5, -0.55], [0.62, -0.1], [0.62, 0.1], [0.5, 0.55], [0.18, 0.36], [0, 0.32]];
    edge(blade.map(([x, y]) => [x + 0.04, y + 1.45]), 0.07);
    g.add(mesh(extrude(blade, 0.07), steel, [0.04, 1.45, 0]));
    g.add(mesh(extrude(blade.map(([x, y]) => [x * 0.6, y * 0.7]), 0.07), steel, [-0.04, 1.45, 0], [0, Math.PI, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.12), gold, [0, 1.45, 0]));
    g.add(mesh(cone(0.06, 0.3, 6), steel, [0, 1.75, 0]));
    g.add(mesh(sphere(0.06, 8, 6), gem, [0, 1.45, 0.07]));
  },
  prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
    const { g } = k;
    const haft = (len) => g.add(mesh(cyl(0.05, 0.06, len, 8), toon(0x5a3a22), [0, len / 2 - 0.3, 0]));
    return { haft };
  },
  styles: {
    1: (k) => { // 髭斧: 片刃で下に伸びる刃
      const { g, gold, blade, haft } = k;
      haft(1.9);
      blade([[0, 0.2], [0.35, 0.3], [0.6, 0.1], [0.55, -0.45], [0.3, -0.6], [0.25, -0.2], [0, -0.1]], 0.07, 1.4);
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.36, 0.12), gold, [0, 1.42, 0]));
    },
    2: (k) => { // 戦鎚
      const { g, steel, gold, rarity, glowM, haft } = k;
      haft(1.8);
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.34, 0.34), steel, [0, 1.45, 0]));
      for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), gold, [s * 0.32, 1.45, 0]));
      g.add(mesh(cone(0.08, 0.3, 6), steel, [0, 1.75, 0]));
      if (rarity >= 3) g.add(mesh(new THREE.BoxGeometry(0.64, 0.06, 0.36), glowM(1.2), [0, 1.45, 0]));
    },
    3: (k) => { // 専用: ルーンの大三日月
      const { g, gem, glowM, blade, haft } = k;
      haft(2.0);
      const b = [[0, -0.42], [0.3, -0.55], [0.75, -0.8], [0.85, 0], [0.75, 0.8], [0.3, 0.55], [0, 0.42]];
      blade(b, 0.07, 1.45);
      blade(b.map(([x, y]) => [-x, y]), 0.07, 1.45);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), glowM(1.5), [0.45, 1.45 + (i - 1) * 0.22, 0]));
      g.add(mesh(new THREE.OctahedronGeometry(0.1), gem, [0, 1.45, 0.06]));
    },
  },
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, field, attack, tree, show, register }) {
  const { me } = player;
  const { mobs, aimAngle } = field;
  const { strikes, extendCombat, later } = attack;
  const { quietBuff, wtEmit } = tree;
  const { fx, audio, floatText, addShake } = show;

  // 狂戦士: 減ったHP10%ごとに +3%（捨て身は1.5倍）
  function axBers() {
    if (player.S?.wt?.ks1 !== 'ax_berserk' || !(player.S.mhp > 0)) return 0;
    const n = Math.floor(clamp(1 - me.hp / player.S.mhp, 0, 0.999) * 10) * 3;
    return player.S.wt.ks2 === 'ax_reckless' ? Math.min(40, n * 1.5) : n;
  }
  // 地割れ: 前へ一直線に地面が裂ける
  function axCrack(a, len, mult, stun) {
    const sx = me.x, sz = me.z;
    strikes.line(len, 2.2, mult, { type: 'heavy', a, sx, sz, stun, wtNo: true });
    for (let d = 1; d < len; d += 0.6) later(d * 0.02, () => fx.parts.burst(sx + Math.sin(a) * d, 0.2, sz + Math.cos(a) * d, 6, { color: 0xb89870, speed: 5, size: 0.5, life: 0.5, up: 3 }));
    fx.slash(sx, sz, a, len, 12, 0xd8b080, 1.2);
  }
  // 投斧（強攻撃）: 斧を投げる。8m先まで飛んで戻り、往復とも当たる
  function axThrow(lv) {
    const a = aimAngle(), M = TREE_MOTIONS.ax_throw, m = lv === 2 ? 2.6 : 1.6, W = player.S.wt, col = RARITIES[player.S.wr].color;
    me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration;
    const far = { x: me.x + Math.sin(a) * 8, z: me.z + Math.cos(a) * 8 }, rad = lv === 2 ? 1.6 : 1.2;
    later(M.hits[0], () => strikes.proj({ a, mult: m, type: 'heavy', speed: 20, life: 0.4, rad, shape: 'axe', stun: 6 }));
    const spin = W.ks2 === 'ax_storm' ? 2 : 0;
    for (let k = 0; k < spin * 4; k++) later(M.hits[0] + 0.4 + k * 0.25, () => { strikes.circle(far.x, far.z, 2.4, 0.5, { type: 'proc', stun: 1, wtNo: true }); fx.slash(far.x, far.z, k * 1.4, 2.4, 220, col, 0.8); });
    later(M.hits[0] + 0.4 + spin, () => {
      const ra = Math.atan2(me.x - far.x, me.z - far.z), t = Math.max(0.1, Math.hypot(me.x - far.x, me.z - far.z) / 20);
      strikes.proj({ a: ra, mult: m, type: 'heavy', speed: 20, life: t, rad, shape: 'axe', sx: far.x, sz: far.z, stun: 6 });
      if (W.ks2 === 'ax_catch') later(t, () => {
        if (me.dead) return;
        quietBuff('ax_catch', '受け止め', 3, { aspd: 25 }, 0xffb040);
        floatText(me.x, 3, me.z, '受け止め', 'just'); fx.ringWave(me.x, me.z, 0xffb040, 2, 0.3); audio.sfx('block');
      });
    });
  }

  // スキルに渡す文脈に、HPを払う道具を足す（c.pay: ブラッドラストA「血の代償」。0にはならない）
  extendCombat({
    pay(frac) { const d = Math.min(me.hp - 1, Math.round(player.S.mhp * frac)); if (d > 0) { me.hp -= d; floatText(me.x, 2.2, me.z, d, 'me'); } },
  });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('axe', {
    dmgMult(k, W, o, mb) {
      if (o.type !== 'proc') k *= 1 + axBers() / 100;
      if (W.br('ax_swing') === 'B' && o.type === 'normal' && me.combo === 2) k *= 1.3;
      if (W.br('ax_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
      if (W.ks2 === 'ax_shatter' && o.type === 'heavy' && mb?.kind === 2 && mb.stunT > 0) k *= 1.5;
      return k;
    },
    // 砕骨: スタン中のボスへの強攻撃は必ず会心
    critAfter: (mb, o) => player.S.wt?.ks2 === 'ax_shatter' && o.type === 'heavy' && mb.kind === 2 && mb.stunT > 0,
    // スタン値: 破砕・重圧（強攻撃）/ 揺さぶり（通常攻撃の3段目）
    stun(st, o) {
      const W = player.S.wt;
      if (W && o.type === 'heavy') st *= (W.ks1 === 'ax_crush' ? 2 : 1) * (W.br('ax_heavy') === 'B' ? 1.5 : 1); // 破砕・重圧
      if (W?.br('ax_brk') === 'B' && o.type === 'normal' && me.combo === 2) st *= 3; // 揺さぶり
      return st;
    },
    // 怒りの心得: 攻撃を受けると攻撃力アップ
    onHurt() {
      const W = player.S.wt;
      if (W.lv('ax_rage')) quietBuff('ax_rage', '怒り', 5, { atkp: W.v('ax_rage', 'rage'), ...(W.br('ax_rage') === 'A' ? { aspd: 15 } : {}), ...(W.br('ax_rage') === 'B' ? { dr: 15 } : {}) }, 0xff6a3a);
    },
    incoming: (raw) => (player.S.wt?.ks2 === 'ax_reckless' ? raw * 1.25 : raw), // 捨て身
    // 不死身: HPが0になる攻撃を1で耐える（60秒に1回）
    cheatDeath() {
      if (!(player.S.wt?.ks2 === 'ax_undying' && now() - (me.undyingT ?? -999) > 60)) return false;
      me.hp = 1; me.undyingT = now(); me.iframe = Math.max(me.iframe, 2);
      floatText(me.x, 2.8, me.z, '不死身!', 'just'); audio.sfx('perfect');
      fx.ringWave(me.x, me.z, 0xff3a3a, 3, 0.5); fx.flash(me.x, 1.5, me.z, 0xff3a3a, 50, 0.4);
      return true;
    },
    // 地砕き・剛力の心得A「地割れ」
    heavy(lv, a) {
      const W = player.S.wt;
      if (player.S.wk === 'axe' && W.ks1 !== 'ax_throw') {
        if (W.ks2 === 'ax_quake') later(0.16, () => axCrack(a, 9, 2.0, 6));
        else if (lv === 2 && W.br('ax_heavy') === 'A') later(0.16, () => axCrack(a, 7, 1.2, 3));
      }
    },
    heavyOverride(lv) { if (player.S.wt?.ks1 !== 'ax_throw') return false; axThrow(lv); return true; },
    swingAspd: (v) => v + axBers(),
    reach: (k, normal) => (player.S.wk !== 'axe' ? k : k * (normal && player.S.wt?.br('ax_swing') === 'A' ? 1.2 : 1)),
    aura(dt, W) {
      // 血の心得（渇き・血気）
      if (W.br('ax_blood') === 'A' && me.hp < player.S.mhp * 0.5) quietBuff('ax_thirst', '渇き', 0.3, { vamp: W.lv('ax_blood') >= 2 ? 3 : 2 }, 0xff3a3a);
      if (W.br('ax_blood') === 'B' && me.hp >= player.S.mhp) quietBuff('ax_full', '血気', 0.3, { atkp: 10 }, 0xff9a9a);
      // 破砕: ボスがスタンしたとき、周りに衝撃が走る
      if (W.ks1 === 'ax_crush') for (const mb of mobs.values()) {
        if (mb.kind !== 2) continue;
        if (!(mb.stunT > 0)) { mb.axBoom = false; continue; }
        if (mb.axBoom || now() - (mb.localT || 0) > 3) continue;
        mb.axBoom = true;
        const x = mb.x, z = mb.z;
        strikes.circle(x, z, 4 + mb.rad, 5.0, { type: 'proc', noProc: true });
        fx.ringWave(x, z, 0xffb040, 5 + mb.rad, 0.45); fx.flash(x, 1.5, z, 0xffb040, 60, 0.35);
        fx.parts.burst(x, 0.4, z, 60, { color: 0xc8a070, speed: 9, size: 0.6, life: 0.7, up: 3 });
        floatText(x, 4, z, '破砕!', 'just'); audio.sfx('impact'); addShake(0.5);
      }
      // 狂戦士: HPが減るほど、体から赤い湯気が立つ
      if (axBers() > 0) wtEmit('bers', axBers() * 1.2, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 1.6), me.z + rnd(-0.5, 0.5), { color: axBers() >= 20 ? 0xff2a1a : 0xff6a4a, size: 0.3, life: 0.6, speed: 1.2, gravity: -4 }));
    },
  }, { dmgMult: 2, onHurt: 0, heavy: 1, aura: 1, incoming: 1 });
}

// 武器の登録（weapons/index.js が集める）
//   tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'axe', tab: 3, glyph: '斧', tree: AXE, skills, mods, legacy, heavy, weaponSkills, model, effects };
