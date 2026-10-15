// 霧の大樹 ユグドラ（2層）の行動ロジック。仕様は docs/design/boss-sheets/yugdra.md
// 十字の間の中心に根を張って動かない。HPバー3本: 1本目が割れると「吸い上げ」（4本の通路の端に根瘤。生きている間は回復）、
// 2本目が割れると「森の怒り」（根の奔流が通路を1本ずつ回って襲う）。
import { rnd, r2 } from '../common.js';
import { CELL } from '../../areas.js';

const ARM = { reach: 4.5 * CELL + 1, width: 3 * CELL, end: 4 * CELL }; // 通路: 中心から端まで・幅・根瘤を置く距離
const ARMS = [Math.PI, Math.PI / 2, 0, -Math.PI / 2]; // 通路の向き（北・東・南・西。この順に回る）
const TORRENT = { delay: 1.6, dmg: 1.6 };
const WHEEL = { step: 0.9, delay: 1.2, dmg: 1.4 };
const RIPPLE = { start: 0.6, step: 1.5, every: 0.16, lead: 0.55, w: 1.6, len: 40, span: 18, dmg: 1.0 }; // 根の波: 細い線が部屋の端から端まで横切る（回避でくぐる）
const DRAIN = { name: '吸い上げ', heal: 0.0035, minion: -1 }; // heal: 根瘤1つにつき毎秒、最大HPの割合

// その人がいる通路（中心からの向きで決める）
const armOf = (L, p) => {
  const a = Math.atan2(p.x - L.x, p.z - L.z);
  let best = 0, bd = Infinity;
  ARMS.forEach((v, i) => { const d = Math.abs(Math.atan2(Math.sin(a - v), Math.cos(a - v))); if (d < bd) { bd = d; best = i; } });
  return best;
};
const torrentShape = (L, i) => ({ k: 'line', x: r2(L.x), z: r2(L.z), a: r2(ARMS[i]), len: ARM.reach, w: ARM.width });

export const yugdra = {
  spawn(world, A, b) {
    b.bars = A.fdef.boss.bars; b.bar = 1;
    b.basePats = A.fdef.boss.patterns;
    b.arch.speed = 0; // 根を張って動かない
    b.x = A.lair.x; b.z = A.lair.z;
    b.actT = 2.0;
  },

  tick(world, A, b, inArena, dt) {
    b.tauntT -= dt;
    if (b.stunT > 0) return false;
    const bar = Math.min(b.bars, Math.floor((1 - Math.max(0, b.hp) / b.mhp) * b.bars) + 1);
    while (b.bar < bar) {
      b.bar++;
      if (b.bar === 2) this.startDrain(world, A, b);
      if (b.bar === 3) {
        b.wrath = true; b.enraged = true;
        b.busyT = 0; b.actT = 0.8; b.forced = 'wheel';
        world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#9cff7a', sfx: 'phase' });
      }
    }
    if (b.drain) this.tickDrain(world, A, b, dt);
    return false;
  },

  // 吸い上げ: 4本の通路の端に根瘤。生きている根瘤の数だけ回復し、全部切られるとよろける（スタン）
  startDrain(world, A, b) {
    const L = A.lair;
    b.drain = { ids: [] };
    for (const a of ARMS) {
      const m = world.spawnMob(A, DRAIN.minion, L.x + Math.sin(a) * ARM.end, L.z + Math.cos(a) * ARM.end, b.lv, 'add');
      m.hx = m.x; m.hz = m.z;
      b.drain.ids.push(m.id);
    }
    world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#9cff7a', sfx: 'enrage' });
    world.broadcastArea(A.id, { t: 'cast', id: b.id, name: DRAIN.name, d: 600000, need: 0, act: 'drain' });
  },
  tickDrain(world, A, b, dt) {
    const alive = b.drain.ids.filter((id) => A.mobs.get(id)?.hp > 0).length;
    if (alive > 0) { b.hp = Math.min(b.mhp, b.hp + b.mhp * DRAIN.heal * alive * dt); return; }
    b.drain = null;
    world.broadcastArea(A.id, { t: 'castEnd', id: b.id, ok: 0 });
    world.stunBoss(A, b); // 根瘤を全部切ると、大樹がよろける
  },

  patterns(b) {
    if (b.wrath) return ['wheel', 'wheel', 'torrent', 'nova', 'rain', 'ripple'];
    if (b.drain) return ['rain', 'rain', 'nova', 'torrent']; // 吸い上げ中は手分けしやすいように、通路を襲う技を減らす
    return b.bar >= 2 ? [...b.basePats, 'ripple'] : b.basePats;
  },
  gap: (b) => (b.wrath ? rnd(0.5, 0.8) : b.bar >= 2 ? rnd(0.6, 1.0) : rnd(0.8, 1.2)),
  chain: () => 0.15,

  // ユグドラだけの技（ほかは sim/boss-patterns.js の共通の技: nova / rain）
  moves: {
    torrent(world, A, b, target, { base }) {
      // 根の奔流: 狙った人のいる通路を、中心から端まで
      world.tele(A, b, [torrentShape(A.lair, armOf(A.lair, target))], TORRENT.delay, base * TORRENT.dmg, '#ff2a2a', 1);
      return TORRENT.delay + 0.6;
    },
    ripple(world, A, b, target, { base }) {
      // 根の波: 部屋の端から端まで届く細い線が、縦か横に部屋を横切る。走って逃げ切れないので回避でくぐる
      const R = RIPPLE, L = A.lair, dir = ARMS[Math.floor(Math.random() * ARMS.length)]; // 波が進む向き
      const ux = Math.sin(dir), uz = Math.cos(dir), px = Math.sin(dir + Math.PI / 2), pz = Math.cos(dir + Math.PI / 2);
      const n = Math.floor((R.span * 2) / R.step) + 1;
      for (let k = 0; k < n; k++) {
        const d = -R.span + k * R.step, cx = L.x + ux * d, cz = L.z + uz * d;
        world.later(A, R.start + k * R.every, () => {
          if (A.boss === b) world.tele(A, b, [{ k: 'line', x: r2(cx - px * R.len / 2), z: r2(cz - pz * R.len / 2), a: r2(dir + Math.PI / 2), len: R.len, w: R.w }], R.lead, base * R.dmg, '#ff2a2a');
        });
      }
      return R.start + (n - 1) * R.every + R.lead + 0.5;
    },
    wheel(world, A, b, target, { base }) {
      // 回る奔流: 狙った人のいる通路から、通路を1本ずつ回って襲う。次の通路の予兆は前の通路が弾ける前に出る
      const i0 = armOf(A.lair, target);
      for (let k = 0; k < ARMS.length; k++) {
        world.later(A, k * WHEEL.step, () => { if (A.boss === b) world.tele(A, b, [torrentShape(A.lair, (i0 + k) % ARMS.length)], WHEEL.delay, base * WHEEL.dmg, '#ff2a2a', 1); });
      }
      return WHEEL.step * (ARMS.length - 1) + WHEEL.delay + 0.8;
    },
  },
};
