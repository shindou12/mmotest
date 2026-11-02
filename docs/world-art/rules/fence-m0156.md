# 長さを変えられる木の柵（M-0156、2026-11-02）

- 部品: `tools/worldart/blender/build_fence.py --lengths 0.8,1.5,2,2.5,3`（任意の長さを指定できる）。`fence_w_<cm>.glb` と、列の最後を閉じる `fence_w_post.glb`。
- 組み方: `tools/worldart/maps/fence_fit.py`。折れ線に合わせて区間を選び、地図の `props` の形で出す。
- 絵: `public/worldart/tex/fence_trim.png`（元は `art/painted-gen/fence/`）。横に繰り返せる帯を積んだトリムシート。

## なぜ焼かないか
長さごとに焼くと絵を使い回せない。横木の U を実際の長さに比例させ、面取りの光と線は帯の絵に描く。

## 判断: 仕組みは合格。見た目はもう一歩
**良い所**
- 柵にはっきり読める。切り株（M-0155）より形が素直で、1 回で届いた。
- 長さを変えても木目の大きさがそろう。つないでも柱が二重にならない（`art/shots/painted_glade/v4/lengths.webp`）。
- `fence_fit` の差は 4.3m・11m とも 0.000m。1 区間 132〜260 三角形。

**残っている所**
- 細い。紹介図の太い角材より、丸太の細い柵に見える。
- オレンジが強く、周りの落ち着いた色から浮く。切り株と同じ。木の絵の生成で共通の癖の可能性がある。
- 横木の継ぎ目が柱の上で見える。曲がり角で横木が柱を突き抜ける。
- 折れ線の角に合わせて折れるだけで、なめらかに曲がらない。`painted_glade` の 11m の列は曲がりが急で、短い列とも重なる。配置の問題で、部品の問題ではない。
- 1 か所に点状の模様がある（`fence.webp` の左の柱）。原因は未調査。

## 手順の注意
- Sol high（`gpt-6.1-sol`）で 1 回で通った。Blender はフルパスで 4.2.23 を指定した。
- ゲームへの組み込みと Godot は未対応。`stump_p`・`stump_b` と同じく、`assets.blend` には入れていない。

## 参考
- https://polycount.com/discussion/comment/2778441 （トリムシートと任意の長さ）
- https://github.com/PropGon/propgon-uv-trim （Sol が調べた参考。コードは使っていない）
