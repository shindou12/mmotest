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
renderer.shadowMap.type = { pcfsoft: THREE.PCFSoftShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap }[q.get('smap') || spec.shadowMap || 'pcfsoft'];
// lum（L21、L22 で不採用）: 輝度だけを圧縮し R:G:B の比を保つ。L22 で効かせて測ると明暗比 1.9〜2.0・明部 180〜194 と見本（2.4〜2.8・217〜231）から遠ざかったため、見本②は linear（露出を掛けて切るだけ）にした。ACES は明るい所を白へ寄せて彩度を落とすため、日なたが日陰より青く見え
// （日陰が暖かく見える）、見本の「同じ材質の日なたと日陰で R:G:B の比がほぼ同じ、日陰はやや青」と逆になった（rules/lighting-post-survey.md）
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
    color *= toneMappingExposure;
    float L = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    float Lt = L * ( 1.0 + L / 9.0 ) / ( 1.0 + L );          // 白 3.0 の拡張 Reinhard（輝度だけ）
    vec3 c = color * ( Lt / max( L, 1e-5 ) );
    float m = max( c.r, max( c.g, c.b ) );
    return m > 1.0 ? mix( c / m, vec3( 1.0 ), clamp( ( m - 1.0 ) * 0.5, 0.0, 1.0 ) ) : c;   // はみ出した色だけ白へ逃がす
  }`);
renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, reinhard: THREE.ReinhardToneMapping, linear: THREE.LinearToneMapping, lum: THREE.CustomToneMapping }[q.get('tone') || spec.tone || 'aces'];
renderer.toneMappingExposure = num('exposure', P.exposure);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(spec.sky?.color || '#cfe0ee');

// ---------------------------------------------------------------- カメラ
// 固定ビュー: ?view=<名前> で地図の views（見本の基準カメラ）か、標準ビュー（oblique/side/top/walker/near/far）を選ぶ。
//   標準ビューは基準ビュー（?base= か地図の camera）の注目点のまわりに、同じ光・同じ解像度で置く
const STD_VIEWS = {
  oblique: { yaw: 45, pitch: 40, dist: 26 },
  side: { yaw: 90, pitch: 18, dist: 30 },
  top: { yaw: 0, pitch: 85, dist: 40 },
  walker: { yaw: 20, pitch: 6, dist: 9, ty: 1.6 },
  near: { yaw: 0, pitch: 45, dist: 9 },
  far: { yaw: 0, pitch: 52, dist: 60 },
};
function resolveView(v, base) {
  const baseCam = (spec.views && spec.views[base]) || spec.camera;
  if (v && spec.views && spec.views[v]) return { ...spec.camera, ...spec.views[v] };
  if (v && STD_VIEWS[v]) return { ...baseCam, ...STD_VIEWS[v], yaw: baseCam.yaw + STD_VIEWS[v].yaw };
  return baseCam;
}
const C = resolveView(q.get('view'), q.get('base'));
const camera = new THREE.PerspectiveCamera(num('fov', C.fov), innerWidth / innerHeight, 0.3, 600);
const target = new THREE.Vector3(...C.target);
let TY = num('ty', C.ty ?? 0);   // 注目点を地面から上げる（歩行者の目線）
const camState = { yaw: num('yaw', C.yaw), pitch: num('pitch', C.pitch), dist: num('dist', C.dist) };
function placeCamera() {
  const y = THREE.MathUtils.degToRad(camState.yaw), p = THREE.MathUtils.degToRad(camState.pitch);
  const tgt = target.clone(); tgt.y += TY;
  camera.position.set(tgt.x + camState.dist * Math.sin(y) * Math.cos(p), tgt.y + camState.dist * Math.sin(p), tgt.z + camState.dist * Math.cos(y) * Math.cos(p));
  camera.lookAt(tgt);
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
sun.shadow.radius = num('srad', spec.shadowRadius ?? 2); sun.shadow.blurSamples = 16;
scene.add(hemi, sun, sun.target);
function fitShadow() {
  // 影の範囲: 画面に映る地面を覆う
  let half = camState.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.9 + 8;
  if (camState.pitch < 30) half = Math.max(half, 45);   // 低いビューは奥まで影を出す
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
const T = { flag: tex('ground_flagstone'), noise: tex('noise_soft', false), crack: tex('rock_crack'), face: tex('rock_face'), grass: tex('ground_grass'), dirt: tex('ground_dirt'), sand: tex('ground_sand'), cobble: tex('ground_cobble'), rock: tex('rock') };

// ---------------------------------------------------------------- 地面の材質
// 頂点色 R=土の道 G=砂/石畳 B=岩肌。境目は草の絵の明るさで崩してぎざぎざにする
const GROUND = spec.ground || {};
const altTex = GROUND.alt === 'cobble' ? T.cobble : GROUND.alt === 'flagstone' ? T.flag : T.sand;
const rockTex = GROUND.rock === 'face' ? T.face : GROUND.rock === 'crack' ? T.crack : T.rock;   // 急な面の岩肌（crack: 第 2 世代 1.6m、face: 角ばった板と真っすぐな割れ目 L15、4.5m）
const rockScale = GROUND.rock === 'face' ? 4.5 : GROUND.rock === 'crack' ? 1.6 : 4.5;
function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: T.grass }, tNoise: { value: T.noise }, tDirt: { value: T.dirt }, tAlt: { value: altTex }, tRock: { value: rockTex }, uRockScale: { value: rockScale }, uRockPix: { value: GROUND.rockPix ? 1 : 0 }, uRockTint: { value: new THREE.Color(...(GROUND.rockTint || [1, 1, 1])) },
      uAltTint: { value: new THREE.Color(...(GROUND.altTint || [1, 1, 1])) },
      uLushTint: { value: new THREE.Color(...(GROUND.lushTint || [1, 1, 1])) }, uLushAmt: { value: num('lush', GROUND.lushAmt ?? 0) }, uLushBias: { value: num('lushBias', GROUND.lushBias ?? 0) },
      uGrassTint: { value: new THREE.Color(...(q.has('gtint') ? q.get('gtint').split(',').map(Number) : (GROUND.grassTint || [1, 1, 1]))) },
      uDirtTint: { value: new THREE.Color(...(GROUND.dirtTint || [1, 1, 1])) },
      uAltScale: { value: GROUND.altScale || 6.0 },
      // y: 0 = 水なし、1 = 第 2 世代（水際の砂を暗く）、2 = 水の規則 w1（水際の砂を明るく光らせる。見本 W01・W04）
      uWater: { value: new THREE.Vector2(spec.terrain.water?.level ?? 0, !spec.terrain.water ? 0 : num('wrule', spec.terrain.water.rule === 'w1' ? 1 : 0) > 0 ? 2 : 1) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 color;\nvarying vec4 vSplat;\nvarying vec3 vW;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = color;\nvW = (modelMatrix * vec4(position,1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tAlt, tRock, tNoise; uniform vec3 uGrassTint, uDirtTint; uniform float uAltScale, uRockScale, uRockPix; uniform vec2 uWater; uniform vec3 uRockTint, uLushTint, uAltTint; uniform float uLushAmt, uLushBias;
        varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;
`)
      .replace('#include <map_fragment>', `
        vec2 wp = vW.xz;
        // 草の絵は三方向から貼る（L18）: 上から 1 方向だけだと崖の面で縦に伸び、岩との境が歯の列に見えた（F23）
        vec3 an = abs(vWN); an = an * an; an /= (an.x + an.y + an.z);
        vec3 g1 = texture2D(tGrass, vW.zy / 7.0).rgb * an.x + texture2D(tGrass, vW.xy / 7.0).rgb * an.z + texture2D(tGrass, wp / 7.0).rgb * an.y;
        vec3 g2 = texture2D(tGrass, vW.zy / 19.0 + 0.37).rgb * an.x + texture2D(tGrass, vW.xy / 19.0 + 0.37).rgb * an.z + texture2D(tGrass, wp / 19.0 + 0.37).rgb * an.y;
        vec3 grass = mix(g1, g2, 0.35) * uGrassTint;
        float big = texture2D(tGrass, wp / 61.0).g;          // 大きなむら
        grass *= mix(0.86, 1.1, smoothstep(0.25, 0.6, big));
        // 草地の色むら（20m 前後）: 金色の草原 ↔ 茂った緑の草。見本 B03 の地面の大きな黄緑/深緑の斑
        vec3 nz3 = texture2D(tNoise, wp / 28.0).rgb;
        float lush = smoothstep(0.42 - uLushBias, 0.6 - uLushBias, nz3.r * 0.55 + nz3.g * 0.3 + nz3.b * 0.15);
        grass *= mix(vec3(1.0), uLushTint, lush * uLushAmt);
        vec3 dirt = texture2D(tDirt, wp / 6.0).rgb * uDirtTint;
        vec3 alt = texture2D(tAlt, wp / uAltScale).rgb * uAltTint;
        vec3 rock = texture2D(tRock, vW.zy / uRockScale).rgb * an.x + texture2D(tRock, vW.xy / uRockScale).rgb * an.z + texture2D(tRock, vW.xz / uRockScale).rgb * an.y;
        float n = dot(g1, vec3(0.33)) - 0.33;
        float wd = smoothstep(0.4, 0.6, vSplat.r + n * 0.9);
        float wa = smoothstep(0.4, 0.6, vSplat.g + n * 0.9);
        // 岩肌: rockPix のとき画素ごとの傾き（補間した法線）× 頂点色 A（草の垂れ）で決める。頂点ごとの岩の重みは崖の面が 1〜2 マスしかなく、
        // 三角の対角線で草と岩の境が歯の列になった（F23、L18）
        float rk = vSplat.b;
        if (uRockPix > 0.5) {   // 苔の斑（三方向のノイズ、網の目と無関係）: 岩肌の一部に草が乗る
          vec3 mz = texture2D(tNoise, vW.zy / 3.5).rgb * an.x + texture2D(tNoise, vW.xy / 3.5).rgb * an.z + texture2D(tNoise, wp / 3.5).rgb * an.y;
          vec3 gn = normalize(cross(dFdx(vW), dFdy(vW)));   // 三角ごとの面の向き（補間した法線は細い面で歯の列になる）
          rk = smoothstep(0.9, 0.75, abs(gn.y)) * vSplat.a * (1.0 - smoothstep(0.56, 0.66, mz.r * 0.6 + mz.g * 0.4));
        }
        float wr = smoothstep(0.35, 0.65, rk + n * 0.6);
        vec3 col = mix(grass, dirt, wd);
        col = mix(col, alt, wa);
        col = mix(col, rock * uRockTint, wr);
        if (uWater.y > 1.5) {
          float hw = vW.y - uWater.x;
          float wet = smoothstep(0.16, 0.0, hw) * smoothstep(-0.12, 0.02, hw);   // 水の上の水際（≈0.5m の帯）だけ明るく
          col = mix(col, col * 1.12 + vec3(0.06, 0.06, 0.04), wet * 0.7);
          col *= mix(1.0, 0.5, smoothstep(0.0, -0.7, hw));                        // 水の下の底は沈んで暗い
        } else if (uWater.y > 0.5) {
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
// 葉の地色の色味（L23）: 葉の絵に掛ける RGB。地面の grassTint と同じ考えで、樹冠の日なたの色相を絵を描き直さずに合わせる
const LEAF_TINT = { value: new THREE.Color(...(q.has('ltint') ? q.get('ltint').split(',').map(Number) : (spec.foliage?.tint || [1, 1, 1]))) };
const LEAF = { lift: { value: num('llift', spec.foliage?.lift ?? 0.0) }, wrap: { value: num('wrap', spec.foliage?.wrap ?? 0.0) }, trans: { value: num('trans', spec.foliage?.trans ?? 0.0) },
  receive: flag('leafShadow', spec.foliage?.receiveShadow ?? true) };
const ALBEDO_SAT = { value: num('asat', spec.albedoSat ?? 1.0) };
const LEAF_SAT = { value: num('lsat', spec.foliage?.sat ?? spec.albedoSat ?? 1.0) };   // 葉だけの地色の彩度（日陰の葉の彩度を抑える）
const desatChunk = '\n{ float l_ = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(l_), diffuseColor.rgb, uAlbedoSat); }\n';
function addDesat(sh, u = ALBEDO_SAT) {
  sh.uniforms.uAlbedoSat = u;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAlbedoSat;')
    .replace('#include <color_fragment>', '#include <color_fragment>' + desatChunk);
}
// 岩（rock_crack）: 割れ目の絵を世界座標の三方向から貼り（1.6m で 1 回）、上を向いた面に苔（草の絵）をのせる
function addRockTriplanar(sh) {
  Object.assign(sh.uniforms, { tCrack: { value: T.crack }, tMoss: { value: T.grass } });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\nvRN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tCrack, tMoss; varying vec3 vRW; varying vec3 vRN;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 an = pow(abs(vRN), vec3(3.0)); an /= (an.x + an.y + an.z);
      vec3 rc = texture2D(tCrack, vRW.zy / 1.6).rgb * an.x + texture2D(tCrack, vRW.xy / 1.6).rgb * an.z + texture2D(tCrack, vRW.xz / 1.6).rgb * an.y;
      vec3 moss = texture2D(tMoss, vRW.xz / 5.0).rgb * vec3(1.05, 1.08, 0.85);
      float mk = smoothstep(0.55, 0.85, vRN.y + (texture2D(tMoss, vRW.xz / 2.3).g - 0.5) * 0.5);
      diffuseColor.rgb *= mix(rc, moss, mk);`);
}
// 草の房も地面と同じ色むら（lush）に従う
function addLushToGrass(sh) {
  Object.assign(sh.uniforms, { tNoiseG: { value: T.noise }, uLushTintG: { value: new THREE.Color(...(GROUND.lushTint || [1, 1, 1])) },
    uLushAmtG: { value: num('lush', GROUND.lushAmt ?? 0) }, uLushBiasG: { value: num('lushBias', GROUND.lushBias ?? 0) }, uGrassTintG: { value: new THREE.Color(...(GROUND.tuftTint || [1, 1, 1])) } });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tNoiseG; uniform vec3 uLushTintG, uGrassTintG; uniform float uLushAmtG, uLushBiasG; varying vec2 vGW;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 nzg = texture2D(tNoiseG, vGW / 28.0).rgb;
      float lushg = smoothstep(0.42 - uLushBiasG, 0.6 - uLushBiasG, nzg.r * 0.55 + nzg.g * 0.3 + nzg.b * 0.15);
      diffuseColor.rgb *= uGrassTintG * mix(vec3(1.0), uLushTintG, lushg * uLushAmtG);`);
}
// アイデア01（L22）: 地面と草の色の融合。草・低木の根元はその場所の地面の色（地面の材質と同じ式で求めた地色）を受け取り、
// 先へ向かって本来の色に戻す。gblend=1（URL）か spec.foliage.groundBlend で入れる。地面の頂点色（土・砂/石畳・岩）は読み込み後に
// 絵（SPLAT）に写して引く。対象は GB_ASSETS（草の房）。高さ uGBH m で本来の色へ戻る（根元の割合 uGBAmt）
const GBLEND = num('gblend', spec.foliage?.groundBlend ? 1 : 0) > 0;
// 対象は草の房だけ（L23）。茂み・羊歯・ラベンダーまで含めると、道際の茂みの下部が土色の輪になった（rules/ab-L22.md）。
// gbset=all で L22 の広い対象に戻せる（比較用）
const GB_ASSETS = q.get('gbset') === 'all' ? /^(grass_a|grass_tall_a|clover_a|clover_b|palm2_low|lavender|flowers_a)$/ : /^(grass_a|grass_tall_a)$/;
const GB = { tSplat: { value: null }, uST: { value: new THREE.Vector3(0, 0, 1) }, uGBAmt: { value: num('gbamt', 0.85) }, uGBH: { value: num('gbh', 0.32) } };
function buildSplat(terrainScene, tm) {
  // 地形の頂点色を、地形の格子と同じ解像度の絵に写す（R=土 G=砂/石畳 B=岩）
  const cell = spec.terrain.cell || 0.5, R = Math.round(tm.size / cell) + 1;
  const data = new Uint8Array(R * R * 4); const v = new THREE.Vector3();
  terrainScene.updateMatrixWorld(true);
  terrainScene.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.color || o.material?.name === 'water') return;
    const pos = o.geometry.attributes.position, col = o.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const ix = Math.round((v.x - tm.x0) / cell), iz = Math.round((v.z - tm.z0) / cell);
      if (ix < 0 || iz < 0 || ix >= R || iz >= R) continue;
      const k = (iz * R + ix) * 4;
      data[k] = col.getX(i) * 255; data[k + 1] = col.getY(i) * 255; data[k + 2] = col.getZ(i) * 255; data[k + 3] = 255;
    }
  });
  const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  GB.tSplat.value = t; GB.uST.value.set(tm.x0, tm.z0, (R - 1) * cell);
}
function addGroundBlend(sh) {
  Object.assign(sh.uniforms, GB, {
    tGrassB: { value: T.grass }, tNoiseB: { value: T.noise }, tDirtB: { value: T.dirt }, tAltB: { value: altTex },
    uGrassTintB: { value: new THREE.Color(...(GROUND.grassTint || [1, 1, 1])) }, uDirtTintB: { value: new THREE.Color(...(GROUND.dirtTint || [1, 1, 1])) },
    uAltTintB: { value: new THREE.Color(...(GROUND.altTint || [1, 1, 1])) }, uAltScaleB: { value: GROUND.altScale || 6.0 },
    uLushTintB: { value: new THREE.Color(...(GROUND.lushTint || [1, 1, 1])) }, uLushAmtB: { value: num('lush', GROUND.lushAmt ?? 0) }, uLushBiasB: { value: num('lushBias', GROUND.lushBias ?? 0) } });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGBroot; varying float vGBh;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 gbRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vGBroot = gbRoot.xz; vGBh = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y - gbRoot.y;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tSplat, tGrassB, tNoiseB, tDirtB, tAltB; uniform vec3 uST, uGrassTintB, uDirtTintB, uAltTintB, uLushTintB;
      uniform float uGBAmt, uGBH, uAltScaleB, uLushAmtB, uLushBiasB; varying vec2 vGBroot; varying float vGBh;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      {   // 根元の地面の地色（地面の材質と同じ式。岩は除く）
        vec2 wp = vGBroot; vec4 sp = texture2D(tSplat, (wp - uST.xy) / uST.z);
        vec3 g1 = texture2D(tGrassB, wp / 7.0).rgb, g2 = texture2D(tGrassB, wp / 19.0 + 0.37).rgb;
        vec3 gr = mix(g1, g2, 0.35) * uGrassTintB;
        gr *= mix(0.86, 1.1, smoothstep(0.25, 0.6, texture2D(tGrassB, wp / 61.0).g));
        vec3 nz = texture2D(tNoiseB, wp / 28.0).rgb;
        gr *= mix(vec3(1.0), uLushTintB, smoothstep(0.42 - uLushBiasB, 0.6 - uLushBiasB, nz.r * 0.55 + nz.g * 0.3 + nz.b * 0.15) * uLushAmtB);
        float n = dot(g1, vec3(0.33)) - 0.33;
        vec3 gcol = mix(gr, texture2D(tDirtB, wp / 6.0).rgb * uDirtTintB, smoothstep(0.4, 0.6, sp.r + n * 0.9));
        gcol = mix(gcol, texture2D(tAltB, wp / uAltScaleB).rgb * uAltTintB, smoothstep(0.4, 0.6, sp.g + n * 0.9));
        float kb = uGBAmt * (1.0 - smoothstep(0.0, uGBH, vGBh));
        diffuseColor.rgb = mix(diffuseColor.rgb, gcol, kb);
      }`);
}
const MSAA = num('msaa', spec.post?.msaa ?? 0);   // 0 = なし（前の撮影と同じ）、4 = 第 3 世代の規則
function fixMaterial(mesh, assetName = '') {
  const src = mesh.material;
  const isLeaf = /leaf|frond|grass/.test(src.name);
  const m = new THREE.MeshLambertMaterial({
    map: src.map || null, vertexColors: !!mesh.geometry.attributes.color,
    alphaTest: isLeaf ? (MSAA ? 0.25 : 0.5) : 0, side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    alphaToCoverage: isLeaf && MSAA > 0,   // 切り抜きの縁を MSAA の標本で半透明に（見本の葉の縁はなめらか）
  });
  m.name = src.name;
  if (isLeaf && FNORM_CARD) mesh.geometry.computeVertexNormals();   // 比較用: 板の向きの法線
  const isGrassMat = /grass/.test(src.name);
  const isRock2 = src.name === 'rock_crack';
  if (isRock2) { m.map = null; m.vertexColors = true; }
  const gbOn = GBLEND && GB_ASSETS.test(assetName);
  // three はシェーダーを onBeforeCompile の文字列で使い回すので、分岐ごとにキーを分ける（分けないとアイデア01が別の材質のシェーダーに埋もれる）
  m.customProgramCacheKey = () => `fix:${isLeaf}:${isGrassMat}:${isRock2}:${gbOn}`;
  m.onBeforeCompile = (sh) => {
    addDesat(sh, isLeaf && !isGrassMat ? LEAF_SAT : ALBEDO_SAT);
    if (isLeaf && !isGrassMat) {   // 葉の色味（草の房には掛けない）
      sh.uniforms.uLeafTint = LEAF_TINT;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLeafTint;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uLeafTint;');
    }
    if (!isGrassMat) addOcc(sh);
    if (isGrassMat) addLushToGrass(sh);
    if (isRock2) addRockTriplanar(sh);
    if (gbOn) addGroundBlend(sh);   // アイデア01
    if (!isLeaf) return;
    // 葉: 裏面で法線を反転させない（房として丸く光らせる）
    {
      sh.uniforms.uWrap = LEAF.wrap; sh.uniforms.uTrans = LEAF.trans; sh.uniforms.uLeafLift = isGrassMat ? { value: 0 } : LEAF.lift;   // 草の房は持ち上げない（地面の影の深さを保つ）
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' + (FNORM_CARD ? '' : 'normal = normalize(vNormal);'))
        .replace('#include <common>', '#include <common>\nuniform float uWrap, uTrans, uLeafLift;')
        // 葉だけの持ち上げ（葉の中の光の回り込み）: 地面の影は深いまま、葉の日陰だけ明るくする（E26）
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLeafLift;')
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
// 水の規則（rulebook 13 の水、見本 W01〜W05）: 地図の terrain.water.rule が 'w1' のときだけ。?wrule=0/1 で入／切
const WRULE = W ? num('wrule', W.rule === 'w1' ? 1 : 0) > 0 : false;
function waterMaterial() {
  return WRULE ? waterMaterialW1() : waterMaterialG2();
}
// 第 3 世代の水（w1）: 沖は砂の 0.6〜0.75 倍の明るさの青（hue 195〜210°）、浅瀬は明るい水色で底が透け、
// 底に光の網（コースティクス）。岸は白い泡の太線ではなく、レースの縁の淡い帯。沖に輪の波は描かず、小さなきらめきと波の筋
function waterMaterialW1() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tH: { value: heightTex }, tN: { value: T.noise }, uTime: TIME,
      uT: { value: new THREE.Vector4(TM.x0, TM.z0, TM.size, TM.shoreMax || 0) }, uHR: { value: new THREE.Vector3(TM.hmin, TM.hmax, W.level) },
      uShallow: { value: new THREE.Color(W.shallowW1 || '#629aa3') }, uDeep: { value: new THREE.Color(W.colorW1 || '#40778f') },
      uWD: { value: new THREE.Vector4(num('wdeep', W.deepAt ?? 2.6), num('wcaus', W.causticAt ?? 1.6), num('wband', W.bandAt ?? 0.28), num('wglint', W.glint ?? 1.0)) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tH, tN; uniform vec4 uT, uWD; uniform vec3 uHR, uShallow, uDeep; uniform float uTime; varying vec3 vW;
      vec2 wHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // 細胞の縁の近さ（0 = 縁）。光の網と泡のレースに使う
      float wCell(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 o = wHash(i + g); o = 0.5 + 0.38 * sin(t + 6.2831 * o);
          float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return d2 - d1;
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 huv = vec2((vW.x - uT.x) / uT.z, 1.0 - (vW.z - uT.y) / uT.z);
      vec4 hs = texture2D(tH, huv);
      float th = mix(uHR.x, uHR.y, hs.r);
      float depth = uHR.z - th;
      float sdist = hs.g * uT.w;                                      // 岸からの距離（m、build_map.py が焼いた距離場）
      float nz = texture2D(tN, vW.xz / 11.0 + uTime * 0.008).r;
      float nz2 = texture2D(tN, vW.xz * vec2(0.09, 0.22) - uTime * vec2(0.004, 0.012)).r;
      float dd = depth + (nz - 0.5) * 0.5;
      // 深さの帯: 岸の浅瀬は暗い灰緑（底が沈んで見える。W01・W05 の網の目の中）→ 沖の青（hue 195〜210°）
      // 深さか岸からの距離の深い方で決める（底の浅い海でも沖が青くなる。south_coast_g3 は深さ 1.2〜1.6m）
      vec3 wc = mix(uShallow, uDeep, max(smoothstep(uWD.y * 0.5, uWD.x, dd), smoothstep(2.5, 7.0, sdist + (nz - 0.5) * 1.5)));
      // 波の筋（沖の明るさの揺れ ±8%）
      wc *= 0.92 + 0.16 * nz2;
      // 寄せる波の泡（W01・W04）: 岸からの距離場の等しい距離の線（= 岸と同じ形の白い線）が寄せては引く。
      // 線と岸の間だけに、崩れた泡が網目のレースで残る。線より沖に泡はない（定番の shoreline distance field の帯）
      float reach = uWD.y;                                            // 泡の届く距離（m、波の線のいちばん沖）
      float ph = fract(uTime * 0.08);                                 // 寄せて引く 1 周（12.5 秒）
      float front = reach * (0.3 + 0.7 * (1.0 - ph));                 // 波の線: 沖から岸へ寄せる
      float fd = sdist + (nz2 - 0.5) * 0.5;
      float line = smoothstep(0.16, 0.0, abs(fd - front)) * smoothstep(0.0, 0.15, ph) * (0.6 + 0.4 * nz);
      // 1 つ前の波の線（岸寄りで薄れていく）
      float front2 = front * 0.45;
      line = max(line, 0.6 * smoothstep(0.12, 0.0, abs(fd - front2)) * (1.0 - ph));
      // 線と岸の間の崩れた泡のレース
      vec2 cp = vW.xz * 2.0 + (vec2(nz, nz2) - 0.5) * 1.6;
      float cw = wCell(cp, uTime * 0.3);
      float inside = smoothstep(front + 0.1, front - 0.3, fd);         // 線より岸側
      float lace = smoothstep(0.06, 0.012, cw) * inside * smoothstep(reach * 0.85, 0.0, fd) * (0.5 + 0.5 * smoothstep(0.3, 0.6, nz2));   // 岸ほど密、沖へ途切れる
      // 水際の帯: 泡が詰まって明るい
      float band = smoothstep(uWD.z, 0.0, sdist) * (0.6 + 0.4 * smoothstep(0.2, 0.05, cw));
      float edge = clamp(max(max(line, lace * 0.75), band), 0.0, 1.0);
      wc = mix(wc, vec3(0.80, 0.88, 0.74), edge * 0.85);
      // 沖のきらめき: まばらで横に細長い白い点
      vec2 gq = mat2(0.8, -0.6, 0.6, 0.8) * vW.xz;                  // 絵の繰り返しが列に並ばないよう回す
      float gl = texture2D(tN, gq * vec2(1.3, 3.6) + vec2(uTime * 0.03, 0.0)).r * texture2D(tN, vW.xz * vec2(0.9, 2.5) - vec2(0.0, uTime * 0.02)).r;
      float glint = smoothstep(0.60, 0.64, gl) * smoothstep(0.6, 1.8, dd) * uWD.w;
      wc = mix(wc, vec3(1.0), glint);
      diffuseColor.rgb = wc;
      // 浅瀬は底が透ける。沖は不透明に近い
      diffuseColor.a = mix(0.62, 0.97, max(smoothstep(0.05, 1.4, depth), smoothstep(1.0, 5.0, sdist))) + edge * 0.4 + glint;`);
  };
  return m;
}
function waterMaterialG2() {
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
    o.material = waterMaterial(); o.receiveShadow = num('wshadow', WRULE ? 0 : 1) > 0;   // w1 は水面に影を受けない（透ける水面に VSM の影が縦の筋になった。見本でも水面に木の影はほぼ落ちない） o.renderOrder = 2;
  } else {
    o.material = groundMaterial(); o.receiveShadow = true;
  }
});
scene.add(terrain.scene);
if (GBLEND && placed.terrain) buildSplat(terrain.scene, placed.terrain);   // アイデア01: 地面の頂点色を絵に

const SKIP = new Set(flag('grass') ? [] : ['grass_a']);
const assetNames = Object.keys(placed.assets).filter((a) => !SKIP.has(a));
const dummy = new THREE.Object3D();
await Promise.all(assetNames.map(async (name) => {
  const shadowOnly = name.endsWith('@shadow');          // 映らないが影だけ落とす
  const g = await load(`${BASE}${q.get('adir') || 'assets'}/${name.replace('@shadow', '')}.glb`);
  const items = placed.assets[name];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mat = fixMaterial(o, name);
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
    if (shadowOnly) { mat.colorWrite = false; mat.depthWrite = false; im.receiveShadow = false; im.castShadow = flag('casters'); }
    im.frustumCulled = false;
    scene.add(im);
  });
}));

// ---------------------------------------------------------------- 仕上げ
// 縁のなめらかさ（L21）: 仕上げの描画先に MSAA を持たせる。EffectComposer の既定の描画先は MSAA なしで、葉・草の切り抜きと物の輪郭がぎざぎざになっていた
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: MSAA }));
composer.addPass(new RenderPass(scene, camera));
const outPass = new OutputPass();   // トーンマップと sRGB をここで済ませ、以降は表示の色で扱う
if (renderer.toneMapping === THREE.CustomToneMapping) {
  // r160 の OutputPass は CustomToneMapping の定義を作らない（L22 で発見: L21 の tone "lum" は効いておらず、階調の圧縮も露出もない
  // 「0〜1 で切るだけ」になっていた）。分岐を足し、定義を固定して作り直させない
  outPass.material.fragmentShader = outPass.material.fragmentShader.replace('#ifdef LINEAR_TONE_MAPPING',
    '#ifdef CUSTOM_TONE_MAPPING\n\t\t\t\tgl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );\n\t\t\t#elif defined( LINEAR_TONE_MAPPING )');
  outPass._toneMapping = renderer.toneMapping; outPass._outputColorSpace = renderer.outputColorSpace;
  outPass.material.defines = { SRGB_TRANSFER: '', CUSTOM_TONE_MAPPING: '' }; outPass.material.needsUpdate = true;
}
composer.addPass(outPass);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: num('sat', P.sat) }, uCon: { value: num('contrast', P.contrast) },
    uLift: { value: new THREE.Vector3(...P.lift) }, uGain: { value: new THREE.Vector3(...P.gain) }, uVig: { value: 0 }, uTopDark: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig, uTopDark; uniform vec3 uLift, uGain; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * uCon + 0.5;
      c.rgb += uLift * (1.0 - l);
      c.rgb *= mix(vec3(1.0), uGain, smoothstep(0.2, 0.8, l));
      c.rgb *= 1.0 - uVig * smoothstep(0.3, 0.85, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c.rgb *= 1.0 - uTopDark * smoothstep(0.62, 1.0, vUv.y);
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

// ビューの照明の上書き（見本のカットシーンなど、カメラ演出が違う見本に合わせる）
const LIGHT0 = { sun: sun.intensity, hemi: hemi.intensity, exposure: renderer.toneMappingExposure, sat: grade.uniforms.uSat.value };
function applyLight(L = {}) {
  sun.intensity = LIGHT0.sun * (L.sun ?? 1); hemi.intensity = LIGHT0.hemi * (L.hemi ?? 1);
  renderer.toneMappingExposure = LIGHT0.exposure * (L.exposure ?? 1); grade.uniforms.uSat.value = LIGHT0.sat * (L.sat ?? 1);
  grade.uniforms.uVig.value = L.vignette ?? 0; grade.uniforms.uTopDark.value = L.topDark ?? 0;
}
applyLight(C.light);

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
if (spec.views) { target.y = groundY(target.x, target.z); placeCamera(); fitShadow(); }   // 区画のある地図: 注目点を地面に置く
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
// 撮影用: 読み込み済みのまま別のビューへ切り替える（views.mjs が使う）
window.__setView = (v, base) => {
  const c = resolveView(v, base);
  applyLight(c.light);
  target.set(...c.target); target.y = groundY(target.x, target.z);
  Object.assign(camState, { yaw: c.yaw, pitch: c.pitch, dist: c.dist }); TY = c.ty ?? 0;
  camera.fov = c.fov; camera.updateProjectionMatrix();
  marker.position.set(target.x, target.y + 0.85, target.z);
  placeCamera(); fitShadow(); return true;
};
window.__renderOnce = () => { window.__pause = true; renderer.info.autoReset = false; renderer.info.reset(); composer.render(); window.__info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; return true; };
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); dof.uniforms.uRes.value.set(innerWidth, innerHeight);
});
requestAnimationFrame(tick);
let frames = 0;
(function wait() { if (++frames > 3) window.__ready = true; else requestAnimationFrame(wait); })();
window.__world = { scene, camera, renderer, spec, placed };
