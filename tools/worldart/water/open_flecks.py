"""沖の水面を数値で分析する（見本と撮影を同じ道具で）。
  python -I -X utf8 analyze_open.py <画像> x0,y0,x1,y1 [<画像> 枠 ...]
白い点: 枠の明るさの中央値 + 0.22 より明るく、彩度 0.30 未満の画素のつながり（4 近傍）。
大きさは画像の幅に対する割合（幅 1000 に換算した px）で出す（見本 1919px と撮影 1532px を比べるため）。
波の筋: 白い点を除いた明るさの揺れ（標準偏差）、明るさの勾配の向き（構造テンソル。0° = 横に長い筋）、縦方向の自己相関の最初の山（筋の間隔）。
"""
import sys
from collections import deque
import numpy as np
from PIL import Image


def analyze(path, box):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255.0
    W = im.shape[1]; k = 1000.0 / W
    x0, y0, x1, y1 = box
    a = im[y0:y1, x0:x1]
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    mx, mn = a.max(-1), a.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    med = np.median(lum)
    white = (lum > med + 0.22) & (sat < 0.30)
    # つながり
    H, Wd = white.shape; seen = np.zeros_like(white); blobs = []
    for y in range(H):
        for x in range(Wd):
            if white[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; ys = []; xs = []
                while q:
                    cy, cx = q.popleft(); ys.append(cy); xs.append(cx)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < Wd and white[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                w = (max(xs) - min(xs) + 1) * k; h = (max(ys) - min(ys) + 1) * k
                if len(ys) * k * k >= 1.0: blobs.append((w, h, len(ys) * k * k))
    area_k = H * Wd * k * k / 1e4   # 幅 1000 換算で 100x100 の何個分
    rest = lum[~white]
    gy, gx = np.gradient(np.where(white, med, lum))
    J = np.array([[np.mean(gx * gx), np.mean(gx * gy)], [np.mean(gx * gy), np.mean(gy * gy)]])
    ev, evec = np.linalg.eigh(J); g = evec[:, 1]                     # いちばん強い勾配の向き
    streak_ang = (np.degrees(np.arctan2(g[1], g[0])) + 90) % 180    # 筋の向き（勾配に直交）。0/180 = 横
    coh = (ev[1] - ev[0]) / max(ev[1] + ev[0], 1e-9)               # 1 に近いほど筋がそろう
    col = np.where(white, med, lum).mean(1); col = col - col.mean()
    ac = np.correlate(col, col, 'full')[len(col) - 1:]; ac /= max(ac[0], 1e-9)
    per = next((i for i in range(2, len(ac) - 1) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0.05), None)
    bw = np.array([b[0] for b in blobs]) if blobs else np.zeros(1); bh = np.array([b[1] for b in blobs]) if blobs else np.zeros(1)
    wc = a[white].mean(0) * 255 if white.any() else np.zeros(3)
    print(f'{path} {box}')
    print(f'  白い点: {len(blobs)} 個（100x100 あたり {len(blobs) / area_k:.2f}）、面積の割合 {white.mean() * 100:.2f}%、'
          f'幅 中央 {np.median(bw):.1f}・最大 {bw.max():.1f}、高さ 中央 {np.median(bh):.1f}、縦横比（幅/高さ）中央 {np.median(bw / np.maximum(bh, 1e-6)):.2f}、色 {wc.round().astype(int).tolist()}')
    print(f'  明るさ: 中央 {med:.3f}、揺れ（白い点を除く）{rest.std():.3f}、筋の向き {streak_ang:.0f}°（そろい {coh:.2f}）、縦の間隔 {per * k if per else 0:.1f}')


args = sys.argv[1:]
for i in range(0, len(args), 2):
    analyze(args[i], tuple(int(v) for v in args[i + 1].split(',')))
