"""ヤシ3本の砂浜を再利用し、指摘されたもみ1本だけを比較する。"""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
source_path = ROOT / "codex/palm-coast/world.generated.js"
original_bytes = source_path.read_bytes()
source = original_bytes.decode("utf-8")
hooks = []


def replace(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f"砂浜の描画元が変わっています: {old}")
    source = source.replace(old, new)
    hooks.append(old)


replace("const assetNames = Object.keys(placed.assets)", """const firVersion = q.get('fir') || 'current';
if (!['current', 'v1', 'v2', 'v3', 'v4', 'v5'].includes(firVersion)) throw new Error('未対応のもみです');
const firTarget = { asset: 'fir4_c', index: 1 };
const firPlacement = placed.assets[firTarget.asset][firTarget.index];
if (firVersion !== 'current') {
  placed.assets.fir_study = [firPlacement];
  placed.assets[firTarget.asset] = placed.assets[firTarget.asset].filter((_, index) => index !== firTarget.index);
  placed.counts[firTarget.asset] -= 1;
  placed.counts.fir_study = 1;
}
const assetNames = Object.keys(placed.assets)""")
replace("await fetch('./layout.json')", "await fetch('../palm-coast/layout.json')")
replace("const modelURL = coastPalm ?", "const modelURL = sourceName === 'fir_study' ? `./assets/fir_soft_${firVersion}.glb` : coastPalm ?")
replace("if (coastPalm && im.customDepthMaterial) im.customDepthMaterial.side = THREE.DoubleSide;", "if ((coastPalm || sourceName === 'fir_study') && im.customDepthMaterial) im.customDepthMaterial.side = THREE.DoubleSide;")
replace("window.__moveTo(-1.8, 3.7);", "window.__moveTo(-.379, -3.296);")
replace("TY = state.view === 'near' ? 1.7 : 0;", "TY = state.view === 'near' ? 2.4 : 0;")
replace("camState.pitch = state.view === 'near' ? 40 : 85;", "camState.pitch = state.view === 'near' ? 35 : 85;")
replace("camState.dist = state.view === 'near' ? 19 : 29;", "camState.dist = state.view === 'near' ? 21 : 27;")
source += "\nwindow.__firStudy = { version: firVersion, target: firTarget, placement: firPlacement, replaced: firVersion === 'current' ? 0 : 1 };\n"
(BASE / "world.generated.js").write_text(source, encoding="utf-8", newline="\n")
(BASE / "world-source.json").write_text(json.dumps({
    "source": str(source_path.relative_to(ROOT)), "sha256": hashlib.sha256(original_bytes).hexdigest(),
    "target": {"asset": "fir4_c", "index": 1}, "hooks": hooks,
}, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(f"FIR_WORLD_PREPARED hooks={len(hooks)}; target=fir4_c[1]; palms=3")
