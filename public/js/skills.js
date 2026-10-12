// スキル定義: 強攻撃 / 武器に付くスキル / ツリーで覚えるスキル / スキルツリー
//
// 各スキルの run(c) は main.js が渡す戦闘コンテキスト c を使う:
//   c.me, c.aim(), c.col(), c.later(sec, fn), c.arc(range, deg, mult, o), c.line(len, w, mult, o),
//   c.circle(x, z, r, mult, o), c.proj(o), c.dash(a, dist, dur, iframe), c.buff(id, label, sec, mods, color),
//   c.heal(frac), c.text(str, cls), c.shake(v), c.sfx(name, opt), c.fx, c.nearest(range)
// o.type: 'normal' | 'heavy' | 'wskill' | 'tskill'（ツリーの強化倍率の対象を決める）

const fwd = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
export const HEAVY = {
  sword: {
    name: '溜め斬り', desc: '前方を大きく薙ぎ払う。最大溜めで斬撃波が飛ぶ',
    run(c, lv) {
      const a = c.aim(), m = lv === 2 ? 3.4 : 2.2;
      c.fx.slash(c.me.x, c.me.z, a, 3.8, 210, c.col(), 1.0);
      c.later(0.05, () => c.arc(3.8, 210, m, { type: 'heavy', a }));
      if (lv === 2) c.proj({ a, mult: 1.6, type: 'heavy' });
    },
  },
  greatsword: {
    name: '兜割り', desc: '前方へ叩きつけ、衝撃で周囲を巻き込む',
    run(c, lv) {
      const a = c.aim(), [dx, dz] = fwd(a, 2.6), x = c.me.x + dx, z = c.me.z + dz;
      const r = lv === 2 ? 3.8 : 3.0;
      c.fx.slash(c.me.x, c.me.z, a, 3.4, 90, c.col(), 2.2);
      c.later(0.12, () => {
        c.circle(x, z, r, lv === 2 ? 4.6 : 3.0, { type: 'heavy' });
        c.fx.ringWave(x, z, c.col(), r + 1, 0.4);
        c.fx.parts.burst(x, 0.3, z, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
        c.shake(lv === 2 ? 0.5 : 0.3);
        if (c.S().flags.has('quake')) c.later(0.15, () => { c.circle(x, z, 6.5, 1.5, { type: 'heavy' }); c.fx.ringWave(x, z, 0xffd27a, 7, 0.5); });
      });
    },
  },
  spear: {
    name: '溜め突き', desc: '踏み込みながら遠くまで貫く',
    run(c, lv) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.dash(a, 3, 0.12, 0);
      c.later(0.1, () => {
        c.line(lv === 2 ? 8 : 6.5, 2.0, lv === 2 ? 3.8 : 2.4, { type: 'heavy', a, sx, sz });
        for (let d = 0; d < 8; d += 0.5) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: c.col(), size: 0.5, life: 0.35, speed: 1, gravity: 0 });
      });
    },
  },
  dagger: {
    name: '瞬影', desc: '敵の間をすり抜けながら切り裂く（無敵あり）',
    run(c, lv) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.dash(a, lv === 2 ? 7.5 : 6, 0.18, 0.3);
      c.later(0.16, () => {
        c.line(lv === 2 ? 7.5 : 6, 2.4, lv === 2 ? 2.8 : 1.8, { type: 'heavy', a, sx, sz });
        c.fx.slash(c.me.x, c.me.z, a + Math.PI, 2.5, 160, c.col(), 1.0);
      });
    },
  },
};

// ---------------------------------------------------------------------------
// 武器に付くスキル（右クリック / E）
// ---------------------------------------------------------------------------
export const WEAPON_SKILLS = {
  vorpal: {
    name: 'ヴォーパル・ストライク', kind: 'sword', cd: 5, desc: '前方へ突進しながら貫く',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.dash(a, 8, 0.2, 0.25);
      c.later(0.12, () => {
        c.line(8.5, 2.6, 3.2, { type: 'wskill', a, sx, sz });
        for (let d = 0; d < 9; d += 0.5) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: c.col(), size: 0.6, life: 0.5, speed: 1.5, gravity: 0 });
      });
    },
  },
  square: {
    name: 'ホリゾンタル・スクエア', kind: 'sword', cd: 6, desc: '四方へ素早く斬り払う4連撃',
    run(c) {
      const a = c.aim();
      for (let i = 0; i < 4; i++) {
        c.later(i * 0.1, () => {
          const aa = a + i * Math.PI / 2;
          c.arc(3.6, 120, 1.1, { type: 'wskill', a: aa });
          c.fx.slash(c.me.x, c.me.z, aa, 3.6, 120, c.col(), 1.0, i % 2 === 1);
          c.sfx('swing');
        });
      }
    },
  },
  leap: {
    name: 'ソニック・リープ', kind: 'sword', cd: 6, desc: '跳び込んで着地点を斬り伏せる',
    run(c) {
      const a = c.aim();
      c.dash(a, 6, 0.28, 0.35);
      c.later(0.3, () => {
        c.circle(c.me.x, c.me.z, 3.2, 3.0, { type: 'wskill' });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), 4, 0.35);
        c.shake(0.3);
      });
    },
  },
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
  lance: {
    name: 'ライトニング・ランス', kind: 'spear', cd: 5.5, desc: '直線上を雷光で貫く',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.later(0.12, () => {
        c.line(12, 2.2, 3.0, { type: 'wskill', a, sx, sz });
        c.sfx('thunder');
        for (let d = 0; d < 12; d += 0.4) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: 0xbfe0ff, size: 0.7, life: 0.45, speed: 2, gravity: 0 });
        c.fx.lightning(sx + Math.sin(a) * 10, sz + Math.cos(a) * 10, 0xbfe0ff);
      });
    },
  },
  helix: {
    name: 'ヘリカル・スラスト', kind: 'spear', cd: 5, desc: '目にも留まらぬ5連突き。最後の一撃が重い',
    run(c) {
      const a = c.aim();
      for (let i = 0; i < 5; i++) {
        c.later(i * 0.08, () => {
          const aa = a + (Math.random() - 0.5) * 0.25;
          c.line(5.2, 1.6, i === 4 ? 1.8 : 0.8, { type: 'wskill', a: aa });
          for (let d = 1; d < 5; d += 0.6) c.fx.parts.emit(c.me.x + Math.sin(aa) * d, 1.1, c.me.z + Math.cos(aa) * d, { color: c.col(), size: 0.4, life: 0.25, speed: 0.5, gravity: 0 });
          c.sfx('swing');
        });
      }
    },
  },
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
};

// ---------------------------------------------------------------------------
// ツリーで覚えるスキル（1 / 2 キー）
// ---------------------------------------------------------------------------
export const TREE_SKILLS = {
  slant: {
    name: 'スラント・ラッシュ', cd: 9, desc: '3回連続で踏み込み斬り',
    run(c) {
      for (let i = 0; i < 3; i++) {
        c.later(i * 0.2, () => {
          const a = c.aim();
          c.dash(a, 3, 0.1, 0.15);
          c.later(0.08, () => { c.arc(3.2, 140, 1.5, { type: 'tskill', a }); c.fx.slash(c.me.x, c.me.z, a, 3.2, 140, c.col(), 1.0, i % 2 === 1); c.sfx('swing'); });
        });
      }
    },
  },
  brave: {
    name: 'ブレイブ・ハート', cd: 18, desc: '8秒間、攻撃力+25%・会心率+15%',
    run(c) { c.buff('brave', 'ブレイブ・ハート', 8, { atkp: 25, crit: 15 }, 0xffb040); },
  },
  gslam: {
    name: 'グランド・スラム', cd: 10, desc: '大きく跳躍して叩きつける（広範囲）',
    run(c) {
      const a = c.aim();
      c.dash(a, 6, 0.35, 0.45);
      c.later(0.36, () => {
        c.circle(c.me.x, c.me.z, 4.8, 4.0, { type: 'tskill' });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), 6, 0.45);
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xc8b090, speed: 9, size: 0.6, life: 0.7, up: 2 });
        c.sfx('heavy'); c.shake(0.6);
      });
    },
  },
  fortress: {
    name: '鉄壁の構え', cd: 16, desc: '4秒間、被ダメージ-60%。HPを10%回復',
    run(c) { c.buff('fortress', '鉄壁の構え', 4, { dr: 60 }, 0x9ad8ff); c.heal(0.1); },
  },
  shieldbash: {
    name: 'シールドバッシュ', cd: 7, desc: '盾で前方を殴りつける。ヘイトを大きく稼ぐ',
    run(c) {
      const a = c.aim();
      c.dash(a, 1.5, 0.1, 0);
      c.later(0.08, () => {
        c.arc(3.4, 110, 2.2, { type: 'tskill', a, threat: 4 });
        c.fx.ringWave(c.me.x + Math.sin(a) * 2, c.me.z + Math.cos(a) * 2, 0xbfd8ff, 3, 0.3);
        c.sfx('block'); c.shake(0.3);
      });
    },
  },
  taunt: {
    name: '挑発', cd: 14, desc: '周囲の敵の注意を自分に向ける（6秒）。その間、被ダメージ-30%',
    run(c) {
      c.taunt(14);
      c.buff('taunt', '挑発', 6, { dr: 30 }, 0xff6a4a);
      c.fx.ringWave(c.me.x, c.me.z, 0xff6a4a, 14, 0.6);
      c.text('こっちだ！', 'info');
      c.sfx('roar');
    },
  },
  javelin: {
    name: 'ジャベリン', cd: 8, desc: '槍の分身を投げ放ち、直線上の敵を貫通する',
    run(c) { c.proj({ a: c.aim(), mult: 3.5, speed: 32, life: 0.6, rad: 1.4, type: 'tskill', color: 0xbfe0ff }); c.sfx('wave'); },
  },
  whirl: {
    name: '旋槍', cd: 8, desc: '槍を大きく振り回して周囲を薙ぐ',
    run(c) {
      c.later(0.05, () => { c.circle(c.me.x, c.me.z, 5, 2.4, { type: 'tskill' }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 5.5, 0.35); });
      for (let i = 0; i < 3; i++) c.later(i * 0.06, () => c.fx.slash(c.me.x, c.me.z, c.me.a + i * 2.1, 5, 200, c.col(), 1.0));
      c.sfx('swing', { heavy: true });
    },
    spin: true,
  },
  poison: {
    name: 'ポイズン・エッジ', cd: 15, desc: '8秒間、攻撃が毒を付与（4秒間継続ダメージ）',
    run(c) { c.buff('poison', 'ポイズン・エッジ', 8, {}, 0x8aff5a); },
  },
  smoke: {
    name: 'スモーク・ステップ', cd: 10, desc: '煙幕で後ろへ跳ぶ。1秒無敵、次の3撃が必ず会心',
    run(c) {
      c.fx.parts.burst(c.me.x, 0.8, c.me.z, 50, { color: 0x8a8a9a, speed: 4, size: 0.9, life: 1.0, gravity: 0.5 });
      c.dash(c.aim() + Math.PI, 5, 0.2, 1.0);
      c.me.ambush = 3;
    },
  },
  afterimage: {
    name: '残像', cd: 20, desc: '5秒間、回避のクールタイムが激減し、全ての回避がJUST回避になる',
    run(c) { c.buff('afterimage', '残像', 5, { move: 30 }, 0x9affff); },
  },
  warcry: {
    name: 'ウォークライ', cd: 20, desc: 'HPを25%回復し、6秒間被ダメージ-40%',
    run(c) { c.heal(0.25); c.buff('warcry', 'ウォークライ', 6, { dr: 40 }, 0xffd84a); c.shake(0.2); },
  },
  berserk: {
    name: 'バーサク', cd: 22, desc: '8秒間、攻撃力+40%・攻撃速度+20%。ただし被ダメージ+20%',
    run(c) { c.buff('berserk', 'バーサク', 8, { atkp: 40, aspd: 20, dr: -20 }, 0xff4a4a); },
  },
};

// ---------------------------------------------------------------------------
// スキルツリー
// tier の段に進むには、そのツリーに tier×2 ポイント必要
// ---------------------------------------------------------------------------
const weaponTree = (k, names, a1, a2, cap) => [
  { id: `${k}_norm`, name: names[0], tier: 0, max: 3, mods: { normp: 6 }, desc: '通常攻撃のダメージ +6%' },
  { id: `${k}_heavy`, name: '溜めの極意', tier: 0, max: 3, mods: { heavyp: 10 }, desc: '強攻撃のダメージ +10%' },
  { id: `${k}_a1`, name: TREE_SKILLS[a1].name, tier: 1, max: 1, active: a1, desc: TREE_SKILLS[a1].desc },
  { id: `${k}_skill`, name: '技の冴え', tier: 1, max: 3, mods: { wskillp: 12 }, desc: '武器スキルのダメージ +12%' },
  { id: `${k}_a2`, name: TREE_SKILLS[a2].name, tier: 2, max: 1, active: a2, desc: TREE_SKILLS[a2].desc },
  { id: `${k}_cap`, name: cap.name, tier: 3, max: 1, ...cap },
];

export const TREES = {
  sword: { name: '片手剣', nodes: weaponTree('sword', ['剣の心得'], 'slant', 'brave', { name: '閃光の剣', flag: 'wave', desc: '通常攻撃3段目が斬撃波となって飛ぶ' }) },
  greatsword: { name: '大剣', nodes: weaponTree('greatsword', ['大剣の心得'], 'gslam', 'fortress', { name: '大地割り', flag: 'quake', desc: '兜割りの後、さらに大きな衝撃波が広がる' }) },
  spear: { name: '盾槍', nodes: weaponTree('spear', ['盾槍の心得'], 'shieldbash', 'taunt', { name: '不動の盾', flag: 'bulwark', desc: 'ガード中の被ダメージを完全に防ぎ、ジャストガードの猶予が長くなる' }) },
  dagger: { name: '短剣', nodes: weaponTree('dagger', ['短剣の心得'], 'poison', 'smoke', { name: '暗殺術', mods: { crit: 8, critd: 40 }, desc: '会心率 +8%、会心ダメージ +40%' }) },
  stat: {
    name: 'ステータス', nodes: [
      { id: 'st_str', name: '筋力', tier: 0, max: 5, mods: { atkp: 3 }, desc: '攻撃力 +3%' },
      { id: 'st_vit', name: '体力', tier: 0, max: 5, mods: { hpp: 5 }, desc: '最大HP +5%' },
      { id: 'st_dex', name: '技量', tier: 1, max: 5, mods: { crit: 2 }, desc: '会心率 +2%' },
      { id: 'st_agi', name: '敏捷', tier: 1, max: 5, mods: { move: 2, aspd: 2 }, desc: '移動速度 +2%、攻撃速度 +2%' },
      { id: 'st_mnd', name: '精神', tier: 2, max: 5, mods: { cdr: 3 }, desc: 'スキルのクールタイム -3%' },
      { id: 'st_skin', name: '鉄の肌', tier: 2, max: 5, mods: { def: 2 }, desc: '被ダメージ -2%' },
      { id: 'st_crd', name: '極意', tier: 3, max: 3, mods: { critd: 15 }, desc: '会心ダメージ +15%' },
    ],
  },
  style: {
    name: 'プレイスタイル', nodes: [
      { id: 'ps_acro', name: '軽業', tier: 0, max: 3, mods: { dodgecd: 12 }, desc: '回避のクールタイム -12%', col: 0 },
      { id: 'ps_tough', name: '頑強', tier: 0, max: 3, mods: { def: 3 }, desc: '被ダメージ -3%', col: 1 },
      { id: 'ps_fight', name: '闘争心', tier: 0, max: 3, mods: { heavyp: 12 }, desc: '強攻撃のダメージ +12%', col: 2 },
      { id: 'ps_read', name: '見切り', tier: 1, max: 3, mods: { justbuff: 15 }, desc: 'JUST回避後3秒間、ダメージ +15%', col: 0 },
      { id: 'ps_herb', name: '薬師', tier: 1, max: 2, mods: { potion: 1 }, desc: 'ポーションの所持数 +1', col: 1 },
      { id: 'ps_blood', name: '血の渇望', tier: 1, max: 3, mods: { vamp: 1 }, desc: '与ダメージの1%を吸収', col: 2 },
      { id: 'ps_after', name: '残像', tier: 2, max: 1, active: 'afterimage', desc: TREE_SKILLS.afterimage.desc, col: 0 },
      { id: 'ps_cry', name: 'ウォークライ', tier: 2, max: 1, active: 'warcry', desc: TREE_SKILLS.warcry.desc, col: 1 },
      { id: 'ps_bsk', name: 'バーサク', tier: 2, max: 1, active: 'berserk', desc: TREE_SKILLS.berserk.desc, col: 2 },
      { id: 'ps_counter', name: 'カウンター', tier: 3, max: 2, mods: { counter: 150 }, desc: 'JUST回避時、周囲に衝撃波（攻撃力の150%）', col: 0 },
      { id: 'ps_last', name: '不屈', tier: 3, max: 1, flag: 'laststand', desc: '致命傷をHP1で耐える（90秒に1回）', col: 1 },
      { id: 'ps_back', name: '背水', tier: 3, max: 3, mods: { backwater: 10 }, desc: 'HP50%以下でダメージ +10%', col: 2 },
    ],
  },
};
export const STYLE_COLS = ['回避（ダンサー）', '守護（ガーディアン）', '攻撃（バーサーカー）'];

export const NODE_INDEX = {};
for (const [tid, t] of Object.entries(TREES)) for (const n of t.nodes) NODE_INDEX[n.id] = { ...n, tree: tid };

export const spTotal = (lv) => Math.max(0, lv - 1);
export const spSpent = (tree) => Object.values(tree || {}).reduce((a, b) => a + b, 0);
export const treeSpent = (tree, tid) => TREES[tid].nodes.reduce((a, n) => a + (tree?.[n.id] || 0), 0);

export function canLearn(char, id) {
  const n = NODE_INDEX[id];
  if (!n) return false;
  const tree = char.tree || {};
  if ((tree[id] || 0) >= n.max) return false;
  if (spSpent(tree) >= spTotal(char.lv)) return false;
  return treeSpent(tree, n.tree) >= n.tier * 2;
}

// 習得済みノードの効果を集計。武器種ツリーは装備中の武器種のものだけ有効
export function treeEffects(char, wk) {
  const mods = {}, flags = new Set(), actives = new Set();
  for (const [id, r] of Object.entries(char.tree || {})) {
    const n = NODE_INDEX[id];
    if (!n || !r) continue;
    if (TREES[n.tree] && n.tree !== 'stat' && n.tree !== 'style' && n.tree !== wk) continue;
    if (n.mods) for (const [k, v] of Object.entries(n.mods)) mods[k] = (mods[k] || 0) + v * r;
    if (n.flag) flags.add(n.flag);
    if (n.active) actives.add(n.active);
  }
  return { mods, flags, actives };
}
