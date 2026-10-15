// Cosmetic hands share the existing palm anchor. They do not rotate rig bones.
import * as THREE from 'three';
import { toon } from '../toon.js';
import { mesh, finish } from './kit.js';

export function makeSwordHand() {
  const g=new THREE.Group();g.name='sword-gripping-hand';
  const glove=toon(0x293039),seam=toon(0x19232b),plate=toon(0xc2ced8);
  // +Y follows the hilt. The closed fingers wrap it, with the back of the hand on -Z.
  g.add(mesh(new THREE.SphereGeometry(.055,8,6),glove));
  g.add(mesh(new THREE.SphereGeometry(.058,8,6),glove,[0,0,-.041],null,[1,1.25,.65]));
  for(const y of [-.045,-.015,.015,.045]) {
    g.add(mesh(new THREE.TorusGeometry(.051,.016,4,9,Math.PI*1.6),glove,[0,y,0],[Math.PI/2,0,-Math.PI*.3]));
  }
  g.add(mesh(new THREE.CapsuleGeometry(.024,.055,2,6),glove,[.049,.035,.013],[.85,0,-.45]));
  g.add(mesh(new THREE.BoxGeometry(.069,.063,.014),plate,[0,.003,-.082]));
  g.add(mesh(new THREE.BoxGeometry(.055,.008,.014),seam,[0,-.047,-.077]));
  return finish(g,.85);
}

export function setGripHand(u,builder) {
  const active=typeof builder==='function';
  if(active&&!u.gripHand) {
    u.gripDefaultParts=u.hand.children.filter(c=>c!==u.weapon);
    u.gripHand=builder();u.hand.add(u.gripHand);
  }
  if(u.gripHand)u.gripHand.visible=active;
  for(const part of u.gripDefaultParts||[])part.visible=!active;
}

export function alignGripHand(u) {
  // Both are children of the same palm, so the same quaternion aligns their axes.
  if(u.gripHand?.visible&&u.weapon)u.gripHand.quaternion.copy(u.weapon.quaternion);
}
