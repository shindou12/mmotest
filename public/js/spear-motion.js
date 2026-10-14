// Continuous, timed poses shared by the local player and network spectators.
import { SPEAR_TIMINGS, isSpinMotion } from '../shared/skill-timings.js';
export const SPEAR_MOTIONS = Object.freeze(Object.fromEntries(Object.entries(SPEAR_TIMINGS).map(([id, timing]) => [id, timing.duration])));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ease = x => { x = clamp(x, 0, 1);return x * x * (3 - 2 * x); };
function stroke(t, hit, end) {
  if (t <= hit) return ease(t / hit);
  return 1 - ease((t - hit) / (end - hit));
}
export function counterAngle(t) {
  const T = SPEAR_TIMINGS.counter;
  if (t < T.wind) return T.windAng * ease(t / T.wind);
  if (t < T.slashEnd) { const k = (t - T.wind) / T.slash;return T.windAng + (Math.PI * 2 - T.windAng) * (1 - (1 - k) ** 2); }
  return Math.PI * 2;
}
export function spearPose(s) {
  const id = s.motion || '', t = Math.max(0, s.motionT || 0);
  const p = { yaw: 0, pitch: .18, x: .32, y: 1.24, z: .24, lean: 0, step: 0 };
  if (s.sweep >= 0 || id === 'counter') {
    p.yaw = s.sweep >= 0 ? s.sweep : counterAngle(t);p.pitch = 0;p.x = .58;p.z = .03;p.y = 1.25;p.lateral = true;
    const rest = ease((t - SPEAR_TIMINGS.counter.slashEnd) / SPEAR_TIMINGS.counter.rest);p.x += (.32-p.x)*rest;p.z += (.24-p.z)*rest;p.side = 1-rest;p.pitch = .18*rest;return p;
  }
  if (isSpinMotion(id) || s.spin >= 0) {
    // 回す動きの時刻（spin の付いた動き。スキルの回転だけのときは whirl）と回数
    const timing = isSpinMotion(id) ? SPEAR_TIMINGS[id] : SPEAR_TIMINGS.whirl;
    const turns = timing.count ?? 1;
    const duration = timing.rotationDuration;
    const cycle = clamp(id ? t / duration * turns : s.spin * turns, 0, turns);
    p.yaw = Math.PI * 2 * (Math.floor(cycle) + ease(cycle % 1));
    p.pitch = 0;p.x = .58;p.z = .03;p.lateral = true;p.lean = .06;
    const rest = id ? ease((t - duration) / (timing.duration-duration)) : 0;p.x += (.32-p.x)*rest;p.z += (.24-p.z)*rest;p.lean *= 1-rest;p.pitch = .18*rest;p.side = 1-rest;return p;
  }
  let out = 0;
  if (id === 'helix') {
    const T = SPEAR_TIMINGS.helix;
    const i = clamp(Math.floor(t / T.interval), 0, T.count - 1), start = i * T.interval;
    out = stroke(t - start, T.hitAt, i === T.count - 1 ? T.finalRecovery : T.interval) * (i === T.count - 1 ? 1 : .65);
  } else if (id === 'piercer') {
    const T = SPEAR_TIMINGS.piercer;
    out = t < T.dashDuration ? 1 : 1 - ease((t - T.dashDuration) / T.recovery);
  } else if (id === 'javelin') {
    out = stroke(t, SPEAR_TIMINGS.javelin.hitAt, SPEAR_TIMINGS.javelin.duration);p.pitch = .18 * (1 - out);
  } else if (id === 'lance' || id === 'heavy') {
    out = stroke(t, SPEAR_TIMINGS[id].hitAt, SPEAR_TIMINGS[id].duration);
  } else if (s.charging || s.guard) {
    p.z = .14;p.pitch = 0;p.yaw = -.08;return p;
  } else if (s.swing >= 0) {
    out = stroke(s.swing, .18, 1);
  } else return p;
  p.z = .24 + .31 * out;p.y = 1.25;p.pitch = id === 'javelin' ? p.pitch : 0;
  p.yaw = .12 * out;p.lean = .08 * out;p.step = .24 * out;
  return p;
}
