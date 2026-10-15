import * as THREE from 'three';

export function mesh(geometry, material, position, rotation, scale) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  return m;
}
export function plate(points, depth = .06, bevel = .01) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x,y))), {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 2,
  });
  g.translate(0,0,-depth/2);
  return g;
}
// A tapered segment with local endpoints, suitable for roots, branches and legs.
export function segment(a, b, r0, r1, material, sides = 8) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
  const m = mesh(new THREE.CylinderGeometry(r1,r0,d.length(),sides),material);
  m.position.copy(from.add(to).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return m;
}
export function chain(group, points, radii, material) {
  for (let i=0;i<points.length-1;i++) group.add(segment(points[i],points[i+1],radii[i],radii[i+1],material));
}
// Twisted polygon rings create bark planes without texture maps.
export function trunk(rings, sides = 10) {
  const positions=[],indices=[];
  rings.forEach(([x,y,z,r,twist=0])=>{for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides+twist;positions.push(x+Math.sin(a)*r,y,z+Math.cos(a)*r);}});
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
  // End caps are explicit, so the static GLB remains a closed solid.
  const base=positions.length/3;positions.push(...rings[0].slice(0,3),...rings.at(-1).slice(0,3));
  for(let i=0;i<sides;i++){const next=(i+1)%sides;indices.push(base,next,i,base+1,(rings.length-1)*sides+i,(rings.length-1)*sides+next);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat;
}
