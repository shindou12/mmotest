import * as THREE from 'three';
import { spearPose } from '../spear-motion.js';
import { aimHand, orientWeapon } from '../pose-rig.js';

export function applySpearPose(u, s) {
    const p = spearPose(s);
    u.armR.position.z = 0;
    u.body.rotation.y = p.yaw;
    if (!(s.dodge > 0) && !(s.hurt > 0)) u.body.rotation.x = p.lean;
    aimHand(u.armR, u.elbowR, new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(1, -.6, -.3));
    // Thrust stays on the aiming line while the torso turns; sweeps extend sideways.
    orientWeapon(u, p.lateral ? Math.PI / 2 * (p.side ?? 1) : -p.yaw, p.pitch);
    if (p.step) { u.legs[0].rotation.x = -p.step;u.legs[1].rotation.x = p.step; }
}

export function applySpearSwing(u) {
  u.armR.position.z = 0;u.body.rotation.y = 0;
}
