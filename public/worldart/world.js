// ワールドの実行環境（three.js）。Blender で作った地形・アセット・配置を読み込んで描く。
//   URL: worldart/index.html?map=orc_meadow
//   実験用の切り替え（すべて省略可。省略時は地図 JSON の値）:
//     fov pitch dist yaw          カメラ
//     sunEl sunAz sun hemi        太陽の高度・方位・強さ、空の光の強さ
//     sat contrast                仕上げの彩度・コントラスト
//     post=0                      仕上げ（色調・ぼかし）をすべて切る
//     dof=0                       奥と手前のぼかしだけ切る
//     grass=0                     草の房を出さない
//     fnorm=card                  葉の法線を板の向きにする（既定は Blender で入れた外向きの法線）
//     shadow=0                    影を切る
//     walk=1                      WASD / 矢印キーで注目点を動かし、カメラが付いていく
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const flag = (k, d = true) => (q.has(k) ? q.get(k) !== '0' : d);
const MAP = q.get('map') || 'orc_meadow';
const BASE = './';
// 手前を抜く範囲（カメラ・注目点・半径）。placeCamera が更新する
const OCC = { cam: { value: new THREE.Vector3() }, tgt: { value: new THREE.Vector3() }, r: { value: num('occR', 2.2) } };

const spec = await (await fetch(`${BASE}maps/${MAP}.json`)).json();
const placed = await (await fetch(`${BASE}maps/${MAP}/placements.json`)).json();
const P = Object.assign({ sat: 1.0, contrast: 1.0, lift: [0, 0, 0], gain: [1, 1, 1], dof: 1.0, exposure: 1.0 }, spec.post || {});

// ---------------------------------------------------------------- レンダラー
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = flag('shadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exposure', P.exposure);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(spec.sky?.color || '#cfe0ee');

// ---------------------------------------------------------------- カメラ
const C = spec.camera;
const camera = new THREE.PerspectiveCamera(num('fov', C.fov), innerWidth / innerHeight, 1, 400);
const target = new THREE.Vector3(...C.target);
const camState = { yaw: num('yaw', C.yaw), pitch: num('pitch', C.pitch), dist: num('dist', C.dist) };
function placeCamera() {
  const y = THREE.MathUtils.degToRad(camState.yaw), p = THREE.MathUtils.degToRad(camState.pitch);
  camera.position.set(target.x + camState.dist * Math.sin(y) * Math.cos(p), target.y + camState.dist * Math.sin(p), target.z + camState.dist * Math.cos(y) * Math.cos(p));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  OCC.cam.value.copy(camera.position); OCC.tgt.value.copy(target); OCC.tgt.value.y += 0.9;
}
placeCamera();

// ---------------------------------------------------------------- 光
const S = spec.sun;
const hemi = new THREE.HemisphereLight('#' + (q.get('skyC') || (spec.sky?.light || spec.sky?.color || '#cfe0ee').slice(1)), '#' + (q.get('gndC') || (spec.sky?.ground || '#4a5a2a').slice(1)), num('hemi', spec.sky?.intensity ?? 0.6));
const sun = new THREE.DirectionalLight('#' + (q.get('sunC') || (S.color || '#fff0d0').slice(1)), num('sun', S.intensity ?? 3));
const sunDir = new THREE.Vector3();
{
  const az = THREE.MathUtils.degToRad(num('sunAz', S.azimuth)), el = THREE.MathUtils.degToRad(num('sunEl', S.elevation));
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
sun.shadow.radius = 2;
scene.add(hemi, sun, sun.target);
function fitShadow() {
  // 影の範囲: 画面に映る地面を覆う
  const half = camState.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.9 + 8;
  sun.target.position.copy(target).add(new THREE.Vector3(0, 0, -2));
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 80);
  Object.assign(sun.shadow.camera, { left: -half * 1.3, right: half * 1.3, top: half, bottom: -half, near: 1, far: 200 });
  sun.shadow.camera.updateProjectionMatrix();
}
fitShadow();

// ---------------------------------------------------------------- テクスチャ
const texLoader = new THREE.TextureLoader();
const tex = (name, srgb = true) => {
  const t = texLoader.load(`${BASE}tex/${name}.png`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const T = { grass: tex('ground_grass'), dirt: tex('ground_dirt'), sand: tex('ground_sand'), cobble: tex('ground_cobble'), rock: tex('rock') };

// ---------------------------------------------------------------- 地面の材質
// 頂点色 R=土の道 G=砂/石畳 B=岩肌。境目は草の絵の明るさで崩してぎざぎざにする
const GROUND = spec.ground || {};
const altTex = GROUND.alt === 'cobble' ? T.cobble : T.sand;
function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: T.grass }, tDirt: { value: T.dirt }, tAlt: { value: altTex }, tRock: { value: T.rock },
      uGrassTint: { value: new THREE.Color(...(GROUND.grassTint || [1, 1, 1])) },
      uDirtTint: { value: new THREE.Color(...(GROUND.dirtTint || [1, 1, 1])) },
      uAltScale: { value: GROUND.altScale || 6.0 },
      uWater: { value: new THREE.Vector2(spec.terrain.water?.level ?? 0, spec.terrain.water ? 1 : 0) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 color;\nvarying vec4 vSplat;\nvarying vec3 vW;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = color;\nvW = (modelMatrix * vec4(position,1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tAlt, tRock; uniform vec3 uGrassTint, uDirtTint; uniform float uAltScale; uniform vec2 uWater;
        varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;
`)
      .replace('#include <map_fragment>', `
        vec2 wp = vW.xz;
        vec3 g1 = texture2D(tGrass, wp / 7.0).rgb, g2 = texture2D(tGrass, wp / 19.0 + 0.37).rgb;
        vec3 grass = mix(g1, g2, 0.35) * uGrassTint;
        float big = texture2D(tGrass, wp / 61.0).g;          // 大きなむら
        grass *= mix(0.86, 1.1, smoothstep(0.25, 0.6, big));
        vec3 dirt = texture2D(tDirt, wp / 6.0).rgb * uDirtTint;
        vec3 alt = texture2D(tAlt, wp / uAltScale).rgb;
        vec3 an = abs(vWN);
        vec3 rock = texture2D(tRock, vW.zy / 4.5).rgb * an.x + texture2D(tRock, vW.xy / 4.5).rgb * an.z + texture2D(tRock, vW.xz / 4.5).rgb * an.y;
        rock /= (an.x + an.y + an.z);
        float n = dot(g1, vec3(0.33)) - 0.33;
        float wd = smoothstep(0.4, 0.6, vSplat.r + n * 0.9);
        float wa = smoothstep(0.4, 0.6, vSplat.g + n * 0.9);
        float wr = smoothstep(0.35, 0.65, vSplat.b + n * 0.6);
        vec3 col = mix(grass, dirt, wd);
        col = mix(col, alt, wa);
        col = mix(col, rock, wr);
        if (uWater.y > 0.5) {
          float wet = smoothstep(0.55, 0.05, vW.y - uWater.x);
          col *= mix(vec3(1.0), vec3(0.72, 0.74, 0.76), wet);
        }
        diffuseColor.rgb *= col;
`);
    addDesat(sh);
  };
  return m;
}

// ---------------------------------------------------------------- 葉・アセットの材質
const FNORM_CARD = q.get('fnorm') === 'card';
// 地色（albedo）の彩度。光で色を作るため、絵そのものの彩度をここで抑える
// カメラと注目点の間にある物を点描（4x4 のディザ）で抜く。草は抜かない
const occChunk = `
  { vec3 ab = uOccTgt - uOccCam; float L = length(ab); vec3 d = ab / L;
    float t = dot(vOccW - uOccCam, d);
    if (t > 0.0 && t < L - 1.0) {
      float r = length(vOccW - (uOccCam + d * t));
      float k = 1.0 - smoothstep(uOccR * 0.6, uOccR, r);
      vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
      float bay = mod(q.x * 4.0 + q.y * 7.0 + q.x * q.y * 3.0, 16.0) / 16.0;
      if (k * 1.2 > bay + 0.02) discard;
    } }
`;
function addOcc(sh) {
  Object.assign(sh.uniforms, { uOccCam: OCC.cam, uOccTgt: OCC.tgt, uOccR: OCC.r });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOccW;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvOccW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uOccCam, uOccTgt; uniform float uOccR; varying vec3 vOccW;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + occChunk);
}
const LEAF = { wrap: { value: num('wrap', spec.foliage?.wrap ?? 0.0) }, trans: { value: num('trans', spec.foliage?.trans ?? 0.0) },
  receive: flag('leafShadow', spec.foliage?.receiveShadow ?? true) };
const ALBEDO_SAT = { value: num('asat', spec.albedoSat ?? 1.0) };
const desatChunk = '\n{ float l_ = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(l_), diffuseColor.rgb, uAlbedoSat); }\n';
function addDesat(sh) {
  sh.uniforms.uAlbedoSat = ALBEDO_SAT;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAlbedoSat;')
    .replace('#include <color_fragment>', '#include <color_fragment>' + desatChunk);
}
function fixMaterial(mesh) {
  const src = mesh.material;
  const isLeaf = /leaf|frond|grass/.test(src.name);
  const m = new THREE.MeshLambertMaterial({
    map: src.map || null, vertexColors: !!mesh.geometry.attributes.color,
    alphaTest: isLeaf ? 0.5 : 0, side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = src.name;
  if (isLeaf && FNORM_CARD) mesh.geometry.computeVertexNormals();   // 比較用: 板の向きの法線
  const isGrassMat = /grass/.test(src.name);
  m.onBeforeCompile = (sh) => {
    addDesat(sh);
    if (!isGrassMat) addOcc(sh);
    if (!isLeaf) return;
    // 葉: 裏面で法線を反転させない（房として丸く光らせる）
    {
      sh.uniforms.uWrap = LEAF.wrap; sh.uniforms.uTrans = LEAF.trans;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' + (FNORM_CARD ? '' : 'normal = normalize(vNormal);'))
        .replace('#include <common>', '#include <common>\nuniform float uWrap, uTrans;')
        // 回り込む光（wrap）と、日を背にした葉の透け（trans）
        .replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          'float dotNL = saturate( (dot( geometryNormal, directLight.direction ) + uWrap) / (1.0 + uWrap) );\n' +
          '\tdotNL += uTrans * pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 2.0 );'));
    }
  };
  return m;
}

// ---------------------------------------------------------------- 水
// 高さマップから深さを出し、浅瀬の色・深い色・波打ち際の泡を決める
const W = spec.terrain.water || null;
const TM = placed.terrain || null;
const heightTex = (W && TM) ? texLoader.load(`${BASE}maps/${MAP}/height.png`) : null;
const TIME = { value: 0 };
function waterMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tH: { value: heightTex }, tN: { value: T.sand }, uTime: TIME,
      uT: { value: new THREE.Vector4(TM.x0, TM.z0, TM.size, 0) }, uHR: { value: new THREE.Vector3(TM.hmin, TM.hmax, W.level) },
      uShallow: { value: new THREE.Color(W.shallow || '#5fb8b0') }, uDeep: { value: new THREE.Color(W.color || '#2f6f9a') } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tH, tN; uniform vec4 uT; uniform vec3 uHR, uShallow, uDeep; uniform float uTime; varying vec3 vW;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 huv = vec2((vW.x - uT.x) / uT.z, 1.0 - (vW.z - uT.y) / uT.z);
      float th = mix(uHR.x, uHR.y, texture2D(tH, huv).r);
      float depth = uHR.z - th;
      float nz = texture2D(tN, vW.xz / 9.0 + uTime * 0.01).r;
      vec3 wc = mix(uShallow, uDeep, smoothstep(0.1, 2.2, depth + (nz - 0.5) * 0.6));
      // 泡: 岸の帯 + 寄せる波の線（時間で動く）
      float band = smoothstep(0.32, 0.0, depth + (nz - 0.5) * 0.35);
      float wave = fract(depth * 1.6 - uTime * 0.25 + nz * 0.5);
      float line = smoothstep(0.12, 0.0, abs(wave - 0.5)) * smoothstep(1.4, 0.2, depth);
      float foam = clamp(band + line * step(0.55, nz), 0.0, 1.0);
      diffuseColor.rgb = mix(wc, vec3(0.95, 0.97, 0.95), foam);
      diffuseColor.a = mix(0.62, 0.95, smoothstep(0.0, 1.2, depth)) + foam * 0.3;`);
  };
  return m;
}

// ---------------------------------------------------------------- 読み込み
const gltf = new GLTFLoader();
const load = (url) => new Promise((res, rej) => gltf.load(url, res, undefined, rej));

const terrain = await load(`${BASE}maps/${MAP}/terrain.glb`);
terrain.scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.name.startsWith('water') || o.material.name === 'water') {
    o.material = waterMaterial(); o.receiveShadow = true; o.renderOrder = 2;
  } else {
    o.material = groundMaterial(); o.receiveShadow = true;
  }
});
scene.add(terrain.scene);

const SKIP = new Set(flag('grass') ? [] : ['grass_a']);
const assetNames = Object.keys(placed.assets).filter((a) => !SKIP.has(a));
const dummy = new THREE.Object3D();
await Promise.all(assetNames.map(async (name) => {
  const g = await load(`${BASE}assets/${name}.glb`);
  const items = placed.assets[name];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mat = fixMaterial(o);
    const im = new THREE.InstancedMesh(o.geometry, mat, items.length);
    items.forEach(([x, y, z, r, s], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix.clone().multiply(o.matrixWorld));
    });
    const isGrass = name.startsWith('grass');
    im.castShadow = !isGrass; im.receiveShadow = !/leaf|frond/.test(mat.name) || LEAF.receive;
    if (/leaf|frond|grass/.test(mat.name)) {
      im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 });
    }
    im.frustumCulled = false;
    scene.add(im);
  });
}));

// ---------------------------------------------------------------- 仕上げ
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());   // トーンマップと sRGB をここで済ませ、以降は表示の色で扱う
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: num('sat', P.sat) }, uCon: { value: num('contrast', P.contrast) },
    uLift: { value: new THREE.Vector3(...P.lift) }, uGain: { value: new THREE.Vector3(...P.gain) } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon; uniform vec3 uLift, uGain; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * uCon + 0.5;
      c.rgb += uLift * (1.0 - l);
      c.rgb *= mix(vec3(1.0), uGain, smoothstep(0.2, 0.8, l));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
    }`,
});
// 奥と手前のぼかし（画面の縦位置で強さを決める。中央の帯はぼかさない）
const dof = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uAmt: { value: P.dof },
    uTop: { value: P.dofTop ?? 0.30 }, uBot: { value: P.dofBot ?? 0.80 }, uHaze: { value: new THREE.Vector4(...(P.haze || [0.8, 0.86, 0.9, 0.0])) } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uAmt, uTop, uBot; uniform vec4 uHaze; varying vec2 vUv;
    void main(){
      float y = 1.0 - vUv.y;                         // 0=上 1=下
      float k = smoothstep(uTop, 0.0, y) + smoothstep(uBot, 1.0, y) * 0.8;
      float r = k * uAmt * 4.0;
      vec4 acc = vec4(0.0);
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996; float s = sqrt(float(i) + 0.5) / 3.5;
        acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * s * r / uRes);
      }
      vec4 c = mix(texture2D(tDiffuse, vUv), acc / 12.0, step(0.01, r));
      c.rgb = mix(c.rgb, uHaze.rgb, uHaze.a * smoothstep(uTop + 0.1, 0.0, y));   // 奥のもや
      gl_FragColor = c;
    }`,
});
if (flag('post')) { composer.addPass(grade); if (flag('dof')) composer.addPass(dof); }

// ---------------------------------------------------------------- 動かす（walk=1）
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const groundMeshes = [];
terrain.scene.traverse((o) => { if (o.isMesh && !/water/.test(o.name)) groundMeshes.push(o); });
const WATER_LV = spec.terrain.water ? spec.terrain.water.level : -1e9;
const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 12), new THREE.MeshLambertMaterial({ color: 0xc04030 }));
marker.castShadow = true; marker.visible = flag('marker', false) || flag('walk', false);
scene.add(marker);
const ray = new THREE.Raycaster();
const groundY = (x, z) => {
  ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  return hit ? hit.point.y : 0;
};
marker.position.set(target.x, groundY(target.x, target.z) + 0.85, target.z);
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (flag('walk', false)) {
    const v = new THREE.Vector3((keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft')), 0,
      (keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup')));
    if (v.lengthSq()) {
      v.normalize().multiplyScalar(5 * dt).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(camState.yaw));
      const nx = target.x + v.x, nz = target.z + v.z;
      if (groundY(nx, nz) > WATER_LV - 0.3) { target.x = nx; target.z = nz; }   // 深い水へは入らない
      target.y = groundY(target.x, target.z);
      marker.position.set(target.x, target.y + 0.85, target.z);
      placeCamera(); fitShadow();
    }
  }
  TIME.value = now / 1000;
  if (!window.__pause) composer.render();
  requestAnimationFrame(tick);
}
// 撮影用: ループを止めて1回だけ描く（ソフトウェア描画で重いとき）
// 撮影・確認用: 注目点を動かす（歩いたときと同じ処理）
window.__moveTo = (x, z) => {
  target.set(x, groundY(x, z), z); marker.position.set(x, target.y + 0.85, z);
  placeCamera(); fitShadow(); return [target.x, target.y, target.z];
};
window.__renderOnce = () => { window.__pause = true; composer.render(); return true; };
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); dof.uniforms.uRes.value.set(innerWidth, innerHeight);
});
requestAnimationFrame(tick);
let frames = 0;
(function wait() { if (++frames > 3) window.__ready = true; else requestAnimationFrame(wait); })();
window.__world = { scene, camera, renderer, spec, placed };
