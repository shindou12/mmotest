// ブラウザ版の buildArea が組み立てる第1〜3層の旧エリアを、見た目を再計算せず GLB に書き出す。
//   node tools/worldart/godot/export_areas.mjs [--shots=<一時フォルダ>]
// 出力: godot/worldart/data/legacy/<area>.glb と index.json
// 材質は glTF の標準材質へ移し、toon / glow の名前と頂点色は Godot の ToonLook へ渡す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'godot/worldart/data/legacy');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? path.resolve(shotsArg.slice('--shots='.length)) : null;
const EXPECTED = ['f1_town', 'f1_hunt', 'f1_dun', 'f1_lab', 'f2_camp', 'f2_field', 'f2_dun', 'f2_hunt', 'f2_lab', 'f3_camp', 'f3_field', 'f3_dun', 'f3_hunt', 'f3_canyon', 'f3_lab'];
fs.mkdirSync(OUT, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1532, height: 869 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CON ' + m.text()); });
  // harness の固定 Math.random は Three.js の UUID まで同一にしてしまうため、ゲーム本体を直接開く。
  await page.goto(srv.url + '/?solo');
  await page.waitForFunction(() => window.__game?.api, null, { timeout: 60000 });
  await page.exposeFunction('__writeLegacyArea', (id, b64) => fs.writeFileSync(path.join(OUT, `${id}.glb`), Buffer.from(b64, 'base64')));
  if (SHOTS) await page.exposeFunction('__writeLegacyShot', (id, data) => fs.writeFileSync(path.join(SHOTS, `${id}.png`), Buffer.from(data.split(',')[1], 'base64')));
  const result = await page.evaluate(async ({ expected, shots }) => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const { buildArea } = await import('/js/env.js');
    const { AREAS, WEATHERS } = await import('/shared/areas.js');
    const { FLOORS } = await import('/shared/data.js');
    const { GRASS_BY_Q } = await import('/js/game/save.js');
    const R = await import('/js/game/render.js');
    const ex = new GLTFExporter();
    const toB64 = (buf) => {
      let s = '';
      const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const skyCache = new Map();
    const records = {};
    const frozen = new Set(['草の揺れ・踏み分け', '焚き火の炎の伸縮', '転移門・出口・ワープポイントの回転と点滅', '宝箱・共有箱の光と揺れ', '毒沼の泡・毒沼と流砂の模様', 'ボス魔法陣の回転・明滅', '門の演出']);

    const pixelsToCanvas = (bytes, w, h) => {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(bytes.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
      return canvas;
    };

    // ShaderMaterial は GLTF の表現にないので、元のブラウザ用シェーダーを GPU で描き、静止テクスチャにする。
    const bakeSky = (mesh, key) => {
      if (skyCache.has(key)) return skyCache.get(key);
      const side = 256;
      const cube = new THREE.WebGLCubeRenderTarget(side, { format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      const skyScene = new THREE.Scene();
      const sky = mesh.clone(); sky.position.set(0, 0, 0); sky.rotation.set(0, 0, 0); sky.scale.setScalar(1); skyScene.add(sky);
      const cubeCamera = new THREE.CubeCamera(0.1, 900, cube);
      const oldTarget = R.renderer.getRenderTarget();
      const oldTone = R.renderer.toneMapping;
      const oldColor = R.renderer.getClearColor(new THREE.Color());
      const oldAlpha = R.renderer.getClearAlpha();
      try {
        R.renderer.toneMapping = THREE.NoToneMapping;
        R.renderer.setClearColor(0x000000, 0);
        cubeCamera.update(R.renderer, skyScene);
        const panW = 1024, panH = 512;
        const target = new THREE.WebGLRenderTarget(panW, panH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
        const mat = new THREE.ShaderMaterial({
          uniforms: { envMap: { value: cube.texture } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
          fragmentShader: 'uniform samplerCube envMap; varying vec2 vUv; void main(){ float th = (1.0-vUv.y)*3.14159265359; float ph = vUv.x*6.28318530718; vec3 d = vec3(sin(th)*cos(ph), cos(th), sin(th)*sin(ph)); gl_FragColor = textureCube(envMap, d); }',
          depthTest: false, depthWrite: false, toneMapped: false,
        });
        const panScene = new THREE.Scene(); panScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
        const panCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        R.renderer.setRenderTarget(target); R.renderer.clear(true, true, true); R.renderer.render(panScene, panCamera);
        const bytes = new Uint8Array(panW * panH * 4); R.renderer.readRenderTargetPixels(target, 0, 0, panW, panH, bytes);
        const tex = new THREE.CanvasTexture(pixelsToCanvas(bytes, panW, panH));
        tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
        target.dispose(); cube.dispose(); mat.dispose(); panScene.children[0].geometry.dispose();
        skyCache.set(key, tex);
        return tex;
      } finally {
        R.renderer.setRenderTarget(oldTarget); R.renderer.toneMapping = oldTone; R.renderer.setClearColor(oldColor, oldAlpha);
      }
    };

    const bakeHazard = (mesh) => {
      const r = Number(mesh.material.uniforms.uR.value);
      const mat = mesh.material.clone();
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = 0;
      const scene = new THREE.Scene();
      const source = new THREE.Mesh(mesh.geometry, mat); scene.add(source);
      const size = 512;
      const target = new THREE.WebGLRenderTarget(size, size, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
      const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 20);
      cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
      const oldTarget = R.renderer.getRenderTarget();
      const oldTone = R.renderer.toneMapping;
      const oldColor = R.renderer.getClearColor(new THREE.Color());
      const oldAlpha = R.renderer.getClearAlpha();
      try {
        R.renderer.toneMapping = THREE.NoToneMapping;
        R.renderer.setClearColor(0x000000, 0);
        R.renderer.setRenderTarget(target); R.renderer.clear(true, true, true); R.renderer.render(scene, cam);
        const bytes = new Uint8Array(size * size * 4); R.renderer.readRenderTargetPixels(target, 0, 0, size, size, bytes);
        const tex = new THREE.CanvasTexture(pixelsToCanvas(bytes, size, size)); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
        target.dispose(); mat.dispose();
        return tex;
      } finally {
        R.renderer.setRenderTarget(oldTarget); R.renderer.toneMapping = oldTone; R.renderer.setClearColor(oldColor, oldAlpha);
      }
    };

    // InstancedMesh (草) を GLB が扱える通常メッシュに展開し、インスタンス色を頂点色へ掛ける。
    const flattenInstances = (root) => {
      const instances = [];
      root.traverse((o) => { if (o.isInstancedMesh) instances.push(o); });
      for (const inst of instances) {
        const src = inst.geometry, p = src.getAttribute('position'), n = src.getAttribute('normal'), uv = src.getAttribute('uv'), c = src.getAttribute('color'), idx = src.index;
        const vPer = p.count, iPer = idx ? idx.count : vPer, perChunk = Math.max(1, Math.floor(80000 / vPer));
        const mats = [];
        for (let start = 0; start < inst.count; start += perChunk) {
          const count = Math.min(perChunk, inst.count - start), geom = new THREE.BufferGeometry();
          const pos = new Float32Array(count * vPer * 3), nor = n ? new Float32Array(count * vPer * 3) : null;
          const col = (c || inst.instanceColor) ? new Float32Array(count * vPer * 3) : null;
          const tex = uv ? new Float32Array(count * vPer * 2) : null, ids = new Uint32Array(count * iPer);
          const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), v = new THREE.Vector3(), normal = new THREE.Vector3(), tint = new THREE.Color();
          for (let j = 0; j < count; j++) {
            const k = start + j; inst.getMatrixAt(k, matrix); normalMatrix.getNormalMatrix(matrix);
            if (inst.instanceColor) inst.getColorAt(k, tint); else tint.setRGB(1, 1, 1);
            for (let q = 0; q < vPer; q++) {
              v.fromBufferAttribute(p, q).applyMatrix4(matrix); pos.set([v.x, v.y, v.z], (j * vPer + q) * 3);
              if (nor) { normal.fromBufferAttribute(n, q).applyMatrix3(normalMatrix).normalize(); nor.set([normal.x, normal.y, normal.z], (j * vPer + q) * 3); }
              if (col) {
                const cr = c ? c.getX(q) : 1, cg = c ? c.getY(q) : 1, cb = c ? c.getZ(q) : 1;
                col.set([cr * tint.r, cg * tint.g, cb * tint.b], (j * vPer + q) * 3);
              }
              if (tex) tex.set([uv.getX(q), uv.getY(q)], (j * vPer + q) * 2);
            }
            for (let q = 0; q < iPer; q++) ids[j * iPer + q] = j * vPer + (idx ? idx.getX(q) : q);
          }
          geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          if (nor) geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          if (col) geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
          if (tex) geom.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
          geom.setIndex(new THREE.BufferAttribute(ids, 1)); mats.push(geom);
        }
        const merged = mergeGeometries(mats, false);
        const mesh = new THREE.Mesh(merged, inst.material);
        mesh.name = inst.name || 'GrassStatic';
        mesh.position.copy(inst.position); mesh.quaternion.copy(inst.quaternion); mesh.scale.copy(inst.scale);
        mesh.castShadow = inst.castShadow; mesh.receiveShadow = inst.receiveShadow;
        inst.parent.add(mesh); inst.parent.remove(inst);
        src.dispose(); for (const g of mats) g.dispose();
      }
    };

    const setNames = (env) => {
      const def = env._def;
      env.group.name = 'AreaScene';
      if (env.door) env.door.name = 'LegacyDoor';
      if (env.gate) env.gate.name = 'LegacyGate';
      for (const [i, p] of (env.portals || []).entries()) p.obj.name = `LegacyPortal_${i}`;
      for (const [i, c] of (env.chests || []).entries()) c.obj.name = `LegacyChest_${i}`;
      if (env.box) env.box.name = 'LegacyBox';
      if (env.waypoint?.obj) env.waypoint.obj.name = 'LegacyWaypoint';
      for (const [i, p] of (env.plates || []).entries()) p.name = `LegacyPlate_${i}`;
      let ground = null;
      env.group.traverse((o) => {
        if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.attributes.position?.count > 20000 && o.geometry.attributes.color) ground = o;
      });
      if (ground) ground.name = 'LegacyGround';
      return ground;
    };

    const clean = (root, floorNo) => {
      const drop = [];
      root.traverse((o) => {
        if (o.isMesh && (Array.isArray(o.material) ? o.material[0] : o.material)?.side === THREE.BackSide) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const key = m.customProgramCacheKey?.() || '';
          if (key.startsWith('outline')) {
            if (o.parent?.isMesh) o.parent.userData.ow = Number(key.replace('outline', '')) || 1;
            drop.push(o);
          }
        } else if (o.isLine || o.isLineSegments || o.isPoints) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();

      const sprites = [];
      root.traverse((o) => { if (o.isSprite) sprites.push(o); });
      for (const sprite of sprites) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: sprite.material.map, transparent: true, side: THREE.DoubleSide, depthWrite: false, name: 'glow' });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.name = sprite.name || 'AreaLabel'; mesh.position.copy(sprite.position); mesh.quaternion.copy(sprite.quaternion); mesh.scale.copy(sprite.scale);
        sprite.parent.add(mesh); sprite.removeFromParent();
      }

      const shaders = [];
      root.traverse((o) => { if (o.isMesh && o.material?.isShaderMaterial) shaders.push(o); });
      for (const mesh of shaders) {
        if (mesh.material.uniforms?.top && mesh.material.uniforms?.bot) {
          const tex = bakeSky(mesh, `${floorNo}:${mesh.material.uniforms.top.value.getHexString()}:${mesh.material.uniforms.bot.value.getHexString()}`);
          mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, side: THREE.DoubleSide, name: 'glow' });
          mesh.name = 'LegacySky';
        } else if (mesh.material.uniforms?.uR) {
          const tex = bakeHazard(mesh);
          mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, name: 'glow' });
          mesh.name = 'LegacyHazard';
        } else {
          throw new Error(`未対応の ShaderMaterial: ${mesh.name || mesh.material.name || '(無名)'}`);
        }
      }

      flattenInstances(root);

      const mats = new Map(); let meshId = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.name ||= `LegacyMesh_${meshId++}`;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const converted = list.map((src) => {
          if (!src) return new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'toon' });
          const isGlow = src.isMeshBasicMaterial && !src.map && src.name !== 'toon';
          const isAdditive = src.blending === THREE.AdditiveBlending;
          const base = src.color?.clone() || new THREE.Color(0xffffff);
          const max = Math.max(base.r, base.g, base.b);
          const gm = isGlow && max > 1 ? max : 1;
          if (gm !== 1) base.multiplyScalar(1 / gm);
          const materialName = src.name === 'glow' || isGlow ? (isAdditive ? 'glow_add' : 'glow') : 'toon';
          const key = [materialName, base.getHexString(), src.map?.uuid || '', src.opacity, src.transparent, src.side, src.vertexColors].join('|');
          if (!mats.has(key)) {
            const m = new THREE.MeshStandardMaterial({
              name: materialName, color: base, map: src.map || null,
              vertexColors: !!src.vertexColors || !!o.geometry?.attributes?.color,
              transparent: !!src.transparent, opacity: src.opacity ?? 1,
              side: src.side === THREE.DoubleSide ? THREE.DoubleSide : (src.side === THREE.BackSide ? THREE.DoubleSide : THREE.FrontSide),
              roughness: 1, metalness: 0,
              emissive: materialName.startsWith('glow') ? base : (src.emissive?.clone() || new THREE.Color(0)),
              emissiveIntensity: 1,
            });
            mats.set(key, m);
          }
          const out = mats.get(key);
          if (gm !== 1) o.name = `gm${Math.round(gm * 100)}_${o.name}`;
          if (o.userData.ow) o.name = `ow${Math.round(o.userData.ow * 100)}_${o.name}`;
          return out;
        });
        o.material = Array.isArray(o.material) ? converted : converted[0];
      });
      root.traverse((o) => { o.userData = {}; });
      return root;
    };

    const shotAreas = [];
    for (const id of expected) {
      const def = AREAS[id];
      const floor = FLOORS[def.floor - 1];
      const weather = WEATHERS[def.weather];
      const env = buildArea(def, floor, { grass: GRASS_BY_Q[window.__game.settings.quality] ?? 1, weather });
      env._def = def;
      env.update(0, 0, 0);
      const ground = setNames(env);

      // 代表画像は通常ゲームと同じカメラ・照明・材質を使い、人物や HUD を含めずに撮る。
      if (shots && ['f1_town', 'f1_hunt', 'f1_dun', 'f2_field', 'f3_field', 'f3_lab'].includes(id)) {
        const at = { x: 0, z: 0 }; const y = env.heightAt(at.x, at.z);
        R.scene.clear(); R.scene.fog = new THREE.Fog(env.light.fog, env.light.fogNear, env.light.fogFar);
        R.hemi.color.set(floor.hemi[0]); R.hemi.groundColor.set(floor.hemi[1]); R.hemi.intensity = env.light.hemi;
        R.sun.color.set(floor.sun); R.sun.intensity = env.light.sun; R.sun.position.set(20, 40, 10); R.sun.target.position.set(0, 0, 0);
        R.scene.add(R.hemi, R.sun, R.sun.target, env.group);
        const target = new THREE.Vector3(at.x, y + 1.2, at.z);
        const dist = 19.5, pitch = 0.62;
        R.camera.fov = 18; R.camera.aspect = 1532 / 869; R.camera.near = 0.3; R.camera.far = 600; R.camera.updateProjectionMatrix();
        R.camera.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist); R.camera.lookAt(target);
        R.renderer.setSize(1532, 869); R.renderer.setPixelRatio(1); R.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        R.composer.setSize(1532, 869); R.composer.render();
        const data = R.renderer.domElement.toDataURL('image/png');
        await window.__writeLegacyShot(id, data);
        shotAreas.push(id);
        R.scene.remove(env.group);
      }

      const exportGroup = env.group.clone(true);
      clean(exportGroup, def.floor);
      let b64;
      await new Promise((resolve, reject) => ex.parse(exportGroup, (out) => { b64 = toB64(out); resolve(); }, reject, { binary: true, onlyVisible: true }));
      await window.__writeLegacyArea(id, b64);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      let triangles = 0, vertices = 0, surfaces = 0, groundVertices = 0;
      exportGroup.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry, v = g.getAttribute('position'); if (!v) return;
        const count = g.index ? g.index.count : v.count;
        triangles += Math.floor(count / 3); vertices += v.count; surfaces++;
        if (o.name === 'LegacyGround') groundVertices += v.count;
      });
      const light = {
        sun_dir: [20, 40, 10], sun_color: `#${floor.sun.toString(16).padStart(6, '0')}`, sun_i: env.light.sun,
        sky: `#${floor.hemi[0].toString(16).padStart(6, '0')}`, ground: `#${floor.hemi[1].toString(16).padStart(6, '0')}`, hemi_i: env.light.hemi,
        fog: `#${Number(env.light.fog).toString(16).padStart(6, '0')}`, fog_near: env.light.fogNear, fog_far: env.light.fogFar,
        sky_top: `#${floor.skyTop.toString(16).padStart(6, '0')}`, sky_bot: `#${floor.skyBot.toString(16).padStart(6, '0')}`,
      };
      records[id] = { file: `${id}.glb`, bytes: bytes.byteLength, triangles, vertices, surfaces, ground_vertices: groundVertices, shape: def.shape, floor: def.floor, light };
      const tmp = exportGroup;
      tmp.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m?.dispose?.(); });
      env.group.clear();
    }
    return { records, shotAreas, frozen: [...frozen], quality: window.__game.settings.quality, sceneErrors: R.scene.children.length };
  }, { expected: EXPECTED, shots: SHOTS });
  const index = { source: 'public/js/env.js buildArea → env/open.js buildOpen / env/grid.js buildGrid', quality: result.quality, frozen: result.frozen, areas: result.records };
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`書き出し: ${Object.keys(result.records).length} エリア / grass quality=${result.quality}`);
  for (const [id, r] of Object.entries(result.records)) console.log(`${id}: ${(r.bytes / 1024 / 1024).toFixed(2)} MiB, ${r.triangles} triangles, ${r.ground_vertices} ground vertices`);
  console.log(`停止して書き出した動き: ${result.frozen.join('、')}`);
  if (SHOTS) console.log(`ブラウザ撮影 (${result.shotAreas.length}): ${SHOTS}`);
  console.log(errors.length ? errors.join(' | ') : 'no browser errors');
} finally {
  await browser.close();
  srv.close();
}
