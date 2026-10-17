// 屋外の精鋭（性質＝アフィックスつき）とネームドの技。サーバーの World に混ぜる（sim.js が Object.assign）
//   精鋭: 屋外で湧くときに低い確率で選ばれ、手下を連れて出る。性質で戦い方が変わる（docs/design/elites-named.md）
//   ネームド: エリアで倒した数で「気配」が溜まり、満ちると巣で目を覚ます。固有の技を持つ
import { r2, dist, rnd, pick } from './common.js';
import { collide, insideOpen, namedSpot } from '../areas.js';
import { mobDmg } from '../data.js';
import { floorPressure, attackPressure } from '../balance.js';
import { ELITE, NAMED } from './tuning.js';

// 性質の一覧（並び順がビット番号。クライアントへはビットの和で送る）
export const AFFIXES = {
  swift: { name: '俊足', color: 0x7ae0ff },
  bulwark: { name: '鉄壁', color: 0xb8bcc8 },
  burning: { name: '炎の足跡', color: 0xff7a30 },
  thunder: { name: '雷鳴', color: 0xffe050 },
  splitter: { name: '分裂', color: 0x7aff7a },
  regen: { name: '再生', color: 0x9affc8 },
  rally: { name: '号令', color: 0xff4a4a },
  frenzy: { name: '狂化', color: 0xff3a8a },
};
export const AFFIX_IDS = Object.keys(AFFIXES);
export const affixMask = (ids) => ids.reduce((a, id) => a | (1 << AFFIX_IDS.indexOf(id)), 0);
export const affixesOf = (mask) => AFFIX_IDS.filter((_, i) => mask & (1 << i));
const NG = [['splitter', 'regen']]; // 一緒に付かない組み合わせ

// 出方と数値
export const ELITE_SPAWN = { chance: 0.06, hunt: 0.09, max: 2, escorts: 2, count: [[1, 1], [1, 2], [2, 3]], hpPerAffix: 0.2 };
export const AFFIX_TUNE = {
  swift: { speed: 1.5, cd: 0.75 }, bulwark: { taken: 0.6 }, burning: { every: 0.9, r: 1.6, delay: 1.0, dmg: 0.5 },
  thunder: { every: 6, r: 2.2, delay: 1.1, dmg: 0.8, range: 16, max: 3 }, splitter: { n: 3, hp: 0.15, speed: 1.4 },
  regen: { quiet: 3, rate: 0.03 }, rally: { r: 10, sec: 5, dmg: 1.25 }, frenzy: { at: 0.4, speed: 1.3, cd: 0.6 },
};
export const ELITE_REWARD = { xpPerAffix: 0.4, rarity: 0.25, rarityPerAffix: 0.15, second: 0.5 };
// ネームド: 気配（雑魚 1・精鋭 5）、目覚めたあと次に溜まり始めるまで
export const OMEN = { mob: 1, elite: 5, cooldown: 300 };

export function rollAffixes(floor, rand = Math.random) {
  const [lo, hi] = ELITE_SPAWN.count[Math.min(ELITE_SPAWN.count.length, Math.max(1, floor)) - 1];
  const n = lo + Math.floor(rand() * (hi - lo + 1)), out = [];
  for (let tries = 0; out.length < n && tries < 40; tries++) {
    const id = AFFIX_IDS[Math.floor(rand() * AFFIX_IDS.length)];
    if (out.includes(id) || NG.some(([a, b]) => (id === a && out.includes(b)) || (id === b && out.includes(a)))) continue;
    out.push(id);
  }
  return out;
}
export const has = (m, id) => !!m.affix && m.affix.includes(id);

export const ELITE_MIXIN = {
  // 精鋭の威力（普通の攻撃と同じ式。性質の追加攻撃に使う）
  mobPower(A, m) {
    return mobDmg(m.lv) * floorPressure(A.n) * attackPressure(m.scaleN) * m.arch.dmg * (m.named ? NAMED.dmg : m.elite ? ELITE.dmg : 1) * (m.rallyT > 0 ? AFFIX_TUNE.rally.dmg : 1);
  },
  // 屋外の湧きで精鋭を選ぶか（狩場は少し多い）。同時に max 体まで
  rollElite(A) {
    if (A.def.shape === 'grid') return false;
    const n = [...A.mobs.values()].filter((m) => m.affix).length;
    if (n >= ELITE_SPAWN.max) return false;
    return Math.random() < (A.def.type === 'hunt' ? ELITE_SPAWN.hunt : ELITE_SPAWN.chance);
  },
  // 精鋭を手下つきで湧かせる
  spawnElite(A, d, x, z, lv, affix = rollAffixes(A.n)) {
    const m = this.spawnMob(A, d, x, z, lv + 1, 'mob', true, 1 + ELITE_SPAWN.hpPerAffix * (affix.length - 1));
    m.affix = affix; m.aff = affixMask(affix);
    m.burnT = 0; m.thT = AFFIX_TUNE.thunder.every * 0.5; m.lastHitT = -1e9;
    for (let i = 0; i < ELITE_SPAWN.escorts; i++) {
      const a = i * Math.PI + rnd(-0.5, 0.5), ex = x + Math.sin(a) * 2.2, ez = z + Math.cos(a) * 2.2;
      if (insideOpen(A.def, ex, ez, 0.5)) this.spawnMob(A, d, ex, ez, lv);
    }
    const names = affix.map((id) => AFFIXES[id].name).join('・');
    this.sysArea(A.id, `精鋭〔${names}〕${m.name} が群れを率いて現れた`, '#ffc04a');
    return m;
  },
  // 性質ごとの毎フレームの動き（tickMob から）
  tickAffixes(A, m, alive, dt) {
    if (!m.affix) return;
    const T = AFFIX_TUNE;
    if (has(m, 'frenzy') && !m.enraged && m.hp < m.mhp * T.frenzy.at) {
      m.enraged = true;
      this.broadcastArea(A.id, { t: 'fx', k: 'enrage', id: m.id, x: r2(m.x), z: r2(m.z) });
    }
    if (has(m, 'regen') && this.time - m.lastHitT > T.regen.quiet && m.hp < m.mhp) m.hp = Math.min(m.mhp, m.hp + m.mhp * T.regen.rate * dt);
    if (m.rallyT > 0) m.rallyT -= dt;
    if (!m.target) return; // 以下は戦っているときだけ
    if (has(m, 'burning')) {
      m.burnT -= dt;
      const moved = Math.hypot(m.x - (m.lastX ?? m.x), m.z - (m.lastZ ?? m.z));
      if (m.burnT <= 0 && moved > 0.4) {
        m.burnT = T.burning.every;
        this.tele(A, m, [{ k: 'circle', x: r2(m.lastX), z: r2(m.lastZ), r: T.burning.r }], T.burning.delay, this.mobPower(A, m) * T.burning.dmg, '#ff7a30');
        m.lastX = m.x; m.lastZ = m.z;
      }
      if (m.lastX == null || moved > 1.5) { m.lastX = m.x; m.lastZ = m.z; }
    }
    if (has(m, 'thunder')) {
      m.thT -= dt;
      if (m.thT <= 0) {
        m.thT = T.thunder.every;
        const near = alive.filter((p) => dist(p, m) < T.thunder.range).slice(0, T.thunder.max);
        if (near.length) this.tele(A, m, near.map((p) => ({ k: 'circle', x: r2(p.x), z: r2(p.z), r: T.thunder.r })), T.thunder.delay, this.mobPower(A, m) * T.thunder.dmg, '#ffe050');
      }
    }
  },
  // 性質による移動の速さと攻撃の間隔
  affixSpeed(m) {
    let k = 1;
    if (has(m, 'swift')) k *= AFFIX_TUNE.swift.speed;
    if (has(m, 'frenzy') && m.enraged) k *= AFFIX_TUNE.frenzy.speed;
    if (m.spawnling) k *= AFFIX_TUNE.splitter.speed;
    return k;
  },
  affixCd(m) {
    let k = 1;
    if (has(m, 'swift')) k *= AFFIX_TUNE.swift.cd;
    if (has(m, 'frenzy') && m.enraged) k *= AFFIX_TUNE.frenzy.cd;
    return k;
  },
  // 号令: 攻撃するたび、周りの敵を奮い立たせて同じ相手へ向かわせる
  affixOnAttack(A, m, target) {
    if (!has(m, 'rally')) return;
    m.rallyT = AFFIX_TUNE.rally.sec;
    for (const o of A.mobs.values()) {
      if (o === m || o.kind !== 'mob' || dist(o, m) > AFFIX_TUNE.rally.r) continue;
      o.rallyT = AFFIX_TUNE.rally.sec;
      if (!o.target) this.addThreat(o, target.id, 1);
    }
  },
  // 鉄壁: 構えている間（攻撃の予兆中でない）は受けるダメージが減る
  affixTaken(m, dmg) {
    m.lastHitT = this.time;
    return has(m, 'bulwark') && m.st < 2 ? dmg * AFFIX_TUNE.bulwark.taken : dmg;
  },
  // 分裂: 倒されると小さな分身に分かれる（分身は報酬が少ない）
  affixOnDeath(A, m) {
    if (!has(m, 'splitter')) return;
    const T = AFFIX_TUNE.splitter;
    for (let i = 0; i < T.n; i++) {
      const a = i / T.n * Math.PI * 2, x = m.x + Math.sin(a) * 1.4, z = m.z + Math.cos(a) * 1.4;
      const c = collide(A.def, x, z, 0.6, A.door);
      const s = this.spawnMob(A, m.d, c.x, c.z, m.lv - 1, 'mob', false, T.hp * 3.2);
      s.spawnling = true;
      for (const [pid, v] of m.threat) s.threat.set(pid, v);
    }
  },

  // ---- ネームド ----
  // 気配: エリアで倒すと溜まる。満ちると巣で目を覚ます
  addOmen(A, mob) {
    const N = A.def.named;
    if (!N?.omen || mob.named || mob.spawnling || (A.namedId && A.mobs.has(A.namedId)) || this.time < (A.omenCd || 0)) return;
    A.omen = (A.omen || 0) + (mob.affix ? OMEN.elite : OMEN.mob);
    if (A.omen < N.omen) return;
    A.omen = 0;
    this.spawnNamed(A);
  },
  spawnNamed(A) {
    const N = A.def.named, sp = N.at ? { x: N.at[0], z: N.at[1] } : namedSpot(A.def);
    const mob = this.spawnMob(A, N.d, sp.x, sp.z, N.lv, 'mob', true);
    mob.named = true; mob.name = N.name; mob.moves = N.moves || [];
    mob.hp = mob.mhp = Math.round(mob.mhp / ELITE.hp * NAMED.hp);
    A.namedId = mob.id;
    this.sysArea(A.id, `地響きがする…「${N.name}」が目を覚ました`, '#ff8ae0');
    return mob;
  },
  // ネームドの技（普通の攻撃の何回かに1回。怒ると多く）。出したら true
  namedMove(A, m, target, ang) {
    if (!m.moves?.length) return false;
    if (!m.enraged && m.hp < m.mhp * 0.5) { m.enraged = true; this.sysArea(A.id, `「${m.name}」が怒り狂った！`, '#ff6a5a'); }
    m.moveN = (m.moveN || 0) + 1;
    if (m.moveN % (m.enraged ? 2 : 3) !== 0) return false;
    const id = pick(m.moves), f = NAMED_MOVES[id];
    if (!f) return false;
    f(this, A, m, target, ang, this.mobPower(A, m));
    return true;
  },
};

// ネームドの技。m.windT（予兆の長さ）と m.cd（次の攻撃まで）を決める
export const NAMED_MOVES = {
  // 突進: 長い直線の予兆のあと駆け抜ける
  charge(world, A, m, target, ang, dmg) {
    const len = 14, D = 1.1;
    world.tele(A, m, [{ k: 'line', x: r2(m.x), z: r2(m.z), a: r2(ang), len, w: 3 }], D, dmg * 1.4, '#ff6a4a', 1);
    world.later(A, D, () => {
      if (!A.mobs.has(m.id)) return;
      const end = collide(A.def, m.x + Math.sin(ang) * (len - 1), m.z + Math.cos(ang) * (len - 1), 0.8, A.door);
      m.x = end.x; m.z = end.z; m.a = ang;
    });
    m.st = 2; m.windT = D + 0.3; m.cd = 2.6;
  },
  // 地響き: 自分の周りから外へ広がる3重の輪（内→外の順に）
  quake(world, A, m, target, ang, dmg) {
    const rings = [[0, 3.5], [3.5, 7], [7, 10.5]];
    rings.forEach(([r0, r1], i) => world.later(A, i * 0.5, () => {
      if (A.mobs.has(m.id)) world.tele(A, m, [r0 ? { k: 'ring', x: r2(m.x), z: r2(m.z), r0, r1 } : { k: 'circle', x: r2(m.x), z: r2(m.z), r: r1 }], 0.9, dmg, '#ffb060');
    }));
    m.st = 2; m.windT = 0.9 + 1.0; m.cd = 3.0;
  },
  // 呼び声: 同じ種類の手下を3体呼ぶ
  call(world, A, m, target, ang, dmg) {
    world.sysArea(A.id, `「${m.name}」の呼び声が響く`, '#ffb27a');
    for (let i = 0; i < 3; i++) {
      const a = ang + Math.PI + (i - 1) * 0.9, x = m.x + Math.sin(a) * 4, z = m.z + Math.cos(a) * 4;
      if (!insideOpen(A.def, x, z, 0.5)) continue;
      const s = world.spawnMob(A, m.d, x, z, m.lv - 3);
      world.addThreat(s, target.id, 1);
    }
    m.st = 2; m.windT = 0.8; m.cd = 2.0;
    void dmg;
  },
  // 遠吠え: 呼び声＋しばらく速くなる
  howl(world, A, m, target, ang, dmg) {
    NAMED_MOVES.call(world, A, m, target, ang, dmg);
    m.rallyT = 6;
  },
  // 霧の牙: 周りの4方向へ扇（少しずらして2回）
  fangs(world, A, m, target, ang, dmg) {
    for (let k = 0; k < 2; k++) world.later(A, k * 0.6, () => {
      if (!A.mobs.has(m.id)) return;
      const base = ang + k * Math.PI / 4;
      world.tele(A, m, [0, 1, 2, 3].map((i) => ({ k: 'cone', x: r2(m.x), z: r2(m.z), a: r2(base + i * Math.PI / 2), arc: 0.9, len: 8 })), 0.8, dmg, '#9ad8ff');
    });
    m.st = 2; m.windT = 0.8 + 0.8; m.cd = 2.6;
  },
  // 岩落とし: 狙った人の周りに円を5つ
  rocks(world, A, m, target, ang, dmg) {
    const pts = [{ k: 'circle', x: r2(target.x), z: r2(target.z), r: 2.4 }];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + rnd(-0.4, 0.4), d = rnd(3.5, 5.5); pts.push({ k: 'circle', x: r2(target.x + Math.sin(a) * d), z: r2(target.z + Math.cos(a) * d), r: 2.2 }); }
    world.tele(A, m, pts, 1.2, dmg * 1.1, '#c8a070');
    m.st = 2; m.windT = 1.2; m.cd = 2.4;
  },
};
