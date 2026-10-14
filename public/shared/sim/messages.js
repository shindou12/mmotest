// プレイヤーからのメッセージの処理。t（種類）ごとの登録表。メッセージの種類を足すときは、ここに関数を足す
// 引数: world（World）, p（送った人）, m（メッセージ）, A（その人のいるエリア）, id（送った人の id）
import { MOTION_DURATIONS } from '../motion-catalog.js';
import { REVIVE, reviveStep } from '../balance.js';
import { WEAPONS, MAX_FLOOR } from '../data.js';
import { AREAS, FLOOR_HUB, arrival, spawnPoint, waypointOf } from '../areas.js';

import { dist, HATE_ABSORB } from './common.js';

export const MESSAGES = {
  hello(world, p, m, A, id) {
    p.name = String(m.name || '名無し').slice(0, 16);
    p.color = String(m.color || '#4af').slice(0, 9);
    p.lv = m.lv | 0 || 1;
    p.joined = true;
    p.area = FLOOR_HUB[1];
    const sp = spawnPoint(AREAS[p.area]);
    p.x = sp.x; p.z = sp.z;
    world.area(p.area);
    world.send(p, { t: 'welcome', id, unlocked: world.unlocked, area: p.area, x: sp.x, z: sp.z });
    world.sys(`${p.name} が浮遊城エテルナに降り立った`);
  },
  st(world, p, m, A, id) {
    p.pm = typeof m.pm === 'string' && Object.hasOwn(MOTION_DURATIONS,m.pm) ? m.pm : '';
    p.pt = typeof m.pt === 'number' && Number.isFinite(m.pt) ? Math.max(0, Math.min(2, m.pt)) : 0;
    // wst: 武器の形 / arm: 防具の見た目 / rc: 被弾リアクション（1 のけぞり・2 ダウン）。他のプレイヤーにも同じに見せる
    for (const k of ['x', 'z', 'a', 'hp', 'mhp', 'lv', 'sw', 'sk', 'wr', 'dg', 'gd', 'wst', 'arm', 'rc', 'cl']) {
      if (typeof m[k] === 'number' && isFinite(m[k])) p[k] = m[k];
    }
    if (typeof m.wk === 'string') p.wk = m.wk;
    p.dead = !!m.dead;
  },
  hit(world, p, m, A, id) {
    const mob = A.mobs.get(m.id);
    if (!mob || mob.hp <= 0) return;
    const dmg = Math.max(0, Math.min(Number(m.dmg) || 0, 1e9));
    mob.hp -= dmg;
    world.applyTechniqueControl(A, p, mob, m.tech);
    // 盾槍はヘイトを稼ぎやすい
    world.addThreat(mob, p.id, dmg * (WEAPONS[p.wk]?.threat ?? 1));
    if (mob.kind !== 'boss') mob.provoked = 6;
    // スタン値（ボスのみ）
    if (mob.kind === 'boss' && mob.stunT <= 0 && mob.hp > 0) {
      mob.stun += Math.max(0, Math.min(Number(m.st) || 0, 60));
      if (mob.stun >= mob.stunMax) world.stunBoss(A, mob);
    }
    if (mob.hp <= 0) world.killMob(A, mob);
  },
  down(world, p, m, A, id) {
    // HPが0になって這いずり状態へ。n: 最近倒れた回数（キャラごとなのでクライアントが数える）
    if (p.dead || p.down) return;
    p.down = true; p.hp = 0;
    p.revStep = reviveStep(m.n);
    p.revMax = p.rev = REVIVE.base * REVIVE.mult[p.revStep];
    p.revHitAt = -1e9;
    for (const mob of A.mobs.values()) mob.threat?.delete(p.id);
    world.broadcastArea(A.id, { t: 'pdown', id: p.id, name: p.name });
    world.checkWipe(A, world.areaPlayers(A.id));
  },
  rev(world, p, m, A, id) {
    // 倒れている仲間に攻撃を当てた（v: その攻撃のスタン値）
    const q = world.players.get(m.id);
    if (!q || q === p || !q.down || q.area !== p.area || p.dead || p.down || dist(p, q) > REVIVE.range) return;
    q.rev -= Math.max(0, Math.min(Number(m.v) || 0, REVIVE.perHit));
    q.revHitAt = world.time;
    if (q.rev > 0) return;
    q.down = false; q.rev = 0;
    world.send(q, { t: 'revived', by: p.name });
    world.broadcastArea(A.id, { t: 'prev', id: q.id, by: p.id });
  },
  absorb(world, p, m, A, id) {
    // 狙われている本人がその敵の攻撃を受けた/防いだ → ヘイトのリセットまでの時間が少し延びる
    const mob = A.mobs.get(m.id);
    if (mob && mob.target === p.id) mob.hateT = Math.min(mob.hateMax, mob.hateT + HATE_ABSORB);
  },
  pblock(world, p, m, A, id) {
    // ガードで弾を消した
    const i = A.projs.findIndex((pr) => pr.id === m.id);
    if (i < 0) return;
    const pr = A.projs[i];
    A.projs.splice(i, 1);
    world.broadcastArea(A.id, { t: 'pgone', id: pr.id, by: p.id });
    const src = A.mobs.get(pr.src);
    if (src) { world.addThreat(src, p.id, pr.dmg * 3); if (src.target === p.id) src.hateT = Math.min(src.hateMax, src.hateT + HATE_ABSORB); }
  },
  threat(world, p, m, A, id) {
    const mob = A.mobs.get(m.id);
    if (mob) world.addThreat(mob, p.id, Math.max(0, Math.min(Number(m.n) || 0, 1e8)));
  },
  taunt(world, p, m, A, id) {
    const r = Math.min(20, Number(m.r) || 12);
    for (const mob of A.mobs.values()) {
      if (dist(mob, p) > r) continue;
      const top = Math.max(0, ...(mob.threat ? mob.threat.values() : [0]));
      world.addThreat(mob, p.id, top + 500 - (mob.threat?.get(p.id) || 0));
      mob.tauntBy = p.id; mob.tauntT = 6;
    }
  },
  warp(world, p, m, A, id) {
    const n = m.floor | 0;
    if (n < 1 || n > world.unlocked || n > MAX_FLOOR) return;
    world.movePlayer(p, FLOOR_HUB[n], spawnPoint(AREAS[FLOOR_HUB[n]]));
  },
  wp(world, p, m, A, id) {
    // ワープポイントへ飛ぶ（解放済みかどうかはキャラデータを持つクライアントが確かめる）
    const to = String(m.to || ''), def = AREAS[to];
    if (!def || def.floor > world.unlocked || p.dead) return;
    if (A.bossState === 'fight' && A.lair && dist(p, A.lair) < A.lair.r + 2) return; // ボス戦の最中は飛べない
    const w = waypointOf(def);
    world.movePlayer(p, to, { x: w.x, z: w.z + (def.shape === 'grid' ? 0 : 2.5) });
  },
  move(world, p, m, A, id) {
    const to = String(m.to || '');
    if (!A.def.exits.some((e) => e.to === to) || !AREAS[to]) return;
    if (AREAS[to].floor > world.unlocked) return;
    world.movePlayer(p, to, arrival(AREAS[to], A.id));
  },
  interact(world, p, m, A, id) {
    world.interact(A, p, String(m.what || ''), String(m.id || ''));
  },
  box(world, p, m, A, id) {
    world.boxOp(A, p, m);
  },
  chat(world, p, m, A, id) {
    const text = String(m.text || '').slice(0, 120);
    if (text) world.broadcast({ t: 'chat', from: p.name, text, color: p.color });
  },
};
