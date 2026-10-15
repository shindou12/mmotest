// Four silhouette-first greatsword shapes. All share the same +Y axis and existing
// hand anchors; only their mesh construction differs.
import * as THREE from 'three';
import { toon } from '../toon.js';
import { mesh, extrude } from './kit.js';

function add(k, geometry, material, position, rotation) {
  const part = mesh(geometry, material, position, rotation);
  k.g.add(part);
  return part;
}

function plate(k, points, depth, material, position) {
  return add(k, extrude(points, depth, 0.004), material, position);
}

function centerLine(k, length, z, color = 0xaeb9c6, width = 0.025) {
  add(k, new THREE.BoxGeometry(width, length, 0.008), toon(color), [0, 0.12 + length / 2, z]);
}

function hilt(k, length = 0.76, radius = 0.052) {
  k.handle(length, radius);
  // A pair of dark leather bands makes the two-handed grip read at game scale.
  const wrap = toon(0x725438);
  for (const y of [-0.18, -0.40]) add(k, new THREE.TorusGeometry(radius * 1.06, 0.009, 4, 10), wrap, [0, y, 0], [Math.PI / 2, 0, 0]);
}

function balanced(k) {
  const { g, steel, gold, gem, blade } = k;
  blade([[-0.22, 0], [0.22, 0], [0.30, 1.30], [0.22, 1.95], [0, 2.34], [-0.22, 1.95], [-0.30, 1.30]], 0.10);
  centerLine(k, 1.48, 0.056, 0xf0f0e8, 0.032);
  plate(k, [[-0.34, 0.14], [-0.29, 0.075], [-0.12, 0.09], [0, 0.115], [0.12, 0.09], [0.29, 0.075], [0.34, 0.14], [0.27, 0.19], [0.12, 0.17], [0, 0.19], [-0.12, 0.17], [-0.27, 0.19]], 0.12, gold);
  add(k, new THREE.CylinderGeometry(0.057, 0.057, 0.15, 8), steel, [0, 0.12, 0]);
  hilt(k, 0.76, 0.052);
  add(k, new THREE.OctahedronGeometry(0.078, 0), gem, [0, -0.73, 0], null, [0.8, 1.15, 0.8]);
  g.userData.appearance = 'greatsword-balanced';
}

function cleaver(k) {
  const { g, steel, gold, blade } = k;
  // Shorter, heavier slab with clipped shoulders and a broad squared cutting edge.
  blade([[-0.18, 0], [0.18, 0], [0.20, 1.18], [0.36, 1.43], [0.36, 1.73], [0.27, 1.86], [-0.27, 1.86], [-0.36, 1.73], [-0.36, 1.43], [-0.20, 1.18]], 0.14);
  add(k, new THREE.BoxGeometry(0.052, 1.14, 0.012), toon(0x9ca8b3), [0, 0.12 + 0.59, 0.073]);
  // A thick bolster and low, swept quillons emphasize the working-tool construction.
  add(k, extrude([[-0.32, 0.13], [-0.27, 0.065], [-0.11, 0.085], [0, 0.11], [0.11, 0.085], [0.27, 0.065], [0.32, 0.13], [0.26, 0.18], [0, 0.16]], 0.14, 0.004), gold);
  add(k, new THREE.BoxGeometry(0.22, 0.16, 0.16), gold, [0, -0.01, 0]);
  for (const side of [-1, 1]) add(k, new THREE.OctahedronGeometry(0.026, 0), steel, [side * 0.22, 1.68, 0.066], null, [1, 1, 0.45]);
  hilt(k, 0.72, 0.061);
  add(k, new THREE.BoxGeometry(0.17, 0.08, 0.15), gold, [0, -0.69, 0]);
  g.userData.appearance = 'greatsword-cleaver';
}

function zweihander(k) {
  const { g, steel, gold, blade } = k;
  blade([[-0.13, 0], [0.13, 0], [0.145, 1.6], [0.11, 2.25], [0, 2.68], [-0.11, 2.25], [-0.145, 1.6]], 0.07);
  centerLine(k, 1.75, 0.041, 0xaeb9c6, 0.019);
  // Long, slightly drooping parrying hooks are close to the guard rather than the blade tip.
  add(k, extrude([[-0.50, 0.35], [-0.45, 0.27], [-0.29, 0.31], [-0.14, 0.45], [-0.10, 0.56], [0.10, 0.56], [0.14, 0.45], [0.29, 0.31], [0.45, 0.27], [0.50, 0.35], [0.46, 0.43], [0.32, 0.41], [0.20, 0.55], [0.15, 0.64], [-0.15, 0.64], [-0.20, 0.55], [-0.32, 0.41], [-0.46, 0.43]], 0.095, 0.004), gold);
  add(k, new THREE.BoxGeometry(0.84, 0.07, 0.12), steel, [0, 0.105, 0]);
  hilt(k, 0.96, 0.045);
  add(k, new THREE.SphereGeometry(0.064, 8, 6), gold, [0, -0.93, 0], null, [0.82, 1.12, 0.82]);
  g.userData.appearance = 'greatsword-zweihander';
}

function flamberge(k) {
  const { g, steel, gold, gem, blade, glowM } = k;
  const length = 2.22, right = [], left = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18, y = t * length;
    const half = 0.145 + Math.sin(t * Math.PI * 8) * 0.035;
    right.push([half, y]);
    left.push([-half, y]);
  }
  blade([...right, [0, length + 0.17], ...left.reverse()], 0.085);
  // A subdued warm fuller follows the wavy blade; the silhouette remains the main read.
  const fuller = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; fuller.push([Math.sin(t * Math.PI * 8) * 0.027 - 0.014, 0.12 + t * length]); }
  for (let i = 1; i < fuller.length; i++) {
    const [x1, y1] = fuller[i - 1], [x2, y2] = fuller[i];
    add(k, new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), 0.012, 0.009), glowM(0.92), [(x1 + x2) / 2, (y1 + y2) / 2, 0.049], [0, 0, -Math.atan2(y2 - y1, x2 - x1)]);
  }
  add(k, extrude([[-0.29, 0.24], [-0.24, 0.12], [-0.10, 0.09], [0, 0.15], [0.10, 0.09], [0.24, 0.12], [0.29, 0.24], [0.20, 0.20], [0, 0.17], [-0.20, 0.20]], 0.11, 0.004), gold);
  for (const side of [-1, 1]) add(k, new THREE.TorusGeometry(0.09, 0.018, 5, 12, Math.PI), gold, [side * 0.22, 0.18, 0], [0, 0, side > 0 ? 0.4 : Math.PI - 0.4]);
  hilt(k, 0.78, 0.051);
  add(k, new THREE.OctahedronGeometry(0.075, 0), gem, [0, -0.75, 0], null, [0.78, 1.2, 0.78]);
  g.userData.appearance = 'greatsword-flamberge';
}

export const GREATSWORD_FORMS = Object.freeze({ balanced, cleaver, zweihander, flamberge });
