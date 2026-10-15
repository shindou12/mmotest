// Phase 1 candidates: descendants of the earlier slim/broad straight-sword study.
// Preview-only. The gameplay registry and saved equipment are not modified.
import * as THREE from 'three';
import { toon, compact, outline } from '../../toon.js';
import { GRIP_Y } from '../../pose-rig.js';

export const SWORD_CANDIDATES = Object.freeze({
  refined: Object.freeze({ label: 'A / Refined', width: .079, length: 1.30, shoulder: 1.04, guard: .47, grip: .039, depth: .028 }),
  bold: Object.freeze({ label: 'B / Bold', width: .119, length: 1.28, shoulder: .98, guard: .51, grip: .045, depth: .035 }),
});

export function makeSwordCandidate(variant = 'refined') {
  if (!Object.hasOwn(SWORD_CANDIDATES, variant)) throw new Error('Unknown sword candidate: ' + variant);
  const p = SWORD_CANDIDATES[variant], root = new THREE.Group();
  root.name = 'straight-sword-' + variant;
  const bladeColors = [0xdfe7f0,0xeaf0f6,0xb6c3d2].map(hex=>new THREE.Color(hex));
  const bronze = toon(0x9a7a4a), leather = toon(0x3a2418), wrap = toon(0x553a26);
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; root.add(m); return m;
  };
  const plate = (pts, depth, mat) => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(v => new THREE.Vector2(...v))), {
      depth, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: 2,
    });
    geo.translate(0, 0, -depth / 2); return add(geo, mat);
  };
  // Closed diamond section. Broad faces carry the material contrast; no floating edge strips.
  const cross = (y, width, depth) => [[-width, y, 0], [0, y, -depth], [width, y, 0], [0, y, depth]];
  const low = cross(.12, p.width, p.depth), high = cross(.12 + p.shoulder, p.width * .76, p.depth * .78);
  const tip = [0, .12 + p.length, 0], faces = [[], [], []];
  const tri = (a, b, c, mat) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c);
    const normal = B.clone().sub(A).cross(C.clone().sub(A)), center = A.clone().add(B).add(C);
    if (normal.x * center.x + normal.z * center.z < 0) [b, c] = [c, b];
    faces[mat].push(...a, ...b, ...c);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mat = [0, 1, 1, 2][i];
    tri(low[i], low[j], high[j], mat); tri(low[i], high[j], high[i], mat); tri(high[i], high[j], tip, mat);
  }
  faces[0].push(...low[0], ...low[1], ...low[2], ...low[0], ...low[2], ...low[3]);
  const blade = new THREE.BufferGeometry(), positions = faces.flat();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colors=[];faces.forEach((vertices,index)=>{for(let i=0;i<vertices.length/3;i++)colors.push(...bladeColors[index].toArray());});
  blade.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  blade.computeVertexNormals();
  add(blade, toon(0xffffff,{vertexColors:true}));

  const half = p.guard / 2;
  if (variant === 'refined') plate([[-half,.13],[-half+.016,.063],[-.10,.08],[0,.095],[.10,.08],[half-.016,.063],[half,.13],[.10,.139],[0,.15],[-.10,.139]], .062, bronze);
  else plate([[-half,.045],[half,.045],[half,.123],[half-.035,.15],[-half+.035,.15],[-half,.123]], .088, bronze);
  add(new THREE.CylinderGeometry(p.grip*.85,p.grip*.95,.09,8), bronze, [0,.085,0]);
  add(new THREE.CylinderGeometry(p.grip,p.grip*1.08,.38,8), leather, [0,-.14,0]);
  for (let i=0;i<3;i++) add(new THREE.TorusGeometry(p.grip*1.04,.007,4,10), wrap, [0,-.06-i*.09,0], [Math.PI/2,0,0]);
  for (const y of [.038,-.332]) add(new THREE.CylinderGeometry(p.grip*1.25,p.grip*1.25,.025,8), bronze, [0,y,0]);
  if (variant === 'refined') add(new THREE.SphereGeometry(.064,8,6), bronze, [0,-.382,0]);
  else add(new THREE.CylinderGeometry(.075,.075,.047,10), bronze, [0,-.388,0], [Math.PI/2,0,0]);
  root.userData = { kind: 'sword', variant, gripY: GRIP_Y.sword, previewOnly: true };
  compact(root); outline(root,.8); return root;
}
