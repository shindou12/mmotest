# Godot への移行（ゲームの試作）

ゲーム「浮遊城エテルナ」を Godot 4 へ移す作業の記録と、確認のしかたです。地図の見た目（ワールドアート）の Godot 版は `godot/worldart/README.md`。

## 方針
- **サーバーは今のまま**（`server.js` と `public/shared/`）。Godot のクライアントは、ブラウザ版と同じ WebSocket の JSON でつなぐ。ブラウザの人と Godot の人が同じ世界で遊べる。
- ブラウザ側の JavaScript（自分の位置・ダメージの計算・被弾・UI など、約 1.6 万行）を、必要な所から GDScript に移す。式は元のまま移し、どの関数が元のどれかを各関数の説明に書く。
- 数値の表（武器・レベル・敵・エリアの形）は `public/shared/` から書き出して使う（`node tools/worldart/godot/export_gamedata.mjs` → `godot/worldart/data/game.json`）。表を手で写さない。

## チェックポイント
| CP | 中身 | 状態 |
|---|---|---|
| CP1 | Godot から今のサーバーにつなぎ、ひだまりの草原を同じ操作で歩ける。敵と他の人が見える | 済み（L27） |
| CP2 | 片手剣の通常攻撃（3 段）、回避、回復薬、敵の攻撃の予告と被弾、HP、倒れる・起こされる・力尽きる、経験値とレベル | 済み（L27） |
| CP3 | 出口からエリアを移る（屋外）、お金、HUD（HP・経験値・回復薬・お金・エリア名・通知） | 済み（L27）。落とし物を拾うのは未 |
| CP4 | 屋内のマス目のエリア（ダンジョン・迷宮区）: 壁と扉の当たり判定、扉の開閉、F でレバー・宝箱 | 済み（L27）。壁と床は仮の形 |

## 確かめ方（お手元）
1. ゲームのサーバーを立てる: リポジトリの一番上で `npm start`（8080 番）。今まで通り `start-game.cmd` でもよい。
2. Godot 4.3 以降で `godot/worldart/project.godot` を開き、F5。
3. 名前とサーバー（`ws://127.0.0.1:8080/ws`）を入れて「はじめる」。ひだまりの草原から始まる。
   - 友達の PC から、cloudflared の URL を使う場合は `wss://<cloudflared の名前>.trycloudflare.com/ws`（未確認）。
4. 操作: WASD / 矢印 移動、マウスで狙い、左クリック 攻撃（押しっぱなしで連続）、Space 回避、R 回復薬、F 調べる（レバー・宝箱）、ホイール カメラの距離。
5. 同じサーバーにブラウザ（`http://localhost:8080`）で入ると、Godot の人がブラウザ側にも見える（ブラウザ版の人物の形で）。

地図の見た目だけを見るときは、`scenes/main.tscn` を開いて F6（今いるシーンを実行）。

## 確かめ方（この環境・自動）
`sh tools/worldart/godot/client_test.sh`: サーバーを別の番号で立て、画面なし（`--headless`）で自動操作（`--bot`）を動かし、草原へ移る・攻撃が当たる・経験値が入る・出口から街へ移る・出口から屋内（古井戸の洞窟）へ移るを確かめる。

## 移したもの・まだのもの
| 移した（元のファイル） | まだ |
|---|---|
| 歩く・当たり判定（loop.js、areas.js collide。屋外と屋内のマス目） | 屋内の本当の見た目（今は仮の壁と床）、感圧板と罠の表示 |
| 通常攻撃 3 段・当たりの扇形・ダメージ（actions.js doSwing、strikes.arc、combat.js dealDamage） | 強攻撃・武器スキル・ツリー・ガード・弓など武器ごとの技 |
| 回避と無敵・回復薬（tryDodge・usePotion） | 装備・防具・装飾・称号・バフ |
| 予告の形と被弾・正面と背後の倍率・防御（hurt.js onTele・resolveTele・takeDamage、data.js inShape） | のけぞり・ダウン・吹き飛び、ガードブレイク |
| 這いずり・起こされる・力尽きてキャラが消える（fall・revived・bleed） | 仲間を起こす攻撃（reviveHit） |
| 経験値とレベル、お金、F でレバー・宝箱（main.js interact） | 落とし物を拾う・持ち物・共有ボックス・クエスト・NPC |
| 敵と他の人の表示（snapshot.js onSnap。仮の形） | 人物・敵の本当のモデルと動き、ボスの弾と演出、音 |
| 手前の木を点描で抜く（world.js の occChunk） | 町・野営地などの第 3 世代の地図（今は仮の地面） |

キャラクターのセーブは Godot の `user://eterna_godot_char.json`（ブラウザ版のセーブとは別）。協力ハードと同じく、力尽きると消える。
