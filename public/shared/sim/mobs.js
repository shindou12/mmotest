// World のメソッド: 敵の出現・撃破・移動・ヘイト・攻撃。sim.js が World.prototype に足す
import { TECHNIQUES } from '../techniques.js';
import { BALANCE, partySize, enemyScale, floorPressure, attackPressure, levelXpMultiplier } from '../balance.js';
import { FLOORS, RARITIES, MAX_FLOOR, mobHp, mobDmg, mobXp, makeItem, rollRarity, mobDef } from '../data.js';
import { collide, pathStep, obstaclesOf } from '../areas.js';

import { MOB_ATTACKS } from './mob-attacks.js';
import { rnd, dist, r2, ARCH, HATE_RESET } from './common.js';
import { ELITE, NAMED } from './tuning.js';

const SENTINEL_OPEN = 1.2; // 番兵が攻撃を出し切った後、盾が下がっている秒数
const SENTINEL_REWARD = { xp: 4, gold: 6, rarity: 0.4 }; // 番兵の報酬（精鋭より一段おいしく）

export const MobsMethods = {
  // ---- テレグラフ（予兆） ----
  // kd: 当たると吹き飛ばされる大技（ボスの突進・爆発など）
  tele(A, src, shapes, delay, dmg, color, kd = 0) {
    this.broadcastArea(A.id, { t: 'tele', id: this.seq++, src: src ? src.id : 0, sh: shapes, d: Math.round(delay * 1000), dmg: Math.round(dmg), c: color, ...(kd ? { kd: 1 } : {}) });
  },

  // ---- モンスター ----
  // hpMul: 体力の倍率（群れの雑魚は弱く）。迷宮区などはエリアの mobs.hp も掛かる
  spawnMob(A, defIdx, x, z, lv, kind = 'mob', elite = false, hpMul = 1) {
    const def = mobDef(A.fdef, defIdx);
    const arch = ARCH[def.ai ?? def.t];
    const scaleN = partySize(this.areaPlayers(A.id).length);
    let hp = mobHp(lv) * floorPressure(A.n) * enemyScale(scaleN) * arch.hp * (kind === 'add' ? 0.5 : 1) * (elite ? ELITE.hp : 1) * hpMul * (kind === 'mob' ? A.def.mobs?.hp ?? 1 : 1);
    hp = Math.round(hp);
    const mob = {
      id: this.seq++, scaleN, kind, d: defIdx, t: def.t, ai: def.ai, name: def.name, arch, lv, hp, mhp: hp, x, z, hx: x, hz: z, elite, openT: 0, guard: false,
      a: Math.random() * Math.PI * 2, st: 0, target: null, cd: rnd(0.5, 1.5), windT: 0, wanderT: 0, wx: x, wz: z,
      provoked: 0, threat: new Map(), tauntT: 0, pathT: 0, wp: null, hateT: HATE_RESET.mob, hateMax: HATE_RESET.mob,
    };
    A.mobs.set(mob.id, mob);
    return mob;
  },

  // Only scale up within an encounter. Leaving/dying never weakens an existing enemy.
  // Preserve the HP fraction, so reinforcements cannot reset progress or instantly kill it.
  scaleEncounter(A, m, count) {
    const n = partySize(count), previous = m.scaleN || BALANCE.recommendedParty;
    if (n <= previous) return;
    const boss = m.kind === 'boss';
    const fraction = m.hp / m.mhp;
    m.mhp = Math.round(m.mhp * enemyScale(n, boss) / enemyScale(previous, boss));
    m.hp = Math.max(1, Math.round(m.mhp * fraction));
    if (boss) m.stunMax = Math.round(m.stunMax * (1 + BALANCE.bossStunPerPlayer * (n - 1)) / (1 + BALANCE.bossStunPerPlayer * (previous - 1)));
    m.scaleN = n;
  },

  killMob(A, mob) {
    A.mobs.delete(mob.id);
    const isBoss = mob.kind === 'boss';
    this.broadcastArea(A.id, { t: 'die', id: mob.id, x: r2(mob.x), z: r2(mob.z), boss: isBoss });
    const sentinel = mob.ai === 'sentinel';
    let xp = mobXp(mob.lv) * (A.def.mobs?.xp || 1) * (mob.named ? NAMED.xp : sentinel ? SENTINEL_REWARD.xp : mob.elite ? ELITE.xp : 1);
    if (mob.named) A.namedT = NAMED.respawn;
    if (isBoss) xp *= 12;
    if (mob.kind === 'add') xp *= 0.3;
    for (const p of this.areaPlayers(A.id)) {
      if (p.dead || p.hp <= 0 || dist(p, mob) > (isBoss ? 55 : 45)) continue;
      const mult = levelXpMultiplier(p.lv, mob.lv);
      this.send(p, { t: 'xp', n: Math.max(1, Math.round(xp * mult)), nm: isBoss ? A.fdef.boss.name : mob.name, ar: A.id, boss: isBoss ? A.n : 0, el: mob.named ? 3 : mob.elite ? 1 : 0 });
      // ゴールド（個人ごと）。雑魚はたまに落とさない。ボス・ネームドは金貨袋
      let gold = (3 + mob.lv * 1.5) * rnd(0.7, 1.3) * (isBoss ? 40 : mob.named ? 15 : sentinel ? SENTINEL_REWARD.gold : mob.elite ? 3 : 1) * (mob.kind === 'add' ? 0.2 : 1);
      if (!isBoss && !mob.named && !mob.elite && Math.random() < 0.25) gold = 0;
      if (gold >= 1) this.send(p, { t: 'gold', n: Math.round(gold), x: r2(mob.x), z: r2(mob.z), bag: isBoss || !!mob.named });
      // 個人ドロップ（友達と取り合いにならない）
      const items = [];
      const ilvl = mob.lv;
      const DR = A.fdef.drops || {}; // 階層ごとのドロップの調整（武器の別枠・良い品の出やすさ）
      const B = { bias: A.def.bias, kinds: A.def.kinds }; // エリアの出やすい武器種・付きやすい特性
      if (isBoss) {
        items.push(makeItem(ilvl + 1, rollRarity(1, 2, ilvl, DR.rare), B));
        items.push(makeItem(ilvl + 1, rollRarity(1, 1, ilvl, DR.rare), B));
        if (Math.random() < 0.5) items.push(makeItem(ilvl, rollRarity(1, 0, ilvl, DR.rare), B));
      } else if (mob.named) {
        // ネームド: レア以上が必ず出る（エピック以上はアイテムレベルで出やすくなる）
        items.push(makeItem(ilvl + 2, rollRarity(1, 2, ilvl, DR.rare), B));
        items.push(makeItem(ilvl, rollRarity(0.6, 1, ilvl, DR.rare), B));
      } else if (sentinel) {
        items.push(makeItem(ilvl, rollRarity(SENTINEL_REWARD.rarity, 1, ilvl, DR.rare), B)); // 番兵: 必ず1つ、良い品が少し出やすい
      } else if (Math.random() < (mob.elite ? 0.6 : mob.kind === 'add' ? 0.08 : 0.34)) {
        items.push(makeItem(ilvl, rollRarity(mob.elite ? 0.25 : 0, mob.elite ? 1 : 0, ilvl, DR.rare), B));
      }
      // 武器の別枠（階層の drops.weapon）: 雑魚・精鋭がもう1つ、武器だけを落とすことがある
      if (DR.weapon && mob.kind === 'mob' && !mob.named && !sentinel && Math.random() < DR.weapon) items.push(makeItem(ilvl, rollRarity(0, 0, ilvl, DR.rare), { ...B, slot: 'weapon' }));
      if (items.length) {
        this.send(p, { t: 'loot', sx: r2(mob.x), sz: r2(mob.z), items: items.map((it) => ({ it, x: r2(mob.x + rnd(-1.6, 1.6)), z: r2(mob.z + rnd(-1.6, 1.6)) })) });
        for (const it of items) {
          if (it.rarity >= 5) this.sys(`★ ${p.name} が${RARITIES[it.rarity].name}「${it.name}」を手に入れた！`, RARITIES[it.rarity].color);
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
  },

  // 弾を撃つ（クライアントが同じ軌道で動かし、当たり判定やガードはクライアント側）
  shoot(A, b, x, z, ang, speed, r, life, dmg, color) {
    const pr = { id: this.seq++, src: b.id, x, z, vx: Math.sin(ang) * speed, vz: Math.cos(ang) * speed, r, life, dmg: Math.round(dmg) };
    A.projs.push(pr);
    this.broadcastArea(A.id, { t: 'proj', ...pr, c: color });
  },

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
  },

  tickMob(A, m, alive, dt) {
    const Ar = m.arch;
    m.cd -= dt; m.provoked -= dt; m.tauntT -= dt; m.openT -= dt;
    // 盾（番兵）: 攻撃中と、攻撃を出し切った直後の隙（openT）は下がる
    m.guard = !!Ar.guard && m.st < 2 && m.openT <= 0;
    if (m.st === 2) { // 予兆中
      m.windT -= dt;
      if (m.windT <= 0) { m.st = 3; m.windT = 0.35; }
      return;
    }
    if (m.st === 3) { m.windT -= dt; if (m.windT <= 0) { m.st = 0; if (Ar.guard) m.openT = SENTINEL_OPEN; } return; }

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
  },

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
  },

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
  },

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
  },

  mobAttack(A, m, target, ang) {
    const Ar = m.arch;
    const dmg = mobDmg(m.lv) * floorPressure(A.n) * attackPressure(m.scaleN) * Ar.dmg * (m.named ? NAMED.dmg : m.elite ? ELITE.dmg : 1);
    const wind = Math.max(0.42, Ar.wind * (m.elite ? 0.85 : 1) * 0.9);
    m.st = 2; m.windT = wind; m.cd = rnd(1.0, 1.8) + wind;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    const s = m.elite ? 1.3 : 1;
    // 種類ごとの攻撃の形は sim/mob-attacks.js の登録表（null なら自分で予兆を出し終えている）
    const kind = m.ai ?? m.t; // 動き方（番兵など）があればそちら
    const sh = (Object.hasOwn(MOB_ATTACKS, kind) ? MOB_ATTACKS[kind] : MOB_ATTACKS.default)(this, A, m, target, { ang, fx, fz, s, wind, dmg });
    if (sh) this.tele(A, m, sh, wind, dmg);
  },
};
