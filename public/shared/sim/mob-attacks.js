// 敵の攻撃の形。敵の形（t）ごとの登録表。敵の種類を足すときは、ここに関数を足す（なければ default）
// 引数: world（World）, A（エリア）, m（敵）, target（狙う相手）, k（{ ang: 相手への向き, fx/fz: 向きの sin/cos, s: 大きさの倍率（精鋭は1.3）, wind: 溜めの秒数, dmg: 威力 }）
// 戻り値: 予兆の形の配列（mobAttack が出す）。自分で予兆を出したときは null
import { r2 } from './common.js';

export const MOB_ATTACKS = {
  slime: (world, A, m, target, { fx, fz, s }) => [{ k: 'circle', x: r2(m.x + fx * 1.2), z: r2(m.z + fz * 1.2), r: 2.0 * s }],
  beast: (world, A, m, target, { ang, s }) => [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(ang), arc: 1.3, len: 3.6 * s }],
  golem: (world, A, m, target, { s }) => [{ k: 'circle', x: r2(m.x), z: r2(m.z), r: 3.3 * s }],
  wisp: (world, A, m, target, { s }) => [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 2.0 * s }],
  // コウモリ: 狭い扇で急降下
  bat: (world, A, m, target, { ang, s }) => [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(ang), arc: 0.9, len: 3.0 * s }],
  // キノコ: 自分の周りに胞子をまく（紫）
  mushroom(world, A, m, target, { s, wind, dmg }) { world.tele(A, m, [{ k: 'circle', x: r2(m.x), z: r2(m.z), r: 3.6 * s }], wind, dmg, '#b060ff'); return null; },
  // サソリ: 細長い尾の突き刺し＋先端の毒だまり
  scorpion(world, A, m, target, { ang, fx, fz, s }) {
    const L = 5.2 * s;
    return [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: L, w: 1.1 * s }, { k: 'circle', x: r2(m.x + fx * L), z: r2(m.z + fz * L), r: 1.4 * s }];
  },
  // 魔術師: 狙った相手の周りに3つの魔法陣（三角形）
  mage(world, A, m, target, { s, wind, dmg }) {
    const base = Math.random() * Math.PI * 2;
    const pts = [0, 1, 2].map((i) => { const a = base + i * 2.094; return { k: 'circle', x: r2(target.x + Math.sin(a) * 1.6), z: r2(target.z + Math.cos(a) * 1.6), r: 1.7 * s }; });
    world.tele(A, m, pts, wind, dmg * 0.8, '#ff6ad0');
    return null;
  },
  // そのほか（騎士など）: 前へ一直線
  default: (world, A, m, target, { ang, s }) => [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: 4.6 * s, w: 1.8 * s }],
};
