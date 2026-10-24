# 夜の校舎：three.js 試作

暗い学校の廊下を一人称視点で歩く、2D画像だけを使った描画実験です。立体の箱や3Dモデルは置かず、平面に貼った画像を前後に分けて、歩行と視点移動で奥行きが見えるようにしています。

## 起動

リポジトリのルートで静的サーバーを起動します。

    python -m http.server 8172

ブラウザーで http://localhost:8172/codex/school-horror/ を開きます。画面をクリックして開始し、WASD で歩き、マウスで見回します。Esc でマウス操作を戻します。B キーで壁の凹凸を切り替え、F キーで懐中電灯を点けます。

## 2D画像で奥行きを作る方法

- 壁の画像には、窓とドアの位置にアルファの抜きを作っています。枠の画像は壁面の少し手前、校庭と教室の画像は壁の向こう側に置くため、視点を動かすと各層が別々にずれます。
- 窓ガラス部分は透明な窓枠画像を使い、壁の開口から夜の校庭を見せます。
- ドアは壁の開口、枠、開閉角を付けたドア板、教室の画像に分けています。ドアの隙間から教室の奥が見える構成です。
- 倒れた椅子はカメラを向く Sprite ではなく、廊下に向きを固定した画像の平面です。カメラを横に回しても勝手に回転しませんが、真横に近い角度からは薄く見えます。全周から見る場合は、角度ごとの画像を切り替える impostor が次の候補です。

平面は画像を置くための面だけに使い、箱や立体モデルは使いません。画像はこのフォルダーの assets/ に保存してあり、外部 API キーや追加の有料サービスは使っていません。

## 使った参考

- Three.js Sprite: カメラを向くスプライトの仕組み
  https://threejs.org/docs/pages/Sprite.html
- Three.js Material.alphaMap: 画像のアルファで面を抜く仕組み
  https://threejs.org/docs/pages/Material.html
- Shade et al., Layered Depth Images, SIGGRAPH 1998:
  https://dash.harvard.edu/entities/publication/73120378-7e84-6bd4-e053-0100007fdf3b
- Tucker and Snavely, Single-View View Synthesis with Multiplane Images, CVPR 2020:
  https://openaccess.thecvf.com/content_CVPR_2020/html/Tucker_Single-View_View_Synthesis_With_Multiplane_Images_CVPR_2020_paper.html
