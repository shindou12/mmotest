// モデル作りの共通の道具（メッシュ・形・押し出し・仕上げ・弓の弦）
import * as THREE from 'three';
import { toon, compact, outline } from '../toon.js';

export function mesh(geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = true;
  return m;
}
export const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const capsule = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);
export const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const cyl = (r1, r2, h, seg = 14, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
export function extrude(pts, depth, bevel = 0.012) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export const finish = (root, w = 1) => { compact(root); outline(root, w); return root; };


export function bowString(g, tip, sx, color) {
  const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(sx, -tip, 0), new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx, tip, 0),
  ]), new THREE.LineBasicMaterial({ color }));
  g.add(string);
  const arrow = new THREE.Group();
  arrow.add(mesh(cyl(.008, .008, .72, 5), toon(0xd9c7a0), [.36, 0, 0], [0, 0, -Math.PI / 2]));
  arrow.add(mesh(cone(.025, .10, 5), toon(0xdfe7f0), [.76, 0, 0], [0, 0, -Math.PI / 2]));
  arrow.visible = false;g.add(arrow);
  g.userData.bow = { string, arrow, sx, tip };
}
