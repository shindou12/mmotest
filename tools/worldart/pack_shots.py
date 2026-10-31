"""撮影画像の PNG を webp（品質 88）に変えて PNG を消す（リポジトリを軽く保つ）。
python3 -I tools/worldart/pack_shots.py [art/shots]"""
import sys, os
from PIL import Image
root = sys.argv[1] if len(sys.argv) > 1 else 'art/shots'
n = 0
for d, _, fs in os.walk(root):
    for f in fs:
        if f.endswith('.png'):
            p = os.path.join(d, f)
            Image.open(p).convert('RGB').save(p[:-4] + '.webp', quality=88); os.remove(p); n += 1
print('packed', n)
