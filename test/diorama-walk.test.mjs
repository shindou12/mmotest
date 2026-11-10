import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkState, stepWalk } from '../public/diorama/js/walk.js';

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
  for (let n = 0; n < 10; n++) landed ||= stepWalk(state, { x: 0, z: 0 }, 0.1, map).events.some((event) => event.type === 'land');
  assert.equal(state.y, 0);
  assert.ok(landed);
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
