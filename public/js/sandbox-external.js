// 箱庭: 外部モデル（GLB）の読み込み。public/assets/models/manifest.json に並べたものを、町の外れの「外部モデルの列」に置く
//   manifest.json の形: { "source": "Kenney Nature Kit（CC0）", "items": [{ "file": "nature/tree_oak.glb", "kind": "木", "scale": 1 }, ...] }
//   toon: true なら、ゲームの絵柄に合わせてトゥーンの陰影と輪郭線に置き換える（色・画像はそのまま）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { outline } from './toon.js';

const loader = new GLTFLoader();
const cache = new Map();
const load = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

export async function loadManifest() {
  try { const r = await fetch('./assets/models/manifest.json'); return r.ok ? await r.json() : null; } catch { return null; }
}

// 元の質感（Standard）→ トゥーン。色・画像・頂点色は引き継ぐ
function toToon(root, gradientMap) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.material = [].concat(o.material).map((m) => new THREE.MeshToonMaterial({ color: m.color ?? 0xffffff, map: m.map ?? null, vertexColors: !!m.vertexColors, gradientMap, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side }));
    if (o.material.length === 1) o.material = o.material[0];
  });
  outline(root, 1);
}

// 列に並べる（間隔は大きさに合わせる）。戻り値: 置いたモデルのグループ
export async function placeExternal(manifest, { toon, gradientMap, at = [-30, 30], heightAt = () => 0 }) {
  const g = new THREE.Group();
  if (!manifest?.items?.length) return g;
  let x = at[0];
  for (const it of manifest.items) {
    try {
      const gltf = await load('./assets/models/' + it.file);
      const m = gltf.scene.clone(true);
      m.scale.setScalar(it.scale ?? 1);
      if (toon) toToon(m, gradientMap); else m.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      const box = new THREE.Box3().setFromObject(m), w = Math.max(1.5, box.max.x - box.min.x);
      x += w / 2;
      m.position.set(x, heightAt(x, at[1]) - box.min.y, at[1]); // 底を地面にそろえる
      x += w / 2 + 1.5;
      g.add(m);
    } catch (e) { console.warn('外部モデルを読めませんでした', it.file, e); }
  }
  return g;
}
