// Grasz: a canine kobold king. Geometry only; makeMob owns the shared finish
// and animateMob continues to drive the established body/arm/leg/cape pivots.
import * as THREE from 'three';
import { toon, glow } from './toon.js';

function mesh(geometry, material, position, rotation, scale) {
  const part = new THREE.Mesh(geometry, material);
  if (position) part.position.set(...position);
  if (rotation) part.rotation.set(...rotation);
  if (scale) part.scale.set(...scale);
  part.castShadow = true;
  return part;
}
function shape(points, depth = .06, bevel = .012) {
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
const sphere = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const cylinder = (top, bottom, height, segments = 10) => new THREE.CylinderGeometry(top, bottom, height, segments);
const capsule = (r, height) => new THREE.CapsuleGeometry(r, height, 3, 8);
const lathe = points => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 12);

function royalCleaver(M) {
  const sword = new THREE.Group(); sword.name = 'graz-royal-cleaver';
  // Broad steel blade with a deliberate nick, a raised spine and a pale edge.
  const blade = [[-.14,.24],[.17,.24],[.23,1.7],[.17,1.82],[.21,1.91],[.14,2.05],[-.08,2.18],[-.22,1.88],[-.20,.55]];
  sword.add(mesh(shape(blade,.095,.012),M.steel));
  sword.add(mesh(shape([[-.14,.29],[-.08,.29],[-.11,1.84],[-.075,2.12],[-.19,1.86]],.106,.004),M.edge));
  sword.add(mesh(shape([[-.015,.4],[.055,.4],[.08,1.74],[.03,1.95],[-.035,1.75]],.112,.004),M.iron));
  sword.add(mesh(shape([[-.39,.16],[-.31,.26],[-.10,.22],[0,.30],[.12,.22],[.36,.21],[.40,.12],[.13,.12],[0,.19],[-.12,.12]],.14),M.gold));
  sword.add(mesh(cylinder(.058,.064,.32),M.leather,[0,-.005,0]));
  for (const y of [-.11,0,.11]) sword.add(mesh(cylinder(.065,.065,.025),M.iron,[0,y,0]));
  sword.add(mesh(new THREE.OctahedronGeometry(.095),M.gold,[0,-.22,0],null,[1,1.2,1]));
  sword.add(mesh(new THREE.OctahedronGeometry(.065),M.amber,[0,.205,.096],null,[.85,1.2,.45]));
  return sword;
}

function kingShield(M) {
  const shield = new THREE.Group(); shield.name = 'graz-king-shield';
  const rim = [[-.37,.40],[-.23,.54],[.23,.54],[.39,.37],[.34,-.30],[0,-.69],[-.34,-.30]];
  shield.add(mesh(shape(rim,.105,.014),M.gold));
  shield.add(mesh(shape(rim.map(([x,y])=>[x*.88,y*.88]),.115,.008),M.iron,[0,0,.013]));
  shield.add(mesh(shape([[-.15,.39],[.15,.39],[.15,-.30],[0,-.52],[-.15,-.30]],.04,.006),M.red,[0,0,.093]));
  // A simple canine crown emblem; it remains readable at the game camera scale.
  shield.add(mesh(shape([[-.19,.17],[-.18,.33],[-.085,.24],[0,.39],[.085,.24],[.18,.33],[.19,.17]],.038,.003),M.gold,[0,0,.13]));
  shield.add(mesh(shape([[-.13,.10],[0,.15],[.13,.10],[.09,-.035],[0,-.12],[-.09,-.035]],.055,.008),M.gold,[0,0,.13]));
  for (const x of [-.25,.25]) for (const y of [-.18,.32]) shield.add(mesh(sphere(.034,8,6),M.edge,[x,y,.105],null,[1,1,.45]));
  return shield;
}

export function buildGraz(body, accent) {
  const M = {
    fur: toon(0x986348), furLight: toon(0xc6976d), furDark: toon(0x613f32),
    iron: toon(0x35444c), steel: toon(0x667681), edge: toon(0xc3d3d8),
    gold: toon(0xd9aa50), leather: toon(0x47352e), red: toon(0x953749),
    ivory: toon(0xe5d5b4), black: toon(0x231e23), ear: toon(0x6c3c3a),
    amber: glow(new THREE.Color(accent).multiplyScalar(1.3)),
  };
  body.name = 'graz-body';
  const parts = { identity: 'graz' };
  // Compact, broad torso, with separate metal, fur and leather planes.
  body.add(mesh(lathe([[0,.94],[.33,.97],[.43,1.13],[.48,1.40],[.44,1.62],[.30,1.76],[0,1.78]]),M.iron));
  const breastplate = [[-.35,.99],[-.44,1.32],[-.37,1.60],[-.16,1.70],[0,1.62],[.16,1.70],[.37,1.60],[.44,1.32],[.35,.99]];
  body.add(mesh(shape(breastplate,.09,.02),M.steel,[0,0,.39]));
  body.add(mesh(shape([[-.27,1.45],[0,1.57],[.27,1.45],[.20,1.31],[0,1.38],[-.20,1.31]],.04,.006),M.gold,[0,0,.455]));
  body.add(mesh(shape([[-.045,1.12],[.045,1.12],[.07,1.38],[0,1.47],[-.07,1.38]],.035,.004),M.iron,[0,0,.455]));
  body.add(mesh(cylinder(.41,.39,.11,12),M.leather,[0,1.01,0]));
  body.add(mesh(shape([[-.10,-.07],[.10,-.07],[.10,.07],[-.10,.07]],.045),M.gold,[0,1.015,.42]));
  body.add(mesh(new THREE.BoxGeometry(.095,.065,.05),M.leather,[0,1.015,.457]));
  // Short split armor skirt exposes the legs; plates do not move the leg roots.
  for (const s of [-1,1]) {
    body.add(mesh(shape([[-.15,.16],[.15,.16],[.19,-.23],[-.12,-.27]],.08),M.iron,[s*.24,.79,.28],[.12,0,-s*.14]));
    body.add(mesh(shape([[-.12,-.19],[.16,-.16],[.16,-.12],[-.12,-.15]],.028,.003),M.gold,[s*.24,.79,.337],[.12,0,-s*.14]));
  }
  body.add(mesh(shape([[-.13,.18],[.13,.18],[.12,-.43],[0,-.52],[-.12,-.43]],.03,.003),M.red,[0,.76,.39]));

  const head = new THREE.Group(); head.name = 'graz-head'; head.position.set(0,2,0); body.add(head);
  head.add(mesh(sphere(.34),M.fur,[0,.08,0],null,[1.05,1.02,.88]));
  head.add(mesh(sphere(.255),M.furLight,[0,-.10,.31],null,[1.08,.65,1.1]));
  head.add(mesh(sphere(.15),M.furDark,[0,-.21,.20],null,[1.2,.45,1.15]));
  head.add(mesh(sphere(.095,10,6),M.black,[0,-.065,.535],null,[1.2,.64,.6]));
  head.add(mesh(shape([[-.14,0],[0,-.035],[.14,0],[.10,-.05],[0,-.07],[-.10,-.05]],.018,.002),M.black,[0,-.17,.485]));
  for (const s of [-1,1]) {
    // Tall canine ears and cheek tufts, rather than a faceless horned helmet.
    head.add(mesh(shape([[-.11,-.12],[.105,-.12],[.05,.37],[-.095,.15]],.09,.012),M.fur,[s*.27,.30,-.035],[0,0,-s*.27]));
    head.add(mesh(shape([[-.058,-.04],[.057,-.04],[.026,.25]],.02,.002),M.ear,[s*.27,.30,.025],[0,0,-s*.27]));
    head.add(mesh(shape([[-.02,.09],[.15,.02],[.13,-.11],[.04,-.22],[-.07,-.09]].map(([x,y])=>[s*x,y]),.075,.008),M.furDark,[s*.25,-.015,.12],[0,s*.35,0]));
    head.add(mesh(shape([[-.075,-.035],[.06,-.015],[.07,.055],[-.07,.02]].map(([x,y])=>[s*x,y]),.025,.003),M.black,[s*.17,.072,.276],[0,s*.28,0]));
    head.add(mesh(shape([[-.045,-.020],[.044,-.013],[.048,.024],[-.042,.005]].map(([x,y])=>[s*x,y]),.027,.001),M.amber,[s*.17,.072,.294],[0,s*.28,0]));
    head.add(mesh(new THREE.ConeGeometry(.028,.105,6),M.ivory,[s*.115,-.205,.535],[Math.PI,0,s*.17]));
  }
  // Open brass crown leaves the ears visible. Three prominent front points.
  const crown = new THREE.Group(); crown.name = 'graz-crown'; crown.position.set(0,.325,0); head.add(crown);
  crown.add(mesh(new THREE.CylinderGeometry(.258,.272,.115,12,1,true),M.gold));
  for (let i=0;i<5;i++) {
    const a=i*Math.PI*2/5, x=Math.sin(a)*.25, z=Math.cos(a)*.25;
    crown.add(mesh(shape([[-.060,0],[.060,0],[.028,.075],[0,i===0?.22:.16],[-.028,.075]],.035,.004),M.gold,[x,.035,z],[0,a,0]));
  }
  crown.add(mesh(new THREE.OctahedronGeometry(.055),M.amber,[0,0,.285],null,[.9,1.2,.6]));
  parts.head = head;

  const legs=[];
  for (const s of [-1,1]) {
    const leg=new THREE.Group();leg.name=s<0?'graz-leg-left':'graz-leg-right';leg.position.set(s*.17,.95,0);
    leg.add(mesh(capsule(.145,.26),M.leather,[s*.045,-.21,0]));
    leg.add(mesh(sphere(.15,10,6),M.gold,[s*.045,-.40,.055],null,[1,.8,.85]));
    leg.add(mesh(cylinder(.145,.175,.32),M.iron,[s*.045,-.62,.015]));
    leg.add(mesh(shape([[-.11,.13],[0,.19],[.11,.13],[.095,-.13],[-.095,-.13]],.05),M.steel,[s*.045,-.60,.15]));
    leg.add(mesh(sphere(.175,10,6),M.furDark,[s*.045,-.84,.095],null,[1.05,.43,1.45]));
    for (const dx of [-.065,.065]) leg.add(mesh(new THREE.ConeGeometry(.032,.105,6),M.ivory,[s*.045+dx,-.855,.295],[Math.PI/2,0,0]));
    body.add(leg);legs.push(leg);
  }
  parts.legs2=legs;

  const arm=new THREE.Group();arm.name='graz-sword-arm';arm.position.set(.55,1.55,0);body.add(arm);
  arm.add(mesh(capsule(.12,.21),M.fur,[.065,-.17,0]));
  arm.add(mesh(sphere(.245,12,8),M.steel,[.03,.045,0],null,[1.1,.62,1.05]));
  arm.add(mesh(shape([[-.18,.05],[.19,.05],[.16,-.02],[-.18,-.04]],.05),M.gold,[.065,0,.235]));
  arm.add(mesh(cylinder(.13,.15,.23),M.iron,[.065,-.45,0]));
  arm.add(mesh(cylinder(.155,.155,.04),M.gold,[.065,-.54,0]));
  const grip=new THREE.Group();grip.name='graz-sword-grip';grip.position.set(.065,-.62,0);arm.add(grip);
  grip.add(mesh(sphere(.115,10,6),M.furDark,null,null,[1,.85,1]));
  const sword=royalCleaver(M);sword.rotation.set(Math.PI/2,Math.PI/2,0);grip.add(sword);
  parts.arm=arm;parts.grip=grip;parts.weaponModel=sword;

  const guardArm=new THREE.Group();guardArm.name='graz-shield-arm';guardArm.position.set(-.55,1.55,0);body.add(guardArm);
  guardArm.add(mesh(capsule(.13,.22),M.fur,[-.07,-.19,0]));
  // Fur mantle is confined to the shield shoulder to keep the sword arm clear.
  guardArm.add(mesh(sphere(.255,12,8),M.ivory,[-.035,.045,0],null,[1.15,.65,1.05]));
  for (const [x,y,z] of [[-.19,-.045,.14],[.04,-.08,.17],[-.10,-.10,-.18]]) guardArm.add(mesh(new THREE.ConeGeometry(.09,.18,6),M.ivory,[x,y,z],[Math.PI,0,.12]));
  guardArm.add(mesh(cylinder(.14,.15,.24),M.iron,[-.065,-.45,.06]));
  const shield=kingShield(M);shield.position.set(-.245,-.32,.21);shield.rotation.y=-.35;guardArm.add(shield);
  parts.shield=shield;
  parts.guardArm=guardArm;

  // Cape is a group with its pivot at the original cape anchor. No floor drag.
  const cape=new THREE.Group();cape.name='graz-cape';cape.position.set(0,.85,-.05);body.add(cape);
  const cloth=mesh(new THREE.CylinderGeometry(.38,.65,1.34,12,3,true,Math.PI*.70,Math.PI*.60),toon(0x953749,{side:THREE.DoubleSide}),[0,.07,-.045]);
  cloth.userData.noOutline=true;cape.add(cloth);
  const hem=mesh(new THREE.CylinderGeometry(.62,.65,.075,12,1,true,Math.PI*.70,Math.PI*.60),toon(0xd9aa50,{side:THREE.DoubleSide}),[0,-.564,-.045]);
  hem.userData.noOutline=true;cape.add(hem);
  parts.cape=cape;
  body.add(mesh(sphere(.055,8,6),M.gold,[-.27,1.64,.21]));
  body.add(mesh(sphere(.055,8,6),M.gold,[.27,1.64,.21]));

  const tail=new THREE.Group();tail.name='graz-tail';tail.position.set(.15,.19,-.48);body.add(tail);
  tail.add(mesh(capsule(.055,.23),M.fur,[0,.10,-.15],[Math.PI/2+.25,0,0]));
  tail.add(mesh(sphere(.075,10,6),M.furLight,[0,.065,-.32],null,[1,1,1.3]));
  parts.tail=tail;
  return parts;
}
