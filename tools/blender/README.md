# Blender でマップ用モデルを作る

| ファイル | 中身 |
|---|---|
| `mmo_common.py` | 共通処理（パレット材質・削ぎ面・原点合わせ・GLB 書き出し・manifest 追記） |
| `rock.py` | 岩 3 種 → `public/assets/models/blender/rock_0*.glb` |
| `tree_broadleaf.py` | 広葉樹 3 種 → `tree_broadleaf_0*.glb` |
| `cottage_glade.py` | 森の小屋の一角（エリア f1_glade「木漏れ日の小屋」）の小屋・前庭・周りの森 → `cottage_glade.glb`・`cottage.glb`・`public/shared/glade-layout.js`・`cottage_glade.blend`（現状版。比較の基準） |
| `cottage_glade_ro3.py` | 同じ一角の RO3 風の比較版（同じ配置。描いたテクスチャ・葉の板）→ `cottage_glade_ro3.glb`・`glade-layout-ro3.js`・`cottage_glade_ro3.blend`。ゲームでは `/?solo&glade=ro3`。見比べは `docs/glade/README.md` |

## 動かし方
- **デスクトップの Blender**: Scripting タブでスクリプトを開いて Run。今のシーンは空になって作り直されます（保存していない作業があれば先に保存してください）
- **コマンド**: `blender -b -P tools/blender/rock.py`
- **Blender なし**: `pip install bpy==4.2.0`（Python 3.11）を入れて `python tools/blender/rock.py`

書き出したモデルは `public/assets/models/manifest.json` に追記されます。箱庭（`/sandbox.html`）の視点「外部モデル」で並んで見えます。

## 取り決め
- 1 単位 = 1 m。原点は底の中心で、少し地面に埋めます。Blender は Z 上ですが、GLB へは Y 上で書き出します
- フラットシェード。色は材質で付けます（材質名 = `PALETTE` の名前）。画像のテクスチャは使いません
- 面数の目安: 岩 は 200〜500、木 は 2000 以下
- 手で直したときは、そのまま File → Export → glTF 2.0（.glb）で `public/assets/models/blender/` に上書きして構いません
