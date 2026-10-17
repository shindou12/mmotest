// World のメソッド: エリアの毎フレーム（敵・罠・宝箱・復活・ボス部屋）。sim.js が World.prototype に足す
import { REVIVE, enemyScale, floorPressure } from '../balance.js';
import { floorLevel, mobHp, mobDmg, ELITE_BASE } from '../data.js';
import { PLATE_WINDOW, grid, collide, exitsOf, obstaclesOf, hazardsOf, namedSpot, insideOpen, boundR, dirOf, inLair } from '../areas.js';

import { rnd, pick, dist, r2 } from './common.js';
import { NAMED } from './tuning.js';

const SWARM_HP = 0.4; // 群れの雑魚の体力の倍率
const TREASURE_EVERY = 30, TREASURE_CHANCE = 0.04; // きらめくトカゲの出現判定の間隔（秒）と確率

export const AreaTickMethods = {
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
      // M: 雑魚 / G: 門番 / K: 番兵（迷宮区の精鋭） / w: 群れ（足の速い弱い雑魚が3体）
      for (const pt of A.points) {
        if (pt.mobIds) { if (pt.mobIds.some((id) => A.mobs.has(id))) continue; pt.mobIds = null; }
        if (pt.mobId && A.mobs.has(pt.mobId)) continue;
        if (pt.ch === 'G' && A.door) continue;
        pt.mobId = null;
        pt.t -= dt;
        if (pt.t > 0) continue;
        pt.t = def.mobs.respawnSec ?? 40;
        if (players.some((p) => dist(p, pt) < 8)) { pt.t = 3; continue; }
        const lv = floorLevel(A.n) + Math.floor(rnd(def.mobs.lv[0], def.mobs.lv[1] + 1)) + (pt.ch === 'G' || pt.ch === 'K' ? 2 : 0);
        if (pt.ch === 'w') {
          pt.mobIds = [0, 1, 2].map((i) => this.spawnMob(A, def.mobs.swarm ?? 0, pt.x + Math.sin(i * 2.1) * 1.5, pt.z + Math.cos(i * 2.1) * 1.5, lv - 1, 'mob', false, SWARM_HP).id);
          continue;
        }
        const elite = !!def.mobs.elite || pt.ch === 'G' || pt.ch === 'K';
        const mob = this.spawnMob(A, pt.ch === 'K' ? ELITE_BASE : pt.ch === 'G' ? 1 : pick(def.mobs.pool || [0, 1]), pt.x, pt.z, lv, 'mob', elite);
        if (pt.ch === 'G') { mob.gatekeeper = true; mob.name = '門番'; }
        pt.mobId = mob.id;
      }
    }

    // きらめくトカゲ: 屋外で 30 秒ごとに 4% の確率（1エリアに1匹まで）
    if (def.mobs && def.shape === 'open' && players.length) {
      A.treasureT = (A.treasureT ?? TREASURE_EVERY) - dt;
      if (A.treasureT <= 0) {
        A.treasureT = TREASURE_EVERY;
        if (![...A.mobs.values()].some((m) => m.kind === 'treasure') && Math.random() < TREASURE_CHANCE) this.spawnTreasure(A);
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
      if (A.bossState === 'idle' && alive.some((p) => inLair(A.lair, p.x, p.z, -3))) {
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
  },
};
