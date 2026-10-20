"""比較用の試遊ページ（Artifact）の束を作る（L22）。
python3 -I tools/worldart/compare/build.py <出力フォルダ>
公開: Artifact「見本② 版くらべ」https://claude.ai/artifact/A31scCgQs9tWLQ1dhMAgZQ（出力フォルダの index.html をページに、残りを files に）
版:
  L20  = コミット 8b3708e の world.js と mihon2 の地図データ（L21 より前の基準。git から正確に戻す）
  L21  = コミット d342f95 の world.js と地図データ（撮影したときのまま。材質のシェーダーの取り違えを含む）
  L21f = コミット 60877e3 の world.js（シェーダーのキャッシュの修正 + アイデア01 の仕組み）を 01 なしで、L21 と同じ地図データ
  L21g = L21f にアイデア01（gblend=1）だけを足したもの（コード・地図・カメラ・光は L21f と同じ）
  L22  = コミット 71c581d の world.js と地図データ（B04 の画角 25°、線形の階調 + 露出 1.25、空の光 2.1、彩度 1.0、
         OutputPass の修正）。アイデア 01・02・04・05 はページで入／切（URL の引数 1 つだけを変える）
  L23  = <L23 の版>（既定 HEAD）の world.js と地図データ（葉の持ち上げ 0・空の光 1.6・地色の色味・01 を草の房だけで既定で入）
アセットとテクスチャは L20〜L21 で同じなので共有する。GLB は Artifact で配られないため base64 のテキストにする。
world.js への書き換えはすべての版に同じ置換を当てる（版の違いを混ぜない）。"""
import sys, os, json, base64, shutil, subprocess
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.abspath(sys.argv[1])
git = lambda rev, path: subprocess.check_output(['git', '-C', ROOT, 'show', f'{rev}:{path}'])
L23REV = sys.argv[2] if len(sys.argv) > 2 else 'HEAD'
VERS = {'L20': '8b3708e', 'L21': 'd342f95', 'L22': '71c581d', 'L23': L23REV}            # 地図データ
WORLDS = {'L20': '8b3708e', 'L21': 'd342f95', 'L21f': '60877e3', 'L22': '71c581d', 'L23': L23REV}   # world.js

REPL = [
    ("const q = new URLSearchParams(location.search);", "const q = new URLSearchParams('walk=1&' + (window.__CMP?.extra || ''));"),
    ("const MAP = q.get('map') || 'orc_meadow';", "const MAP = 'mihon2';"),
    ("const load = (url) => new Promise((res, rej) => gltf.load(url, res, undefined, rej));",
     "const load = async (url) => {\n  const txt = await (await fetch(url + '.b64.txt')).text();\n"
     "  const bin = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));\n"
     "  return new Promise((res, rej) => gltf.parse(bin.buffer, '', res, rej));\n};\nwindow.__nload = 0;"),
    ("const terrain = await load(", "window.__progress?.('地形を読み込み中');\nconst terrain = await load("),
    # 仮想スティック（比較ページ）: window.__stick = { x, y }（-1〜1、y は手前が +）。倒した向きで進み、倒した量で速さが変わる
    ("(keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup')));",
     "(keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup')));\n"
     "    const stk = window.__stick, stkOn = !!(stk && (stk.x || stk.y)); if (stkOn) v.set(stk.x, 0, stk.y);"),
    ("v.normalize().multiplyScalar(5 * dt)", "v.normalize().multiplyScalar(5 * dt * (stkOn ? Math.min(1, Math.hypot(stk.x, stk.y)) : 1))"),
]
def patch(src):
    for a, b in REPL:
        assert a in src, a
        src = src.replace(a, b, 1)
    assert '`${BASE}maps/' in src
    src = src.replace('`${BASE}maps/', '`${window.__CMP.data}maps/')
    a = "  const items = placed.assets[name];"
    assert a in src
    src = src.replace(a, a + "\n  window.__progress?.(`アセット ${++window.__nload}/${assetNames.length}`);", 1)
    src += ("\n// 比較ページ用（build.py が足す）: 位置・向き・ビューを外から扱う\n"
            "window.__progress?.('');\n"
            "window.__cmpReady?.({ moveTo: window.__moveTo, setView: window.__setView,\n"
            "  pose: () => ({ x: target.x, z: target.z, yaw: camState.yaw, dist: camState.dist, pitch: camState.pitch, fov: camera.fov }),\n"
            "  setYaw: (y) => { camState.yaw = y; placeCamera(); fitShadow(); },\n"
            "  setCam: (d, p, f) => { camState.dist = d; camState.pitch = p; if (f) { camera.fov = f; camera.updateProjectionMatrix(); } placeCamera(); fitShadow(); } });\n")
    return src

os.makedirs(OUT, exist_ok=True)
for v, rev in WORLDS.items():
    open(os.path.join(OUT, f'world_{v}.js'), 'w').write(patch(git(rev, 'public/worldart/world.js').decode()))
for v, rev in VERS.items():
    d = os.path.join(OUT, v, 'maps', 'mihon2'); os.makedirs(d, exist_ok=True)
    open(os.path.join(OUT, v, 'maps', 'mihon2.json'), 'wb').write(git(rev, 'public/worldart/maps/mihon2.json'))
    open(os.path.join(d, 'placements.json'), 'wb').write(git(rev, 'public/worldart/maps/mihon2/placements.json'))
    open(os.path.join(d, 'height.png'), 'wb').write(git(rev, 'public/worldart/maps/mihon2/height.png'))
    open(os.path.join(d, 'terrain.glb.b64.txt'), 'w').write(base64.b64encode(git(rev, 'public/worldart/maps/mihon2/terrain.glb')).decode())
names = set()
for v in VERS:
    names |= {n.replace('@shadow', '') for n in json.load(open(os.path.join(OUT, v, 'maps', 'mihon2', 'placements.json')))['assets']}
os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
for n in sorted(names):
    open(os.path.join(OUT, 'assets', f'{n}.glb.b64.txt'), 'w').write(base64.b64encode(open(os.path.join(ROOT, 'public/worldart/assets', f'{n}.glb'), 'rb').read()).decode())
if os.path.exists(os.path.join(OUT, 'tex')): shutil.rmtree(os.path.join(OUT, 'tex'))
shutil.copytree(os.path.join(ROOT, 'public/worldart/tex'), os.path.join(OUT, 'tex'))
for f in ('index.html', 'view.html'):   # 比較ページ本体（親）と、版を動かす中の枠
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), f), os.path.join(OUT, f))
print('->', OUT, len(names), 'assets')
