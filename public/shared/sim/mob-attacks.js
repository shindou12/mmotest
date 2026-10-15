// 敵の攻撃の形。敵の形（t）ごとの登録表。敵の種類を足すときは、ここに関数を足す（なければ default）
// 引数: world（World）, A（エリア）, m（敵）, target（狙う相手）, k（{ ang: 相手への向き, fx/fz: 向きの sin/cos, s: 大きさの倍率（精鋭は1.3）, wind: 溜めの秒数, dmg: 威力 }）
// 戻り値: 予兆の形の配列（mobAttack が出す）。自分で予兆を出したときは null
import { r2, dist } from './common.js';
import { collide } from '../areas.js';

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
  // 番兵（迷宮区の精鋭）: 離れていれば踏み込み突き、近ければ3連斬り。出し切ると盾が下がる（tickMob の openT）
  sentinel(world, A, m, target, { ang, s, dmg }) {
    if (dist(target, m) > m.arch.lunge) {
      // 踏み込み突き: 直線の予兆のあと一気に詰める
      const len = Math.min(10, dist(target, m) + 2), D = 0.75;
      world.tele(A, m, [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: r2(len), w: 2.2 }], D, dmg * 1.2);
      world.later(A, D, () => {
        if (!A.mobs.has(m.id)) return;
        const end = collide(A.def, m.x + Math.sin(ang) * (len - 1.5), m.z + Math.cos(ang) * (len - 1.5), 0.6, A.door);
        m.x = end.x; m.z = end.z; m.a = ang;
      });
      m.windT = D + 0.2; m.cd = 2.4;
      return null;
    }
    // 3連斬り: 正面に扇を3回。1回ごとに相手へ向き直る
    for (let i = 0; i < 3; i++) {
      world.later(A, i * 0.45, () => {
        if (!A.mobs.has(m.id)) return;
        const t = world.livePlayer(A, target.id) || target;
        const a = Math.atan2(t.x - m.x, t.z - m.z); m.a = a;
        world.tele(A, m, [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(a), arc: 1.7, len: 4.2 * s }], 0.5, dmg);
      });
    }
    m.windT = 0.45 * 2 + 0.5; m.cd = 2.6;
    return null;
  },
  // そのほか（騎士など）: 前へ一直線
  default: (world, A, m, target, { ang, s }) => [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: 4.6 * s, w: 1.8 * s }],
};
