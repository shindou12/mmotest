"""2 つのフォルダの同じ名前のビューを左右に並べた比較シートを作る（L25: ゲームの今の絵 | 第 3 世代で作り直した絵）。
python3 -I tools/worldart/pairsheet.py <左のフォルダ> <右のフォルダ> <出力.webp> F01,F02,... [--labels 左の名前,右の名前]"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
a, b, out, views = sys.argv[1:5]
labels = sys.argv[sys.argv.index('--labels') + 1].split(',') if '--labels' in sys.argv else [a, b]
W, H = 760, 431
try: font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 22)
except Exception: font = ImageFont.load_default()
vs = views.split(',')
S = Image.new('RGB', (W * 2 + 12, (H + 8) * len(vs)), (24, 26, 22)); d = ImageDraw.Draw(S)
for i, v in enumerate(vs):
    for j, f in enumerate((a, b)):
        fp = os.path.join(f, v + '.png'); fp = fp if os.path.exists(fp) else fp[:-4] + '.webp'   # pack_shots の後は webp
        im = Image.open(fp).convert('RGB').resize((W, H), Image.LANCZOS)
        S.paste(im, (j * (W + 12), i * (H + 8)))
        d.rectangle([j * (W + 12), i * (H + 8), j * (W + 12) + 330, i * (H + 8) + 32], fill=(0, 0, 0))
        d.text((j * (W + 12) + 8, i * (H + 8) + 3), f'{v}  {labels[j]}', fill=(255, 255, 255), font=font)
S.save(out, quality=82)
print('->', out, S.size)
