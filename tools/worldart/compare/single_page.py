"""撮影を切り替えて比べる、画像を埋め込んだ HTML 1 枚を作る（L29）。古い iOS でも開ける（3D なし・外の読み込みなし）。
python3 -I tools/worldart/compare/single_page.py <設定.json> <出力.html>
設定: {"title": "...", "sets": [{"name": "B01 全体", "crop": [x0, y0, x1, y1] (省略可、0〜1),
        "items": [{"label": "見本", "path": "art/ref/B01.webp", "trim": 176}, {"label": "今", "path": "..."}]}]}
trim: 左右の黒い帯を落とす画素数（見本のスマホ撮影）。最初の画像の大きさに他をそろえる。
見本（RO3 のキャプチャ）を含むので、出力は手元で見るだけにし、公開しない。"""
import sys, json, base64, io, html
from PIL import Image

cfg = json.load(open(sys.argv[1], encoding='utf-8'))
W = cfg.get('width', 1100)

def enc(im):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=cfg.get('quality', 78)); return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

sets = []
for s in cfg['sets']:
    ims = []
    for it in s['items']:
        im = Image.open(it['path']).convert('RGB')
        if it.get('trim'): im = im.crop((it['trim'], 0, im.width - it['trim'], im.height))
        ims.append(im)
    size = next((im.size for im, it in zip(ims, s['items']) if not it.get('trim')), ims[0].size)
    ims = [im.resize(size) for im in ims]
    if s.get('crop'):
        x0, y0, x1, y1 = s['crop']; box = (int(size[0] * x0), int(size[1] * y0), int(size[0] * x1), int(size[1] * y1))
        ims = [im.crop(box) for im in ims]
    ims = [im.resize((W, round(im.height * W / im.width)), Image.LANCZOS) if im.width > W else im for im in ims]
    sets.append({'name': s['name'], 'items': [{'label': it['label'], 'src': enc(im)} for it, im in zip(s['items'], ims)]})

page = """<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%TITLE%</title><style>
:root{--bg:#19211a;--fg:#f1f0e1;--sub:#c3d0b3;--btn:#303c2e;--line:#778a6c;--on:#c5d99f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px -apple-system,system-ui,sans-serif;padding:12px 16px 40px}
h1{font-size:19px;margin:0 0 4px}p{color:var(--sub);margin:4px 0 10px;font-size:13px}
.row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
button{background:var(--btn);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:9px 12px;font-size:15px;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
button.on{background:var(--on);color:var(--bg);border-color:var(--on);font-weight:700}
#hold{border-style:dashed}
.view{position:relative}.view img{display:block;width:100%;height:auto;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#cap{position:absolute;left:0;top:0;background:#000a;color:#fff;padding:4px 9px;font-size:14px;font-weight:700}
</style></head><body>
<h1>%TITLE%</h1><p>上の列で場面、下の列で版を選ぶ。「押している間だけ 今」を押している間は「今」に切り替わる。画像を押しても切り替わる（次の版へ）。</p>
<div class="row" id="sets"></div><div class="row" id="items"></div>
<div class="row"><button id="hold">押している間だけ 今</button></div>
<div class="view"><img id="img" alt=""><div id="cap"></div></div>
<script>
const S=%DATA%;let si=0,ii=0,hold=false;
const $=id=>document.getElementById(id);
function draw(){const set=S[si];let k=ii;if(hold){const n=set.items.findIndex(x=>x.label==='今');if(n>=0)k=n}
 $('img').src=set.items[k].src;$('cap').textContent=set.items[k].label+(hold?'（押している間）':'');
 [...$('sets').children].forEach((b,i)=>b.className=i===si?'on':'');[...$('items').children].forEach((b,i)=>b.className=i===ii?'on':'');}
function items(){$('items').innerHTML='';S[si].items.forEach((it,i)=>{const b=document.createElement('button');b.textContent=it.label;b.onclick=()=>{ii=i;draw()};$('items').appendChild(b)});if(ii>=S[si].items.length)ii=0}
S.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.name;b.onclick=()=>{si=i;items();draw()};$('sets').appendChild(b)});
const on=e=>{e.preventDefault();hold=true;draw()},off=()=>{hold=false;draw()};
$('hold').addEventListener('touchstart',on,{passive:false});$('hold').addEventListener('touchend',off);$('hold').addEventListener('touchcancel',off);
$('hold').addEventListener('mousedown',on);addEventListener('mouseup',()=>{if(hold)off()});
$('img').onclick=()=>{ii=(ii+1)%S[si].items.length;draw()};
items();draw();
</script></body></html>"""
page = page.replace('%TITLE%', html.escape(cfg['title'])).replace('%DATA%', json.dumps(sets, ensure_ascii=False))
open(sys.argv[2], 'w', encoding='utf-8').write(page)
print(sys.argv[2], round(len(page) / 1e6, 2), 'MB')
