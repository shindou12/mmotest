// ワールドシミュレーション（サーバー権威）。Node でもブラウザ（ソロモード）でも動く。
import {
  FLOORS, GATE_POS, LAIR_POS, LAIR_RADIUS, FIELD_RADIUS, RARITIES, MAX_FLOOR,
  floorLevel, bossLevel, mobHp, mobDmg, mobXp, makeItem, rollRarity,
} from './data.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;

const ARCH = {
  slime: { speed: 3.0, hp: 0.9, dmg: 1.0, wind: 0.85, range: 2.2, aggro: 11 },
  beast: { speed: 5.2, hp: 1.0, dmg: 1.0, wind: 0.65, range: 3.0, aggro: 14 },
  golem: { speed: 2.4, hp: 1.7, dmg: 1.4, wind: 1.1, range: 2.8, aggro: 11 },
  wisp: { speed: 3.6, hp: 0.8, dmg: 0.9, wind: 1.1, range: 9, aggro: 15, ranged: true },
  knight: { speed: 4.0, hp: 1.3, dmg: 1.15, wind: 0.75, range: 4.0, aggro: 13 },
};

export class World {
  constructor(opts = {}) {
    this.players = new Map();
    this.floors = new Map();
    this.unlocked = Math.min(MAX_FLOOR, opts.unlocked || 1);
    this.onSave = opts.onSave || (() => {});
    this.seq = 1;
    this.time = 0;
    this.snapT = 0;
    this.rosterT = 0;
  }

  floor(n) {
    if (!this.floors.has(n)) {
      this.floors.set(n, {
        n, def: FLOORS[n - 1], mobs: new Map(), boss: null, bossState: 'idle', bossCd: 0,
        spawnT: 0, timers: [], noTargetT: 0,
      });
    }
    return this.floors.get(n);
  }

  // ---- 送信ヘルパ ----
  send(p, msg) { try { p.send(msg); } catch (e) { /* ignore */ } }
  broadcast(msg) { for (const p of this.players.values()) if (p.joined) this.send(p, msg); }
  floorPlayers(n) { return [...this.players.values()].filter((p) => p.joined && p.floor === n); }
  broadcastFloor(n, msg) { for (const p of this.floorPlayers(n)) this.send(p, msg); }
  sys(text, color) { this.broadcast({ t: 'chat', from: '', text, color: color || '#ffe28a' }); }

  addPlayer(id, send) {
    this.players.set(id, {
      id, send, joined: false, name: '???', floor: 1, x: GATE_POS.x, z: GATE_POS.z, a: Math.PI,
      hp: 100, mhp: 100, lv: 1, dead: false, color: '#4af', wk: 'sword', wr: 0, sw: 0, sk: 0, dg: 0,
    });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.joined) {
      this.sys(`${p.name} がログアウトしました`, '#aab');
      this.broadcast({ t: 'leave', id });
    }
  }

  handle(id, m) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': {
        p.name = String(m.name || '名無し').slice(0, 16);
        p.color = String(m.color || '#4af').slice(0, 9);
        p.lv = m.lv | 0 || 1;
        p.joined = true;
        this.send(p, { t: 'welcome', id, unlocked: this.unlocked, floor: 1 });
        this.sys(`${p.name} が浮遊城エテルナに降り立った`);
        break;
      }
      case 'st': {
        for (const k of ['x', 'z', 'a', 'hp', 'mhp', 'lv', 'sw', 'sk', 'wr', 'dg']) {
          if (typeof m[k] === 'number' && isFinite(m[k])) p[k] = m[k];
        }
        if (typeof m.wk === 'string') p.wk = m.wk;
        p.dead = !!m.dead;
        break;
      }
      case 'hit': {
        const f = this.floor(p.floor);
        const mob = f.mobs.get(m.id);
        if (!mob || mob.hp <= 0) return;
        const dmg = Math.max(0, Math.min(Number(m.dmg) || 0, 1e9));
        mob.hp -= dmg;
        if (mob.kind !== 'boss') { mob.target = p.id; mob.provoked = 6; }
        if (mob.hp <= 0) this.killMob(f, mob);
        break;
      }
      case 'warp': {
        const n = m.floor | 0;
        if (n < 1 || n > this.unlocked || n > MAX_FLOOR) return;
        p.floor = n; p.x = GATE_POS.x; p.z = GATE_POS.z;
        this.send(p, { t: 'warped', floor: n });
        break;
      }
      case 'chat': {
        const text = String(m.text || '').slice(0, 120);
        if (text) this.broadcast({ t: 'chat', from: p.name, text, color: p.color });
        break;
      }
    }
  }

  // ---- テレグラフ（予兆） ----
  tele(f, src, shapes, delay, dmg, color) {
    this.broadcastFloor(f.n, { t: 'tele', id: this.seq++, src: src.id, sh: shapes, d: Math.round(delay * 1000), dmg: Math.round(dmg), c: color });
  }
  later(f, sec, fn) { f.timers.push({ at: this.time + sec, fn }); }

  // ---- モンスター ----
  spawnMob(f, defIdx, x, z, lvOverride, kind = 'mob') {
    const def = f.def.mobs[defIdx];
    const arch = ARCH[def.t];
    const lv = lvOverride || floorLevel(f.n) + Math.floor(Math.random() * 5);
    const hp = Math.round(mobHp(lv) * arch.hp * (kind === 'add' ? 0.5 : 1));
    const mob = {
      id: this.seq++, kind, d: defIdx, t: def.t, arch, lv, hp, mhp: hp, x, z, hx: x, hz: z,
      a: Math.random() * Math.PI * 2, st: 0, target: null, cd: rnd(0.5, 1.5), windT: 0, wanderT: 0, wx: x, wz: z, provoked: 0,
    };
    f.mobs.set(mob.id, mob);
    return mob;
  }

  spawnBoss(f) {
    const bd = f.def.boss;
    const n = Math.max(1, this.floorPlayers(f.n).length);
    const lv = bossLevel(f.n);
    const hp = Math.round(mobHp(lv) * 28 * (1 + 0.65 * (n - 1)));
    const b = {
      id: this.seq++, kind: 'boss', d: 2, t: bd.t, lv, hp, mhp: hp, x: LAIR_POS.x, z: LAIR_POS.z - 8, a: 0,
      st: 0, actT: 2.5, busyT: 0, enraged: false, last: null, dash: null, arch: { speed: 3.4 },
    };
    f.mobs.set(b.id, b);
    f.boss = b;
    return b;
  }

  killMob(f, mob) {
    f.mobs.delete(mob.id);
    const isBoss = mob.kind === 'boss';
    this.broadcastFloor(f.n, { t: 'die', id: mob.id, x: r2(mob.x), z: r2(mob.z), boss: isBoss });
    let xp = mobXp(mob.lv);
    if (isBoss) xp *= 12;
    if (mob.kind === 'add') xp *= 0.3;
    for (const p of this.floorPlayers(f.n)) {
      if (!isBoss && dist(p, mob) > 45) continue;
      const gap = p.lv - mob.lv;
      const mult = gap > 6 ? 0.35 : gap < -3 ? 1.3 : 1;
      this.send(p, { t: 'xp', n: Math.max(1, Math.round(xp * mult)) });
      // 個人ドロップ（友達と取り合いにならない）
      const items = [];
      const ilvl = mob.lv;
      if (isBoss) {
        items.push(makeItem(ilvl + 1, rollRarity(1, 2)));
        items.push(makeItem(ilvl + 1, rollRarity(1, 1)));
        if (Math.random() < 0.5) items.push(makeItem(ilvl, rollRarity(1, 0)));
      } else if (Math.random() < (mob.kind === 'add' ? 0.08 : 0.34)) {
        items.push(makeItem(ilvl, rollRarity(0)));
      }
      if (items.length) {
        this.send(p, {
          t: 'loot',
          items: items.map((it) => ({ it, x: r2(mob.x + rnd(-1.6, 1.6)), z: r2(mob.z + rnd(-1.6, 1.6)) })),
        });
        for (const it of items) {
          if (it.rarity >= 4) this.sys(`★ ${p.name} が${RARITIES[it.rarity].name}「${it.name}」を手に入れた！`, RARITIES[it.rarity].color);
        }
      }
    }
    if (isBoss) {
      f.boss = null;
      f.bossState = 'cleared';
      f.bossCd = 40;
      f.timers = [];
      for (const m of [...f.mobs.values()]) if (m.kind === 'add') f.mobs.delete(m.id);
      this.broadcastFloor(f.n, { t: 'bossClear', n: f.n, name: f.def.boss.name });
      if (f.n === this.unlocked && f.n < MAX_FLOOR) {
        this.unlocked++;
        this.onSave({ unlocked: this.unlocked });
        this.broadcast({ t: 'unlock', unlocked: this.unlocked });
        this.sys(`第${f.n}層 攻略！ 第${f.n + 1}層「${FLOORS[f.n].name}」への転移門が開放された`, '#7fffd4');
      } else if (f.n === MAX_FLOOR) {
        this.sys(`★★★ 現在の最上層・第${MAX_FLOOR}層を攻略！ おめでとう！ ★★★`, '#ffd700');
      }
    }
  }

  // ---- tick ----
  tick(dt) {
    this.time += dt;
    const active = new Set();
    for (const p of this.players.values()) if (p.joined) active.add(p.floor);
    for (const n of active) this.tickFloor(this.floor(n), dt);
    // ボス戦中に全員が離脱した階層はリセット
    for (const f of this.floors.values()) {
      if (!active.has(f.n) && f.boss) this.resetBoss(f);
    }
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.1;
      for (const n of active) this.snapshot(this.floor(n));
    }
    this.rosterT -= dt;
    if (this.rosterT <= 0) {
      this.rosterT = 1;
      const roster = [...this.players.values()].filter((p) => p.joined).map((p) => [p.id, p.name, p.lv, p.floor, Math.round(p.hp), Math.round(p.mhp), p.color]);
      this.broadcast({ t: 'roster', r: roster, unlocked: this.unlocked });
    }
  }

  resetBoss(f) {
    if (f.boss) f.mobs.delete(f.boss.id);
    for (const m of [...f.mobs.values()]) if (m.kind === 'add') f.mobs.delete(m.id);
    f.boss = null; f.bossState = 'idle'; f.bossCd = 5; f.timers = [];
    this.broadcastFloor(f.n, { t: 'bossReset' });
  }

  tickFloor(f, dt) {
    const players = this.floorPlayers(f.n);
    const alive = players.filter((p) => !p.dead);

    // タイマー
    if (f.timers.length) {
      const due = f.timers.filter((t) => t.at <= this.time);
      f.timers = f.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }

    // 湧き
    const fieldMobs = [...f.mobs.values()].filter((m) => m.kind === 'mob').length;
    const want = Math.min(26, 9 + players.length * 4);
    f.spawnT -= dt;
    if (fieldMobs < want && f.spawnT <= 0) {
      f.spawnT = fieldMobs < want / 2 ? 0.1 : 1.2;
      for (let tries = 0; tries < 12; tries++) {
        const ang = Math.random() * Math.PI * 2, rr = rnd(10, FIELD_RADIUS - 6);
        const x = Math.sin(ang) * rr, z = Math.cos(ang) * rr;
        const pos = { x, z };
        if (dist(pos, GATE_POS) < 16 || dist(pos, LAIR_POS) < LAIR_RADIUS + 7) continue;
        if (players.some((p) => dist(p, pos) < 14)) continue;
        this.spawnMob(f, Math.random() < 0.55 ? 0 : 1, x, z);
        break;
      }
    }

    // ボス部屋
    if (f.bossState === 'cleared') {
      f.bossCd -= dt;
      if (f.bossCd <= 0) f.bossState = 'idle';
    }
    if (f.bossState === 'idle' && alive.some((p) => dist(p, LAIR_POS) < LAIR_RADIUS - 3)) {
      f.bossState = 'fight';
      const b = this.spawnBoss(f);
      this.broadcastFloor(f.n, { t: 'bossStart', n: f.n, name: f.def.boss.name, id: b.id });
    }

    for (const m of f.mobs.values()) {
      if (m.kind === 'boss') this.tickBoss(f, m, alive, dt);
      else this.tickMob(f, m, alive, dt);
    }

    // 押し合い
    const ms = [...f.mobs.values()];
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        const minD = (a.kind === 'boss' || b.kind === 'boss') ? 3.5 : 1.4;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) * 0.5;
          if (a.kind !== 'boss') { a.x -= dx / d * push; a.z -= dz / d * push; }
          if (b.kind !== 'boss') { b.x += dx / d * push; b.z += dz / d * push; }
        }
      }
    }
  }

  tickMob(f, m, alive, dt) {
    const A = m.arch;
    m.cd -= dt; m.provoked -= dt;
    if (m.st === 2) { // 予兆中
      m.windT -= dt;
      if (m.windT <= 0) { m.st = 3; m.windT = 0.35; }
      return;
    }
    if (m.st === 3) { m.windT -= dt; if (m.windT <= 0) m.st = 0; return; }

    let target = m.target ? alive.find((p) => p.id === m.target) : null;
    if (target && dist(target, m) > 26 && m.provoked <= 0) target = null;
    if (!target) {
      let best = A.aggro;
      for (const p of alive) { const d = dist(p, m); if (d < best && dist(p, GATE_POS) > 8) { best = d; target = p; } }
    }
    m.target = target ? target.id : null;

    const home = { x: m.hx, z: m.hz };
    if (target && dist(m, home) > 30) { m.target = null; target = null; m.hp = m.mhp; }

    if (target) {
      const d = dist(target, m);
      const ang = Math.atan2(target.x - m.x, target.z - m.z);
      m.a = ang;
      const want = A.ranged ? 7 : 1.6;
      if (d > want + 0.3) this.moveMob(m, ang, A.speed, dt);
      else if (A.ranged && d < want - 2) this.moveMob(m, ang + Math.PI, A.speed * 0.7, dt);
      else m.st = 0;
      if (m.cd <= 0 && d <= A.range) this.mobAttack(f, m, target, ang);
    } else {
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderT = rnd(2, 5); m.wx = m.hx + rnd(-6, 6); m.wz = m.hz + rnd(-6, 6); }
      const d = Math.hypot(m.wx - m.x, m.wz - m.z);
      if (d > 0.5) { m.a = Math.atan2(m.wx - m.x, m.wz - m.z); this.moveMob(m, m.a, A.speed * 0.4, dt); }
      else m.st = 0;
      if (m.hp < m.mhp) m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.05 * dt);
    }
  }

  moveMob(m, ang, speed, dt) {
    m.x += Math.sin(ang) * speed * dt;
    m.z += Math.cos(ang) * speed * dt;
    const r = Math.hypot(m.x, m.z);
    if (r > FIELD_RADIUS) { m.x *= FIELD_RADIUS / r; m.z *= FIELD_RADIUS / r; }
    // モンスターは転移門の安全地帯に入らない
    const dg = dist(m, GATE_POS);
    if (dg < 7) { m.x = GATE_POS.x + (m.x - GATE_POS.x) / dg * 7; m.z = GATE_POS.z + (m.z - GATE_POS.z) / dg * 7; }
    m.st = 1;
  }

  mobAttack(f, m, target, ang) {
    const A = m.arch;
    const dmg = mobDmg(m.lv) * A.dmg;
    m.st = 2; m.windT = A.wind; m.cd = rnd(1.4, 2.4) + A.wind;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    let sh;
    switch (m.t) {
      case 'slime': sh = [{ k: 'circle', x: r2(m.x + fx * 1.2), z: r2(m.z + fz * 1.2), r: 2.0 }]; break;
      case 'beast': sh = [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(ang), arc: 1.3, len: 3.6 }]; break;
      case 'golem': sh = [{ k: 'circle', x: r2(m.x), z: r2(m.z), r: 3.3 }]; break;
      case 'wisp': sh = [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 2.0 }]; break;
      default: sh = [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: 4.6, w: 1.8 }];
    }
    this.tele(f, m, sh, A.wind, dmg);
  }

  // ---- ボス ----
  tickBoss(f, b, alive, dt) {
    const inArena = alive.filter((p) => dist(p, LAIR_POS) < LAIR_RADIUS + 6);
    if (!inArena.length) {
      f.noTargetT += dt;
      if (f.noTargetT > 8) { this.resetBoss(f); return; }
    } else f.noTargetT = 0;

    // フェーズ: 1 → 激昂(50%) → 最終形態(25%)。移行時は大技で割り込む
    if (!b.enraged && b.hp < b.mhp * 0.5) {
      b.enraged = true; b.phase = 2;
      b.arch.speed = 4.6;
      this.broadcastFloor(f.n, { t: 'enrage', id: b.id, p: 2 });
      b.dash = null; b.busyT = 0; b.actT = 0.4; b.forced = 'shock';
    }
    if (b.phase === 2 && b.hp < b.mhp * 0.25) {
      b.phase = 3;
      b.arch.speed = 5.2;
      this.broadcastFloor(f.n, { t: 'enrage', id: b.id, p: 3 });
      b.dash = null; b.busyT = 0; b.actT = 0.6; b.forced = 'ultimate';
    }

    if (b.dash) {
      b.dash.t += dt;
      const k = Math.min(1, b.dash.t / b.dash.dur);
      b.x = b.dash.fx + (b.dash.tx - b.dash.fx) * k;
      b.z = b.dash.fz + (b.dash.tz - b.dash.fz) * k;
      if (k >= 1) b.dash = null;
      b.st = 3;
      return;
    }
    b.busyT -= dt; b.actT -= dt;
    if (b.busyT > 0) { b.st = 2; return; }

    let target = alive.find((p) => p.id === b.target);
    if (!target || dist(target, LAIR_POS) > LAIR_RADIUS + 6) {
      target = inArena.length ? pick(inArena) : null;
      b.target = target ? target.id : null;
    }
    if (!target) { b.st = 0; return; }
    const ang = Math.atan2(target.x - b.x, target.z - b.z);
    b.a = ang;
    const d = dist(target, b);
    if (d > 4.5) {
      b.x += Math.sin(ang) * b.arch.speed * dt;
      b.z += Math.cos(ang) * b.arch.speed * dt;
      this.clampArena(b);
      b.st = 1;
    } else b.st = 0;

    if (b.actT <= 0) {
      const bd = f.def.boss;
      const pats = b.phase === 3 ? [...bd.patterns, ...(bd.p3 || [])] : bd.patterns;
      let pat = b.forced || pick(pats);
      b.forced = null;
      if (pat === b.last && pats.length > 1) pat = pick(pats.filter((p) => p !== b.last));
      b.last = pat;
      const busy = this.bossPattern(f, b, pat, target, inArena);
      b.busyT = busy;
      // 攻撃の間隔は短め。フェーズが進むほど詰めてきて、連続攻撃も増える
      const gap = [0, rnd(0.6, 1.1), rnd(0.35, 0.7), rnd(0.15, 0.45)][b.phase || 1];
      b.actT = busy + gap;
      const chain = [0, 0.15, 0.4, 0.6][b.phase || 1];
      if (Math.random() < chain) b.actT = busy + 0.05;
      b.target = target.id;
      if (Math.random() < 0.5) b.target = null;
    }
  }

  clampArena(o) {
    const dx = o.x - LAIR_POS.x, dz = o.z - LAIR_POS.z, d = Math.hypot(dx, dz);
    const max = LAIR_RADIUS - 1.5;
    if (d > max) { o.x = LAIR_POS.x + dx / d * max; o.z = LAIR_POS.z + dz / d * max; }
  }

  // 突進（予兆の直線 → 遅れて高速移動）
  bossCharge(f, b, tx, tz, delay, dmg, col) {
    const ang = Math.atan2(tx - b.x, tz - b.z);
    const len = Math.min(30, Math.hypot(tx - b.x, tz - b.z) + 6);
    const sx = b.x, sz = b.z;
    this.tele(f, b, [{ k: 'line', x: r2(sx), z: r2(sz), a: r2(ang), len: r2(len), w: 4.2 }], delay, dmg, col);
    this.later(f, delay, () => {
      if (f.boss !== b) return;
      const end = { x: sx + Math.sin(ang) * (len - 1), z: sz + Math.cos(ang) * (len - 1) };
      this.clampArena(end);
      b.a = ang;
      b.dash = { fx: b.x, fz: b.z, tx: end.x, tz: end.z, t: 0, dur: 0.25 };
    });
  }

  // 生存中の対象プレイヤー（後から位置を読み直す用）
  livePlayer(f, id) {
    return this.floorPlayers(f.n).find((p) => p.id === id && !p.dead);
  }

  bossPattern(f, b, pat, target, inArena) {
    const sp = [1, 0.9, 0.78, 0.68][b.phase || 1];
    const base = mobDmg(b.lv) * 3.3;
    const col = b.phase === 3 ? '#ff1a8a' : b.enraged ? '#ff2a6a' : '#ff3a3a';
    const ang = Math.atan2(target.x - b.x, target.z - b.z);
    const tid = target.id;
    this.broadcastFloor(f.n, { t: 'bossAct', id: b.id, p: pat });
    switch (pat) {
      case 'combo': {
        // 狙った相手を追いかける3〜5連叩きつけ
        const n = 3 + (b.phase || 1) - 1;
        for (let i = 0; i < n; i++) {
          this.later(f, i * 0.42 * sp, () => {
            const p = this.livePlayer(f, tid) || target;
            this.tele(f, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 3.2 }], 0.75 * sp, base * 0.85, col);
          });
        }
        return (0.42 * n + 0.5) * sp;
      }
      case 'sweep': {
        // 扇が回転しながら連続で薙ぎ払う。回り込むと危険
        const dir = Math.random() < 0.5 ? 1 : -1;
        const n = b.phase === 3 ? 6 : 4;
        for (let i = 0; i < n; i++) {
          this.later(f, i * 0.28 * sp, () => this.tele(f, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + dir * i * 1.05), arc: 1.2, len: 12 }], 0.7 * sp, base, col));
        }
        return (0.28 * n + 0.6) * sp;
      }
      case 'shock': {
        // 外へ広がる衝撃波。輪と輪の隙間で回避する
        const waves = b.phase >= 2 ? 5 : 4;
        const cx = b.x, cz = b.z;
        for (let i = 0; i < waves; i++) {
          this.later(f, i * 0.45 * sp, () => this.tele(f, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.2, r1: i * 4.2 + 3 }], 0.8 * sp, base * 0.9, col));
        }
        return (0.45 * waves + 0.5) * sp;
      }
      case 'chase': {
        // 狙いを付け直しながら連続突進
        const n = b.phase === 3 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          this.later(f, i * 0.85 * sp, () => {
            if (f.boss !== b) return;
            const p = this.livePlayer(f, tid) || target;
            this.bossCharge(f, b, p.x, p.z, 0.6 * sp, base * 1.1, col);
          });
        }
        return (0.85 * n + 0.4) * sp;
      }
      case 'cage': {
        // 外周と足元が同時に爆発。安全地帯はドーナツ状の狭い帯だけ
        const cx = b.x, cz = b.z;
        this.tele(f, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 8, r1: 26 }, { k: 'circle', x: r2(cx), z: r2(cz), r: 4 }], 1.25 * sp, base * 1.3, col);
        this.later(f, 1.0 * sp, () => this.tele(f, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 3.5, r1: 7 }], 0.9 * sp, base, col));
        return 2.2 * sp;
      }
      case 'ultimate': {
        // 最終形態の大技: 衝撃波 → 十字 → 全員の足元へ雨
        const cx = b.x, cz = b.z;
        for (let i = 0; i < 5; i++) this.later(f, i * 0.35, () => this.tele(f, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.5, r1: i * 4.5 + 3.2 }], 0.75, base, '#ff1a8a'));
        const mk = (a) => [0, Math.PI / 2].map((o) => ({ k: 'line', x: r2(cx - Math.sin(a + o) * 24), z: r2(cz - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.6 }));
        this.later(f, 2.0, () => this.tele(f, b, mk(Math.PI / 4), 0.9, base * 1.2, '#ff1a8a'));
        this.later(f, 2.6, () => this.tele(f, b, mk(0), 0.9, base * 1.2, '#ff1a8a'));
        this.later(f, 3.2, () => {
          for (const p of this.floorPlayers(f.n)) if (!p.dead) for (let k = 0; k < 3; k++) this.later(f, k * 0.3, () => this.tele(f, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 2.8 }], 0.7, base * 0.8, '#ff1a8a'));
        });
        return 4.6;
      }
      case 'slam': {
        this.tele(f, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.1 * sp, base, col);
        if (b.enraged) this.later(f, 0.5, () => this.tele(f, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.0 * sp, base, col));
        return 1.3 * sp;
      }
      case 'cone': {
        this.tele(f, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang), arc: 1.9, len: 11 }], 0.95 * sp, base * 1.1, col);
        if (b.enraged) this.later(f, 0.9 * sp, () => this.tele(f, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + Math.PI), arc: 1.9, len: 11 }], 0.8, base * 1.1, col));
        return 1.1 * sp;
      }
      case 'charge': {
        const len = Math.min(30, dist(target, b) + 6);
        const sx = b.x, sz = b.z;
        this.tele(f, b, [{ k: 'line', x: r2(sx), z: r2(sz), a: r2(ang), len: r2(len), w: 4.2 }], 1.0 * sp, base * 1.25, col);
        this.later(f, 1.0 * sp, () => {
          const end = { x: sx + Math.sin(ang) * (len - 1), z: sz + Math.cos(ang) * (len - 1) };
          this.clampArena(end);
          b.dash = { fx: b.x, fz: b.z, tx: end.x, tz: end.z, t: 0, dur: 0.28 };
        });
        return 1.4 * sp;
      }
      case 'nova': {
        this.tele(f, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 8.5 }], 1.5 * sp, base * 1.5, col);
        return 1.6 * sp;
      }
      case 'ring': {
        this.tele(f, b, [{ k: 'ring', x: r2(b.x), z: r2(b.z), r0: 5.5, r1: 24 }], 1.6 * sp, base * 1.2, col);
        return 1.7 * sp;
      }
      case 'rain': {
        const pts = [];
        for (const p of inArena) {
          pts.push({ x: p.x, z: p.z });
          pts.push({ x: p.x + rnd(-4, 4), z: p.z + rnd(-4, 4) });
        }
        const extra = b.enraged ? 8 : 5;
        for (let i = 0; i < extra; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.random() * LAIR_RADIUS;
          pts.push({ x: LAIR_POS.x + Math.sin(a) * rr, z: LAIR_POS.z + Math.cos(a) * rr });
        }
        pts.forEach((pt, i) => this.later(f, i * 0.09, () => this.tele(f, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.6 }], 1.2 * sp, base * 0.8, col)));
        return 1.3 * sp;
      }
      case 'cross': {
        const a0 = Math.random() * Math.PI;
        const mk = (a) => [0, Math.PI / 2].map((o) => ({
          k: 'line', x: r2(b.x - Math.sin(a + o) * 24), z: r2(b.z - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.4,
        }));
        this.tele(f, b, mk(a0), 1.2 * sp, base * 1.1, col);
        this.later(f, 0.75 * sp, () => this.tele(f, b, mk(a0 + Math.PI / 4), 1.2 * sp, base * 1.1, col));
        return 2.0 * sp;
      }
      case 'spiral': {
        const arms = b.enraged ? 4 : 3;
        const a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < 7; i++) {
          for (let k = 0; k < arms; k++) {
            const a = a0 + k * Math.PI * 2 / arms + i * 0.42;
            const rr = 3 + i * 2.4;
            const pt = { x: b.x + Math.sin(a) * rr, z: b.z + Math.cos(a) * rr };
            this.later(f, i * 0.13, () => this.tele(f, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.4 }], 0.9 * sp, base * 0.9, col));
          }
        }
        return 1.9 * sp;
      }
      case 'summon': {
        const cnt = b.enraged ? 4 : 3;
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * Math.PI * 2;
          const pos = { x: b.x + Math.sin(a) * 5, z: b.z + Math.cos(a) * 5 };
          this.clampArena(pos);
          const add = this.spawnMob(f, 0, pos.x, pos.z, Math.max(1, b.lv - 4), 'add');
          add.hx = LAIR_POS.x; add.hz = LAIR_POS.z;
        }
        return 0.9;
      }
      case 'meteor': {
        const pt = { x: target.x + rnd(-2, 2), z: target.z + rnd(-2, 2) };
        this.tele(f, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 10 }], 2.2 * sp, base * 2.0, '#ff6a20');
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2, rr = rnd(12, LAIR_RADIUS);
          this.later(f, 0.4 + i * 0.2, () => this.tele(f, b, [{ k: 'circle', x: r2(LAIR_POS.x + Math.sin(a) * rr), z: r2(LAIR_POS.z + Math.cos(a) * rr), r: 3 }], 1.1, base * 0.8, col));
        }
        return 1.6 * sp;
      }
    }
    return 1;
  }

  snapshot(f) {
    const ps = this.floorPlayers(f.n).map((p) => [p.id, p.name, r2(p.x), r2(p.z), r2(p.a), Math.round(p.hp), Math.round(p.mhp), p.lv, p.color, p.wk, p.wr, p.sw, p.sk, p.dead ? 1 : 0, p.dg]);
    const ms = [...f.mobs.values()].map((m) => [m.id, m.d, r2(m.x), r2(m.z), r2(m.a), Math.max(0, Math.round(m.hp)), m.mhp, m.lv, m.st, m.kind === 'boss' ? 2 : m.kind === 'add' ? 1 : 0, m.enraged ? 1 : 0]);
    this.broadcastFloor(f.n, { t: 'snap', n: f.n, p: ps, m: ms, bs: f.bossState });
  }
}
