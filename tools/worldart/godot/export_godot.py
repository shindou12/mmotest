"""ワールドアートの地図を Godot 4 のプロジェクト（godot/worldart/）へ書き出す（L26）。
python3 -I tools/worldart/godot/export_godot.py f1_field
コピーするもの（Godot が取り込む元。手で直さず、元の Blender の工程を直してから書き出し直す）:
  godot/worldart/data/<地図>/terrain.glb・placements.json・map.json（地図の JSON そのもの）
  godot/worldart/data/assets/<名>.glb（その地図で使うアセット。葉・草の絵は GLB の中）
  godot/worldart/data/tex/<名>.png（地面の材質が使う絵）
シェーダー・スクリプト（godot/worldart/shaders・scripts）は手で書いたもの。three.js の world.js と同じ式。"""
import sys, os, json, shutil
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PROJ = os.path.join(ROOT, 'godot', 'worldart')
GROUND_TEX = ['ground_grass', 'ground_dirt', 'ground_sand', 'ground_cobble', 'ground_flagstone', 'rock_face', 'rock_crack', 'rock', 'noise_soft']
for m in sys.argv[1:]:
    src = os.path.join(ROOT, 'public/worldart/maps')
    d = os.path.join(PROJ, 'data', m); os.makedirs(d, exist_ok=True)
    shutil.copy(os.path.join(src, m, 'terrain.glb'), os.path.join(d, 'terrain.glb'))
    shutil.copy(os.path.join(src, m, 'placements.json'), os.path.join(d, 'placements.json'))
    shutil.copy(os.path.join(src, m + '.json'), os.path.join(d, 'map.json'))
    names = {k.replace('@shadow', '') for k in json.load(open(os.path.join(src, m, 'placements.json')))['assets']}
    os.makedirs(os.path.join(PROJ, 'data', 'assets'), exist_ok=True)
    for n in sorted(names): shutil.copy(os.path.join(ROOT, 'public/worldart/assets', n + '.glb'), os.path.join(PROJ, 'data', 'assets', n + '.glb'))
    os.makedirs(os.path.join(PROJ, 'data', 'tex'), exist_ok=True)
    for t in GROUND_TEX: shutil.copy(os.path.join(ROOT, 'public/worldart/tex', t + '.png'), os.path.join(PROJ, 'data', 'tex', t + '.png'))
    print('->', d, len(names), 'assets')
