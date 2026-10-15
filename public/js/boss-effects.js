// Cosmetic effects only: these meshes never participate in damage or collisions.
import * as THREE from 'three';
import { toon } from './toon.js';
import { sampleBossPose } from './boss-motion.js';
import { trunk } from './boss-model-geometry.js';

const additive=(color,opacity=.7)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
function dispose(o){o.removeFromParent();o.traverse(p=>{p.geometry?.dispose();if(Array.isArray(p.material))p.material.forEach(m=>m.dispose());else p.material?.dispose();});}
class Ribbon {
  constructor(scene,color){
    this.history=[];this.geo=new THREE.BufferGeometry();this.positions=new Float32Array(24*18);
    this.geo.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.mesh=new THREE.Mesh(this.geo,additive(color,.52));this.mesh.frustumCulled=false;scene.add(this.mesh);
  }
  update(base,tip,time,active){
    if(active)this.history.push({base:base.clone(),tip:tip.clone(),time});
    this.history=this.history.filter(p=>time-p.time<.13).slice(-24);
    let n=0;for(let i=1;i<this.history.length;i++){
      const a=this.history[i-1],b=this.history[i];for(const p of [a.base,a.tip,b.tip,a.base,b.tip,b.base]){this.positions[n++]=p.x;this.positions[n++]=p.y;this.positions[n++]=p.z;}
    }
    this.geo.setDrawRange(0,n/3);this.geo.attributes.position.needsUpdate=true;this.mesh.visible=n>0;
  }
  clear(){this.history=[];this.geo.setDrawRange(0,0);this.mesh.visible=false;}
  dispose(){dispose(this.mesh);}
}

export class BossEffects {
  constructor(scene,fx){this.scene=scene;this.fx=fx;this.actors=new Map();}
  own(model,object,life,update){const o=this.fx.add(object,life,update);this.fx.items.at(-1).bossOwner=model.uuid;return o;}
  update(model,act,dt,time){
    const u=model.userData;if(!u.identity)return;
    let context=this.actors.get(model.uuid);
    if(!context){context={key:null,emit:0,ribbons:[]};const count=u.identity==='skorpio'?3:1;for(let i=0;i<count;i++)context.ribbons.push(new Ribbon(this.scene,u.identity==='graz'?0xffe3a2:i===2?0xc4ed68:0xffc88a));this.actors.set(model.uuid,context);}
    if(act?.key!==context.key){context.ribbons.forEach(r=>r.clear());context.key=act?.key;}
    const pose=act?sampleBossPose(u.identity,act.pattern,act.age,act.phase,act.speed):null;
    model.updateMatrixWorld(true);
    const point=(o,v)=>o.localToWorld(new THREE.Vector3(...v));
    if(u.identity==='graz')context.ribbons[0].update(point(u.weaponModel,[0,.32,0]),point(u.weaponModel,[0,2.18,0]),time,!!pose?.trail);
    if(u.identity==='skorpio'){
      u.scorpionClaws.forEach((c,i)=>context.ribbons[i].update(point(c.claw,[0,0,.18]),point(c.claw,[0,0,.76]),time,!!pose?.trail&&act.spec.kind==='pincers'&&(pose.hitIndex===act.spec.hits.length-1||pose.hitIndex%2===i)));
      context.ribbons[2].update(point(u.stinger,[0,.07,0]),point(u.stinger,[0,.44,0]),time,!!pose?.trail&&act.spec.kind==='venom');
    }
    context.emit-=dt;
    if(act&&act.age<act.spec.hits[0]&&context.emit<=0){
      context.emit=.065;
      let p;if(u.identity==='graz')p=point(u.weaponModel,[0,1.4,0]);
      if(u.identity==='skorpio')p=point(u.stinger,[0,.34,0]);
      if(u.identity==='yugdra'){const a=time*4,sc=model.scale.x;p=point(u.body,[Math.sin(a)*.9,3.15,Math.cos(a)*.4]);void sc;}
      this.fx.parts.emit(p.x,p.y,p.z,{color:act.spec.color,size:.19,life:.25,speed:.25,gravity:0});
    }
  }
  // Start leaf drops shortly before the existing telegraph reaches its hit time.
  prepare(model,shape,left){
    if(model?.userData.identity!=='yugdra'||shape.k!=='circle')return;
    const n=6,g=new THREE.IcosahedronGeometry(.18,0),mat=toon(0x92ba6e,{transparent:true,opacity:1}),leaves=new THREE.InstancedMesh(g,mat,n),dummy=new THREE.Object3D();
    leaves.frustumCulled=false;leaves.userData.noOutline=true;
    const dur=Math.max(.04,left);
    this.own(model,leaves,dur,(o,k)=>{
      for(let i=0;i<n;i++){const a=i*Math.PI*2/n,r=shape.r*.42;dummy.position.set(shape.x+Math.sin(a)*r,7*(1-k)*(1-k)+.08,shape.z+Math.cos(a)*r);dummy.rotation.set(k*3+i,0,i);dummy.scale.set(.8,1.8,.5);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);}o.instanceMatrix.needsUpdate=true;
    });
  }
  impact(model,s){
    if(!model)return false;const u=model.userData,id=u.identity;if(!id)return false;
    const start=this.fx.items.length;
    if(id==='graz'&&(s.k==='circle'||s.k==='cone')){
      const color=0xffdb86;
      if(s.k==='cone')this.fx.slash(s.x,s.z,s.a,s.len,s.arc*180/Math.PI,color,.8);
      else {
        this.fx.ringWave(s.x,s.z,color,s.r,.40,.15);
        const verts=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=s.r*.75;for(const [p,q]of [[.12,r*.55],[r*.55,r]])verts.push(s.x+Math.sin(a)*p,.04,s.z+Math.cos(a)*p,s.x+Math.sin(a+.09)*q,.04,s.z+Math.cos(a+.09)*q);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}));this.own(model,lines,.45,(o,k)=>o.material.opacity=.8*(1-k));
      }
      this.fx.parts.burst(s.x,.25,s.z,18,{color:0xc5ac86,size:.28,speed:4.8,life:.32,gravity:-8});
    }else if(id==='yugdra'&&s.k==='ring'){
      const n=10,r=(s.r0+s.r1)/2,root=new THREE.InstancedMesh(trunk([[0,0,0,.37,0],[.10,.75,.10,.27,.10],[.24,1.75,.13,.17,-.08],[.42,2.7,.09,.018,0]],7),toon(0x796346,{transparent:true,opacity:1}),n),dummy=new THREE.Object3D();root.frustumCulled=false;
      this.own(model,root,.65,(o,k)=>{const h=k<.18?Math.sin(k/.18*Math.PI/2):1;for(let i=0;i<n;i++){const a=i*Math.PI*2/n;dummy.position.set(s.x+Math.sin(a)*r,-.07,s.z+Math.cos(a)*r);dummy.rotation.set(0,a,0);dummy.scale.set(1,h,1);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);}o.instanceMatrix.needsUpdate=true;o.material.opacity=k<.55?1:(1-k)/.45;});
      this.fx.ringWave(s.x,s.z,0xa6dc83,s.r1,.40,.08);this.fx.parts.burst(s.x,.6,s.z,14,{color:0xb7d393,size:.23,speed:3,life:.4,gravity:-2});
    }else if(id==='yugdra'&&s.k==='circle'){
      this.fx.ringWave(s.x,s.z,0xb9e58c,s.r,.30,.10);this.fx.parts.burst(s.x,.35,s.z,20,{color:0xd6e5a2,size:.20,speed:3.3,life:.42,gravity:-2});
    }else if(id==='skorpio'&&s.k==='circle'){
      this.fx.slash(s.x,s.z,0,s.r,85,0xffbf79,.22);this.fx.parts.burst(s.x,.18,s.z,20,{color:0xd7b988,size:.27,speed:4.6,life:.34,gravity:-8});
    }else return false;
    for(const it of this.fx.items.slice(start))it.bossOwner=model.uuid;return true;
  }
  projectile(model,x,y,z){
    if(model?.userData.identity!=='skorpio')return null;
    model.updateMatrixWorld(true);const from=model.userData.stinger.localToWorld(new THREE.Vector3(0,.44,0)),to=new THREE.Vector3(x,Math.max(y,from.y),z),mid=from.clone().lerp(to,.55);mid.y+=.4;
    const curve=new THREE.QuadraticBezierCurve3(from,mid,to),g=new THREE.TubeGeometry(curve,12,.045,5,false),stream=new THREE.Mesh(g,additive(0xc4ed68,.75));
    this.own(model,stream,.18,(o,k)=>o.material.opacity=.75*(1-k));return {color:0xc4ed68,startY:Math.max(y,from.y)};
  }
  clear(model){
    const context=this.actors.get(model.uuid);if(context){context.ribbons.forEach(r=>r.dispose());this.actors.delete(model.uuid);}
    for(let i=this.fx.items.length-1;i>=0;i--)if(this.fx.items[i].bossOwner===model.uuid){dispose(this.fx.items[i].obj);this.fx.items.splice(i,1);}
  }
  clearAll(){for(const c of this.actors.values())c.ribbons.forEach(r=>r.dispose());this.actors.clear();for(let i=this.fx.items.length-1;i>=0;i--)if(this.fx.items[i].bossOwner){dispose(this.fx.items[i].obj);this.fx.items.splice(i,1);}}
}
