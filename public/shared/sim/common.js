// サーバーのシミュレーション（World）が共通で使う道具と定数（BALANCE から決まるものは tuning.js）
// ※ ここは何も import しない。sim.js からの import の深さを増やさないため（ARCHITECTURE.md の「sim の import の深さ」）

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const r2 = (v) => Math.round(v * 100) / 100;

export const ARCH = {
  slime: { speed: 3.0, hp: 0.9, dmg: 1.0, wind: 0.85, range: 2.2, aggro: 11 },
  beast: { speed: 5.2, hp: 1.0, dmg: 1.0, wind: 0.65, range: 3.0, aggro: 14 },
  golem: { speed: 2.4, hp: 1.7, dmg: 1.4, wind: 1.1, range: 2.8, aggro: 11 },
  wisp: { speed: 3.6, hp: 0.8, dmg: 0.9, wind: 1.1, range: 9, aggro: 15, ranged: true },
  knight: { speed: 4.0, hp: 1.3, dmg: 1.15, wind: 0.75, range: 4.0, aggro: 13 },
  bat: { speed: 6.2, hp: 0.6, dmg: 0.8, wind: 0.5, range: 2.6, aggro: 16 },
  mushroom: { speed: 1.6, hp: 1.25, dmg: 0.95, wind: 1.0, range: 3.2, aggro: 10 },
  scorpion: { speed: 4.2, hp: 1.25, dmg: 1.2, wind: 0.8, range: 5.0, aggro: 13 },
  mage: { speed: 2.8, hp: 0.8, dmg: 1.05, wind: 1.3, range: 11, aggro: 15, ranged: true },
  rootknot: { speed: 0, hp: 2.0, dmg: 0, wind: 1, range: 0, aggro: 0 }, // ボスの手下: 動かず攻撃しない（霧の大樹の根瘤）
};
export const CHEST_COOLDOWN = 300; // ダンジョン最奥の宝箱
export const SMALL_CHEST_COOLDOWN = 600; // 屋外の小さな宝箱
export const BOX_MAX = 60; // 共有ボックスの容量
export const BOX_RANGE = 4.5;
// ヘイトは一定時間ごとにリセット。狙われている人が攻撃を受けると少し延びる
export const HATE_RESET = { boss: 12, mob: 15 };
export const HATE_ABSORB = 1.2;
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
