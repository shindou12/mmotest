"""沖の水面の模様の粒の大きさ: 明るさ（白い点を除く）の自己相関が 0.5 に落ちる長さ（幅 1000 換算 px）を横・縦で。
  python -I -X utf8 grain.py <画像> x0,y0,x1,y1 ..."""
import sys
import numpy as np
from PIL import Image
args = sys.argv[1:]
for i in range(0, len(args), 2):
    im = np.asarray(Image.open(args[i]).convert('RGB')).astype(np.float32) / 255.0
    k = 1000.0 / im.shape[1]
    x0, y0, x1, y1 = (int(v) for v in args[i + 1].split(','))
    a = im[y0:y1, x0:x1]; L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    med = np.median(L); L = np.where(L > med + 0.22, med, L); L = L - L.mean()
    F = np.fft.fft2(L); ac = np.real(np.fft.ifft2(F * np.conj(F))); ac /= ac[0, 0]
    lx = next((j for j in range(1, ac.shape[1] // 2) if ac[0, j] < 0.5), 0) * k
    ly = next((j for j in range(1, ac.shape[0] // 2) if ac[j, 0] < 0.5), 0) * k
    print(f'{args[i]}: 粒 横 {lx:.1f}・縦 {ly:.1f}（横/縦 {lx / max(ly, 1e-6):.2f}）、揺れ {L.std():.3f}')
