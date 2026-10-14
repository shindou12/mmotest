// Shared attack precedence; weapon-specific arm/torso poses are delegated (motions/index.js の登録表).
import { weaponMotion } from './motions/index.js';
export function applyAttackMotion(u, s, walk) {
  if (s.sweep >= 0) {
    u.body.rotation.y = s.sweep;
    u.armR.rotation.set(-0.15, 0, 1.25);u.armR.position.z = 0;
  } else if (s.swing >= 0) {
    const k = s.swing;
    const e = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.3;
    const dir = s.combo % 2 === 0 ? 1 : -1;
    weaponMotion(s.kind).swing(u, s, e, dir);
    weaponMotion(u.wKind).afterSwing?.(u);
  } else if (s.spin >= 0) {
    u.body.rotation.y = s.spin * Math.PI * 4;u.armR.rotation.set(-Math.PI / 2, 0, 0);
  } else {
    u.armR.rotation.set(walk * 0.4 - 0.25, 0, 0.12);u.armR.position.z = 0;u.body.rotation.y = 0;
    weaponMotion(u.wKind).rest?.(u);
  }
}
