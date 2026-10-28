# Sitesの白いモデル欄の修正

2026-10-26。ユーザーの「見えない」を受け、公開先を直接確認した。

## 原因

見本画像とHTMLは200で表示され、GLBも200だったが、Three.js本体とGLTFLoaderが `/node_modules/` 下では404になっていた。ローカルのPythonサーバーでは同じパスが200だったため、前回の配布物確認では見つけられなかった。アーカイブにはファイルが入っていた。

## 修正

`package_site.mjs` で、ブラウザに必要なThree.jsだけ `vendor/three/` へ配布し、単体・砂浜のimportmapをそのパスに合わせる。元のライブラリ、モデル、見た目、公開範囲は変更しない。Three.jsのライセンスも同じvendor内に保存する。

## 再現と確認

- 修正前: `check_host.mjs` はThree.jsとGLTFLoaderの404を記録し、モデルの起動待ちで失敗。ログ: `shots/site-bug/before/browser-log.json`。
- 修正後: 同じ公開先で起動、標準から真上へのカメラ変更、砂浜の起動を確認。`errors=[]; failure=null`。画像: `shots/site-bug/after/unit.png`、`top.png`、`coast.png` を実際に開いた。
- ユーザーのIABタブでも再読み込みし、試作v5の木が表示された実画面を確認した。
- 配置: `succeeded`。ソースコミット: `5a07263d69742f3c0b5fd0d3f3136d4764f3ee51`。
- URL: https://fir-forest-study-20261026.shindou-kazuma12.chatgpt.site

公開先の認証値はSitesから得た既存値をメモリと非表示のstdinでだけ使用し、ファイル・引数・ログには保存していない。
