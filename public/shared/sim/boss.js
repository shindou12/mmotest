// World のメソッド: ボスの出現・スタン・行動の選択（技の中身は boss-patterns.js）。sim.js が World.prototype に足す
import { BALANCE, partySize, enemyScale, floorPressure, attackPressure } from '../balance.js';
import { bossLevel, mobHp, mobDmg } from '../data.js';
import { inLair } from '../areas.js';

import { rnd, pick, dist, r2, HATE_RESET, HATE_ABSORB, angDiff } from './common.js';
import { STUN_TIME } from './tuning.js';
import { BOSS_PATTERNS } from './boss-patterns.js';
import { BOSS_BRAINS } from './boss-brains.js';

export const BossMethods = {
  spawnBoss(A) {
    const n = partySize(this.areaPlayers(A.id).length);
    const lv = bossLevel(A.n);
    const hp = Math.round(mobHp(lv) * BALANCE.bossHp * floorPressure(A.n) * enemyScale(n, true));
    const b = {
      id: this.seq++, scaleN: n, kind: 'boss', d: 2, t: A.fdef.boss.t, lv, hp, mhp: hp, x: A.lair.x, z: A.lair.z - 5, a: 0,
      st: 0, actT: 2.5, busyT: 0, enraged: false, phase: 1, last: null, dash: null, arch: { speed: 3.4 }, threat: new Map(),
      hateT: HATE_RESET.boss, hateMax: HATE_RESET.boss, stun: 0, stunMax: Math.round(BALANCE.bossStun * (1 + BALANCE.bossStunPerPlayer * (n - 1))), stunT: 0,
    };
    const brain = BOSS_BRAINS[A.fdef.boss.brain];
    if (brain) brain.spawn(this, A, b);
    A.mobs.set(b.id, b);
    A.boss = b;
    return b;
  },

  resetBoss(A) {
    if (A.boss) A.mobs.delete(A.boss.id);
    for (const m of [...A.mobs.values()]) if (m.kind === 'add') A.mobs.delete(m.id);
    A.boss = null; A.bossState = 'idle'; A.bossCd = 5; A.timers = []; A.projs = [];
    this.broadcastArea(A.id, { t: 'bossReset' });
  },

  // スタン: 一定時間固まり、出している最中の攻撃もすべて取り消す
  stunBoss(A, b) {
    b.stunT = STUN_TIME;
    b.stun = 0;
    b.stunMax = Math.round(b.stunMax * 1.3);
    b.dash = null; b.busyT = 0; b.actT = STUN_TIME + 0.6;
    if (b.cast || b.track) this.broadcastArea(A.id, { t: 'castEnd', id: b.id, ok: 0 });
    b.cast = null; b.track = null;
    A.timers = [];
    A.projs = [];
    this.broadcastArea(A.id, { t: 'stun', id: b.id, sec: STUN_TIME });
  },

  // ---- ボス ----
  tickBoss(A, b, alive, dt) {
    const L = A.lair;
    const inArena = alive.filter((p) => inLair(L, p.x, p.z, 4));
    if (!inArena.length) {
      A.noTargetT += dt;
      if (A.noTargetT > 8) { this.resetBoss(A); return; }
    } else A.noTargetT = 0;

    // ボスごとの行動ロジック（brain）があれば、段階の切り替えはそちらに任せる。true なら今回は行動しない
    const brain = BOSS_BRAINS[A.fdef.boss.brain];
    if (brain) { if (brain.tick(this, A, b, inArena, dt)) return; }
    // フェーズ: 1 → 激昂(65%) → 最終形態(35%)。移行時は大技で割り込む
    else if (!b.enraged && b.hp < b.mhp * 0.65) {
      b.enraged = true; b.phase = 2;
      b.arch.speed = 4.6;
      this.broadcastArea(A.id, { t: 'enrage', id: b.id, p: 2 });
      b.dash = null; b.busyT = 0; b.actT = 0.4; b.forced = 'shock';
    }
    if (!brain && b.phase === 2 && b.hp < b.mhp * 0.35) {
      b.phase = 3;
      b.arch.speed = 5.2;
      this.broadcastArea(A.id, { t: 'enrage', id: b.id, p: 3 });
      b.dash = null; b.busyT = 0; b.actT = 0.6; b.forced = 'ultimate';
    }

    if (b.stunT > 0) { b.stunT -= dt; b.st = 4; return; }

    if (b.dash) {
      b.dash.t += dt;
      const k = Math.min(1, b.dash.t / b.dash.dur);
      b.x = b.dash.fx + (b.dash.tx - b.dash.fx) * k;
      b.z = b.dash.fz + (b.dash.tz - b.dash.fz) * k;
      if (k >= 1) b.dash = null;
      b.st = 3;
      // 正面でガードしている盾槍に当たると突進が止まる
      for (const p of alive) {
        if (!p.gd || Math.hypot(p.x - b.x, p.z - b.z) > 3.2) continue;
        if (Math.abs(angDiff(p.a, Math.atan2(b.x - p.x, b.z - p.z))) > 1.4) continue;
        b.dash = null; b.busyT = 1.2; b.st = 2;
        b.stun += 25;
        this.addThreat(b, p.id, 800);
        if (b.target === p.id) b.hateT = Math.min(b.hateMax, b.hateT + HATE_ABSORB);
        this.broadcastArea(A.id, { t: 'guardStop', id: b.id, pid: p.id, x: r2(b.x), z: r2(b.z) });
        if (b.stun >= b.stunMax) this.stunBoss(A, b);
        break;
      }
      return;
    }
    b.busyT -= dt; b.actT -= dt;
    if (b.busyT > 0) { b.st = 2; return; }

    // 狙う相手はヘイト順（たまに気まぐれで別の人）
    let target = this.threatTarget(b, inArena, L.box ? 100 : L.r + 6) || alive.find((p) => p.id === b.target && inLair(L, p.x, p.z, 4));
    if (!target) target = inArena.length ? pick(inArena) : null;
    b.target = target ? target.id : null;
    if (!target) { b.st = 0; return; }
    const ang = Math.atan2(target.x - b.x, target.z - b.z);
    b.a = ang;
    const d = dist(target, b);
    if (d > 4.5) {
      b.x += Math.sin(ang) * b.arch.speed * dt;
      b.z += Math.cos(ang) * b.arch.speed * dt;
      this.clampArena(A, b);
      b.st = 1;
    } else b.st = 0;

    if (b.actT <= 0) {
      const bd = A.fdef.boss;
      const pats = brain ? brain.patterns(b) : b.phase === 3 ? [...bd.patterns, ...(bd.p3 || [])] : bd.patterns;
      const forced = b.forced;
      let pat = forced || pick(pats);
      b.forced = null;
      if (!forced && pat === b.last && pats.length > 1 && !brain?.repeatable?.includes(pat)) pat = pick(pats.filter((p) => p !== b.last)); // repeatable: 続けて出してよい技
      b.last = pat;
      // brain のあるボスは狙いを気まぐれに変えない（狙い方を読めるように）
      const victim = !brain && Math.random() < 0.2 && inArena.length > 1 ? pick(inArena) : target;
      const busy = this.bossPattern(A, b, pat, victim, inArena);
      b.busyT = busy;
      // 攻撃の間隔は短め。フェーズが進むほど詰めてきて、連続攻撃も増える
      const gap = brain ? brain.gap(b) : [0, rnd(0.6, 1.1), rnd(0.35, 0.7), rnd(0.15, 0.45)][b.phase || 1];
      b.actT = busy + gap * 0.8 * BALANCE.bossGap;
      const chain = (brain ? brain.chain(b) : [0, 0.25, 0.5, 0.7][b.phase || 1]) + BALANCE.bossChain;
      if (Math.random() < chain) b.actT = busy + 0.05;
    }
  },

  // ---- ボスの共通部品（brain から使う） ----
  // 技の基本の威力（各技はこれに倍率を掛ける）
  bossBaseDamage(A, b) { return mobDmg(b.lv) * 3.3 * BALANCE.bossDamage * floorPressure(A.n) * attackPressure(b.scaleN); },
  // 詠唱: 名前とバーを出す。need > 0 なら、詠唱中に need 以上のダメージで中断してスタン。終われば done() を呼ぶ
  // act: 詠唱中の構え（ボスの動きの名前。なければ共通の 'cast'）
  startCast(A, b, name, sec, need, done, act) {
    b.cast = { name, t: sec, need, dealt: 0, done };
    b.busyT = 0.3; b.dash = null; // 詠唱中は tickCast が行動を止める
    this.broadcastArea(A.id, { t: 'cast', id: b.id, name, d: Math.round(sec * 1000), need: need > 0 ? 1 : 0, ...(act ? { act } : {}) });
  },
  tickCast(A, b, dt) {
    const c = b.cast;
    if (!c) return false;
    if (c.need > 0 && c.dealt >= c.need) { this.stunBoss(A, b); return true; } // 中断（stunBoss が詠唱を消す）
    c.t -= dt;
    if (c.t > 0) { b.st = 2; return true; }
    b.cast = null;
    this.broadcastArea(A.id, { t: 'castEnd', id: b.id, ok: 1 });
    c.done?.();
    return false;
  },
  // 詠唱中に受けたダメージ（中断ゲージ）
  castDamage(A, b, dmg) {
    const c = b.cast;
    if (!c || !(c.need > 0)) return;
    c.dealt += dmg;
    this.broadcastArea(A.id, { t: 'castP', id: b.id, k: Math.round(Math.min(1, c.dealt / c.need) * 100) / 100 });
  },
  // 狙いを替える（全ボス共通の「！」マーク）。挑発と同じ仕組みなので、挑発で取り返せる
  markTarget(A, b, p, sec = 6) {
    b.tauntBy = p.id; b.tauntT = sec; b.target = p.id;
    this.broadcastArea(A.id, { t: 'mark', id: b.id, tid: p.id });
  },
  // 人に付く印（全ボス共通）。p の足元に円が付いてまわり、sec 秒で弾ける。半径 r は全ボス共通の予兆の倍率（BALANCE.bossRange）で広げる
  //   頭割り（stackMark・黄色・内向きの矢印＝集まる）: 弾けた瞬間に円の中の人数を数え、合計ダメージ dmg を人数で割って配る
  //     （数えるのはサーバー。画面ごとに数えると食い違うため）
  //   離れる印（awayMark・赤・外向きの矢印＝離れる）: 割らない。円の中にいる人は全員 dmg を受ける（kd: 吹き飛ばし）
  //   onFire(q): 弾けた場所を受け取る（ボスがそこへ飛び出す など）
  stackMark(A, b, p, sec, r, dmg) { this.markPlayer(A, b, p, sec, r, dmg, { split: true }); },
  awayMark(A, b, p, sec, r, dmg, onFire) { this.markPlayer(A, b, p, sec, r, dmg, { split: false, kd: 1, onFire }); },
  markPlayer(A, b, p, sec, r, dmg, { split, kd = 0, onFire }) {
    const R = r2(r * BALANCE.bossRange);
    this.broadcastArea(A.id, { t: 'stack', id: b.id, tid: p.id, r: R, d: Math.round(sec * 1000), ...(split ? {} : { kind: 'away' }) });
    this.later(A, sec, () => {
      if (A.boss !== b) return;
      const q = this.livePlayer(A, p.id) || p; // 倒れた人は、倒れた場所で弾ける
      const n = Math.max(1, this.areaPlayers(A.id).filter((o) => !o.dead && !o.down && Math.hypot(o.x - q.x, o.z - q.z) <= R).length);
      const per = split ? dmg / n : dmg;
      this.broadcastArea(A.id, { t: 'tele', id: this.seq++, src: 0, boss: b.id, sh: [{ k: 'circle', x: r2(q.x), z: r2(q.z), r: R }], d: 120, dmg: Math.round(per), c: split ? '#ffd84a' : '#ff2a2a', n, ...(kd ? { kd: 1 } : {}) });
      onFire?.(q);
    });
  },
  // 走って近づく（ダメージなし）。dash と同じ動きなので、正面でガードしている盾槍に止められる
  rushTo(A, b, p, speed = 16, stop = 3.5) {
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d <= stop + 0.5) return 0;
    const ang = Math.atan2(p.x - b.x, p.z - b.z);
    const end = { x: b.x + Math.sin(ang) * (d - stop), z: b.z + Math.cos(ang) * (d - stop) };
    this.clampArena(A, end);
    b.a = ang;
    const dur = (d - stop) / speed;
    b.dash = { fx: b.x, fz: b.z, tx: end.x, tz: end.z, t: 0, dur };
    return dur;
  },

  clampArena(A, o) {
    const L = A.lair;
    if (L.box) { // 細長い部屋: 長方形の内側へ
      o.x = Math.max(L.box.x0 + 1.5, Math.min(L.box.x1 - 1.5, o.x));
      o.z = Math.max(L.box.z0 + 1.5, Math.min(L.box.z1 - 1.5, o.z));
      return;
    }
    const dx = o.x - L.x, dz = o.z - L.z, d = Math.hypot(dx, dz);
    const max = L.r - 1.5;
    if (d > max) { o.x = L.x + dx / d * max; o.z = L.z + dz / d * max; }
  },

  // 突進（予兆の直線 → 遅れて高速移動）
  bossCharge(A, b, tx, tz, delay, dmg, col) {
    const ang = Math.atan2(tx - b.x, tz - b.z);
    const len = Math.min(26, Math.hypot(tx - b.x, tz - b.z) + 6);
    const sx = b.x, sz = b.z;
    this.tele(A, b, [{ k: 'line', x: r2(sx), z: r2(sz), a: r2(ang), len: r2(len), w: 4.2 }], delay, dmg, col, 1);
    this.later(A, delay, () => {
      if (A.boss !== b) return;
      const end = { x: sx + Math.sin(ang) * (len - 1), z: sz + Math.cos(ang) * (len - 1) };
      this.clampArena(A, end);
      b.a = ang;
      b.dash = { fx: b.x, fz: b.z, tx: end.x, tz: end.z, t: 0, dur: 0.25 };
    });
  },

  bossPattern(A, b, pat, target, inArena) {
    const L = A.lair;
    const sp = [1, 0.9, 0.78, 0.68][b.phase || 1];
    const base = this.bossBaseDamage(A, b);
    const col = b.phase === 3 ? '#ff1a8a' : b.enraged ? '#ff2a6a' : '#ff3a3a';
    // 遠距離攻撃と突進は、ときどき離れている別の人を狙う
    const brain = BOSS_BRAINS[A.fdef.boss.brain];
    if (!brain && ['shot', 'charge', 'chase'].includes(pat) && inArena.length > 1 && Math.random() < (pat === 'shot' ? 0.6 : 0.4)) {
      const far = inArena.filter((p) => p.id !== target.id).sort((p, q) => dist(q, b) - dist(p, b))[0];
      if (far) target = far;
    }
    const ang = Math.atan2(target.x - b.x, target.z - b.z);
    b.a = ang;
    const tid = target.id;
    this.broadcastArea(A.id, { t: 'bossAct', id: b.id, p: pat, tid });
    // 技ごとの中身: ボス固有の技（brain.moves）→ 共通の登録表（sim/boss-patterns.js）の順に探す
    if (brain?.moves && Object.hasOwn(brain.moves, pat)) { const t = brain.moves[pat](this, A, b, target, { L, sp, base, col, ang, tid, inArena }); if (t !== undefined) return t; }
    if (Object.hasOwn(BOSS_PATTERNS, pat)) { const t = BOSS_PATTERNS[pat](this, A, b, target, { L, sp, base, col, ang, tid, inArena }); if (t !== undefined) return t; }
    return 1;
  },
};
