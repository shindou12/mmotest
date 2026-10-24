# 比較シート: 上段 = ブラウザ版、下段 = Godot 版。列 = <様式>@<刻み> の並び。
# 使い方: sheet.py <出力.png> <種類> <様式@刻み,様式@刻み,...> [縮尺 0.42] [切り出し x0,y0,x1,y1]
import sys, os
from PIL import Image, ImageDraw
out, kind, cols = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
S = float(sys.argv[4]) if len(sys.argv) > 4 else 0.42
crop = tuple(int(v) for v in sys.argv[5].split(',')) if len(sys.argv) > 5 else (0, 0, 1532, 869)
root = os.path.dirname(os.path.abspath(__file__))
w = int((crop[2] - crop[0]) * S); h = int((crop[3] - crop[1]) * S)
sheet = Image.new('RGB', (w * len(cols), (h + 14) * 2), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for r, (who, pat) in enumerate((('browser', 'browser/%s_%s_%s.png'), ('godot', 'godot/p_%s_%s_%s.png'))):
    for c, col in enumerate(cols):
        st, m = col.split('@')
        p = os.path.join(root, pat % (st, kind, m))
        if os.path.exists(p):
            sheet.paste(Image.open(p).convert('RGB').crop(crop).resize((w, h)), (c * w, r * (h + 14) + 14))
        d.text((c * w + 4, r * (h + 14) + 1), '%s %s %s step %s' % (who, st, kind, m), fill=(255, 255, 0))
sheet.save(os.path.join(root, out))
print('saved', out)
