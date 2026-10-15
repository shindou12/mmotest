// 弓のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・構え・武器ツリーの効果。
// 登録は weapons/index.js に1行だけ。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）もここの stats（サーバーも読むので three.js は直接 import しない）
import { L3, T, at, spOff } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { clamp, now, rnd } from '../game/util.js';

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

// ---------------------------------------------------------------------------
// サーバーと共通の数値（shared/data.js の WEAPONS に集まる。サーバーもこのファイルを読む）
// weight: 装備重量（回避のクールタイムに影響） / stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ / melee: 近接武器（生存本能を持つ）
// 弓: 矢を飛ばす。弓を引くと足元から射程の円が広がり、矢はその円の端まで届く
//   baseRange: 引かずに撃つ矢の射程 / range: 最大射程 / draw: 弓を引く速さ（円が広がる速さ m/秒）。最大射程まで引くと最大の溜め撃ち
// ---------------------------------------------------------------------------
const stats = {
  name: '弓', skillPool: ['multishot', 'arrowrain', 'snipe', 'blast'], grip: 0, range: 22, arc: 0, speed: 0.4, mult: 0.6, weight: 3, stun: 0.3, ranged: true, baseRange: 9, draw: 14, offHand: true,
  passive: ['弓を引くと足元から射程の円が広がる（引かずに撃つ矢は9m・最大射程22m）', '最大射程まで引くと最大の溜め撃ち（弓を引く速さ 毎秒14m）'],
};

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '溜め撃ち', desc: '弓を引いて、貫通する矢を放つ（引くほど遠くまで届く）',
    run(c, lv) {
      // 射程は離したときの円の大きさ（main の c.range()）。最大射程まで引くと最大の溜め
      // 武器ツリー: 狙撃手は最大溜めが必ず会心 / 重矢は矢が太い
      const W = c.S?.().wt, snipe = lv === 2 && W?.ks1 === 'bw_sniper', fat = W?.br('bw_draw') === 'B' ? 1.5 : 1;
      c.arrow({ a: c.aim(), mult: lv === 2 ? 2.6 : 1.6, type: 'heavy', pierce: true, speed: 55, rad: (lv === 2 ? 1.2 : 0.8) * fat, big: true, range: c.range?.(), crit: snipe || undefined, snipe, full: lv === 2 });
    },
  };

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  multishot: {
    name: 'マルチショット', kind: 'bow', cd: 5, desc: '扇状に5本の矢を同時に放つ',
    run(c) { const a = c.aim(); for (let i = -2; i <= 2; i++) c.arrow({ a: a + i * 0.14, mult: 0.75, type: 'wskill' }); },
  },
  arrowrain: {
    name: 'アローレイン', kind: 'bow', cd: 7, desc: '狙った場所に矢の雨を降らせる',
    run(c) {
      const p = c.point();
      for (let i = 0; i < 8; i++) {
        c.later(0.15 + i * 0.07, () => {
          const x = p.x + (Math.random() - 0.5) * 4, z = p.z + (Math.random() - 0.5) * 4;
          c.circle(x, z, 1.6, 0.42, { type: 'wskill', stun: 0.5 });
          c.fx.parts.burst(x, 0.3, z, 8, { color: 0xd8e8ff, speed: 3, size: 0.35, life: 0.3 });
        });
      }
      c.fx.ringWave(p.x, p.z, 0xd8e8ff, 3.5, 0.6);
    },
  },
  snipe: {
    name: 'スナイプ', kind: 'bow', cd: 8, desc: '一瞬狙いを定め、最大射程まで貫く強力な一矢を放つ',
    run(c) {
      const a = c.aim();
      c.fx.parts.burst(c.me.x, 1.3, c.me.z, 16, { color: c.col(), speed: 2, size: 0.4, life: 0.35, gravity: 0 });
      c.later(0.3, () => c.arrow({ a, mult: 3.0, type: 'wskill', pierce: true, noZone: true, speed: 75, big: true, rad: 0.9 }));
    },
  },
  blast: {
    name: 'ボムアロー', kind: 'bow', cd: 7, desc: '狙った場所で爆発する矢を放つ',
    run(c) {
      const a = c.aim(), p = c.point();
      const d = Math.min(16, Math.hypot(p.x - c.me.x, p.z - c.me.z));
      const x = c.me.x + Math.sin(a) * d, z = c.me.z + Math.cos(a) * d;
      c.arrow({ a, mult: 0.5, type: 'wskill', noZone: true, speed: 40 });
      c.later(d / 40 + 0.05, () => {
        c.circle(x, z, 3.4, 2.2, { type: 'wskill', stun: 3 });
        c.fx.ringWave(x, z, 0xffa040, 3.8, 0.4);
        c.fx.parts.burst(x, 0.8, z, 60, { color: 0xffa040, speed: 9, size: 0.7, life: 0.6, gravity: -2 });
        c.shake(0.35); c.sfx('impact');
      });
    },
  },
};

// ---------------------------------------------------------------------------
// 形（models.js の makeWeapon が使う）。base が基本の形、styles が形違い
// ---------------------------------------------------------------------------
// kit: 形の道具（THREE・mesh・sphere・cone・cyl・lathe・extrude・bowString・toon）。models/weapon-models.js が渡す
const model = (kit) => {
  const { THREE, mesh, sphere, cyl, extrude, bowString, toon } = kit;
  const model = {
    base(k) {
      const { g, gold, grip, gem, rc, rarity } = k;
      const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
      const R = 0.8, arc = Math.PI * 0.72;
      const limb = new THREE.TorusGeometry(R, 0.045, 6, 28, arc);
      limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
      g.add(mesh(limb, wood));
      const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
      bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
      g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip, [0, 0, 0]));
      for (const s of [-1, 1]) g.add(mesh(sphere(0.06, 8, 6), gold, [sx, s * tip, 0]));
      g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
    },
    prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
      const { g, rc, rarity } = k;
      const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
      const string = (tip, sx) => bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
      return { wood, string };
    },
    styles: {
      1: (k) => { // 1: リカーブ（先端が反る） 2: ロングボウ（長い）
        const { g, grip, gem, wood, string, style } = k;
        const R = style === 2 ? 1.25 : 0.75, arc = style === 2 ? Math.PI * 0.62 : Math.PI * 0.66;
        const limb = new THREE.TorusGeometry(R, style === 2 ? 0.04 : 0.05, 6, 28, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
        g.add(mesh(limb, wood));
        const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
        if (style === 1) for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI * 0.8), wood, [sx + 0.1, s * tip, 0], [0, 0, s > 0 ? 0.3 : Math.PI - 0.3]));
        string(tip, sx);
        g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip));
        g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
      },
      2: (k) => model.styles[1](k), // 1 と同じ作り（style で長さが変わる）
      3: (k) => { // 専用: 三日月と刃の翼
        const { g, gold, gem, glowM, string } = k;
        const R = 0.85, arc = Math.PI * 0.8;
        const limb = new THREE.TorusGeometry(R, 0.05, 6, 32, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
        g.add(mesh(limb, toon(0xe8e0d0)));
        const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.18, 0.1 * s], [0.35, 0.45 * s], [0.12, 0.25 * s]], 0.025), glowM(1.3), [0.02, s * 0.2, 0]));
        string(tip, sx);
        g.add(mesh(cyl(0.06, 0.06, 0.3, 8), gold));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0.06, 0, 0]));
      },
    },
  };
  return model;
};

// ---------------------------------------------------------------------------
// 構え・振り（motions/index.js が近接の動きに上書きする）
// ---------------------------------------------------------------------------
// rig: 構えの道具（THREE・aimHand・orientWeapon・ease・applyMeleePose・spearPose）。motions/index.js が渡す
const motion = (rig) => {
  const { THREE, aimHand, ease } = rig;
  function applyBowPose(u, s) {
      const active = s.charging || s.swing >= 0;
      const draw = s.charging ? clamp(s.charge ?? 1, 0, 1) : s.swing >= 0 ? 1 - clamp(s.swing / .25, 0, 1) : 0;
      // Turn the torso side-on while the bow and head keep facing the aim direction.
      // Moving the bow forward alone lets its deep curve/string cut through the chest.
      const stance = s.bowStance ?? 1.0;
      u.body.rotation.y = stance;u.head.rotation.y = -stance;
      const aim = new THREE.Vector3(-Math.sin(stance), 0, Math.cos(stance));
      const grip = aimHand(u.armL, u.elbowL, new THREE.Vector3(-.10, s.bowHeight ?? (active ? 1.36 : 1.25), .53), new THREE.Vector3(-1, -.7, 0));
      const details = u.weaponModel.userData.bow;
      if (active && details) {
        const pull = .22 * draw;
        aimHand(u.armR, u.elbowR, grip.clone().addScaledVector(aim, details.sx - pull), new THREE.Vector3(1, 0, -.7));
        const pos = details.string.geometry.attributes.position;pos.setX(1, details.sx - pull);pos.needsUpdate = true;
        details.arrow.visible = s.charging || s.swing < .15;
        details.arrow.position.x = details.sx - pull;
      } else if (details) {
        details.string.geometry.attributes.position.setX(1, details.sx);details.string.geometry.attributes.position.needsUpdate = true;
        details.arrow.visible = false;
      }
      // Bow limbs remain vertical; its model's -90 degree yaw puts the string toward the torso.
      const handOrientation = u.armL.quaternion.clone().multiply(u.elbowL.quaternion);
      u.weapon.quaternion.copy(handOrientation).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -stance));
  }

  function applyBowSwing(u, s, e) {
    u.armR.rotation.set(-Math.PI / 2, 0, 0.1);u.armR.position.z = 0;
    u.armL.rotation.set(-Math.PI / 2 + 0.2, 0, -0.6 + e * 0.3);
    u.body.rotation.y = 0;
  }

  // 技（矢の技）の姿勢: 引き具合 p.draw で弓を引き、始めと終わりは構えから溶け込む
  function applyBowTechnique(u, s, t, p) {
    const time=s.motionT||0,blend=ease(Math.min(1,time/.08))*ease(Math.max(0,Math.min(1,(t.duration-time)/.12)));
    applyBowPose(u,{...s,charging:true,charge:p.draw,swing:-1,bowStance:1+p.bodyYaw,bowHeight:1.25+.11*blend});
    const idle=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.25,0,.12));u.armR.quaternion.copy(idle.slerp(u.armR.quaternion.clone(),blend));
    u.elbowR.quaternion.slerp(new THREE.Quaternion(),1-blend);
    u.weaponModel.userData.bow.arrow.visible=p.draw>.03;
    u.body.rotation.x=p.lean;u.body.position.y+=p.lift;
  }
  return {
      pose: applyBowPose, swing: applyBowSwing, technique: applyBowTechnique,
      afterSwing(u) { if (u.weapon) u.weapon.rotation.x = Math.PI / 2; },
      rest(u) { if (u.weapon) u.weapon.rotation.x = 0; },
    };
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, field, attack, tree, show, register }) {
  const { me } = player;
  const { mobs, world, heightAt, aimPoint } = field;
  const { strikes, extendCombat, later } = attack;
  const { quietBuff } = tree;
  const { fx, audio, floatText, addShake, trapMesh } = show;

  // 最大まで引いた矢（狙撃手）が当たった / 外れた: 鷹の目・狙い澄まし
  function bwSnipe(hit) {
    const W = player.S.wt;
    if (W?.ks2 === 'bw_hawk' && hit && now() - me.hawkT > 8) { me.hawkT = now(); me.iaiReady = true; fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3); }
    if (W?.ks2 === 'bw_aim') {
      me.aimN = hit ? Math.min(3, me.aimN + 1) : 0;
      me.buffs = me.buffs.filter((b) => b.id !== 'bw_aim');
      if (me.aimN > 0) me.buffs.push({ id: 'bw_aim', label: `狙い澄まし +${me.aimN * 10}%`, t: 1e9, max: 1e9, mods: {}, color: 0xffd84a });
    }
  }
  // 矢嵐: 狙った場所に矢の雨
  function bwRain(p) {
    for (let i = 0; i < 5; i++) later(0.12 + i * 0.07, () => {
      const x = p.x + rnd(-1.6, 1.6), z = p.z + rnd(-1.6, 1.6);
      fx.parts.burst(x, 6, z, 6, { color: 0xbfe8ff, speed: 2, size: 0.35, life: 0.3, gravity: 40 });
      later(0.15, () => { strikes.circle(x, z, 1.5, 0.5, { type: 'proc', noProc: true }); fx.ringWave(x, z, 0xbfe8ff, 1.6, 0.2); });
    });
  }
  // 罠（罠師の回避・置き矢）: 踏まれると発動。dodge: 罠師の罠（数に上限がある）
  function bwTrap(x, z, o) {
    const { g, ring, col } = trapMesh(o);
    g.position.set(x, heightAt(x, z), z);
    const t = { x, z, ...o, armAt: now() + (o.arm ?? 0.5), until: now() + o.life, area: world.area, mesh: g };
    fx.add(g, o.life + 0.2, (obj) => { ring.material.opacity = now() < t.armAt ? 0.2 : 0.4 + Math.sin(now() * 8) * 0.15; });
    if (o.dodge) {
      const mine = me.traps.filter((q) => q.dodge);
      if (mine.length >= (player.S.wt?.ks2 === 'bw_lure' ? 4 : 2)) bwTrapGone(mine[0]);
    }
    me.traps.push(t);
    fx.parts.burst(x, 0.3, z, 10, { color: col, speed: 2, size: 0.3, life: 0.3 });
    return t;
  }
  function bwTrapGone(t) {
    me.traps = me.traps.filter((q) => q !== t);
    const it = fx.items.find((q) => q.obj === t.mesh);
    if (it) it.life = 0;
  }
  function bwTrapTick() {
    for (const t of [...me.traps]) {
      if (t.area !== world.area || now() > t.until) { bwTrapGone(t); continue; }
      if (now() < t.armAt) continue;
      if (![...mobs.values()].some((mb) => mb.hp > 0 && Math.hypot(mb.x - t.x, mb.z - t.z) < t.r + mb.rad * 0.5)) continue;
      bwTrapGone(t);
      strikes.circle(t.x, t.z, t.r, t.mult, { type: t.dodge ? 'proc' : 'tskill', tech: 'bow_trap', stun: t.stun, noProc: t.dodge });
      fx.parts.burst(t.x, 0.4, t.z, 30, { color: t.color ?? 0xffc860, speed: 6, size: 0.4, life: 0.4, up: 3 }); fx.ringWave(t.x, t.z, t.color ?? 0xffc860, t.r + 0.4, 0.3);
      audio.sfx('hit');
    }
  }
  // 射抜き: 罠を矢で撃ち抜いて大爆発
  function bwBlast(t) {
    bwTrapGone(t);
    strikes.circle(t.x, t.z, 3.5, 3.5, { type: 'proc', noProc: true, stun: 6 });
    fx.ringWave(t.x, t.z, 0xff9a4a, 4, 0.4); fx.flash(t.x, 1.2, t.z, 0xff9a4a, 50, 0.3);
    fx.parts.burst(t.x, 0.6, t.z, 50, { color: 0xffb060, speed: 9, size: 0.55, life: 0.5, up: 3 });
    floatText(t.x, 2.6, t.z, '射抜き!', 'just'); audio.sfx('impact'); addShake(0.35);
  }

  // スキルに渡す文脈に、罠を置く道具を足す（c.trap）
  extendCombat({ trap: (x, z, o) => bwTrap(x, z, o) });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('bow', {
    // 弓: 引かずに撃つ射程（張り弦 +4m）・最大射程（遠見の心得）・弓を引く速さ（速引き +30%）。最大射程まで引いたら最大の溜め
    stats(S, WT, W) {
      S.chargeMax = S.chargeMax * (WT?.br('bw_draw') === 'A' ? 0.8 : 1);
      S.iframeBonus = S.iframeBonus + (WT?.br('bw_roll') === 'B' ? 0.1 : 0);
      S.bowBase = S.bowBase + (WT?.br('bw_zone') === 'A' ? 4 : 0);
      S.bowMax = S.bowMax + (WT ? WT.v('bw_zone', 'rng') : 0);
      S.bowDraw = S.bowDraw * (WT?.br('bw_draw') === 'A' ? 1.3 : 1);
      if (W.ranged) S.chargeMax = Math.max(0.3, (S.bowMax - S.bowBase) / S.bowDraw); // 弓: 最大射程まで引いたら最大の溜め
    },
    treeReset() { me.aimN = 0; },
    // 急所射ち・鋭矢
    critAdd: (v, o) => v + (player.S.wt?.br('bw_crit') === 'A' && o.full ? 15 : 0) + (player.S.wt?.br('bw_quiver') === 'A' && o.type === 'tskill' && player.S.wk === 'bow' ? 15 : 0),
    // 狙い澄まし
    dmgMult: (k, W, o) => (W.ks2 === 'bw_aim' && o.snipe ? k * (1 + 0.1 * me.aimN) : k),
    stun: (st, o) => (player.S.wt?.br('bw_draw') === 'B' && o.type === 'heavy' ? st * 1.5 : st), // 重矢
    afterCast() { if (player.S.wt.br('bw_quiver') === 'B') quietBuff('bw_quiverB', '余勢', 2, { aspd: 25 }, 0x9affc8); },
    // 回避した（受け身引き・速射・罠師）
    onDodge() {
      const W = player.S.wt;
      if (!W) return;
      if (W.br('bw_roll') === 'A') quietBuff('bw_rollA', '受け身引き', 1.4, { chargeRate: 100 }, 0x9ae8ff);
      if (W.ks2 === 'bw_quick') quietBuff('bw_quick', '速射', 1.5 + 0.38, { aspd: 40 }, 0x9affc8);
      if (W.ks1 === 'bw_trapper' && now() - me.trapT >= 2) {
        me.trapT = now();
        const lure = W.ks2 === 'bw_lure';
        bwTrap(me.x, me.z, { mult: 2.0 * (lure ? 1.3 : 1), r: 1.8, stun: lure ? 15 : 3, life: 15, arm: 0.5, dodge: true });
      }
    },
    // 連射: 通常攻撃で2本ずつ（矢嵐: 5回ごとに矢の雨）
    shoot(a, mult) {
      if (player.S.wt?.ks1 !== 'bw_rapid') return false;
      for (const d of [-0.04, 0.04]) strikes.arrow({ a: a + d, mult: mult * 0.75, type: 'normal' });
      if (player.S.wt.ks2 === 'bw_storm' && ++me.stormN % 5 === 0) bwRain(aimPoint());
      return true;
    },
    // 最大まで引いた矢: 反動と、射程いっぱいの輪
    heavyStart(lv) { if (player.S.wk === 'bow' && lv === 2) { me.motion = 'bw_full'; me.motionT = 0; fx.ringWave(me.x, me.z, 0xffd84a, player.S.bowMax, 0.35); } },
    iaiLabel: (label) => (player.S.wk === 'bow' ? '鷹の目' : label),
    // 射抜き: 自分の罠を矢で射抜くと大爆発
    arrowTick(w) {
      if (player.S.wt?.ks2 === 'bw_shot' && !w.trapShot) {
        const tr = me.traps.find((q) => q.dodge && Math.hypot(q.x - w.x, q.z - w.z) < 1.3);
        if (tr) { w.trapShot = true; bwBlast(tr); }
      }
    },
    // 遠矢: 射程の端（8割より先）で当たると +20%
    arrowEdge: (w, d) => player.S.wt?.br('bw_zone') === 'B' && d >= w.range * 0.8,
    arrowHit(w) { if (w.snipe && !w.snipeDone) { w.snipeDone = true; bwSnipe(true); } },
    arrowGone(w) { if (w.snipe && !w.snipeDone) bwSnipe(false); },
    aura() { bwTrapTick(); },
  }, { dmgMult: 1, critAdd: 1, heavyStart: 2, aura: 0, afterCast: 1 });
}

// 武器の登録（weapons/index.js が集める）
//   kindOrder・stats: サーバーと共通の数値（WEAPONS の並び順と中身） / tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'bow', kindOrder: 5, stats, tab: 6, glyph: '弓', tree: BOW, skills, mods, legacy, heavy, weaponSkills, model, motion, effects };
