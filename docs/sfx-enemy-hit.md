# 効果音: 敵の攻撃が当たった音（被弾音）

ElevenLabs の Sound Effects で作り、ゲームに入れるための方針です。

## どこで鳴るか

- `public/js/game/hurt.js` の `takeDamage()` → `audio.sfx('hurt', { heavy, guarded })`
- 敵の攻撃は「予兆（テレグラフ）→ 判定」の順に来る。予兆音 `telegraph` は短い矩形波のピッ。被弾音はそのあとの答えになる
- 同じ瞬間に、ダメージの数字・画面の揺れ・のけぞり／ひるみ／ダウンも起きる。音はこの手応えを支える役

| 種類 | 条件 | 鳴らす音 |
|---|---|---|
| 軽 | ふつうの被弾（のけぞり・ひるみ） | `hurt_light` |
| 大 | 大技（kd）、または最大HPの25%以上の被弾。吹き飛んでダウンする | `hurt_heavy` |
| ガード越し | 盾で受けたけど削られた。先に `block` が鳴る | `hurt_light` を45%の音量で |
| 這いずり | HPが0になった瞬間 | `hurt_heavy` |

## 音の方向性

- **自分が殴られた音**にする。自分が敵を斬る `hit`（高めでカッと鳴る）と聞き分けられるよう、低めでこもった「ドスッ」にする。協力プレイ中、乱戦の中でも「今のは自分が食らった」と耳で分かることが一番大事
- **声は入れない**。キャラごとに声は違うので、悲鳴やうめき声は入れない
- **短く乾いた音**。立ち上がりは鋭く、余韻は軽で0.5秒・大で1秒以内。ゲーム側でリバーブをかけるので、素材には残響を入れない。連続で食らっても濁らないようにする
- **素材はファンタジーの革鎧・金属鎧**。爪・こん棒・牙のどれに当たっても違和感がない、中くらいの音にする（敵ごとの音はまだ作らない）
- **軽と大は音量差だけにしない**。大は低い「ドン」と鎧のガシャ、破片が散る音を加えて、ダウンしたことが音で分かるようにする
- 毎回同じに聞こえないよう、1種類につき3つ作る。再生時に、直前と違うものを選んで高さを±6%揺らす

## ElevenLabs への指示

プロンプトなどの設定は `tools/sfx/sounds.json` に書いています（英語の方がよく効く）。

- `hurt_light`（0.5秒・prompt_influence 0.6）
  > Close-up game sound effect: a monster's claw strikes an adventurer wearing leather armor. One tight punchy body thud with a dry leather and cloth slap and a faint rattle of metal buckles. Sharp attack, very short decay, dry, no reverb tail, no voice, no grunt, no music.
- `hurt_heavy`（0.9秒・prompt_influence 0.6）
  > Brutal heavy impact game sound effect: a giant ogre's club slams into an armored warrior and knocks him down. Deep low-end boom with a crunchy armor clank on the hit and a short scatter of metal and gravel afterwards. Hard punchy transient, tail under one second, dry, no voice, no scream, no music.

書き方のこつ: 「何が・何に・どう当たるか」と「音の要素（低音・鎧・破片）」、それから「入れないもの（no voice / no music / no reverb）」を書く。prompt_influence を上げると指示どおりになり、下げると毎回の違いが大きくなる。

## 作り方

```bash
ELEVENLABS_API_KEY=... node tools/sfx/generate.mjs            # まだ無いものを作る
node tools/sfx/generate.mjs hurt_heavy --force                # 気に入らないものを作り直す
```

`public/assets/sfx/<id>_<番号>.mp3` に書き出し、`manifest.json` に載せます。ゲームは起動時に manifest に載ったものを読み、無いもの・読めなかったものは今までどおり WebAudio の合成音で鳴らします。

## 聞いて確かめること

- 頭に無音が入っていないか（あれば音が遅れて聞こえる。ファイルの頭を削る）
- 声やBGMのような音が混ざっていないか
- 3つの音量がそろっているか、自分の攻撃音 `hit` より目立ちすぎていないか
