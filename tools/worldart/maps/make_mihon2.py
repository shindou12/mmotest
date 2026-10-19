"""見本②（南パヨン、B01〜B04）の地図の仕様を作る → public/worldart/maps/mihon2.json
python3 -I tools/worldart/maps/make_mihon2.py
位置は各見本のゲーム部分（1532x869、左右の帯を除く）の画面座標 [u, v]。u = (x - 176) / 1532, v = y / 869（元画像の画素）。
区画（sections）ごとに、その見本の基準カメラで世界座標に直される（build_map.py）。"""
import json, os, copy
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
cu = lambda x: round((x - 176) / 1532, 3)
cv = lambda y: round(y / 869, 3)
P = lambda x, y: [cu(x), cv(y)]          # 元画像の画素 → 画面座標

CAM = dict(yaw=0, pitch=52, dist=22, fov=25, aspect=1532 / 869)
VIEWS = {
    'B01': dict(CAM, target=[0, 0, 0]),
    'B02': dict(CAM, target=[10.1, 0, 0]),         # 円錐の天幕の位置から計算（goal-mihon2.md 2）
    'B03': dict(CAM, target=[-36, 0, -26]),        # 位置は推測
    'B04': dict(CAM, target=[8, 0, -52], pitch=42, dist=17,   # 位置・カメラとも推測（カットシーン）
                light=dict(sun=0.55, hemi=1.05, exposure=1.0, sat=0.82, vignette=0.45, topDark=0.3)),   # カットシーンの照明（L02）
}

B01 = dict(name='B01', camera=VIEWS['B01'],
  paths=[
    dict(screen=[P(640, -60), P(650, 120), P(690, 300), P(800, 400), P(930, 430)], width=2.6, mat='dirt', soft=0.7),      # 北へ
    dict(screen=[P(930, 430), P(1150, 380), P(1450, 330), P(1800, 300)], width=2.5, mat='dirt', soft=0.7),               # 東へ（B02 へつながる）
    dict(screen=[P(930, 430), P(820, 560), P(700, 720), P(600, 900), P(520, 1000)], width=2.8, mat='dirt', soft=0.7),    # 南西へ
    dict(screen=[P(690, 300), P(560, 360), P(380, 420), P(150, 470)], width=1.6, mat='dirt', soft=0.7),                  # 西への細い道
  ],
  cliffs=[dict(screen=[P(100, 140), P(300, 110), P(460, 70), P(560, 20), P(600, -40)], low='near', drop=1.5, width=1.0, jag=0.8,
               radius=9, **{'raise': True}, rocks=dict(mode='face', asset=['cliff_col_a', 'cliff_col_b'], spacing=1.2, scale=[0.42, 0.55])),
          dict(screen=[P(980, 130), P(1150, 120), P(1260, 60), P(1300, -40)], low='near', drop=1.5, width=1.0, jag=0.8,
               radius=8, **{'raise': True}, rocks=dict(mode='face', asset=['cliff_col_a', 'cliff_col_b'], spacing=1.2, scale=[0.42, 0.55]))],
  trees=[
    dict(asset='maple_big', canopy=P(990, 170), scale=1.0),    # 上の大木（樹冠を画面の上に入れる）
    dict(asset='maple_b', canopy=P(1480, 70), scale=1.0),
    dict(asset='maple_b', canopy=P(1290, 380), scale=1.05),     # 右の明るい木（2 本）
    dict(asset='maple_a', canopy=P(1480, 520), scale=1.0),
    dict(asset='maple_c', canopy=P(1640, 330), scale=1.0),
    dict(asset='palm2_b', screen=P(1060, 790), scale=1.4),      # 中央下のヤシ（見本の主役: 樹冠が画面幅の ≈ 1/5）
    dict(asset='palm2_a', screen=P(985, 860), scale=1.3),
    dict(asset='palm2_low', screen=P(440, 270), scale=1.0),     # 左の低いヤシ・羊歯
    dict(asset='palm2_low', screen=P(360, 345), scale=0.9),
    dict(asset='clover_b', screen=P(330, 240), scale=0.9),
    dict(asset='clover_a', screen=P(920, 330), scale=1.0),      # 荷車の右の茂み
    dict(asset='clover_a', screen=P(1180, 560), scale=1.1),
    dict(asset='clover_b', screen=P(1350, 520), scale=1.0),
    dict(asset='clover_a', screen=P(230, 560), scale=0.9),
    dict(asset='clover_a', screen=P(1560, 230), scale=1.0),
  ],
  props=[
    dict(asset='tarp_tent', screen=P(420, 560), rot=8, scale=1.0),
    dict(asset='crate', screen=P(250, 640), rot=15, scale=1.15), dict(asset='crate', screen=P(330, 670), rot=-10, scale=1.15),
    dict(asset='crate', screen=P(290, 650), rot=30, scale=1.05, y=0.92), dict(asset='crate', screen=P(420, 690), rot=5, scale=1.15),
    dict(asset='crate', screen=P(220, 690), rot=-25, scale=1.1),
    dict(asset='cart_frame', screen=P(830, 310), rot=-22, scale=1.0),
    dict(asset='barrel', screen=P(755, 310), rot=0, scale=1.0),
    dict(asset='teepee', screen=P(1385, 820), rot=-40, scale=1.0),
    dict(asset='stump', screen=P(1620, 660), rot=0, scale=0.9),
    dict(asset='lavender', screen=P(1650, 700), scale=1.0), dict(asset='lavender', screen=P(1690, 660), scale=0.9),
    dict(asset='lavender', screen=P(1110, 800), scale=0.9),
    dict(asset='boulder_a', screen=P(385, 300), rot=20, scale=0.55),
  ],
  shadow_casters=[dict(asset='maple_big', screen=P(860, 230), scale=1.0), dict(asset='maple_b', screen=P(700, 820), scale=1.0)],
  groves=[dict(space='screen', centers=[P(200, 120), P(240, 880)], trees=['maple_a', 'palm2_a'],
               count=[2, 3], radius=2.2, scale=[0.95, 1.1])],     # L02: 右の木立は外す（見本の右は明るい木 2〜3 本と草地）
)

B02 = dict(name='B02', camera=VIEWS['B02'],                 # B01 と重なる左 1/3 は B01 で置いた物を使う
  paths=[dict(screen=[P(700, 270), P(950, 330), P(1300, 420), P(1750, 500)], width=2.6, mat='dirt', soft=0.8)],   # L05: 空き地は草地（土は細い道だけ）
  trees=[
    dict(asset='palm2_b', screen=P(770, 790), scale=1.45), dict(asset='palm2_a', screen=P(1020, 860), scale=1.3),
    dict(asset='palm2_b', canopy=P(640, 90), scale=1.35), dict(asset='palm2_b', canopy=P(1110, 150), scale=1.35),   # 樹冠の位置で置く
    dict(asset='maple_b', canopy=P(1470, 140), scale=1.0), dict(asset='palm2_b', screen=P(1520, 800), scale=1.4),
    dict(asset='clover_b', screen=P(800, 220), scale=1.1), dict(asset='clover_b', screen=P(1160, 250), scale=1.1),
    dict(asset='clover_a', screen=P(1200, 800), scale=1.1), dict(asset='clover_a', screen=P(1600, 700), scale=1.0),
  ],
  props=[dict(asset='stump', screen=P(630, 490), scale=1.0), dict(asset='lavender', screen=P(690, 520), scale=1.0),
         dict(asset='lavender', screen=P(720, 500), scale=0.8), dict(asset='boulder_a', screen=P(480, 200), rot=40, scale=0.6)],
  shadow_casters=[dict(asset='maple_big', screen=P(1230, 460), scale=1.1), dict(asset='maple_b', screen=P(1350, 560), scale=1.0)],
)

# B03: 再現済みの forest_path の中身をそのまま区画にする（高い側を持ち上げる形に直す）
fp = json.load(open(os.path.join(ROOT, 'public/worldart/maps/forest_path.json')))
B03 = dict(name='B03', camera=VIEWS['B03'], paths=copy.deepcopy(fp['paths']), trees=copy.deepcopy(fp['trees']),
           props=copy.deepcopy(fp['props']), zones=copy.deepcopy(fp['zones']), shadow_casters=copy.deepcopy(fp.get('shadow_casters', [])),
           cliffs=[])
for cl in fp['terrain']['cliffs']:
    c = copy.deepcopy(cl); c['raise'] = True; c['radius'] = 16; B03['cliffs'].append(c)
for t in B03['trees']:
    t.pop('base', None)
for t in B03['trees']:          # 台地の上の木: 持ち上げた高さで画面の位置を逆算
    if t['asset'] == 'maple_c': t['base'] = 4.5

B04 = dict(name='B04', camera=VIEWS['B04'],
  paths=[dict(screen=[P(1400, 260), P(1400, 600), P(1400, 1000)], width=7.5, mat='flag', jag=0.0, soft=0.06),       # 敷石の広場
         dict(screen=[P(140, 470), P(400, 560), P(560, 680), P(680, 800), P(720, 900)], width=1.4, mat='dirt'),       # 草地の細い土の道
         dict(screen=[P(1350, 120), P(1350, 290)], width=7.0, mat='flag', jag=0.0, soft=0.06)],
  cliffs=[dict(screen=[P(-200, 300), P(560, 300), P(1080, 300)], low='near', drop=0.4, width=0.3, jag=0.0, radius=10, **{'raise': True}),   # 石像の段
          dict(screen=[P(980, 70), P(1800, 70)], low='near', drop=2.0, width=0.6, jag=0.0, radius=10, **{'raise': True})],                # 石段の上
  props=[
    dict(asset='statue', screen=P(680, 345), rot=0, scale=1.3),
    dict(asset='stone_steps', screen=P(1140, 300), rot=0, scale=1.0), dict(asset='stone_steps', screen=P(1370, 300), rot=0, scale=1.0),
    dict(asset='stone_steps', screen=P(1600, 300), rot=0, scale=1.0),
    dict(asset='stone_lantern', screen=P(1060, 290), scale=1.0), dict(asset='stone_lantern', screen=P(1720, 330), scale=1.0),
  ],
  lines=[dict(asset='curb', screen=[P(-100, 305), P(1090, 305)], step=3.0, scale=1.0),
         dict(asset='curb', screen=[P(1090, 305), P(1090, 1000)], step=3.0, scale=1.0),
         dict(asset='rail_fence', screen=[P(-100, 150), P(560, 150)], step=3.0, scale=1.0)],
  trees=[dict(asset='maple_c', canopy=P(350, 150), scale=0.75, base=0.4)],
)

spec = {
  "name": "mihon2",
  "note": "見本②（見本②.zip = S__13352987〜990.jpg = B01〜B04、南パヨン）の世界。区画ごとに見本の基準カメラ（views）を持つ。B01/B02 の位置関係は共通の天幕から計算、B03/B04 の位置は推測（docs/world-art/goal-mihon2.md）。",
  "seed": 202, "aspect": 1532 / 869,
  "camera": VIEWS['B01'], "views": VIEWS,
  "sun": {"azimuth": 70, "elevation": 40, "color": "#fff0d4", "intensity": 4.4},
  "sky": {"color": "#cfe0ee", "light": "#c4ccc8", "ground": "#8a8050", "intensity": 1.8},
  "albedoSat": 0.9, "shadowMap": "vsm", "shadowRadius": 6,
  "foliage": {"wrap": 0.5, "trans": 0.3, "receiveShadow": False, "sat": 0.9, "lift": 0.12},
  "post": {"sat": 0.94, "contrast": 1.0, "lift": [0, 0, 0], "gain": [1, 1, 1], "dof": 1.0},
  "ground": {"grassTint": [1.8, 1.6, 0.62], "lushBias": 0.12, "dirtTint": [0.92, 1.0, 0.42], "rockTint": [0.92, 0.98, 0.88], "rock": "crack",
             "lushTint": [0.55, 0.92, 0.95], "lushAmt": 1.3, "tuftTint": [1.12, 1.05, 0.8], "alt": "flagstone", "altScale": 3.0},
  "terrain": {"size": 150, "cell": 0.5, "ground": "grass", "center": [-8, -22], "hills": {"amp": 0.25, "scale": 16}},
  "paths": [  # 区画どうしをつなぐ道（推測）
    {"world": [[-2.5, -12], [-6, -18], [-14, -22], [-26, -24], [-34, -26]], "width": 2.6, "mat": "dirt"},
    {"world": [[-2.5, -12], [2, -24], [6, -36], [5, -47]], "width": 2.6, "mat": "dirt"},
  ],
  "zones": [   # 区画のまわりを埋める林（見えるのは斜め・遠景のビュー）
    {"kind": "forest", "world": [[-80, -100], [60, -100], [60, 50], [-80, 50]], "trees": ["maple_a", "maple_b", "fir2_a", "palm2_b"],
     "spacing": 3.6, "scale": [0.95, 1.15], "clear": 7.0, "outside_views": True}
  ],
  "sections": [B01, B02, B03, B04],
  "scatter": {
    "grass": {"asset": "grass_a", "spacing": 0.36, "edge_boost": 0.5, "scale": [0.5, 0.85]},
    "tall": {"asset": "grass_tall_a", "spacing": 0.6, "edge": 0.6, "prob": 0.9, "scale": [0.8, 1.3]},
    "bush": {"asset": "clover_a", "edge": [1.0, 3.5], "prob": 0.35, "scale": [0.8, 1.2]},
    "flowers": {"asset": "flowers_a", "spacing": 1.3, "prob": 0.5}
  },
}
out = os.path.join(ROOT, 'public/worldart/maps/mihon2.json')
json.dump(spec, open(out, 'w'), ensure_ascii=False)
print('->', out)
