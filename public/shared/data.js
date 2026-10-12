// ゲームデータ定義（サーバー・クライアント共通）

export const MAX_LEVEL = 50;
export const FIELD_RADIUS = 68;
export const GATE_POS = { x: 0, z: 40 };
export const LAIR_POS = { x: 0, z: -46 };
export const LAIR_RADIUS = 17;

// --- 成長曲線（ゆるめ） -------------------------------------------------
export const xpToNext = (lv) => Math.round(30 * Math.pow(lv, 1.55));
export const mobXp = (mlv) => Math.round(9 * Math.pow(mlv, 1.25));
export const growth = (lv) => Math.pow(1.1, lv - 1);
export const baseAtk = (lv) => 10 * growth(lv);
export const baseHp = (lv) => 100 * growth(lv);
export const mobHp = (mlv) => 45 * growth(mlv);
export const mobDmg = (mlv) => 6 * growth(mlv);

// --- レアリティ -----------------------------------------------------------
export const RARITIES = [
  { key: 'common', name: 'コモン', color: '#cfd3da', w: 52, mult: 1.0, affixes: 0 },
  { key: 'uncommon', name: 'アンコモン', color: '#62dc6a', w: 27, mult: 1.12, affixes: 1 },
  { key: 'rare', name: 'レア', color: '#4aa8ff', w: 14, mult: 1.25, affixes: 2 },
  { key: 'epic', name: 'エピック', color: '#b86cff', w: 5.5, mult: 1.42, affixes: 3 },
  { key: 'legendary', name: '伝説', color: '#ffa236', w: 1.2, mult: 1.7, affixes: 3 },
  { key: 'divine', name: '神器', color: '#ff3d63', w: 0.22, mult: 2.1, affixes: 4 },
];

// --- 武器種 ---------------------------------------------------------------
// weight: 装備重量（回避のクールタイムに影響）
// stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ
// melee: 近接武器（生存本能を持つ）
export const WEAPONS = {
  sword: {
    name: '片手剣', range: 2.8, arc: 110, speed: 0.4, mult: 1.0, weight: 4, stun: 1.0, melee: true,
    passive: ['回避の無敵時間 +0.1秒', '攻撃を当てるたびにスキルのクールタイムが0.15秒縮む'],
    skill: { name: 'ヴォーパル・ストライク', cd: 5, desc: '前方へ突進しながら貫く', mult: 3.2 },
  },
  greatsword: {
    name: '大剣', range: 3.4, arc: 160, speed: 0.66, mult: 1.6, weight: 9, stun: 1.5, melee: true,
    passive: ['強攻撃ダメージ +20%', '溜め中はひるまない'],
    skill: { name: 'サイクロン', cd: 6, desc: '周囲を薙ぎ払う回転斬り', mult: 2.6 },
  },
  spear: {
    // 盾槍: 右クリック長押しでガードできる。ヘイトを集めやすい
    name: '盾槍', range: 4.3, arc: 45, speed: 0.5, mult: 1.1, weight: 8, guard: true, stun: 1.3, melee: true,
    passive: ['被ダメージ -10%', 'ガードしていた時間に応じて、次の攻撃のダメージが最大+50%'],
    skill: { name: 'ライトニング・ランス', cd: 5.5, desc: '直線上を雷光で貫く', mult: 3.0 },
  },
  dagger: {
    name: '短剣', range: 2.3, arc: 90, speed: 0.26, mult: 0.68, weight: 2, stun: 0.6, melee: true,
    passive: ['回避のクールタイム -25%', '攻撃を当てるたびに攻撃速度+4%（最大+40%・3秒）'],
    skill: { name: 'シャドウ・ダンス', cd: 4.5, desc: '目にも止まらぬ五連撃', mult: 1.0 },
  },
  axe: {
    name: '大斧', range: 3.2, arc: 140, speed: 0.74, mult: 1.8, weight: 11, stun: 1.7, melee: true,
    passive: ['強攻撃ダメージ +25%', '与えたダメージの3%を回復'],
  },
  // 弓: 矢を飛ばす。適性エリア（外円=optimal と、引き絞るほど内側へ広がる内円の間）でだけ本来のダメージ
  bow: {
    name: '弓', range: 24, arc: 0, speed: 0.4, mult: 0.7, weight: 3, stun: 0.3, ranged: true, optimal: 10,
    passive: ['回避中も攻撃できる（転がり撃ち）', '適性エリア（足元の2つの円の間）の敵にだけ本来のダメージ。引き絞るほどエリアが内側へ広がる'],
  },
};
export const WEAPON_KINDS = Object.keys(WEAPONS);
// 弓の適性エリア: 外円 = 適性距離、内円 = 外円 - 幅。幅は引き絞り具合で BOW_ZONE.min〜max
export const BOW_ZONE = { min: 2, max: 8, outside: 0.35 };
// 生存本能（近接武器のパッシブ）: HPが一定以下になると一時的に被ダメージ軽減
export const INSTINCT = { hp: 0.35, dr: 50, sec: 6, cd: 90 };
// 武器ごとに付くスキルの候補（ドロップ時に1つ抽選）。内容は js/skills.js
export const WEAPON_SKILL_POOL = {
  sword: ['vorpal', 'square', 'leap'],
  greatsword: ['cyclone', 'breaker'],
  spear: ['lance', 'helix'],
  dagger: ['shadow', 'phantom'],
  axe: ['rampage', 'tomahawk'],
  bow: ['multishot', 'arrowrain'],
};
// 品質を固めるまでは3階層で運用
export const MAX_FLOOR = 3;

const TIER_PREFIX = ['木の', '青銅の', '鉄の', '鋼の', '銀の', 'ミスリルの', '魔鋼の', 'アダマンの', '星鉄の', '天鋼の', '神鉄の'];

// 防具の重さの種類。重いほどHPと被ダメ軽減が高いが、回避が遅くなる
export const ARMOR_CLASSES = {
  light: { name: '軽装', weight: 3, hp: 0.75, def: 0 },
  medium: { name: '中装', weight: 6, hp: 1.0, def: 3 },
  heavy: { name: '重装', weight: 11, hp: 1.35, def: 7 },
};
// 防具の種類。lv 以上のアイテムレベルで出る。trait は防具ごとの特性
export const ARMOR_TYPES = [
  { id: 'cloth', name: '布の服', cls: 'light', lv: 1, trait: ['move', 3] },
  { id: 'tunic', name: '革の胴着', cls: 'light', lv: 1, trait: ['aspd', 3] },
  { id: 'hunter', name: '狩人の外套', cls: 'light', lv: 4, trait: ['crit', 3] },
  { id: 'robe', name: '魔導ローブ', cls: 'light', lv: 6, trait: ['cdr', 6] },
  { id: 'ninja', name: '忍び装束', cls: 'light', lv: 8, trait: ['move', 6] },
  { id: 'bard', name: '吟遊詩人の衣', cls: 'light', lv: 10, trait: ['aspd', 5] },
  { id: 'leather', name: '革の鎧', cls: 'medium', lv: 1, trait: ['hpp', 4] },
  { id: 'chain', name: '鎖帷子', cls: 'medium', lv: 3, trait: ['def', 2] },
  { id: 'scale', name: '鱗鎧', cls: 'medium', lv: 6, trait: ['critd', 8] },
  { id: 'brigandine', name: 'ブリガンダイン', cls: 'medium', lv: 8, trait: ['atkp', 4] },
  { id: 'ranger', name: '遊撃兵の胸甲', cls: 'medium', lv: 10, trait: ['move', 4] },
  { id: 'dragonhide', name: '竜革の鎧', cls: 'medium', lv: 12, trait: ['vamp', 1] },
  { id: 'breast', name: '鉄の胸当て', cls: 'heavy', lv: 1, trait: ['def', 2] },
  { id: 'plate', name: '板金鎧', cls: 'heavy', lv: 4, trait: ['hpp', 6] },
  { id: 'knight', name: '騎士の甲冑', cls: 'heavy', lv: 7, trait: ['def', 3] },
  { id: 'oyoroi', name: '大鎧', cls: 'heavy', lv: 9, trait: ['atkp', 5] },
  { id: 'paladin', name: '聖騎士の鎧', cls: 'heavy', lv: 11, trait: ['hpp', 8] },
  { id: 'fortress', name: '城塞の重甲冑', cls: 'heavy', lv: 13, trait: ['def', 4] },
];

// 合計重量 → 回避のクールタイム倍率・転がる距離の倍率
export const WEIGHT_CLASSES = [
  { max: 7, name: '軽量', cd: 0.7, roll: 1.1, color: '#7fe08a' },
  { max: 13, name: '普通', cd: 1.0, roll: 1.0, color: '#cfd3da' },
  { max: 18, name: '重い', cd: 1.35, roll: 0.9, color: '#ffc06a' },
  { max: Infinity, name: '過重', cd: 1.75, roll: 0.8, color: '#ff7a6a' },
];
export function itemWeight(it) {
  if (!it) return 0;
  if (typeof it.weight === 'number') return it.weight;
  if (it.slot === 'weapon') return WEAPONS[it.kind]?.weight ?? 4;
  if (it.slot === 'armor') return ARMOR_CLASSES[it.armor || 'medium'].weight;
  return 0.5;
}
export function weightClass(total) {
  return WEIGHT_CLASSES.find((w) => total <= w.max);
}
// 装備を分解したときにもらえるゴールド（レアリティとアイテムレベルで決まる）
const SALVAGE_BASE = [2, 5, 14, 40, 130, 400];
export const salvageValue = (it) => Math.round(SALVAGE_BASE[it.rarity] * (1 + (it.ilvl || 1) * 0.15));

const ACC_BASE = ['お守り', '銅の指輪', '銀の首飾り', '翠玉の指輪', '紅玉の護符', '星の耳飾り', '天球の指輪'];

export const AFFIXES = {
  atkp: { name: '攻撃力', unit: '%', min: 4, max: 11 },
  crit: { name: '会心率', unit: '%', min: 2, max: 6 },
  critd: { name: '会心ダメージ', unit: '%', min: 10, max: 28 },
  hpp: { name: '最大HP', unit: '%', min: 5, max: 14 },
  aspd: { name: '攻撃速度', unit: '%', min: 3, max: 9 },
  move: { name: '移動速度', unit: '%', min: 3, max: 7 },
  vamp: { name: 'HP吸収', unit: '%', min: 0.5, max: 2 },
  cdr: { name: 'スキル短縮', unit: '%', min: 4, max: 12 },
  def: { name: '被ダメ軽減', unit: '%', min: 2, max: 6 },
};

export const UNIQUE_FX = {
  wave: 'コンボ3段目が光の斬撃波となって飛ぶ',
  thunder: '会心時、対象に落雷（周囲にダメージ）',
  vamp: '与ダメージの4%を吸収',
  aegis: '25%の確率で被ダメージを無効化',
  mirror: 'ジャスト回避で衝撃波＋5秒間ダメージ1.5倍',
  star: 'スキルのクールタイム-35%',
  skillcrit: 'スキルが必ず会心になる',
  flame: '攻撃が炎上し、周囲に延焼ダメージ',
};

export const UNIQUES = [
  // 神器
  { key: 'amenomurakumo', name: '天叢雲剣', rarity: 5, slot: 'weapon', kind: 'sword', fx: ['wave', 'thunder'], lore: '八岐大蛇の尾より出でし神剣。' },
  { key: 'gungnir', name: 'グングニル', rarity: 5, slot: 'weapon', kind: 'spear', fx: ['thunder', 'skillcrit'], lore: '必中の神槍。放てば必ず主の手に還る。' },
  { key: 'excalibur', name: 'エクスカリバー', rarity: 5, slot: 'weapon', kind: 'greatsword', fx: ['wave', 'star'], lore: '湖の乙女より授けられし聖剣。' },
  { key: 'kusanagi_dagger', name: '月詠ノ小太刀', rarity: 5, slot: 'weapon', kind: 'dagger', fx: ['mirror', 'vamp'], lore: '月光を纏う夜の神の刃。' },
  { key: 'aegis', name: 'アイギスの聖鎧', rarity: 5, slot: 'armor', armor: 'heavy', fx: ['aegis', 'mirror'], lore: '女神の加護を宿す不壊の鎧。' },
  { key: 'yata', name: '八咫鏡', rarity: 5, slot: 'acc', fx: ['mirror', 'star'], lore: '真実を映す神鏡。' },
  // 伝説
  { key: 'durandal', name: 'デュランダル', rarity: 4, slot: 'weapon', kind: 'sword', fx: ['wave'], lore: '決して折れぬ聖騎士の剣。' },
  { key: 'gaebolg', name: 'ゲイ・ボルグ', rarity: 4, slot: 'weapon', kind: 'spear', fx: ['thunder'], lore: '三十の棘を持つ魔槍。' },
  { key: 'muramasa', name: '妖刀 村正', rarity: 4, slot: 'weapon', kind: 'dagger', fx: ['vamp'], lore: '血を求めて止まぬ妖刀。' },
  { key: 'dainsleif', name: 'ダーインスレイヴ', rarity: 4, slot: 'weapon', kind: 'greatsword', fx: ['vamp', 'flame'], lore: '一度抜けば血を見ずには収まらぬ。' },
  { key: 'laevateinn', name: 'レーヴァテイン', rarity: 4, slot: 'weapon', kind: 'sword', fx: ['flame'], lore: '世界を焼く炎の枝。' },
  { key: 'labrys', name: 'ラブリュス', rarity: 4, slot: 'weapon', kind: 'axe', fx: ['flame'], lore: '迷宮の王が掲げた両刃の斧。' },
  { key: 'yoichi', name: '与一の弓', rarity: 4, slot: 'weapon', kind: 'bow', fx: ['thunder'], lore: '揺れる扇の的をも射抜いたという名弓。' },
  { key: 'artemis', name: 'アルテミスの銀弓', rarity: 5, slot: 'weapon', kind: 'bow', fx: ['skillcrit', 'star'], lore: '月の女神の銀の弓。' },
  { key: 'mjolnir', name: '雷斧ミョルニル', rarity: 5, slot: 'weapon', kind: 'axe', fx: ['thunder', 'vamp'], lore: '雷神の怒りを宿す、振るえば戻る斧。' },
  { key: 'dragonscale', name: '竜鱗の鎧', rarity: 4, slot: 'armor', armor: 'heavy', fx: ['aegis'], lore: '古竜の鱗を編んだ鎧。' },
  { key: 'starseer', name: '星詠みの指輪', rarity: 4, slot: 'acc', fx: ['star'], lore: '星の巡りを識る指輪。' },
  { key: 'phantom', name: '幻影の外套', rarity: 4, slot: 'armor', armor: 'light', fx: ['mirror'], lore: '纏う者の影を揺らがせる。' },
];

// --- 階層データ ------------------------------------------------------------
// props: [種類, 数, 色1, 色2]
export const FLOORS = [
  {
    n: 1, name: '始まりの草原', ground: 0x4c8a3a, ground2: 0x79b552, fog: 0xbfe3ff, skyTop: 0x5aa8ff, skyBot: 0xd8f0ff,
    sun: 0xfff1d6, sunI: 2.2, hemi: [0xcfe8ff, 0x3a5a2a], fogNear: 40, fogFar: 140,
    props: [['tree', 70, 0x3f8f3a, 0x6b4a2a], ['rock', 30, 0x8a8f96], ['flower', 140, 0xffe36b, 0xff8fb3]],
    particles: 'pollen', amb: 'meadow',
    music: { root: 62, mode: 'major', bpm: 88, prog: [0, 4, 5, 3], feel: 'calm' },
    mobs: [{ t: 'slime', name: 'グリーンスライム', color: 0x66dd55 }, { t: 'beast', name: 'フレンジーボア', color: 0x9a6a44 }],
    boss: { name: 'コボルド王 グラズ', t: 'knight', color: 0x8a6a40, accent: 0xffcc33, scale: 2.8, patterns: ['combo', 'cone', 'charge', 'sweep', 'slam', 'shot'], p3: ['chase', 'shock'] },
  },
  {
    n: 2, name: '霧の森', ground: 0x2f5a3a, ground2: 0x3f6f4a, fog: 0x9ab8b0, skyTop: 0x6a8a90, skyBot: 0xb7cfc8,
    sun: 0xe0f0ff, sunI: 1.4, hemi: [0xb0d0d0, 0x203828], fogNear: 18, fogFar: 85,
    props: [['pine', 110, 0x24553a, 0x4a3a2a], ['mushroom', 40, 0xd8584a, 0xf0e8d8], ['rock', 25, 0x6a7a74]],
    particles: 'firefly', amb: 'forest',
    music: { root: 57, mode: 'dorian', bpm: 80, prog: [0, 3, 6, 4], feel: 'mystic' },
    mobs: [{ t: 'wisp', name: 'フォレストウィスプ', color: 0x8cffb0 }, { t: 'beast', name: 'ミストウルフ', color: 0x8a9a9a }],
    boss: { name: '霧の大樹 ユグドラ', t: 'golem', color: 0x4a6a3a, accent: 0x9cff7a, scale: 3.0, patterns: ['rain', 'shock', 'combo', 'cage', 'summon', 'cone', 'shot', 'shot'], p3: ['spiral', 'nova'] },
  },
  {
    n: 3, name: '砂塵の荒野', ground: 0xc9a066, ground2: 0xe0bf86, fog: 0xf0d6a8, skyTop: 0xf0b070, skyBot: 0xffe6c0,
    sun: 0xffe0b0, sunI: 2.6, hemi: [0xffe8c8, 0x806040], fogNear: 30, fogFar: 120,
    props: [['cactus', 50, 0x5a8a3a], ['rock', 60, 0xb07a4a], ['bones', 20, 0xeee8d8]],
    particles: 'dust', amb: 'desert',
    music: { root: 60, mode: 'phrygian', bpm: 92, prog: [0, 1, 0, 6], feel: 'exotic' },
    mobs: [{ t: 'beast', name: 'デザートスコーピオン', color: 0xc08040 }, { t: 'golem', name: 'サンドゴーレム', color: 0xd0aa70 }],
    boss: { name: '砂塵の大蠍 スコルピオ', t: 'beast', color: 0xa0522d, accent: 0xff6a2a, scale: 3.2, patterns: ['chase', 'sweep', 'cone', 'ring', 'rain', 'combo', 'shot', 'charge'], p3: ['spiral', 'cross', 'cage'] },
  },
  {
    n: 4, name: '水晶洞窟', ground: 0x2a2a44, ground2: 0x3a3a60, fog: 0x1a1a38, skyTop: 0x0a0a1a, skyBot: 0x202048,
    sun: 0xa0b0ff, sunI: 1.6, hemi: [0x8090ff, 0x2a2a48], fogNear: 18, fogFar: 85,
    props: [['crystal', 90, 0x7ae0ff, 0xd08cff], ['rock', 40, 0x3a3a50], ['stalag', 40, 0x4a4a66]],
    particles: 'sparkle', amb: 'cave',
    music: { root: 64, mode: 'lydian', bpm: 76, prog: [0, 1, 4, 5], feel: 'crystal' },
    mobs: [{ t: 'golem', name: 'クリスタルゴーレム', color: 0x88ddff }, { t: 'wisp', name: 'プリズムバット', color: 0xd08cff }],
    boss: { name: '水晶巨兵 クリスタロス', t: 'golem', color: 0x66ccff, accent: 0xff8cff, scale: 3.4, patterns: ['slam', 'nova', 'rain', 'cross'] },
  },
  {
    n: 5, name: '溶岩地帯', ground: 0x4a2c24, ground2: 0x6a3a2a, fog: 0x401810, skyTop: 0x200806, skyBot: 0x802010,
    sun: 0xffa070, sunI: 2.2, hemi: [0xff9060, 0x3a1810], fogNear: 22, fogFar: 100,
    props: [['lavarock', 60, 0x2a1a1a, 0xff4a10], ['spike', 40, 0x3a2420], ['lavapool', 18, 0xff5a10]],
    particles: 'ember', amb: 'lava',
    music: { root: 52, mode: 'minor', bpm: 100, prog: [0, 5, 6, 4], feel: 'heavy' },
    mobs: [{ t: 'slime', name: 'マグマスライム', color: 0xff5a20 }, { t: 'knight', name: 'ヘルナイト', color: 0x5a2a20 }],
    boss: { name: '炎獄の魔獣 イフリート', t: 'beast', color: 0xff3a10, accent: 0xffd040, scale: 3.6, patterns: ['rain', 'nova', 'charge', 'ring', 'cone'] },
  },
  {
    n: 6, name: '氷結平原', ground: 0xdfeaf5, ground2: 0xb8cfe6, fog: 0xd8e8f8, skyTop: 0x90b0d8, skyBot: 0xeef6ff,
    sun: 0xeaf4ff, sunI: 2.0, hemi: [0xffffff, 0x8090b0], fogNear: 20, fogFar: 100,
    props: [['icespike', 70, 0xa8e0ff], ['pine', 50, 0x3a5a6a, 0x4a3a30], ['rock', 30, 0x9aa8b8]],
    particles: 'snow', amb: 'snow',
    music: { root: 59, mode: 'minor', bpm: 72, prog: [0, 3, 5, 4], feel: 'cold' },
    mobs: [{ t: 'beast', name: 'フロストウルフ', color: 0xcfe8ff }, { t: 'golem', name: 'アイスゴーレム', color: 0x88c8ff }],
    boss: { name: '氷河の女王 フリジア', t: 'knight', color: 0xaee6ff, accent: 0x5ad0ff, scale: 3.0, patterns: ['cross', 'ring', 'rain', 'charge', 'nova'] },
  },
  {
    n: 7, name: '沈んだ神殿', ground: 0x1a3a4a, ground2: 0x24505e, fog: 0x0e3040, skyTop: 0x04202a, skyBot: 0x1a5a6a,
    sun: 0x80e0ff, sunI: 1.1, hemi: [0x60c0e0, 0x041018], fogNear: 15, fogFar: 85,
    props: [['pillar', 50, 0x8aa0a8], ['coral', 60, 0xff7a9a, 0x5affd0], ['rock', 30, 0x2a4a5a]],
    particles: 'bubble', amb: 'underwater',
    music: { root: 55, mode: 'dorian', bpm: 78, prog: [0, 6, 3, 4], feel: 'deep' },
    mobs: [{ t: 'wisp', name: 'アビスジェリー', color: 0x5affe0 }, { t: 'knight', name: '沈黙の衛兵', color: 0x4a6a70 }],
    boss: { name: '深淵の守護者 レヴィア', t: 'beast', color: 0x2a6a8a, accent: 0x5affe0, scale: 4.0, patterns: ['ring', 'cross', 'rain', 'nova', 'cone', 'summon'] },
  },
  {
    n: 8, name: '嵐の尖塔', ground: 0x3a3a48, ground2: 0x50506a, fog: 0x404060, skyTop: 0x1a1a2a, skyBot: 0x5a5a7a,
    sun: 0xc0c8ff, sunI: 1.3, hemi: [0x9090c0, 0x101018], fogNear: 18, fogFar: 90,
    props: [['spire', 40, 0x4a4a5a, 0x8ab0ff], ['rock', 50, 0x50505e], ['pillar', 20, 0x6a6a7a]],
    particles: 'rain', amb: 'storm',
    music: { root: 58, mode: 'minor', bpm: 112, prog: [0, 6, 5, 6], feel: 'drive' },
    mobs: [{ t: 'wisp', name: 'サンダースピリット', color: 0xb0c8ff }, { t: 'knight', name: 'ストームナイト', color: 0x6070a0 }],
    boss: { name: '嵐神の化身 テンペスト', t: 'wisp', color: 0x8ab0ff, accent: 0xffffff, scale: 3.4, patterns: ['rain', 'charge', 'cross', 'nova', 'ring', 'spiral'] },
  },
  {
    n: 9, name: '虚無の庭', ground: 0x2a2040, ground2: 0x3a2c56, fog: 0x0a0612, skyTop: 0x000000, skyBot: 0x2a1040,
    sun: 0xc0a0ff, sunI: 1.9, hemi: [0x9a70ff, 0x201030], fogNear: 18, fogFar: 85,
    props: [['voidcube', 50, 0x1a1028, 0xb060ff], ['spike', 40, 0x201830], ['crystal', 30, 0xb060ff, 0xff40a0]],
    particles: 'void', amb: 'void',
    music: { root: 53, mode: 'phrygian', bpm: 84, prog: [0, 1, 6, 1], feel: 'dark' },
    mobs: [{ t: 'knight', name: 'ヴォイドナイト', color: 0x52407a }, { t: 'wisp', name: 'ナイトメア', color: 0xb060ff }],
    boss: { name: '虚無の騎士 ノクス', t: 'knight', color: 0x3a2a5a, accent: 0xb060ff, scale: 3.2, patterns: ['spiral', 'cross', 'nova', 'charge', 'ring', 'rain'] },
  },
  {
    n: 10, name: '天空の玉座', ground: 0xf0e8d0, ground2: 0xfff6e0, fog: 0xfff0d8, skyTop: 0x7ab0ff, skyBot: 0xffe8c0,
    sun: 0xfff0c0, sunI: 2.6, hemi: [0xffffff, 0xd0b080], fogNear: 30, fogFar: 140,
    props: [['pillar', 60, 0xfff6e8], ['cloud', 40, 0xffffff], ['crystal', 20, 0xffd860, 0xffffff]],
    particles: 'feather', amb: 'heaven',
    music: { root: 62, mode: 'lydian', bpm: 96, prog: [0, 1, 5, 4], feel: 'holy' },
    mobs: [{ t: 'knight', name: '天の守護騎士', color: 0xf0e0b0 }, { t: 'wisp', name: 'セラフィム', color: 0xfff0a0 }],
    boss: { name: '天空の王 アストラエア', t: 'knight', color: 0xfff0d0, accent: 0xffc030, scale: 3.8, patterns: ['meteor', 'spiral', 'cross', 'nova', 'charge', 'ring', 'rain', 'summon'] },
  },
];

export const floorLevel = (n) => 1 + (n - 1) * 5; // 階層の基準モンスターLv
export const bossLevel = (n) => floorLevel(n) + 6;

// --- 図形判定 -------------------------------------------------------------
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function inShape(s, x, z, pad = 0.4) {
  const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
  switch (s.k) {
    case 'circle': return d <= s.r + pad;
    case 'ring': return d >= s.r0 - pad && d <= s.r1 + pad;
    case 'cone': {
      if (d > s.len + pad) return false;
      if (d < 1.2) return true;
      return Math.abs(angDiff(Math.atan2(dx, dz), s.a)) <= s.arc / 2 + pad / Math.max(d, 1);
    }
    case 'line': {
      const fx = Math.sin(s.a), fz = Math.cos(s.a);
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return along >= -pad && along <= s.len + pad && side <= s.w / 2 + pad;
    }
  }
  return false;
}

// --- アイテム生成 ---------------------------------------------------------
let itemSeq = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function rollRarity(boost = 0, minRarity = 0) {
  // boost: 0=通常, 1=ボス
  const ws = RARITIES.map((r, i) => {
    if (i < minRarity) return 0;
    let w = r.w;
    if (i >= 3) w *= 1 + boost * 5;
    if (i === 2) w *= 1 + boost * 1.5;
    return w;
  });
  let t = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { t -= ws[i]; if (t <= 0) return i; }
  return 0;
}

function affixValue(key, rmult) {
  const a = AFFIXES[key];
  const v = rnd(a.min, a.max) * (0.7 + rmult * 0.3);
  return Math.round(v * 10) / 10;
}

export function makeItem(ilvl, rarity, opts = {}) {
  const r = RARITIES[rarity];
  let slot = opts.slot || pick(['weapon', 'weapon', 'weapon', 'armor', 'acc']);
  let kind = opts.kind || null;
  let unique = null;
  if (opts.uniqueDef) {
    // ダンジョン固有のユニーク装備（レアリティは抽選したものを使う）
    unique = { key: 'dun_' + opts.uniqueDef.name, ...opts.uniqueDef };
  } else if (rarity >= 4) {
    const pool = UNIQUES.filter((u) => u.rarity === rarity);
    unique = pick(pool);
  }
  if (unique) {
    slot = unique.slot;
    kind = unique.kind || null;
  }
  if (slot === 'weapon' && !kind) kind = pick(WEAPON_KINDS);
  const tier = Math.min(TIER_PREFIX.length - 1, Math.floor((ilvl - 1) / 5));
  const g = growth(ilvl) * r.mult * rnd(0.92, 1.08);
  const it = {
    id: `${Date.now().toString(36)}${(itemSeq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    slot, kind, rarity, ilvl, affixes: [],
  };
  if (slot === 'weapon') {
    it.atk = Math.round(7 * g);
    it.name = unique ? unique.name : TIER_PREFIX[tier] + WEAPONS[kind].name;
    it.skill = pick(WEAPON_SKILL_POOL[kind]);
  } else if (slot === 'armor') {
    const want = unique?.armor || opts.armor;
    const pool = ARMOR_TYPES.filter((t) => t.lv <= Math.max(ilvl, 1) && (!want || t.cls === want));
    const type = pick(pool.length ? pool : ARMOR_TYPES.filter((t) => t.lv === 1));
    const A = ARMOR_CLASSES[type.cls];
    it.armor = type.cls;
    it.atype = type.id;
    it.trait = type.trait.slice();
    it.hp = Math.round(45 * g * A.hp);
    it.def = A.def;
    it.name = unique ? unique.name : type.name;
  } else {
    it.atk = Math.round(2.5 * g);
    it.hp = Math.round(15 * g);
    it.name = unique ? unique.name : ACC_BASE[Math.min(ACC_BASE.length - 1, Math.floor((ilvl - 1) / 8))];
  }
  if (unique) { it.unique = unique.key; it.fx = unique.fx.slice(); it.lore = unique.lore; }
  it.weight = itemWeight(it);
  const keys = Object.keys(AFFIXES).sort(() => Math.random() - 0.5);
  for (let i = 0; i < r.affixes; i++) it.affixes.push([keys[i], affixValue(keys[i], r.mult)]);
  return it;
}

export function starterWeapon(kind) {
  const it = makeItem(1, 0, { slot: 'weapon', kind });
  it.name = '初心者の' + WEAPONS[kind].name;
  it.atk = 6;
  it.skill = WEAPON_SKILL_POOL[kind][0];
  return it;
}
