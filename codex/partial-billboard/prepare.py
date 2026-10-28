"""本体を編集せず、比較用rendererへ限定したフックを追加する。"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
if not BASE.is_relative_to(ROOT / "codex"):
    raise ValueError("出力先はこの作業ツリーのcodex内に限定します")
source_path = ROOT / "public/worldart/world.js"
original = source_path.read_text(encoding="utf-8")
source = original
changes = []


def replace(old, new):
    global source
    count = source.count(old)
    if count != 1:
        raise ValueError(f"置換元が一意ではありません（{count}箇所）: {old}")
    source = source.replace(old, new)
    changes.append(old)


replace("const q = new URLSearchParams(location.search);", """import { installPartialFoliage } from './foliage.js';
const pbResponse = await fetch('./assets/cards.json');
if (!pbResponse.ok) throw new Error('cards.jsonを読めません');
const PB_DATA = await pbResponse.json();
const PB = { follow: { value: 0 }, camera: { value: new THREE.Vector3() } };
const q = new URLSearchParams(location.search);
PB.follow.value = THREE.MathUtils.clamp(Number(q.get('follow') || 0), 0, 1);""")
replace("const BASE = './';", "const BASE = '/public/worldart/';")
replace("const g = await load(`${BASE}${q.get('adir') || 'assets'}/${loadName}.glb`);", "const g = await load(PB_DATA.models[loadName] ? `./assets/${loadName}.glb` : `${BASE}${q.get('adir') || 'assets'}/${loadName}.glb`);")
replace("    im.frustumCulled = false;", """    if (PB_DATA.models[loadName] && /leaf|frond/.test(mat.name)) {
      installPartialFoliage(im, PB_DATA.models[loadName], PB);
    }
    im.frustumCulled = false;""")
render_calls = source.count("composer.render()")
if render_calls != 2:
    raise ValueError(f"描画箇所が変更されています: {render_calls}")
source = source.replace("composer.render()", "pbRender()")
source += """
// 比較画面との窓口。既存のカメラ設定・照明をそのまま使う。
function pbRender() { PB.camera.value.copy(camera.position); composer.render(); }
function pbApply(state) {
  window.__setView(state.view || 'B01', 'B01');
  camState.yaw += Number(state.yaw) || 0;
  placeCamera(); fitShadow();
  PB.follow.value = THREE.MathUtils.clamp(Number(state.follow) || 0, 0, 1);
}
window.__pbSetState = pbApply;
addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.kind !== 'leaf-state') return;
  pbApply(event.data.state);
});
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', (event) => {
  dragging = true; lastX = event.clientX; renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const delta = (event.clientX - lastX) * 0.3; lastX = event.clientX;
  if (parent !== window) parent.postMessage({ kind: 'leaf-orbit', delta }, location.origin);
  else { camState.yaw += delta; placeCamera(); fitShadow(); }
});
renderer.debug.onShaderError = () => {
  parent.postMessage({ kind: 'leaf-error', message: '葉のシェーダーをコンパイルできません' }, location.origin);
};
pbApply({ view: q.get('view') || 'B01', yaw: Number(q.get('yaw') || 0), follow: PB.follow.value });
window.__pbReady = true;
parent.postMessage({ kind: 'leaf-ready' }, location.origin);
"""
(BASE / "world.generated.js").write_text(source, encoding="utf-8", newline="\n")
report = {"source": "public/worldart/world.js", "sha256": hashlib.sha256(original.encode()).hexdigest(), "hooks": changes, "renderCalls": render_calls}
(BASE / "renderer-source.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
print(f"PREPARED {len(changes)} hooks, {render_calls} render calls; source {report['sha256'][:12]}")
