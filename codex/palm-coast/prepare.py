"""既存の砂浜を再利用し、codexの比較版だけでヤシを差し替える。"""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
source_path = ROOT / "public/worldart/world.js"
original_bytes = source_path.read_bytes()
original = source_path.read_text(encoding="utf-8")
source = original
hooks = []


def replace(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f"元の描画コードが変わっています: {old}")
    source = source.replace(old, new)
    hooks.append(old)


replace("const BASE = './';", "const BASE = '/public/worldart/';")
replace("const assetSwap = new Map(", """const coastMode = q.get('palms');
const coastTrial = coastMode === 'trial' || coastMode === 'full';
const coastPalms = new Set(['palm2_a', 'palm2_b']);
const coastOriginalCount = [...coastPalms].reduce((count, name) => count + (placed.assets[name]?.length || 0), 0);
if (coastMode === 'trial') {
  const response = await fetch('./layout.json');
  if (!response.ok) throw new Error('ヤシの配置設定を読めません');
  const layout = await response.json();
  if (MAP !== layout.map) throw new Error('ヤシの配置設定と地図が違います');
  for (const [name, indices] of Object.entries(layout.palms)) {
    const originalItems = placed.assets[name];
    if (!coastPalms.has(name) || !originalItems || new Set(indices).size !== indices.length
      || indices.some(index => !Number.isInteger(index) || !originalItems[index])) throw new Error('ヤシの配置番号が不正です');
    placed.assets[name] = indices.map(index => originalItems[index]);
    placed.counts[name] = indices.length;
  }
}
const coastReport = { mode: coastMode, trial: coastTrial, originalPlacements: coastOriginalCount, replaced: 0, placements: 0, models: [] };
const assetSwap = new Map(""")
replace("  const g = await load(`${BASE}${q.get('adir') || 'assets'}/${loadName}.glb`);", """  const coastPalm = coastTrial && coastPalms.has(sourceName);
  const modelURL = coastPalm ? '../palm-billboard/assets/palm2_a_liked_frond_v4.glb'
    : `${BASE}${q.get('adir') || 'assets'}/${loadName}.glb`;
  const g = await load(modelURL);
  if (coastPalms.has(sourceName)) {
    coastReport.placements += placed.assets[name].length;
    if (coastPalm) coastReport.replaced += placed.assets[name].length;
    coastReport.models.push({ source: sourceName, url: modelURL, count: placed.assets[name].length });
  }""")
replace("dummy.scale.setScalar(s);", "dummy.scale.setScalar(s * (coastPalm && sourceName === 'palm2_b' ? 3.8 / 3.2 : 1));")
replace("    im.frustumCulled = false;", """    if (coastPalm && im.customDepthMaterial) im.customDepthMaterial.side = THREE.DoubleSide;
    im.frustumCulled = false;""")
source += """
// 比較ページのMediatorから、既存カメラの値だけを受け取る。
function coastApply(state) {
  window.__setView('', null);
  if (state.view === 'near' || state.view === 'top') {
    window.__moveTo(-1.8, 3.7);
    TY = state.view === 'near' ? 1.7 : 0;
    camState.pitch = state.view === 'near' ? 40 : 85;
    camState.dist = state.view === 'near' ? 19 : 29;
    camera.fov = state.view === 'near' ? 26 : 28;
    camera.updateProjectionMatrix();
  }
  camState.yaw += Number(state.yaw) || 0;
  placeCamera(); fitShadow();
}
window.__coastStudy = coastReport;
window.__coastSetState = coastApply;
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.kind !== 'coast-state') return;
  coastApply(event.data.state);
});
let coastDragging = false, coastLastX = 0;
renderer.domElement.addEventListener('pointerdown', event => {
  coastDragging = true; coastLastX = event.clientX; renderer.domElement.setPointerCapture(event.pointerId);
});
for (const type of ['pointerup', 'pointercancel']) renderer.domElement.addEventListener(type, () => { coastDragging = false; });
renderer.domElement.addEventListener('pointermove', event => {
  if (!coastDragging) return;
  const delta = (event.clientX - coastLastX) * .3; coastLastX = event.clientX;
  if (parent !== window) parent.postMessage({ kind: 'coast-orbit', delta }, location.origin);
  else { camState.yaw += delta; placeCamera(); fitShadow(); }
});
renderer.debug.onShaderError = () => parent.postMessage({ kind: 'coast-error' }, location.origin);
coastApply({ view: q.get('view') || 'wide', yaw: Number(q.get('yaw') || 0) });
window.__coastReady = true;
parent.postMessage({ kind: 'coast-ready' }, location.origin);
"""
(BASE / "world.generated.js").write_text(source, encoding="utf-8", newline="\n")
(BASE / "renderer-source.json").write_text(json.dumps({
    "source": "public/worldart/world.js",
    "sha256": hashlib.sha256(original_bytes).hexdigest(),
    "map": "south_coast_g3",
    "model": "codex/palm-billboard/assets/palm2_a_liked_frond_v4.glb",
    "layout": "codex/palm-coast/layout.json",
    "hooks": hooks,
}, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(f"PREPARED hooks={len(hooks)}; map=south_coast_g3; model=palm2_a_liked_frond_v4")
