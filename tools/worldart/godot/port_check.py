"""three.js 版と Godot 版を、地図ごと・ビューごとに同じ条件で撮り、比較シートと数値の表を作る。
python3 -I tools/worldart/godot/port_check.py [地図,...] [--skip-three] [--skip-godot] [--views a,b]
  地図の既定: public/worldart/maps/<名>.json のうち <名>/placements.json があるもの全部
  ビューの既定: 地図の views のキー全部。views がなければ cam（地図の camera。views.mjs は知らない名前を camera に解決する）
  出力: art/shots/port/<地図>/{three,godot}/<ビュー>.png, art/shots/port/<地図>/compare.webp, art/shots/port/summary.{md,json}
  撮影は 1 つずつ順に（CPU を食い合わない）。解像度は両方 960x540。
  判定（✗）: 輝度の差 > 0.03、彩度の差 > 0.04、明暗比の差 > 0.25"""
import sys, os, json, subprocess, glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'worldart'))
import refstats   # 輝度・彩度・明暗比の定義はこれと同じ

W, H = 960, 540
OUT = os.path.join(ROOT, 'art', 'shots', 'port')
MAPS = os.path.join(ROOT, 'public', 'worldart', 'maps')
LIM = {'L': 0.03, 'S': 0.04, 'R': 0.25}

def arg_after(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None

def all_maps():
    return sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(MAPS, '*.json'))
                  if os.path.exists(os.path.join(MAPS, os.path.basename(p)[:-5], 'placements.json')))

def map_views(m):
    spec = json.load(open(os.path.join(MAPS, m + '.json')))
    return list(spec.get('views', {}).keys()) or ['cam']

def shoot_three(m, views, d):
    os.makedirs(d, exist_ok=True)
    subprocess.run(['node', 'tools/worldart/views.mjs', m, d, ','.join(views), str(W), str(H)], cwd=ROOT, check=True)

def shoot_godot(m, views, d):
    os.makedirs(d, exist_ok=True)
    env = dict(os.environ, VK_ICD_FILENAMES='/usr/share/vulkan/icd.d/lvp_icd.json')
    cmd = ['xvfb-run', '-a', '-s', f'-screen 0 {W}x{H}x24', 'godot', '--path', 'godot/worldart',
           '--resolution', f'{W}x{H}', '--', f'--map={m}', f'--shot={",".join(views)}', f'--out={d}']
    r = subprocess.run(cmd, cwd=ROOT, env=env, timeout=1500, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    tail = [l for l in r.stdout.splitlines() if not any(k in l.lower() for k in ('alsa', 'audio', 'status < 0'))]
    print('\n'.join(tail[-15:]))

def measure(p):
    a, mk = refstats.load(p, W)
    s = refstats.stats(a, mk)
    return {'L': s['L_mean'], 'S': s['S_mean'], 'R': s.get('lit_shadow_ratio')}

def sheet(m, views, d3, dg, out):
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 22)
    except Exception: font = ImageFont.load_default()
    w, h = 760, 431
    S = Image.new('RGB', (w * 2 + 12, (h + 8) * len(views)), (24, 26, 22)); dr = ImageDraw.Draw(S)
    for i, v in enumerate(views):
        for j, (f, lab) in enumerate(((d3, 'three.js'), (dg, 'Godot'))):
            fp = os.path.join(f, v + '.png')
            x, y = j * (w + 12), i * (h + 8)
            if os.path.exists(fp):
                S.paste(Image.open(fp).convert('RGB').resize((w, h), Image.LANCZOS), (x, y))
            dr.rectangle([x, y, x + 330, y + 32], fill=(0, 0, 0))
            dr.text((x + 8, y + 3), f'{v}  {lab}' + ('' if os.path.exists(fp) else '  (なし)'), fill=(255, 255, 255), font=font)
    S.save(out, quality=82)
    print('->', out, S.size)

def fmt(x): return '-' if x is None else f'{x:.3f}'

def main():
    pos = [a for a in sys.argv[1:] if not a.startswith('--')]
    vopt = arg_after('--views')
    if vopt: pos = [a for a in pos if a != vopt]
    maps = pos[0].split(',') if pos else all_maps()
    skip3, skipg = '--skip-three' in sys.argv, '--skip-godot' in sys.argv
    rows = []
    for m in maps:
        views = vopt.split(',') if vopt else map_views(m)
        d3, dg = os.path.join(OUT, m, 'three'), os.path.join(OUT, m, 'godot')
        if not skip3: shoot_three(m, views, d3)
        if not skipg: shoot_godot(m, views, dg)
        for v in views:
            p3, pg = os.path.join(d3, v + '.png'), os.path.join(dg, v + '.png')
            row = {'map': m, 'view': v, 'three': None, 'godot': None, 'diff': None, 'ng': []}
            if os.path.exists(p3): row['three'] = measure(p3)
            if os.path.exists(pg): row['godot'] = measure(pg)
            if row['three'] and row['godot']:
                row['diff'] = {k: (row['godot'][k] - row['three'][k]) if row['three'][k] is not None and row['godot'][k] is not None else None for k in LIM}
                row['ng'] = [k for k in LIM if row['diff'][k] is not None and abs(row['diff'][k]) > LIM[k]]
            rows.append(row)
        os.makedirs(os.path.join(OUT, m), exist_ok=True)
        sheet(m, views, d3, dg, os.path.join(OUT, m, 'compare.webp'))
    os.makedirs(OUT, exist_ok=True)
    json.dump(rows, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
    L = ['# three.js と Godot の比較（port_check）', '',
         '差 = Godot - three.js。✗: 輝度の差 > 0.03、彩度の差 > 0.04、明暗比の差 > 0.25', '',
         '| 地図 | ビュー | 輝度 3/G/差 | 彩度 3/G/差 | 明暗比 3/G/差 | 判定 |', '|---|---|---|---|---|---|']
    for r in rows:
        cells = []
        for k in ('L', 'S', 'R'):
            t, g = (r['three'] or {}).get(k), (r['godot'] or {}).get(k)
            dv = (r['diff'] or {}).get(k)
            cells.append(f'{fmt(t)} / {fmt(g)} / {"-" if dv is None else f"{dv:+.3f}"}' + (' ✗' if k in r['ng'] else ''))
        j = '-' if r['diff'] is None else ('✗ ' + ','.join(r['ng']) if r['ng'] else 'ok')
        L.append(f'| {r["map"]} | {r["view"]} | ' + ' | '.join(cells) + f' | {j} |')
    open(os.path.join(OUT, 'summary.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L))

main()
