# 既存の砂浜へヤシv4を置く

2026-10-26。`south_coast_g3` へ `palm2_a_liked_frond_v4.glb` を置く比較版。ユーザーの「生い茂りすぎ。この角度で3本」という指示に合わせ、海岸のヤシを9本から3本に絞った。

- 比較: `http://127.0.0.1:8172/codex/palm-coast/`。見本・現在・試作をPC向けの大きな表示で縦に並べる。
- 試作だけ: `frame.html?map=south_coast_g3&palms=trial&occR=0`。
- 比較の現在は同じ新モデルを9本置く `palms=full`。試作は3本。形や色ではなく本数の変更を比較する。
- 既存の地形、砂、海、岩、木箱、他の植生、照明と仕上げを既存のworld.jsから読み込む。
- 残す3本の正本は `layout.json`。既存の配置から、標準カメラで手前・中央・奥へ分かれる3本を選ぶ。残した木の場所・方位・倍率を引き継ぐ。大きいbは元の幹の高さ3.8に合わせ、v4の3.2へ3.8/3.2を掛ける。
- 両種に同じ樹形を使う静的な組み込み。風・部分追従は今回の比較に加えていない。
- 元のworld.jsを読み取り専用で再利用し、専用フォルダの生成版だけへ5箇所のフックと比較用カメラを加える。元ファイルのハッシュとフックは `renderer-source.json` に残す。

```powershell
python -I -X utf8 codex/palm-coast/prepare.py
node codex/palm-coast/capture.mjs
```

確認結果:

- `PREPARED hooks=5; map=south_coast_g3; model=palm2_a_liked_frond_v4`。
- `PALMS current=9; trial=3; NON_PALMS_MATCH=true; RETAINED_TRANSFORMS_MATCH=true`。ヤシ以外の地図データと、残した3本の位置・角度・倍率が元の配置に一致。
- 全景・近景・横・背面・上面を撮影。各視点で現在と試作のカメラ位置・回転・画角が一致。横と背面はcanvasのドラッグで変更した。
- `PAGE_ERRORS=[]`。3本版の画像とカメラの記録は `shots/three-palms/`、実行ログは `capture-three-palms.log`。最初の9本を組み込んだ画像・ログは元の `shots/` に残す。
- 現在と試作の全景、試作の5視点、比較ページの画像を実際に開いた。幹と葉、砂への影を確認。

画像を実際に開くと、3本版では葉冠の間に砂浜が見え、上面でも冠どうしが重ならない。標準カメラは同じ角度を維持した。葉の裏面の細かな暗い筋は残る。
