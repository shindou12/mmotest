// Dedicated silhouettes for the existing Greatsword uniques. Their weapon stats and FX stay in shared data.
import * as THREE from 'three';
import { mesh, extrude } from './kit.js';
import { glow, toon } from '../toon.js';

function add(k, geometry, material, position = [0, 0, 0], rotation = null, scale = null) {
  const part = mesh(geometry, material, position, rotation, scale);
  k.g.add(part);
  return part;
}

function plate(k, points, depth, material, position = [0, 0, 0]) {
  return add(k, extrude(points, depth, 0.004), material, position);
}

function wrap(k, color, length = 0.9, radius = 0.05) {
  k.handle(length, radius);
  const leather = toon(color);
  for (const y of [-0.18, -0.42, -0.65]) {
    add(k, new THREE.TorusGeometry(radius * 1.07, 0.009, 4, 10), leather, [0, y, 0], [Math.PI / 2, 0, 0]);
  }
}

function excalibur(k) {
  const { g, steel, gold, gem, blade } = k;
  blade([[-0.18, 0], [0.18, 0], [0.24, 0.62], [0.22, 1.27], [0.17, 1.93], [0.08, 2.42], [0, 2.62], [-0.08, 2.42], [-0.17, 1.93], [-0.22, 1.27], [-0.24, 0.62]], 0.105, 0.12, steel);
  add(k, new THREE.BoxGeometry(0.025, 1.78, 0.012), toon(0xd3e6eb), [0, 1.04, 0.061]);
  const sunlight = toon(0xd3b56f);
  plate(k, [[-0.58, 0.18], [-0.51, 0.08], [-0.36, 0.14], [-0.20, 0.21], [0, 0.17], [0.20, 0.21], [0.36, 0.14], [0.51, 0.08], [0.58, 0.18], [0.48, 0.27], [0.31, 0.23], [0.14, 0.29], [0, 0.24], [-0.14, 0.29], [-0.31, 0.23], [-0.48, 0.27]], 0.12, gold);
  for (const side of [-1, 1]) {
    add(k, new THREE.OctahedronGeometry(0.045, 0), sunlight, [side * 0.43, 0.19, 0.085], null, [0.75, 1.2, 0.7]);
    add(k, new THREE.TorusGeometry(0.075, 0.012, 4, 12), gold, [side * 0.12, 0.19, 0.02], [0, 0, side * 0.25]);
  }
  add(k, new THREE.OctahedronGeometry(0.068, 0), glow(0x79c9e6), [0, 0.17, 0.095], null, [0.75, 1.2, 0.65]);
  wrap(k, 0x34475a, 0.92, 0.05);
  add(k, new THREE.OctahedronGeometry(0.09, 0), gold, [0, -0.83, 0.015], null, [0.8, 1.15, 0.75]);
  add(k, new THREE.OctahedronGeometry(0.035, 0), glow(0x79c9e6), [0, -0.83, 0.08]);
  g.userData.appearance = 'greatsword-excalibur';
}

function dainsleif(k) {
  const { g, steel, gold, blade } = k;
  const profile = [[-0.15, 0], [0.15, 0], [0.19, 0.48], [0.12, 0.60], [0.22, 0.76], [0.13, 0.88], [0.21, 1.06], [0.12, 1.18], [0.19, 1.36], [0.12, 1.52], [0.15, 1.96], [0.07, 2.30], [0, 2.48], [-0.10, 2.12], [-0.14, 1.40], [-0.16, 0.68]];
  blade(profile, 0.11, 0.12, steel);
  const blood = glow(0x9c2d3b), dark = toon(0x50404a);
  plate(k, [[-0.038, 0.25], [0.028, 0.49], [-0.012, 0.72], [0.05, 0.97], [0.004, 1.22], [0.04, 1.48], [-0.005, 1.76], [0.04, 2.08], [0, 2.32], [-0.045, 2.04], [-0.02, 1.78], [-0.052, 1.49], [-0.017, 1.22], [-0.058, 0.97], [-0.021, 0.72], [-0.062, 0.48]], 0.014, blood, [0, 0, 0.061]);
  plate(k, [[-0.43, 0.17], [-0.34, 0.08], [-0.21, 0.15], [-0.10, 0.23], [0, 0.18], [0.12, 0.10], [0.31, 0.07], [0.43, 0.16], [0.33, 0.25], [0.16, 0.20], [0.04, 0.27], [-0.11, 0.25], [-0.28, 0.22]], 0.13, dark);
  for (const side of [-1, 1]) add(k, new THREE.ConeGeometry(0.043, 0.17, 5), blood, [side * 0.33, 0.22, 0.025], [0, 0, side * 0.7]);
  wrap(k, 0x352d35, 0.92, 0.05);
  for (const y of [-0.14, -0.39, -0.64]) add(k, new THREE.TorusGeometry(0.056, 0.009, 4, 10), blood, [0, y, 0.015], [Math.PI / 2, 0, 0]);
  add(k, new THREE.ConeGeometry(0.075, 0.18, 6), dark, [0, -0.83, 0], [Math.PI, 0, 0]);
  add(k, new THREE.OctahedronGeometry(0.034, 0), gold, [0, 0.16, 0.09], null, [0.72, 1.4, 0.7]);
  g.userData.appearance = 'greatsword-dainsleif';
}

export const UNIQUE_GREATSWORDS = Object.freeze({ excalibur, dainsleif });
