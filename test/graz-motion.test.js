// グラズの技ごとの動き（models/bosses/graz-motion.js）と再生（models/boss-motion.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMob, animateMob } from '../public/js/models.js';
import { GRAZ_MOTIONS } from '../public/js/models/bosses/graz-motion.js';
import { FLOORS } from '../public/shared/data.js';
import { graz } from '../public/shared/sim/bosses/graz.js';

const boss = FLOORS[0].boss;
const make = () => makeMob(boss.t, boss.color, boss.scale, boss.accent, true, boss.appearance);

test('every move graz can use has an authored motion, plus the summon cast', () => {
  const moves = new Set([...boss.patterns, ...Object.keys(graz.moves), 'cast']);
  for (const p of moves) assert.ok(GRAZ_MOTIONS[p], p);
});

test('the overhead slam is raised before the hit and down right after it (hit at 1.1s)', () => {
  const m = make(), u = m.userData;
  animateMob(m, { t: 0, st: 2, act: { p: 'slam', age: 0.9, sp: 1 } });
  assert.ok(u.arm.rotation.x < -2.5);
  animateMob(m, { t: 0, st: 2, act: { p: 'slam', age: 1.15, sp: 1 } });
  assert.ok(u.arm.rotation.x > 0.4);
});

test('a finished or replaced motion returns graz to his stance and shows the sword again', () => {
  const m = make(), u = m.userData;
  const act = { p: 'throw', age: 1.3, sp: 1 };
  animateMob(m, { t: 0, st: 2, act });
  assert.equal(u.weaponModel.visible, false);
  act.age = 5; animateMob(m, { t: 0, st: 0, act });
  assert.equal(act.done, true); assert.equal(u.weaponModel.visible, true); assert.equal(u.body.position.y, 0);
  animateMob(m, { t: 0, st: 2, act: { p: 'cleave', age: 1.5, sp: 1 } });
  assert.ok(u.body.position.y < -0.2);
  animateMob(m, { t: 0, st: 4, act: null }); // スタンで取り消し
  assert.equal(u.body.position.y, 0);
});
