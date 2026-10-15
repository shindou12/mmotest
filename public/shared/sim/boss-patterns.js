// ボスの技。技（pat）ごとの登録表。技を足すときは、ここに関数を足して、data.js のボスの patterns に名前を書く
// 引数: world（World）, A（エリア）, b（ボス）, target（狙う相手）, k（{ L: 迷宮区, sp: 速さの倍率, base: 基本の威力, col: 予兆の色, ang: 相手への向き, tid: 相手の id, inArena: 部屋にいる人 }）
// 戻り値: 次の行動までの秒数

import { rnd, r2 } from './common.js';

export const BOSS_PATTERNS = {
  shot(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 狙った相手へ弾を扇状に撃つ（盾槍のガードで消せる）
    const n = b.phase === 3 ? 5 : 3;
    world.broadcastArea(A.id, { t: 'aim', id: b.id, tid, d: 700 });
    world.later(A, 0.7 * sp, () => {
      if (A.boss !== b) return;
      const p = world.livePlayer(A, tid) || target;
      const a0 = Math.atan2(p.x - b.x, p.z - b.z);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.22;
        world.shoot(A, b, b.x + Math.sin(a) * 2, b.z + Math.cos(a) * 2, a, 14, 0.9, 2.6, base * 0.75, '#ff5a3a');
      }
    });
    return 1.2 * sp;
  },
  combo(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 狙った相手を追いかける3〜5連叩きつけ
    const n = 3 + (b.phase || 1) - 1;
    for (let i = 0; i < n; i++) {
      world.later(A, i * 0.42 * sp, () => {
        const p = world.livePlayer(A, tid) || target;
        world.tele(A, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 3.2 }], 0.75 * sp, base * 0.85, col);
      });
    }
    return (0.42 * n + 0.5) * sp;
  },
  sweep(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 扇が回転しながら連続で薙ぎ払う
    const dir = Math.random() < 0.5 ? 1 : -1;
    const n = b.phase === 3 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      world.later(A, i * 0.28 * sp, () => world.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + dir * i * 1.05), arc: 1.2, len: 12 }], 0.7 * sp, base, col));
    }
    return (0.28 * n + 0.6) * sp;
  },
  shock(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 外へ広がる衝撃波。輪と輪の隙間で回避する
    const waves = b.phase >= 2 ? 5 : 4;
    const cx = b.x, cz = b.z;
    for (let i = 0; i < waves; i++) {
      world.later(A, i * 0.45 * sp, () => world.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.2, r1: i * 4.2 + 3 }], 0.8 * sp, base * 0.9, col));
    }
    return (0.45 * waves + 0.5) * sp;
  },
  chase(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 狙いを付け直しながら連続突進
    const n = b.phase === 3 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      world.later(A, i * 0.85 * sp, () => {
        if (A.boss !== b) return;
        const p = world.livePlayer(A, tid) || target;
        world.bossCharge(A, b, p.x, p.z, 0.6 * sp, base * 1.1, col);
      });
    }
    return (0.85 * n + 0.4) * sp;
  },
  cage(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 外周と足元が同時に爆発。安全地帯はドーナツ状の狭い帯だけ
    const cx = b.x, cz = b.z;
    world.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 8, r1: 26 }, { k: 'circle', x: r2(cx), z: r2(cz), r: 4 }], 1.25 * sp, base * 1.3, col, 1);
    world.later(A, 1.0 * sp, () => world.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 3.5, r1: 7 }], 0.9 * sp, base, col));
    return 2.2 * sp;
  },
  ultimate(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 最終形態の大技: 衝撃波 → 十字 → 全員の足元へ雨
    const cx = b.x, cz = b.z;
    for (let i = 0; i < 5; i++) world.later(A, i * 0.35, () => world.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.5, r1: i * 4.5 + 3.2 }], 0.75, base, '#ff1a8a'));
    const mk = (a) => [0, Math.PI / 2].map((o) => ({ k: 'line', x: r2(cx - Math.sin(a + o) * 24), z: r2(cz - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.6 }));
    world.later(A, 2.0, () => world.tele(A, b, mk(Math.PI / 4), 0.9, base * 1.2, '#ff1a8a'));
    world.later(A, 2.6, () => world.tele(A, b, mk(0), 0.9, base * 1.2, '#ff1a8a'));
    world.later(A, 3.2, () => {
      for (const p of world.areaPlayers(A.id)) if (!p.dead && !p.down) for (let k = 0; k < 3; k++) world.later(A, k * 0.3, () => world.tele(A, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 2.8 }], 0.7, base * 0.8, '#ff1a8a'));
    });
    return 4.6;
  },
  slam(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    world.tele(A, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.1 * sp, base, col);
    if (b.enraged) world.later(A, 0.5, () => world.tele(A, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.0 * sp, base, col));
    return 1.3 * sp;
  },
  cone(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    world.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang), arc: 1.9, len: 11 }], 0.95 * sp, base * 1.1, col);
    if (b.enraged) world.later(A, 0.9 * sp, () => world.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + Math.PI), arc: 1.9, len: 11 }], 0.8, base * 1.1, col));
    return 1.1 * sp;
  },
  charge(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    world.bossCharge(A, b, target.x, target.z, 1.0 * sp, base * 1.25, col);
    return 1.4 * sp;
  },
  nova(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    world.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 8.5 }], 1.5 * sp, base * 1.5, col, 1);
    return 1.6 * sp;
  },
  ring(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    world.tele(A, b, [{ k: 'ring', x: r2(b.x), z: r2(b.z), r0: 5.5, r1: 24 }], 1.6 * sp, base * 1.2, col);
    return 1.7 * sp;
  },
  rain(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    const pts = [];
    for (const p of inArena) {
      pts.push({ x: p.x, z: p.z });
      pts.push({ x: p.x + rnd(-4, 4), z: p.z + rnd(-4, 4) });
    }
    const extra = b.enraged ? 8 : 5;
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * L.r;
      pts.push({ x: L.x + Math.sin(a) * rr, z: L.z + Math.cos(a) * rr });
    }
    pts.forEach((pt, i) => world.later(A, i * 0.09, () => world.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.6 }], 1.2 * sp, base * 0.8, col)));
    return 1.3 * sp;
  },
  cross(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    const a0 = Math.random() * Math.PI;
    const mk = (a) => [0, Math.PI / 2].map((o) => ({
      k: 'line', x: r2(b.x - Math.sin(a + o) * 24), z: r2(b.z - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.4,
    }));
    world.tele(A, b, mk(a0), 1.2 * sp, base * 1.1, col);
    world.later(A, 0.75 * sp, () => world.tele(A, b, mk(a0 + Math.PI / 4), 1.2 * sp, base * 1.1, col));
    return 2.0 * sp;
  },
  spiral(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    const arms = b.enraged ? 4 : 3;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k < arms; k++) {
        const a = a0 + k * Math.PI * 2 / arms + i * 0.42;
        const rr = 3 + i * 2.4;
        const pt = { x: b.x + Math.sin(a) * rr, z: b.z + Math.cos(a) * rr };
        world.later(A, i * 0.13, () => world.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.4 }], 0.9 * sp, base * 0.9, col));
      }
    }
    return 1.9 * sp;
  },
  summon(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    const cnt = b.enraged ? 4 : 3;
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2;
      const pos = { x: b.x + Math.sin(a) * 5, z: b.z + Math.cos(a) * 5 };
      world.clampArena(A, pos);
      const add = world.spawnMob(A, 0, pos.x, pos.z, Math.max(1, b.lv - 4), 'add');
      add.hx = L.x; add.hz = L.z;
    }
    return 0.9;
  },
  meteor(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    const pt = { x: target.x + rnd(-2, 2), z: target.z + rnd(-2, 2) };
    world.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 10 }], 2.2 * sp, base * 2.0, '#ff6a20', 1);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, rr = rnd(8, L.r);
      world.later(A, 0.4 + i * 0.2, () => world.tele(A, b, [{ k: 'circle', x: r2(L.x + Math.sin(a) * rr), z: r2(L.z + Math.cos(a) * rr), r: 3 }], 1.1, base * 0.8, col));
    }
    return 1.6 * sp;
  },
  fissure(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 地割れ: 狙った方向へ3本の亀裂が根元から先へ順に走る
    const sx = b.x, sz = b.z;
    for (let s = 0; s < 4; s++) {
      world.later(A, s * 0.22 * sp, () => {
        const sh = [-0.45, 0, 0.45].map((o) => ({ k: 'line', x: r2(sx + Math.sin(ang + o) * s * 6), z: r2(sz + Math.cos(ang + o) * s * 6), a: r2(ang + o), len: 6.5, w: 2.6 }));
        world.tele(A, b, sh, 0.85 * sp, base * 0.95, col);
      });
    }
    return (0.22 * 4 + 0.8) * sp;
  },
  checker(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 市松: 格子の半分 → 残りの半分が交互に爆発する
    const cell = 6;
    const mk = (par) => {
      const sh = [];
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          if (((i + j) & 1) !== par || Math.hypot(i, j) * cell > L.r) continue;
          sh.push({ k: 'circle', x: r2(L.x + i * cell), z: r2(L.z + j * cell), r: 3.4 });
        }
      }
      return sh;
    };
    const first = Math.random() < 0.5 ? 0 : 1;
    world.tele(A, b, mk(first), 1.3 * sp, base, col);
    world.later(A, 1.35 * sp, () => world.tele(A, b, mk(1 - first), 1.0 * sp, base, col));
    return 2.5 * sp;
  },
  haven(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 聖域: アリーナ全体が爆発する大技。光る小さな安全地帯にだけ逃げ込める
    const a = Math.random() * Math.PI * 2, rr = rnd(6, L.r - 6);
    const safe = { x: L.x + Math.sin(a) * rr, z: L.z + Math.cos(a) * rr };
    world.tele(A, b, [{ k: 'ring', x: r2(safe.x), z: r2(safe.z), r0: 4, r1: rr + L.r + 2 }], 2.4 * sp, base * 1.8, col, 1);
    return 2.6 * sp;
  },
  barrage(world, A, b, target, { L, sp, base, col, ang, tid, inArena }) {
    // 全方位弾幕: 溜め（足元の予兆）のあと、全方向へ2波撃つ
    const n = b.phase === 3 ? 16 : 12;
    world.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 4.5 }], 0.9 * sp, base * 0.9, col);
    for (let w = 0; w < 2; w++) {
      world.later(A, (0.9 + w * 0.5) * sp, () => {
        if (A.boss !== b) return;
        for (let i = 0; i < n; i++) {
          const a = ang + (i + w * 0.5) * Math.PI * 2 / n;
          world.shoot(A, b, b.x + Math.sin(a) * 2, b.z + Math.cos(a) * 2, a, 11, 0.9, 2.6, base * 0.6, '#ff8a3a');
        }
      });
    }
    return (0.9 + 0.5 + 0.6) * sp;
  },
};
