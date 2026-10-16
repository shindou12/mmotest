// Three-floor cooperative challenge. Tune here; shared by Node and browser solo simulation.
export const BALANCE = Object.freeze({
  id: 'coop-hard-v1', label: '協力ハード',
  recommendedParty: 3, maxScaledParty: 5,
  xpRequired: 65, xpExponent: 1.6, killXp: 7,
  playerGrowth: 1.065, enemyHpGrowth: 1.105, enemyDamageGrowth: 1.095,
  enemyHp: 65, enemyDamage: 12, floorSpacing: 8,
  bossHp: 48, bossDamage: 1.1, bossStun: 100, bossStunPerPlayer: 0.5, stunSeconds: 3,
  eliteHp: 3.2, eliteDamage: 1.5, namedHp: 8, namedDamage: 1.75,
  potionHeal: 0.30, potionCooldown: 8, lifestealEfficiency: 0.55, lifestealGap: 0.6,
  deathSeconds: 5,
  questXp: 0.60,
  // ボスの攻撃の圧（全ボス共通）: range は予兆の範囲の倍率、gap は技と技の間の倍率、chain は連続で出す確率の上乗せ
  bossRange: 1.15, bossGap: 0.75, bossChain: 0.1,
  weaponDef: 0.02, // 武器の重さ×レベルあたりの被ダメ軽減（%）。重い武器ほどレベルとともに固くなる
});

// 這いずり（HP0で倒れる → 仲間の攻撃のスタン値で起き上がる）。単位はスタン値
//   base: 最初に倒れたときのゲージ。大剣の溜め強攻撃1発＋通常1回で起きる量（大斧の溜め強攻撃なら1発）
//   mult: 最近倒れた回数ごとの倍率（1回目・2回目・3回目以降）。decay 秒倒れずにいると1段階戻る
//   disp: 円の見た目の大きさ（実際の量とは比例させず、1/3 → 2/3 → 1周に見せる）
//   regenDelay 秒だれも攻撃を当てないと、そこから毎秒 最大量の regen（10%）の速さでなめらかに戻る
//   flat: 1回当てるごとに必ず減る固定値（その上にスタン値を足す。短剣・弓のような手数の武器でも起こせるように）
//   perHit / range: 不正な値を弾くための上限（弓でも届くように射程は広め）
export const REVIVE = Object.freeze({
  base: 10.5, mult: [1, 2.5, 4], disp: [1 / 3, 2 / 3, 1], decay: 300, regenDelay: 2.5, regen: 0.1,
  flat: 0.45, perHit: 60, hp: 0.3, iframe: 2, crawl: 1.4, range: 30,
});
// 倒れた回数（1〜）→ 段階の番号
export const reviveStep = (n) => Math.max(0, Math.min(REVIVE.mult.length - 1, (n | 0) - 1));

export function partySize(count) {
  return Math.max(BALANCE.recommendedParty, Math.min(BALANCE.maxScaledParty, Math.floor(count) || 0));
}
export function enemyScale(count, boss = false) {
  const n = partySize(count);
  return 1 + (boss ? 0.85 : 0.55) * (n - 1);
}
export function floorPressure(floor) { return 1 + 0.12 * (floor - 1); }
export function attackPressure(count) { return 1 + 0.06 * (partySize(count) - BALANCE.recommendedParty); }
export function levelXpMultiplier(playerLevel, enemyLevel) {
  const gap = playerLevel - enemyLevel;
  return gap > 8 ? 0.10 : gap > 5 ? 0.25 : gap > 2 ? 0.60 : gap < -3 ? 1.15 : 1;
}
