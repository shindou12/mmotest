// コボルド王 グラズ（1層）の行動ロジック。仕様は docs/design/boss-sheets/graz.md
// HPバー3本: 1本目が割れると詠唱「近衛兵召集」（DPSチェック）、2本目が割れると暴走。
// 常に「HPが3割未満の人」へ狙いを替えて走って近づく。挑発で取り返せる。
import { rnd, r2, angDiff } from '../common.js';

const LOW_HP = 0.3; // 狙いを替えるHPの割合
const MARK_CD = 10; // 狙いを替える間隔（秒）
const SUMMON = { name: '近衛兵召集', sec: 4, need: 0.06, adds: 3, mob: 1 }; // need: 中断に必要なダメージ（最大HPの割合）
const JUDGE = { name: '王の裁き', track: 2.0, turn: 0.9, lock: 0.75, len: 34, w: 6, waves: { n: 4, w: 8.5, half: 14, segs: 4, gap: 0.2, spread: 0.07, delay: 0.45 } }; // turn: 向きを合わせる速さ（rad/秒）。
// waves: 本線の通り道に、横向きの太い帯（幅 w）が手元から gap 秒ずつ n 本すき間なく並び、
//        それぞれ中心から左右へ half m を segs 段に分けて spread 秒ずつ外へ広がる。各段は delay 秒後に弾ける

// 一番HPの割合が低い人（倒れている人は除く）
const weakest = (inArena) => inArena.filter((p) => !p.down).sort((p, q) => p.hp / p.mhp - q.hp / q.mhp)[0];

export const graz = {
  spawn(world, A, b) {
    b.bars = A.fdef.boss.bars; b.bar = 1;
    b.basePats = A.fdef.boss.patterns; // 1・2本目の通常技（data.js）
    b.markCd = 4;
    b.forced = 'throw'; b.actT = 1.2; // 登場: まず大剣を投げつける
  },

  // true を返すと、この回は行動しない
  tick(world, A, b, inArena, dt) {
    b.tauntT -= dt; b.markCd -= dt;
    if (b.stunT > 0) return false;

    // HPバー: 割れたときの出来事（一度に2本割れても順に起こす）
    const bar = Math.min(b.bars, Math.floor((1 - Math.max(0, b.hp) / b.mhp) * b.bars) + 1);
    while (b.bar < bar) {
      b.bar++;
      if (b.bar === 2) {
        world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#ffb84a', sfx: 'enrage' });
        world.startCast(A, b, SUMMON.name, SUMMON.sec, b.mhp * SUMMON.need, () => this.summon(world, A, b));
      }
      if (b.bar === 3) {
        if (b.cast || b.track) world.broadcastArea(A.id, { t: 'castEnd', id: b.id, ok: 0 });
        b.cast = null; b.track = null; b.rampage = true; b.enraged = true; b.phase = 2;
        b.arch.speed = 4.4;
        b.dash = null; b.busyT = 0; b.actT = 0.8; b.forced = 'spin';
        world.broadcastArea(A.id, { t: 'bossEv', id: b.id, color: '#ff5a5a', sfx: 'phase' });
      }
    }
    if (world.tickCast(A, b, dt)) return true;

    // 王の裁き: 溜めている間、狙った人へゆっくり向きを合わせる
    if (b.track) {
      const T = b.track;
      T.t -= dt;
      const p = world.livePlayer(A, T.tid);
      if (p) b.a += Math.max(-JUDGE.turn * dt, Math.min(JUDGE.turn * dt, angDiff(Math.atan2(p.x - b.x, p.z - b.z), b.a)));
      if (T.t <= 0) {
        b.track = null;
        world.later(A, JUDGE.lock, () => world.broadcastArea(A.id, { t: 'castEnd', id: b.id, ok: 1 }));
        world.tele(A, b, [{ k: 'line', x: r2(b.x), z: r2(b.z), a: r2(b.a), len: JUDGE.len, w: JUDGE.w }], JUDGE.lock, T.dmg, '#ff2a2a', 1);
        // 衝撃波が走ると、通り道に横向きの帯が手元から順に並び、それぞれ中心から左右へ広がって弾ける
        const V = JUDGE.waves, a = b.a, ox = b.x, oz = b.z, step = JUDGE.len / V.n, seg = V.half / V.segs;
        for (let i = 0; i < V.n; i++) {
          const d = step * (i + 0.5), cx = ox + Math.sin(a) * d, cz = oz + Math.cos(a) * d;
          for (let j = 0; j < V.segs; j++) {
            world.later(A, JUDGE.lock + V.gap * i + V.spread * j, () => {
              if (A.boss !== b) return;
              // 左右それぞれ、中心から j 段目（外向きの線: 始点から seg m）
              const sh = [1, -1].map((s) => {
                const pa = a + s * Math.PI / 2;
                return { k: 'line', x: r2(cx + Math.sin(pa) * seg * j), z: r2(cz + Math.cos(pa) * seg * j), a: r2(pa), len: r2(seg), w: V.w };
              });
              world.tele(A, b, sh, V.delay, T.dmg * 0.6, '#ff2a2a');
            });
          }
        }
      }
      b.st = 2;
      return true;
    }

    // 弱った者を狙う: HPが3割未満の人がいたら、すぐ狙いを替え（「！」）、今の技が終わったら走って近づく
    if (b.markCd <= 0) {
      const p = weakest(inArena);
      if (p && p.hp / p.mhp < LOW_HP && p.id !== b.target) {
        b.markCd = MARK_CD;
        world.markTarget(A, b, p);
        b.rushTid = p.id;
      }
    }
    if (b.rushTid && !b.dash && b.busyT <= 0) {
      const p = world.livePlayer(A, b.rushTid);
      b.rushTid = null;
      if (p) {
        b.busyT = world.rushTo(A, b, p) + 0.3;
        b.actT = Math.max(b.actT, b.busyT + 0.2);
      }
    }
    return false;
  },

  summon(world, A, b) {
    const L = A.lair;
    for (let i = 0; i < SUMMON.adds; i++) {
      const a = (i / SUMMON.adds) * Math.PI * 2;
      const pos = { x: b.x + Math.sin(a) * 5, z: b.z + Math.cos(a) * 5 };
      world.clampArena(A, pos);
      const add = world.spawnMob(A, SUMMON.mob, pos.x, pos.z, Math.max(1, b.lv - 4), 'add');
      add.hx = L.x; add.hz = L.z;
    }
  },

  // 使う技（同じ名前を複数書くと出やすくなる）
  patterns(b) {
    if (b.rampage) return ['spin', 'spin', 'cleave', 'cleave', 'charge', 'judge'];
    return b.bar >= 2 ? [...b.basePats, 'judge'] : b.basePats;
  },
  gap: (b) => (b.rampage ? rnd(0.3, 0.5) : b.bar >= 2 ? rnd(0.5, 0.9) : rnd(0.6, 1.1)),
  chain: (b) => (b.rampage ? 0 : b.bar >= 2 ? 0.3 : 0.2),

  // グラズだけの技（ほかは sim/boss-patterns.js の共通の技: slam / cone / charge / combo）
  moves: {
    throw(world, A, b, target, { base }) {
      // 登場の大剣投げ: 正面へ直線。吹き飛ばすが、ダメージは中くらい
      const ang = Math.atan2(target.x - b.x, target.z - b.z);
      b.a = ang;
      world.tele(A, b, [{ k: 'line', x: r2(b.x), z: r2(b.z), a: r2(ang), len: 30, w: 5 }], 1.3, base * 0.7, '#ff3a3a', 1);
      return 1.8;
    },
    breath(world, A, b, target, { sp, base, tid }) {
      // ブレス: 予備動作（照準）のあと、扇状に弾を7発
      world.broadcastArea(A.id, { t: 'aim', id: b.id, tid, d: 1000 });
      world.later(A, 1.0 * sp, () => {
        if (A.boss !== b) return;
        const p = world.livePlayer(A, tid) || target;
        const a0 = Math.atan2(p.x - b.x, p.z - b.z);
        for (let i = 0; i < 7; i++) {
          const a = a0 + (i - 3) * 0.18;
          world.shoot(A, b, b.x + Math.sin(a) * 2, b.z + Math.cos(a) * 2, a, 13, 0.9, 2.6, base * 0.7, '#ff7a3a');
        }
      });
      return 1.6 * sp;
    },
    judge(world, A, b, target, { base, inArena }) {
      // 王の裁き: 弱っている人へゆっくり向きを合わせながら溜め → 極太の直線衝撃波
      const p = weakest(inArena) || target;
      b.track = { tid: p.id, t: JUDGE.track, dmg: base * 2.2 };
      world.broadcastArea(A.id, { t: 'cast', id: b.id, name: JUDGE.name, d: Math.round((JUDGE.track + JUDGE.lock) * 1000), need: 0 });
      world.broadcastArea(A.id, { t: 'judge', id: b.id, tid: p.id, d: Math.round(JUDGE.track * 1000), len: JUDGE.len, w: JUDGE.w });
      const V = JUDGE.waves;
      return JUDGE.lock + V.gap * (V.n - 1) + V.spread * (V.segs - 1) + V.delay + 0.9; // 溜め（track）の間は tick が行動を止めているので、その後の分だけ
    },
    spin(world, A, b, target, { base }) {
      // 暴走・回転斬り: 自分の周りを一周 → 大きな隙
      world.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 7.5 }], 1.1, base * 2.0, '#ff2a2a', 1);
      return 1.1 + 2.2;
    },
    cleave(world, A, b, target, { base, ang }) {
      // 暴走・叩き斬り: 正面の広い扇 → 大きな隙
      world.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang), arc: 2.4, len: 13 }], 1.0, base * 2.0, '#ff2a2a', 1);
      return 1.0 + 2.0;
    },
  },
};

