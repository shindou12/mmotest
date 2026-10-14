// Wrist/weapon pose dispatch. Rig math and authored weapon motion live separately.
// 武器ごとの構えは motions/index.js の登録表から選ぶ（技の最中は技の姿勢、ダウン中は武器を寝かせる）
import { applyTechniquePose } from './technique-motion.js';
import { weaponMotion } from './motions/index.js';
export { GRIP_Y, aimHand } from './pose-rig.js';

export function updateWeaponPose(u, s) {
  if (!u.weapon) return;
  if (applyTechniquePose(u, s)) return;
  if (s.down > 0) { u.weapon.rotation.set(Math.PI / 2, 0, 0);return; }
  weaponMotion(u.wKind).pose(u, s);
}
