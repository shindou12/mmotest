# 葉カードの部分ビルボード試作

2026-10-25。Blender＋Three.jsで、既存ワールドマップの広葉樹を部分追従させる独立試作。
**状態: 検証中。本体へは未採用。**

後続の[追従前提で作った専用木](C:/Users/shind/.codex/worktrees/horror-school/mmotest/codex/billboard-tree/README.md)でもこの材質と比較UIを再利用している。材質に任意の支点・房別係数・角度上限を追加したが、このページの旧カードは従来の中心・係数1・上限なしとして扱う。

## 比較ページ

[見本｜現在｜試作](http://127.0.0.1:8172/codex/partial-billboard/)

- 左は参照画像B01、中央は固定、右は追従量を変更する試作。
- 追従0／0.5／1を切替。標準・近景・横・斜めの視点と、方位を同時に変更できる。画面のドラッグでも方位を変更する。
- 対象はmaple2_s（80カード）とmaple2_t（76カード）。幹、葉の画像、球状の照明法線、地面、他のアセットと既存の光・仕上げはそのまま。
- 中央も右もカードID付きの同じGLBを使い、追従量だけが異なる。
- 下の折りたたみにはBlenderの形状確認画像を置いた。これはThree.jsの実画面ではない。

導入済みのPythonで、作業ツリーのルートから配信する。追加インストールなし。

```powershell
python -m http.server 8172 --bind 127.0.0.1
```

## 制作と処理

1. `build.py`は既存`tools/worldart/blender/build_assets.py`を読み取り専用で再利用する。元の生成関数・シード・テクスチャで木を作る。
2. 葉の四角形ごとに中心・向き・補助軸を取得し、GLBへ`_CARD_ID`、JSONへ対応する情報を保存する。BlenderのZ-UpからglTFのY-Upへ変換する。
3. 両面の葉カードで好ましい表を上向きに揃える。頂点の巻き順が作る下向き法線をそのまま使うと、半分追従で裏返る途中の面を見せ、幹が露出した。照明用の球状法線にはこの変更を加えない。
4. Three.jsは葉の中心を固定し、元の面方向から視線方向への回転角へ追従量を掛ける。標準の軸角回転で四角形を剛体として回し、位置の線形混合による縮みを避ける。
5. 同じ頂点変形を影用材質にも設定する。影のパスで参照する方向も主カメラ。ライトに葉を向ける処理にはしない。
6. `prepare.py`は既存world.jsを専用フォルダへ複製し、4箇所のフックと2箇所の描画呼出しを変更する。元コードのSHA256と置換箇所は`renderer-source.json`に記録。元コードが変わって置換箇所が一意でなくなったら停止する。

変更・生成先はすべてこのフォルダ。本番のGLB、world.js、Godot、既存比較ページは編集していない。

### 再生成

作業ツリーのルートから実行する。

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/partial-billboard/build.py
python -I -X utf8 codex/partial-billboard/prepare.py
```

Blender内の確認画像を生成する場合:

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/partial-billboard/preview.py
```

## 確認できたこと

- Blender 4.2.23で出力完了。`LEAF_CARDS maple2_s: 80 cards`、`maple2_t: 76 cards`。
- GLBを実際に読み、葉プリミティブの`_CARD_ID`がそれぞれ0〜79／0〜75を保持し、POSITION・NORMAL・UV・COLOR_0もあることを確認した。
- 既存の生成コードは最新のclaude/art-style-L27側と同じSHA256だった。
- `node --check`で`foliage.js`・`ui.js`・`world.generated.js`の構文エラーなし。WebGLコンパイル確認とは別。
- Blenderの俯角20°・45°、追従0・0.5・1の6画像を実際に開いた。20°では葉が薄く見える箇所が減る。45°では輪郭の変化が比較的小さい。完全追従は葉の面が重なって均一に埋まる傾向がある。
- 修正後の回転による「頂点からカード中心までの距離」の最大誤差は`0.00000027 m`。
- Blender画像の固定版からの画素差（RGBの最大差が3を超える画素）: 20°・0.5は18.67%、20°・1は20.99%、45°・0.5は15.91%、45°・1は17.37%。変形に画像が応答した確認であり、品質の点数ではない。
- Three.js比較ページの「現在」「試作」の両表示はユーザーが確認した（同日の会話）。こちらからの自動ブラウザ接続はセキュリティ判定で拒否されたため、別ブラウザ・Playwright等で回避していない。
- 同じ比較ページに対するユーザーの反応は「かなりいいよ」。正式な採用・全視点での確認とは分けて記録する。

## 固定・半分追従・完全追従

追従量は葉の枚数でも時間の遅れでもなく、向ける角度の割合。

| 追従量 | カメラ正面まで60°の回転が必要なカードの例 |
|---|---|
| 0（固定） | 回さない。Blenderの元の向き |
| 0.5（半分追従） | 30°回す。元の枝ぶりと見える面積を折衷 |
| 1（完全追従） | 60°回す。カードの面をカメラへ向ける |

いずれも木全体や幹を回す処理ではない。カードの中心と大きさは保ち、球状の照明法線も元のまま。
木・茂み・草のような静的な配置物にも使用できる。カメラを動かす場合は、配置が静的でも葉の向きは実行時に変わる。
固定視点専用なら、狙った視点への部分回転をBlenderで適用してGLBへ焼き込む方法もある。その場合は別角度へ回ったときに葉が正面を向く保証はない。
家・椅子等へ適用する場合、構造や接地点まで動かすと輪郭や接続が変わる。固定する構造と回せる画像部分の切り分けが必要で、現在の葉の実装を全体へそのまま当てる用途にはしない。

## 保存物

- `assets/leaves.blend`、`maple2_s.glb`、`maple2_t.glb`、`cards.json`: Blenderからの出力。
- `shots/v2/blender-{20|45}-follow-{0|50|100}.png`: 修正後のBlender画像6枚。
- `build.log`、`preview-v2.log`: 成功した生成・撮影ログ。
- `preview.log`: 撮影済み画像への上書きで`Invalid argument`が出たログ。新しいv2フォルダへの出力で解消した。途中の旧画像は除いた。

## 未確認・残る課題

- こちらでThree.js実画面のスクリーンショットを開くこと、GLSLコンパイルログを読むこと、カメラ一周で連続性・影の一致を確認することは未完了。ユーザーの両表示確認から、表示開始までは確認できた。
- 球状の照明法線は房の明暗を保つため固定している。幾何学的な板の向きと同じ法線を使う方式ではない。
- 回転の実装はworldartで使う回転＋等方スケールのInstancedMeshが前提。非等方スケール、スキニング、モーフには対応していない。
- 追従は枝への接続を拘束しない。大きいカードで端が枝から離れる可能性、低い／裏側の視点での動き、カメラに合わせて影が動く見え方は確認が必要。
- 葉の絵の細かな黒い線、草と道の境、他の樹種の形は変わらない。見本への接近や採用の判断は保留。

## 参考にした既存実装

| 資料 | 調べた点・判断 |
|---|---|
| [pmndrs/drei Billboard](https://github.com/pmndrs/drei/blob/master/src/core/Billboard.tsx)／[MITライセンス](https://github.com/pmndrs/drei/blob/master/LICENSE) | 現行コードを確認。親の回転を除いたカメラ追従、軸の固定を参考にした。React／R3F前提でオブジェクト単位なので依存は追加しない |
| [MasatoMakino/threejs-billboard](https://github.com/MasatoMakino/threejs-billboard)（MIT） | 複数方式とY軸追従の比較。継続的なコミットがあり、依存はThree.jsとPixi.js。今回のカード単位の変形にPixiは不要なので導入しない |
| [Michael Dougall: Creating fluffy trees with Three.js](https://douges.dev/blog/threejs-trees-1) | 木全体ではなくメッシュ内の各四角形を動かすという区別、既存の材質へ頂点変形を組み合わせる考え方を確認。記事のコードは転載していない |
| 既存Three.js r160のGLTFLoader | 未知のglTF属性を小文字名で読み込む実装を確認し、`_CARD_ID`を`_card_id`として受け取る |

既存ライブラリの設計を比較し、今回の追加はカード情報の受け渡しと標準の回転式に限定した。APIキー・課金・生成サービス・新規パッケージは使っていない。
