// Frozen comparison builders copied from the pre-refinement Greatsword registry.
import * as THREE from 'three';
import { cyl, sphere, cone, extrude, mesh } from '../kit.js';
import { toon } from '../../toon.js';

function base(k) {
  const { g, steel, gold, gem, edge, handle } = k;
  const w = 0.17, L = 2.2;
  const pts = [[-w, 0], [w, 0], [w * 1.1, L * 0.55], [w * 0.8, L - 0.35], [0, L], [-w * 0.8, L - 0.35], [-w * 1.1, L * 0.55]];
  edge(pts, 0.06);
  g.add(mesh(extrude(pts, 0.06), steel, [0, 0.12, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.7, 0.075), toon(0x9aa4b4), [0, 0.12 + L * 0.38, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.1, 0.14), gold, [0, 0.1, 0]));
  for (const s of [-1, 1]) g.add(mesh(cone(0.06, 0.22, 6), gold, [s * 0.45, 0.13, 0], [0, 0, -s * 1.3]));
  g.add(mesh(sphere(0.07, 10, 8), gem, [0, 0.1, 0.07]));
  handle(0.55, 0.045);
}
function cleaver(k) {
  const { g, gold, handle, blade } = k;
  blade([[-0.18, 0], [0.18, 0], [0.24, 1.8], [-0.05, 2.0], [-0.24, 1.75]], 0.07);
  g.add(mesh(cyl(0.05, 0.05, 0.08, 12), gold, [0.1, 1.6, 0], [Math.PI / 2, 0, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.16), gold, [0, 0.08, 0]));
  handle(0.6, 0.05);
}
function zweihander(k) {
  const { g, steel, gold, handle, blade } = k;
  blade([[-0.1, 0], [0.1, 0], [0.11, 2.1], [0, 2.45], [-0.11, 2.1]], 0.05);
  for (const s of [-1, 1]) g.add(mesh(cone(0.04, 0.2, 6), steel, [s * 0.16, 0.5, 0], [0, 0, -s * 1.57]));
  g.add(mesh(new THREE.BoxGeometry(0.95, 0.07, 0.1), gold, [0, 0.08, 0]));
  handle(0.75, 0.042);
}
function flamberge(k) {
  const { g, gold, gem, handle, glowM, blade } = k;
  const L = 2.3, pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([0.17 + Math.sin(t * 18) * 0.04 - t * 0.08, t * L]); }
  pts.push([0, L + 0.25]);
  for (let i = 12; i >= 0; i--) { const t = i / 12; pts.push([-(0.17 + Math.sin(t * 18 + 1) * 0.04 - t * 0.08), t * L]); }
  blade(pts, 0.06);
  g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.8, 0.08), glowM(1.4), [0, 0.12 + L * 0.42, 0]));
  g.add(mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16, Math.PI), gold, [0, 0.0, 0], [0, 0, Math.PI]));
  g.add(mesh(sphere(0.08, 10, 8), gem, [0, 0.1, 0.07]));
  handle(0.6, 0.048);
}

export const GREATSWORDBEFORE = Object.freeze({ base, cleaver, zweihander, flamberge });
