import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SKILLS } from '../public/js/skills.js';
import { WEAPON_KINDS, WEAPON_SKILL_POOL, starterWeapon, migrateItem } from '../public/shared/data.js';

test('retreat slash strikes before retreating and keeps facing the target', () => {
  for (const angle of [0, Math.PI / 2, -2]) {
    const calls = [], scheduled = [], me = { x: 4, z: 7, a: angle };
    const c = { me, aim: () => angle, col: () => 0xffffff,
      later: (at, fn) => scheduled.push({ at, fn }),
      arc: (...args) => calls.push(['arc', ...args]),
      dash: (...args) => { calls.push(['dash', ...args]);me.a = args[0]; },
      sfx: () => {}, fx: { slash: () => {}, parts: { burst: () => {} } } };
    WEAPON_SKILLS.retreat.run(c);
    assert.equal(calls.length, 0);
    assert.equal(scheduled[0].at, .06);scheduled[0].fn();
    assert.deepEqual(calls[0], ['arc', 3.4, 180, 2, { type: 'wskill', a: angle }]);
    assert.deepEqual(calls[1], ['dash', angle + Math.PI, 3.5, .22, .22]);
    assert.equal(me.a, angle);
  }
});

test('new sword skill joins the drop/crafting pool without replacing other weapon starters', () => {
  for (const kind of WEAPON_KINDS) {
    const it = starterWeapon(kind);
    assert.equal(it.skill, kind === 'sword' ? 'retreat' : WEAPON_SKILL_POOL[kind][0]);
    assert.ok(WEAPON_SKILL_POOL[kind].includes(it.skill));
    assert.equal(WEAPON_SKILLS[it.skill].kind, kind);
  }
  assert.equal(WEAPON_SKILL_POOL.sword.length, 5);
});

test('existing starter migrates once, retaining blacksmith choices and ordinary swords', () => {
  const old = { kind: 'sword', name: '初心者の片手剣', skill: 'vorpal', v: 2 };
  migrateItem(old);assert.equal(old.skill, 'retreat');
  old.skill = 'vorpal';migrateItem(old);assert.equal(old.skill, 'vorpal');
  const changed = { kind: 'sword', name: '初心者の片手剣', skill: 'square', v: 2 };
  migrateItem(changed);assert.equal(changed.skill, 'square');
  const drop = { kind: 'sword', name: '銅の片手剣', skill: 'vorpal', v: 2 };
  migrateItem(drop);assert.equal(drop.skill, 'vorpal');
  assert.equal(migrateItem(null), null);
});
