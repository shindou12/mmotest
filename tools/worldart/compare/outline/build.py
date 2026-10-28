"""輪郭のテストページ（Artifact）の束を作る（L29）。
python3 -I tools/worldart/compare/outline/build.py <出力フォルダ>
元は Codex の codex/outline-blend（森の地図 forest_path_g3 に 3 方式の輪郭・線の色・ガッシュ風）。codex/ は書き換えず、ここで写して直す:
  - 上の画面は「輪郭なし（今の地図）」、下の画面が試作（元は上も固定色の輪郭だった）
  - 見本の拡大（art/ref から原寸で切って 2 倍）を上に並べる
  - three は CDN、地図・絵・アセットは ./w/ の下へ（GLB は Artifact で配られないので base64 のテキスト）
  - iframe と親の postMessage は Artifact の中で origin が "null" になりうるので、origin ではなく相手の窓で確かめる
読み込む物は codex/outline-blend を実際に開いて記録した一覧と同じ（FILES）。"""
import sys, os, json, base64, shutil
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'codex', 'outline-blend')
OUT = os.path.abspath(sys.argv[1])
MAP = 'forest_path_g3'
TEX = ['ground_flagstone', 'noise_soft', 'rock_crack', 'rock_face', 'ground_grass', 'ground_dirt', 'ground_sand', 'ground_cobble', 'rock']
# 見本の拡大: (名前, 切り出す範囲, 説明)
REFS = [
    ('B03', (400, 120, 880, 420), 'B03 崖ともみ'),
    ('B01', (1050, 150, 1530, 450), 'B01 茂みと草地'),
    ('R03', (700, 300, 1180, 600), 'R03 林の縁'),
    ('G02', (1300, 100, 1780, 400), 'G02 近い樹冠'),
]
THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/'

def rd(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f: return f.read()
def wr(rel, text):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: f.write(text)
def sub(src, a, b):
    assert a in src, a
    return src.replace(a, b, 1)
def glb(rel_src, rel_out):
    with open(os.path.join(ROOT, rel_src), 'rb') as f: wr(rel_out + '.b64.txt', base64.b64encode(f.read()).decode())

shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)

# 地図・絵・アセット
W = 'public/worldart/'
for rel in [f'maps/{MAP}.json', f'maps/{MAP}/placements.json'] + [f'tex/{t}.png' for t in TEX]:
    os.makedirs(os.path.dirname(os.path.join(OUT, 'w', rel)), exist_ok=True)
    shutil.copy(os.path.join(ROOT, W, rel), os.path.join(OUT, 'w', rel))
glb(f'{W}maps/{MAP}/terrain.glb', f'w/maps/{MAP}/terrain.glb')
placed = json.load(open(os.path.join(ROOT, W, f'maps/{MAP}/placements.json')))
for name in placed['assets']:
    n = name.replace('@shadow', '')
    glb(f'{W}assets/{n}.glb', f'w/assets/{n}.glb')

# world.js
js = rd('world.js')
js = sub(js, "const BASE = '/public/worldart/';", "const BASE = './w/';")
js = sub(js, "const load = (url) => new Promise((res, rej) => gltf.load(url, res, undefined, rej));",
         "const load = async (url) => {\n  const txt = await (await fetch(url + '.b64.txt')).text();\n"
         "  const bin = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));\n"
         "  return new Promise((res, rej) => gltf.parse(bin.buffer, '', res, rej));\n};")
js = sub(js, "if(event.origin!==location.origin||event.source!==parent)return;", "if(event.source!==parent)return;")
js = sub(js, "parent.postMessage({kind:'forest-orbit',delta},location.origin)", "parent.postMessage({kind:'forest-orbit',delta},'*')")
js = sub(js, "parent.postMessage({kind:'forest-ready'},location.origin);", "parent.postMessage({kind:'forest-ready'},'*');")
wr('world.js', js)
wr('outlines.js', rd('outlines.js'))

# frame.html: three を CDN から
fr = rd('frame.html')
fr = sub(fr, '"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"',
         f'"three":"{THREE_CDN}build/three.module.js","three/addons/":"{THREE_CDN}examples/jsm/"')
wr('frame.html', fr)

# ui.js: 上（data-before）は輪郭なし。origin ではなく窓で確かめる
ui = rd('ui.js')
ui = sub(ui, "state:{...state,method:state.method,", "state:{...state,method:frame.hasAttribute('data-after')?state.method:'none',")
ui = sub(ui, "},location.origin)}", "},'*')}")
ui = sub(ui, "if(e.origin!==location.origin||!frames.some(f=>f.contentWindow===e.source))return;", "if(!frames.some(f=>f.contentWindow===e.source))return;")
# ui.js: おすすめ設定のプリセット（最初の render の前に 1 を適用。yaw は変えない）
ui = sub(ui, "window.__forestUI={state,render};render();", r"""const PRESETS={
recommended:{method:'depthnormal',outlineColor:'adaptive',strength:4,width:1.5,opacity:.6,softness:0,sensitivity:.45,bush:true,grass:false,paint:0},
toon:{method:'depthnormal',outlineColor:'adaptive',strength:6,width:3,opacity:.9,softness:0,sensitivity:.5,bush:true,grass:false,paint:0},
painted:{method:'depthnormal',outlineColor:'adaptive',strength:4,width:1.5,opacity:.6,softness:0,sensitivity:.45,bush:true,grass:false,paint:.4},
outer:{method:'silhouette',outlineColor:'adaptive',strength:3,width:1.5,opacity:.5,softness:.5,sensitivity:.45,bush:false,grass:false,paint:0},
none:{strength:0,paint:0}};
const presetButtons=[...root.querySelectorAll('[data-preset]')];
function markPreset(name){for(const b of presetButtons)b.setAttribute('aria-pressed',String(b.dataset.preset===name))}
function applyPreset(name){const p=PRESETS[name];if(!p)return;Object.assign(state,p);for(const k of Object.keys(p)){const el=root.querySelector('#'+k);if(!el)continue;if(el.type==='checkbox')el.checked=!!state[k];else el.value=String(state[k])}markPreset(name);render()}
root.addEventListener('click',e=>{const b=e.target.closest?.('[data-preset]');if(b)applyPreset(b.dataset.preset)});
root.addEventListener('input',e=>{if(e.target.id in state)markPreset(null)});
window.__forestUI={state,render,applyPreset};applyPreset('recommended');""")
wr('ui.js', ui)

# index.html: 見本の拡大を足し、上の画面を「輪郭なし」に
os.makedirs(os.path.join(OUT, 'ref'))
figs = []
for n, box, label in REFS:
    im = Image.open(os.path.join(ROOT, 'art', 'ref', f'{n}.webp')).convert('RGB').crop(box)
    im.resize((im.width * 2, im.height * 2), Image.LANCZOS).save(os.path.join(OUT, 'ref', f'{n}.jpg'), quality=88)
    figs.append(f'<figure class="ref"><img src="./ref/{n}.jpg" alt="見本 {label}の拡大" loading="lazy"><figcaption>{label}（原寸を 2 倍）</figcaption></figure>')
refsec = ('<details class="refs"><summary>見本（RO3）の拡大を見る</summary><p class="note">見本には黒い線の輪郭は無い。'
          '葉の層の下・岩の割れ目・物が奥に重なる縁が暗く沈んでいて、それが線のように見える。</p>'
          '<div class="refgrid">' + ''.join(figs) + '</div></details>')
ix = rd('index.html')
# Artifact はページを文書の外枠で包むので、外枠を外して中身だけにする
ix = sub(ix, '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>森の輪郭・色をなじませる</title><link rel="stylesheet" href="./style.css"></head><body>',
         '<title>森の輪郭テスト</title><meta name="claude:viewport-fit-sides" content="cover"><link rel="stylesheet" href="./style.css">')
ix = sub(ix, '</body></html>', '')
ix = sub(ix, '<h1>輪郭の色を森になじませる</h1>', '<h1>森の輪郭テスト</h1><p class="note">輪郭線を足して、背景をよりトゥーン調・スタイライズの方向へ寄せられるかを試すページ。上が今の地図（輪郭なし）、下が試作。</p>')
ix = sub(ix, '<p id="hint"></p></header>', '<p id="hint"></p><p class="note">読み込みに 1 分ほどかかります（森を 2 つ描くため）。画面を横にドラッグすると両方が回ります。</p></header>' + refsec)
ix = sub(ix, '<figcaption>現在｜固定色の輪郭</figcaption>', '<figcaption>現在｜輪郭なし（今の地図）</figcaption>')
ix = sub(ix, '<div class="controls">', '<div class="presets" role="group" aria-label="おすすめ設定"><span class="presets-label">おすすめ設定</span>'
         '<button type="button" data-preset="recommended" aria-pressed="false">なじむ線（おすすめ）</button>'
         '<button type="button" data-preset="toon" aria-pressed="false">くっきりトゥーン</button>'
         '<button type="button" data-preset="painted" aria-pressed="false">絵画風</button>'
         '<button type="button" data-preset="outer" aria-pressed="false">外形だけ（控えめ）</button>'
         '<button type="button" data-preset="none" aria-pressed="false">線なし</button></div><div class="controls">')
wr('index.html', ix)

css = rd('style.css') + """
.refs{margin:12px 0 8px}.refs summary{cursor:pointer;font-size:15px;padding:6px 0}
body{background:#19211a;color:#f1f0e1}main{padding-inline:max(16px,env(safe-area-inset-left,0px)) max(16px,env(safe-area-inset-right,0px));padding-block:16px}
header{top:env(safe-area-inset-top,0px)}:root{color-scheme:dark}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #c5d99f;outline-offset:2px}.note{color:#c3d0b3;margin:6px 0 0;font-size:14px}
.presets{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;max-width:100%}.presets-label{color:#c3d0b3;font-size:14px}
.presets button{cursor:pointer;max-width:100%;min-width:0;white-space:normal;text-align:center}.presets button:hover{border-color:#c5d99f}
.presets button[aria-pressed="true"]{background:#c5d99f;color:#19211a;border-color:#c5d99f;font-weight:700}
.refgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px}
.ref{margin:0}.ref img{display:block;width:100%;height:auto}.ref figcaption{font-size:13px;padding:6px 9px}
@media(max-width:700px){.controls label{white-space:normal;flex-wrap:wrap;max-width:100%}input{width:100px;max-width:100%}}
header p,header h1{min-width:0;overflow-wrap:anywhere}
"""
wr('style.css', css)
print('ok', OUT)
