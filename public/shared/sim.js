// ワールドシミュレーション（サーバー権威）。Node でもブラウザ（ソロモード）でも動く。
// 世界は「エリア」単位で動く（町・フィールド・狩場・ダンジョン・迷宮区）。
import { REVIVE } from './balance.js';
import { FLOORS, MAX_FLOOR, DEFAULT_WEAPON } from './data.js';
import { AREAS, FLOOR_HUB, PLATE_WINDOW, grid, lairOf } from './areas.js';

import { rnd, r2, BOX_MAX } from './sim/common.js';
import { MESSAGES } from './sim/messages.js';
// 分ける前の sim.js が直接読んでいたモジュールは、ここでも直接読む。
// ブラウザのソロモードは sim.js を import() で読み込むので、モジュールが見つかる段（深さ）が変わると、
// 読み込みが終わるまでの時間（フレーム数）がわずかに変わってしまう（固定の時計の記録テストで見える差）
import './motion-catalog.js';
import './techniques.js';
// 武器のファイル（js/weapons/）は data.js の WEAPONS の中身なので、同じ理由でここから直接読む
import '../js/weapons/index.js';
import '../js/weapons/common.js';
import '../js/game/util.js';
import './tree-motions.js';
import { InteractMethods } from './sim/interact.js';
import { MobsMethods } from './sim/mobs.js';
import { AreaTickMethods } from './sim/area-tick.js';
import './sim/boss-brains.js';
import './sim/bosses/graz.js';
import './sim/bosses/yugdra.js';
import { BossMethods } from './sim/boss.js';

export class World {
  constructor(opts = {}) {
    this.players = new Map();
    this.areas = new Map();
    this.unlocked = Math.min(MAX_FLOOR, opts.unlocked || 1);
    this.onSave = opts.onSave || (() => {});
    // 町・野営地の共有ボックス（全員で1つ。どの町の箱からでも同じ中身）
    this.box = Array.isArray(opts.box) ? opts.box.slice(0, BOX_MAX) : [];
    this.seq = 1;
    this.time = 0;
    this.snapT = 0;
    this.rosterT = 0;
  }

  area(id) {
    if (!this.areas.has(id)) {
      const def = AREAS[id];
      const A = {
        id, def, n: def.floor, fdef: FLOORS[def.floor - 1], mobs: new Map(),
        boss: null, bossState: 'idle', bossCd: 0, spawnT: 0, timers: [], noTargetT: 0, emptyT: 0,
        lair: lairOf(def), door: false, plates: [], trapT: 2, trapGroup: 0, points: [], chests: new Map(), projs: [],
      };
      if (def.shape === 'grid') {
        const g = grid(def);
        for (const ch of ['M', 'G', 'K', 'w']) for (const p of g.pts[ch] || []) A.points.push({ ...p, ch, mobId: null, t: rnd(0, 2) });
        A.plates = (g.pts.P || []).map(() => -999);
      }
      this.areas.set(id, A);
    }
    return this.areas.get(id);
  }

  save() { this.onSave({ unlocked: this.unlocked, box: this.box }); }

  // ---- 送信ヘルパ ----
  send(p, msg) { try { p.send(msg); } catch (e) { /* ignore */ } }
  broadcast(msg) { for (const p of this.players.values()) if (p.joined) this.send(p, msg); }
  areaPlayers(id) { return [...this.players.values()].filter((p) => p.joined && p.area === id); }
  broadcastArea(id, msg) { for (const p of this.areaPlayers(id)) this.send(p, msg); }
  sys(text, color) { this.broadcast({ t: 'chat', from: '', text, color: color || '#ffe28a' }); }
  sysArea(id, text, color) { this.broadcastArea(id, { t: 'chat', from: '', text, color: color || '#ffe28a' }); }

  addPlayer(id, send) {
    this.players.set(id, {
      id, send, joined: false, name: '???', area: FLOOR_HUB[1], x: 0, z: 0, a: Math.PI,
      hp: 100, mhp: 100, lv: 1, dead: false, color: '#4af', wk: DEFAULT_WEAPON, wr: 0, sw: 0, sk: 0, dg: 0, gd: 0, wst: 0, arm: 0, rc: 0, cl: 0,
    });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    for (const A of this.areas.values()) for (const m of A.mobs.values()) m.threat?.delete(id);
    if (p.joined) {
      this.sys(`${p.name} がログアウトしました`, '#aab');
      this.broadcast({ t: 'leave', id });
    }
  }

  movePlayer(p, areaId, pos) {
    p.area = areaId; p.x = pos.x; p.z = pos.z; p.boxOpen = false;
    for (const A of this.areas.values()) for (const m of A.mobs.values()) m.threat?.delete(p.id);
    this.area(areaId);
    this.send(p, { t: 'warped', area: areaId, x: r2(pos.x), z: r2(pos.z) });
  }

  addThreat(m, pid, n) {
    if (!m.threat) m.threat = new Map();
    m.threat.set(pid, (m.threat.get(pid) || 0) + n);
  }

  handle(id, m) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== 'object') return;
    const A = this.area(p.area);
    // 種類ごとの処理は sim/messages.js の登録表
    if (Object.hasOwn(MESSAGES, m.t)) MESSAGES[m.t](this, p, m, A, id);
  }

  later(A, sec, fn) { A.timers.push({ at: this.time + sec, fn }); }

  // ---- tick ----
  tick(dt) {
    this.time += dt;
    const active = new Set();
    for (const p of this.players.values()) if (p.joined) active.add(p.area);
    for (const id of active) this.tickArea(this.area(id), dt);
    for (const A of this.areas.values()) {
      if (active.has(A.id)) { A.emptyT = 0; continue; }
      if (A.boss) this.resetBoss(A);
      A.emptyT += dt;
      // 誰もいなくなってしばらくしたら、ギミックを元に戻す
      if (A.emptyT > 60 && (A.door || A.plates.some((t) => t > -999))) {
        A.door = false; A.plates = A.plates.map(() => -999);
        for (const pt of A.points) if (pt.ch === 'G') pt.mobId = null;
      }
    }
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.1;
      for (const id of active) this.snapshot(this.area(id));
    }
    this.rosterT -= dt;
    if (this.rosterT <= 0) {
      this.rosterT = 1;
      const roster = [...this.players.values()].filter((p) => p.joined).map((p) => [p.id, p.name, p.lv, AREAS[p.area].floor, Math.round(p.hp), Math.round(p.mhp), p.color, AREAS[p.area].name]);
      this.broadcast({ t: 'roster', r: roster, unlocked: this.unlocked });
    }
  }

  livePlayer(A, id) {
    return this.areaPlayers(A.id).find((p) => p.id === id && !p.dead && !p.down);
  }

  // 這いずり: 同じエリアの全員が倒れたら（ひとりでも）、這いずっている人は全員力尽きる
  checkWipe(A, players) {
    if (!players.some((p) => p.down) || !players.every((p) => p.dead || p.down)) return;    for (const p of players) if (p.down) { p.down = false; p.rev = 0; this.send(p, { t: 'bleed' }); }
  }

  snapshot(A) {
    const ps = this.areaPlayers(A.id).map((p) => [p.id, p.name, r2(p.x), r2(p.z), r2(p.a), Math.round(p.hp), Math.round(p.mhp), p.lv, p.color, p.wk, p.wr, p.sw, p.sk, p.dead ? 1 : 0, p.dg, p.gd, p.wst | 0, p.arm | 0, p.rc | 0, p.pm || '', p.pt || 0, p.down ? Math.round(p.rev / p.revMax * REVIVE.disp[p.revStep] * 1000) / 1000 : -1, p.cl | 0]);
    const ms = [...A.mobs.values()].map((m) => [
      m.id, m.d, r2(m.x), r2(m.z), r2(m.a), Math.max(0, Math.round(m.hp)), m.mhp, m.lv, m.st,
      m.kind === 'boss' ? 2 : m.kind === 'add' ? 1 : 0, m.enraged ? 1 : 0, m.named ? 3 : m.elite ? (m.gatekeeper ? 2 : 1) : 0, m.target || 0,
      Math.round(m.hateT * 10) / 10, m.kind === 'boss' ? Math.round(m.stun / m.stunMax * 100) : 0, m.stunT > 0 ? Math.round(m.stunT * 10) / 10 : 0,
      m.guard ? 1 : 0, // 盾を構えている（番兵）
    ]);
    const plates = A.plates.map((t) => this.time - t <= PLATE_WINDOW ? 1 : 0);
    this.broadcastArea(A.id, { t: 'snap', ar: A.id, p: ps, m: ms, bs: A.bossState, door: A.door ? 1 : 0, pl: plates });
  }
}

// 役目ごとのメソッド（sim/*.js）を World に足す
Object.assign(World.prototype, InteractMethods);
Object.assign(World.prototype, MobsMethods);
Object.assign(World.prototype, AreaTickMethods);
Object.assign(World.prototype, BossMethods);
