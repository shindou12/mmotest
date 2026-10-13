// Continuous, timed poses shared by the local player and network spectators.
export const SPEAR_MOTIONS = Object.freeze({ lance: .45, helix: .5, piercer: .5, javelin: .5, whirlspear: .55, whirl: .55, heavy: .5, counter: .95 });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ease = x => { x = clamp(x, 0, 1);return x * x * (3 - 2 * x); };
function stroke(t, hit, end) {
  if (t <= hit) return ease(t / hit);
  return 1 - ease((t - hit) / (end - hit));
}
export function counterAngle(t) {
  if (t < .45) return 1.9 * ease(t / .45);
  if (t < .77) { const k = (t - .45) / .32;return 1.9 + (Math.PI * 2 - 1.9) * (1 - (1 - k) ** 2); }
  return Math.PI * 2;
}
export function spearPose(s) {
  const id = s.motion || '', t = Math.max(0, s.motionT || 0);
  const p = { yaw: 0, pitch: .18, x: .32, y: 1.24, z: .24, lean: 0, step: 0 };
  if (s.sweep >= 0 || id === 'counter') {
    p.yaw = s.sweep >= 0 ? s.sweep : counterAngle(t);p.pitch = 0;p.x = .58;p.z = .03;p.y = 1.25;p.lateral = true;
    const rest = ease((t - .77) / .18);p.x += (.32-p.x)*rest;p.z += (.24-p.z)*rest;p.side = 1-rest;p.pitch = .18*rest;return p;
  }
  if (id === 'whirlspear' || id === 'whirl' || s.spin >= 0) {
    const turns = id === 'whirlspear' ? 3 : 1;
    const duration = id === 'whirlspear' ? .48 : .32;
    const cycle = clamp(id ? t / duration * turns : s.spin * turns, 0, turns);
    p.yaw = Math.PI * 2 * (Math.floor(cycle) + ease(cycle % 1));
    p.pitch = 0;p.x = .58;p.z = .03;p.lateral = true;p.lean = .06;
    const rest = id ? ease((t - duration) / (.55-duration)) : 0;p.x += (.32-p.x)*rest;p.z += (.24-p.z)*rest;p.lean *= 1-rest;p.pitch = .18*rest;p.side = 1-rest;return p;
  }
  let out = 0;
  if (id === 'helix') {
    const i = clamp(Math.floor(t / .08), 0, 4), start = i * .08;
    out = stroke(t - start, .06, i === 4 ? .18 : .08) * (i === 4 ? 1 : .65);
  } else if (id === 'piercer') {
    out = t < .22 ? 1 : 1 - ease((t - .22) / .28);
  } else if (id === 'javelin') {
    out = stroke(t, .18, .5);p.pitch = .18 * (1 - out);
  } else if (id === 'lance' || id === 'heavy') {
    out = stroke(t, id === 'lance' ? .12 : .1, id === 'lance' ? .45 : .5);
  } else if (s.charging || s.guard) {
    p.z = .14;p.pitch = 0;p.yaw = -.08;return p;
  } else if (s.swing >= 0) {
    out = stroke(s.swing, .18, 1);
  } else return p;
  p.z = .24 + .31 * out;p.y = 1.25;p.pitch = id === 'javelin' ? p.pitch : 0;
  p.yaw = .12 * out;p.lean = .08 * out;p.step = .24 * out;
  return p;
}
