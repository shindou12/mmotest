"""見本と再現を比べる画像と数値を作る（RO風の見た目を確かめるループ用）

使い方:
  python3 tools/ro-look/compare.py <見本.png> <再現.png> <出力フォルダ> [--crop x0,y0,x1,y1]

  --crop: 見本から UI の帯などを切り落とす範囲（見本の元の画素で）。切ったあと 1280×720 にそろえる
出力:
  side.png    上が見本、下が再現（1280×1440）
  overlay.png 半分ずつ重ねた画像（位置と大きさのずれを見る）
  標準出力   場所ごとの平均色（REGIONS を場面に合わせて書き換える）
必要: Pillow（python3 -m pip install pillow）
"""
import sys, os
from PIL import Image

# 比べる場所（1280×720 の画素で x0, y0, x1, y1）。場面ごとに、道・崖・木の茂り・草・主役の木などを選ぶ
REGIONS = {
    'path_top': (720, 100, 800, 250),
    'clearing': (650, 380, 780, 480),
    'left_rock': (60, 250, 250, 400),
    'right_canopy': (950, 50, 1250, 250),
    'lowleft': (0, 600, 300, 720),
    'fir': (400, 150, 500, 350),
    'whole': (0, 0, 1280, 720),
}

def main():
    args = sys.argv[1:]
    crop = None
    if '--crop' in args:
        i = args.index('--crop'); crop = tuple(int(v) for v in args[i + 1].split(',')); del args[i:i + 2]
    ref_p, ours_p, out = args
    os.makedirs(out, exist_ok=True)
    ref = Image.open(ref_p).convert('RGB')
    if crop: ref = ref.crop(crop)
    ref = ref.resize((1280, 720), Image.LANCZOS)
    ours = Image.open(ours_p).convert('RGB').resize((1280, 720))
    side = Image.new('RGB', (1280, 1440)); side.paste(ref, (0, 0)); side.paste(ours, (0, 720))
    side.save(os.path.join(out, 'side.png'))
    Image.blend(ref, ours, 0.5).save(os.path.join(out, 'overlay.png'))
    avg = lambda im, box: im.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
    print(f"{'場所':14s} {'見本':>18s} {'再現':>18s}  明るさの比")
    for name, box in REGIONS.items():
        a, b = avg(ref, box), avg(ours, box)
        ratio = (sum(b) + 1) / (sum(a) + 1)
        print(f'{name:14s} {str(a):>18s} {str(b):>18s}  {ratio:.2f}')

main()
