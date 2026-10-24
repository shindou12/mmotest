import { ADVANCED_TREE_SKILLS } from './advanced-skills.js';
import { WT_SKILLS } from './weapon-tree.js';
import { TECHNIQUES } from '../shared/techniques.js';
import { SPEAR_TIMINGS } from '../shared/skill-timings.js';
import { WEAPON_DEFS } from './weapons/index.js';
// スキル定義: 強攻撃 / 武器に付くスキル / ツリーで覚えるスキル / スキルツリー
//
// 各スキルの run(c) は main.js が渡す戦闘コンテキスト c を使う:
//   c.me, c.aim(), c.col(), c.later(sec, fn), c.arc(range, deg, mult, o), c.line(len, w, mult, o),
//   c.circle(x, z, r, mult, o)（o.reach: o.a の向きへ縦に引き伸ばす）, c.proj(o), c.dash(a, dist, dur, iframe), c.buff(id, label, sec, mods, color),
//   c.heal(frac), c.text(str, cls), c.shake(v), c.sfx(name, opt), c.fx, c.nearest(range)
//   c.arrow(o) 矢を放つ（弓。射程の端まで飛ぶ）, c.point() マウスの地面座標
// o.type: 'normal' | 'heavy' | 'wskill' | 'tskill'（ツリーの強化倍率とスタン値の基準を決める）
// o.stun: ボスに溜めるスタン値を直接指定（省略時は type から計算）


// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
// 武器ごとの中身は js/weapons/<武器>.js の heavy（weapons/index.js が集める）
export const HEAVY = Object.fromEntries(WEAPON_DEFS.map((d) => [d.wk, d.heavy]));

// ---------------------------------------------------------------------------
// 武器に付くスキル（右クリック）
// ---------------------------------------------------------------------------
// 武器ごとの中身は js/weapons/<武器>.js の weaponSkills（weapons/index.js が集める）
export const WEAPON_SKILLS = Object.assign({}, ...WEAPON_DEFS.map((d) => d.weaponSkills));


// ---------------------------------------------------------------------------
// ツリーで覚えるスキル（Q / E キー）
// ---------------------------------------------------------------------------
export const TREE_SKILLS = {
  warstomp: {
    name: 'ウォーストンプ', cd: 10, desc: '地面を踏み鳴らし、周囲の敵を揺さぶる。スタン値が非常に高い',
    run(c) {
      c.later(0.1, () => {
        c.circle(c.me.x, c.me.z, 5, 1.8, { type: 'tskill', stun: 22 });
        c.fx.ringWave(c.me.x, c.me.z, 0xd8b080, 6, 0.45);
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xb89870, speed: 8, size: 0.6, life: 0.7, up: 2 });
        c.sfx('heavy'); c.shake(0.5);
      });
    },
  },
  bloodlust: {
    name: 'ブラッドラスト', cd: 18, desc: '8秒間、攻撃力+20%・与ダメージの8%を回復',
    run(c) { c.buff('bloodlust', 'ブラッドラスト', 8, { atkp: 20, vamp: 8 }, 0xff3a3a); },
  },
  backshot: {
    name: 'バックショット', cd: 8, desc: '後ろへ跳びながら3本の矢を放つ（無敵あり）',
    run(c) {
      const a = c.aim();
      c.dash(a + Math.PI, 5, 0.22, 0.3);
      c.me.a = a;
      for (let i = -1; i <= 1; i++) c.later(0.05, () => c.arrow({ a: a + i * 0.1, mult: 1.0, type: 'tskill' }));
    },
  },
  focus: {
    name: '集中', cd: 18, desc: '8秒間、強攻撃の溜め（引き絞り）が2倍の速さになる',
    run(c) { c.buff('focus', '集中', 8, { chargeRate: 100 }, 0x9ae8ff); },
  },
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
        c.arc(3.4, 110, 2.2, { type: 'tskill', a, threat: 4, stun: 14 });
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
    motion: 'javelin',
    name: 'ジャベリン', cd: 8, desc: '槍の分身を投げ放ち、直線上の敵を貫通する',
    run(c) { const a = c.aim();c.later(SPEAR_TIMINGS.javelin.hitAt, () => { c.proj({ a, mult: 3.5, speed: 32, life: 0.6, rad: 1.4, type: 'tskill', color: 0xbfe0ff }); c.sfx('wave'); }); },
  },
  whirl: {
    motion: 'whirl',
    name: '旋槍', cd: 8, desc: '槍を大きく振り回して周囲を薙ぐ',
    run(c) {
      c.later(SPEAR_TIMINGS.whirl.hitAt, () => { c.circle(c.me.x, c.me.z, 5, 2.4, { type: 'tskill' }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 5.5, 0.35); });
      for (let i = 0; i < SPEAR_TIMINGS.whirl.effectCount; i++) c.later(i * SPEAR_TIMINGS.whirl.effectInterval, () => c.fx.slash(c.me.x, c.me.z, c.me.a + i * 2.1, 5, 200, c.col(), 1.0));
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

Object.assign(TREE_SKILLS, ADVANCED_TREE_SKILLS);

// スキル全体のクールタイム倍率（武器スキル・ツリーのスキル・Q/Eの技すべて。表示も同じ値になる）
export const SKILL_CD_MULT = 1.2;
for (const s of [...Object.values(WEAPON_SKILLS), ...Object.values(TREE_SKILLS)]) s.cd = Math.round(s.cd * SKILL_CD_MULT * 10) / 10;
// 新しい武器ツリーのスキル（クールタイムは×1.2済みの値で持っている）
Object.assign(TREE_SKILLS, WT_SKILLS);

// ---------------------------------------------------------------------------
// スキルツリー
// tier の段に進むには、そのツリーに tier×2 ポイント必要
// ---------------------------------------------------------------------------

export const TREES = {
  // 武器ごとのツリーはすべて新しい武器ツリー（weapon-tree.js）に移った
  stat: {
    name: 'ステータス', nodes: [
      { id: 'st_str', name: '筋力', tier: 0, max: 5, mods: { atkp: 3 }, desc: '攻撃力 +3%' },
      { id: 'st_vit', name: '体力', tier: 0, max: 5, mods: { hpp: 5 }, desc: '最大HP +5%' },
      { id: 'st_dex', name: '技量', tier: 1, max: 5, mods: { crit: 2 }, desc: '会心率 +2%' },
      { id: 'st_agi', name: '敏捷', tier: 1, max: 5, mods: { move: 2, aspd: 2 }, desc: '移動速度 +2%、攻撃速度 +2%' },
      { id: 'st_break', name: '崩しの心得', tier: 1, max: 3, mods: { stunp: 15 }, desc: 'ボスに溜めるスタン値 +15%（近接武器のみ）' },
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

for (const t of Object.values(TECHNIQUES)) if (TREES[t.kind]) TREES[t.kind].nodes.push({
  id: t.id + '_node', name: t.name, tier: t.tier, max: 1, active: t.id, role: t.role, desc: t.desc,
});

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

