import * as THREE from 'three';

export const GRIP_Y = Object.freeze({ sword: -0.15, greatsword: -0.20, dagger: -0.08, spear: 0.45, axe: 0.15, bow: 0 });
const down = new THREE.Vector3(0, -1, 0);
const width = new THREE.Vector3(), shaft = new THREE.Vector3(), normal = new THREE.Vector3();
const basis = new THREE.Matrix4(), desired = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

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

function orientWeapon(u, yaw, pitch) {
  width.set(Math.cos(yaw), 0, -Math.sin(yaw));
  shaft.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  normal.crossVectors(width, shaft).normalize();
  desired.setFromRotationMatrix(basis.makeBasis(width, shaft, normal));
  const arm = u.wKind === 'bow' ? u.armL : u.armR;
  const elbow = u.wKind === 'bow' ? u.elbowL : u.elbowR;
  u.weapon.quaternion.copy(arm.quaternion).multiply(elbow.quaternion).invert().multiply(desired);
}

export function updateWeaponPose(u, s) {
  if (!u.weapon) return;
  const bow = u.wKind === 'bow';
  if (bow && !(s.down > 0)) {
    const active = s.charging || s.swing >= 0;
    const draw = s.charging ? clamp(s.charge ?? 1, 0, 1) : s.swing >= 0 ? 1 - clamp(s.swing / .25, 0, 1) : 0;
    const grip = new THREE.Vector3(-.10, active ? 1.36 : 1.03, active ? .52 : .36);
    aimHand(u.armL, u.elbowL, grip, new THREE.Vector3(-1, -.7, 0));
    const details = u.weaponModel.userData.bow;
    if (active && details) {
      const pull = .22 * draw;
      aimHand(u.armR, u.elbowR, new THREE.Vector3(grip.x, grip.y, grip.z + details.sx - pull), new THREE.Vector3(1, 0, -.7));
      const pos = details.string.geometry.attributes.position;pos.setX(1, details.sx - pull);pos.needsUpdate = true;
      details.arrow.visible = s.charging || s.swing < .15;
      details.arrow.position.x = details.sx - pull;
    } else if (details) {
      details.string.geometry.attributes.position.setX(1, details.sx);details.string.geometry.attributes.position.needsUpdate = true;
      details.arrow.visible = false;
    }
    // Bow limbs remain vertical; its model's -90 degree yaw puts the string toward the torso.
    const handOrientation = u.armL.quaternion.clone().multiply(u.elbowL.quaternion);
    u.weapon.quaternion.copy(handOrientation).invert();
    return;
  }

  if (s.down > 0) { u.weapon.rotation.set(Math.PI / 2, 0, 0); return; }
  if (u.wKind === 'spear') {
    const sweep = s.sweep >= 0;
    orientWeapon(u, sweep ? Math.PI / 2 : .04, sweep || s.swing >= 0 ? 0 : s.guard ? -.08 : .22);
    return;
  }

  const heavyWeapon = u.wKind === 'greatsword' || u.wKind === 'axe';
  const k = clamp(s.swing ?? -1, 0, 1), dir = (s.combo || 0) % 2 === 0 ? 1 : -1;
  let yaw = -.2, pitch = .25;
  if (s.swing >= 0) {
    const cut = k < .25 ? k / .25 : 1 - (k - .25) / .75 * .3;
    yaw = dir * (1.1 - cut * 2.2);pitch = .10;
  }
  if (s.spin >= 0) { yaw = Math.PI / 2;pitch = 0; }
  if (heavyWeapon) {
    const overhead = s.swing >= 0 && (s.heavy || s.combo === 2);
    if (overhead) { yaw = 0;pitch = k < .24 ? 1.25 + .25 * k / .24 : 1.5 - 1.7 * clamp((k - .24) / .45, 0, 1); }
    else if (!(s.swing >= 0) && !(s.spin >= 0)) pitch = .60;
    const y = overhead ? 1.15 + .53 * Math.sin(Math.PI * clamp(k / .7, 0, 1)) : 1.15;
    u.armR.position.z = 0;
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(-.04, y, overhead ? .22 : .34), new THREE.Vector3(1, -.6, -.2));
    const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, -.18), new THREE.Vector3(-1, -.6, -.2));
  }
  orientWeapon(u, yaw, pitch);
}
