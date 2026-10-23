// ワールドの実行環境（three.js）。Blender で作った地形・アセット・配置を読み込んで描く。
//   URL: worldart/index.html?map=orc_meadow
//   実験用の切り替え（すべて省略可。省略時は地図 JSON の値）:
//     fov pitch dist yaw          カメラ
//     sunEl sunAz sun hemi        太陽の高度・方位・強さ、空の光の強さ
//     sat contrast                仕上げの彩度・コントラスト
//     post=0                      仕上げ（色調・ぼかし）をすべて切る
//     dof=0                       奥と手前のぼかしだけ切る
//     diff=0.15                   画面全体のにじみ（0〜1、既定 0）
//     diffr=0.012                 にじみの半径（画面の高さに対する割合）
//     diffm=mix|screen            にじみの混ぜ方（既定 mix）
//     diffmask=none|depth|edge|veg|soft|lum  にじみをかける範囲（既定 none = 全面）
//     diffd0 / diffd1             depth の距離範囲（既定: 注視点までの距離の 0.8〜1.6 倍）
//     diffe=0.08                  edge の輝度勾配しきい値、diffdebug=1 でマスクを表示
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
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const flag = (k, d = true) => (q.has(k) ? q.get(k) !== '0' : d);
const MAP = q.get('map') || 'orc_meadow';
const BASE = './';
// 手前を抜く範囲（カメラ・注目点・半径）。placeCamera が更新する
const OCC = { cam: { value: new THREE.Vector3() }, tgt: { value: new THREE.Vector3() }, r: { value: num('occR', 2.2) } };

const spec = await (await fetch(`${BASE}maps/${MAP}.json`)).json();
const placed = await (await fetch(`${BASE}maps/${MAP}/placements.json`)).json();
const P = Object.assign({ sat: 1.0, contrast: 1.0, lift: [0, 0, 0], gain: [1, 1, 1], dof: 1.0, exposure: 1.0, diff: 0, diffR: 0.012, diffMode: 'mix' }, spec.post || {});
const diffAmt = THREE.MathUtils.clamp(num('diff', P.diff), 0, 1);
const diffRadius = Math.max(0, num('diffr', P.diffR));
const diffMode = (q.get('diffm') || P.diffMode) === 'screen' ? 'screen' : 'mix';
const diffMaskValue = q.has('diffmask') ? q.get('diffmask') : (P.diffMask || 'none');
const diffMask = ['depth', 'edge', 'veg', 'soft', 'lum'].includes(diffMaskValue) ? diffMaskValue : 'none';
const diffDebug = flag('diffdebug', false);
const diffDepth0 = q.has('diffd0') && Number.isFinite(num('diffd0', NaN)) ? Math.max(0, num('diffd0', 0)) : null;
const diffDepth1 = q.has('diffd1') && Number.isFinite(num('diffd1', NaN)) ? Math.max(0, num('diffd1', 0)) : null;
const diffEdge = Math.max(0.0001, num('diffe', 0.08));

// ---------------------------------------------------------------- レンダラー
const renderer = new THREE.WebGLRenderer({ antialias: true });
// 内部の解像度（L27 仮説 C）: rscale=0.67 などで小さく描き、ブラウザが引き伸ばす（現代のゲームの解像度の倍率 + 時間方向の AA のやわらかさの代わり）
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * num('rscale', 1));
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
const GROUND_BAKE = THREE.MathUtils.clamp(num('bake', 0), 0, 1);
let skyvisTex = null;
if (GROUND_BAKE > 0) {
  try {
    skyvisTex = await new Promise((resolve) => texLoader.load(`${BASE}maps/${MAP}/skyvis.png`, resolve, undefined, () => resolve(null)));
    if (skyvisTex) {
      skyvisTex.colorSpace = THREE.NoColorSpace;
      skyvisTex.minFilter = THREE.LinearFilter;
      skyvisTex.magFilter = THREE.LinearFilter;
    }
  } catch {}
}
const GROUND_BAKE_ON = !!(GROUND_BAKE > 0 && skyvisTex && placed.terrain);
function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false });
  m.customProgramCacheKey = () => `ground:skyvis-${GROUND_BAKE_ON ? 1 : 0}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: T.grass }, tNoise: { value: T.noise }, tDirt: { value: T.dirt }, tAlt: { value: altTex }, tRock: { value: rockTex }, uRockScale: { value: rockScale }, uRockPix: { value: GROUND.rockPix ? 1 : 0 }, uRockSoft: { value: num('rsoft', GROUND.rockSoft ?? 0) }, uRockTint: { value: new THREE.Color(...(GROUND.rockTint || [1, 1, 1])) },
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
        uniform sampler2D tGrass, tDirt, tAlt, tRock, tNoise; uniform vec3 uGrassTint, uDirtTint; uniform float uAltScale, uRockScale, uRockPix, uRockSoft; uniform vec2 uWater; uniform vec3 uRockTint, uLushTint, uAltTint; uniform float uLushAmt, uLushBias;
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
        // 岩の細部のコントラストを弱める（L27 仮説 D「直線を残さない」）: 粗いミップ（bias 4）の大きな明暗へ uRockSoft だけ寄せ、割れ目の線を浅くする
        vec3 rockLo = texture2D(tRock, vW.zy / uRockScale, 4.0).rgb * an.x + texture2D(tRock, vW.xy / uRockScale, 4.0).rgb * an.z + texture2D(tRock, vW.xz / uRockScale, 4.0).rgb * an.y;
        rock = mix(rock, rockLo, uRockSoft);
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
    if (GROUND_BAKE_ON) {
      sh.uniforms.tSkyvis = { value: skyvisTex };
      sh.uniforms.uSkyvisOrigin = { value: new THREE.Vector2(placed.terrain.x0, placed.terrain.z0) };
      sh.uniforms.uSkyvisSize = { value: placed.terrain.size };
      sh.uniforms.uBake = { value: GROUND_BAKE };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tSkyvis; uniform vec2 uSkyvisOrigin; uniform float uSkyvisSize, uBake;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          float skyVisibility = texture2D(tSkyvis, (vW.xz - uSkyvisOrigin) / uSkyvisSize).r;
          reflectedLight.indirectDiffuse *= mix(1.0, skyVisibility, uBake);`);
    }
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
const PRELIT = Math.max(0.0, Math.min(1.0, num('prelit', 0.0)));
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
// L27 仮説 E: 現在の葉の明暗と、幹からの高さ・球状法線で描いた明暗を混ぜる。
function addPrelitLeaves(sh, height, amount) {
  Object.assign(sh.uniforms, { uPrelitAmount: { value: amount }, uPrelitHeight: { value: height } });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vPrelitHeight; varying float vPrelitNormalY;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrelitHeight = position.y; vPrelitNormalY = normal.y;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPrelitAmount, uPrelitHeight; varying float vPrelitHeight, vPrelitNormalY;')
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
      float ph = clamp(vPrelitHeight / max(uPrelitHeight, 0.001), 0.0, 1.0);
      float pn = clamp(vPrelitNormalY, 0.0, 1.0);
      float paintedLight = smoothstep(0.04, 0.94, ph * 0.68 + pn * 0.32);
      vec3 paintedTint = mix(vec3(0.55, 0.78, 0.84), vec3(1.34, 1.25, 0.72), paintedLight);
      vec3 litLeaf = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
      vec3 paintedLeaf = diffuseColor.rgb * paintedTint;
      totalEmissiveRadiance += (paintedLeaf - litLeaf) * uPrelitAmount;`);
}
// clover_bb: 頂点色に格納した板中心のまわりで回し、各板をカメラ正面へ向ける。
function addCloverBillboard(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCenter;')
    .replace('#include <project_vertex>', `
      vec3 bbCenter = vec3((aCenter.r - 0.5) * 2.2, aCenter.g * 1.2, (aCenter.b - 0.5) * 2.2);
      mat4 bbModel = modelMatrix * instanceMatrix;
      vec3 bbCenterWorld = (bbModel * vec4(bbCenter, 1.0)).xyz;
      vec3 bbOffsetWorld = (bbModel * vec4(position - bbCenter, 0.0)).xyz;
      vec3 bbUpWorld = normalize((bbModel * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      float bbVertical = dot(bbOffsetWorld, bbUpWorld);
      float bbWidth = length(bbOffsetWorld - bbUpWorld * bbVertical) * (uv.x < 0.5 ? -1.0 : 1.0);
      vec3 bbCenterView = (viewMatrix * vec4(bbCenterWorld, 1.0)).xyz;
      vec4 mvPosition = vec4(bbCenterView + vec3(bbWidth, bbVertical, 0.0), 1.0);
      gl_Position = projectionMatrix * mvPosition;`);
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
// 頂点 AO を環境光にも掛ける（L27）: アセットの頂点色の AO は地色に掛かるので、日なたと日陰を同じ割合で暗くし、明暗比を変えない。
// 定番の AO（three の aoMap と同じ）は間接光だけを遮る。間接光に頂点色の明るさの uAoAmb 乗を掛け、葉の塊の奥・幹の日陰を深くする。
// aoamb=<乗数>（URL）か spec.foliage.aoAmb。対象は aoset=leaf（葉。草の房は除く、既定）か all（頂点色のあるアセット全部）
const AO_AMB = { value: num('aoamb', spec.foliage?.aoAmb ?? 0) };
const AO_ALL = (q.get('aoset') || spec.foliage?.aoSet || 'leaf') === 'all';
// 葉の絵の縁の色を外へ広げる（L27 仮説 A、alpha bleeding）: 透明な所の色が黒なので、ミップマップと補間で黒が縁に混ざり、
// 葉の縁が暗い線・点々になる。不透明な画素（a >= 200）の色を透明側へ広げる（alpha は変えない）。ldil=1（URL）か spec.foliage.dilate
const LDIL = num('ldil', spec.foliage?.dilate ? 1 : 0) > 0;
const dilCache = new Map();
function dilateMap(tex) {
  if (!tex?.image || dilCache.has(tex)) return dilCache.get(tex) || tex;
  const img = tex.image, w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const id = cx.getImageData(0, 0, w, h), d = id.data, n = w * h;
  const A = new Uint8Array(n); for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3];
  const filled = new Uint8Array(n); for (let i = 0; i < n; i++) filled[i] = A[i] >= 200 ? 1 : 0;
  // 1 画素ずつ外へ: まだ埋まっていない画素に、埋まった 8 近傍の平均の色を入れる（32 回、絵の端は折り返し）
  for (let pass = 0; pass < 32; pass++) {
    const next = filled.slice(); let any = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (filled[i]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = ((y + dy + h) % h) * w + ((x + dx + w) % w);
        if (filled[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; c++; }
      }
      if (c) { d[i * 4] = r / c; d[i * 4 + 1] = g / c; d[i * 4 + 2] = b / c; next[i] = 1; any = true; }
    }
    filled.set(next); if (!any) break;
  }
  for (let i = 0; i < n; i++) d[i * 4 + 3] = A[i];
  cx.putImageData(id, 0, 0);
  const t = tex.clone(); t.image = cv; t.needsUpdate = true;
  dilCache.set(tex, t); return t;
}
// 葉の絵の差し替え（L27 仮説 A2）: ltex=<フォルダ>（public/worldart の下）の index.json に書いた名前の絵を、GLB の中の同じ名前の絵の代わりに使う。
// アセットを組み直さずに、描き方を変えた葉の絵を入／切で比べるため
const LTEX = new Map();
if (q.get('ltex')) {
  const dir = `${BASE}${q.get('ltex')}`;
  const names = await (await fetch(`${dir}/index.json`)).json();
  await Promise.all(names.map(async (nm) => LTEX.set(nm, await texLoader.loadAsync(`${dir}/${nm}.png`))));
}
function swapMap(tex) {
  const t = tex && LTEX.get(tex.name);
  if (!t) return tex;
  const c = t.clone(); c.flipY = tex.flipY; c.colorSpace = tex.colorSpace; c.wrapS = tex.wrapS; c.wrapT = tex.wrapT;
  c.anisotropy = tex.anisotropy; c.name = tex.name; c.needsUpdate = true; return c;
}
const MSAA = num('msaa', spec.post?.msaa ?? 0);   // 0 = なし（前の撮影と同じ）、4 = 第 3 世代の規則
function fixMaterial(mesh, assetName = '', modelName = assetName) {
  const src = mesh.material;
  const isLeaf = /leaf|frond|grass/.test(src.name);
  const isGrassMat = /grass/.test(src.name);
  const isCloverBB = modelName === 'clover_bb';
  const prelitOn = PRELIT > 0 && isLeaf && !isGrassMat && !isCloverBB;
  const m = isCloverBB ? new THREE.MeshBasicMaterial({
    map: src.map || null, vertexColors: false,
    alphaTest: MSAA ? 0.25 : 0.5, side: THREE.DoubleSide,
    alphaToCoverage: MSAA > 0,
  }) : new THREE.MeshLambertMaterial({
    map: src.map || null, vertexColors: !!mesh.geometry.attributes.color,
    alphaTest: isLeaf ? (MSAA ? 0.25 : 0.5) : 0, side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    alphaToCoverage: isLeaf && MSAA > 0,   // 切り抜きの縁を MSAA の標本で半透明に（見本の葉の縁はなめらか）
  });
  m.name = src.name;
  if (isCloverBB) m.userData.cloverBillboard = true;
  if (isLeaf && LTEX.size && m.map) m.map = swapMap(m.map);
  if (isLeaf && LDIL && m.map) m.map = dilateMap(m.map);
  if (isLeaf && FNORM_CARD) mesh.geometry.computeVertexNormals();   // 比較用: 板の向きの法線
  const isRock2 = src.name === 'rock_crack';
  if (isRock2) { m.map = null; m.vertexColors = true; }
  const gbOn = GBLEND && GB_ASSETS.test(assetName);
  // three はシェーダーを onBeforeCompile の文字列で使い回すので、分岐ごとにキーを分ける（分けないとアイデア01が別の材質のシェーダーに埋もれる）
  const aoOn = m.vertexColors && !isGrassMat && (isLeaf || AO_ALL);
  m.customProgramCacheKey = () => `fix:${isLeaf}:${isGrassMat}:${isRock2}:${gbOn}:${aoOn}:prelit-${prelitOn}:clover-bb-${isCloverBB}`;
  if (isCloverBB) {
    m.onBeforeCompile = addCloverBillboard;
    return m;
  }
  m.onBeforeCompile = (sh) => {
    addDesat(sh, isLeaf && !isGrassMat ? LEAF_SAT : ALBEDO_SAT);
    if (aoOn) {
      sh.uniforms.uAoAmb = AO_AMB;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAoAmb;')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= pow(clamp(dot(vColor.rgb, vec3(0.3333)), 0.0, 1.0), uAoAmb);');
    }
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
    if (prelitOn) {
      mesh.geometry.computeBoundingBox();
      addPrelitLeaves(sh, Math.max(0.1, mesh.geometry.boundingBox.max.y), PRELIT);
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
      uShallow: { value: new THREE.Color(W.shallowW1 || '#629aa3') }, uDeep: { value: new THREE.Color(W.colorW1 || '#3a6e87') },
      uWD: { value: new THREE.Vector4(num('wdeep', W.deepAt ?? 2.6), num('wcaus', W.causticAt ?? 1.6), num('wband', W.bandAt ?? 0.28), num('wglint', W.glint ?? 0.0)) },
      uSun: { value: sunDir }, uSky: { value: new THREE.Color(spec.sky?.color || '#cfe0ee') }, uRefl: { value: num('wrefl', W.refl ?? 1.0) },
      uSG: { value: new THREE.Vector2(num('wsg', W.surfScale ?? 0.32), num('wsa', W.surfAmt ?? 2.0)) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tH, tN; uniform vec4 uT, uWD; uniform vec3 uHR, uShallow, uDeep, uSun, uSky; uniform float uTime, uRefl; uniform vec2 uSG; varying vec3 vW;
      vec3 wRefl = vec3(0.0);   // 反射（光の当たり方に掛けない。emissive に足す）
      // 波の高さ（2 つの流れるノイズ）。法線を作って、太陽の映りと空の映りに使う
      float wWave(vec2 p, float t) { p *= vec2(0.8, 1.15); return texture2D(tN, p * 0.13 + t * vec2(0.012, 0.006)).r + 0.6 * texture2D(tN, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.29 - t * vec2(0.007, 0.016)).r; }   // 少しだけ横に長い波。見本の筋はそろいが弱く（0.2〜0.5）、くり返しの間隔がない
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
      // 水面の細かい明暗（見本の沖の模様: 粒 横 0.5〜0.7m・縦 0.25〜0.3m、横長 1.5〜2.8、明るさの揺れ 0.045〜0.066。
      // 筋の向きはそろいが弱い）。2 つの向きのノイズを重ね、明暗の量は揺れに合わせる
      vec2 sq = vW.xz * vec2(1.0, 1.05) * uSG.x;
      float surf = texture2D(tN, sq + uTime * vec2(0.010, 0.004)).r * 0.6 + texture2D(tN, mat2(0.87, -0.5, 0.5, 0.87) * sq * 1.7 - uTime * vec2(0.006, 0.011)).r * 0.4;
      float deepish = smoothstep(0.6, 2.5, max(dd, sdist * 0.6));     // 浅瀬では揺らさない（底の砂が透けて茶色く濁った、v20）
      wc *= 1.0 + (surf - 0.5) * uSG.y * 0.45 * deepish;
      // 明るい短い波頭の筋（見本の明るさの分布は明るい側に偏る: 歪度 1.3〜3.4、上位 1% は中央 +0.2）
      float crest = smoothstep(0.60, 0.78, texture2D(tN, sq * vec2(1.6, 2.6) + vec2(uTime * 0.02, 0.0)).r * 0.55 + surf * 0.45);
      wc += vec3(0.20, 0.27, 0.28) * crest * deepish;
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
      float edge = clamp(max(max(line * 0.6, lace * 0.45), band * 0.7), 0.0, 1.0);   // 泡は半透明（白く塗りつぶさない）
      wc = mix(wc, vec3(0.82, 0.90, 0.80), edge * 0.75);
      // 沖の反射（定番のトゥーンの鏡面反射: 揺らした法線で太陽の映りを計算し、しきい値で切って白い点に。
      // 見る角度で空の色を映すフレネル）。泡の上と浅瀬では弱く
      vec2 e = vec2(0.12, 0.0);
      float hx = wWave(vW.xz + e.xy, uTime) - wWave(vW.xz - e.xy, uTime), hz = wWave(vW.xz + e.yx, uTime) - wWave(vW.xz - e.yx, uTime);
      vec3 wn = normalize(vec3(-hx * 3.2, 1.0, -hz * 3.2));
      vec3 wv = normalize(cameraPosition - vW);
      float open = smoothstep(0.4, 2.0, max(dd, sdist * 0.5)) * (1.0 - edge);
      vec3 wh = normalize(uSun + wv);
      float sheen = 0.0;   // 大きな波の明るみは見本にない（大きな白っぽい斑になった、v19）
      // きらめきは細かい波（大きな波の 3.5 倍の細かさ、横に細長く）の法線で。小さく横に細長い白い点（W05）
      vec2 gp = vW.xz * vec2(2.6, 7.0);
      float gx = wWave(gp + e.xy, uTime * 2.0) - wWave(gp - e.xy, uTime * 2.0), gz = wWave(gp + e.yx, uTime * 2.0) - wWave(gp - e.yx, uTime * 2.0);
      vec3 gn = normalize(wn + vec3(-gx * 2.5, 0.0, -gz * 2.5));
      float glint = smoothstep(0.75, 0.9, pow(max(dot(gn, wh), 0.0), 260.0)) * smoothstep(0.55, 0.7, nz) * open * uWD.w;   // たまに出る小さな点（ゆっくり動く斑の明るい所だけ）
      float fres = pow(1.0 - max(dot(wn, wv), 0.0), 4.0) * open;           // 空の映り
      wRefl = (uSky * (fres * 0.12 + sheen) + vec3(1.0) * glint * 0.9) * uRefl;
      diffuseColor.rgb = wc;
      // 浅瀬は底が透ける。沖は不透明に近い
      diffuseColor.a = mix(0.62, 0.97, max(smoothstep(0.05, 1.4, depth), smoothstep(1.0, 5.0, sdist))) + edge * 0.25 + glint;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n      totalEmissiveRadiance += wRefl;');
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
    o.userData.diffMaskGround = false;
    o.material = waterMaterial(); o.receiveShadow = num('wshadow', WRULE ? 0 : 1) > 0;   // w1 は水面に影を受けない（透ける水面に VSM の影が縦の筋になった。見本でも水面に木の影はほぼ落ちない） o.renderOrder = 2;
  } else {
    o.userData.diffMaskGround = true;
    o.material = groundMaterial(); o.receiveShadow = true;
  }
});
scene.add(terrain.scene);
if (GBLEND && placed.terrain) buildSplat(terrain.scene, placed.terrain);   // アイデア01: 地面の頂点色を絵に

const SKIP = new Set(flag('grass') ? [] : ['grass_a']);
const assetNames = Object.keys(placed.assets).filter((a) => !SKIP.has(a));
const assetSwap = new Map((q.get('aswap') || '').split(',').map((pair) => pair.split(':')).filter(([from, to]) => from && to));
const dummy = new THREE.Object3D();
await Promise.all(assetNames.map(async (name) => {
  const shadowOnly = name.endsWith('@shadow');          // 映らないが影だけ落とす
  const sourceName = name.replace('@shadow', '');
  const loadName = assetSwap.get(sourceName) || sourceName;
  const g = await load(`${BASE}${q.get('adir') || 'assets'}/${loadName}.glb`);
  const items = placed.assets[name];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (loadName === 'clover_bb' && o.geometry.attributes.color) o.geometry.setAttribute('aCenter', o.geometry.attributes.color);
    const mat = fixMaterial(o, name, loadName);
    const im = new THREE.InstancedMesh(o.geometry, mat, items.length);
    im.userData.diffMaskIgnore = shadowOnly;
    items.forEach(([x, y, z, r, s], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix.clone().multiply(o.matrixWorld));
    });
    const isGrass = name.startsWith('grass');
    im.castShadow = !isGrass; im.receiveShadow = !/leaf|frond/.test(mat.name) || LEAF.receive;
    if (/leaf|frond|grass/.test(mat.name)) {
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest || 0.5 });
      if (mat.userData.cloverBillboard) {
        depth.side = THREE.DoubleSide;
        depth.customProgramCacheKey = () => 'clover-bb-depth';
        depth.onBeforeCompile = addCloverBillboard;
      }
      im.customDepthMaterial = depth;
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
// 画面全体のにじみ。半分の解像度に縮小し、横・縦のガウスぼかしを別々にかける
const DIFF_MASK_CODE = { depth: 1, edge: 2, veg: 3, soft: 4, lum: 5 };
const DIFF_VEGETATION = /leaf|frond|grass|clover|foliage|vegetation|bush|shrub|plant/i;
const DIFF_WHITE_TEXTURE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
DIFF_WHITE_TEXTURE.needsUpdate = true;
const DIFF_MASK_CAMERA = { value: new THREE.Vector3() };

function diffMaskMaterial(source, include) {
  const map = source?.map || null;
  if (map) map.updateMatrix();
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map || DIFF_WHITE_TEXTURE }, uHasMap: { value: map ? 1 : 0 },
      uAlphaTest: { value: source?.alphaTest || 0 }, uKind: { value: include ? 1 : 0 },
      uMapTransform: { value: map ? map.matrix : new THREE.Matrix3() }, uCamera: DIFF_MASK_CAMERA,
    },
    vertexShader: `#include <common>
      uniform mat3 uMapTransform;
      varying vec2 vMaskUv;
      varying vec3 vWorldPos;
      void main() {
        vMaskUv = (uMapTransform * vec3(uv, 1.0)).xy;
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        vec4 worldPosition = modelMatrix * localPosition;
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }`,
    fragmentShader: `uniform sampler2D uMap;
      uniform float uHasMap, uAlphaTest, uKind;
      uniform vec3 uCamera;
      varying vec2 vMaskUv;
      varying vec3 vWorldPos;
      void main() {
        if (uHasMap > 0.5 && uAlphaTest > 0.0 && texture2D(uMap, vMaskUv).a < uAlphaTest) discard;
        gl_FragColor = vec4(uKind, length(vWorldPos - uCamera), 0.0, 1.0);
      }`,
    side: source?.side ?? THREE.FrontSide,
    depthTest: true, depthWrite: true, transparent: false, toneMapped: false,
  });
}

class DiffusionPass extends Pass {
  constructor(amt, radius, mode, maskType = 'none', debug = false) {
    super();
    this.amt = amt;
    this.radius = radius;
    this.maskType = maskType;
    this.debug = debug;
    this.masked = maskType !== 'none' || debug;
    this.needsObjectMask = ['depth', 'veg', 'soft'].includes(maskType);
    this.maskTarget = this.needsObjectMask
      ? new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false })
      : null;
    this.maskObjects = null;
    this.maskMaterials = [];
    if (this.maskTarget) {
      this.maskBackgroundMaterial = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: 'void main(){ gl_FragColor = vec4(0.0, 600.0, 0.0, 1.0); }',
        depthTest: false, depthWrite: false, toneMapped: false,
      });
      this.maskBackgroundQuad = new FullScreenQuad(this.maskBackgroundMaterial);
    }
    this.halfA = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: false });
    this.halfB = this.halfA.clone();
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uAxis: { value: new THREE.Vector2(1, 0) }, uSigma: { value: 0 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel, uAxis; uniform float uSigma; varying vec2 vUv;
        void main() {
          vec3 sum = vec3(0.0); float total = 0.0;
          float spread = max(uSigma * 0.5, 0.001);
          for (int i = -4; i <= 4; i++) {
            float x = float(i); float w = exp(-0.125 * x * x);
            sum += texture2D(tDiffuse, vUv + uAxis * uTexel * (x * spread)).rgb * w;
            total += w;
          }
          gl_FragColor = vec4(sum / total, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const uniforms = { tDiffuse: { value: null }, tBlur: { value: null }, uAmt: { value: amt }, uScreen: { value: mode === 'screen' ? 1 : 0 } };
    const legacyFragment = `uniform sampler2D tDiffuse, tBlur; uniform float uAmt, uScreen; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 blur = texture2D(tBlur, vUv).rgb;
          vec3 result = mix(c, blur, uAmt);
          if (uScreen > 0.5) result = vec3(1.0) - (vec3(1.0) - c) * (vec3(1.0) - blur * uAmt);
          gl_FragColor = vec4(result, 1.0);
        }`;
    const maskedFragment = `uniform sampler2D tDiffuse, tBlur, tMask;
      uniform float uAmt, uScreen, uMaskMode, uDebug, uD0, uD1, uEdge;
      uniform vec2 uTexel, uMaskTexel;
      varying vec2 vUv;
      float luminance(vec2 p) {
        return dot(texture2D(tDiffuse, p).rgb, vec3(0.2126, 0.7152, 0.0722));
      }
      float rawMask(vec2 p) {
        if (uMaskMode > 0.5 && uMaskMode < 1.5) return smoothstep(uD0, uD1, texture2D(tMask, p).g);
        if (uMaskMode > 1.5 && uMaskMode < 2.5) {
          vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
          float gx = abs(luminance(p + dx) - luminance(p - dx)) * 0.5;
          float gy = abs(luminance(p + dy) - luminance(p - dy)) * 0.5;
          return 1.0 - smoothstep(uEdge, uEdge * 2.0, length(vec2(gx, gy)));
        }
        if (uMaskMode > 2.5 && uMaskMode < 3.5) return texture2D(tMask, p).r;
        if (uMaskMode > 3.5 && uMaskMode < 4.5) {
          vec2 scene = texture2D(tMask, p).rg;
          return smoothstep(uD0, uD1, scene.g) * scene.r;
        }
        if (uMaskMode > 4.5) {
          float l = luminance(p);
          return smoothstep(0.14, 0.32, l) * (1.0 - smoothstep(0.68, 0.9, l));
        }
        return 1.0;
      }
      float softenedMask(vec2 p) {
        vec2 t = uMaskTexel;
        return rawMask(p) * 0.5
          + (rawMask(p + vec2(t.x, 0.0)) + rawMask(p - vec2(t.x, 0.0))
          + rawMask(p + vec2(0.0, t.y)) + rawMask(p - vec2(0.0, t.y))) * 0.125;
      }
      void main() {
        float mask = softenedMask(vUv);
        if (uDebug > 0.5) {
          gl_FragColor = vec4(vec3(mask), 1.0);
          return;
        }
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec3 blur = texture2D(tBlur, vUv).rgb;
        float amt = uAmt * mask;
        vec3 result = mix(c, blur, amt);
        if (uScreen > 0.5) result = vec3(1.0) - (vec3(1.0) - c) * (vec3(1.0) - blur * amt);
        gl_FragColor = vec4(result, 1.0);
      }`;
    if (this.masked) Object.assign(uniforms, {
      tMask: { value: this.maskTarget ? this.maskTarget.texture : DIFF_WHITE_TEXTURE },
      uMaskMode: { value: DIFF_MASK_CODE[maskType] || 0 }, uDebug: { value: debug ? 1 : 0 },
      uTexel: { value: new THREE.Vector2(1, 1) }, uMaskTexel: { value: new THREE.Vector2(1, 1) },
      uD0: { value: 0 }, uD1: { value: 1 }, uEdge: { value: diffEdge },
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VS,
      fragmentShader: this.masked ? maskedFragment : legacyFragment,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.blurMaterial);
  }

  collectMaskObjects() {
    this.maskObjects = [];
    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.diffMaskIgnore) {
        this.maskObjects.push({ object, ignore: true });
        return;
      }
      const sources = Array.isArray(object.material) ? object.material : [object.material];
      const materials = sources.map((source) => {
        const include = object.userData.diffMaskGround || DIFF_VEGETATION.test(source?.name || '');
        const material = diffMaskMaterial(source, include);
        this.maskMaterials.push(material);
        return material;
      });
      this.maskObjects.push({ object, material: Array.isArray(object.material) ? materials : materials[0] });
    });
  }

  renderMask(renderer) {
    if (!this.maskObjects) this.collectMaskObjects();
    DIFF_MASK_CAMERA.value.copy(camera.position);
    const target = renderer.getRenderTarget();
    const background = scene.background;
    const autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color()).clone();
    const clearAlpha = renderer.getClearAlpha();
    const restore = [];
    try {
      scene.background = null;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.maskTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      this.maskBackgroundQuad.render(renderer);
      renderer.clearDepth();
      for (const entry of this.maskObjects) {
        if (entry.ignore) {
          restore.push([entry.object, 'visible', entry.object.visible]);
          entry.object.visible = false;
        } else {
          restore.push([entry.object, 'material', entry.object.material]);
          entry.object.material = entry.material;
        }
      }
      renderer.render(scene, camera);
    } finally {
      for (let i = restore.length - 1; i >= 0; i--) {
        const [object, property, value] = restore[i];
        object[property] = value;
      }
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.setRenderTarget(target);
    }
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width * 0.5));
    const h = Math.max(1, Math.round(height * 0.5));
    this.halfA.setSize(w, h); this.halfB.setSize(w, h);
    if (this.maskTarget) this.maskTarget.setSize(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.maskTarget) this.renderMask(renderer);
    this.quad.material = this.blurMaterial;
    const uniforms = this.blurMaterial.uniforms;
    uniforms.uTexel.value.set(1 / this.halfA.width, 1 / this.halfA.height);
    uniforms.uSigma.value = this.radius * this.halfA.height * 0.5;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.uAxis.value.set(1, 0);
    renderer.setRenderTarget(this.halfA); renderer.clear(); this.quad.render(renderer);
    uniforms.tDiffuse.value = this.halfA.texture;
    uniforms.uAxis.value.set(0, 1);
    renderer.setRenderTarget(this.halfB); renderer.clear(); this.quad.render(renderer);

    this.quad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tBlur.value = this.halfB.texture;
    if (this.masked) {
      this.compositeMaterial.uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
      const maskWidth = this.maskTarget ? this.maskTarget.width : readBuffer.width;
      const maskHeight = this.maskTarget ? this.maskTarget.height : readBuffer.height;
      this.compositeMaterial.uniforms.uMaskTexel.value.set(1 / maskWidth, 1 / maskHeight);
      this.compositeMaterial.uniforms.uD0.value = diffDepth0 ?? camState.dist * 0.8;
      this.compositeMaterial.uniforms.uD1.value = Math.max(this.compositeMaterial.uniforms.uD0.value + 0.001, diffDepth1 ?? camState.dist * 1.6);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() {
    this.halfA.dispose(); this.halfB.dispose();
    this.blurMaterial.dispose(); this.compositeMaterial.dispose(); this.quad.dispose();
    this.maskTarget?.dispose();
    this.maskBackgroundMaterial?.dispose(); this.maskBackgroundQuad?.dispose();
    for (const material of this.maskMaterials) material.dispose();
  }
}
const diffusion = diffAmt > 0 || diffDebug ? new DiffusionPass(diffAmt, diffRadius, diffMode, diffMask, diffDebug) : null;
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
if (flag('post')) { composer.addPass(grade); if (diffAmt > 0 || diffDebug) composer.addPass(diffusion); if (flag('dof') && !diffDebug) composer.addPass(dof); }

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
