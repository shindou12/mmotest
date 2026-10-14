import { MOTION_DURATIONS } from './motion-catalog.js';
import { TECHNIQUES } from './techniques.js';
// ワールドシミュレーション（サーバー権威）。Node でもブラウザ（ソロモード）でも動く。
// 世界は「エリア」単位で動く（町・フィールド・狩場・ダンジョン・迷宮区）。
import { BALANCE, REVIVE, reviveStep, partySize, enemyScale, floorPressure, attackPressure, levelXpMultiplier } from './balance.js';
import {
  FLOORS, RARITIES, MAX_FLOOR, floorLevel, bossLevel, mobHp, mobDmg, mobXp, makeItem, rollRarity,
} from './data.js';
import {
  AREAS, FLOOR_HUB, PLATE_WINDOW, grid, collide, pathStep, exitsOf, arrival, spawnPoint, lairOf,
  obstaclesOf, hazardsOf, chestsOf, namedSpot, insideOpen, boundR, dirOf, waypointOf,
} from './areas.js';

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
  bat: { speed: 6.2, hp: 0.6, dmg: 0.8, wind: 0.5, range: 2.6, aggro: 16 },
  mushroom: { speed: 1.6, hp: 1.25, dmg: 0.95, wind: 1.0, range: 3.2, aggro: 10 },
  scorpion: { speed: 4.2, hp: 1.25, dmg: 1.2, wind: 0.8, range: 5.0, aggro: 13 },
  mage: { speed: 2.8, hp: 0.8, dmg: 1.05, wind: 1.3, range: 11, aggro: 15, ranged: true },
};
const ELITE = { hp: BALANCE.eliteHp, dmg: BALANCE.eliteDamage, xp: 2.5 };
const CHEST_COOLDOWN = 300; // ダンジョン最奥の宝箱
const SMALL_CHEST_COOLDOWN = 600; // 屋外の小さな宝箱
const NAMED = { hp: BALANCE.namedHp, dmg: BALANCE.namedDamage, xp: 8, respawn: 360 };
const BOX_MAX = 60; // 共有ボックスの容量
const BOX_RANGE = 4.5;
// ヘイトは一定時間ごとにリセット。狙われている人が攻撃を受けると少し延びる
const HATE_RESET = { boss: 12, mob: 15 };
const HATE_ABSORB = 1.2;
const STUN_TIME = BALANCE.stunSeconds;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

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
        for (const ch of ['M', 'G']) for (const p of g.pts[ch] || []) A.points.push({ ...p, ch, mobId: null, t: rnd(0, 2) });
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
      hp: 100, mhp: 100, lv: 1, dead: false, color: '#4af', wk: 'sword', wr: 0, sw: 0, sk: 0, dg: 0, gd: 0, wst: 0, arm: 0, rc: 0,
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
    switch (m.t) {
      case 'hello': {
        p.name = String(m.name || '名無し').slice(0, 16);
        p.color = String(m.color || '#4af').slice(0, 9);
        p.lv = m.lv | 0 || 1;
        p.joined = true;
        p.area = FLOOR_HUB[1];
        const sp = spawnPoint(AREAS[p.area]);
        p.x = sp.x; p.z = sp.z;
        this.area(p.area);
        this.send(p, { t: 'welcome', id, unlocked: this.unlocked, area: p.area, x: sp.x, z: sp.z });
        this.sys(`${p.name} が浮遊城エテルナに降り立った`);
        break;
      }
      case 'st': {
        p.pm = typeof m.pm === 'string' && Object.hasOwn(MOTION_DURATIONS,m.pm) ? m.pm : '';
        p.pt = typeof m.pt === 'number' && Number.isFinite(m.pt) ? Math.max(0, Math.min(2, m.pt)) : 0;
        // wst: 武器の形 / arm: 防具の見た目 / rc: 被弾リアクション（1 のけぞり・2 ダウン）。他のプレイヤーにも同じに見せる
        for (const k of ['x', 'z', 'a', 'hp', 'mhp', 'lv', 'sw', 'sk', 'wr', 'dg', 'gd', 'wst', 'arm', 'rc']) {
          if (typeof m[k] === 'number' && isFinite(m[k])) p[k] = m[k];
        }
        if (typeof m.wk === 'string') p.wk = m.wk;
        p.dead = !!m.dead;
        break;
      }
      case 'hit': {
        const mob = A.mobs.get(m.id);
        if (!mob || mob.hp <= 0) return;
        const dmg = Math.max(0, Math.min(Number(m.dmg) || 0, 1e9));
        mob.hp -= dmg;
        this.applyTechniqueControl(A, p, mob, m.tech);
        // 盾槍はヘイトを稼ぎやすい
        this.addThreat(mob, p.id, dmg * (p.wk === 'spear' ? 2 : 1));
        if (mob.kind !== 'boss') mob.provoked = 6;
        // スタン値（ボスのみ）
        if (mob.kind === 'boss' && mob.stunT <= 0 && mob.hp > 0) {
          mob.stun += Math.max(0, Math.min(Number(m.st) || 0, 60));
          if (mob.stun >= mob.stunMax) this.stunBoss(A, mob);
        }
        if (mob.hp <= 0) this.killMob(A, mob);
        break;
      }
      case 'down': {
        // HPが0になって這いずり状態へ。n: 最近倒れた回数（キャラごとなのでクライアントが数える）
        if (p.dead || p.down) return;
        p.down = true; p.hp = 0;
        p.revStep = reviveStep(m.n);
        p.revMax = p.rev = REVIVE.base * REVIVE.mult[p.revStep];
        p.revHitAt = -1e9;
        for (const mob of A.mobs.values()) mob.threat?.delete(p.id);
        this.broadcastArea(A.id, { t: 'pdown', id: p.id, name: p.name });
        this.checkWipe(A, this.areaPlayers(A.id));
        break;
      }
      case 'rev': {
        // 倒れている仲間に攻撃を当てた（v: その攻撃のスタン値）
        const q = this.players.get(m.id);
        if (!q || q === p || !q.down || q.area !== p.area || p.dead || p.down || dist(p, q) > REVIVE.range) return;
        q.rev -= Math.max(0, Math.min(Number(m.v) || 0, REVIVE.perHit));
        q.revHitAt = this.time;
        if (q.rev > 0) return;
        q.down = false; q.rev = 0;
        this.send(q, { t: 'revived', by: p.name });
        this.broadcastArea(A.id, { t: 'prev', id: q.id, by: p.id });
        break;
      }
      case 'absorb': {
        // 狙われている本人がその敵の攻撃を受けた/防いだ → ヘイトのリセットまでの時間が少し延びる
        const mob = A.mobs.get(m.id);
        if (mob && mob.target === p.id) mob.hateT = Math.min(mob.hateMax, mob.hateT + HATE_ABSORB);
        break;
      }
      case 'pblock': {
        // ガードで弾を消した
        const i = A.projs.findIndex((pr) => pr.id === m.id);
        if (i < 0) return;
        const pr = A.projs[i];
        A.projs.splice(i, 1);
        this.broadcastArea(A.id, { t: 'pgone', id: pr.id, by: p.id });
        const src = A.mobs.get(pr.src);
        if (src) { this.addThreat(src, p.id, pr.dmg * 3); if (src.target === p.id) src.hateT = Math.min(src.hateMax, src.hateT + HATE_ABSORB); }
        break;
      }
      case 'threat': {
        const mob = A.mobs.get(m.id);
        if (mob) this.addThreat(mob, p.id, Math.max(0, Math.min(Number(m.n) || 0, 1e8)));
        break;
      }
      case 'taunt': {
        const r = Math.min(20, Number(m.r) || 12);
        for (const mob of A.mobs.values()) {
          if (dist(mob, p) > r) continue;
          const top = Math.max(0, ...(mob.threat ? mob.threat.values() : [0]));
          this.addThreat(mob, p.id, top + 500 - (mob.threat?.get(p.id) || 0));
          mob.tauntBy = p.id; mob.tauntT = 6;
        }
        break;
      }
      case 'warp': {
        const n = m.floor | 0;
        if (n < 1 || n > this.unlocked || n > MAX_FLOOR) return;
        this.movePlayer(p, FLOOR_HUB[n], spawnPoint(AREAS[FLOOR_HUB[n]]));
        break;
      }
      case 'wp': {
        // ワープポイントへ飛ぶ（解放済みかどうかはキャラデータを持つクライアントが確かめる）
        const to = String(m.to || ''), def = AREAS[to];
        if (!def || def.floor > this.unlocked || p.dead) return;
        if (A.bossState === 'fight' && A.lair && dist(p, A.lair) < A.lair.r + 2) return; // ボス戦の最中は飛べない
        const w = waypointOf(def);
        this.movePlayer(p, to, { x: w.x, z: w.z + (def.shape === 'grid' ? 0 : 2.5) });
        break;
      }
      case 'move': {
        const to = String(m.to || '');
        if (!A.def.exits.some((e) => e.to === to) || !AREAS[to]) return;
        if (AREAS[to].floor > this.unlocked) return;
        this.movePlayer(p, to, arrival(AREAS[to], A.id));
        break;
      }
      case 'interact': this.interact(A, p, String(m.what || ''), String(m.id || '')); break;
      case 'box': this.boxOp(A, p, m); break;
      case 'chat': {
        const text = String(m.text || '').slice(0, 120);
        if (text) this.broadcast({ t: 'chat', from: p.name, text, color: p.color });
        break;
      }
    }
  }

  interact(A, p, what, id) {
    const g = A.def.shape === 'grid' ? grid(A.def) : null;
    if (what === 'lever' && A.def.gimmick === 'lever' && !A.door) {
      const L = g.pts.L?.[0];
      if (!L || dist(L, p) > 4) return;
      this.openDoor(A, `${p.name} がレバーを引いた。重い扉が開いていく…`);
    }
    if (what === 'chest') {
      const list = chestsOf(A.def);
      const C = list.find((c) => c.id === id) || (!id && list[0]);
      if (!C || dist(C, p) > 4) return;
      const cd = C.big ? CHEST_COOLDOWN : SMALL_CHEST_COOLDOWN;
      const key = `${C.id}:${p.name}`;
      const last = A.chests.get(key) ?? -1e9;
      if (this.time - last < cd) {
        this.send(p, { t: 'chat', from: '', text: `宝箱は空っぽだ。（あと${Math.ceil(cd - (this.time - last))}秒で中身が戻る）`, color: '#aab' });
        return;
      }
      A.chests.set(key, this.time);
      const ilvl = floorLevel(A.n) + (C.big ? 5 : 3);
      let items;
      if (C.big && A.def.unique) {
        const t = Math.random();
        const rar = t < 0.05 ? 5 : t < 0.3 ? 4 : 3;
        const B = { bias: A.def.bias, kinds: A.def.kinds };
        items = [makeItem(ilvl, rar, { uniqueDef: A.def.unique, ...B }), makeItem(ilvl, rollRarity(1, 2), B)];
      } else {
        // 小さな宝箱: レア以上を1つ
        items = [makeItem(ilvl, Math.max(2, rollRarity(1, 1)), { bias: A.def.bias, kinds: A.def.kinds })];
      }
      this.send(p, { t: 'gold', n: Math.round((C.big ? 80 + ilvl * 12 : 20 + ilvl * 4) * rnd(0.85, 1.15)), x: r2(C.x), z: r2(C.z + 1.2), bag: C.big });
      this.send(p, { t: 'loot', src: 'chest', ar: A.id, cid: C.id, items: items.map((it) => ({ it, x: r2(C.x + rnd(-1, 1)), z: r2(C.z + rnd(0.5, 1.5)) })) });
      for (const it of items) if (it.rarity >= 4) this.sys(`★ ${p.name} が${RARITIES[it.rarity].name}「${it.name}」を手に入れた！`, RARITIES[it.rarity].color);
    }
  }

  // 共有ボックス: open（中身を見る）/ put（入れる）/ take（取り出す）
  boxOp(A, p, m) {
    const op = String(m.op || '');
    if (op === 'close') { p.boxOpen = false; return; }
    const B = A.def.box;
    if (!B || dist(B, p) > BOX_RANGE) return;
    if (op === 'put') {
      const it = m.item;
      if (!it || typeof it !== 'object' || typeof it.name !== 'string' || typeof it.slot !== 'string') return;
      if (this.box.length >= BOX_MAX) { this.send(p, { t: 'chat', from: '', text: '共有ボックスがいっぱいだ。', color: '#f88' }); return; }
      const json = JSON.stringify(it);
      if (json.length > 4000) return;
      const item = JSON.parse(json);
      item.uid = this.seq++;
      item.by = p.name;
      this.box.push(item);
      this.send(p, { t: 'boxPut', ok: true, ref: m.ref });
      this.save();
      if (item.rarity >= 3) this.sys(`${p.name} が共有ボックスに「${item.name}」を入れた`, '#cfe');
    } else if (op === 'take') {
      const i = this.box.findIndex((it) => it.uid === m.uid);
      if (i < 0) { this.send(p, { t: 'chat', from: '', text: 'その装備はもう誰かが取り出したようだ。', color: '#aab' }); }
      else {
        const [item] = this.box.splice(i, 1);
        delete item.by;
        this.send(p, { t: 'boxTake', item });
        this.save();
      }
    } else if (op !== 'open') return;
    // 開いている人全員に最新の中身を送る
    for (const q of this.players.values()) {
      if (q.joined && (q === p || q.boxOpen)) this.send(q, { t: 'box', items: this.box, max: BOX_MAX });
    }
    p.boxOpen = op === 'open' || p.boxOpen;
  }

  openDoor(A, text) {
    if (A.door) return;
    A.door = true;
    this.sysArea(A.id, text, '#7fffd4');
    this.broadcastArea(A.id, { t: 'door', open: true });
  }

  // ---- テレグラフ（予兆） ----
  // kd: 当たると吹き飛ばされる大技（ボスの突進・爆発など）
  tele(A, src, shapes, delay, dmg, color, kd = 0) {
    this.broadcastArea(A.id, { t: 'tele', id: this.seq++, src: src ? src.id : 0, sh: shapes, d: Math.round(delay * 1000), dmg: Math.round(dmg), c: color, ...(kd ? { kd: 1 } : {}) });
  }
  later(A, sec, fn) { A.timers.push({ at: this.time + sec, fn }); }

  // ---- モンスター ----
  spawnMob(A, defIdx, x, z, lv, kind = 'mob', elite = false) {
    const def = A.fdef.mobs[defIdx];
    const arch = ARCH[def.t];
    const scaleN = partySize(this.areaPlayers(A.id).length);
    let hp = mobHp(lv) * floorPressure(A.n) * enemyScale(scaleN) * arch.hp * (kind === 'add' ? 0.5 : 1) * (elite ? ELITE.hp : 1);
    hp = Math.round(hp);
    const mob = {
      id: this.seq++, scaleN, kind, d: defIdx, t: def.t, name: def.name, arch, lv, hp, mhp: hp, x, z, hx: x, hz: z, elite,
      a: Math.random() * Math.PI * 2, st: 0, target: null, cd: rnd(0.5, 1.5), windT: 0, wanderT: 0, wx: x, wz: z,
      provoked: 0, threat: new Map(), tauntT: 0, pathT: 0, wp: null, hateT: HATE_RESET.mob, hateMax: HATE_RESET.mob,
    };
    A.mobs.set(mob.id, mob);
    return mob;
  }

  spawnBoss(A) {
    const n = partySize(this.areaPlayers(A.id).length);
    const lv = bossLevel(A.n);
    const hp = Math.round(mobHp(lv) * BALANCE.bossHp * floorPressure(A.n) * enemyScale(n, true));
    const b = {
      id: this.seq++, scaleN: n, kind: 'boss', d: 2, t: A.fdef.boss.t, lv, hp, mhp: hp, x: A.lair.x, z: A.lair.z - 5, a: 0,
      st: 0, actT: 2.5, busyT: 0, enraged: false, phase: 1, last: null, dash: null, arch: { speed: 3.4 }, threat: new Map(),
      hateT: HATE_RESET.boss, hateMax: HATE_RESET.boss, stun: 0, stunMax: Math.round(BALANCE.bossStun * (1 + 0.65 * (n - 1))), stunT: 0,
    };
    A.mobs.set(b.id, b);
    A.boss = b;
    return b;
  }

  // Only scale up within an encounter. Leaving/dying never weakens an existing enemy.
  // Preserve the HP fraction, so reinforcements cannot reset progress or instantly kill it.
  scaleEncounter(A, m, count) {
    const n = partySize(count), previous = m.scaleN || BALANCE.recommendedParty;
    if (n <= previous) return;
    const boss = m.kind === 'boss';
    const fraction = m.hp / m.mhp;
    m.mhp = Math.round(m.mhp * enemyScale(n, boss) / enemyScale(previous, boss));
    m.hp = Math.max(1, Math.round(m.mhp * fraction));
    if (boss) m.stunMax = Math.round(m.stunMax * (1 + 0.65 * (n - 1)) / (1 + 0.65 * (previous - 1)));
    m.scaleN = n;
  }

  killMob(A, mob) {
    A.mobs.delete(mob.id);
    const isBoss = mob.kind === 'boss';
    this.broadcastArea(A.id, { t: 'die', id: mob.id, x: r2(mob.x), z: r2(mob.z), boss: isBoss });
    let xp = mobXp(mob.lv) * (A.def.mobs?.xp || 1) * (mob.named ? NAMED.xp : mob.elite ? ELITE.xp : 1);
    if (mob.named) A.namedT = NAMED.respawn;
    if (isBoss) xp *= 12;
    if (mob.kind === 'add') xp *= 0.3;
    for (const p of this.areaPlayers(A.id)) {
      if (p.dead || p.hp <= 0 || dist(p, mob) > (isBoss ? 55 : 45)) continue;
      const mult = levelXpMultiplier(p.lv, mob.lv);
      this.send(p, { t: 'xp', n: Math.max(1, Math.round(xp * mult)), nm: isBoss ? A.fdef.boss.name : mob.name, ar: A.id, boss: isBoss ? A.n : 0, el: mob.named ? 3 : mob.elite ? 1 : 0 });
      // ゴールド（個人ごと）。雑魚はたまに落とさない。ボス・ネームドは金貨袋
      let gold = (3 + mob.lv * 1.5) * rnd(0.7, 1.3) * (isBoss ? 40 : mob.named ? 15 : mob.elite ? 3 : 1) * (mob.kind === 'add' ? 0.2 : 1);
      if (!isBoss && !mob.named && !mob.elite && Math.random() < 0.25) gold = 0;
      if (gold >= 1) this.send(p, { t: 'gold', n: Math.round(gold), x: r2(mob.x), z: r2(mob.z), bag: isBoss || !!mob.named });
      // 個人ドロップ（友達と取り合いにならない）
      const items = [];
      const ilvl = mob.lv;
      const B = { bias: A.def.bias, kinds: A.def.kinds }; // エリアの出やすい武器種・付きやすい特性
      if (isBoss) {
        items.push(makeItem(ilvl + 1, rollRarity(1, 2), B));
        items.push(makeItem(ilvl + 1, rollRarity(1, 1), B));
        if (Math.random() < 0.5) items.push(makeItem(ilvl, rollRarity(1, 0), B));
      } else if (mob.named) {
        // ネームド: 良いものが必ず出る
        items.push(makeItem(ilvl + 2, Math.max(3, rollRarity(1, 2)), B));
        items.push(makeItem(ilvl, Math.max(2, rollRarity(1, 1)), B));
      } else if (Math.random() < (mob.elite ? 0.6 : mob.kind === 'add' ? 0.08 : 0.34)) {
        items.push(makeItem(ilvl, rollRarity(mob.elite ? 0.4 : 0, mob.elite ? 1 : 0), B));
      }
      if (items.length) {
        this.send(p, { t: 'loot', items: items.map((it) => ({ it, x: r2(mob.x + rnd(-1.6, 1.6)), z: r2(mob.z + rnd(-1.6, 1.6)) })) });
        for (const it of items) {
          if (it.rarity >= 4) this.sys(`★ ${p.name} が${RARITIES[it.rarity].name}「${it.name}」を手に入れた！`, RARITIES[it.rarity].color);
        }
      }
    }
    // 門番を倒すと扉が開く
    if (mob.gatekeeper) this.openDoor(A, '門番が倒れた。ボス部屋への扉が開いた！');
    if (isBoss) {
      A.boss = null;
      A.bossState = 'cleared';
      A.bossCd = 40;
      A.timers = [];
      for (const m of [...A.mobs.values()]) if (m.kind === 'add') A.mobs.delete(m.id);
      this.broadcastArea(A.id, { t: 'bossClear', n: A.n, name: A.fdef.boss.name });
      if (A.n === this.unlocked && A.n < MAX_FLOOR) {
        this.unlocked++;
        this.save();
        this.broadcast({ t: 'unlock', unlocked: this.unlocked });
        this.sys(`第${A.n}層 攻略！ 第${A.n + 1}層「${FLOORS[A.n].name}」への転移門が開放された`, '#7fffd4');
      } else if (A.n === MAX_FLOOR) {
        this.sys(`★★★ 現在の最上層・第${MAX_FLOOR}層を攻略！ おめでとう！ ★★★`, '#ffd700');
      }
    }
  }

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

  resetBoss(A) {
    if (A.boss) A.mobs.delete(A.boss.id);
    for (const m of [...A.mobs.values()]) if (m.kind === 'add') A.mobs.delete(m.id);
    A.boss = null; A.bossState = 'idle'; A.bossCd = 5; A.timers = []; A.projs = [];
    this.broadcastArea(A.id, { t: 'bossReset' });
  }

  // スタン: 一定時間固まり、出している最中の攻撃もすべて取り消す
  stunBoss(A, b) {
    b.stunT = STUN_TIME;
    b.stun = 0;
    b.stunMax = Math.round(b.stunMax * 1.3);
    b.dash = null; b.busyT = 0; b.actT = STUN_TIME + 0.6;
    A.timers = [];
    A.projs = [];
    this.broadcastArea(A.id, { t: 'stun', id: b.id, sec: STUN_TIME });
  }

  // 弾を撃つ（クライアントが同じ軌道で動かし、当たり判定やガードはクライアント側）
  shoot(A, b, x, z, ang, speed, r, life, dmg, color) {
    const pr = { id: this.seq++, src: b.id, x, z, vx: Math.sin(ang) * speed, vz: Math.cos(ang) * speed, r, life, dmg: Math.round(dmg) };
    A.projs.push(pr);
    this.broadcastArea(A.id, { t: 'proj', ...pr, c: color });
  }

  tickArea(A, dt) {
    const def = A.def;
    const players = this.areaPlayers(A.id);
    const alive = players.filter((p) => !p.dead && !p.down);
    this.checkWipe(A, players);
    // 這いずり: しばらく攻撃が当たらないとゲージが戻る
    for (const p of players) {
      if (p.down && this.time - p.revHitAt >= REVIVE.regenDelay) p.rev = Math.min(p.revMax, p.rev + p.revMax * REVIVE.regen * dt);
    }

    // タイマー
    if (A.timers.length) {
      const due = A.timers.filter((t) => t.at <= this.time);
      A.timers = A.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }

    // 湧き
    if (def.mobs && def.shape === 'open') {
      const field = [...A.mobs.values()].filter((m) => m.kind === 'mob').length;
      const want = Math.min(36, def.mobs.count + 3 + players.length * def.mobs.perPlayer);
      A.spawnT -= dt;
      if (field < want && A.spawnT <= 0) {
        A.spawnT = field < want / 2 ? 0.1 : (def.mobs.respawn ?? 1.2);
        const exits = exitsOf(def), blocks = [...obstaclesOf(def), ...hazardsOf(def)];
        for (let tries = 0; tries < 12; tries++) {
          const ang = Math.random() * Math.PI * 2, [dx, dz] = dirOf(ang), rr = rnd(0.15, 0.85) * boundR(def, ang);
          const pos = { x: dx * rr, z: dz * rr };
          if (!insideOpen(def, pos.x, pos.z, 3)) continue;
          if (blocks.some((o) => dist(o, pos) < o.r + 1.5)) continue;
          if (exits.some((e) => dist(e, pos) < 10)) continue;
          if (def.gate && dist(def.gate, pos) < 14) continue;
          if (players.some((p) => dist(p, pos) < 12)) continue;
          const d = def.mobs.only ?? pick(def.mobs.pool || [0, 1]); // エリアごとの出現候補
          this.spawnMob(A, d, pos.x, pos.z, floorLevel(A.n) + Math.floor(rnd(def.mobs.lv[0], def.mobs.lv[1] + 1)));
          break;
        }
      }
    } else if (def.mobs && def.shape === 'grid') {
      for (const pt of A.points) {
        if (pt.mobId && A.mobs.has(pt.mobId)) continue;
        if (pt.ch === 'G' && A.door) continue;
        pt.mobId = null;
        pt.t -= dt;
        if (pt.t > 0) continue;
        pt.t = def.mobs.respawnSec ?? 40;
        if (players.some((p) => dist(p, pt) < 8)) { pt.t = 3; continue; }
        const lv = floorLevel(A.n) + Math.floor(rnd(def.mobs.lv[0], def.mobs.lv[1] + 1)) + (pt.ch === 'G' ? 2 : 0);
        const elite = !!def.mobs.elite || pt.ch === 'G';
        const mob = this.spawnMob(A, pt.ch === 'G' ? 1 : pick(def.mobs.pool || [0, 1]), pt.x, pt.z, lv, 'mob', elite);
        if (pt.ch === 'G') { mob.gatekeeper = true; mob.name = '門番'; }
        pt.mobId = mob.id;
      }
    }

    // ネームド（秘境の主）
    if (def.named && !(A.namedId && A.mobs.has(A.namedId))) {
      A.namedId = null;
      A.namedT = (A.namedT ?? 2) - dt;
      const sp = namedSpot(def);
      if (A.namedT <= 0 && !players.some((p) => dist(p, sp) < 10)) {
        const nd = def.named;
        const mob = this.spawnMob(A, nd.d, sp.x, sp.z, nd.lv, 'mob', true);
        mob.named = true; mob.name = nd.name;
        mob.hp = mob.mhp = Math.round(mobHp(mob.lv) * mob.arch.hp * NAMED.hp * floorPressure(A.n) * enemyScale(mob.scaleN));
        A.namedId = mob.id;
        this.sysArea(A.id, `どこからか強大な気配がする…「${nd.name}」が現れた`, '#ffb27a');
      }
    }

    // ギミック
    if (def.gimmick === 'plates' && !A.door) {
      const P = grid(def).pts.P || [];
      P.forEach((pt, i) => {
        if (alive.some((p) => dist(p, pt) < 2) && this.time - A.plates[i] > 0.5) {
          if (this.time - A.plates[i] > PLATE_WINDOW) this.sysArea(A.id, `感圧板が光った！（${P.length}つ全て踏むと扉が開く・${PLATE_WINDOW}秒以内）`, '#9fe');
          A.plates[i] = this.time;
        }
      });
      if (P.length && A.plates.every((t) => this.time - t <= PLATE_WINDOW)) this.openDoor(A, '全ての感圧板が作動した。扉が開いた！');
    }
    if (def.gimmick === 'gatekeeper' && players.length) {
      A.trapT -= dt;
      if (A.trapT <= 0) {
        A.trapT = 1.7;
        A.trapGroup ^= 1;
        const pts = grid(def).pts[A.trapGroup ? 'T' : 't'] || [];
        const dmg = mobDmg(floorLevel(A.n) + 4) * 1.6;
        if (pts.length) this.tele(A, null, pts.map((p) => ({ k: 'circle', x: r2(p.x), z: r2(p.z), r: 2.1 })), 1.0, dmg, '#ff8a3a');
      }
    }

    // ボス部屋
    if (A.lair) {
      if (A.bossState === 'cleared') {
        A.bossCd -= dt;
        if (A.bossCd <= 0) A.bossState = 'idle';
      }
      if (A.bossState === 'idle' && alive.some((p) => dist(p, A.lair) < A.lair.r - 3)) {
        A.bossState = 'fight';
        const b = this.spawnBoss(A);
        this.broadcastArea(A.id, { t: 'bossStart', n: A.n, name: A.fdef.boss.name, id: b.id });
      }
    }

    // ボスの弾
    for (let i = A.projs.length - 1; i >= 0; i--) {
      const pr = A.projs[i];
      pr.x += pr.vx * dt; pr.z += pr.vz * dt; pr.life -= dt;
      if (pr.life <= 0) A.projs.splice(i, 1);
    }

    for (const m of A.mobs.values()) {
      m.slowT = Math.max(0, (m.slowT || 0) - dt);
      this.scaleEncounter(A, m, players.length);
      for (const [pid, v] of m.threat) m.threat.set(pid, v * (1 - 0.04 * dt));
      m.hateT -= dt;
      if (m.hateT <= 0) {
        // ヘイトのリセット: 誰が取り直すか
        m.threat.clear(); m.tauntT = 0;
        m.hateT = m.hateMax;
        if (m.kind === 'boss') this.broadcastArea(A.id, { t: 'hateReset', id: m.id });
      }
      if (m.kind === 'boss') this.tickBoss(A, m, alive, dt);
      else this.tickMob(A, m, alive, dt);
    }

    // 押し合い
    const ms = [...A.mobs.values()];
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
    for (const m of ms) if (m.kind !== 'boss') { const c = collide(def, m.x, m.z, 0.6, A.door); m.x = c.x; m.z = c.z; }
  }

  // ヘイトの一番高い相手。挑発中は挑発した相手
  threatTarget(m, alive, range) {
    if (m.tauntT > 0) {
      const t = alive.find((p) => p.id === m.tauntBy);
      if (t && dist(t, m) < range) return t;
    }
    let best = null, bv = 0;
    for (const p of alive) {
      const v = m.threat?.get(p.id) || 0;
      if (v > bv && dist(p, m) < range) { bv = v; best = p; }
    }
    return best;
  }

  tickMob(A, m, alive, dt) {
    const Ar = m.arch;
    m.cd -= dt; m.provoked -= dt; m.tauntT -= dt;
    if (m.st === 2) { // 予兆中
      m.windT -= dt;
      if (m.windT <= 0) { m.st = 3; m.windT = 0.35; }
      return;
    }
    if (m.st === 3) { m.windT -= dt; if (m.windT <= 0) m.st = 0; return; }

    const home = { x: m.hx, z: m.hz };
    let target = this.threatTarget(m, alive, 26);
    if (!target) {
      let best = Ar.aggro * 1.15;
      for (const p of alive) {
        const d = dist(p, m);
        if (d < best && !(A.def.gate && dist(p, A.def.gate) < 8)) { best = d; target = p; }
      }
    }
    m.target = target ? target.id : null;
    if (target && dist(m, home) > 28) { m.target = null; target = null; m.hp = m.mhp; m.threat.clear(); }

    if (target) {
      const d = dist(target, m);
      const ang = Math.atan2(target.x - m.x, target.z - m.z);
      m.a = ang;
      const want = Ar.ranged ? 7 : 1.6;
      if (d > want + 0.3) this.moveMobToward(A, m, target, Ar.speed, dt);
      else if (Ar.ranged && d < want - 2) this.moveMob(A, m, ang + Math.PI, Ar.speed * 0.7, dt);
      else m.st = 0;
      if (m.cd <= 0 && d <= Ar.range) this.mobAttack(A, m, target, ang);
    } else {
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderT = rnd(2, 5); m.wx = m.hx + rnd(-5, 5); m.wz = m.hz + rnd(-5, 5); }
      const d = Math.hypot(m.wx - m.x, m.wz - m.z);
      if (d > 0.5) { m.a = Math.atan2(m.wx - m.x, m.wz - m.z); this.moveMob(A, m, m.a, Ar.speed * 0.4, dt); }
      else m.st = 0;
      if (m.hp < m.mhp) m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.05 * dt);
    }
  }

  // 迷路では経路探索しながら近づく
  moveMobToward(A, m, t, speed, dt) {
    if (A.def.shape === 'grid') {
      m.pathT -= dt;
      if (m.pathT <= 0 || !m.wp) { m.pathT = 0.4; m.wp = pathStep(A.def, m.x, m.z, t.x, t.z, A.door); }
      this.moveMob(A, m, Math.atan2(m.wp.x - m.x, m.wp.z - m.z), speed, dt);
      m.a = Math.atan2(t.x - m.x, t.z - m.z);
    } else {
      // 屋外: 正面の障害物は横へ回り込む
      let ang = Math.atan2(t.x - m.x, t.z - m.z);
      const fx = Math.sin(ang), fz = Math.cos(ang), dT = dist(m, t);
      for (const o of obstaclesOf(A.def)) {
        const ox = o.x - m.x, oz = o.z - m.z, along = ox * fx + oz * fz;
        if (along <= 0 || along > Math.min(dT, o.r + 4)) continue;
        const side = ox * fz - oz * fx;
        if (Math.abs(side) > o.r + 0.9) continue;
        ang += (side > 0 ? 1 : -1) * Math.PI / 2.2;
        break;
      }
      this.moveMob(A, m, ang, speed, dt);
    }
  }

  applyTechniqueControl(A, p, mob, id) {
    const t = TECHNIQUES[id];
    if (!t || t.kind !== p.wk || p.dead || mob.kind === 'boss' || dist(p,mob) > 32) return;
    const control=t.control;
    if (control.slow) { mob.slowT=Math.max(mob.slowT||0,control.seconds);mob.slowRate=control.slow; }
    const displacement=control.push || (control.pull ? -control.pull : 0);
    if (displacement) {
      const dx=mob.x-p.x,dz=mob.z-p.z,d=Math.hypot(dx,dz);
      if(d>.01){const move=displacement<0?-Math.min(-displacement,Math.max(0,d-1.2)):displacement;
        const next=collide(A.def,mob.x+dx/d*move,mob.z+dz/d*move,.6,A.door);mob.x=next.x;mob.z=next.z;}
    }
  }

  moveMob(A, m, ang, speed, dt) {
    if (m.slowT > 0) speed *= 1 - m.slowRate;
    m.x += Math.sin(ang) * speed * dt;
    m.z += Math.cos(ang) * speed * dt;
    const c = collide(A.def, m.x, m.z, 0.6, A.door);
    m.x = c.x; m.z = c.z;
    // 転移門の安全地帯には入らない
    const gate = A.def.gate;
    if (gate) {
      const dg = dist(m, gate);
      if (dg < 7) { m.x = gate.x + (m.x - gate.x) / dg * 7; m.z = gate.z + (m.z - gate.z) / dg * 7; }
    }
    m.st = 1;
  }

  mobAttack(A, m, target, ang) {
    const Ar = m.arch;
    const dmg = mobDmg(m.lv) * floorPressure(A.n) * attackPressure(m.scaleN) * Ar.dmg * (m.named ? NAMED.dmg : m.elite ? ELITE.dmg : 1);
    const wind = Math.max(0.42, Ar.wind * (m.elite ? 0.85 : 1) * 0.9);
    m.st = 2; m.windT = wind; m.cd = rnd(1.0, 1.8) + wind;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    const s = m.elite ? 1.3 : 1;
    let sh;
    switch (m.t) {
      case 'slime': sh = [{ k: 'circle', x: r2(m.x + fx * 1.2), z: r2(m.z + fz * 1.2), r: 2.0 * s }]; break;
      case 'beast': sh = [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(ang), arc: 1.3, len: 3.6 * s }]; break;
      case 'golem': sh = [{ k: 'circle', x: r2(m.x), z: r2(m.z), r: 3.3 * s }]; break;
      case 'wisp': sh = [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 2.0 * s }]; break;
      // コウモリ: 狭い扇で急降下
      case 'bat': sh = [{ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(ang), arc: 0.9, len: 3.0 * s }]; break;
      // キノコ: 自分の周りに胞子をまく（紫）
      case 'mushroom': this.tele(A, m, [{ k: 'circle', x: r2(m.x), z: r2(m.z), r: 3.6 * s }], wind, dmg, '#b060ff'); return;
      // サソリ: 細長い尾の突き刺し＋先端の毒だまり
      case 'scorpion': {
        const L = 5.2 * s;
        sh = [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: L, w: 1.1 * s }, { k: 'circle', x: r2(m.x + fx * L), z: r2(m.z + fz * L), r: 1.4 * s }];
        break;
      }
      // 魔術師: 狙った相手の周りに3つの魔法陣（三角形）
      case 'mage': {
        const base = Math.random() * Math.PI * 2;
        const pts = [0, 1, 2].map((i) => { const a = base + i * 2.094; return { k: 'circle', x: r2(target.x + Math.sin(a) * 1.6), z: r2(target.z + Math.cos(a) * 1.6), r: 1.7 * s }; });
        this.tele(A, m, pts, wind, dmg * 0.8, '#ff6ad0');
        return;
      }
      default: sh = [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len: 4.6 * s, w: 1.8 * s }];
    }
    this.tele(A, m, sh, wind, dmg);
  }

  // ---- ボス ----
  tickBoss(A, b, alive, dt) {
    const L = A.lair;
    const inArena = alive.filter((p) => dist(p, L) < L.r + 4);
    if (!inArena.length) {
      A.noTargetT += dt;
      if (A.noTargetT > 8) { this.resetBoss(A); return; }
    } else A.noTargetT = 0;

    // フェーズ: 1 → 激昂(65%) → 最終形態(35%)。移行時は大技で割り込む
    if (!b.enraged && b.hp < b.mhp * 0.65) {
      b.enraged = true; b.phase = 2;
      b.arch.speed = 4.6;
      this.broadcastArea(A.id, { t: 'enrage', id: b.id, p: 2 });
      b.dash = null; b.busyT = 0; b.actT = 0.4; b.forced = 'shock';
    }
    if (b.phase === 2 && b.hp < b.mhp * 0.35) {
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
    let target = this.threatTarget(b, inArena, L.r + 6) || alive.find((p) => p.id === b.target && dist(p, L) < L.r + 4);
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
      const pats = b.phase === 3 ? [...bd.patterns, ...(bd.p3 || [])] : bd.patterns;
      const forced = b.forced;
      let pat = forced || pick(pats);
      b.forced = null;
      if (!forced && pat === b.last && pats.length > 1) pat = pick(pats.filter((p) => p !== b.last));
      b.last = pat;
      const victim = Math.random() < 0.2 && inArena.length > 1 ? pick(inArena) : target;
      const busy = this.bossPattern(A, b, pat, victim, inArena);
      b.busyT = busy;
      // 攻撃の間隔は短め。フェーズが進むほど詰めてきて、連続攻撃も増える
      const gap = [0, rnd(0.6, 1.1), rnd(0.35, 0.7), rnd(0.15, 0.45)][b.phase || 1];
      b.actT = busy + gap * 0.8;
      const chain = [0, 0.25, 0.5, 0.7][b.phase || 1];
      if (Math.random() < chain) b.actT = busy + 0.05;
    }
  }

  clampArena(A, o) {
    const L = A.lair;
    const dx = o.x - L.x, dz = o.z - L.z, d = Math.hypot(dx, dz);
    const max = L.r - 1.5;
    if (d > max) { o.x = L.x + dx / d * max; o.z = L.z + dz / d * max; }
  }

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
  }

  livePlayer(A, id) {
    return this.areaPlayers(A.id).find((p) => p.id === id && !p.dead && !p.down);
  }

  // 這いずり: 同じエリアの全員が倒れたら（ひとりでも）、這いずっている人は全員力尽きる
  checkWipe(A, players) {
    if (!players.some((p) => p.down) || !players.every((p) => p.dead || p.down)) return;    for (const p of players) if (p.down) { p.down = false; p.rev = 0; this.send(p, { t: 'bleed' }); }
  }

  bossPattern(A, b, pat, target, inArena) {
    const L = A.lair;
    const sp = [1, 0.9, 0.78, 0.68][b.phase || 1];
    const base = mobDmg(b.lv) * 3.3 * BALANCE.bossDamage * floorPressure(A.n) * attackPressure(b.scaleN);
    const col = b.phase === 3 ? '#ff1a8a' : b.enraged ? '#ff2a6a' : '#ff3a3a';
    // 遠距離攻撃と突進は、ときどき離れている別の人を狙う
    if (['shot', 'charge', 'chase'].includes(pat) && inArena.length > 1 && Math.random() < (pat === 'shot' ? 0.6 : 0.4)) {
      const far = inArena.filter((p) => p.id !== target.id).sort((p, q) => dist(q, b) - dist(p, b))[0];
      if (far) {
        target = far;
        this.broadcastArea(A.id, { t: 'chat', from: '', text: `${A.fdef.boss.name}が ${far.name} に狙いを変えた！`, color: '#ff9a8a' });
      }
    }
    const ang = Math.atan2(target.x - b.x, target.z - b.z);
    b.a = ang;
    const tid = target.id;
    this.broadcastArea(A.id, { t: 'bossAct', id: b.id, p: pat, tid });
    switch (pat) {
      case 'shot': {
        // 狙った相手へ弾を扇状に撃つ（盾槍のガードで消せる）
        const n = b.phase === 3 ? 5 : 3;
        this.broadcastArea(A.id, { t: 'aim', id: b.id, tid, d: 700 });
        this.later(A, 0.7 * sp, () => {
          if (A.boss !== b) return;
          const p = this.livePlayer(A, tid) || target;
          const a0 = Math.atan2(p.x - b.x, p.z - b.z);
          for (let i = 0; i < n; i++) {
            const a = a0 + (i - (n - 1) / 2) * 0.22;
            this.shoot(A, b, b.x + Math.sin(a) * 2, b.z + Math.cos(a) * 2, a, 14, 0.9, 2.6, base * 0.75, '#ff5a3a');
          }
        });
        return 1.2 * sp;
      }
      case 'combo': {
        // 狙った相手を追いかける3〜5連叩きつけ
        const n = 3 + (b.phase || 1) - 1;
        for (let i = 0; i < n; i++) {
          this.later(A, i * 0.42 * sp, () => {
            const p = this.livePlayer(A, tid) || target;
            this.tele(A, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 3.2 }], 0.75 * sp, base * 0.85, col);
          });
        }
        return (0.42 * n + 0.5) * sp;
      }
      case 'sweep': {
        // 扇が回転しながら連続で薙ぎ払う
        const dir = Math.random() < 0.5 ? 1 : -1;
        const n = b.phase === 3 ? 6 : 4;
        for (let i = 0; i < n; i++) {
          this.later(A, i * 0.28 * sp, () => this.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + dir * i * 1.05), arc: 1.2, len: 12 }], 0.7 * sp, base, col));
        }
        return (0.28 * n + 0.6) * sp;
      }
      case 'shock': {
        // 外へ広がる衝撃波。輪と輪の隙間で回避する
        const waves = b.phase >= 2 ? 5 : 4;
        const cx = b.x, cz = b.z;
        for (let i = 0; i < waves; i++) {
          this.later(A, i * 0.45 * sp, () => this.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.2, r1: i * 4.2 + 3 }], 0.8 * sp, base * 0.9, col));
        }
        return (0.45 * waves + 0.5) * sp;
      }
      case 'chase': {
        // 狙いを付け直しながら連続突進
        const n = b.phase === 3 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          this.later(A, i * 0.85 * sp, () => {
            if (A.boss !== b) return;
            const p = this.livePlayer(A, tid) || target;
            this.bossCharge(A, b, p.x, p.z, 0.6 * sp, base * 1.1, col);
          });
        }
        return (0.85 * n + 0.4) * sp;
      }
      case 'cage': {
        // 外周と足元が同時に爆発。安全地帯はドーナツ状の狭い帯だけ
        const cx = b.x, cz = b.z;
        this.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 8, r1: 26 }, { k: 'circle', x: r2(cx), z: r2(cz), r: 4 }], 1.25 * sp, base * 1.3, col, 1);
        this.later(A, 1.0 * sp, () => this.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: 3.5, r1: 7 }], 0.9 * sp, base, col));
        return 2.2 * sp;
      }
      case 'ultimate': {
        // 最終形態の大技: 衝撃波 → 十字 → 全員の足元へ雨
        const cx = b.x, cz = b.z;
        for (let i = 0; i < 5; i++) this.later(A, i * 0.35, () => this.tele(A, b, [{ k: 'ring', x: r2(cx), z: r2(cz), r0: i * 4.5, r1: i * 4.5 + 3.2 }], 0.75, base, '#ff1a8a'));
        const mk = (a) => [0, Math.PI / 2].map((o) => ({ k: 'line', x: r2(cx - Math.sin(a + o) * 24), z: r2(cz - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.6 }));
        this.later(A, 2.0, () => this.tele(A, b, mk(Math.PI / 4), 0.9, base * 1.2, '#ff1a8a'));
        this.later(A, 2.6, () => this.tele(A, b, mk(0), 0.9, base * 1.2, '#ff1a8a'));
        this.later(A, 3.2, () => {
          for (const p of this.areaPlayers(A.id)) if (!p.dead && !p.down) for (let k = 0; k < 3; k++) this.later(A, k * 0.3, () => this.tele(A, b, [{ k: 'circle', x: r2(p.x), z: r2(p.z), r: 2.8 }], 0.7, base * 0.8, '#ff1a8a'));
        });
        return 4.6;
      }
      case 'slam': {
        this.tele(A, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.1 * sp, base, col);
        if (b.enraged) this.later(A, 0.5, () => this.tele(A, b, [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 4.5 }], 1.0 * sp, base, col));
        return 1.3 * sp;
      }
      case 'cone': {
        this.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang), arc: 1.9, len: 11 }], 0.95 * sp, base * 1.1, col);
        if (b.enraged) this.later(A, 0.9 * sp, () => this.tele(A, b, [{ k: 'cone', x: r2(b.x), z: r2(b.z), a: r2(ang + Math.PI), arc: 1.9, len: 11 }], 0.8, base * 1.1, col));
        return 1.1 * sp;
      }
      case 'charge': {
        this.bossCharge(A, b, target.x, target.z, 1.0 * sp, base * 1.25, col);
        return 1.4 * sp;
      }
      case 'nova': {
        this.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 8.5 }], 1.5 * sp, base * 1.5, col, 1);
        return 1.6 * sp;
      }
      case 'ring': {
        this.tele(A, b, [{ k: 'ring', x: r2(b.x), z: r2(b.z), r0: 5.5, r1: 24 }], 1.6 * sp, base * 1.2, col);
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
          const a = Math.random() * Math.PI * 2, rr = Math.random() * L.r;
          pts.push({ x: L.x + Math.sin(a) * rr, z: L.z + Math.cos(a) * rr });
        }
        pts.forEach((pt, i) => this.later(A, i * 0.09, () => this.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.6 }], 1.2 * sp, base * 0.8, col)));
        return 1.3 * sp;
      }
      case 'cross': {
        const a0 = Math.random() * Math.PI;
        const mk = (a) => [0, Math.PI / 2].map((o) => ({
          k: 'line', x: r2(b.x - Math.sin(a + o) * 24), z: r2(b.z - Math.cos(a + o) * 24), a: r2(a + o), len: 48, w: 3.4,
        }));
        this.tele(A, b, mk(a0), 1.2 * sp, base * 1.1, col);
        this.later(A, 0.75 * sp, () => this.tele(A, b, mk(a0 + Math.PI / 4), 1.2 * sp, base * 1.1, col));
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
            this.later(A, i * 0.13, () => this.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 2.4 }], 0.9 * sp, base * 0.9, col));
          }
        }
        return 1.9 * sp;
      }
      case 'summon': {
        const cnt = b.enraged ? 4 : 3;
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * Math.PI * 2;
          const pos = { x: b.x + Math.sin(a) * 5, z: b.z + Math.cos(a) * 5 };
          this.clampArena(A, pos);
          const add = this.spawnMob(A, 0, pos.x, pos.z, Math.max(1, b.lv - 4), 'add');
          add.hx = L.x; add.hz = L.z;
        }
        return 0.9;
      }
      case 'meteor': {
        const pt = { x: target.x + rnd(-2, 2), z: target.z + rnd(-2, 2) };
        this.tele(A, b, [{ k: 'circle', x: r2(pt.x), z: r2(pt.z), r: 10 }], 2.2 * sp, base * 2.0, '#ff6a20', 1);
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2, rr = rnd(8, L.r);
          this.later(A, 0.4 + i * 0.2, () => this.tele(A, b, [{ k: 'circle', x: r2(L.x + Math.sin(a) * rr), z: r2(L.z + Math.cos(a) * rr), r: 3 }], 1.1, base * 0.8, col));
        }
        return 1.6 * sp;
      }
      case 'fissure': {
        // 地割れ: 狙った方向へ3本の亀裂が根元から先へ順に走る
        const sx = b.x, sz = b.z;
        for (let s = 0; s < 4; s++) {
          this.later(A, s * 0.22 * sp, () => {
            const sh = [-0.45, 0, 0.45].map((o) => ({ k: 'line', x: r2(sx + Math.sin(ang + o) * s * 6), z: r2(sz + Math.cos(ang + o) * s * 6), a: r2(ang + o), len: 6.5, w: 2.6 }));
            this.tele(A, b, sh, 0.85 * sp, base * 0.95, col);
          });
        }
        return (0.22 * 4 + 0.8) * sp;
      }
      case 'checker': {
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
        this.tele(A, b, mk(first), 1.3 * sp, base, col);
        this.later(A, 1.35 * sp, () => this.tele(A, b, mk(1 - first), 1.0 * sp, base, col));
        return 2.5 * sp;
      }
      case 'haven': {
        // 聖域: アリーナ全体が爆発する大技。光る小さな安全地帯にだけ逃げ込める
        const a = Math.random() * Math.PI * 2, rr = rnd(6, L.r - 6);
        const safe = { x: L.x + Math.sin(a) * rr, z: L.z + Math.cos(a) * rr };
        this.broadcastArea(A.id, { t: 'chat', from: '', text: `${A.fdef.boss.name}が力を溜めている…光の輪へ逃げろ！`, color: '#ffd84a' });
        this.tele(A, b, [{ k: 'ring', x: r2(safe.x), z: r2(safe.z), r0: 4, r1: rr + L.r + 2 }], 2.4 * sp, base * 1.8, col, 1);
        return 2.6 * sp;
      }
      case 'barrage': {
        // 全方位弾幕: 溜め（足元の予兆）のあと、全方向へ2波撃つ
        const n = b.phase === 3 ? 16 : 12;
        this.tele(A, b, [{ k: 'circle', x: r2(b.x), z: r2(b.z), r: 4.5 }], 0.9 * sp, base * 0.9, col);
        for (let w = 0; w < 2; w++) {
          this.later(A, (0.9 + w * 0.5) * sp, () => {
            if (A.boss !== b) return;
            for (let i = 0; i < n; i++) {
              const a = ang + (i + w * 0.5) * Math.PI * 2 / n;
              this.shoot(A, b, b.x + Math.sin(a) * 2, b.z + Math.cos(a) * 2, a, 11, 0.9, 2.6, base * 0.6, '#ff8a3a');
            }
          });
        }
        return (0.9 + 0.5 + 0.6) * sp;
      }
    }
    return 1;
  }

  snapshot(A) {
    const ps = this.areaPlayers(A.id).map((p) => [p.id, p.name, r2(p.x), r2(p.z), r2(p.a), Math.round(p.hp), Math.round(p.mhp), p.lv, p.color, p.wk, p.wr, p.sw, p.sk, p.dead ? 1 : 0, p.dg, p.gd, p.wst | 0, p.arm | 0, p.rc | 0, p.pm || '', p.pt || 0, p.down ? Math.round(p.rev / p.revMax * REVIVE.disp[p.revStep] * 1000) / 1000 : -1]);
    const ms = [...A.mobs.values()].map((m) => [
      m.id, m.d, r2(m.x), r2(m.z), r2(m.a), Math.max(0, Math.round(m.hp)), m.mhp, m.lv, m.st,
      m.kind === 'boss' ? 2 : m.kind === 'add' ? 1 : 0, m.enraged ? 1 : 0, m.named ? 3 : m.elite ? (m.gatekeeper ? 2 : 1) : 0, m.target || 0,
      Math.round(m.hateT * 10) / 10, m.kind === 'boss' ? Math.round(m.stun / m.stunMax * 100) : 0, m.stunT > 0 ? Math.round(m.stunT * 10) / 10 : 0,
    ]);
    const plates = A.plates.map((t) => this.time - t <= PLATE_WINDOW ? 1 : 0);
    this.broadcastArea(A.id, { t: 'snap', ar: A.id, p: ps, m: ms, bs: A.bossState, door: A.door ? 1 : 0, pl: plates });
  }
}

