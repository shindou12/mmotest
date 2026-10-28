# 柔らかいもみの木

2026-10-26。ユーザー指定: ROの見本と実物のもみの写真を参照し、ROになじむ柔らかくかわいい完成像にする。

1. 現在のfir4系を保存して単体比較する。
2. 完成像A「柔らかな円錐」、B「丸い裾」、C「自然な左右差」を生成。Aを基準にする。
3. 密な房・長く垂れる房・短い先端房の透過画像を作る。
4. Blenderで幹と枝の芯、中央を折って垂らした曲面カードを組む。
5. ループ1で輪郭と重なり、2で枝葉と板っぽさ、3で光とワールドへのなじみを確認する。撮影画像を実際に開く。
6. 見本・現在・試作を大きく比較するページ、GLB・blend・画像・生成元・状態の台帳を残す。

## 参照

- RO: `art/ref/trees/T01.webp`、`T04.webp`、`art/ref/R03.webp`。実際に開き、円錐の外形、下へ重なる房、明るい上面と暗い段の隙間を確認した。
- 実写の補助: `art/ref/trees/real/P02.jpg`、`P04.jpg`。実際に開いたが樹種の出典は未記録。植物同定の根拠にはしない。
- もみ属と確認できる資料: Oregon State University, Abies nordmanniana: https://landscapeplants.oregonstate.edu/plants/abies-nordmanniana 。枝から短い針葉が密に生える構造を参照。
- NC Stateの同種資料: https://plants.ces.ncsu.edu/plants/abies-nordmanniana/ 。画像リンクは取得403だったため、その画像を見たとは扱わない。
- 既知の実装: NVIDIA GPU Gems 3, Next-Generation SpeedTree Rendering: https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering 。枝葉カードと房の明暗の考え方を参照。既存のBuilder・tube・Three.js材質を再利用し、新しい依存は足さない。

## 制約

変更はcodex内。画像生成は組み込みツール。APIキー、従量課金、追加インストールなし。まず静的な木を作る。砂浜のヤシ3本の配置を保持する。ROの画像は手元の参照として使い、生成ツールへ送らない。
