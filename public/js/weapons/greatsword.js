// 大剣のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・武器ツリーの効果。
// 登録は weapons/index.js に1行だけ。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）もここの stats（サーバーも読むので three.js は直接 import しない）
import { L3, T, at, slashAt, fwd } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { now } from '../game/util.js';

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
      { id: 'gt_counter', icon: '⚔', name: 'カウンター', desc: '強攻撃を押した直後（0.35秒）に攻撃を受けると、無傷で受け流して反撃する（350%）。受け流したあと1.5秒は次の受け流しが出ない', tags: ['recv'] },
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

// ---------------------------------------------------------------------------
// サーバーと共通の数値（shared/data.js の WEAPONS に集まる。サーバーもこのファイルを読む）
// weight: 装備重量（回避のクールタイムに影響） / stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ / melee: 近接武器（生存本能を持つ）
// ---------------------------------------------------------------------------
const stats = {
  name: '大剣', skillPool: ['cyclone', 'breaker', 'avalanche', 'meteor'], grip: -0.20, range: 3.4, arc: 160, speed: 0.66, mult: 1.6, weight: 9, stun: 1.5, melee: true, twoHanded: true, skillSpin: true,
  edgeForward: true, // 構え・縦振りで刃（平らな面ではなく）を前に向ける
  passive: [], // 大剣は武器ツリー（熟練度）で決める
  skill: { name: 'サイクロン', cd: 6, desc: '周囲を薙ぎ払う回転斬り', mult: 2.6 },
};

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '兜割り', desc: '前方へ叩きつけ、衝撃で周囲を巻き込む',
    run(c, lv) {
      const a = c.aim(), [dx, dz] = fwd(a, 2.6), x = c.me.x + dx, z = c.me.z + dz;
      const r = lv === 2 ? 3.8 : 3.0, reach = 0.8; // 横幅は r のまま、前へ reach だけ縦に長い
      const [mx, mz] = fwd(a, reach / 2), cx = x + mx, cz = z + mz; // 衝撃の見た目は伸ばした当たりの真ん中に
      c.fx.slash(c.me.x, c.me.z, a, 3.4 + reach, 90, c.col(), 2.2);
      c.later(0.12, () => {
        c.circle(x, z, r, lv === 2 ? 4.6 : 3.0, { type: 'heavy', a, reach });
        c.fx.ringWave(cx, cz, c.col(), r + 1, 0.4);
        c.fx.parts.burst(cx, 0.3, cz, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
        c.shake(lv === 2 ? 0.5 : 0.3);
        if (c.S().flags.has('quake')) c.later(0.15, () => { c.circle(x, z, 6.5, 1.5, { type: 'heavy' }); c.fx.ringWave(x, z, 0xffd27a, 7, 0.5); });
      });
    },
  };

// ---------------------------------------------------------------------------
// 構え（motions/index.js が近接の動きに上書きする）。溜めと強攻撃の振りだけ大剣の動き、ほかは近接と同じ
//   溜め: 頭の上で大きく振りかぶり、溜まるほど刃を背中側へ倒して上体を反らす
//   強攻撃: 溜めの振りかぶりを一瞬保ってから、前へ腕を伸ばして振り下ろす（当たりは 0.12 秒 = k 0.24）
// ---------------------------------------------------------------------------
const motion = (rig) => {
  const { THREE, aimHand, orientWeapon, ease, applyMeleePose } = rig;
  const lerp = (a, b, k) => a + (b - a) * k;
  // 姿勢: 右手の位置（体の向き基準）・刃の向き（pitch: 上向き。π/2 を越えると背中側）・上体の前後の傾き
  const REST = { y: 1.15, z: .34, pitch: .60, lean: 0 };
  const windup = (c) => ({ y: 1.62 + .16 * c, z: .04 - .12 * c, pitch: 1.75 + .55 * c, lean: -.06 - .12 * c });
  const STRIKE = { y: 1.12, z: .50, pitch: -.20, lean: .22 };
  const mix = (a, b, k) => ({ y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k), pitch: lerp(a.pitch, b.pitch, k), lean: lerp(a.lean, b.lean, k) });
  function hold(u, s, p, twist) {
    u.armR.position.z = 0;
    if (!(s.dodge > 0) && !(s.down > 0) && !(s.hurt > 0)) { u.body.rotation.x = p.lean; u.body.rotation.y = twist; }
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(-.04, p.y, p.z), new THREE.Vector3(1, -.6, -.2));
    const axis = new THREE.Vector3(0, Math.sin(p.pitch), Math.cos(p.pitch));
    aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, -.18), new THREE.Vector3(-1, -.6, -.2));
    orientWeapon(u, 0, p.pitch, Math.PI / 2); // 縦振り: 刃を前へ
  }
  return {
    pose(u, s) {
      const k = s.swing ?? -1;
      if (s.heavy && k >= 0) {
        // 振りかぶりを保つ → 振り下ろす → 構えに戻る
        const top = windup(1);
        const p = k < .06 ? top : k < .30 ? mix(top, STRIKE, ease((k - .06) / .24)) : k < .62 ? STRIKE : mix(STRIKE, REST, ease((k - .62) / .38));
        hold(u, s, p, 0);
      } else if (s.charging && k >= 0 && k <= .02) {
        const c = ease(Math.min(1, Math.max(0, s.charge ?? 0)));
        hold(u, s, windup(c), -.12 * c); // 溜まるほど右肩を引く
      } else applyMeleePose(u, s);
    },
  };
};

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  cyclone: {
    name: 'サイクロン', kind: 'greatsword', cd: 6, desc: '周囲を薙ぎ払う3回転斬り', spin: true,
    run(c) {
      for (let i = 0; i < 3; i++) {
        c.later(0.1 + i * 0.15, () => {
          c.arc(4.6, 360, 0.9, { type: 'wskill' });
          c.fx.slash(c.me.x, c.me.z, c.me.a + i * 2.1, 4.6, 200, c.col(), 1.0, i % 2 === 1);
          c.fx.ringWave(c.me.x, c.me.z, c.col(), 4.6, 0.3);
          c.sfx('swing', { heavy: true });
        });
      }
    },
  },
  breaker: {
    name: 'アース・ブレイカー', kind: 'greatsword', cd: 7, desc: '地面を割り、前方へ岩を噴き上げる',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.shake(0.3);
      for (let i = 0; i < 6; i++) {
        c.later(0.08 + i * 0.07, () => {
          const [dx, dz] = fwd(a, 1.8 + i * 1.7);
          const x = sx + dx, z = sz + dz;
          c.circle(x, z, 1.9, 1.25, { type: 'wskill' });
          c.fx.parts.burst(x, 0.2, z, 18, { color: 0xb8a080, speed: 7, size: 0.6, life: 0.6, up: 3 });
          c.fx.ringWave(x, z, 0xd8c0a0, 2, 0.25);
        });
      }
    },
  },
  avalanche: {
    name: 'アバランシュ', kind: 'greatsword', cd: 8, desc: '大きく跳び込み、着地の衝撃で周りを叩き潰す（無敵あり）',
    run(c) {
      const a = c.aim();
      c.dash(a, 7, 0.3, 0.35);
      c.later(0.32, () => {
        c.circle(c.me.x, c.me.z, 3.8, 3.2, { type: 'wskill', stun: 12 });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), 4.5, 0.4);
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xc8b090, speed: 9, size: 0.7, life: 0.7, up: 3 });
        c.shake(0.6); c.sfx('impact');
      });
    },
  },
  meteor: {
    name: 'メテオブレイク', kind: 'greatsword', cd: 9, desc: '前方へ3回、遠くへ進むように衝撃を叩き込む',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      [3, 5.5, 8].forEach((d, i) => c.later(0.1 + i * 0.16, () => {
        const [dx, dz] = fwd(a, d), x = sx + dx, z = sz + dz;
        c.circle(x, z, 2.6, 1.8, { type: 'wskill', stun: 4 });
        c.fx.ringWave(x, z, c.col(), 3, 0.35);
        c.fx.parts.burst(x, 0.3, z, 30, { color: c.col(), speed: 7, size: 0.6, life: 0.5, up: 2 });
        c.shake(0.3); c.sfx('impact');
      }));
    },
  },
};

// ---------------------------------------------------------------------------
// 形（models.js の makeWeapon が使う）。基礎4系統のモデルは client-only の models 側に分離。
// ---------------------------------------------------------------------------
// kit: 形の道具（THREE・mesh・sphere・cone・cyl・lathe・extrude・bowString・toon）。models/weapon-models.js が渡す
const model = (kit) => {
  const model = {
    base: kit.greatswordForms.balanced,
    styles: {
      1: kit.greatswordForms.cleaver,
      2: kit.greatswordForms.zweihander,
      3: kit.greatswordForms.flamberge,
      4: kit.greatswordForms.odachi,
      5: kit.greatswordForms.falchion,
      6: kit.uniqueGreatswords.excalibur,
      7: kit.uniqueGreatswords.dainsleif,
    },
  };
  return model;
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, attack, tree, show, register }) {
  const { me, addBuff, hasBuff } = player;
  const { strikes, extendCombat, later } = attack;
  const { quietBuff, cutCds } = tree;
  const { fx, audio, floatText, addShake } = show;

  // 見切り眼: JUST回避・受け流しのあと3秒間ダメージアップ（6秒に1回まで）
  function eye() {
    const W = player.S.wt;
    if (!W?.lv('gt_eye') || now() - me.eyeT < 6) return;
    me.eyeT = now();
    quietBuff('gt_eye', '見切り眼', 3, { dmgp: W.lv('gt_eye') >= 2 ? 25 : 15 }, 0x9affff);
    if (W.br('gt_eye') === 'A') me.eyeCharge = true;
    if (W.br('gt_eye') === 'B') cutCds(2);
  }

  // スキルに渡す文脈に、溜めた状態から始める道具を足す（c.primeCharge: グランド・スラムB「踏み込み溜め」）
  extendCombat({ primeCharge(frac) { me.primeCharge = frac; } });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('greatsword', {
    // 一撃: 溜めは +25% 長い / 溜めの心得A: 溜めが速い
    stats(S, WT) { S.chargeMax = S.chargeMax * (WT?.ks1 === 'gt_blow' ? 1.25 : 1) * (WT?.br('gt_charge') === 'A' ? 0.8 : 1); },
    dmgMult(k, W, o, mb) {
      const maxHeavy = o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8;
      if (W.ks1 === 'gt_wave' && o.type === 'heavy' && !o.wave) k *= 0.85;
      if (W.ks1 === 'gt_blow' && maxHeavy) k *= 1.4;
      if (W.br('gt_break') === 'A' && mb?.stunT > 0) k *= 1.2;
      if (o.exec && mb && mb.hp < mb.mhp * 0.3) k *= o.exec; // 断頭落としA「処断」
      return k;
    },
    // 断罪: 最大溜めの強攻撃の会心率 +35%
    critAdd: (v, o) => v + (player.S.wt?.ks2 === 'gt_judge' && o.type === 'heavy' && !o.wave && me.lastHeavyLv === 2 && now() - me.lastHeavyT < 0.8 ? 35 : 0),
    // 月蝕: 光波が最初に当たった敵のところで爆ぜる
    onHit(mb, dmg, crit, o) {
      if (o.proj?.eclipse && !o.proj.boomed) {
        o.proj.boomed = true;
        const x = mb.x, z = mb.z;
        later(0.05, () => { strikes.circle(x, z, 3, 1.5, { type: 'proc', wtNo: true }); fx.ringWave(x, z, LIGHT_COLOR, 3.4, 0.35); fx.flash(x, 1.2, z, LIGHT_COLOR, 30, 0.25); audio.sfx('wave'); });
      }
    },
    // 溜め中に攻撃を受けた: 不屈（溜めが最大に）/ 剛体A（溜めが進む）
    onHurtCharging() {
      const W = player.S.wt;
      if (W.ks2 === 'gt_unyield') me.chargeT = Math.max(me.chargeT, player.S.chargeMax);
      else if (W.br('gt_armor') === 'A') me.chargeT += 0.3;
    },
    // 溜め中の被ダメージ軽減（剛体lv2・剛体B・一撃）と破城の構えA
    dr(v) {
      const W = player.S.wt;
      if (!W) return v;
      let dr = 0;
      if (me.charging) {
        if (W.lv('gt_armor') >= 2) dr += 15;
        if (W.br('gt_armor') === 'B') dr += 10;
        if (W.ks1 === 'gt_blow') dr += 30;
      }
      if (W.br('gt_siege') === 'A' && hasBuff('gt_siege')) dr += 20;
      return v + dr;
    },
    // 剛体: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
    superArmor: () => (me.charging && (player.S.wt?.lv('gt_armor') ?? 0) >= 1) || (player.S.wt?.br('gt_siege') === 'A' && hasBuff('gt_siege')),
    noKnockdown: () => me.charging && player.S.wt?.br('gt_armor') === 'B',
    // 強攻撃を振ったとき: 光波・月の残滓・破城の構えB
    heavy(lv, a) {
      const W = player.S.wt;
      if (W.ks1 === 'gt_wave') {
        me.motion = 'gt_wave'; me.motionT = 0; // 振り抜いて光波を飛ばす
        const big = lv === 2, moon = big && W.ks2 === 'gt_fullmoon';
        strikes.proj({ a, mult: (big ? 2.0 : 1.0) * (moon ? 1.75 : 1), type: 'heavy', speed: big ? 22 : 24, life: big ? 0.75 : 0.55, rad: moon ? 3.4 : big ? 2.0 : 1.2, color: LIGHT_COLOR, stun: W.br('gt_break') === 'B' ? 6 : 1.5, eclipse: W.ks2 === 'gt_eclipse' });
        if (big) fx.flash(me.x, 1.5, me.z, LIGHT_COLOR, moon ? 60 : 35, 0.3);
      }
      if (W.lv('gt_moon')) {
        const n = W.br('gt_moon') === 'A' ? 2 : 1, m = W.lv('gt_moon') >= 2 ? 0.8 : 0.5;
        const stun = W.br('gt_moon') === 'B' || W.br('gt_break') === 'B' ? 4 : 0.5;
        for (let i = 0; i < n; i++) later(0.12 + i * 0.12, () => strikes.proj({ a: a + (n > 1 ? (i ? 0.12 : -0.12) : 0), mult: m, type: 'proc', speed: 24, life: 0.5, rad: 0.9, color: LIGHT_COLOR, wtNo: true, stun }));
      }
      if (W.br('gt_siege') === 'B' && hasBuff('gt_siege')) strikes.proj({ a, mult: 1.2, type: 'heavy', speed: 22, life: 0.6, rad: 1.6, color: LIGHT_COLOR, stun: 1.5 });
    },
    // カウンター: 強攻撃を押した直後に攻撃を受けたら、無傷で受け流して反撃する
    counter(src) {
      if (player.S.wt?.ks1 !== 'gt_counter' || !me.charging || now() - me.chargeStart > 0.35 || now() < (me.parryReadyT || 0)) return false;
      me.parryReadyT = now() + 1.5; // 受け流したあと1.5秒は次の受け流しが出ない
      me.charging = false; me.chargeT = 0; me.chargeLv = 0;
      me.iframe = Math.max(me.iframe, 0.4);
      const a = src ? Math.atan2(src.x - me.x, src.z - me.z) : me.a;
      const M = TREE_MOTIONS.gt_riposte;
      me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
      floatText(me.x, 3.1, me.z, '見切り!', 'just');
      audio.sfx('perfect'); audio.sfx('block');
      fx.ringWave(me.x, me.z, 0xffffff, 3, 0.3); fx.flash(me.x, 1.5, me.z, 0xffffff, 40, 0.25);
      later(M.hits[0], () => { strikes.arc(4, 200, 3.5, { type: 'heavy', a, stun: 8 }); fx.slash(me.x, me.z, a, 4, 200, 0xffffff, 1.6, true); audio.sfx('swing', { heavy: true }); addShake(0.25); });
      if (player.S.wt.ks2 === 'gt_iai') me.iaiReady = true;
      if (player.S.wt.ks2 === 'gt_mirror') addBuff('gt_mirror', '明鏡', 5, { dmgp: 30 }, 0xe0f0ff);
      eye();
      return true;
    },
    justDodge() { eye(); },
  }, { dmgMult: 4, critAdd: 0, onHit: 3, heavy: 0, justDodge: 2 });
}

// 武器の登録（weapons/index.js が集める）
//   kindOrder・stats: サーバーと共通の数値（WEAPONS の並び順と中身） / tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'greatsword', kindOrder: 1, stats, tab: 2, glyph: '大', tree: GREATSWORD, skills, mods, legacy, heavy, weaponSkills, model, motion, effects };
