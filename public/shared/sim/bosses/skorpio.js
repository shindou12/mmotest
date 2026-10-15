// 砂塵の大蠍 スコルピオ（3層・最後のボス）の行動ロジック。仕様は docs/design/boss-sheets/skorpio.md
// 細長い砂の回廊で戦う。登場は砂の中から。HPバー3本: 1本目が割れると「潜行」が加わり、2本目が割れると詠唱「大砂嵐」（DPSチェック）→ 怒り。
// 毒針の刻印（頭割り＝集まる）は戦いのあいだ一定の間隔で使う。2本目からの潜行は「砂喰らい」（離れる印）: 狙った人の足元から飛び出す。
// 集まる印と離れる印は同時に出さない（片方が付いている間と、終わった直後はもう片方を出さない）。刻印の間は突進も出さない。
import { rnd, r2, pick } from '../common.js';

const STING = { len: 26, w: 3.5, delay: 0.85, dmg: 0.7 }; // 尾の一突き: 細く長い直線（高い頻度で出す）
const STING3 = { n: 3, every: 0.45 }; // 尾の三連突き（怒り）: 狙い直しながら一突きを3回
const PINCER = { arc: 1.7, len: 10, delay: 1.0, dmg: 0.85 }; // 鋏の挟み撃ち: 正面の扇
const CHARGE = { w: 6, delay: 1.25, speed: 34, max: 60, dmg: 1.2 }; // 突進: 狙った人の方へ、回廊の端まで
const STACK = { name: '毒針の刻印', sec: 5, r: 3.0, dmg: 1.35, cd: 16, first: 6, after: 1.5 }; // after: 弾けてから潜行（離れる）を出さない秒数 // 頭割り: 合計 dmg（基本威力の倍率）を人数で割る
// 潜行: sink 秒で沈み、chase 秒のあいだ狙った人を追う（step 秒ごとに盛り上がりの小さな円）。最後に飛び出す（大きな円）
const BURROW = { sink: 0.5, chase: 4.0, speed: 6.2, step: 0.32, trail: { r: 1.6, delay: 0.55, dmg: 0.3 }, erupt: { r: 4.5, delay: 0.9, dmg: 1.1 }, rise: 0.7, cd: 14, entry: 0.8 };
// 砂喰らい（2本目からの潜行）: 狙った人に赤い円（外向きの矢印）が付いてまわり、潜行の終わりにその人の足元から飛び出す。割らない（中にいる人は全員）
const AWAY = { name: '砂喰らい', r: 5.0, dmg: 1.0, after: 3 }; // after: 終わってから刻印（集まる）を出さない秒数
const STORM = { name: '大砂嵐', sec: 6, need: 0.05, delay: 1.0, dmg: 1.1 }; // DPSチェック: need は中断に必要なダメージ（最大HPの割合）

// 回廊の端までの距離（ang の向き）
function toEdge(L, x, z, ang) {
  const B = L.box, dx = Math.sin(ang), dz = Math.cos(ang);
  const tx = dx > 1e-6 ? (B.x1 - x) / dx : dx < -1e-6 ? (B.x0 - x) / dx : Infinity;
  const tz = dz > 1e-6 ? (B.z1 - z) / dz : dz < -1e-6 ? (B.z0 - z) / dz : Infinity;
  return Math.max(0, Math.min(tx, tz));
}
const sting = (world, A, b, p, base) => {
  const ang = Math.atan2(p.x - b.x, p.z - b.z);
  b.a = ang;
  world.tele(A, b, [{ k: 'line', x: r2(b.x), z: r2(b.z), a: r2(ang), len: STING.len, w: STING.w }], STING.delay, base * STING.dmg, '#ff2a2a');
};

export const skorpio = {
  spawn(world, A, b) {
    const L = A.lair;
    b.bars = A.fdef.boss.bars; b.bar = 1;
    b.arch.speed = 4.2; // 狙った人へ歩いて詰めてくる
    b.x = L.x; b.z = L.box.z0 + 6; // 回廊の奥の砂の中
    b.stackCd = STACK.first; b.burrowCd = 0; b.stackT = 0;
    b.entry = true; b.forced = 'burrow'; b.actT = 0.2; // 登場: 砂の中から追ってきて、足元で飛び出す
  },

  tick(world, A, b, inArena, dt) {
    b.tauntT -= dt; b.stackT -= dt; b.burrowCd -= dt;
    if (!b.cast) b.stackCd -= dt;
    if (b.stunT > 0) return false;

    const bar = Math.min(b.bars, Math.floor((1 - Math.max(0, b.hp) / b.mhp) * b.bars) + 1);
    while (b.bar < bar) {
      b.bar++;
      if (b.bar === 2) {
        world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#ffb84a', sfx: 'enrage' });
        b.burrowCd = 1.5; // すぐ潜って見せる
      }
      if (b.bar === 3) {
        b.rage = true; b.enraged = true; b.phase = 2;
        b.arch.speed = 5.0;
        b.dash = null; b.busyT = 0;
        world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#ff5a5a', sfx: 'phase' });
        world.startCast(A, b, STORM.name, STORM.sec, b.mhp * STORM.need, () => this.storm(world, A, b), 'storm');
      }
    }
    if (world.tickCast(A, b, dt)) return true;
    if (b.burrow) { this.tickBurrow(world, A, b, dt); return true; }
    if (b.stackCd <= 0 && !b.forced && inArena.length) { b.forced = 'stack'; b.stackCd = STACK.cd; }
    return false;
  },

  // 大砂嵐が止められなかった: 回廊全体に砂嵐（HP満タンなら倒れない）
  storm(world, A, b) {
    const B = A.lair.box;
    world.tele(A, b, [{ k: 'line', x: r2((B.x0 + B.x1) / 2), z: r2(B.z1), a: r2(Math.PI), len: r2(B.z1 - B.z0), w: r2(B.x1 - B.x0 + 2) }], STORM.delay, world.bossBaseDamage(A, b) * STORM.dmg, '#ff2a2a', 1);
    b.busyT = STORM.delay + 0.6; b.actT = b.busyT + 0.4;
  },

  // 潜行中: 沈む → 狙った人を追う（盛り上がり）→ 飛び出す。潜っている間は攻撃が当たらない（messages.js の hit が見る）
  tickBurrow(world, A, b, dt) {
    const B = b.burrow, L = A.lair;
    B.t += dt;
    b.st = 1;
    if (B.t < BURROW.sink) return;
    if (B.t < BURROW.sink + BURROW.chase) {
      const p = world.livePlayer(A, B.tid) || world.areaPlayers(A.id).find((q) => !q.dead && !q.down);
      if (p) {
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d > 0.3) { const k = Math.min(1, (BURROW.speed * dt) / d); b.x += (p.x - b.x) * k; b.z += (p.z - b.z) * k; b.a = Math.atan2(p.x - b.x, p.z - b.z); }
        world.clampArena(A, b);
      }
      B.stepT -= dt;
      if (B.stepT <= 0) {
        B.stepT = BURROW.step;
        const T = BURROW.trail;
        world.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: T.r }], T.delay, B.base * T.dmg, '#ff3a3a');
      }
      return;
    }
    if (!B.erupted) {
      B.erupted = true;
      if (B.mark) return; // 砂喰らい: 飛び出すのは印の付いた人の足元（印が弾けるときに awayMark が知らせる）
      const E = BURROW.erupt;
      world.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: E.r }], E.delay, B.base * E.dmg * (B.entry ? BURROW.entry : 1), '#ff2a2a', 1);
      return;
    }
    if (B.t >= BURROW.sink + BURROW.chase + BURROW.erupt.delay) {
      b.burrow = null;
      b.stackCd = Math.max(b.stackCd, AWAY.after); // 離れる印の直後に集まる印は出さない
      b.busyT = BURROW.rise; b.actT = BURROW.rise + rnd(0.6, 0.9); // 飛び出した直後は隙
      b.st = 2;
      if (L) world.clampArena(A, b);
    }
  },

  patterns(b) {
    const big = b.stackT > 0 ? [] : ['charge', ...(b.bar >= 2 && b.burrowCd <= 0 ? ['burrow', 'burrow'] : [])]; // 刻印中は大技を出さない
    const stings = b.rage ? ['sting3', 'sting3', 'sting3'] : ['sting', 'sting', 'sting'];
    return [...stings, 'pincer', 'pincer', 'rain', ...big];
  },
  repeatable: ['sting', 'sting3'], // 細い尾の突きは続けて出してよい（高い頻度で来る方向攻撃）
  gap: (b) => (b.rage ? rnd(0.3, 0.55) : b.bar >= 2 ? rnd(0.45, 0.8) : rnd(0.55, 0.9)),
  chain: (b) => (b.rage ? 0.35 : b.bar >= 2 ? 0.3 : 0.25),

  // スコルピオだけの技（ほかは sim/boss-patterns.js の共通の技: rain）
  moves: {
    sting(world, A, b, target, { base }) {
      sting(world, A, b, target, base);
      return STING.delay + 0.35;
    },
    sting3(world, A, b, target, { base }) {
      // 尾の三連突き: 突くたびに狙い直す
      sting(world, A, b, target, base);
      for (let i = 1; i < STING3.n; i++) {
        world.later(A, i * STING3.every, () => { if (A.boss === b && !b.burrow) sting(world, A, b, world.livePlayer(A, target.id) || target, base); });
      }
      return (STING3.n - 1) * STING3.every + STING.delay + 0.35;
    },
    pincer(world, A, b, target, { base, ang }) {
      world.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang), arc: PINCER.arc, len: PINCER.len }], PINCER.delay, base * PINCER.dmg, '#ff2a2a');
      return PINCER.delay + 0.4;
    },
    charge(world, A, b, target, { base, ang }) {
      // 狙った人の方へ、回廊の端まで一直線（盾槍のガードで止まる）
      const len = Math.min(CHARGE.max, toEdge(A.lair, b.x, b.z, ang));
      if (len < 6) { sting(world, A, b, target, base); return STING.delay + 0.35; } // 端に近すぎる → 尾の一突きに替える
      const sx = b.x, sz = b.z;
      world.tele(A, b, [{ k: 'line', x: r2(sx), z: r2(sz), a: r2(ang), len: r2(len), w: CHARGE.w }], CHARGE.delay, base * CHARGE.dmg, '#ff2a2a', 1);
      world.later(A, CHARGE.delay, () => {
        if (A.boss !== b || b.stunT > 0) return;
        const end = { x: sx + Math.sin(ang) * (len - 2), z: sz + Math.cos(ang) * (len - 2) };
        world.clampArena(A, end);
        b.a = ang;
        b.dash = { fx: b.x, fz: b.z, tx: end.x, tz: end.z, t: 0, dur: Math.max(0.2, (len - 2) / CHARGE.speed) };
      });
      return CHARGE.delay + (len - 2) / CHARGE.speed + 0.5;
    },
    stack(world, A, b, target, { base, inArena }) {
      // 毒針の刻印: だれか1人に付ける（狙われ役とは限らない）
      const p = pick(inArena.filter((q) => !q.down)) || target;
      world.stackMark(A, b, p, STACK.sec, STACK.r, base * STACK.dmg);
      world.broadcastArea(A.id, { t: 'cast', id: b.id, name: STACK.name, d: STACK.sec * 1000, need: 0 });
      b.stackT = STACK.sec + STACK.after; // 集まる印の間と直後は、離れる印（潜行）・突進を出さない
      b.a = Math.atan2(p.x - b.x, p.z - b.z);
      return 0.9;
    },
    burrow(world, A, b, target, { base }) {
      // 潜行: 沈んで、狙った人を追いかけ、足元から飛び出す
      if (b.stackT > 0 && !b.entry) { sting(world, A, b, target, base); return STING.delay + 0.35; } // 刻印中は潜らない
      const mark = !b.entry; // 登場は走って振り切れる追いかけ。2本目からは砂喰らい（狙った人の足元から飛び出す）
      b.burrow = { t: 0, tid: target.id, stepT: 0, base, entry: !!b.entry, mark };
      b.entry = false;
      b.burrowCd = BURROW.cd;
      const total = BURROW.sink + BURROW.chase + BURROW.erupt.delay + BURROW.rise;
      if (mark) {
        world.awayMark(A, b, target, BURROW.sink + BURROW.chase + BURROW.erupt.delay, AWAY.r, base * AWAY.dmg, (q) => {
          b.x = q.x; b.z = q.z; world.clampArena(A, b); // 印の付いた人の足元から飛び出す
        });
        world.broadcastArea(A.id, { t: 'cast', id: b.id, name: AWAY.name, d: Math.round((total - BURROW.rise) * 1000), need: 0 });
      }
      world.broadcastArea(A.id, { t: 'bossAct', id: b.id, p: 'burrow', tid: target.id, d: Math.round(total * 1000) });
      return total;
    },
  },
};
