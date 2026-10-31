"""ワールドアートの地図を Godot 4 のプロジェクト（godot/worldart/）へ書き出す（L26）。
python3 -I tools/worldart/godot/export_godot.py f1_field
コピーするもの（Godot が取り込む元。手で直さず、元の Blender の工程を直してから書き出し直す）:
  godot/worldart/data/<地図>/terrain.glb・placements.json・map.json（地図の JSON そのもの）
  godot/worldart/data/assets/<名>.glb（その地図で使うアセット。外部画像も URI の相対位置へ）
  godot/worldart/data/tex/<名>.png（地面の材質が使う絵）
  godot/worldart/data/<地図>/skyvis.png（あれば）
シェーダー・スクリプト（godot/worldart/shaders・scripts）は手で書いたもの。three.js の world.js と同じ式。"""
import sys, os, json, shutil, struct
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PROJ = os.path.join(ROOT, 'godot', 'worldart')
PUBLIC = os.path.join(ROOT, 'public', 'worldart')
GROUND_TEX = ['ground_grass', 'ground_dirt', 'ground_sand', 'ground_cobble', 'ground_flagstone', 'rock_face', 'rock_crack', 'rock', 'noise_soft']


def copy_glb_dependencies(glb_src, glb_dst):
    """GLB の外にある画像とバッファを、参照 URI の相対位置へコピーする。"""
    with open(glb_src, 'rb') as f:
        data = f.read()
    if len(data) < 20 or data[:4] != b'glTF':
        raise ValueError('GLB のヘッダーを読めません: ' + glb_src)
    offset = 12
    doc = None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        chunk = data[offset:offset + size]
        offset += size
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.rstrip(b'\x00 \t\r\n').decode('utf-8'))
            break
    if doc is None:
        raise ValueError('GLB に JSON チャンクがありません: ' + glb_src)

    src_root = os.path.realpath(PUBLIC)
    dst_root = os.path.realpath(PROJ)
    for item in doc.get('buffers', []) + doc.get('images', []):
        uri = item.get('uri')
        if not uri or uri.startswith('data:'):
            continue
        parts = urlsplit(uri)
        if parts.scheme or parts.netloc or not parts.path:
            raise ValueError('GLB URI がローカルファイルではありません: ' + uri)
        rel = Path(unquote(parts.path.replace('\\', '/')))
        src = os.path.realpath(os.path.join(os.path.dirname(glb_src), str(rel)))
        dst = os.path.realpath(os.path.join(os.path.dirname(glb_dst), str(rel)))
        if os.path.commonpath([src_root, src]) != src_root:
            raise ValueError('GLB URI が public/worldart の外を指しています: ' + uri)
        if os.path.commonpath([dst_root, dst]) != dst_root:
            raise ValueError('GLB URI が Godot プロジェクトの外を指しています: ' + uri)
        if not os.path.isfile(src):
            raise FileNotFoundError('GLB の参照ファイルがありません: ' + src)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


for m in sys.argv[1:]:
    src = os.path.join(PUBLIC, 'maps')
    d = os.path.join(PROJ, 'data', m)
    os.makedirs(d, exist_ok=True)
    terrain_src = os.path.join(src, m, 'terrain.glb')
    terrain_dst = os.path.join(d, 'terrain.glb')
    shutil.copy2(terrain_src, terrain_dst)
    copy_glb_dependencies(terrain_src, terrain_dst)
    placements_src = os.path.join(src, m, 'placements.json')
    shutil.copy2(placements_src, os.path.join(d, 'placements.json'))
    for image in ['height.png', 'skyvis.png']:
        image_src = os.path.join(src, m, image)
        if os.path.exists(image_src):
            shutil.copy2(image_src, os.path.join(d, image))
    shutil.copy2(os.path.join(src, m + '.json'), os.path.join(d, 'map.json'))
    with open(placements_src, encoding='utf-8') as f:
        placements = json.load(f)
    names = {k[:-len('@shadow')] if k.endswith('@shadow') else k for k in placements['assets']}
    os.makedirs(os.path.join(PROJ, 'data', 'assets'), exist_ok=True)
    for n in sorted(names):
        asset_src = os.path.join(PUBLIC, 'assets', n + '.glb')
        asset_dst = os.path.join(PROJ, 'data', 'assets', n + '.glb')
        shutil.copy2(asset_src, asset_dst)
        copy_glb_dependencies(asset_src, asset_dst)
    os.makedirs(os.path.join(PROJ, 'data', 'tex'), exist_ok=True)
    for t in GROUND_TEX:
        shutil.copy2(os.path.join(PUBLIC, 'tex', t + '.png'), os.path.join(PROJ, 'data', 'tex', t + '.png'))
    print('->', d, len(names), 'assets')
