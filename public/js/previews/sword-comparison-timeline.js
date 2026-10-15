import { WEAPONS } from '../../shared/data.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

export const CLIP_DURATION = 20;
export const SEQUENCE_DURATION = 8;
export const VIEWS = ['auto', 'detail', 'motion-study', 'game-close', 'game-default'];
export const SEQUENCES = ['auto', 'ready', 'combo', 'heavy', 'skill'];

// These are inputs to the existing animatePlayer, not new animation tracks.
export function sampleSequence(time, forced = 'auto') {
  const cycle = ((time % SEQUENCE_DURATION) + SEQUENCE_DURATION) % SEQUENCE_DURATION;
  const s = { t: time, moving: false, walkT: time, kind: 'sword', combo: 0, dead: false, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0, motion: '', motionT: 0, charging: false, charge: 0 };
  let name = forced, local = cycle;
  if (forced === 'auto') {
    if (cycle < 1) name = 'ready';
    else if (cycle < 3) { name = 'combo'; local -= 1; }
    else if (cycle < 5) { name = 'heavy'; local -= 3; }
    else if (cycle < 6.7) { name = 'skill'; local -= 5; }
    else name = 'ready';
  } else local = cycle % ({ combo: 2, heavy: 2, skill: 1.7, ready: 8 }[forced] || 8);
  let z = 0;
  if (name === 'combo') {
    // actions.doSwing uses WEAPONS.sword.speed and the third stroke is 1.25x longer.
    const third = WEAPONS.sword.speed * 1.25;
    const strokes = [[0, WEAPONS.sword.speed, 0], [.55, WEAPONS.sword.speed, 1], [1.1, third, 2]];
    for (const [at, duration, combo] of strokes) if (local >= at && local < at + duration) { s.swing = (local-at)/duration; s.combo = combo; break; }
  }
  if (name === 'heavy') {
    if (local < 1) { s.charging = true; s.charge = Math.min(1,local/.9); s.swing = local > .22 ? .02 : -1; }
    else if (local < 1.5) { s.combo = 2; s.swing = (local-1)/.5; }
  }
  if (name === 'skill') {
    const track = TREE_MOTIONS.sw_slant;
    if (local < track.duration) { s.motion = track.id; s.motionT = local; s.combo = 2; s.swing = local < .45 ? local/.45 : -1; }
    // Three existing 3m dashes (.1s at .0/.2/.4). Return to the starting mark between demonstrations.
    z = [0,.2,.4].reduce((distance,at) => distance + 3*Math.max(0,Math.min(1,(local-at)/.1)), 0);
  }
  return { pose: s, z, label: { ready:'READY',combo:'NORMAL COMBO / 3 HITS',heavy:'CHARGE + HEAVY',skill:'SLANT RUSH / Q-E SKILL' }[name] };
}

export function comparisonParams(state, width, height) {
  const time = Math.max(0,state.time), loop = time % CLIP_DURATION;
  const view = state.view === 'auto' ? loop < 4 ? 'detail' : loop < 12 ? 'motion-study' : loop < 16 ? 'game-close' : 'game-default' : state.view;
  const age = state.view === 'auto' ? Math.max(0,loop-4) : time;
  const action = sampleSequence(age,state.sequence);
  const zoom = view === 'game-close' ? .55 : 1;
  const pitch = .62 + (.92-.62) * ((zoom-.55)/(1.6-.55));
  return { time, width, height, view, pose: action.pose, z: action.z, phase: view === 'detail' ? 'SHAPE / SAME SCALE' : action.label,
    camera: view === 'motion-study' ? {fov:35,dist:8.4,pitch:.48,targetY:1.1} : { fov:50, dist:19.5*zoom, pitch, targetY:1.2 }, paused:state.mode!=='playing',capture:state.mode==='capture',
    viewLabel: view === 'detail' ? 'BLADE STUDY' : view === 'motion-study' ? 'MOTION STUDY / CLOSE-UP' : view === 'game-close' ? 'GAME CAMERA / CLOSEST ZOOM' : 'GAME CAMERA / DEFAULT ZOOM',
  };
}
