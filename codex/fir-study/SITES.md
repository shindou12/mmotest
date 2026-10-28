# Sites版

本人のみ閲覧できる設定でv5を配置済み。中央は前回v4、右は枝の構造から作り直したv5。

- URL: https://fir-forest-study-20261026.shindou-kazuma12.chatgpt.site
- 砂浜: https://fir-forest-study-20261026.shindou-kazuma12.chatgpt.site/codex/fir-study/coast.html
- ソース: `codex/sites/fir-forest-study/`
- project_id: `appgprj_6adf15d58614819186bafff1c63c35d6`
- ソースコミット: `5a07263d69742f3c0b5fd0d3f3136d4764f3ee51`
- 配置結果: `succeeded`（2026-10-26）
- 配布: 64ファイル、45,210,774 bytes。必要なモデル・画像・Three.jsのみ。外部CDNなし。

## 確認

`node codex/fir-study/check_site.mjs` を配布物を配信する8184番に対して実行。

`SITE_CHECK versions=5; REPLACED=1; PALMS=3,3; EXTERNAL_DEPENDENCIES=0; PAGE_ERRORS=[]`

画像: `shots/site-v5/unit.png`、`top.png`、`coast.png` を実際に開いて確認。ログ: `shots/site-v5/browser-log.json`。砂浜の自動確認は連続描画中に操作待ちがタイムアウトしたため、従来の撮影と同じ一時停止・単発描画で再確認した。この時点では公開先の表示を未確認だったが、その後Three.jsの配布パスに原因がある白画面を修正した。SITES-FIX.md参照。公開先の実画面と起動・視点変更・砂浜の確認が完了し、エラーなし。

配布物の再収集: `node codex/fir-study/package_site.mjs`。Sitesのソース・配置操作はSitesスキルの手順で行い、既存のproject_idを使う。
