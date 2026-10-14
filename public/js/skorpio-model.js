// Eight walking legs, two articulated pincers and a connected six-segment tail.
import * as THREE from 'three';
import { toon, glow } from './toon.js';
import { mesh, plate, segment } from './boss-model-geometry.js';

export function buildSkorpio(body,accent) {
  const M={shell:toon(0x986447),light:toon(0xc99557),dark:toon(0x503b34),joint:toon(0x362d2e),edge:toon(0xe1ba77),stinger:toon(0x292e35),core:glow(new THREE.Color(accent).multiplyScalar(1.2))};
  body.name='skorpio-body';
  body.add(mesh(new THREE.SphereGeometry(.70,12,8),M.dark,[0,.66,-.16],null,[1,.42,1.23]));
  for(let i=0;i<4;i++) {
    const z=.42-i*.38, r=.65-i*.045;
    body.add(mesh(new THREE.SphereGeometry(r,10,6),i%2?M.shell:M.light,[0,.79-i*.012,z],null,[1,.50,.54]));
    body.add(mesh(plate([[-.07,0],[.07,0],[.10,.20],[0,.31],[-.10,.20]],.035),M.edge,[0,.818-i*.012+r*.50,z-.12],[Math.PI/2,0,0]));
  }
  const head=new THREE.Group();head.name='skorpio-head';head.position.set(0,.84,.71);body.add(head);
  head.add(mesh(new THREE.DodecahedronGeometry(.40,0),M.shell,null,[0,0,Math.PI/5],[1.35,.65,.84]));
  head.add(mesh(plate([[-.35,.13],[-.20,.24],[.20,.24],[.35,.13],[.23,-.12],[-.23,-.12]],.09),M.light,[0,.04,.25]));
  for(const s of [-1,1])for(let i=0;i<3;i++) {
    head.add(mesh(new THREE.SphereGeometry(.06-i*.011,8,6),M.joint,[s*(.12+i*.105),.12-i*.018,.316-i*.022],null,[1,.8,.45]));
    head.add(mesh(new THREE.SphereGeometry(.037-i*.008,8,6),M.core,[s*(.12+i*.105),.12-i*.018,.348-i*.022],null,[1,.8,.4]));
  }
  for(const s of [-1,1]) {
    head.add(mesh(plate([[-.02,.05],[.13,.03],[.18,-.12],[.08,-.22],[.01,-.18],[.085,-.12]].map(([x,y])=>[x*s,y]),.11),M.stinger,[s*.10,-.10,.34],[0,s*.3,0]));
  }

  const legs=[];
  for(const s of [-1,1])for(let i=0;i<4;i++) {
    const z=.49-i*.32, spread=(1.5-i)*.23,hip=new THREE.Group();hip.name=`skorpio-leg-${s<0?'left':'right'}-${i}`;hip.position.set(s*.51,.66,z);body.add(hip);
    const elbow=[s*.52,-.14,spread];
    hip.add(segment([0,0,0],elbow,.082,.067,M.dark));
    hip.add(mesh(new THREE.SphereGeometry(.095,8,6),M.edge,elbow,null,[1,.75,1]));
    const knee=new THREE.Group();knee.name=hip.name+'-knee';knee.position.set(...elbow);hip.add(knee);
    knee.add(segment([0,0,0],[s*.37,-.47,spread*.08],.068,.016,M.shell));
    knee.add(mesh(new THREE.ConeGeometry(.034,.10,6),M.stinger,[s*.375,-.45,spread*.08],[0,0,s*.40]));
    legs.push({hip,knee,side:s,index:i});
  }
  const claws=[];
  for(const s of [-1,1]) {
    const arm=new THREE.Group();arm.name=s<0?'skorpio-pincer-left':'skorpio-pincer-right';arm.position.set(s*.41,.73,.58);body.add(arm);
    arm.add(segment([0,0,0],[s*.56,-.02,.51],.12,.135,M.dark));
    arm.add(mesh(new THREE.SphereGeometry(.16,10,6),M.edge,[s*.56,-.02,.51]));
    arm.add(segment([s*.56,-.02,.51],[s*.54,.04,.88],.13,.18,M.shell));
    const claw=new THREE.Group();claw.name=arm.name+'-hand';claw.position.set(s*.54,.04,.91);arm.add(claw);
    claw.add(mesh(new THREE.SphereGeometry(.29,12,8),M.shell,[0,0,.09],null,[1.1,.66,1.18]));
    claw.add(mesh(new THREE.SphereGeometry(.22,10,6),M.light,[0,.09,.10],null,[1.18,.5,1.1]));
    const fingers=[];
    for(const f of [-1,1]) {
      const finger=new THREE.Group();finger.name=claw.name+'-finger-'+f;finger.position.set(f*.17,0,.24);claw.add(finger);
      finger.add(mesh(plate([[0,-.01],[f*.13,.07],[f*.18,.28],[f*.09,.48],[-f*.04,.58],[-f*.08,.49],[f*.01,.25],[-f*.09,.11]],.13,.012),M.light,null,[Math.PI/2,0,0]));
      finger.add(mesh(plate([[f*.09,.41],[-f*.04,.58],[-f*.08,.49],[f*.015,.37]],.14,.002),M.stinger,[0,.025,0],[Math.PI/2,0,0]));
      fingers.push({node:finger,side:f});
    }
    // Raised orange seam conveys venom/heat without turning the shell into light.
    claw.add(mesh(plate([[-.035,0],[.035,0],[.055,.18],[0,.26],[-.055,.18]],.02,.002),M.core,[0,.174,.1],[Math.PI/2,0,0]));
    claws.push({arm,claw,fingers,side:s});
  }

  const tail=new THREE.Group();tail.name='skorpio-tail-root';tail.position.set(0,1.01,-.91);body.add(tail);
  const points=[[0,0,0],[0,.46,-.30],[0,1.04,-.33],[0,1.49,-.06],[0,1.58,.51],[0,1.27,.96],[0,.86,1.17]];
  const radii=[.155,.153,.140,.129,.114,.085],joints=[];let parent=tail,lastAngle=0;
  for(let i=0;i<points.length-1;i++) {
    const a=new THREE.Vector3(...points[i]),b=new THREE.Vector3(...points[i+1]),d=b.sub(a),length=d.length(),angle=Math.atan2(d.z,d.y),rest=angle-lastAngle;
    const joint=new THREE.Group();joint.name='skorpio-tail-segment-'+i;joint.rotation.x=rest;
    if(i)joint.position.y=joints[i-1].length;parent.add(joint);
    joint.add(mesh(new THREE.CylinderGeometry(radii[i]*.85,radii[i],length*.9,9),i%2?M.light:M.shell,[0,length*.48,0]));
    joint.add(mesh(new THREE.SphereGeometry(radii[i]*1.07,9,6),M.dark,null,null,[1,.78,1]));
    joints.push({node:joint,rest,length});parent=joint;lastAngle=angle;
  }
  const tip=new THREE.Group();tip.name='skorpio-stinger';tip.position.y=joints.at(-1).length;parent.add(tip);
  tip.add(mesh(new THREE.SphereGeometry(.15,10,6),M.dark,[0,.045,0],null,[.9,1,.9]));
  tip.add(mesh(new THREE.SphereGeometry(.10,10,6),M.core,[0,.065,.06],null,[.85,.9,.5]));
  tip.add(mesh(plate([[-.065,.08],[.075,.08],[.10,.22],[.045,.36],[-.02,.44],[-.065,.24]],.095,.006),M.stinger));
  return {identity:'skorpio',head,scorpionLegs:legs,scorpionClaws:claws,scorpionTail:tail,tailJoints:joints,stinger:tip};
}

export function animateSkorpio(u,s) {
  const moving=s.st===1,wind=s.st===2,atk=s.st===3,t=s.t;
  // The horizontal shell remains level. Eight leg hinges carry the gait.
  u.body.rotation.x=0;
  for(const leg of u.scorpionLegs) {
    const phase=t*7+leg.index*Math.PI+(leg.side<0?0:Math.PI),wave=moving?Math.sin(phase):0;
    leg.hip.rotation.y=wave*.14;
    leg.knee.rotation.z=leg.side*Math.max(0,wave)*.28;
  }
  for(const claw of u.scorpionClaws) {
    claw.arm.rotation.y=claw.side*(wind?-.17:atk?.18:.04+Math.sin(t*1.8)*.025);
    claw.arm.rotation.x=wind?-.16:atk?.08:0;
    for(const finger of claw.fingers)finger.node.rotation.y=finger.side*(wind?.19:atk?-.12:.07+Math.sin(t*1.7)*.025);
  }
  u.scorpionTail.rotation.y=Math.sin(t*.9)*.055;
  u.tailJoints.forEach((joint,i)=>joint.node.rotation.x=joint.rest+Math.sin(t*1.35-i*.5)*.025+(i===0?(wind?-.10:atk?.34:0):0));
}
