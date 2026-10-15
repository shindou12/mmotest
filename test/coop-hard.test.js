import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { BALANCE, enemyScale } from '../public/shared/balance.js';
import { mobHp, mobDmg, baseHp, xpToNext, floorLevel, bossLevel, MAX_FLOOR } from '../public/shared/data.js';
import { AREAS } from '../public/shared/areas.js';
import { QUESTS } from '../public/js/quests.js';

function party(count, area = 'f1_field') {
  const messages = new Map(), w = new World();
  for (let id = 1; id <= count; id++) {
    const inbox = []; messages.set(id, inbox);
    w.addPlayer(id, m => inbox.push(m));w.handle(id, { t: 'hello', name: `P${id}`, lv: 1 });
    const p = w.players.get(id);p.area = area;p.x = 0;p.z = 0;
  }
  return { w, messages, A: w.area(area) };
}

test('all three floors escalate; leveling no longer trivializes late enemies', () => {
  assert.deepEqual([1, 2, 3].map(floorLevel), [1, 9, 17]);
  assert.deepEqual([1, 2, 3].map(bossLevel), [8, 16, 24]);
  for (const lv of [1, 8, 16, 24]) {
    assert.ok(xpToNext(lv) > Math.round(30 * lv ** 1.55) * 2);
    assert.ok(mobDmg(lv) > 6 * 1.1 ** (lv - 1));
  }
  assert.ok(mobHp(24) / baseHp(24) > mobHp(1) / baseHp(1));
  assert.equal(QUESTS.find(q => q.id === 'q_slime').reward.xp, 108);
});

test('solo still uses the three-person baseline; five players scale regular enemies and bosses', () => {
  const solo = party(1), three = party(3), five = party(5);
  const s = solo.w.spawnMob(solo.A, 0, 0, 0, 3);
  const t = three.w.spawnMob(three.A, 0, 0, 0, 3);
  const f = five.w.spawnMob(five.A, 0, 0, 0, 3);
  assert.equal(s.mhp, t.mhp);assert.ok(f.mhp > t.mhp);
  const b3 = party(3, 'f1_lab'), b5 = party(5, 'f1_lab');
  const boss3 = b3.w.spawnBoss(b3.A), boss5 = b5.w.spawnBoss(b5.A);
  assert.ok(boss5.mhp > boss3.mhp);assert.ok(boss5.stunMax > boss3.stunMax);
});

test('late joins preserve damage progress and earned stun resistance; leaving never reduces difficulty', () => {
  const { w, A } = party(3, 'f1_lab');
  const b = w.spawnBoss(A);b.hp = Math.round(b.mhp * .4);
  w.stunBoss(A, b);const oldStunMax = b.stunMax, oldMax = b.mhp;
  w.scaleEncounter(A, b, 5);
  assert.ok(Math.abs(b.hp / b.mhp - .4) < .001);
  assert.ok(b.mhp > oldMax);assert.ok(b.stunMax > oldStunMax);
  const max = b.mhp, stun = b.stunMax;
  w.scaleEncounter(A, b, 1);assert.equal(b.mhp, max);assert.equal(b.stunMax, stun);
  assert.equal(b.stunT, 3);
});

test('rewards are shared nearby, exclude dead/remote players, and penalize outleveled farming', () => {
  const { w, A, messages } = party(5);
  w.players.get(2).dead = true;w.players.get(3).x = 100;
  w.players.get(4).lv = 20;
  const m = w.spawnMob(A, 0, 0, 0, 3);w.killMob(A, m);
  const xp = id => messages.get(id).filter(m => m.t === 'xp');
  assert.equal(xp(1).length, 1);assert.equal(xp(5).length, 1);
  assert.equal(xp(2).length, 0);assert.equal(xp(3).length, 0);
  assert.equal(xp(1)[0].n, xp(5)[0].n);assert.ok(xp(4)[0].n < xp(1)[0].n);
});

test('ordinary attacks keep readable windups and bosses enter late phases earlier', () => {
  const { w, A, messages } = party(3);
  const m = w.spawnMob(A, 2, 0, 0, 4);w.mobAttack(A, m, w.players.get(1), 0);
  const attack = messages.get(1).find(m => m.t === 'tele');
  assert.ok(attack.d >= 420);assert.ok(attack.dmg > 0);
  const B = w.area('f2_lab'), b = w.spawnBoss(B); // 1層（グラズ）は HPバー3本の専用ロジックなので、共通ロジックの2層で確かめる
  const p = w.players.get(1);p.area = B.id;p.x = B.lair.x;p.z = B.lair.z;
  b.hp = b.mhp * .64;w.tickBoss(B, b, [p], .01);assert.equal(b.phase, 2);
  b.hp = b.mhp * .34;w.tickBoss(B, b, [p], .01);assert.equal(b.phase, 3);
});

test('boss clears unlock floors in order and stop at floor three', () => {
  let saved;
  const { w } = party(3);w.onSave = data => { saved = data; };
  for (let floor = 1; floor <= MAX_FLOOR; floor++) {
    const A = w.area(`f${floor}_lab`), b = w.spawnBoss(A);w.killMob(A, b);
    assert.equal(w.unlocked, Math.min(MAX_FLOOR, floor + 1));
    assert.equal(A.bossState, 'cleared');
  }
  assert.equal(saved.unlocked, 3);
});

test('elite and named mobs are tougher without reducing per-player loot guarantees', () => {
  const { w, A } = party(3);
  const regular = w.spawnMob(A, 0, 0, 0, 5), elite = w.spawnMob(A, 0, 0, 0, 5, 'mob', true);
  assert.ok(elite.mhp > regular.mhp * 3);
  assert.ok(enemyScale(5, true) > enemyScale(3, true));
  assert.equal(BALANCE.potionHeal, .3);assert.equal(BALANCE.potionCooldown, 8);
});


test('boss stun thresholds use the original party formula and stun lasts three seconds', () => {
  for (const [count, expected] of [[1,200],[2,200],[3,200],[4,250],[5,300]]) {
    const {w,A}=party(count,'f1_lab');const boss=w.spawnBoss(A);
    assert.equal(boss.stunMax,expected);w.stunBoss(A,boss);
    assert.equal(boss.stunT,3);assert.equal(boss.stunMax,Math.round(expected*1.3));
  }
});
