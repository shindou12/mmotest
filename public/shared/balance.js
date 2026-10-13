// Three-floor cooperative challenge. Tune here; shared by Node and browser solo simulation.
export const BALANCE = Object.freeze({
  id: 'coop-hard-v1', label: '協力ハード',
  recommendedParty: 3, maxScaledParty: 5,
  xpRequired: 65, xpExponent: 1.6, killXp: 7,
  playerGrowth: 1.065, enemyHpGrowth: 1.105, enemyDamageGrowth: 1.095,
  enemyHp: 65, enemyDamage: 12, floorSpacing: 8,
  bossHp: 48, bossDamage: 1.1, bossStun: 160, stunSeconds: 2.5,
  eliteHp: 3.2, eliteDamage: 1.5, namedHp: 8, namedDamage: 1.75,
  potionHeal: 0.30, potionCooldown: 8, lifestealEfficiency: 0.55,
  deathSeconds: 5,
  questXp: 0.60,
});

// 這いずり（HP0で倒れる → 仲間の攻撃のスタン値で起き上がる）。単位はスタン値
//   base: 最初に倒れたときのゲージ（円の1/4）。大剣の溜め強攻撃1発＋通常1回で起きる量
//   倒れるたびに base×2, ×3, ×4（円1周）まで増え、decay 秒倒れずにいると1段階戻る
export const REVIVE = Object.freeze({ base: 10.5, steps: 4, perHit: 9, decay: 300, hp: 0.3, iframe: 2, crawl: 1.4, range: 8 });
export const REVIVE_FULL = REVIVE.base * REVIVE.steps;

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
