// 盾槍のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・構え・武器ツリーの効果。
// 登録は weapons/index.js に1行だけ。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）もここの stats（サーバーも読むので three.js は直接 import しない）
import { L3, T, at, spOff } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { SPEAR_TIMINGS, repeatHitAt } from '../../shared/skill-timings.js';
import { now, rnd } from '../game/util.js';

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

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['spear_'], slots: ['shieldbash', 'taunt', 'spear_fan', 'spear_sweep', 'spear_press', 'spear_stake', 'spear_intercept'] };

// ---------------------------------------------------------------------------
// サーバーと共通の数値（shared/data.js の WEAPONS に集まる。サーバーもこのファイルを読む）
// weight: 装備重量（回避のクールタイムに影響） / stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ / melee: 近接武器（生存本能を持つ）
// ---------------------------------------------------------------------------
const stats = {
  // 盾槍: 強攻撃を溜めている間はガード。ヘイトを集めやすい
  name: '盾槍', skillPool: ['lance', 'helix', 'piercer', 'whirlspear'], grip: 0.45, range: 4.3, arc: 45, speed: 0.5, mult: 1.1, weight: 8, guard: true, stun: 1.3, melee: true, shield: 'kite', threat: 2,
  passive: ['強攻撃を溜めている間はガード。ガードで攻撃を受けてから離すと「ガードカウンター」（一回転して周りを大きくなぎ払う）'],
  skill: { name: 'ライトニング・ランス', cd: 5.5, desc: '直線上を雷光で貫く', mult: 3.0 },
};

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '溜め突き', desc: '踏み込みながら遠くまで貫く',
    run(c, lv) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z, k = c.reach ? c.reach(false) : 1; // 騎士の雷で届く距離が伸びる
      c.dash(a, 3, SPEAR_TIMINGS.heavy.dashDuration, 0);
      c.later(SPEAR_TIMINGS.heavy.hitAt, () => {
        c.line((lv === 2 ? 8 : 6.5) * k, 2.0, lv === 2 ? 3.8 : 2.4, { type: 'heavy', a, sx, sz });
        for (let d = 0; d < 8 * k; d += 0.5) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: c.col(), size: 0.5, life: 0.35, speed: 1, gravity: 0 });
      });
    },
  };

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  lance: {
    motion: 'lance',
    name: 'ライトニング・ランス', kind: 'spear', cd: 5.5, desc: '直線上を雷光で貫く',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.later(SPEAR_TIMINGS.lance.hitAt, () => {
        c.line(12, 2.2, 3.0, { type: 'wskill', a, sx, sz });
        c.sfx('thunder');
        for (let d = 0; d < 12; d += 0.4) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: 0xbfe0ff, size: 0.7, life: 0.45, speed: 2, gravity: 0 });
        c.fx.lightning(sx + Math.sin(a) * 10, sz + Math.cos(a) * 10, 0xbfe0ff);
      });
    },
  },
  helix: {
    motion: 'helix',
    name: 'ヘリカル・スラスト', kind: 'spear', cd: 5, desc: '目にも留まらぬ5連突き。最後の一撃が重い',
    run(c) {
      const a = c.aim();
      for (let i = 0; i < SPEAR_TIMINGS.helix.count; i++) {
        c.later(repeatHitAt(SPEAR_TIMINGS.helix, i), () => {
          const aa = a + (Math.random() - 0.5) * 0.25;
          c.line(5.2, 1.6, i === SPEAR_TIMINGS.helix.count - 1 ? 1.8 : 0.8, { type: 'wskill', a: aa });
          for (let d = 1; d < 5; d += 0.6) c.fx.parts.emit(c.me.x + Math.sin(aa) * d, 1.1, c.me.z + Math.cos(aa) * d, { color: c.col(), size: 0.4, life: 0.25, speed: 0.5, gravity: 0 });
          c.sfx('swing');
        });
      }
    },
  },
  piercer: {
    motion: 'piercer',
    name: 'ソニック・ピアス', kind: 'spear', cd: 7, desc: '一直線に突進し、通り道の敵をまとめて貫く（無敵あり・ヘイト大）',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.dash(a, 8, SPEAR_TIMINGS.piercer.dashDuration, 0.3);
      c.later(SPEAR_TIMINGS.piercer.hitAt, () => {
        c.line(8.5, 2.4, 2.6, { type: 'wskill', a, sx, sz, threat: 3 });
        for (let d = 0; d < 8; d += 0.5) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: c.col(), size: 0.6, life: 0.4, speed: 1, gravity: 0 });
        c.sfx('wave');
      });
    },
  },
  whirlspear: {
    motion: 'whirlspear',
    name: '旋風槍', kind: 'spear', cd: 6, desc: '槍を3回振り回して周りを薙ぎ、近くの敵の注意を引きつける',
    spin: true,
    run(c) {
      c.taunt(9);
      for (let i = 0; i < SPEAR_TIMINGS.whirlspear.count; i++) {
        c.later(repeatHitAt(SPEAR_TIMINGS.whirlspear, i), () => {
          c.circle(c.me.x, c.me.z, 3.4, 1.0, { type: 'wskill', threat: 2 });
          c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.4, 0.25);
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
  const { THREE, mesh, sphere, cone, cyl, extrude, toon } = kit;
  const model = {
    base(k) {
      const { g, steel, gold, gem, edge, rc, rarity } = k;
      g.add(mesh(cyl(0.035, 0.04, 2.9, 8), toon(0x6a4428), [0, 0.95, 0]));
      for (const y of [0.1, 0.55, 2.3]) g.add(mesh(new THREE.TorusGeometry(0.045, 0.014, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
      const pts = [[0, 0], [0.11, 0.18], [0.07, 0.55], [0, 0.78], [-0.07, 0.55], [-0.11, 0.18]];
      edge(pts.map(([x, y]) => [x, y + 2.42]), 0.04);
      g.add(mesh(extrude(pts, 0.04), steel, [0, 2.42, 0]));
      g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.4, 0]));
      const tassel = mesh(cone(0.08, 0.35, 8), toon(rarity >= 2 ? rc : 0xb03030), [0, 2.18, 0], [Math.PI, 0, 0]);
      g.add(tassel);
    },
    prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
      const { g } = k;
      const shaft = (len, col = 0x6a4428) => g.add(mesh(cyl(0.035, 0.04, len, 8), toon(col), [0, len / 2 - 0.5, 0]));
      return { shaft };
    },
    styles: {
      1: (k) => { // ハルバード: 斧頭と突起
        const { g, steel, gold, blade, shaft } = k;
        shaft(2.9);
        blade([[0, 0], [0.06, 0.25], [0, 0.6], [-0.06, 0.25]].map(([x, y]) => [x, y]), 0.04, 2.4);
        blade([[0.03, -0.18], [0.42, -0.3], [0.48, 0], [0.42, 0.3], [0.03, 0.18]], 0.05, 2.2);
        g.add(mesh(cone(0.04, 0.22, 6), steel, [-0.13, 2.2, 0], [0, 0, 1.57]));
        g.add(mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10), gold, [0, 2.0, 0], [Math.PI / 2, 0, 0]));
      },
      2: (k) => { // 三叉槍
        const { g, gold, gem, blade, shaft } = k;
        shaft(2.8, 0x4a4a58);
        for (const s of [-1, 0, 1]) blade([[-0.035, 0], [0.035, 0], [0, s ? 0.45 : 0.6]], 0.03, 2.35 + (s ? 0 : 0.05)).position.x = s * 0.15;
        g.add(mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), gold, [0, 2.33, 0]));
        g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.26, 0]));
      },
      3: (k) => { // 専用: 翼のある光の槍
        const { g, gold, gem, glowM, blade, shaft } = k;
        shaft(3.1, 0xe8e0d0);
        blade([[0, 0], [0.12, 0.25], [0.06, 0.8], [0, 1.0], [-0.06, 0.8], [-0.12, 0.25]], 0.04, 2.45, glowM(1.3));
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.4, 0.3], [0.3, 0.1], [0.45, 0.05], [0.1, -0.1]].map(([x, y]) => [x * s, y]), 0.025), gold, [0, 2.35, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 2.38, 0]));
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
  const { THREE, aimHand, orientWeapon, spearPose } = rig;
  function applySpearPose(u, s) {
      const p = spearPose(s);
      u.armR.position.z = 0;
      u.body.rotation.y = p.yaw;
      if (!(s.dodge > 0) && !(s.hurt > 0)) u.body.rotation.x = p.lean;
      const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(1, -.6, -.3));
      // Thrust stays on the aiming line while the torso turns; sweeps extend sideways.
      const yaw = p.lateral ? Math.PI / 2 * (p.side ?? 1) : -p.yaw;
      orientWeapon(u, yaw, p.pitch);
      // 竜騎士（盾を背負っている）: 左手も柄の後ろを握って両手で持つ
      if (s.shieldBack && grip) {
        const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(yaw) * Math.cos(p.pitch));
        aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, -.3), new THREE.Vector3(-1, -.6, -.2));
      }
      if (p.step) { u.legs[0].rotation.x = -p.step;u.legs[1].rotation.x = p.step; }
  }

  function applySpearSwing(u) {
    u.armR.position.z = 0;u.body.rotation.y = 0;
  }
  return { pose: applySpearPose, swing: applySpearSwing };
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, field, attack, tree, show, register }) {
  const { me, hasBuff, setHitStop } = player;
  const { aimAngle, aimPoint } = field;
  const { strikes, dealDamage, SWEEP, ATK_TYPES, later } = attack;
  const { quietBuff, wtEmit } = tree;
  const { fx, audio, floatText, addShake, bannerMesh, handTracker } = show;

  // 攻撃が槍の先端で当たったか（間合い）: 1 = 先端 / -1 = 近すぎ / 0 = それ以外・対象外
  function spTip(o) {
    if (player.S.wt?.ks1 !== 'sp_reach' || o.tip == null || !ATK_TYPES.includes(o.type)) return 0;
    return o.tip >= 0.7 ? 1 : o.tip < 0.4 ? -1 : 0;
  }
  // 突きの届く距離の倍率（槍の心得A「長柄」は通常攻撃だけ・騎士の雷は突き全部）
  const spReach = (normal) => (normal && player.S.wt?.br('sp_spear') === 'A' ? 1.2 : 1) * (hasBuff('sp_thunder') ? 1.5 : 1);
  // 騎士: 突きが雷をまとう
  function spThunder() {
    if (!hasBuff('sp_thunder')) { fx.lightning(me.x, me.z, 0x9ad8ff); audio.sfx('thunder'); }
    quietBuff('sp_thunder', '雷槍', 3, {}, 0x9ad8ff);
  }
  // 竜騎士の強攻撃: 高く跳んで狙った場所へ突き降りる（空中は無敵）
  const JUMP = { air: 0.55, mult: [0, 5.0, 7.5], range: [0, 5, 8], r: 2.5 };
  function spJump(lv, soared = false) {
    const p = aimPoint(), a = Math.atan2(p.x - me.x, p.z - me.z);
    const d = Math.min(JUMP.range[lv], Math.hypot(p.x - me.x, p.z - me.z));
    const M = TREE_MOTIONS.sp_jump;
    me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
    strikes.dash(a, Math.max(0.01, d), JUMP.air, JUMP.air + 0.15);
    fx.parts.burst(me.x, 0.3, me.z, 18, { color: 0xd8c8a8, speed: 4, size: 0.45, life: 0.4, up: 3 });
    audio.sfx('dodge');
    later(JUMP.air, () => {
      if (me.dead) return;
      strikes.circle(me.x, me.z, JUMP.r, JUMP.mult[lv], { type: 'heavy', stun: 10 });
      fx.ringWave(me.x, me.z, player.weaponColor(), JUMP.r + 0.6, 0.35); fx.flash(me.x, 1, me.z, 0xffffff, 40, 0.25);
      fx.parts.burst(me.x, 0.3, me.z, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
      audio.sfx('heavy'); addShake(lv === 2 ? 0.5 : 0.3); setHitStop(0.06);
      if (player.S.wt?.ks2 === 'sp_fang') later(0.08, () => { // 竜の牙: 着地点から衝撃が広がる
        strikes.circle(me.x, me.z, 4.5, 3.0, { type: 'heavy', stun: 20 });
        fx.ringWave(me.x, me.z, 0xff8a4a, 5, 0.45); fx.parts.burst(me.x, 0.4, me.z, 50, { color: 0xff8a4a, speed: 9, size: 0.55, life: 0.6, up: 2 }); addShake(0.4);
      });
      if (player.S.wt?.ks2 === 'sp_soar' && !soared) { me.soarReady = now() + 1.5; fx.ringWave(me.x, me.z, 0x9affc8, 1.6, 0.3); }
    });
  }
  // 旗手: ガードカウンターした場所に旗を立てる
  function spBanner(x, z) {
    const old = me.banner && fx.items.find((it) => it.obj === me.banner.mesh);
    if (old) old.life = 0; // 前の旗は消す
    const { g, flag, ring } = bannerMesh();
    g.position.set(x, 0, z);
    fx.add(g, 8, (o, k) => { flag.rotation.y = Math.sin(k * 40) * 0.3; ring.material.opacity = 0.35 * (1 - k * 0.5); });
    me.banner = { x, z, until: now() + 8, mesh: g };
    fx.beam(x, z, 0x6ab0ff, 4, 0.5, 0.5);
  }
  // 一点突破: 溜めた次の突きが前方を貫く衝撃になる
  function spPierce(a) {
    if (!me.pierceReady) return;
    me.pierceReady = false;
    strikes.proj({ a, mult: 1.6, type: 'normal', speed: 30, life: 0.45, rad: 1.3, color: 0xfff0a0, wtNo: true });
    fx.flash(me.x, 1.3, me.z, 0xfff0a0, 30, 0.2);
  }
  const handPos = handTracker();

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('spear', {
    // 竜騎士はガードの代わりに跳ぶ
    stats(S, WT) { S.guard = S.guard && WT?.ks1 !== 'sp_dragoon'; },
    dmgMult(k, W, o, mb) {
      const tip = spTip(o);
      if (tip === 1) k *= 1.25; else if (tip === -1) k *= 0.8;
      if (hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy')) k *= 1.2;
      if (W.br('sp_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
      return k;
    },
    // 間合い: 槍の先端は必ず会心
    critAfter: (mb, o) => spTip(o) === 1,
    // 間合い支配: 先端で当てた雑魚を押し戻す
    hitTech: (tech, o, mb) => (player.S.wt?.ks2 === 'sp_hold' && spTip(o) === 1 && mb.kind !== 2 ? 'spear_press' : tech),
    // 範囲攻撃の当たり: 間合いのときは、届く距離のどのあたりで当たったか（tip）を付ける
    hitOpts: (o, frac) => (player.S.wt?.ks1 === 'sp_reach' ? { ...o, tip: frac } : o),
    reach: (k, normal) => (player.S.wk !== 'spear' ? k : k * spReach(normal)),
    swingColor: (col) => (hasBuff('sp_thunder') ? 0x9ad8ff : col),
    // 槍の心得B「連突き」と一点突破（通常攻撃）
    swingExtra(a, range, col) {
      const W = player.S.W;
      if (player.S.wt?.br('sp_spear') === 'B' && me.combo === 2) later(0.2, () => { strikes.arc(range, W.arc, 0.6, { a, type: 'normal' }); fx.slash(me.x, me.z, a, range, W.arc, col, 0.8); }); // 連突き
      spPierce(a);
    },
    // 先端の連続（一点突破）と雷槍
    onHit(mb, dmg, crit, o) {
      const W = player.S.wt;
      if (W.ks1 === 'sp_reach' && me.tipAct !== me.act && ATK_TYPES.includes(o.type)) {
        me.tipAct = me.act;
        me.tipRun = spTip(o) === 1 ? me.tipRun + 1 : 0;
        if (W.ks2 === 'sp_pierce' && me.tipRun >= 3 && !me.pierceReady) { me.pierceReady = true; me.tipRun = 0; floatText(me.x, 3.1, me.z, '一点突破', 'just'); fx.ringWave(me.x, me.z, 0xfff0a0, 1.8, 0.3); }
      }
      if (spTip(o) === 1) fx.flash(mb.x, 1.3, mb.z, 0xfff0a0, 14, 0.12);
      if (W.ks2 === 'sp_bolt' && hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy') && now() - me.boltT > 0.3) {
        me.boltT = now();
        const x = mb.x, z = mb.z;
        later(0.06, () => { fx.lightning(x, z, 0x9ad8ff); strikes.circle(x, z, 2.5, 0.6, { type: 'proc', noProc: true }); audio.sfx('thunder'); });
      }
    },
    // 迎撃の構えA「雷の構え」: 構えている間に受けると雷をまとう
    onHurtFirst() { if (player.S.wt.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder(); },
    onGuard(raw, src) {
      const W = player.S.wt;
      if (W.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder();
      if (W.br('sp_shield') === 'B' && src?.hp > 0) dealDamage(src, 0.3, { type: 'proc', stun: 6, noProc: true }); // 盾の重み
    },
    // 鉄壁A「不動」: ガードで受けても押し戻されない
    steadyGuard: () => player.S.wt?.br('sp_iron') === 'A',
    // 盾の心得: ガードゲージの減りが少ない / 挑発A「威圧」: 効果中は減らない / 盾の心得A: 回復が2倍
    guardKeep: () => (player.S.wt?.br('sp_taunt') === 'A' && hasBuff('sp_taunt') ? 0 : 1 - (player.S.wt?.v('sp_shield', 'gauge') || 0) / 100),
    guardRegen: (k) => k * (player.S.wt?.br('sp_shield') === 'A' ? 2 : 1),
    // 竜翔: 溜めなしでもう一度跳ぶ
    chargeStart() {
      if (!(me.soarReady && now() < me.soarReady && !me.dead && me.downT <= 0 && me.staggerT <= 0)) return false;
      me.soarReady = 0; me.charging = false; me.skillT = -1;
      floatText(me.x, 3, me.z, '竜翔', 'just');
      spJump(2, true);
      return true;
    },
    // 竜騎士の強攻撃は跳躍
    heavyOverride(lv) { if (player.S.wt?.ks1 !== 'sp_dragoon') return false; spJump(lv); return true; },
    heavyStart() { if (player.S.wk === 'spear') { me.motion = 'heavy';me.motionT = 0; spPierce(me.a); } },
    // ガードカウンター: 騎士の雷・旗手・反撃の心得A/B と、回転なぎ払い（sweepTick）
    guardCounter() {
      if (player.S.wk !== 'spear') return false;
      const W = player.S.wt;
      if (W?.ks1 === 'sp_knight') spThunder();
      if (W?.ks2 === 'sp_banner') spBanner(me.x, me.z);
      if (W?.br('sp_ctr') === 'A') me.iframe = Math.max(me.iframe, SWEEP.dur);
      if (W?.br('sp_ctr') === 'B') later(SWEEP.dur, () => { if (!me.dead) { const a = aimAngle(); me.a = a; me.swingT = 0; me.swingDur = 0.4; me.combo = 2; me.sw++; strikes.line(6 * spReach(false), 2, 1.5, { type: 'heavy', a }); fx.slash(me.x, me.z, a, 6, 30, 0xbfe0ff, 1.2); audio.sfx('swing', { heavy: true }); } }); // 二段反撃
      me.swingT = 9; // 振りのモーションの代わりに回転なぎ払い
      me.sweepT = 1e-4; me.sweepHit = false;me.motion = 'counter';me.motionT = 0;
      audio.sfx('swing', { heavy: true });
      return true;
    },
    // 回転なぎ払いの威力（反撃の心得で強くなる。盾槍以外は半分）とスタン値（崩しの心得B）
    sweepPower: (k) => (player.S.wk === 'spear' ? 1 + (player.S.wt?.v('sp_ctr', 'ctr') || 0) / 100 : k),
    sweepStun: (k) => k * (player.S.wt?.br('sp_brk') === 'B' ? 2 : 1),
    // 竜騎士は盾を背負う（他のプレイヤーにも見せる）
    shieldBack: () => player.S.wt?.ks1 === 'sp_dragoon',
    aura(dt) {
      // 旗手: 旗のそばにいる間は守りと攻めが上がる
      if (me.banner) {
        if (now() > me.banner.until) me.banner = null;
        else if (Math.hypot(me.x - me.banner.x, me.z - me.banner.z) < 5) quietBuff('sp_banner', '旗手', 0.3, { dr: 20, atkp: 15 }, 0x6ab0ff);
      }
      // 騎士: 雷をまとう間、槍の穂先から火花
      if (hasBuff('sp_thunder')) {
        const hp = handPos(me.model);
        wtEmit('thunder', 30, dt, () => fx.parts.emit(hp.x + rnd(-0.4, 0.4), hp.y + rnd(0, 1.2), hp.z + rnd(-0.4, 0.4), { color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, size: 0.28, life: 0.2, speed: 3, gravity: 0 }));
      }
      if (me.soarReady && now() < me.soarReady) wtEmit('soar', 20, dt, () => fx.parts.emit(me.x + rnd(-0.4, 0.4), 0.2, me.z + rnd(-0.4, 0.4), { color: 0x9affc8, size: 0.3, life: 0.5, speed: 1.5, gravity: -5 }));
    },
  }, { dmgMult: 3, onHit: 1, onHurtFirst: 0, onGuard: 0, heavyStart: 0, aura: 2 });
}

// 武器の登録（weapons/index.js が集める）
//   kindOrder・stats: サーバーと共通の数値（WEAPONS の並び順と中身） / tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'spear', kindOrder: 2, stats, tab: 4, glyph: '盾', tree: SPEAR, skills, mods, legacy, heavy, weaponSkills, model, motion, effects };
