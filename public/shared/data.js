// ゲームデータ定義（サーバー・クライアント共通）
import { BALANCE } from './balance.js';
import { WEAPON_DEFS } from '../js/weapons/index.js';

export const MAX_LEVEL = 50;
export const FIELD_RADIUS = 68;
export const GATE_POS = { x: 0, z: 40 };
export const LAIR_POS = { x: 0, z: -46 };
export const LAIR_RADIUS = 17;

// --- 成長曲線（協力ハード） -------------------------------------------------
export const xpToNext = (lv) => Math.round(BALANCE.xpRequired * Math.pow(lv, BALANCE.xpExponent));
export const mobXp = (mlv) => Math.round(BALANCE.killXp * Math.pow(mlv, 1.25));
export const growth = (lv) => Math.pow(BALANCE.playerGrowth, lv - 1);
export const baseAtk = (lv) => 10 * growth(lv);
export const baseHp = (lv) => 100 * growth(lv);
export const mobHp = (mlv) => BALANCE.enemyHp * Math.pow(BALANCE.enemyHpGrowth, mlv - 1);
export const mobDmg = (mlv) => BALANCE.enemyDamage * Math.pow(BALANCE.enemyDamageGrowth, mlv - 1);

// --- レアリティ（＝装備の出来） ---------------------------------------------
// 粗悪〜傑作は「中身の出来」で決まる（基本値のぶれ・特性の数・特性のティア・強化。itemQuality）。
// 伝説・神器は固有の名前と特殊効果を持つ別枠の装備。
export const RARITIES = [
  { key: 'junk', name: '粗悪', color: '#8c929c' },
  { key: 'common', name: '並', color: '#e6e9ee' },
  { key: 'fine', name: '良品', color: '#62dc6a' },
  { key: 'superior', name: '上質', color: '#4aa8ff' },
  { key: 'epic', name: '逸品', color: '#b86cff' },
  { key: 'master', name: '傑作', color: '#ffd84a' },
  { key: 'legendary', name: '伝説', color: '#ff9a2e' },
  { key: 'divine', name: '神器', color: '#ff3d63' },
];
export const LEGEND = 6; // これ以上は固有装備（伝説・神器）
export const isLegend = (r) => r >= LEGEND;
// ドロップの「格」（抽選用。0〜3は特性の数、4・5は伝説・神器）。基本値の倍率の幅も格で少し変わる
export const DROP_GRADES = [
  { w: 52, affixes: 0, mult: [0.92, 1.18] },
  { w: 27, affixes: 1, mult: [0.95, 1.25] },
  { w: 14, affixes: 2, mult: [1.0, 1.32] },
  { w: 5.5, affixes: 3, mult: [1.05, 1.4] },
  { w: 1.2, affixes: 3, mult: [1.7, 1.7], rarity: 6 },
  { w: 0.22, affixes: 4, mult: [2.1, 2.1], rarity: 7 },
];

// --- 武器種 ---------------------------------------------------------------
// weight: 装備重量（回避のクールタイムに影響）
// stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ
// melee: 近接武器（生存本能を持つ） / twoHanded: 両手で振る重い武器（構え・振りの動きと音が変わる）
// skillPool: 武器に付くスキルの候補（js/weapons/<武器>.js の weaponSkills の id。1つ目が最初の武器の基本） / grip: 手で握る位置（モデルの原点からの高さ。見た目だけ） / shield: 左腕に持つ盾の形（models/shield-models.js。クラスによっては背負う） / threat: 与えたダメージに対する敵の注意の集めやすさ（なければ1倍）
// offHand: 左手で持つ（弓） / skillSpin: ほかのプレイヤーから見て、スキルを使うと回転斬りに見える
// 中身は js/weapons/<武器>.js の stats（並び順は kindOrder。サーバーもブラウザも同じ）
export const WEAPONS = Object.fromEntries([...WEAPON_DEFS].sort((a, b) => a.kindOrder - b.kindOrder).map((d) => [d.wk, d.stats]));
export const WEAPON_KINDS = Object.keys(WEAPONS);
// 武器を持っていないとき・わからないときの武器の種類
export const DEFAULT_WEAPON = 'sword';
// 生存本能（近接武器のパッシブ）: 常に被ダメージを少し軽減する
export const INSTINCT = { dr: 8 };
// 武器の重さによる固さ: 重い武器ほど、レベルが上がるにつれて被ダメージ軽減（%）が伸びる（短剣・弓は柔らかく、大剣・大斧は固い）
export const weaponDef = (kind, lv) => (WEAPONS[kind]?.weight ?? 0) * Math.max(0, lv) * BALANCE.weaponDef;
// 武器に付くスキルの候補（1つ目が最初の武器の基本のスキル）。中身は WEAPONS[kind].skillPool
export const WEAPON_SKILL_POOL = Object.fromEntries(WEAPON_KINDS.map((k) => [k, WEAPONS[k].skillPool]));
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
const SALVAGE_BASE = [1, 2, 5, 14, 40, 80, 130, 400]; // 粗悪〜神器
export const salvageValue = (it) => Math.round(SALVAGE_BASE[it.rarity] * (1 + (it.ilvl || 1) * 0.15));

const ACC_BASE = ['お守り', '銅の指輪', '銀の首飾り', '翠玉の指輪', '紅玉の護符', '星の耳飾り', '天球の指輪'];

// ---------------------------------------------------------------------------
// 特性（装備にランダムで付く効果）。ティアで値が決まる
//   T1〜T5: ドロップでも鍛冶屋の特性変更でも付く
//   T6「超越 I」・T7「超越 II」: 後半の高いアイテムレベルの装備に、ドロップでだけ付く（鍛冶屋では付けられない）
// ---------------------------------------------------------------------------
export const AFFIXES = {
  atkp: { name: '攻撃力', unit: '%', tiers: [3, 5, 7, 9, 12, 15, 19] },
  crit: { name: '会心率', unit: '%', tiers: [2, 3, 4, 5, 7, 9, 11] },
  critd: { name: '会心ダメージ', unit: '%', tiers: [8, 12, 16, 22, 30, 38, 48] },
  hpp: { name: '最大HP', unit: '%', tiers: [4, 6, 9, 12, 16, 20, 25] },
  aspd: { name: '攻撃速度', unit: '%', tiers: [2, 4, 6, 8, 10, 13, 16] },
  move: { name: '移動速度', unit: '%', tiers: [2, 3, 5, 6, 8, 10, 12] },
  vamp: { name: 'HP吸収', unit: '%', tiers: [0.5, 1, 1.5, 2, 3, 4, 5] },
  cdr: { name: 'スキル短縮', unit: '%', tiers: [3, 5, 8, 10, 14, 17, 20] },
  def: { name: '被ダメ軽減', unit: '%', tiers: [1.5, 2.5, 3.5, 4.5, 6, 7.5, 9] },
};
export const MAX_TIER = 7; // ドロップの上限（超越 II）
export const CRAFT_MAX_TIER = 5; // 鍛冶屋で付けられる上限
export const tierLabel = (t) => (t >= 7 ? '超越 II' : t === 6 ? '超越 I' : `T${t}`);
export const tierColor = (t) => (t >= 6 ? '#ff7ab0' : ['#9aa3b5', '#9fd8ff', '#7ab8ff', '#c8a0ff', '#ffc060'][t - 1]);

// 特性「スキル変化」: 武器にだけ付き、武器スキルの性質を大きく変える（1つの武器に1つまで）。超越の特性として扱う
// t はティア（1〜7）。数値はティアで強くなる（V にまとめて、説明文と実際の効果で同じ式を使う）
export const SV = {
  twinMult: (t) => 0.4 + t * 0.1,
  giantRange: (t) => 1.4 + t * 0.1, giantMult: (t) => 1 + t * 0.08,
  rapidCd: (t) => 0.4 + t * 0.05, rapidMult: 0.8,
  blazeDot: (t) => 0.13 + t * 0.05, blazeBoom: 0.8,
  stormChains: (t) => 2 + Math.ceil(t / 2), stormMult: (t) => 0.4 + t * 0.1,
  drain: (t) => 0.1 + t * 0.04,
  blinkDist: (t) => 5 + t,
  quake: (t) => 2.5 + t * 0.6,
  frost: (t) => 0.65 + t * 0.12,
  galeLife: (t) => 2.5 + t * 0.25, galeMult: (t) => 0.15 + t * 0.04,
  heavyMult: (t) => 1.8 + t * 0.12,
  holyMult: (t) => 0.75 + t * 0.15, holyHeal: (t) => 4 + t,
  venomDot: (t) => 0.16 + t * 0.04, venomSec: 5,
  meteorCount: (t) => 3 + Math.floor(t / 3), meteorMult: (t) => 0.4 + t * 0.08,
  hasteSec: 4, haste: (t) => 15 + t * 3,
  wardSec: 3, ward: (t) => 25 + t * 4,
};
const pct = (v) => Math.round(v * 100);
export const SKILL_VARIANTS = {
  sv_twin: { name: '二連', icon: '⟳', desc: (t) => `武器スキルが少し後にもう一度発動する（2回目の威力 ${pct(SV.twinMult(t))}%）` },
  sv_giant: { name: '巨大化', icon: '⬣', desc: (t) => `武器スキルの範囲・射程 +${pct(SV.giantRange(t) - 1)}%、威力 +${pct(SV.giantMult(t) - 1)}%。クールタイム +30%` },
  sv_rapid: { name: '迅速', icon: '⚡', desc: (t) => `武器スキルのクールタイム -${pct(SV.rapidCd(t))}%。威力 -${pct(1 - SV.rapidMult)}%` },
  sv_blaze: { name: '爆炎', icon: '🔥', color: 0xff6a20, desc: (t) => `炎属性になる。当たった敵を3秒間燃やす（毎秒 威力${pct(SV.blazeDot(t))}%）。最初に当たった所で爆発する（威力${pct(SV.blazeBoom)}%）` },
  sv_storm: { name: '雷鳴', icon: '⚡', color: 0xffe040, desc: (t) => `雷属性になる。当たった敵から近くの敵${SV.stormChains(t)}体へ雷が連鎖する（威力${pct(SV.stormMult(t))}%）` },
  sv_drain: { name: '吸命', icon: '♥', color: 0xc060ff, desc: (t) => `武器スキルで与えたダメージの${pct(SV.drain(t))}%を回復する` },
  sv_blink: { name: '瞬身', icon: '➶', color: 0x9affff, desc: (t) => `発動の直前に、狙った方向へ${SV.blinkDist(t)}m瞬間移動する（無敵あり）` },
  sv_quake: { name: '崩撃', icon: '◎', color: 0xd8b080, desc: (t) => `ボスのスタン値が${SV.quake(t).toFixed(1)}倍。当たった所に衝撃波が走る` },
  sv_frost: { name: '氷結', icon: '❄', color: 0x80d8ff, desc: (t) => `氷属性になる。当たった敵が凍りつき、1秒後に氷が砕けて周りの敵にも威力${pct(SV.frost(t))}%` },
  sv_gale: { name: '旋風', icon: '🌀', color: 0x8affb0, desc: (t) => `風属性になる。狙った場所に竜巻が${SV.galeLife(t).toFixed(1)}秒残り、0.4秒ごとに威力${pct(SV.galeMult(t))}%` },
  sv_heavy: { name: '剛撃', icon: '✊', color: 0xff5040, desc: (t) => `武器スキルが必ず会心になり、威力 ×${SV.heavyMult(t).toFixed(2)}。クールタイム +80%` },
  sv_holy: { name: '聖光', icon: '✚', color: 0xfff0a0, desc: (t) => `光属性になる。発動の0.6秒後、狙った場所に光の柱が落ちて威力${pct(SV.holyMult(t))}%。自分のHPを${SV.holyHeal(t)}%回復する` },
  sv_venom: { name: '猛毒', icon: '☠', color: 0x8aff5a, desc: (t) => `毒属性になる。当たった敵を${SV.venomSec}秒間 毒にする（0.5秒ごとに威力${pct(SV.venomDot(t))}%）` },
  sv_meteor: { name: '流星', icon: '☄', color: 0xffa060, desc: (t) => `発動すると、狙った場所の周りに流星が${SV.meteorCount(t)}つ降る（各 威力${pct(SV.meteorMult(t))}%）` },
  sv_haste: { name: '疾駆', icon: '»', color: 0x9affc8, desc: (t) => `発動すると${SV.hasteSec}秒間、移動速度と攻撃速度 +${SV.haste(t)}%` },
  sv_ward: { name: '守護', icon: '⛨', color: 0xbfe0ff, desc: (t) => `発動すると${SV.wardSec}秒間、被ダメージ -${SV.ward(t)}%` },
};
export const isVariant = (key) => key.startsWith('sv_');
// 超越の特性の数（T6以上の特性と、スキル変化）。名前の頭に、この数だけ★を付ける
export const transcendCount = (it) => (it?.affixes || []).filter(([k, t]) => isVariant(k) || t >= 6).length;
export const displayName = (it) => '★'.repeat(transcendCount(it)) + (it?.name || '');
export const affixName = (key) => (isVariant(key) ? `スキル変化「${SKILL_VARIANTS[key].name}」` : AFFIXES[key].name);
export const affixVal = (key, tier) => (isVariant(key) ? tier : AFFIXES[key].tiers[tier - 1]);
// 特性の説明文（例: 攻撃力 +7%）
export function affixText(a) {
  const [key, tier] = a;
  if (isVariant(key)) return `${SKILL_VARIANTS[key].name}：${SKILL_VARIANTS[key].desc(tier)}`;
  const A = AFFIXES[key];
  return `${A.name} +${affixVal(key, tier)}${A.unit}`;
}
// ドロップ時のティア: アイテムレベルとドロップの格（DROP_GRADES の番号）で上限が決まり、上限に近いほど出やすい
// 超越（T6・T7）はアイテムレベル25・30から。さらに出る確率を絞る
export function rollTier(ilvl, grade) {
  const max = Math.max(1, Math.min(MAX_TIER, 1 + Math.floor(ilvl / 5) + (grade >= 4 ? 1 : 0)));
  let t = weightedTier(Math.min(max, CRAFT_MAX_TIER), true);
  if (max >= 6 && t === CRAFT_MAX_TIER && Math.random() < 0.25 + grade * 0.05) t = 6;
  if (max >= 7 && t === 6 && Math.random() < 0.2 + grade * 0.04) t = 7;
  return t;
}
// ---------------------------------------------------------------------------
// 装備の出来 → レアリティ（粗悪〜傑作）
//   そのアイテムレベルで出せる最高の物（特性3つが全部上限のティア・基本値が最高）を 1 として、
//   特性 70% ＋ 基本値のぶれ 30% ＋ 強化 1段 3%。超越のティアやスキル変化は上限を超えて加点
// ---------------------------------------------------------------------------
export const tierCap = (ilvl) => Math.max(1, Math.min(CRAFT_MAX_TIER, 1 + Math.floor((ilvl || 1) / 5)));
export function itemQuality(it) {
  const cap = Math.max(3, tierCap(it.ilvl)); // 序盤（T1・T2しか出ない頃）は T3 を満点として測る → 序盤は白・緑が中心
  const af = (it.affixes || []).reduce((a, [k, t]) => a + (isVariant(k) ? 1.25 : Math.min(1.5, t / cap)), 0) / 3;
  const base = Math.max(0, Math.min(1, ((it.bm ?? 1.1) - 0.92) / 0.48));
  return 0.7 * af + 0.3 * base + (it.enh || 0) * 0.03;
}
export const QUALITY_STEPS = [0.07, 0.24, 0.45, 0.64, 0.82]; // 粗悪 | 並 | 良品 | 上質 | 逸品 | 傑作 の境目
export function qualityRarity(q) {
  let r = 0;
  while (r < QUALITY_STEPS.length && q >= QUALITY_STEPS[r]) r++;
  return r;
}
// 出来からレアリティを付け直す（作ったとき・鍛冶屋で手を加えたとき・古いセーブを読んだとき）
export function gradeItem(it) {
  if (!it || it.slot === 'title' || (it.unique && isLegend(it.rarity))) return it;
  const r = qualityRarity(itemQuality(it));
  it.rarity = it.unique ? Math.max(4, r) : r; // ダンジョン固有の装備は逸品以上
  return it;
}
// 1〜max から抽選。high=true なら上が出やすく、false なら下が出やすい（鍛冶屋の特性変更）
export function weightedTier(max, high) {
  const ws = Array.from({ length: max }, (_, i) => Math.pow(0.6, high ? max - 1 - i : i));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < max; i++) { r -= ws[i]; if (r <= 0) return i + 1; }
  return 1;
}
// 初期武器のスキルを、いつもの「その武器の最初のスキル」から変えるもの（武器の種類ごと）
//   skill: 初期武器のスキル / version: 変えた版（セーブの starterSkillVersion）/ old: 古いセーブの初期武器にあったスキル（読み込むと skill に変える）
export const STARTER_SKILL = { sword: { skill: 'retreat', version: 1, old: 'vorpal' } };
// 古いセーブの特性 [種類, 値] を [種類, ティア, 値] に直す
export function migrateItem(it) {
  // Upgrade the starter's original skill once; retain later blacksmith choices.
  const st = it && Object.hasOwn(STARTER_SKILL, it.kind ?? '') ? STARTER_SKILL[it.kind] : null;
  if (st && it.name === '初心者の' + WEAPONS[it.kind].name && !it.starterSkillVersion) {
    if (it.skill === st.old) it.skill = st.skill;
    it.starterSkillVersion = st.version;
  }
  if (!it || it.v >= 3) return it;
  if (it.v !== 2) {
    it.affixes = (it.affixes || []).map((a) => {
      if (a.length === 3) return a;
      const [key, val] = a;
      if (!AFFIXES[key]) return null;
      const ts = AFFIXES[key].tiers;
      let tier = 1;
      ts.slice(0, CRAFT_MAX_TIER).forEach((v, i) => { if (val >= v * 0.9) tier = i + 1; });
      return [key, tier, ts[tier - 1]];
    }).filter(Boolean);
    if (it.armor && it.trait) { it.base = it.trait; delete it.trait; } // 防具の種類ごとの効果は「基本効果」に改名
    it.enh = it.enh || 0;
  }
  // v3: レアリティが6段（コモン〜神器）から8段（粗悪〜傑作は出来で決まる・伝説・神器）になった
  if (it.slot === 'title') it.rarity = it.title && TITLES[it.title] ? TITLES[it.title].rarity : ({ 4: 6, 5: 7 })[it.rarity] ?? it.rarity + 1;
  else if (it.unique && it.rarity >= 4) it.rarity += 2;
  else {
    // 基本値の倍率は、今の攻撃力・HPから逆算する
    const g = growth(it.ilvl || 1);
    it.bm = it.slot === 'weapon' ? it.atk / (7 * g) : it.slot === 'armor' ? it.hp / (45 * g * (ARMOR_CLASSES[it.armor || 'medium']?.hp || 1)) : it.atk / (2.5 * g);
    if (!Number.isFinite(it.bm)) it.bm = 1.1;
    gradeItem(it);
  }
  it.v = 3;
  return it;
}

// ---------------------------------------------------------------------------
// 鍛冶屋: 強化（+10まで。+5までは必ず成功、+6からは確率。失敗しても下がらない）
// ---------------------------------------------------------------------------
export const ENH_MAX = 10;
export const ENH_RATE = [1, 1, 1, 1, 1, 0.8, 0.65, 0.5, 0.4, 0.3];
export const enhMult = (it) => 1 + (it?.enh || 0) * 0.08;
export function enhCost(it) {
  const e = it.enh || 0;
  return { gold: Math.round((20 + it.ilvl * 6) * Math.pow(1.55, e)), shard: [1, 1, 2, 2, 3, 4, 6, 8, 10, 12][e] };
}
export const affixCost = (it) => ({ gold: 50 + it.ilvl * 10, gem: 1 });
export const skillCost = (it) => ({ gold: 40 + it.ilvl * 8 });
export const loreCost = (it) => ({ gold: 300 + it.ilvl * 20, shard: 10 });
// 分解で手に入る素材: 強化の欠片（レアリティで数が決まる）と、付いていた特性ごとの宝石
const SHARDS = [1, 1, 2, 4, 8, 12, 16, 30]; // 粗悪〜神器
export function salvageMats(it) {
  // 超越の特性を分解しても、特性リストに記録されるのは鍛冶屋の上限（T5）まで
  return { shard: SHARDS[it.rarity] + (it.enh || 0), gems: (it.affixes || []).map(([key, tier]) => [key, Math.min(tier, CRAFT_MAX_TIER)]) };
}

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
  { key: 'amenomurakumo', name: '天叢雲剣', rarity: 7, slot: 'weapon', kind: 'sword', fx: ['wave', 'thunder'], lore: '八岐大蛇の尾より出でし神剣。' },
  { key: 'gungnir', name: 'グングニル', rarity: 7, slot: 'weapon', kind: 'spear', fx: ['thunder', 'skillcrit'], lore: '必中の神槍。放てば必ず主の手に還る。' },
  { key: 'excalibur', name: 'エクスカリバー', rarity: 7, slot: 'weapon', kind: 'greatsword', fx: ['wave', 'star'], lore: '湖の乙女より授けられし聖剣。' },
  { key: 'kusanagi_dagger', name: '月詠ノ小太刀', rarity: 7, slot: 'weapon', kind: 'dagger', fx: ['mirror', 'vamp'], lore: '月光を纏う夜の神の刃。' },
  { key: 'aegis', name: 'アイギスの聖鎧', rarity: 7, slot: 'armor', armor: 'heavy', fx: ['aegis', 'mirror'], lore: '女神の加護を宿す不壊の鎧。' },
  { key: 'yata', name: '八咫鏡', rarity: 7, slot: 'acc', fx: ['mirror', 'star'], lore: '真実を映す神鏡。' },
  // 伝説
  { key: 'durandal', name: 'デュランダル', rarity: 6, slot: 'weapon', kind: 'sword', fx: ['wave'], lore: '決して折れぬ聖騎士の剣。' },
  { key: 'gaebolg', name: 'ゲイ・ボルグ', rarity: 6, slot: 'weapon', kind: 'spear', fx: ['thunder'], lore: '三十の棘を持つ魔槍。' },
  { key: 'muramasa', name: '妖刀 村正', rarity: 6, slot: 'weapon', kind: 'dagger', fx: ['vamp'], lore: '血を求めて止まぬ妖刀。' },
  { key: 'dainsleif', name: 'ダーインスレイヴ', rarity: 6, slot: 'weapon', kind: 'greatsword', fx: ['vamp', 'flame'], lore: '一度抜けば血を見ずには収まらぬ。' },
  { key: 'laevateinn', name: 'レーヴァテイン', rarity: 6, slot: 'weapon', kind: 'sword', fx: ['flame'], lore: '世界を焼く炎の枝。' },
  { key: 'oni_kiba', name: '鬼牙', rarity: 6, slot: 'weapon', kind: 'sword', fx: [], lore: '鬼の牙のように前へ湾曲した刃を持つ剣。' },
  { key: 'sosei', name: '双星剣', rarity: 6, slot: 'weapon', kind: 'sword', fx: [], lore: '二つに分かれた切先が双星を刻む剣。' },
  { key: 'labrys', name: 'ラブリュス', rarity: 6, slot: 'weapon', kind: 'axe', fx: ['flame'], lore: '迷宮の王が掲げた両刃の斧。' },
  { key: 'yoichi', name: '与一の弓', rarity: 6, slot: 'weapon', kind: 'bow', fx: ['thunder'], lore: '揺れる扇の的をも射抜いたという名弓。' },
  { key: 'artemis', name: 'アルテミスの銀弓', rarity: 7, slot: 'weapon', kind: 'bow', fx: ['skillcrit', 'star'], lore: '月の女神の銀の弓。' },
  { key: 'mjolnir', name: '雷斧ミョルニル', rarity: 7, slot: 'weapon', kind: 'axe', fx: ['thunder', 'vamp'], lore: '雷神の怒りを宿す、振るえば戻る斧。' },
  { key: 'dragonscale', name: '竜鱗の鎧', rarity: 6, slot: 'armor', armor: 'heavy', fx: ['aegis'], lore: '古竜の鱗を編んだ鎧。' },
  { key: 'starseer', name: '星詠みの指輪', rarity: 6, slot: 'acc', fx: ['star'], lore: '星の巡りを識る指輪。' },
  { key: 'phantom', name: '幻影の外套', rarity: 6, slot: 'armor', armor: 'light', fx: ['mirror'], lore: '纏う者の影を揺らがせる。' },
];

// --- 階層データ ------------------------------------------------------------
// props: [種類, 数, 色1, 色2]
// 敵の定義: 0〜99 は階層の敵（FLOORS[].mobs）、100 以上は迷宮区の番兵（FLOORS[].elites[i - 100]）、
// 負の数はボスの手下（FLOORS[].boss.minions[-1 - i]）
export const ELITE_BASE = 100;
// きらめくトカゲ（どの階層の屋外にもまれに出る。逃げ回ってコインをまき、倒すと良い装備が出る）
export const TREASURE_ID = 200;
export const TREASURE_DEF = { t: 'lizard', ai: 'treasure', name: 'きらめくトカゲ', color: 0xffd84a, scale: 1.5 };
export const mobDef = (fdef, i) => (i === TREASURE_ID ? TREASURE_DEF : i < 0 ? fdef.boss.minions[-1 - i] : i >= ELITE_BASE ? fdef.elites[i - ELITE_BASE] : fdef.mobs[i]);

export const FLOORS = [
  {
    n: 1, name: '始まりの草原', ground: 0x4c8a3a, ground2: 0x79b552, fog: 0xbfe3ff, skyTop: 0x5aa8ff, skyBot: 0xd8f0ff,
    sun: 0xfff1d6, sunI: 2.2, hemi: [0xcfe8ff, 0x3a5a2a], fogNear: 40, fogFar: 140,
    props: [['tree', 70, 0x3f8f3a, 0x6b4a2a], ['rock', 30, 0x8a8f96], ['flower', 140, 0xffe36b, 0xff8fb3]],
    particles: 'pollen', amb: 'meadow',
    music: { root: 62, mode: 'major', bpm: 88, prog: [0, 4, 5, 3], feel: 'calm' },
    mobs: [
      { t: 'slime', name: 'グリーンスライム', color: 0x66dd55 }, { t: 'beast', name: 'フレンジーボア', color: 0x9a6a44 },
      { t: 'bat', name: 'ケイブバット', color: 0x5a4a6a }, { t: 'mushroom', name: 'ドクキノコ', color: 0xc84a6a },
    ],
    // ドロップの調整: weapon 雑魚が武器だけを別枠で落とす確率 / rare 特性2つ以上の格の出やすさ
    drops: { weapon: 0.17, rare: 0.8 },
    // 迷宮区の番兵（ai: 動き方。look: 'player' はプレイヤーの姿を暗く染めて大きくしたもの。weapon / armor はその装備の見た目）
    elites: [{ t: 'knight', ai: 'sentinel', look: 'player', weapon: 'spear', armor: 5, scale: 1.35, name: '迷宮の近衛騎士', color: 0x6a4a2a, accent: 0xffb030 }],
    boss: { name: 'コボルド王 グラズ', t: 'knight', appearance: 'graz', color: 0x8a6a40, accent: 0xffcc33, scale: 2.8, brain: 'graz', bars: 3, patterns: ['slam', 'cone', 'charge', 'combo', 'breath'] },
  },
  {
    n: 2, name: '霧の森', ground: 0x2f5a3a, ground2: 0x3f6f4a, fog: 0x9ab8b0, skyTop: 0x6a8a90, skyBot: 0xb7cfc8,
    sun: 0xe0f0ff, sunI: 1.4, hemi: [0xb0d0d0, 0x203828], fogNear: 30, fogFar: 120,
    props: [['pine', 110, 0x24553a, 0x4a3a2a], ['mushroom', 40, 0xd8584a, 0xf0e8d8], ['rock', 25, 0x6a7a74]],
    particles: 'firefly', amb: 'forest',
    music: { root: 57, mode: 'dorian', bpm: 80, prog: [0, 3, 6, 4], feel: 'mystic' },
    mobs: [
      { t: 'wisp', name: 'フォレストウィスプ', color: 0x8cffb0 }, { t: 'beast', name: 'ミストウルフ', color: 0x8a9a9a },
      { t: 'mushroom', name: 'ミストマタンゴ', color: 0x7a8ad0 }, { t: 'mage', name: 'ゴブリンシャーマン', color: 0x4a7a3a },
    ],
    elites: [{ t: 'knight', ai: 'sentinel', look: 'player', weapon: 'spear', armor: 3, scale: 1.35, name: '苔むした守り手', color: 0x3a5a34, accent: 0x9cff7a }],
    boss: { name: '霧の大樹 ユグドラ', t: 'golem', appearance: 'yugdra', color: 0x4a6a3a, accent: 0x9cff7a, scale: 3.0, brain: 'yugdra', bars: 3, patterns: ['torrent', 'torrent', 'nova', 'rain'],
      minions: [{ t: 'rootknot', name: '吸い上げの根瘤', color: 0x6a8a3a, link: true, scale: 1.6 }] }, // minions: ボスの手下（link: 大樹へ光の線、scale: 大きさ）
  },
  {
    n: 3, name: '砂塵の荒野', ground: 0xc9a066, ground2: 0xe0bf86, fog: 0xf0d6a8, skyTop: 0xf0b070, skyBot: 0xffe6c0,
    sun: 0xffe0b0, sunI: 2.6, hemi: [0xffe8c8, 0x806040], fogNear: 30, fogFar: 120,
    props: [['cactus', 50, 0x5a8a3a], ['rock', 60, 0xb07a4a], ['bones', 20, 0xeee8d8]],
    particles: 'dust', amb: 'desert',
    music: { root: 60, mode: 'phrygian', bpm: 92, prog: [0, 1, 0, 6], feel: 'exotic' },
    mobs: [
      { t: 'beast', name: 'デザートスコーピオン', color: 0xc08040 }, { t: 'golem', name: 'サンドゴーレム', color: 0xd0aa70 },
      { t: 'scorpion', name: 'ジャイアントスコーピオン', color: 0x8a3a2a }, { t: 'mage', name: '砂漠の呪術師', color: 0xa0702a },
    ],
    elites: [{ t: 'knight', ai: 'sentinel', look: 'player', weapon: 'spear', armor: 6, scale: 1.35, name: '砂塵の処刑騎士', color: 0x8a6a3a, accent: 0xff6a2a }],
    boss: { name: '砂塵の大蠍 スコルピオ', t: 'beast', appearance: 'skorpio', color: 0xa0522d, accent: 0xff6a2a, scale: 3.2, patterns: ['chase', 'sweep', 'cone', 'ring', 'rain', 'combo', 'shot', 'charge', 'fissure', 'checker'], p3: ['spiral', 'cross', 'cage'] },
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

export const floorLevel = (n) => 1 + (n - 1) * BALANCE.floorSpacing; // 基準Lv 1 / 9 / 17
export const bossLevel = (n) => floorLevel(n) + 7;

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

// レア度の出やすさはアイテムレベルで伸びる（序盤は白と緑ばかり、層を上がるほど青・紫が増える）
//   [伸び始めるiLv, 本来の出やすさになるiLv, 序盤の倍率]
const RARITY_RAMP = { 2: [1, 12, 0.45], 3: [5, 22, 0.1], 4: [10, 28, 0.04], 5: [16, 32, 0.02] };
export function rarityRamp(i, ilvl) {
  const R = RARITY_RAMP[i];
  if (!R) return 1;
  const k = Math.max(0, Math.min(1, (ilvl - R[0]) / (R[1] - R[0])));
  return R[2] + (1 - R[2]) * k;
}
// ドロップの格を抽選する（DROP_GRADES の番号: 0〜3 特性の数 / 4 伝説 / 5 神器）。見た目のレアリティは中身の出来で決まる
export function rollRarity(boost = 0, minRarity = 0, ilvl = 99, rare = 1) {
  // boost: 0=通常, 1=ボス / ilvl: 低いほど特性の多い格・固有装備が出にくい / rare: 特性2つ以上の格の出やすさ（階層の drops.rare）
  const ws = DROP_GRADES.map((r, i) => {
    if (i < minRarity) return 0;
    let w = r.w * rarityRamp(i, ilvl) * (i >= 2 ? rare : 1);
    if (i >= 3) w *= 1 + boost * 5;
    if (i === 2) w *= 1 + boost * 1.5;
    return w;
  });
  let t = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { t -= ws[i]; if (t <= 0) return i; }
  return 0;
}


// grade: ドロップの格（rollRarity の結果。0〜3 特性の数 / 4 伝説 / 5 神器）。レアリティは最後に中身の出来で決まる
export function makeItem(ilvl, grade, opts = {}) {
  grade = Math.max(0, Math.min(DROP_GRADES.length - 1, grade | 0));
  const r = DROP_GRADES[grade];
  let rarity = r.rarity ?? 0;
  let slot = opts.slot || pick(['weapon', 'weapon', 'weapon', 'armor', 'acc']);
  let kind = opts.kind || null;
  let unique = null;
  if (opts.uniqueDef) {
    // ダンジョン固有のユニーク装備（格が伝説・神器ならその色、それ以外は出来で決まる・逸品以上）
    unique = { key: 'dun_' + opts.uniqueDef.name, ...opts.uniqueDef };
  } else if (r.rarity) {
    const pool = UNIQUES.filter((u) => u.rarity === r.rarity);
    unique = pick(pool);
  }
  if (unique) {
    slot = unique.slot;
    kind = unique.kind || null;
  }
  // エリアの出やすい武器種（opts.kinds）は25%でそこから選ぶ（全体では1種あたり約2倍）
  if (slot === 'weapon' && !kind) kind = opts.kinds?.length && Math.random() < 0.25 ? pick(opts.kinds) : pick(WEAPON_KINDS);
  const tier = Math.min(TIER_PREFIX.length - 1, Math.floor((ilvl - 1) / 5));
  const bm = Math.round(rnd(r.mult[0], r.mult[1]) * 1000) / 1000; // 基本値の倍率（出来の一部）
  const g = growth(ilvl) * bm;
  const it = {
    id: `${Date.now().toString(36)}${(itemSeq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    slot, kind, rarity, ilvl, bm, affixes: [], enh: 0, v: 3,
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
    it.base = type.trait.slice(); // 防具の種類ごとの基本効果
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
  // エリアごとの「付きやすい特性」（opts.bias）は2倍くらい出やすい
  const bias = opts.bias || [];
  const keys = Object.keys(AFFIXES).map((k) => [k, Math.random() / (bias.includes(k) ? 2 : 1)]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  for (let i = 0; i < r.affixes; i++) { const t = rollTier(ilvl, grade); it.affixes.push([keys[i], t, affixVal(keys[i], t)]); }
  // 武器は特性2つ以上の格でまれに「スキル変化」が付く（特性1つと入れ替わる。超越扱いなので出にくい）
  if (slot === 'weapon' && it.affixes.length && Math.random() < [0, 0, 0.08, 0.15, 0.3, 0.45][grade]) {
    const local = bias.filter(isVariant);
    const sv = local.length && Math.random() < 0.35 ? pick(local) : pick(Object.keys(SKILL_VARIANTS)), t = rollTier(ilvl, grade);
    it.affixes[it.affixes.length - 1] = [sv, t, t];
  }
  return gradeItem(it);
}

// ---------------------------------------------------------------------------
// 称号（4つ目の装備枠）。ステータスは持たず、短く強い効果が1つ。
// req: 'melee'（近接武器のみ）/ 'bow' / 'spear' など、条件を満たす武器のときだけ効く
// ---------------------------------------------------------------------------
export const TITLES = {
  t_boss1: { name: 'コボルド王を討つ者', rarity: 4, desc: 'ボスへのダメージ +15%', src: '第1層ボスの初討伐' },
  t_boss2: { name: '霧を越えし者', rarity: 4, desc: '毒沼・流砂の影響を受けない。継続ダメージ -50%', src: '第2層ボスの初討伐' },
  t_boss3: { name: '砂王を屠りし者', rarity: 6, desc: 'HPが50%以下の間、移動速度 +25%・攻撃速度 +15%', src: '第3層ボスの初討伐' },
  t_lake: { name: '湖のヌシ殺し', rarity: 4, desc: 'ゴールド獲得 +30%。硬貨を吸い寄せる範囲が2倍', src: 'ヌシ・ギガスライムの討伐' },
  t_shark: { name: '砂鮫狩り', rarity: 6, desc: '精鋭・ネームド・ボスへの会心率 +15%', src: '砂鮫ギルガの討伐' },
  t_wind: { name: '疾風', rarity: 3, desc: '回避した後の1.5秒間、移動速度 +40%', src: 'クエスト「猪狩り」' },
  t_blood: { name: '血の渇き', rarity: 4, req: 'melee', desc: '敵を倒すとHPを6%回復する', src: 'クエスト「霧の狼」' },
  t_hawk: { name: '鷹の眼', rarity: 4, req: 'bow', desc: '最大まで引いた矢は会心率 +30%', src: 'クエスト「砂の巨人」' },
  t_guard: { name: '不落の盾', rarity: 4, req: 'spear', desc: 'ガードカウンターを出すと4秒間 被ダメージ -40%', src: 'クエスト「スライム退治」' },
  t_phoenix: { name: '不死鳥', rarity: 6, desc: '倒れたとき、その場でHP30%で一度だけ復活する（5分に1回）', src: 'クエスト「砂塵の王」' },
  // ---- クエスト報酬 ----
  t_delver: { name: '井戸の探索者', rarity: 3, desc: 'ダンジョン・迷宮区の中で移動速度 +15%', src: 'クエスト「古井戸の調査」' },
  t_mapper: { name: '地図職人', rarity: 3, desc: '迷宮・ダンジョンの自動マッピングの範囲が2倍。宝箱がミニマップに遠くから映る', src: 'クエスト「迷宮区の主」' },
  t_traveler: { name: '旅人', rarity: 3, desc: 'エリアを移動・ワープした後の10秒間、移動速度 +30%', src: 'クエスト「霧の向こうへ」' },
  t_treasure: { name: '宝探し', rarity: 4, desc: '宝箱を開けるとゴールドを追加で得て、HPが30%回復する', src: 'クエスト「樹洞の秘宝」' },
  t_breaker: { name: '崩しの達人', rarity: 4, desc: 'ボスのスタン値の溜まり方 +30%。スタン中のボスへのダメージ +15%', src: 'クエスト「大樹の守り手」' },
  t_relic: { name: '古代の守護', rarity: 4, desc: '被ダメージ -8%。ひるみにくくなる', src: 'クエスト「埋もれた神殿」' },
  t_night: { name: '夜目', rarity: 3, desc: 'ダンジョン・迷宮区の中で会心率 +10%', src: 'クエスト「洞窟の羽音」' },
  t_spore: { name: '薬師', rarity: 3, desc: 'ポーションの回復量 +40%', src: 'クエスト「毒キノコ採り」' },
  t_spell: { name: '呪い返し', rarity: 4, desc: '弾（遠距離攻撃）から受けるダメージ -35%', src: 'クエスト「まじない師の影」' },
  t_shell: { name: '甲殻の守り', rarity: 4, req: 'melee', desc: '近接のみ。被ダメージ -12%。正面から受けたときの割り増しがなくなる', src: 'クエスト「大蠍の尾」' },
  // ---- ドロップ限定（倒したときにまれに落ちる）----
  t_lucky: { name: '幸運の星', rarity: 6, desc: '会心率 +8%・ゴールド獲得 +15%', src: 'どの敵からも、ごくまれに落ちる', drop: true },
  t_reaper: { name: '死神の影', rarity: 6, desc: 'HPが30%以下の敵へのダメージ +25%', src: '精鋭からまれに落ちる', drop: true },
  t_berserk: { name: '狂戦士', rarity: 6, req: 'melee', desc: '近接のみ。与ダメージ +20%・被ダメージ +15%', src: 'ネームドからまれに落ちる', drop: true },
  t_star: { name: '流星', rarity: 7, desc: '武器スキルのクールタイム -20%。武器スキルが当たると流れ星が降る', src: '階層ボスからまれに落ちる', drop: true },
  t_storm: { name: '嵐を歩む者', rarity: 4, desc: '雨・霧・砂嵐のエリアで移動速度 +15%・攻撃速度 +10%', src: '天候のあるエリアの敵からまれに落ちる', drop: true },
  t_hunter: { name: '百獣の狩人', rarity: 4, desc: '雑魚（精鋭でない敵）へのダメージ +15%', src: '狩場の敵からまれに落ちる', drop: true },
};
// ドロップ限定の称号の落ちる確率（倒した敵の種類ごと）
export const TITLE_DROPS = [
  { id: 't_lucky', chance: 0.002, when: () => true },
  { id: 't_reaper', chance: 0.03, when: (k) => k.el === 1 },
  { id: 't_berserk', chance: 0.12, when: (k) => k.el === 3 },
  { id: 't_star', chance: 0.06, when: (k) => !!k.boss },
  { id: 't_storm', chance: 0.006, when: (k) => !!k.weather },
  { id: 't_hunter', chance: 0.005, when: (k) => k.type === 'hunt' },
];
export const TITLE_REQ = { melee: '近接武器のみ', bow: '弓のみ', spear: '盾槍のみ' };
// 固有効果のうち、武器の動きに依存するもの（伝承化した称号に条件が付く）
export const FX_REQ = { wave: 'melee' };
export const titleReqOk = (req, wk) => !req || (req === 'melee' ? WEAPONS[wk]?.melee : req === wk);

export function makeTitle(id) {
  const T = TITLES[id];
  return {
    id: `t${Date.now().toString(36)}${(itemSeq++).toString(36)}`, slot: 'title', kind: null, rarity: T.rarity, ilvl: 1,
    affixes: [], enh: 0, v: 3, weight: 0, name: `「${T.name}」`, title: id, req: T.req || null,
  };
}
// 伝承化: 伝説・神器の装備を、その固有効果を持つ称号に変える
export function loreTitle(it) {
  const req = (it.fx || []).map((f) => FX_REQ[f]).find(Boolean) || null;
  return {
    id: `t${Date.now().toString(36)}${(itemSeq++).toString(36)}`, slot: 'title', kind: null, rarity: it.rarity, ilvl: it.ilvl,
    affixes: [], enh: 0, v: 3, weight: 0, name: `「${it.name}」の伝承`, fx: (it.fx || []).slice(), lore: it.lore, req, from: it.name,
  };
}

export function starterWeapon(kind) {
  const it = makeItem(1, 0, { slot: 'weapon', kind });
  it.name = '初心者の' + WEAPONS[kind].name;
  it.atk = 6;
  it.bm = 1.2; gradeItem(it); // 「並」
  const st = Object.hasOwn(STARTER_SKILL, kind) ? STARTER_SKILL[kind] : null;
  it.skill = st ? st.skill : WEAPON_SKILL_POOL[kind][0];
  if (st) it.starterSkillVersion = st.version;
  return it;
}

