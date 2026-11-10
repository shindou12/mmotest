import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkState, stepWalk } from '../public/diorama/js/walk.js';
import { getSurfaceSoundProfile, getSurfaceSoundSettings } from '../public/diorama/js/sfx.js';

function stage({ size = [4, 1], height, blocked, liquid, spawn = [0, 0], materials = ['grass'], surface } = {}) {
  return {
    size,
    height: height || Array(size[0] * size[1]).fill(0),
    blocked: blocked || Array(size[0] * size[1]).fill(0),
    liquid: liquid || Array(size[0] * size[1]).fill(0),
    surface: surface || Array(size[0] * size[1]).fill(0),
    materials,
    spawn,
  };
}

test('1 段上りは通れて、地面の高さをなめらかに追う', () => {
  const map = stage({ height: [0, 1, 2, 2] });
  const state = createWalkState(map);
  state.x = 0.95;
  const result = stepWalk(state, { x: 1, z: 0 }, 0.05, map);
  assert.equal(result.state.i, 1);
  assert.equal(result.state.targetY, 1);
  assert.ok(result.state.y > 0 && result.state.y < 1);
});

test('段の高さは 0.12 秒で滑らかに追う', () => {
  const map = stage({ height: [0, 1, 1, 1] });
  const state = createWalkState(map);
  state.x = 0.95;
  stepWalk(state, { x: 1, z: 0 }, 0.05, map);
  assert.ok(state.y > 0 && state.y < 1);
  stepWalk(state, { x: 1, z: 0 }, 0.07, map);
  assert.equal(state.y, 1);
});

test('2 段上の崖はジャンプを押しても越えない', () => {
  const map = stage({ height: [0, 0, 2, 2] });
  const state = createWalkState(map);
  state.x = 1.5;
  stepWalk(state, { x: 1, z: 0, jump: true }, 0.2, map);
  assert.equal(state.i, 1);
  assert.ok(state.x < 2);
});

test('ジャンプの頂点は約 1.3 段', () => {
  const map = stage();
  const state = createWalkState(map);
  let peak = 0;
  for (let n = 0; n < 40; n++) {
    stepWalk(state, { x: 0, z: 0, jump: n === 0 }, 1 / 60, map);
    peak = Math.max(peak, state.jumpHeight);
  }
  assert.ok(peak > 1.2 && peak <= 1.3, `jump height was ${peak}`);
});

test('低い地面へ下り、重力で落ちて着地する', () => {
  const map = stage({ height: [2, 2, 0, 0] });
  const state = createWalkState(map);
  state.x = 1.5;
  stepWalk(state, { x: 1, z: 0 }, 0.2, map);
  assert.equal(state.i, 2);
  assert.equal(state.targetY, 0);
  assert.ok(state.y > 0);
  let landed = false;
  for (let n = 0; n < 10; n++) {
    landed ||= stepWalk(state, { x: 0, z: 0 }, 0.1, map).events.some((event) => event.type === 'land' && event.fallHeight >= 2);
  }
  assert.equal(state.y, 0);
  assert.ok(landed);
});

test('1 段下りは滑らかに降り、着地音を出さない', () => {
  const map = stage({ height: [1, 0, 0, 0] });
  const state = createWalkState(map);
  state.x = 0.95;
  const first = stepWalk(state, { x: 1, z: 0 }, 0.05, map);
  assert.equal(state.targetY, 0);
  assert.ok(state.y > 0 && state.y < 1);
  assert.ok(!first.events.some((event) => event.type === 'land'));
  const rest = stepWalk(state, { x: 0, z: 0 }, 0.08, map);
  assert.equal(state.y, 0);
  assert.ok(!rest.events.some((event) => event.type === 'land'));
});

test('blocked と空のマスには入らない', () => {
  const blockedMap = stage({ size: [3, 1], blocked: [0, 1, 0] });
  const blockedState = createWalkState(blockedMap);
  stepWalk(blockedState, { x: 1, z: 0 }, 0.5, blockedMap);
  assert.equal(blockedState.i, 0);
  assert.ok(blockedState.x < 1);

  const voidMap = stage({ size: [3, 1], height: [0, -1, 0] });
  const voidState = createWalkState(voidMap);
  const result = stepWalk(voidState, { x: 1, z: 0 }, 0.5, voidMap);
  assert.equal(voidState.i, 0);
  assert.ok(voidState.x < 1);
  assert.ok(result.events.some((event) => event.type === 'voidReturn'));
});

test('溶岩へ入ると spawn に戻る', () => {
  const map = stage({ size: [3, 1], liquid: [0, 2, 0], spawn: [0, 0] });
  const state = createWalkState(map);
  const result = stepWalk(state, { x: 1, z: 0 }, 0.25, map);
  assert.equal(state.i, 0);
  assert.equal(state.x, 0.5);
  assert.ok(result.events.some((event) => event.type === 'lavaReturn'));
});

test('水へ入る音と水から出る音を分けて通知する', () => {
  const map = stage({ size: [3, 1], liquid: [0, 1, 0], spawn: [0, 0] });
  const state = createWalkState(map);
  state.x = 0.95;
  const entered = stepWalk(state, { x: 1, z: 0 }, 0.05, map);
  assert.ok(entered.events.some((event) => event.type === 'waterEnter'));

  state.x = 1.95;
  const exited = stepWalk(state, { x: 1, z: 0 }, 0.05, map);
  assert.ok(exited.events.some((event) => event.type === 'waterExit'));
});

test('材ごとの音設定を公開し、通常歩行は毎秒5.5マスで進む', () => {
  const settings = getSurfaceSoundSettings();
  for (const material of ['grass', 'dirt', 'sand', 'stone', 'snow', 'ice', 'wood', 'bark', 'water']) {
    assert.ok(settings[material], `${material} sound settings are missing`);
    assert.ok(settings[material].freq >= 60 && settings[material].freq <= 120, `${material} thump must stay in the 60–120 Hz range`);
    assert.ok(settings[material].high > 0 && settings[material].scrape > 0 && settings[material].duration > 0);
  }
  assert.ok(settings.sand.duration > settings.stone.duration);
  assert.ok(settings.snow.high < settings.grass.high);
  assert.deepEqual(getSurfaceSoundProfile('bark'), settings.bark);

  const map = stage({ size: [20, 1] });
  const state = createWalkState(map);
  const result = stepWalk(state, { x: 1, z: 0 }, 0.25, map);
  assert.equal(state.velocityX, 5.5);
  assert.ok(Math.abs(result.movedDistance - 1.375) < 1e-9);
});
