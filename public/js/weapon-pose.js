import { applyTechniquePose } from './technique-motion.js';
// Wrist/weapon pose dispatch. Rig math and authored weapon motion live separately.
import { applyBowPose } from './motions/bow.js';
import { applySpearPose } from './motions/spear.js';
import { applyMeleePose } from './motions/melee.js';
export { GRIP_Y, aimHand } from './pose-rig.js';

export function updateWeaponPose(u, s) {
  if (!u.weapon) return;
  if (applyTechniquePose(u, s)) return;
  if (u.wKind === 'bow' && !(s.down > 0)) { applyBowPose(u, s);return; }
  if (s.down > 0) { u.weapon.rotation.set(Math.PI / 2, 0, 0);return; }
  if (u.wKind === 'spear') { applySpearPose(u, s);return; }
  applyMeleePose(u, s);
}
