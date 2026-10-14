import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WT_NODE, WT_SKILLS, ROW_REQ, PROF_MAX, profLevel, profOf, profNeed, gainProf, wtOf, wtSpent, wtLeft, wtCanLearn, wtLearn, wtChoose, wtEffects,
} from '../public/js/weapon-tree.js';
import { TREE_SKILLS, TREES } from '../public/js/skills.js';

const fresh = () => ({ lv: 1, tree: {}, prof: {}, wt: {} });

test('proficiency: one point per level, max 20, and other weapons start from half of the best', () => {
  const c = fresh();
  assert.equal(profLevel(c, 'sword'), 1);
  gainProf(c, 'greatsword', profNeed(1) - 1);
  assert.equal(profLevel(c, 'greatsword'), 1);
  gainProf(c, 'greatsword', 1);
  assert.equal(profLevel(c, 'greatsword'), 2);
  profOf(c, 'greatsword').lv = 14; c.profBest = 14;
  assert.equal(profLevel(c, 'sword'), 7, 'half of the best (14 → 7)');
  gainProf(c, 'sword', profNeed(7));
  assert.equal(profLevel(c, 'sword'), 8, 'grows from the carried level');
  for (let i = 0; i < 400; i++) gainProf(c, 'sword', 1e6);
  assert.equal(profLevel(c, 'sword'), PROF_MAX);
  assert.equal(wtLeft(c, 'sword'), PROF_MAX);
});

test('rows open at proficiency 1/3/6/9/12/16; keystones are exclusive and the second follows the first', () => {
  assert.deepEqual(ROW_REQ, [1, 3, 6, 9, 12, 16]);
  const c = fresh();
  profOf(c, 'sword').lv = 5;
  assert.ok(wtCanLearn(c, 'sw_aircut'));
  assert.ok(wtCanLearn(c, 'sw_norm'));
  assert.ok(!wtCanLearn(c, 'sw_mage'), 'upper class needs 6');
  profOf(c, 'sword').lv = 20;
  assert.ok(wtLearn(c, 'sw_mage'));
  assert.ok(!wtCanLearn(c, 'sw_glad'), 'only one upper class');
  assert.ok(!wtCanLearn(c, 'sw_saint'), 'second keystone must follow the first');
  assert.ok(wtLearn(c, 'sw_heaven'));
  assert.ok(!wtCanLearn(c, 'sw_phantom'));
  assert.equal(wtSpent(wtOf(c, 'sword')), 2);
});

test('skills and passives go to lv3, then choose A or B once; points are limited by proficiency', () => {
  const c = fresh();
  profOf(c, 'sword').lv = 3;
  assert.ok(wtLearn(c, 'sw_norm'));
  assert.ok(!wtChoose(c, 'sw_norm', 'A'), 'no branch before lv3');
  assert.ok(wtLearn(c, 'sw_norm') && wtLearn(c, 'sw_norm'));
  assert.ok(!wtLearn(c, 'sw_norm'), 'max lv3');
  assert.equal(wtLeft(c, 'sword'), 0);
  assert.ok(!wtCanLearn(c, 'sw_aircut'), 'no points left');
  assert.ok(wtChoose(c, 'sw_norm', 'A'));
  assert.ok(!wtChoose(c, 'sw_norm', 'B'), 'branch is fixed until reset');
  const E = wtEffects(c, 'sword');
  assert.equal(E.mods.normp, 20, 'lv3 keeps lv2 numbers');
  assert.equal(E.br('sw_norm'), 'A');
  assert.equal(wtEffects(c, 'bow'), null, 'other weapons keep the old tree');
});

test('lv1 is most of the value, lv2 grows, and the old sword tree is gone', () => {
  const c = fresh();
  profOf(c, 'sword').lv = 20;
  wtLearn(c, 'sw_edge');
  assert.equal(wtEffects(c, 'sword').mods.crit, 6);
  wtLearn(c, 'sw_edge');
  assert.equal(wtEffects(c, 'sword').mods.crit, 10);
  wtLearn(c, 'sw_mage');
  assert.equal(wtEffects(c, 'sword').mods.normp, -10, 'magic swordsman trades normal damage');
  assert.equal(TREES.sword, undefined);
  for (const id of Object.keys(WT_SKILLS)) assert.equal(TREE_SKILLS[id], WT_SKILLS[id]);
  for (const n of Object.values(WT_NODE)) if (n.kind === 'skill' || n.kind === 'passive') assert.ok(n.A?.name && n.B?.name, n.id);
});

function ctx(W) {
  const events = [], queue = [];
  let time = 0;
  const log = (m) => (...a) => events.push({ time, m, a });
  const c = {
    me: { x: 0, z: 0, a: 0 }, aim: () => 0, col: () => 0xffffff, wt: () => W,
    later: (d, fn) => queue.push({ at: time + d, fn }),
    fx: { slash: log('slash'), ringWave: log('ringWave'), parts: { emit: () => {}, burst: () => {} } },
    arc: log('arc'), line: log('line'), circle: log('circle'), proj: log('proj'), buff: log('buff'), dash: log('dash'), sfx: () => {}, parry: log('parry'),
  };
  return { c, events, run: () => { while (queue.length) { queue.sort((a, b) => a.at - b.at); const q = queue.shift(); time = q.at; q.fn(); } } };
}

test('sword skills scale with lv and change shape with the chosen branch', () => {
  const c = fresh();
  profOf(c, 'sword').lv = 20;
  const run = (id) => { const k = ctx(wtEffects(c, 'sword')); TREE_SKILLS[id].run(k.c); k.run(); return k.events; };
  wtLearn(c, 'sw_aircut');
  let ev = run('sw_aircut');
  assert.equal(ev.filter((e) => e.m === 'proj').length, 1);
  assert.equal(ev.find((e) => e.m === 'proj').a[0].mult, 2.8);
  wtLearn(c, 'sw_aircut'); wtLearn(c, 'sw_aircut'); wtChoose(c, 'sw_aircut', 'A');
  ev = run('sw_aircut');
  const p = ev.filter((e) => e.m === 'proj');
  assert.equal(p.length, 3, 'crescent: three waves');
  assert.ok(Math.abs(p[0].a[0].mult - 3.6 * 0.7) < 1e-9);
  assert.ok(TREE_SKILLS.sw_aircut.cdOf(wtEffects(c, 'sword')) < TREE_SKILLS.sw_aircut.cd);

  wtLearn(c, 'sw_slant'); wtLearn(c, 'sw_slant'); wtLearn(c, 'sw_slant'); wtChoose(c, 'sw_slant', 'B');
  ev = run('sw_slant');
  assert.equal(ev.filter((e) => e.m === 'arc').length, 3);
  assert.equal(ev.filter((e) => e.m === 'arc')[0].a[2], 2.6);
  assert.equal(ev.filter((e) => e.m === 'circle').length, 1, 'whirl: final spin');

  wtLearn(c, 'sw_brave');
  ev = run('sw_brave');
  assert.deepEqual(ev.find((e) => e.m === 'buff').a.slice(2, 4), [8, { atkp: 20, crit: 15 }]);
  wtLearn(c, 'sw_parry');
  ev = run('sw_parry');
  assert.deepEqual(ev.find((e) => e.m === 'parry').a, [0.4, 70]);
  assert.equal(ev.find((e) => e.m === 'line').a[2], 2.2);
});

test('greatsword: same tree shape, light-wave / one-blow / counter classes, and skills scale with lv', () => {
  const c = fresh();
  profOf(c, 'greatsword').lv = 20;
  assert.equal(TREES.greatsword, undefined, 'old greatsword tree is gone');
  assert.ok(wtLearn(c, 'gt_counter'));
  assert.ok(!wtCanLearn(c, 'gt_wave'), 'one class');
  assert.ok(!wtCanLearn(c, 'gt_judge'), 'master must follow the class');
  assert.ok(wtLearn(c, 'gt_iai'));
  wtLearn(c, 'gt_charge'); wtLearn(c, 'gt_charge');
  wtLearn(c, 'gt_break');
  const E = wtEffects(c, 'greatsword');
  assert.equal(E.mods.heavyp, 25, 'the old +20% heavy passive now lives in the tree');
  assert.equal(E.mods.stunp, 20);
  const run = (id) => { const k = ctx(wtEffects(c, 'greatsword')); k.c.shake = () => {}; k.c.primeCharge = (f) => k.events.push({ m: 'prime', a: [f] }); TREE_SKILLS[id].run(k.c); k.run(); return k.events; };
  wtLearn(c, 'gt_recoil'); wtLearn(c, 'gt_recoil'); wtLearn(c, 'gt_recoil'); wtChoose(c, 'gt_recoil', 'A');
  const waves = run('gt_recoil').filter((e) => e.m === 'proj');
  assert.equal(waves.length, 2, 'twin light waves');
  assert.ok(Math.abs(waves[0].a[0].mult - 6.4 * 0.7) < 1e-9);
  wtLearn(c, 'gt_slam'); wtLearn(c, 'gt_slam'); wtLearn(c, 'gt_slam'); wtChoose(c, 'gt_slam', 'B');
  const slam = run('gt_slam');
  assert.equal(slam.find((e) => e.m === 'circle').a[3], 6.5);
  assert.deepEqual(slam.find((e) => e.m === 'prime').a, [0.5], 'landing primes half a charge');
  wtLearn(c, 'gt_guillo');
  assert.equal(run('gt_guillo').find((e) => e.m === 'line').a[2], 6.5);
});

test('tree motions (sword counter, greatsword riposte, ground slam) are continuous, distinct and accepted by the server', async () => {
  const THREE = await import('three');
  const { TREE_MOTIONS } = await import('../public/shared/tree-motions.js');
  const { MOTION_DURATIONS } = await import('../public/shared/motion-catalog.js');
  const { sampleTechnique } = await import('../public/js/technique-motion.js');
  const { makePlayer, setPlayerWeapon, animatePlayer } = await import('../public/js/models.js');
  const base = { t: 1, moving: false, walkT: 0, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 };
  const sigs = new Set();
  for (const M of Object.values(TREE_MOTIONS)) {
    assert.equal(MOTION_DURATIONS[M.id], M.duration, 'server must accept the motion name');
    sigs.add(JSON.stringify(M.hits.map((h) => sampleTechnique(M.id, h))));
    const m = makePlayer('#448a9b'); setPlayerWeapon(m, M.kind, 3, 0); const u = m.userData;
    let prev;
    for (let time = 0; time <= M.duration; time += 0.005) {
      animatePlayer(m, { ...base, kind: M.kind, motion: M.id, motionT: time }); m.updateMatrixWorld(true);
      const hand = u.hand.getWorldPosition(new THREE.Vector3());
      assert.ok(hand.toArray().every(Number.isFinite), M.id);
      if (prev) assert.ok(hand.distanceTo(prev) < 0.25, `${M.id}: jump at ${time.toFixed(3)}`);
      prev = hand;
    }
  }
  assert.equal(sigs.size, Object.keys(TREE_MOTIONS).length, 'each motion has its own pose');
  assert.ok(sampleTechnique('gt_slam', 0.22).lift > 1, 'ground slam leaves the ground');
  assert.ok(sampleTechnique('gt_slam', TREE_MOTIONS.gt_slam.hits[0]).lift < 0.05, 'and lands on the hit');
});

test('dagger: poison / assassin / blades classes, base passives moved into the tree, skills scale and branch', () => {
  const c = fresh();
  profOf(c, 'dagger').lv = 20;
  assert.equal(TREES.dagger, undefined, 'old dagger tree is gone');
  wtLearn(c, 'dk_agile'); wtLearn(c, 'dk_agile'); wtLearn(c, 'dk_vitalp'); wtLearn(c, 'dk_vitalp'); wtLearn(c, 'dk_vitalp'); wtChoose(c, 'dk_vitalp', 'A');
  let E = wtEffects(c, 'dagger');
  assert.equal(E.mods.dodgecd, 25, 'the old -25% dodge cooldown now lives in 身軽');
  assert.equal(E.mods.critd, 35); assert.equal(E.mods.crit, 8);
  assert.ok(wtLearn(c, 'dk_venom')); assert.ok(!wtCanLearn(c, 'dk_assassin')); assert.ok(wtLearn(c, 'dk_burst'));
  const T0 = { id: 1, x: 0, z: 2, hp: 100, mhp: 100 };
  const run = (id) => {
    const k = ctx(wtEffects(c, 'dagger'));
    Object.assign(k.c, { nearest: () => T0, targets: () => [T0], hit: (...a) => k.events.push({ m: 'hit', a }), arrow: (...a) => k.events.push({ m: 'arrow', a }),
      poison: (...a) => k.events.push({ m: 'poison', a }), bleed: (...a) => k.events.push({ m: 'bleed', a }), ambush: (...a) => k.events.push({ m: 'ambush', a }), resetCd: () => {} });
    TREE_SKILLS[id].run(k.c); k.run(); return k.events;
  };
  wtLearn(c, 'dk_pin'); wtLearn(c, 'dk_pin'); wtLearn(c, 'dk_pin'); wtChoose(c, 'dk_pin', 'A');
  const knives = run('dk_pin').filter((e) => e.m === 'arrow');
  assert.equal(knives.length, 3, 'three knives');
  assert.ok(Math.abs(knives[0].a[0].mult - 3.4 * 0.7) < 1e-9);
  assert.equal(knives[0].a[0].tech, 'dagger_pin', 'keeps the shared slow');
  wtLearn(c, 'dk_bleed'); wtLearn(c, 'dk_bleed'); wtLearn(c, 'dk_bleed'); wtChoose(c, 'dk_bleed', 'A');
  const bl = run('dk_bleed');
  assert.equal(bl.filter((e) => e.m === 'hit').length, 2);
  assert.deepEqual(bl.find((e) => e.m === 'bleed').a.slice(1), [0.6, true], 'deep cuts stack');
  wtLearn(c, 'dk_smoke');
  assert.deepEqual(run('dk_smoke').find((e) => e.m === 'ambush').a, [3]);
  wtLearn(c, 'dk_vital');
  T0.hp = 40; assert.equal(run('dk_vital').find((e) => e.m === 'hit').a[1], 5.4, 'low-HP targets take the big hit');
});

test('spear: dragoon / reach / knight classes, the old -10% moved into 鉄壁の心得, skills scale and branch', () => {
  const c = fresh();
  profOf(c, 'spear').lv = 20;
  assert.equal(TREES.spear, undefined, 'old spear tree is gone');
  wtLearn(c, 'sp_iron'); wtLearn(c, 'sp_iron'); wtLearn(c, 'sp_iron'); wtChoose(c, 'sp_iron', 'B');
  let E = wtEffects(c, 'spear');
  assert.equal(E.mods.def, 10, 'the old -10% damage taken now lives in 鉄壁の心得');
  assert.equal(E.mods.hpp, 10);
  assert.ok(wtLearn(c, 'sp_dragoon')); assert.ok(!wtCanLearn(c, 'sp_knight'));
  assert.equal(wtEffects(c, 'spear').mods.aspd, 30, 'dragoon attacks faster');
  assert.ok(!wtCanLearn(c, 'sp_banner'), 'masters follow their class'); assert.ok(wtLearn(c, 'sp_fang'));
  const T0 = { id: 1, x: 0, z: 4, hp: 100, mhp: 100 };
  const run = (id) => {
    const k = ctx(wtEffects(c, 'spear'));
    Object.assign(k.c, { point: () => ({ x: 0, z: 4 }), taunt: (...a) => k.events.push({ m: 'taunt', a }), text: () => {}, shake: () => {} });
    k.c.fx.lightning = () => {};
    TREE_SKILLS[id].run(k.c); k.run(); return k.events;
  };
  wtLearn(c, 'sp_fan');
  assert.deepEqual(run('sp_fan').filter((e) => e.m === 'line').map((e) => e.a[2]), [1.3, 1.3, 1.3]);
  wtLearn(c, 'sp_fan'); wtLearn(c, 'sp_fan'); wtChoose(c, 'sp_fan', 'B');
  assert.ok(run('sp_fan').filter((e) => e.m === 'line').every((e) => e.a[0] === 7.5 && e.a[2] === 1.65), 'long fan reaches further');
  wtLearn(c, 'sp_stake'); wtLearn(c, 'sp_stake'); wtLearn(c, 'sp_stake'); wtChoose(c, 'sp_stake', 'A');
  const st = run('sp_stake').filter((e) => e.m === 'circle');
  assert.equal(st[0].a[3], 4.8); assert.equal(st.length, 7, 'thunder stake keeps striking');
  wtLearn(c, 'sp_taunt'); wtChoose(c, 'sp_taunt', 'B');
  assert.equal(wtEffects(c, 'spear').br('sp_taunt'), null, 'branch needs lv3');
  assert.equal(run('sp_taunt').find((e) => e.m === 'buff').a[3].dr, 30);
  for (const id of ['sp_fan', 'sp_sweep', 'sp_bash', 'sp_stake', 'sp_intercept', 'sp_taunt']) assert.ok(TREE_SKILLS[id], id);
});
