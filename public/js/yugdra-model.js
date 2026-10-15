// A walking ancient tree: readable crown, carved face, living core and roots.
import * as THREE from 'three';
import { toon, glow } from './toon.js';
import { mesh, plate, segment, chain, trunk } from './boss-model-geometry.js';

export function buildYugdra(body, accent) {
  const M={wood:toon(0x74634b),dark:toon(0x403c32),light:toon(0xa08a62),moss:toon(0x526c4d),leaf:toon(0x547b56),leafLight:toon(0x83a36c),leafDark:toon(0x345c49),hollow:toon(0x192d28),core:glow(new THREE.Color(accent).multiplyScalar(1.2))};
  body.name='yugdra-body';
  body.add(mesh(trunk([[0,.47,0,.43,0],[-.08,.9,-.02,.65,.11],[.055,1.52,0,.57,.02],[0,2.12,.01,.51,-.12],[-.06,2.60,-.06,.34,.12]]),M.wood));
  // Broad raised strips expose the twisting direction of the bark.
  for(const s of [-1,1]) {
    body.add(mesh(plate([[-.08,0],[.08,.03],[.13,.60],[.06,1.13],[-.05,1.31],[-.09,.61]],.055),s<0?M.dark:M.light,[s*.32,.65,.38],[0,s*.25,s*.12]));
    body.add(mesh(plate([[-.12,0],[.10,0],[.18,.26],[.06,.43],[-.12,.31]],.075),M.moss,[s*.38,.95,.37],[0,s*.4,0]));
  }
  // The face is carved into the trunk rather than perched on a humanoid head.
  for(const s of [-1,1]) {
    body.add(mesh(plate([[-.14,-.04],[.13,-.04],[.16,.055],[-.11,.11]].map(([x,y])=>[s*x,y]),.05),M.hollow,[s*.19,2.18,.445],[0,s*.22,0]));
    body.add(mesh(plate([[-.085,-.014],[.085,-.014],[.09,.025],[-.065,.063]].map(([x,y])=>[s*x,y]),.025,.002),M.core,[s*.19,2.18,.477],[0,s*.22,0]));
    body.add(mesh(plate([[-.17,-.04],[.15,-.07],[.18,.08],[-.10,.15]].map(([x,y])=>[s*x,y]),.12),M.dark,[s*.20,2.27,.43],[0,s*.22,0]));
  }
  body.add(mesh(plate([[-.12,.07],[.08,.10],[.14,-.02],[.06,-.14],[-.10,-.11]],.08),M.hollow,[0,1.96,.507]));
  body.add(mesh(plate([[-.09,-.07],[0,.18],[.07,-.05]],.13),M.light,[0,2.08,.495]));
  // Root beard frames, but never covers, the green heart beneath the face.
  for(const [x,end] of [[-.26,-.36],[.26,.37]])chain(body,[[x,1.94,.40],[x*.9,1.77,.52],[end,1.54,.48]],[.085,.065,.018],M.dark);
  body.add(mesh(plate([[-.18,0],[-.13,.24],[.09,.29],[.20,.08],[.10,-.23],[-.10,-.22]],.06),M.hollow,[0,1.38,.535]));
  body.add(mesh(plate([[-.08,0],[-.055,.14],[.045,.19],[.10,.045],[.045,-.15],[-.045,-.13]],.047,.002),M.core,[0,1.40,.58]));
  body.add(mesh(plate([[-.03,0],[.03,0],[.025,.28],[0,.36],[-.03,.27]],.025,.002),M.core,[0,1.62,.53]));

  const arms=[];
  for(const s of [-1,1]) {
    const arm=new THREE.Group();arm.name=s<0?'yugdra-arm-left':'yugdra-arm-right';arm.position.set(s*1.15,2.05,0);body.add(arm);
    chain(arm,[[0,0,0],[-s*.04,-.43,.015],[s*.07,-.80,.11]],[.23,.18,.23],M.wood);
    arm.add(mesh(new THREE.DodecahedronGeometry(.25,0),M.dark,[s*.07,-1.01,.12],null,[1.18,1.20,.9]));
    for(let i=0;i<3;i++)chain(arm,[[s*.07+(i-1)*.13,-1.08,.18],[s*.08+(i-1)*.18,-1.32,.22],[s*.10+(i-1)*.20,-1.40,.30]],[.067,.055,.025],M.light);
    arm.add(mesh(plate([[-.09,0],[.08,0],[.12,.22],[-.07,.33]],.075),M.moss,[0,-.50,.16]));
    arms.push(arm);
  }
  // Shoulder boughs connect the torso to the arm sockets.
  for(const s of [-1,1])chain(body,[[s*.38,2.31,0],[s*.84,2.17,0],[s*1.15,2.05,0]],[.22,.22,.21],M.dark);
  const legs=[],rootTips=[];
  for(const s of [-1,1]) {
    const leg=new THREE.Group();leg.name=s<0?'yugdra-root-left':'yugdra-root-right';leg.position.set(s*.38,.58,0);body.add(leg);
    chain(leg,[[0,0,0],[s*.07,-.27,.015],[s*.12,-.46,.11]],[.20,.18,.14],M.wood);
    for(const [dx,z] of [[-.16,.44],[.16,.38],[s*.25,-.10]]) {
      chain(leg,[[s*.12,-.43,.1],[s*.12+dx*.65,-.50,z*.65],[s*.12+dx,-.54,z]],[.10,.065,.020],M.wood);
      rootTips.push({leg,point:new THREE.Vector3(s*.12+dx,-.54,z)});
    }
    legs.push(leg);
  }

  const crown=new THREE.Group();crown.name='yugdra-crown';body.add(crown);
  chain(crown,[[-.08,2.42,-.04],[-.29,2.82,-.08],[-.72,3.03,-.1]],[.24,.18,.11],M.wood);
  chain(crown,[[.08,2.40,-.09],[.38,2.75,-.14],[.88,2.92,-.15]],[.22,.16,.09],M.dark);
  chain(crown,[[-.08,2.55,-.03],[.02,3.13,.04],[.23,3.31,.06]],[.14,.09,.028],M.light);
  const foliage=[[-.91,2.95,-.14,.70,.36,.63],[-.37,3.24,-.05,.72,.39,.59],[.34,3.18,-.18,.78,.39,.63],[1.0,2.88,-.12,.65,.33,.59],[.12,3.08,-.56,.90,.34,.59]];
  foliage.forEach(([x,y,z,sx,sy,sz],i)=>crown.add(mesh(new THREE.IcosahedronGeometry(1,0),i%3===0?M.leafDark:i%3===1?M.leafLight:M.leaf,[x,y,z],[0,i*.7,.15],[sx,sy,sz])));
  for(const s of [-1,1]) {
    crown.add(mesh(plate([[-.07,0],[.06,.02],[.10,.22],[0,.32],[-.11,.18]],.025,.002),M.leafLight,[s*1.25,2.82,.27],[0,-s*.3,-s*.6]));
    chain(crown,[[s*.74,2.85,.02],[s*1.17,2.87,.20],[s*1.36,3.10,.29]],[.045,.029,.010],M.light);
    chain(crown,[[s*.77,2.82,-.27],[s*1.04,3.16,-.26],[s*1.19,3.39,-.22]],[.065,.037,.008],M.dark);
  }
  const motes=new THREE.Group();motes.name='yugdra-motes';body.add(motes);
  for(const [x,y,z] of [[-.83,2.41,.29],[.78,2.23,.32],[-.35,3.04,.48]])motes.add(mesh(new THREE.OctahedronGeometry(.037),M.core,[x,y,z]));
  return {identity:'yugdra',arms,legs2:legs,rootTips,treeCrown:crown,treeMotes:motes};
}

export function animateYugdra(u,s) {
  const stride=s.st===1?Math.sin(s.t*4)*.17:0;
  u.legs2[0].rotation.x=stride;u.legs2[1].rotation.x=-stride;
  plantYugdraRoots(u);
  u.treeCrown.rotation.z=Math.sin(s.t*.85)*.017;
  u.treeMotes.rotation.y=Math.sin(s.t*.7)*.10;
}
export function plantYugdraRoots(u) {
  // Keep the lowest root planted as the trunk leans and the legs take a step.
  let low=Infinity;
  for(const {leg,point} of u.rootTips) {
    const a=leg.rotation.x,y=point.y*Math.cos(a)-point.z*Math.sin(a)+leg.position.y,z=point.y*Math.sin(a)+point.z*Math.cos(a);
    low=Math.min(low,y*Math.cos(u.body.rotation.x)-z*Math.sin(u.body.rotation.x));
  }
  u.body.position.y=Math.max(0,.025-low);
}
