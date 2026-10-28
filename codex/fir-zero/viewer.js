import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = document.querySelector('main');
const stage = root.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c5cba9');
scene.add(new THREE.HemisphereLight('#e4ebdb', '#5b684d', 1.35));
const sun = new THREE.DirectionalLight('#fff3d9', 2.5);
sun.position.set(-5, 10, 7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-9,right:9,top:10,bottom:-8,near:.1,far:35});
sun.shadow.normalBias = .035; scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80,80), new THREE.MeshLambertMaterial({color:'#a9b48a'}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30,1,.1,100);
let state = {view:'standard', yaw:0};
function cameraUpdate() {
  const pitch=THREE.MathUtils.degToRad(state.view==='top'?89.5:state.view==='side'?17:35);
  const yaw=THREE.MathUtils.degToRad(state.yaw), target=new THREE.Vector3(0,3.0,0);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(16.5));
  camera.up.set(0,1,0); camera.lookAt(target);
}
function resize() { const w=stage.clientWidth,h=stage.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize(); cameraUpdate();
root.addEventListener('click', event => {
  const button=event.target.closest('button[data-view]'); if(!button)return;
  state={view:button.dataset.view,yaw:0}; cameraUpdate();
  root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
});
let dragging=false,lastX=0;
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;state.yaw+=(e.clientX-lastX)*.35;lastX=e.clientX;cameraUpdate()});
for(const event of ['pointerup','pointercancel'])renderer.domElement.addEventListener(event,()=>dragging=false);
try {
  const gltf=await new GLTFLoader().loadAsync('./assets/fir-zero.glb');
  let tris=0;
  gltf.scene.traverse(obj=>{
    if(!obj.isMesh)return;
    const leaf=obj.material.name.includes('leaf');
    obj.castShadow=true; obj.receiveShadow=!leaf;
    if(leaf){obj.material.side=THREE.DoubleSide;obj.material.transparent=false;obj.material.depthWrite=true;obj.material.alphaTest=.4;
      obj.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));};
      obj.material.needsUpdate=true;
      obj.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:obj.material.map,alphaTest:.4,side:THREE.DoubleSide});}
    tris+=obj.geometry.index?obj.geometry.index.count/3:obj.geometry.attributes.position.count/3;
  });
  scene.add(gltf.scene); stage.querySelector('#loading').remove();
  renderer.render(scene,camera); window.__firZero={scene,camera,renderer,tris}; window.__firZeroReady=true;
  renderer.setAnimationLoop(()=>{if(!window.__firZeroPause)renderer.render(scene,camera)});
} catch(error) {stage.querySelector('#loading').textContent='モデルを読み込めませんでした';console.error(error);}
