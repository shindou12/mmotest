# 側片の流れを逆にする

ユーザー指摘: 見本（左）と試作（右）で側片の流れが逆。垂れた葉なのに、側片の先が根元へ反り返っていた。

## 原因と修正

前回は輪郭を丸くすることに偏り、側片と葉脈の方向を見落とした。モデルでは画像の下端が樹冠側の付け根、上端が葉先へ対応する。従来の絵は側片の外端が画像の下へ戻っていたため、下垂する葉へ貼ると反り上がって見えた。

組み込みimagegenで作り直した。最初の編集でも向きが変わらず不採用。ユーザーの比較画像の左側を基準に再生成し、側片の外端と葉脈が画像上端の葉先へ流れる絵を選んだ。明るいオリーブ系の塗りを保ち、幹・葉の曲線・配置・風の式は変更しない。全体案の再生成は行っていない。

- 材質の正本: profiles.json の flow。前案 soft は保存。
- 採用した画像: assets/frond-flow-v3.png。
- 見本: reference/leaf-flow.png。
- 実際の生成指示: PROMPTS-flow-v3.json（不採用の最初の指示も記録）。
- APIキー、従量課金、追加インストールなし。

## 目視確認

ユーザーの比較画像、前案の葉画像、生成結果を実際に開いた。新画像は葉脈と側片が同じ葉先へ流れる。さらに同じ幹・光・カメラでBlender撮影した正面40度・低い18度・横90度を実際に開いた。下垂する葉の側片が葉先へ流れ、従来の根元へ戻る鉤状の印象が変わった。平面を横から見ると薄くなる性質と、先端の自然な細まりは残る。

今回の比較は soft → flow。見本、現在、試作の順。風のページの動く側にも flow を指定した。過去の全体案は葉の向き修正が未反映と表示し、旧画像は上書きしない。

## 撮影・保存先

```powershell
& 'C:/Users/shind/AppData/Local/Programs/blender-4.2.23-windows-x64/blender.exe' -b --factory-startup --python codex/palm-textures/preview.py -- --flow
& 'C:/Users/shind/AppData/Local/Programs/blender-4.2.23-windows-x64/blender.exe' -b --factory-startup --python codex/palm-wind/preview.py -- --flow
python -I -X utf8 codex/palm-wind/pack.py --flow
```

- 材質比較: shots/v4-flow/ の6枚、preview-flow.log。
- 風の比較: ../palm-wind/shots/v5-flow/ の静止画9枚、弱・中各96フレーム/8秒GIF、連続画像。
- 風のログ: ../palm-wind/preview-flow.log、pack-flow.log。
- 参照先・透過等の確認: checks-flow.log。

Three.js実画面は既存のブラウザ接続のセキュリティ拒否により未確認。拒否を回避せず、Blenderの確認と区別する。本体採用は未決定。
