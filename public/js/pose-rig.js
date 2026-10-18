import * as THREE from 'three';
import { WEAPONS, WEAPON_KINDS } from '../shared/data.js';

// 武器を握る位置は武器の表（shared/data.js の WEAPONS[kind].grip）
export const GRIP_Y = Object.freeze(Object.fromEntries(WEAPON_KINDS.map((k) => [k, WEAPONS[k].grip])));
const down = new THREE.Vector3(0, -1, 0);
const width = new THREE.Vector3(), shaft = new THREE.Vector3(), normal = new THREE.Vector3();
const basis = new THREE.Matrix4(), desired = new THREE.Quaternion();
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const ease = (k) => k * k * (3 - 2 * k);

// Two equal arm segments. Targets and orientations are expressed in body space.
export function aimHand(arm, elbow, goal, bend) {
  const direction = goal.clone().sub(arm.position);
  const distance = clamp(direction.length(), 0.03, 0.595);
  direction.normalize();
  const side = bend.clone().addScaledVector(direction, -bend.dot(direction));
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1).addScaledVector(direction, -direction.z);
  side.normalize();
  const joint = direction.clone().multiplyScalar(distance / 2).addScaledVector(side, Math.sqrt(0.3 ** 2 - (distance / 2) ** 2));
  const target = direction.clone().multiplyScalar(distance);
  arm.quaternion.setFromUnitVectors(down, joint.clone().normalize());
  const forearm = new THREE.Quaternion().setFromUnitVectors(down, target.clone().sub(joint).normalize());
  elbow.quaternion.copy(arm.quaternion).invert().multiply(forearm);
  return target.add(arm.position);
}

// roll: 刃の幅の向きを柄のまわりに回す（0: 幅が水平 / π/2: 幅が縦で、刃が前を向く）
export function orientWeapon(u, yaw, pitch, roll = 0) {
  width.set(Math.cos(yaw), 0, -Math.sin(yaw));
  shaft.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  normal.crossVectors(width, shaft).normalize();
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); width.multiplyScalar(c).addScaledVector(normal, s); normal.crossVectors(width, shaft).normalize(); }
  desired.setFromRotationMatrix(basis.makeBasis(width, shaft, normal));
  const offHand = !!WEAPONS[u.wKind]?.offHand;
  const arm = offHand ? u.armL : u.armR;
  const elbow = offHand ? u.elbowL : u.elbowR;
  u.weapon.quaternion.copy(arm.quaternion).multiply(elbow.quaternion).invert().multiply(desired);
}

