# UI / 音 / 効果 / セーブ / デバッグ 棚卸し（Godot 移植用）

凡例: 済み = Godot にある / 仮 = 最小版がある / 未 = ない。
Godot 側は `godot/worldart/scripts/game/` の `game.gd`(702行)・`items.gd`(149行)・`visuals.gd`(144行) だけ。音は 0 件、エフェクトは `_slash_fx` と予告の形だけ。
ブラウザ側の UI は `public/js/ui/` 約 1700 行 + `index.html` 227 行 + CSS。

## 1. UI 画面・HUD・キー操作

### 1-1 ブラウザ版の構造
- `ui/app.js`(576行): Mediator 状態機械。状態は login / play / inv / tree / map / settings / chat / smith / box / dialog / gate など。キー判定は `app.js` L286-300。
- `ui/core.js`: View 部品の基盤。`ui/helpers.js`: 共通関数。
- 各パネルは `ui/panels/*.js` の `installXxx(ui)` が `P.xxx` を足す方式。画面側の入り口は `game/ui-bridge.js`(10行)。
- game → ui の依存は `ui-bridge.js` 経由のみ。Godot は `game.gd` が直接 Label を触っていて、この分離はない。

### 1-2 キー・マウス
| 入力 | ブラウザ版 | Godot |
|---|---|---|
| WASD/矢印 移動 | `game/input.js` | 済み（`move_*` アクション） |
| 左クリック 3段コンボ | `actions.js` | 済み |
| 左長押し 溜め斬り | 同上 | 済み（HUD に溜め% 文字） |
| 盾槍: 長押し中ガード / 離してカウンター | `input.js` armCounter・endGuard | 未 |
| 右クリック 武器スキル | 同上 | 済み（片手剣 5 種） |
| Q / E ツリースキル（スロット 2 つ） | `tryTreeSkill` | 未 |
| Space 回避 | `tryDodge` | 済み |
| R 回復薬 | `usePotion` | 済み |
| F 調べる（転移門・NPC・レバー・宝箱・共有ボックス） | `app.js handleInteract`、`progress.js nearestInteract` | 仮（レバー・宝箱のみ。NPC・転移門・ボックスは未） |
| I 持ち物 | `panels/inventory.js`, `items.js` | 仮（`items.gd`） |
| K スキルツリー | `panels/tree.js`(137行) | 未 |
| M エリアマップ | `panels/map.js`(99行) | 未 |
| Esc 設定 | `panels/settings.js` | 未 |
| Enter チャット | `#chat` | 未 |
| H ヘルプ | `#help` | 仮（右下に固定ラベル） |
| ホイール ズーム | render.js | 済み（距離 8-60） |
| F2 デバッグパネル | `game/debug.js` | 未 |
| タッチ操作 | `panels/touch.js`(47行)、`#touch`、`#rotate` | 未（Godot はデスクトップ前提なら不要。要方針） |

### 1-3 HUD 要素（`index.html` の `#hud`、`panels/hud.js` 142行）
| 要素 | 中身 | Godot |
|---|---|---|
| `#vitals` HP バー・Lv・名前・XP バー | `hud.js` | 仮（ProgressBar + Label。見た目は素のまま） |
| `#hotbar` 回復薬・回避・Q/E・武器スキルのスロット + クールタイム | 同上 | 仮（文字 1 行。アイコン・CD 円なし） |
| `#gold` | 所持金 | 仮（文字） |
| `#topbar` 装備/ツリー/マップ/設定ボタン | | 未 |
| `#minimap` 180px canvas + `#me-floor` | `panels/minimap.js`(128行) | 未 |
| `#quests` 受注中クエスト欄 | `screen.renderQuests` | 未 |
| `#boss` ボス HP・段階線・詠唱バー・カット・スタンバー・ターゲット | `hud.js` | 未（ボス自体が未） |
| `#party` 仲間の HP | | 未 |
| `#stamina` 回避の円 | | 未 |
| `#charge` 溜めバー + 攻撃名 | | 仮（文字 %） |
| `#buffs` | バフ表示 | 未（バフ自体が未） |
| `#prompt` 「F 調べる」案内 | | 未 |
| `#toasts` / `#banner` | `panels/messages.js`(38行) | 仮（banner 1 つ + 下のログ） |
| `#death` 死亡画面（復活カウント） | | 未（`_fall`/`_die` はログのみ？ 要確認） |
| `#mode-tag`・`#vignette` | | 未 |
| 浮かぶ数字 `#float` | `panels/floats.js`(91行)。クラス: crit / poison / just / 通常。設定 `dmgnum` で非表示 | 仮（`_float` Label3D） |
| 名札・敵 HP プレート | `game/labels.js`(48行)、floats.js の `.plate` | 仮（`visuals.gd label`） |
| 予告（赤い床）| `fx.js makeTelegraph` | 済み（`visuals.gd shape_mesh`、`teles`） |
| ログイン画面（名前・色・初期武器 6 種・既存キャラ・「最初からはじめる」） | `index.html` L19-37、`main.js startGame` | 仮（名前 + サーバー URL のみ。色・武器選択なし） |

### 1-4 パネル（`index.html` L127-222）
| パネル | 内容 | Godot |
|---|---|---|
| `#inv` 装備/インベントリ | 装備 3 枠・能力値・グリッド・クリックで装備・右クリックで分解・自動分解スライダ・一括分解・ツールチップ・`#inv-actions` | 仮（`items.gd`: 一覧 + 装備ボタン + 説明文。分解・自動分解・ツールチップなし）。ロジックは `game/items.js` 226行 / `loot.js` 242行 |
| `#tree` スキルツリー | 武器ごとのツリー、習得/戻す/振り直し、Q/E スロット、SP バッジ。`weapon-tree.js`、`game/tree-effects.js` | 未（大きい。武器ツリーは `docs/godot/migration.md` で「未」） |
| `#map` エリアマップ | タブ 2 つ: エリア(canvas 736x420 + ピン) / 階層(SVG)。踏破表示 | 未 |
| `#settings` | 音量 4 本・画質 3 段・エフェクト 5 種・画面の揺れ・ダメージ数字・透かし | 未 |
| `#dialog` NPC 会話 | クエスト受注/報告。`panels/npc.js`(52行)、`quests.js`(112行)、`progress.js` | 未 |
| `#gate-menu` 転移門 | 解放済み階層への移動 | 未 |
| `#smith` 鍛冶屋 | 強化 / 特性変更 / スキル変更 / 伝承化 / 特性リスト。`panels/smith.js`(128行) | 未 |
| `#box` 共有ボックス | 持ち物 ⇔ 共有。`panels/items.js`(89行) | 未 |
| `#chat` | ログ + 入力 | 未（サーバーの chat メッセージが要るか確認） |
| `#help` | 操作一覧 | 仮 |

## 2. 音（`public/js/audio.js` 616行、`sample-sfx.js` 170行）

### 2-1 作り方
- ほぼ全部が **WebAudio の手続き合成**（オシレーター + ノイズ + フィルタ + リバーブ/ディレイ送り）。ファイル音声は **ヒット音の候補だけ**。
- 音声ファイル: `public/assets/sfx/hit/{deeper,heavy-flesh-v2,retake2,tight}.mp3`。`SampleBank` が再生速度でピッチ ±揺らし、音量の揺らし、`trim`（頭出し）、`lowCut`・`drive`（tanh 歪み）、連打の間引き(`merge 0.03s / window 0.15s / repeatGain 0.6 / max 3`)を行う。
- `hitSound` の既定は合成（`pick:'synth'`）。デバッグ部屋で選ぶとファイル音に切り替わり、選択は localStorage に保存する（`debug.js` L58-76）。通常ゲームは合成のまま。
- バス: master / music / sfx / amb の 4 系統（設定スライダと対応）、`setVolumes(settings)`。インパルス応答は `init()` で合成（3 秒ステレオ）。

### 2-2 音の種類
- **効果音 `audio.sfx(name, opt)`**（`audio.js` L412-613）。名前は次の通り。
  - 戦闘: swing(heavy) / hit(crit) / heavy / charge / charged / skill / dodge / perfect(JUST) / hurt / block / telegraph / impact / thunder / wave / flame / mobdie / death / enrage / roar / phase
  - ボスの印とスタン: stack / awayMark / stunBreak / stunTweet / stunHit / stunEnd
  - 取得と成長: levelup / drop / lootpop / pickup / coin / coins / bag / shard / potion / equip / buff / clear
  - UI と移動: ui / warp / step
- 呼び出し回数が多い順では、ui 14、impact 11、equip 9、block 9、hit 8、perfect 7、thunder/swing/levelup/clear 各 6。
- **BGM `setMusic(cfg, boss)`**: エリア定義 `shared/data.js` の `music:{root, mode, bpm, prog, feel}` から `makeSong` が曲を生成し、`schedule()` が先読みで音符を並べる。パート: pad / bass / pluck / bell / kick / tom / noise。ボス戦用に別編成。
- **環境音 `setAmbient(kind)`**: meadow forest desert cave lava snow underwater storm void heaven。ノイズの帯域ベッド + 鳥・フクロウ・水滴・鐘・雷・泡などの散発音（`ambientEvents`）。
- **天候音 `setWeather`**: rain fog sandstorm。

### 2-3 Godot の状況: 未（音は 0 件。`godot/worldart/scripts` に AudioStream の使用なし）
再現の選択肢（推奨順）:
1. **事前レンダリングした WAV/OGG を使う（推奨）**。ブラウザ側に OfflineAudioContext で `sfx(name)` を書き出す Node/ブラウザスクリプト（`tools/` に追加）を用意し、約 40 音を `godot/worldart/assets/sfx/*.ogg` にする。Godot では `AudioStreamPlayer` のプール + `pitch_scale` と音量の揺らしで、`jitter`・`voice` 規則（merge/window/max）を GDScript に移す。ヒット 4 本の mp3 はそのまま使える。
2. **AudioStreamGenerator で GDScript 合成**。`tone()`/`noiseHit()` 相当をサンプル単位で書く。フィルタ（bandpass/lowpass）、リバーブ、ディレイを自前実装する必要があり、重い。効果音の数が多い割に得るものが少ない。
3. **BGM**: `makeSong` は決定的なので、エリアごとの曲（約 6〜10 曲 + ボス版）を OfflineAudioContext で数十秒〜1 分のループとして書き出すのが現実的。乱数を使う箇所があるかは未確認。環境音もループ書き出し。散発音（鳥など）は個別 WAV を GDScript のタイマーで鳴らす。
4. Godot 側の部品: `AudioBus`（Master/Music/Sfx/Amb）、`AudioEffectReverb`/`AudioEffectDelay` をバスに載せる。設定スライダ → `AudioServer.set_bus_volume_db`。

## 3. エフェクト（`public/js/fx.js` 414行、`fx-styles.js` 241行、`game/weapon-fx.js`）

### 3-1 部品（`fx.js` の `FX` クラス + `Particles`）
- `parts.burst` / `parts.emit` / `parts.ground`: 粒子（最大 6000 のシェーダ点群）。呼び出し 150 箇所前後。
- `fx.slash(x,z,a,range,arcDeg,color)`: 扇形の斬撃（約 42 箇所）。`fx.ringWave`: 地面の衝撃波リング（約 99 箇所）。`fx.flash`: 点光源の閃光（30）。`fx.beam`: 光柱（19。称号獲得・ボス演出）。`fx.lightning`(8)、`fx.waveMesh`、`fx.ground`(13)、`fx.add`/`fx.dispose`/`fx.has`。
- `swordTrail` / `makeTrail`: 剣の軌跡リボン（`TRAIL n:24 life:0.16 sub:3`）。`ghost`: 残像（モデルのコピーを薄くフェード）。
- `makeTelegraph(s, color, heightAt)`: 予告の塗り（`TELE_VS/FS`、`uProg` で進行、`uPulse` で脈動、地形の高さに沿う）。
- 付随: 画面の揺れ（設定 `shake`）、ダメージ数字（`floats.js`）、スタンのピヨ音 `stunTweet`（音は 2-2 に記載。頭上のヒヨコ表示があるか未確認）、ガード表示、`shieldBack`（竜騎士の背負い盾）。
- 武器ごとの見た目の差し込み: `weapon-fx.js` の `fxCall/fxSome/fxReduce`。武器ファイル `game/weapons/*.js`（片手剣など）が登録する。

### 3-2 エフェクト様式（設定「エフェクト」、`fx-styles.js`、最近マージした A+B）
`FX_STYLES` は 5 種類（設定の選択肢は blend / anime / flashy / subtle / classic）。
| id | 名前 | 要点 |
|---|---|---|
| anime | A アニメ調 | bloom 0.55、星形の粒、三日月の斬撃（白い芯・縁ぼかし）、二重の輪、線の火花 |
| flashy | B 派手 | bloom 0.85、光る粒 ×1.5、太い斬撃、塗りの衝撃波、火花多め |
| **blend** | **A+B（既定）** | bloom 0.72、flash 1.15、星形 ×1.35、斬撃 width 0.42/gain 1.7（くっきり）、二重の輪 |
| subtle | 控えめ | 細く小さく少ない |
| classic | 以前の見た目 | `FX` そのまま |
- `StyledFX extends FX` が `slash / ringWave / waveMesh / lightning / makeTrail / parts.burst` を差し替える（`BAND_FS` 斬撃帯、`RING_FS` 輪、`SPARK_*` 火花、`PART_FS` 星/光の粒）。
- 呼び出し側は様式を意識しない。`setStyle(style)` で実行中に切り替えられる。Bloom の強さも様式が決める（Godot なら `WorldEnvironment` の glow 強度）。

### 3-3 Godot の状況
- 済み: 予告形状（`visuals.gd shape_mesh`: circle/ring/cone/rect）、ダメージ数字（Label3D）、名札。
- 仮: 斬撃は `_slash_fx` のみ（半透明の扇メッシュを 0.12 秒表示）。ヒット火花・軌跡・残像・リング・光柱・閃光・雷・揺れは未。
- 移植案: `fx.gd` を新設し、`slash / ring_wave / flash / beam / lightning / burst(GPUParticles3D or CPUParticles3D) / trail / ghost / shake` を同名で用意。様式は Dictionary 定数（`FX_STYLES` を `tools/worldart/godot/export_gamedata.mjs` で JSON 化すれば手写し不要）。斬撃・輪は `ShaderMaterial`（`BAND_FS`/`RING_FS` を gdshader に移植）。post 側に `post.gdshader` が既にあり、Bloom は WorldEnvironment glow か post に追加。
- 規模: `fx.js` 414 + `fx-styles.js` 241 ≒ 650 行 → GDScript + gdshader で 600〜800 行。

## 4. セーブ・設定

### 4-1 ブラウザ版
- キャラクター: `localStorage['eterna_coop_hard_char_v1']`（デバッグ部屋は `..._debug_char_v1`）。`character-store.js`(30行) の `CharacterStore`（load/save/discard。`discard` 後は書き込み不可＝力尽きで消滅）。`game/save.js` が `loadChar/saveChar` を提供。
- ソロの世界: `eterna_coop_hard_solo_world_v1`（`net.js startSolo`: 階層解放 `unlocked` と共有ボックス `box`。デバッグは `..._debug_world_v1`）。
- 設定: `localStorage['eterna_settings_v1']` = `{master, music, sfx, amb: 0-1, quality: high|mid|low, fx: blend|…, shake, dmgnum, occlusion}`。`?low` で quality=low。
- キャラのフィールド（`main.js startGame`、各 `game/*.js` から集計）: name, color, lv, xp, gold, inv[], eq{weapon,armor,acc}, tree{}, slots[2], quests{}, mats{shard,gems{}}, codex{}, titles{}, areas{}（踏破）, waypoints{}, explored{}, chests{}, pin, potBonus, autoSalvage, prof/profBest（熟練度）, 武器ごとのツリー(`wtOf`)。

### 4-2 Godot 版（`game.gd` L12, L66-88）
- `user://eterna_godot_char.json`。フィールド: name, color, lv, xp, gold, eq, inv（`wk`/`watk` は能力値から再計算）。`_recalc` と `_save_char` で装備変更・経験値などのたびに保存する。ブラウザ版とは別セーブ。
- `ch["eq"]` は初心者の片手剣を自動付与。力尽きると消える仕様（`migration.md` に記載）。
- 不足: tree/slots/quests/mats/codex/titles/areas/waypoints/chests/explored/pin/potBonus/autoSalvage/prof、設定ファイル、`discard` 後の書き込み禁止ロック（ブラウザ版の `lost` フラグ。遅れて保存されると復活するバグ防止）、共有ボックスとソロ世界の保存。
- 方針案: キャラ JSON は **ブラウザ版のキー名と構造をそのまま**使うと、将来の読み込み互換や設定の共有に有利。設定は `user://eterna_godot_settings.json`。

## 5. デバッグ部屋（`public/js/game/debug.js` 216行、URL `?debug`）
- 本番と別キャラ・別ソロ世界で動く。サーバー非接続。倒れてもセーブは消えず全回復（`hurt.js fall`）。
- 初期状態: レベル最大、全武器熟練度最大、全ワープ解放、ゴールド 999999、素材たっぷり。
- 操作パネル（F2 または右上「DEBUG」ボタン）:
  - 部屋への移動: 各層の敵の部屋、第 1/2/3 層ボス（ボスのレベル 0/25/50）、はじまりの街。部屋の敵レベル 1/10/25/50 の切替。
  - 無敵トグル、全回復、クールタイムを戻す、持ち物を空にする。
  - 装備の生成: 種類・等級を選んで 武器/防具/装飾品、ユニーク装備ボタン（`UNIQUES`）、称号の付与。
  - ヒット音の比較: 合成 vs ファイル 4 種、音量・頭出し・ランダム幅・lowCut・drive・合成アタックの重ね、連打/同時ヒットの調整、試し鳴らし（単発・8 連打・3 体同時・クリティカル）。
- Godot の状況: 未。ただしボットとテストフック（`--bot`、`--inv`、`client_test.sh`）が既にある。
- 移植案: サーバー接続前提のため「部屋」は不要。Godot では `F2` の簡易パネルに 全回復 / 無敵 / レベル設定 / 装備生成（`GameRules` 側に `make_item`）/ ゴールド付与があれば十分。ヒット音比較は音をファイル化した後に作り直す。

## 6. 規模の見積もりと移植順

| # | 作業 | 規模（GDScript） | 備考 |
|---|---|---|---|
| 1 | HUD 整備（HP/XP バー、ホットバー、CD 円、トースト/バナー、死亡画面、F の案内、ダメージ数字のクラス別色） | 約 400 行 | 現在 `_setup_hud` が約 40 行の仮。まず Theme を決める |
| 2 | 音: 書き出しスクリプト + `audio.gd`（プール・揺らし・バス）+ 設定連動 | ツール 100 行 + 150 行 | 効果音が先、BGM/環境音は後 |
| 3 | 設定パネルと設定保存（音量・エフェクト様式・揺れ・数字・透かし） | 約 150 行 | 2 と 5 の前提 |
| 4 | エフェクト `fx.gd` + 様式（slash/ring/flash/burst/trail/ghost/shake） | 600〜800 行 + gdshader | 見た目の判断は Opus。比較シートで確認 |
| 5 | セーブ拡張（ブラウザ版キー構造に合わせる、lost ロック） | 約 100 行 | ツリー・クエスト移植の前提 |
| 6 | ミニマップ + エリアマップ（M） | 約 300 行 | エリア定義は `game.json` にある |
| 7 | 持ち物の完成（ツールチップ、分解、自動分解、能力値表） | 約 250 行 | |
| 8 | NPC 会話・クエスト・転移門・クエスト欄（`quests.js`, `progress.js`） | 約 400 行 | データは `export_gamedata` に QUESTS を足す |
| 9 | ボス HUD（詠唱・カット・スタン・段階線）と演出 | 約 300 行 | ボス戦の移植と同時 |
| 10 | スキルツリー（K）+ Q/E + 武器ツリー | 約 700 行以上 | 武器ごとの効果 `weapons/*.js` の移植が本体。最大の山 |
| 11 | 鍛冶屋・共有ボックス・分解 | 約 400 行 | ソロ世界の保存は不要（サーバー側に任せる）かを `net.js`/サーバーで要確認 |
| 12 | チャット、パーティ欄、バフ欄、デバッグパネル、タッチ操作（要否判断） | 約 300 行 | |

合計の目安は 3500〜4500 行（ブラウザ側 UI・音・fx・save・debug 約 5200 行からの置換）。
推奨順は 1 → 3 → 5 → 2 → 4 → 7 → 6 → 8 → 9 → 10 → 11 → 12。理由: 戦闘の手応え（HUD・音・エフェクト）を先に整えると、以降の武器・ボス移植を確認しやすい。ツリーは依存が最も深いので後ろ。

### 要確認事項
- 死亡/ダウンの画面表示が Godot にあるか（`_fall` `_die` はログ中心に見える）。
- BGM 生成の乱数使用（書き出しの再現性）。
- 共有ボックスとソロ世界の保存がサーバー側かクライアント側か（ブラウザの協力モードはサーバー側と思われる）。
- タッチ・スマホ対応を Godot でやるか。
