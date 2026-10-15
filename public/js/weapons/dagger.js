// 短剣のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・武器ツリーの効果。
// 登録は weapons/index.js に1行だけ。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）もここの stats（サーバーも読むので three.js は直接 import しない）
import { L3, T, at } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { angDiff, degToRad, now } from '../game/util.js';

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

// ---------------------------------------------------------------------------
// サーバーと共通の数値（shared/data.js の WEAPONS に集まる。サーバーもこのファイルを読む）
// weight: 装備重量（回避のクールタイムに影響） / stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ / melee: 近接武器（生存本能を持つ）
// ---------------------------------------------------------------------------
const stats = {
  name: '短剣', skillPool: ['shadow', 'phantom', 'fan', 'venom'], grip: -0.08, range: 2.3, arc: 90, speed: 0.26, mult: 0.68, weight: 2, stun: 0.6, melee: true,
  passive: [], // 短剣は武器ツリー（熟練度）で決める
  skill: { name: 'シャドウ・ダンス', cd: 4.5, desc: '目にも止まらぬ五連撃', mult: 1.0 },
};

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '瞬影', desc: '敵の間をすり抜けながら切り裂く（無敵あり）',
    run(c, lv) {
      // 武器ツリー「影歩き」: A は距離と無敵が伸び、B は通り抜けた敵に毒
      const a = c.aim(), sx = c.me.x, sz = c.me.z, W = c.S().wt, far = W?.br('dk_shadow') === 'A' ? 1.3 : 1;
      const len = (lv === 2 ? 7.5 : 6) * far;
      c.dash(a, len, 0.18, far > 1 ? 0.5 : 0.3);
      c.later(0.16, () => {
        c.line(len, 2.4, lv === 2 ? 2.8 : 1.8, { type: 'heavy', a, sx, sz, poison: W?.br('dk_shadow') === 'B' ? 2 : 0 });
        c.fx.slash(c.me.x, c.me.z, a + Math.PI, 2.5, 160, c.col(), 1.0);
      });
    },
  };

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  shadow: {
    name: 'シャドウ・ダンス', kind: 'dagger', cd: 4.5, desc: '目にも止まらぬ五連撃',
    run(c) {
      for (let i = 0; i < 5; i++) {
        c.later(0.05 + i * 0.09, () => {
          c.arc(3.0, 150, 1.0, { type: 'wskill' });
          c.fx.slash(c.me.x, c.me.z, c.me.a + (Math.random() - 0.5) * 0.8, 3.0, 120, c.col(), 0.8 + i * 0.12, i % 2 === 1);
          c.sfx('swing');
        });
      }
    },
  },
  phantom: {
    name: 'ファントム・レイド', kind: 'dagger', cd: 6, desc: '近くの敵の背後へ瞬間移動し、必ず会心の一撃',
    run(c) {
      const t = c.nearest(11);
      if (!t) { c.dash(c.aim(), 5, 0.15, 0.3); return; }
      const back = t.a + Math.PI;
      c.fx.parts.burst(c.me.x, 1, c.me.z, 25, { color: 0x6a4aff, speed: 4, size: 0.5, life: 0.5 });
      c.me.x = t.x + Math.sin(back) * (t.rad + 1); c.me.z = t.z + Math.cos(back) * (t.rad + 1);
      c.me.a = Math.atan2(t.x - c.me.x, t.z - c.me.z); c.me.iframe = Math.max(c.me.iframe, 0.3);
      c.fx.parts.burst(c.me.x, 1, c.me.z, 25, { color: 0x6a4aff, speed: 4, size: 0.5, life: 0.5 });
      c.later(0.08, () => { c.hit(t, 3.5, { type: 'wskill', crit: true }); c.fx.slash(c.me.x, c.me.z, c.me.a, 2.5, 140, c.col(), 1.1); });
    },
  },
  fan: {
    name: '扇投げ', kind: 'dagger', cd: 5, desc: '扇状に7本のナイフを投げる（距離でダメージが落ちない）',
    run(c) {
      const a = c.aim();
      for (let i = -3; i <= 3; i++) c.arrow({ a: a + i * 0.12, mult: 0.62, type: 'wskill', noZone: true, speed: 36, rad: 0.55, color: 0xd8e0f0 });
    },
  },
  venom: {
    name: 'ヴェノム・ファング', kind: 'dagger', cd: 8, desc: '素早く三度斬りつけ、6秒間 攻撃に毒が乗るようになる',
    run(c) {
      c.buff('poison', '毒刃', 6, {}, 0x8aff5a);
      for (let i = 0; i < 3; i++) {
        c.later(i * 0.1, () => {
          c.arc(2.9, 140, 0.9, { type: 'wskill' });
          c.fx.slash(c.me.x, c.me.z, c.me.a + (i - 1) * 0.3, 2.9, 120, 0x8aff5a, 0.9, i % 2 === 1);
          c.sfx('swing');
        });
      }
    },
  },
};

// ---------------------------------------------------------------------------
// 形（models.js の makeWeapon が使う）。base が基本の形、styles が形違い
// ---------------------------------------------------------------------------
// kit: 形の道具（THREE・mesh・sphere・cone・cyl・lathe・extrude・bowString・toon）。models/weapon-models.js が渡す
const model = (kit) => {
  const { THREE, mesh, sphere, cyl, extrude } = kit;
  const model = {
    base(k) {
      const { g, steel, gold, gem, edge, handle } = k;
      const pts = [[-0.06, 0], [0.065, 0], [0.07, 0.4], [0.02, 0.72], [-0.04, 0.5]];
      edge(pts, 0.03);
      g.add(mesh(extrude(pts, 0.03), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), gold, [0, 0.1, 0]));
      g.add(mesh(sphere(0.035, 8, 6), gem, [0, 0.11, 0.03]));
      handle(0.3, 0.03);
    },
    styles: {
      1: (k) => { // クナイ: 菱形の刃と輪の柄頭
        const { g, gold, grip, blade } = k;
        blade([[0, 0], [0.07, 0.25], [0, 0.65], [-0.07, 0.25]], 0.035);
        g.add(mesh(cyl(0.028, 0.028, 0.3, 8), grip, [0, -0.08, 0]));
        g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 12), gold, [0, -0.28, 0]));
      },
      2: (k) => { // クリス: 波打つ刃
        const { g, gold, handle, blade } = k;
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.05 + Math.sin(t * 14) * 0.025 - t * 0.04, t * 0.7]); }
        pts.push([0, 0.78]);
        for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push([-(0.05 + Math.sin(t * 14 + 1.2) * 0.025 - t * 0.04), t * 0.7]); }
        blade(pts, 0.03);
        g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), gold, [0, 0.1, 0]));
        handle(0.28, 0.028);
      },
      3: (k) => { // 専用: 月の形の双刃
        const { g, steel, gem, handle, glowM, blade } = k;
        blade([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]], 0.03, 0.12, glowM(1.2));
        g.add(mesh(extrude([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]].map(([x, y]) => [-x * 0.7, y * 0.8]), 0.025), steel, [0, 0.12, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.05), gem, [0, 0.1, 0.03]));
        handle(0.3, 0.03);
      },
    },
  };
  return model;
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, attack, tree, show, register }) {
  const { me, hasBuff } = player;
  const { strikes, dealDamage, extendCombat, later } = attack;
  const { quietBuff } = tree;
  const { fx, audio, floatText } = show;

  // 敵の背後にいるか（敵の向きから120度以上うしろ）
  function wtBehind(mb) {
    if (!mb || mb.a == null) return false;
    return Math.abs(angDiff(Math.atan2(me.x - mb.x, me.z - mb.z), mb.a)) > degToRad(120);
  }
  // 毒・出血の強さ（毒の心得）と時間（長毒）
  const wtToxMul = () => 1 + (player.S.wt?.lv('dk_toxin') ? (player.S.wt.lv('dk_toxin') >= 2 ? 50 : 30) : 0) / 100;
  const wtToxDur = () => 4 * (player.S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
  // 毒を重ねる（最大5。1つにつき毎秒15%）。猛毒は5つで破裂
  function addPoison(mb, n) {
    if (!mb || mb.hp <= 0 || !(n > 0)) return;
    mb.vStack = Math.min(5, (mb.vStack || 0) + n);
    mb.poisonUntil = now() + wtToxDur();
    if (player.S.wt?.ks2 === 'dk_burst' && mb.vStack >= 5) {
      mb.vStack = 0; mb.poisonUntil = 0;
      later(0.05, () => {
        if (mb.hp <= 0) return;
        dealDamage(mb, 3.0, { type: 'proc', noProc: true, wtNo: true });
        fx.parts.burst(mb.x, 1.2, mb.z, 40, { color: 0x8aff5a, speed: 7, size: 0.6, life: 0.6, gravity: 1 });
        fx.ringWave(mb.x, mb.z, 0x8aff5a, 2.6, 0.35); audio.sfx('hit', { crit: true });
      });
    }
  }
  // 毒の1回（0.5秒ごと）のダメージ。ポイズン・エッジA「致死毒」の効果中は2倍
  const wtPoisonTick = (mb) => 0.075 * mb.vStack * wtToxMul() * (player.S.wt?.br('dk_poison') === 'A' && hasBuff('dk_poison') ? 2 : 1);
  // 出血（毎秒 perSec。stack なら最大3まで重なる）
  function addBleed(mb, perSec, stack = false, sec = 4) {
    if (!mb || mb.hp <= 0) return;
    mb.bleedN = stack ? Math.min(3, (mb.bleedN || 0) + 1) : 1;
    mb.bleedPow = Math.max(stack ? perSec * mb.bleedN : perSec, mb.bleedUntil > now() && !stack ? mb.bleedPow || 0 : 0);
    mb.bleedUntil = now() + sec * (player.S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
  }

  // スキルに渡す文脈に、毒と出血を足す（c.poison / c.bleed）
  extendCombat({
    poison: (mb, n) => addPoison(mb, n),
    bleed: (mb, perSec, stack) => addBleed(mb, perSec, stack),
    ambush(n) { me.ambush = Math.max(me.ambush, n); }, // スモーク・ステップ: 次の n 撃は必ず会心
  });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('dagger', {
    // 連撃（当てるたびに攻撃の速さ）: 連撃の心得・連刃・疾風 / 身軽B
    stats(S, WT) {
      if (WT?.br('dk_agile') === 'B') S.dodgeDist = 1.3;
      if (S.wk === 'dagger') S.dStackPer = !WT ? 4 : WT.lv('dk_combo') ? WT.v('dk_combo', 'per') : WT.ks1 === 'dk_blades' ? 4 : 0;
      if (WT?.ks1 === 'dk_blades') S.dStackMax = 15;
      S.dStackT = (WT?.br('dk_combo') === 'A' ? 5 : 3) * (WT?.ks2 === 'dk_gale' ? 2 : 1);
    },
    dmgMult(k, W, o, mb, crit) {
      if (W.ks2 === 'dk_spread' && mb?.vStack) k *= 1 + 0.04 * mb.vStack;
      if (W.br('dk_combo') === 'B' && me.dStack >= player.S.dStackMax) k *= 1.06;
      if (W.ks1 === 'dk_assassin' && o.type !== 'proc' && wtBehind(mb)) k *= 1.2 * (W.ks2 === 'dk_exec' && crit && mb.kind === 2 ? 1.4 : 1);
      return k;
    },
    // 暗殺: 背後は必ず会心
    critAfter: (mb, o) => !!player.S.wt && wtBehind(mb) && player.S.wt.ks1 === 'dk_assassin' && o.type !== 'dot' && o.type !== 'proc',
    // スモーク・ステップB「奇襲」: 奇襲の会心 +50%
    ambushMult: (k, ambushed) => (ambushed && player.S.wt?.br('dk_smoke') === 'B' ? 1.5 : k),
    // 必殺: 背後の会心で弱った雑魚はとどめ
    finisher(dmg, mb, crit, o) {
      if (player.S.wt?.ks2 === 'dk_exec' && crit && mb.kind !== 2 && mb.hp <= mb.mhp * 0.25 && wtBehind(mb) && o.type !== 'dot' && dmg < mb.hp) {
        dmg = mb.hp;
        floatText(mb.x, 3, mb.z, '必殺', 'just'); fx.flash(mb.x, 1.4, mb.z, 0xcab4ff, 40, 0.3);
        fx.slash(mb.x, mb.z, me.a, 2.2, 40, 0xffffff, 1.2); fx.parts.burst(mb.x, 1.2, mb.z, 30, { color: 0xcab4ff, speed: 7, size: 0.45, life: 0.5 });
      }
      return dmg;
    },
    // 毒・出血を重ねる / 連刃の二重斬り
    onHit(mb, dmg, crit, o, mult) {
      const W = player.S.wt;
      if (o.poison) addPoison(mb, o.poison);
      if (W.ks1 === 'dk_venom') addPoison(mb, 1);
      if (hasBuff('dk_poison')) addPoison(mb, 1);
      if (W.br('dk_toxin') === 'B' && o.type === 'normal' && me.combo === 2) addPoison(mb, 1);
      if (crit && W.br('dk_vitalp') === 'B') addBleed(mb, 0.2, false, 3);
      if (W.ks1 === 'dk_blades' && me.dStack >= player.S.dStackMax && o.type === 'normal') later(0.07, () => { if (mb.hp > 0) { dealDamage(mb, mult * 0.4, { type: 'proc', noProc: true, wtNo: true }); fx.slash(mb.x, mb.z, me.a + Math.PI, 1.6, 120, 0xcab4ff, 0.6, true); } });
    },
    // 毒・出血の1回（0.5秒ごと）
    poisonTick: (v, mb) => wtPoisonTick(mb),
    bleedMul: (k) => k * wtToxMul(),
    // 疾風: 連撃が最大の間は移動が速い
    aura(dt, W) { if (W.ks2 === 'dk_gale' && me.dStack >= player.S.dStackMax) quietBuff('dk_gale', '疾風', 0.3, { move: 25 }, 0x9affc8); },
    // 千本: 3段目は手首でナイフを3本投げる
    swingLate(a) {
      if (player.S.wt?.ks2 === 'dk_thousand' && me.combo === 2 && me.dStack >= player.S.dStackMax) {
        me.motion = 'dk_thousand'; me.motionT = 0;
        later(TREE_MOTIONS.dk_thousand.hits[0], () => { for (const d of [-0.22, 0, 0.22]) strikes.arrow({ a: a + d, mult: 0.35, type: 'proc', noZone: true, speed: 40, color: KNIFE_COLOR }); });
      }
    },
    // 瞬影は溜めきったときだけ（途中で離したら通常攻撃）
    heavyNeedsFull: () => player.S?.wk === 'dagger',
    heavyStart() { if (player.S.wk === 'dagger') { me.motion = 'dk_blink'; me.motionT = 0; } }, // 瞬影: 低く駆け抜けながら斬る
    // 影渡り: すり抜けたら敵のほうへ向き直る
    heavyAfter() { if (player.S.wk === 'dagger' && player.S.wt?.ks2 === 'dk_step') later(0.24, () => { me.a += Math.PI; me.afterJust = true; me.motion = 'dk_step_turn'; me.motionT = 0; floatText(me.x, 3, me.z, '影渡り', 'just'); fx.ringWave(me.x, me.z, 0xcab4ff, 2.2, 0.3); }); },
    // 残影: JUST回避の次の1撃は会心
    justDodge() { if (player.S.wt?.br('dk_agile') === 'A') me.ambush = Math.max(me.ambush, 1); },
  }, { dmgMult: 0, onHit: 2, heavyStart: 1, aura: 3, justDodge: 1, swingLate: 1 });
}

// 武器の登録（weapons/index.js が集める）
//   kindOrder・stats: サーバーと共通の数値（WEAPONS の並び順と中身） / tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'dagger', kindOrder: 3, stats, tab: 5, glyph: '短', tree: DAGGER, skills, mods, legacy, heavy, weaponSkills, model, effects };
