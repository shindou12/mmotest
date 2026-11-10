// 地形配列だけを使う歩行状態。描画・音声・ブラウザーには依存しない。
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const STEP_HEIGHT_SECONDS = 0.12;

function tileIndex(stage, i, k) {
  const [width, depth] = stage.size || [0, 0];
  if (i < 0 || k < 0 || i >= width || k >= depth) return -1;
  return k * width + i;
}

export function tileAt(stage, i, k) {
  const index = tileIndex(stage, i, k);
  if (index < 0 || !stage.height || stage.height[index] == null || stage.height[index] < 0) return null;
  if (stage.blocked?.[index]) return null;
  const materialIndex = stage.surface?.[index] ?? 0;
  return {
    i, k, index,
    height: Number(stage.height[index]) || 0,
    liquid: Number(stage.liquid?.[index] || 0),
    material: stage.materials?.[materialIndex] || 'grass',
  };
}

function spawnTile(stage) {
  const [spawnI = 0, spawnK = 0] = stage.spawn || [];
  const direct = tileAt(stage, spawnI, spawnK);
  if (direct) return direct;
  const [width, depth] = stage.size || [0, 0];
  const maxRadius = Math.max(width, depth);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let k = Math.max(0, spawnK - radius); k <= Math.min(depth - 1, spawnK + radius); k++) {
      for (let i = Math.max(0, spawnI - radius); i <= Math.min(width - 1, spawnI + radius); i++) {
        if (Math.max(Math.abs(i - spawnI), Math.abs(k - spawnK)) !== radius) continue;
        const found = tileAt(stage, i, k);
        if (found) return found;
      }
    }
  }
  return { i: 0, k: 0, index: 0, height: 0, liquid: 0, material: 'grass' };
}

export function createWalkState(stage) {
  const tile = spawnTile(stage);
  return {
    x: tile.i + 0.5,
    z: tile.k + 0.5,
    i: tile.i,
    k: tile.k,
    y: tile.height,
    targetY: tile.height,
    heightStartY: tile.height,
    heightTransitionElapsed: STEP_HEIGHT_SECONDS,
    jumpHeight: 0,
    jumpVelocity: 0,
    fallVelocity: 0,
    fallFromY: tile.height,
    velocityX: 0,
    velocityZ: 0,
    phase: 0,
    stepCount: 0,
    jumpHeld: false,
    facing: 0,
    spawn: { i: tile.i, k: tile.k, height: tile.height },
  };
}

function currentTile(stage, state) {
  return tileAt(stage, state.i, state.k) || { ...spawnTile(stage), i: state.i, k: state.k };
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function resetToSpawn(state, stage) {
  const tile = tileAt(stage, state.spawn.i, state.spawn.k) || spawnTile(stage);
  state.i = tile.i;
  state.k = tile.k;
  state.x = tile.i + 0.5;
  state.z = tile.k + 0.5;
  state.targetY = tile.height;
  state.y = tile.height;
  state.heightStartY = tile.height;
  state.heightTransitionElapsed = STEP_HEIGHT_SECONDS;
  state.fallVelocity = 0;
  state.jumpHeight = 0;
  state.jumpVelocity = 0;
  state.velocityX = 0;
  state.velocityZ = 0;
}

export function stepWalk(state, input, dt, stage) {
  const delta = clamp(Number(dt) || 0, 0, 0.25);
  const events = [];
  if (!delta) return { state, events, movedDistance: 0 };

  const fromTile = currentTile(stage, state);
  const desiredX = Number(input.x) || 0;
  const desiredZ = Number(input.z) || 0;
  const inputLength = Math.hypot(desiredX, desiredZ);
  const normX = inputLength > 1 ? desiredX / inputLength : desiredX;
  const normZ = inputLength > 1 ? desiredZ / inputLength : desiredZ;
  const onIce = fromTile.liquid === 3 || /ice/i.test(fromTile.material);
  const speed = 5.5;
  const acceleration = onIce ? 8 : 26;
  const drag = onIce ? 1.7 : 13;
  const targetVX = normX * speed;
  const targetVZ = normZ * speed;
  state.velocityX = approach(state.velocityX, targetVX, (inputLength ? acceleration : drag) * delta);
  state.velocityZ = approach(state.velocityZ, targetVZ, (inputLength ? acceleration : drag) * delta);

  const wantsJump = Boolean(input.jump);
  const grounded = state.jumpHeight <= 0.001 && Math.abs(state.jumpVelocity) < 0.001
    && Math.abs(state.y - state.targetY) < 0.015 && Math.abs(state.fallVelocity) < 0.01;
  if (wantsJump && !state.jumpHeld && grounded) {
    state.jumpVelocity = 6.6;
    events.push({ type: 'jump' });
  }
  state.jumpHeld = wantsJump;

  const moveX = state.velocityX * delta;
  const moveZ = state.velocityZ * delta;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveZ)) / 0.12));
  let movedDistance = 0;
  let returned = false;
  const attempt = (axis, amount) => {
    if (!amount || returned) return;
    const nextX = state.x + (axis === 'x' ? amount : 0);
    const nextZ = state.z + (axis === 'z' ? amount : 0);
    const nextI = Math.floor(nextX);
    const nextK = Math.floor(nextZ);
    if (nextI === state.i && nextK === state.k) {
      state.x = nextX;
      state.z = nextZ;
      return;
    }
    const nextTile = tileAt(stage, nextI, nextK);
    if (!nextTile) {
      const index = tileIndex(stage, nextI, nextK);
      if (index >= 0 && stage.height?.[index] < 0) {
        resetToSpawn(state, stage);
        events.push({ type: 'voidReturn' });
        returned = true;
      }
      if (axis === 'x') state.velocityX = 0;
      else state.velocityZ = 0;
      return;
    }
    if (nextTile.height - state.targetY > 1) {
      if (axis === 'x') state.velocityX = 0;
      else state.velocityZ = 0;
      return;
    }
    const oldTile = currentTile(stage, state);
    state.x = nextX;
    state.z = nextZ;
    state.i = nextI;
    state.k = nextK;
    if (nextTile.height !== state.targetY) {
      state.fallFromY = state.targetY;
      state.heightStartY = state.y;
      state.heightTransitionElapsed = 0;
    }
    state.targetY = nextTile.height;
    if (nextTile.liquid === 2) {
      resetToSpawn(state, stage);
      events.push({ type: 'lavaReturn' });
      returned = true;
      return;
    }
    if (oldTile.liquid !== 1 && nextTile.liquid === 1) {
      events.push({ type: 'waterEnter', material: nextTile.material });
    } else if (oldTile.liquid === 1 && nextTile.liquid !== 1) {
      events.push({ type: 'waterExit', material: nextTile.material });
    }
  };

  for (let index = 0; index < steps && !returned; index++) {
    const oldX = state.x;
    const oldZ = state.z;
    attempt('x', moveX / steps);
    attempt('z', moveZ / steps);
    movedDistance += Math.hypot(state.x - oldX, state.z - oldZ);
    // 角で一方だけ通れた距離を足し、衝突で止まった軸は速度も止める。
    if (oldX === state.x && moveX) state.velocityX = 0;
    if (oldZ === state.z && moveZ) state.velocityZ = 0;
  }

  const [width, depth] = stage.size || [0, 0];
  state.x = clamp(state.x, 0.001, Math.max(0.002, width - 0.001));
  state.z = clamp(state.z, 0.001, Math.max(0.002, depth - 0.001));

  const fallHeight = Math.max(state.heightStartY, state.fallFromY) - state.targetY;
  const oneStepDown = state.targetY < state.y && fallHeight < 2;
  if (state.targetY > state.y || oneStepDown) {
    state.heightTransitionElapsed = Math.min(STEP_HEIGHT_SECONDS, state.heightTransitionElapsed + delta);
    const progress = clamp(state.heightTransitionElapsed / STEP_HEIGHT_SECONDS, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    state.y = state.heightStartY + (state.targetY - state.heightStartY) * eased;
    state.fallVelocity = 0;
  } else if (state.targetY < state.y) {
    state.fallVelocity -= 18 * delta;
    const previousY = state.y;
    state.y = Math.max(state.targetY, state.y + state.fallVelocity * delta);
    if (state.y === state.targetY) {
      if (state.jumpHeight <= 0.001 && fallHeight >= 2) events.push({ type: 'land', fallHeight, material: currentTile(stage, state).material });
      state.fallVelocity = 0;
      state.heightStartY = state.targetY;
      state.heightTransitionElapsed = STEP_HEIGHT_SECONDS;
    } else if (state.y > previousY) {
      state.y = previousY;
    }
  } else {
    state.y = state.targetY;
    state.fallVelocity = 0;
    state.heightStartY = state.targetY;
    state.heightTransitionElapsed = STEP_HEIGHT_SECONDS;
  }

  const wasJumping = state.jumpHeight > 0;
  if (state.jumpHeight > 0 || state.jumpVelocity > 0) {
    state.jumpVelocity -= 17 * delta;
    state.jumpHeight = Math.max(0, state.jumpHeight + state.jumpVelocity * delta);
    if (state.jumpHeight === 0 && wasJumping) {
      events.push({ type: 'land', fallHeight: Math.max(0.5, state.fallFromY - state.targetY), material: currentTile(stage, state).material });
    }
  }

  if (movedDistance > 0.002 && state.jumpHeight === 0 && !returned) {
    const tile = currentTile(stage, state);
    const cycleLength = tile.liquid === 1 ? 2.1 : /snow/i.test(tile.material) ? 2.9 : 2.7;
    const oldPhase = state.phase;
    const phaseAdvance = movedDistance * Math.PI * 2 / cycleLength;
    const firstBeat = Math.floor(oldPhase / Math.PI);
    const totalPhase = oldPhase + phaseAdvance;
    const lastBeat = Math.floor(totalPhase / Math.PI);
    for (let beat = firstBeat + 1; beat <= lastBeat; beat++) {
      state.stepCount++;
      events.push({ type: 'footstep', material: tile.material, water: tile.liquid === 1, phase: state.stepCount % 2 });
    }
    state.phase = totalPhase % (Math.PI * 2);
    state.facing = Math.atan2(state.velocityX, state.velocityZ);
  }

  return { state, events, movedDistance };
}
