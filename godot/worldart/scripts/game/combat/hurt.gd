extends RefCounted
## 被弾・ガード・のけぞり／ダウン／吹き飛び・ガードブレイク・回転なぎ払い・這いずり・起こされる・力尽きる（G4）。
## 元は public/js/game/hurt.js（resolveTele・REACT・kbScale・knockFrom・hitReaction・tryTech・getUp・takeDamage・onJustDodge・fall・revived・
## reviveHit・crawlTick・die・setHitStop）、game/input.js のガード（GUARD・GUARD_BY・startGuard・canGuard・guardUp・guardProfile・guardDamage・guardBreak・
## guardRegen・armCounter・endGuard・initGuard）、game/actions.js の sweepTick（ガードカウンターの回転なぎ払い）、game/loop.js の hazardAt と毒沼の毎フレーム。
## 関数は元の名前を snake_case にしたもの。式・順番・乱数を引く順・記録される操作（fx・sfx・floatText・net 送信）の引数の数は JavaScript と同じ。
## api は combat/api.gd の環境（state・stats・rules・view・screen・link の窓口を兼ねる）。me・st・mobs はその中の Dictionary。
## 表（REACT・GUARD・GUARD_BY・SWEEP・REVIVE）は data/game.json（export_gamedata.mjs が元の JS から書く）。手で写さない。
## 画面の描画（予告の板の生成・進み具合）は game.gd。ここは判定と状態の変化だけ。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const R = preload("res://scripts/game/rules.gd")


# ---------------------------------------------------------------------------
# 表
# ---------------------------------------------------------------------------
static func REACT() -> Dictionary: return Common.game()["hurt"]["REACT"]
static func GUARD() -> Dictionary: return Common.game()["hurt"]["GUARD"]
static func GUARD_BY() -> Dictionary: return Common.game()["hurt"]["GUARD_BY"]
static func SWEEP() -> Dictionary: return Common.game()["hurt"]["SWEEP"]
static func REVIVE() -> Dictionary: return Common.game()["revive"]


## JavaScript の x || 0（undefined・null・false・0 は 0）
static func _n(d: Dictionary, k: String) -> float:
	var v = d.get(k)
	return float(v) if WFX.truthy(v) else 0.0


## JavaScript の Math.round（.5 は大きい方へ）
static func _round(x: float) -> float:
	return floorf(x + 0.5)


## JavaScript の数の文字列（整数は小数点なし）
static func _js_num(v: float) -> String:
	return str(int(v)) if v == floorf(v) else str(v)


static func _tf(api, id: String) -> bool:
	return Dmg.tf(api, id)


static func set_hit_stop(api, v: float) -> void:
	api.hit_stop = v


# ---------------------------------------------------------------------------
# 予告の着弾（hurt.js resolveTele）
# ---------------------------------------------------------------------------
## 予告の終わり。着弾の演出、当たっていればガード・被ダメージ。te: {sh（形の配列）, dmg, src（敵の番号。なければ 0）, kd, color}
static func resolve_tele(api, te: Dictionary) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	var sh: Array = te["sh"]
	var dmg: float = te["dmg"]
	var big: bool = dmg > (float(S["mhp"]) * 0.12 if not S.is_empty() else 20.0)
	var c = te.get("color")   # view.toColor(te.color)
	for s in sh:
		# 着弾演出
		if s["k"] == "circle":
			api.fx.ringWave(s["x"], s["z"], c, s["r"], 0.35)
			api.fx.parts.burst(s["x"], 0.3, s["z"], minf(40.0, 6.0 + float(s["r"]) * 4.0), {"color": c, "speed": 6, "size": 0.5, "life": 0.5, "up": 2})
		elif s["k"] == "ring":
			api.fx.ringWave(s["x"], s["z"], c, s["r1"], 0.5)
		else:
			var length: float = s["len"]
			var n := int(ceil(length / 2.0))
			for j in n:
				var d: float = (float(j) / n) * length
				api.fx.parts.burst(float(s["x"]) + sin(float(s["a"])) * d, 0.3, float(s["z"]) + cos(float(s["a"])) * d, 4, {"color": c, "speed": 5, "size": 0.5, "life": 0.4})
	var near_src := false
	for s in sh:
		if sqrt(pow(float(s["x"]) - float(me["x"]), 2) + pow(float(s["z"]) - float(me["z"]), 2)) < 22.0: near_src = true
	if big and near_src:
		api.sfx("impact")
		api.add_shake(0.35)
	if WFX.truthy(me.get("dead")) or WFX.truthy(me.get("crawl")): return
	var hit := false
	for s in sh:
		if R.in_shape(s, float(me["x"]), float(me["z"])): hit = true
	if not hit: return
	if float(me["iframe"]) > 0.0:
		on_just_dodge(api)
		return
	var src_id := int(te["src"]) if WFX.truthy(te.get("src")) else 0
	var src_mob = api.mobs.get(src_id) if src_id != 0 else null
	if WFX.fx_some("counter", [src_mob if src_mob != null else sh[0]]): return   # 大剣カウンター: 強攻撃を押した直後に受けると受け流す
	if src_id != 0: api.net_send({"t": "absorb", "id": src_id})   # 狙われ役が攻撃を受けるとヘイトのリセットが少し延びる
	if S["fx"].has("aegis") and api.random() < 0.25:
		api.float_text(me["x"], 2.4, me["z"], "無効化!", "info")
		api.sfx("block")
		api.fx.ringWave(me["x"], me["z"], 0xffd84a, 2, 0.3, 1)
		return
	var raw: float = dmg
	# 敵の正面で受けると苛烈、背後なら軽い
	if src_mob != null:
		var off := absf(R.ang_diff(atan2(float(me["x"]) - float(src_mob["x"]), float(me["z"]) - float(src_mob["z"])), float(src_mob["a"])))
		if off < deg_to_rad(60.0): raw *= 1.0 if _tf(api, "t_shell") else 1.3   # 称号「甲殻の守り」は正面の割り増しなし
		elif off > deg_to_rad(120.0): raw *= 0.7
	# 盾槍のガード（攻撃してきた方向が正面なら軽減）
	if guard_up(api) and WFX.truthy(S.get("guard")):
		var src = src_mob if src_mob != null else {"x": sh[0]["x"], "z": sh[0]["z"]}
		var dir_to := atan2(float(src["x"]) - float(me["x"]), float(src["z"]) - float(me["z"]))
		var centered: bool = sqrt(pow(float(src["x"]) - float(me["x"]), 2) + pow(float(src["z"]) - float(me["z"]), 2)) < 0.5
		if centered or absf(R.ang_diff(dir_to, float(me["a"]))) < deg_to_rad(80.0):
			if src_id != 0: api.net_send({"t": "threat", "id": src_id, "n": _round(dmg * 3.0)})
			# ガードゲージが尽きたらガードブレイク（そのまま全部のダメージを受ける）
			if guard_damage(api, raw, WFX.truthy(te.get("kd"))):
				take_damage(api, raw, src, false, true)
				return
			raw *= 0.0 if S["flags"].has("bulwark") else float(guard_profile(api)["cut"])
			api.sfx("block")
			api.fx.parts.burst(float(me["x"]) + sin(float(me["a"])) * 0.8, 1.2, float(me["z"]) + cos(float(me["a"])) * 0.8, 14, {"color": 0xbfe0ff, "speed": 5, "size": 0.4, "life": 0.35})
			arm_counter(api)
			Dmg.wt_on_guard(api, dmg, src_mob)
			# ガードで受けた: ひるみ・ダウンはせず、少し押し戻されるだけ（ガードとカウンター準備は続く）。鉄壁A「不動」は押し戻されない
			if not WFX.fx_some("steadyGuard"): knock_from(api, src, 0.8, 0.12)
			api.hit_stop = 0.05
			if raw <= 0.0:
				api.float_text(me["x"], 2.4, me["z"], "防御", "info")
				return
			take_damage(api, raw, src, false, true)
			return
	var from = src_mob if src_mob != null else sh[0]
	take_damage(api, raw, {"x": from["x"], "z": from["z"]}, WFX.truthy(te.get("kd")))


# ---------------------------------------------------------------------------
# 被弾リアクション（hurt.js hitReaction・knockFrom・tryTech・getUp）
#   軽: のけぞるだけ（動ける）/ 中: 最大HPの10%以上 → 押し戻されてひるむ
#   大: 最大HPの25%以上、または大技（kd）→ 吹き飛んでダウン。倒れた直後に回避で「受け身」
# ---------------------------------------------------------------------------
## 防具の重さで飛ばされやすさが変わる（軽装は飛ぶ・重装は踏ん張る）
static func kb_scale(api) -> float:
	var armor = api.ch.get("eq", {}).get("armor")
	var cls = armor.get("armor") if armor is Dictionary else null
	var tbl := {"light": 1.3, "medium": 1.0, "heavy": 0.6}
	return float(tbl[cls]) if cls is String and tbl.has(cls) else 1.15


static func knock_from(api, src, dist: float, dur: float) -> void:
	var me: Dictionary = api.me
	var sx: float = float(src["x"]) if src != null and src.get("x") != null else float(me["x"])
	var sz: float = float(src["z"]) if src != null and src.get("z") != null else float(me["z"])
	var dx: float = float(me["x"]) - sx
	var dz: float = float(me["z"]) - sz
	var d := sqrt(dx * dx + dz * dz)
	if d < 0.3:   # 真上からなら後ろへ
		dx = -sin(float(me["a"]))
		dz = -cos(float(me["a"]))
		d = 1.0
	var v: float = dist * kb_scale(api) / dur
	me["kbX"] = dx / d * v
	me["kbZ"] = dz / d * v
	me["kbT"] = dur
	me["a"] = atan2(-dx, -dz)   # 攻撃してきた方を向いたまま飛ぶ


static func hit_reaction(api, dmg: float, src, kd) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	var RE := REACT()
	me["hurtT"] = 0.28
	# 大剣の「剛体」: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
	var armor: bool = WFX.fx_some("superArmor")
	var can_down: bool = api.now() >= _n(me, "noDownT") and not armor and not WFX.fx_some("noKnockdown")
	if (dmg >= float(S["mhp"]) * float(RE["down"]) or WFX.truthy(kd)) and can_down:
		# ダウン（吹き飛び）
		api.hit_stop = 0.09
		knock_from(api, src, 4.0, 0.32)
		me["downT"] = RE["downT"]
		me["downStart"] = api.now()
		me["staggerT"] = 0
		me["charging"] = false
		me["guarding"] = false
		me["queued"] = 0
		me["swingT"] = 9
		me["skillT"] = -1
		me["noDownT"] = api.now() + float(RE["downT"]) + float(RE["noDown"])
		api.float_text(me["x"], 2.8, me["z"], "ダウン!", "info")
		api.fx.parts.burst(me["x"], 0.4, me["z"], 24, {"color": 0xd8c8a8, "speed": 5, "size": 0.5, "life": 0.5, "gravity": 4})
		api.add_shake(0.5)
		return
	if dmg >= float(S["mhp"]) * (float(RE["stagger"]) * 2.0 if _tf(api, "t_relic") else float(RE["stagger"])) and float(me["hp"]) > 0.0:
		if armor:
			api.float_text(me["x"], 2.8, me["z"], "スーパーアーマー", "info")
			return
		api.hit_stop = 0.05
		knock_from(api, src, 1.4, 0.18)
		me["staggerT"] = 0.35
		me["charging"] = false
		me["guarding"] = false
		me["queued"] = 0
		return
	api.hit_stop = maxf(api.hit_stop, 0.03)


## ダウン中に回避を押すと受け身（すぐ起き上がって転がる・無敵）
static func try_tech(api) -> bool:
	var me: Dictionary = api.me
	var RE := REACT()
	var k: float = api.now() - float(me["downStart"])
	if k < float(RE["techFrom"]) or k > float(RE["techTo"]): return false
	me["downT"] = 0
	me["kbT"] = 0
	me["dodgeCd"] = 0
	api.float_text(me["x"], 2.8, me["z"], "受け身!", "just")
	api.sfx("perfect")
	api.fx.ringWave(me["x"], me["z"], 0x9affff, 2.5, 0.3)
	api.try_dodge()
	me["iframe"] = maxf(float(me["iframe"]), 0.5)
	return true


static func get_up(api) -> void:
	var me: Dictionary = api.me
	me["downT"] = 0
	me["iframe"] = maxf(float(me["iframe"]), float(REACT()["getupIframe"]))
	api.fx.parts.burst(me["x"], 0.3, me["z"], 10, {"color": 0xd8c8a8, "speed": 2, "size": 0.4, "life": 0.4, "gravity": 2})


# ---------------------------------------------------------------------------
# 被ダメージ（hurt.js takeDamage・onJustDodge）
# ---------------------------------------------------------------------------
## 被ダメージの共通処理（予兆・ボスの弾）。src: 攻撃してきた位置 / kd: 吹き飛ばす大技 / guarded: ガードで受けた
static func take_damage(api, raw0: float, src = null, kd = false, guarded = false) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	var raw := raw0
	if WFX.truthy(me.get("god")): return   # デバッグ部屋の無敵
	if api.now() < _n(me, "brokenT"): raw *= float(GUARD()["breakDmg"])   # ガードブレイク中は被ダメージ1.5倍
	raw = WFX.fx_reduce("incoming", raw)   # 狂剣士・捨て身 など
	var back_b = WFX.fx_reduce("drLowHp", 0)   # 不撓B「背水」
	# 一時的な被ダメージ軽減は重ねず、いちばん大きいものだけが効く（増える側＝マイナスはすべて足す）。防御（S.def）とは別の段
	var drs := []
	for b in me["buffs"]: drs.append(_n(b["mods"], "dr"))
	drs.append(float(back_b))
	drs.append(Dmg.wt_dr(api))
	drs.append(8.0 if _tf(api, "t_relic") else 0.0)
	drs.append(12.0 if _tf(api, "t_shell") else 0.0)
	drs.append(-15.0 if _tf(api, "t_berserk") else 0.0)
	var mx := 0.0
	var neg := 0.0
	for v in drs:
		mx = maxf(mx, float(v))
		neg += minf(0.0, float(v))
	var dr := clampf(mx + neg, -100.0, 90.0)
	var dmg := maxf(1.0, _round(raw * (1.0 - float(S["def"]) / 100.0) * (1.0 - dr / 100.0) * api.rnd(0.9, 1.1)))
	me["hp"] = float(me["hp"]) - dmg
	me["lastHurt"] = api.now()
	api.float_text(me["x"], 2.2, me["z"], dmg, "me")
	api.sfx("hurt")
	api.add_shake(0.3)
	api.ui_hurt()
	if S.get("wt") != null: Dmg.wt_on_hurt(api, guarded)
	# 被弾リアクション（のけぞり / ひるみ / ダウン）
	if float(me["hp"]) > 0.0 and not guarded: hit_reaction(api, dmg, src, kd)
	if float(me["hp"]) <= 0.0 and S["flags"].has("laststand") and api.now() - float(me["lastStandT"]) > 90.0:
		me["hp"] = 1
		me["lastStandT"] = api.now()
		me["iframe"] = 1.0
		api.float_text(me["x"], 2.8, me["z"], "不屈!", "just")
		api.sfx("perfect")
		api.fx.beam(me["x"], me["z"], 0xffd84a, 8, 0.8, 0.8)
		return
	if float(me["hp"]) <= 0.0 and WFX.fx_some("cheatDeath"): return   # 不死身 など
	if float(me["hp"]) <= 0.0:
		fall(api)


static func on_just_dodge(api) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	api.float_text(me["x"], 2.6, me["z"], "JUST回避!", "just")
	api.sfx("perfect")
	api.fx.ringWave(me["x"], me["z"], 0x9affff, 3, 0.3)
	if float(S["justbuff"]) > 0.0: api.add_buff("just", "見切り", 3.0, {"dmgp": S["justbuff"]}, 0x9affff)
	WFX.fx_call("justDodge")   # 後の先・残影・見切り眼 など
	if float(S["counter"]) > 0.0:
		api.circle(me["x"], me["z"], 5, float(S["counter"]) / 100.0, {"type": "proc", "noProc": true})
		api.fx.ringWave(me["x"], me["z"], 0xbff8ff, 5.5, 0.35)
	if S["fx"].has("mirror"):
		api.add_buff("mirror", "八咫の加護", 5.0, {"dmgp": 50}, 0xffffff)
		api.fx.ringWave(me["x"], me["z"], 0xffffff, 7, 0.5)
		api.fx.parts.burst(me["x"], 1, me["z"], 60, {"color": 0xbff8ff, "speed": 10, "size": 0.6})
		api.circle(me["x"], me["z"], 6, 3.0, {"type": "proc", "noProc": true})


# ---------------------------------------------------------------------------
# 這いずり・復活・力尽きる（hurt.js fall・revived・reviveHit・crawlTick・die）
# ---------------------------------------------------------------------------
## 倒れた回数（1〜）→ 段階の番号（balance.js reviveStep）
static func revive_step(n: int) -> int:
	return maxi(0, mini(REVIVE()["mult"].size() - 1, n - 1))


## HPが0 → 這いずり状態。仲間に攻撃（のスタン値）を当ててもらうと起き上がる。エリアの全員が倒れたら力尽きる（判定はサーバー）
static func fall(api) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	var RV := REVIVE()
	if WFX.truthy(me.get("crawl")) or WFX.truthy(me.get("dead")): return
	# デバッグ部屋: 倒れず、その場で全回復する（セーブは消えない）
	if api.debug:
		me["hp"] = S["mhp"]
		me["iframe"] = 1
		me["staggerT"] = 0
		api.banner("デバッグ部屋", "倒れたので全回復した", "#9affc8", 2)
		return
	# 称号「不死鳥」: その場で一度だけ復活
	if _tf(api, "t_phoenix") and api.now() - (float(me["phoenixT"]) if me.get("phoenixT") != null else -1e9) > 300.0:
		me["phoenixT"] = api.now()
		me["hp"] = _round(float(S["mhp"]) * 0.3)
		me["iframe"] = 1.5
		me["staggerT"] = 0
		api.banner("不死鳥", "炎の中からよみがえった", "#ff9a4a", 3)
		api.fx.beam(me["x"], me["z"], 0xff8a30, 14, 1.0, 1.2)
		api.fx.parts.burst(me["x"], 1, me["z"], 120, {"color": 0xff8a30, "speed": 9, "size": 0.6, "life": 1.1, "gravity": -3})
		api.sfx("phase")
		return
	# 最近倒れた回数ほど起こしにくい（ゲージ ×1 → ×2.5 → ×4。円は 1/3 → 2/3 → 1周に見せる）
	me["downs"] = mini(RV["mult"].size(), int(me["downs"]) + 1)
	me["downsAt"] = api.now()
	me["crawl"] = true
	me["rv"] = RV["disp"][revive_step(int(me["downs"]))]
	me["hp"] = 0
	me["charging"] = false
	me["guarding"] = false
	me["counter"] = false
	me["buffs"] = []
	me["queued"] = 0
	me["downT"] = 0
	me["kbT"] = 0
	me["staggerT"] = 0
	me["dodgeT"] = 0
	me["dashT"] = 0
	me["sweepT"] = 0
	me["skillT"] = -1
	me["swingT"] = 9
	api.net_send({"t": "down", "n": me["downs"]})
	api.banner("這いずり状態", "仲間に攻撃を当ててもらうと起き上がれる", "#ff9a8a", 4)
	api.sfx("hurt")
	api.fx.parts.burst(me["x"], 0.5, me["z"], 40, {"color": 0xff9a8a, "speed": 5, "size": 0.45, "life": 0.8})


static func revived(api, by: String) -> void:
	var me: Dictionary = api.me
	var RV := REVIVE()
	if not WFX.truthy(me.get("crawl")): return
	me["crawl"] = false
	me["rv"] = -1
	me["hp"] = _round(float(api.st["mhp"]) * float(RV["hp"]))
	me["iframe"] = RV["iframe"]
	me["noDownT"] = api.now() + float(RV["iframe"])
	api.banner("復活", "%s に起こしてもらった" % by, "#9affc8", 3)
	api.sfx("levelup")
	api.fx.beam(me["x"], me["z"], 0x9affc8, 10, 0.9, 1.0)
	api.fx.ringWave(me["x"], me["z"], 0x9affc8, 4, 0.5)


## 倒れている仲間に攻撃が当たった → 固定値 + スタン値ぶんゲージを減らす（ダメージは関係なし）。o: 倒れている仲間、opt: 攻撃のオプション
static func revive_hit(api, o: Dictionary, opt: Dictionary) -> void:
	var me: Dictionary = api.me
	var RV := REVIVE()
	if WFX.truthy(me.get("crawl")) or WFX.truthy(me.get("dead")) or not (o.get("rv") != null and float(o["rv"]) >= 0.0) or api.now() - _n(o, "revHitT") < 0.05: return
	o["revHitT"] = api.now()
	# 固定値 + スタン値（手数の多い武器でも起こせるように）
	var v: float = _round(minf(float(RV["perHit"]), float(RV["flat"]) + Dmg.stun_value(api, opt)) * 10.0) / 10.0
	if v <= 0.0: return
	api.net_send({"t": "rev", "id": o["id"], "v": v})
	api.float_text(o["x"], 2.2, o["z"], "起こす +%s" % _js_num(v), "info")
	api.fx.parts.burst(o["x"], 0.8, o["z"], 12, {"color": 0x9affc8, "speed": 4, "size": 0.4, "life": 0.4})


## 這いずり中: ゆっくり這って動けるだけ（攻撃・回避・ポーション・出口は使えない）。dx・dz は入力の向き（歩きと同じ。大きさは問わない）
static func crawl_tick(api, dt: float, dx: float, dz: float) -> void:
	var me: Dictionary = api.me
	var RV := REVIVE()
	var l := sqrt(dx * dx + dz * dz)
	me["moving"] = l > 0.0
	me["hp"] = 0
	if l == 0.0: return
	api.move_me(dx / l * float(RV["crawl"]) * dt, dz / l * float(RV["crawl"]) * dt)
	me["a"] = atan2(dx, dz)
	me["walkT"] = float(me["walkT"]) + dt * 0.5
	if api.random() < 0.15: api.fx.parts.emit(me["x"], 0.2, me["z"], {"color": 0xd8c8a8, "size": 0.35, "life": 0.4, "speed": 0.6, "gravity": 1})


static func die(api) -> void:
	var me: Dictionary = api.me
	if api.debug: return   # デバッグ部屋では力尽きない（fall で全回復する）
	me["crawl"] = false
	me["rv"] = -1
	var removed: bool = api.character_discard()
	api.toast("戦闘不能：このキャラクターのセーブデータを失いました" if removed else "キャラクターを失いました。ブラウザの保存データを削除できませんでした。", "#f99")
	var secs: float = float(Common.game()["balance"]["deathSeconds"])
	me["hp"] = 0
	me["dead"] = true
	me["deadT"] = secs
	me["deathAt"] = api.now() + secs
	me["charging"] = false
	me["guarding"] = false
	me["buffs"] = []
	me["downT"] = 0
	me["kbT"] = 0
	api.sfx("death")
	api.fx.parts.burst(me["x"], 1, me["z"], 80, {"color": 0x9ad8ff, "speed": 8, "size": 0.5, "life": 1.2})


# ---------------------------------------------------------------------------
# ガード（input.js）。盾槍が本職で、守護騎士（片手剣）はゲージが小さく、受けたときの軽減も浅い
# ---------------------------------------------------------------------------
static func guard_profile(api) -> Dictionary:
	var tbl := GUARD_BY()
	var wk = api.st.get("wk")
	return tbl[wk] if wk is String and tbl.has(wk) else tbl["sword"]


## 構えてから効き始めているか（構えた瞬間はまだ受けられない）
static func guard_up(api) -> bool:
	var me: Dictionary = api.me
	return WFX.truthy(me.get("guarding")) and api.now() - _n(me, "guardStart") >= float(guard_profile(api)["up"])


## 構えられるか（ガードを解いた直後・カウンターの直後は少しのあいだ構え直せない）
static func can_guard(api) -> bool:
	var me: Dictionary = api.me
	return WFX.truthy(api.st.get("guard")) and not WFX.truthy(me.get("dead")) and not WFX.truthy(me.get("crawl")) and not float(me["downT"]) > 0.0 \
		and not WFX.truthy(me.get("guarding")) and float(me["gg"]) > 0.0 and not float(me["staggerT"]) > 0.0 and api.now() >= _n(me, "guardLockT")


## 盾槍のガード（強攻撃の溜め中に自動で構える。スマホはガードボタンでも。ダウン中はできない）
static func start_guard(api) -> void:
	var me: Dictionary = api.me
	if not can_guard(api): return
	me["guarding"] = true
	me["guardStart"] = api.now()
	me["charging"] = false
	me["counter"] = false
	api.sfx("equip")


## ガードゲージを満タンにしておく（起動のとき）
static func init_guard(api) -> void:
	api.me["gg"] = GUARD()["max"]


## ガードゲージ: ガードで受けるたびに減り（受ける前のダメージに比例）、尽きるとガードブレイクで大きな隙。true = ガードブレイク
static func guard_damage(api, raw_before: float, kd) -> bool:
	var me: Dictionary = api.me
	var G := GUARD()
	# 盾の心得: 減りが少ない / 挑発A「威圧」: 効果中は減らない（盾槍のファイル）
	var keep: float = WFX.fx_reduce("guardKeep", 1)
	me["gg"] = float(me["gg"]) - (raw_before / float(api.st["mhp"]) * float(G["perHp"]) + (float(G["kdExtra"]) if WFX.truthy(kd) else 0.0)) * keep * float(G["max"]) / float(guard_profile(api)["max"])
	me["ggHitT"] = api.now()
	if float(me["gg"]) <= 0.0:
		guard_break(api)
		return true
	if float(me["gg"]) < float(G["max"]) * 0.3:
		api.sfx("impact")
		api.float_text(me["x"], 2.4, me["z"], "盾がきしむ…", "info")
	return false


static func guard_break(api) -> void:
	var me: Dictionary = api.me
	var G := GUARD()
	me["gg"] = 0
	me["guarding"] = false
	me["charging"] = false
	me["counter"] = false
	me["queued"] = 0
	me["staggerT"] = G["breakT"]
	me["brokenT"] = api.now() + float(G["breakT"])
	api.float_text(me["x"], 3, me["z"], "ガードブレイク!", "info")
	api.sfx("impact")
	api.sfx("block")
	api.fx.parts.burst(float(me["x"]) + sin(float(me["a"])) * 0.6, 1.2, float(me["z"]) + cos(float(me["a"])) * 0.6, 40, {"color": 0xbfe0ff, "speed": 7, "size": 0.5, "life": 0.6, "gravity": 8})
	api.fx.flash(me["x"], 1.5, me["z"], 0xff6a5a, 40, 0.3)
	api.add_shake(0.5)
	api.set_hit_stop(0.1)


static func guard_regen(api, dt: float) -> void:
	var me: Dictionary = api.me
	var G := GUARD()
	# 回復は「最後に受けた」か「ガードを解いた」ときから数える（細かく構え直しても回復は進まない）。盾の心得A は待ちを短く・回復を速く
	var P := guard_profile(api)
	var delay: float = float(P["regenDelay"]) * float(WFX.fx_reduce("guardRegenDelay", 1))
	if WFX.truthy(me.get("guarding")) or float(me["gg"]) >= float(G["max"]) or api.now() - maxf(_n(me, "ggHitT"), _n(me, "guardEndT")) < delay or float(me["staggerT"]) > 0.0: return
	me["gg"] = minf(float(G["max"]), float(me["gg"]) + float(P["regen"]) * float(G["max"]) / float(P["max"]) * dt * float(WFX.fx_reduce("guardRegen", 1)))


## ガードで攻撃を受けた → カウンター準備
static func arm_counter(api) -> void:
	var me: Dictionary = api.me
	if WFX.truthy(me.get("counter")): return
	me["counter"] = true
	api.float_text(me["x"], 2.8, me["z"], "カウンター準備!", "just")
	api.sfx("perfect")
	api.fx.ringWave(me["x"], me["z"], 0xbfe0ff, 2.2, 0.3)


## fire: スマホのガードボタンを離したとき（溜めていないので、ここでカウンターを出す）
static func end_guard(api, fire: bool = false) -> void:
	var me: Dictionary = api.me
	var counter: bool = WFX.truthy(me.get("guarding")) and WFX.truthy(me.get("counter"))
	if WFX.truthy(me.get("guarding")):
		# 構え直せるまでの隙（鉄壁A・反撃の心得A などで短くなる）
		var P := guard_profile(api)
		me["guardEndT"] = api.now()
		me["guardLockT"] = api.now() + (float(WFX.fx_reduce("guardCtrLock", P["ctrLock"], [P])) if counter else float(WFX.fx_reduce("guardLock", P["lock"])))
	me["guarding"] = false
	me["counter"] = false
	if not counter: return
	me["counterFire"] = true
	WFX.fx_call("counterGauge", [GUARD()["max"]])   # 騎士: カウンターでゲージが戻る
	if fire: api.do_heavy(2)


# ---------------------------------------------------------------------------
# ガードカウンターの回転なぎ払い（actions.js sweepTick・counterAngle）
# ---------------------------------------------------------------------------
static func _ease_c(x: float) -> float:
	var k := clampf(x, 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)


## spear-motion.js counterAngle: 経過時間 → 体の回転角（ラジアン。この量だけ回る）
static func sweep_angle(t: float) -> float:
	var T: Dictionary = Common.game()["skillTimings"]["counter"]
	if t < float(T["wind"]): return float(T["windAng"]) * _ease_c(t / float(T["wind"]))
	if t < float(T["slashEnd"]):
		var k: float = (t - float(T["wind"])) / float(T["slash"])
		return float(T["windAng"]) + (PI * 2.0 - float(T["windAng"])) * (1.0 - (1.0 - k) * (1.0 - k))
	return PI * 2.0


static func sweep_tick(api, dt: float) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	if not _n(me, "sweepT") > 0.0: return
	var SW := SWEEP()
	var prev: float = me["sweepT"]
	me["sweepT"] = prev + dt
	var t: float = me["sweepT"]
	var a: float = float(me["a"]) + sweep_angle(t)   # 上から見て反時計回り（体の回転と同じ向き）
	# 振りかぶり中は穂先に光が集まり、なぎ払い中は弧の軌跡を残す
	if t < float(SW["wind"]):
		if api.random() < 0.6: api.fx.parts.emit(float(me["x"]) + sin(a) * 3.2, 1.15, float(me["z"]) + cos(a) * 3.2, {"color": 0xbfe0ff, "size": 0.4, "life": 0.25, "speed": 0.6, "gravity": 0})
	elif t < float(SW["wind"]) + float(SW["slash"]) + 0.05:
		var a0: float = float(me["a"]) + sweep_angle(prev)
		# このフレームで通った範囲に斬撃の弧を描く（回転の軌跡が残る）
		var deg: float = absf(a - a0) * 180.0 / PI
		if deg > 1.0: api.fx.slash(me["x"], me["z"], (a + a0) / 2.0, SW["r"], maxf(24.0, deg + 12.0), 0xbfe0ff, 1.1)
		for i in 9:
			var aa: float = a0 + (a - a0) * i / 8.0
			for r in [float(SW["r"]) - 0.4, float(SW["r"]) - 1.4, float(SW["r"]) - 2.4]:
				api.fx.parts.emit(float(me["x"]) + sin(aa) * r, 1.15, float(me["z"]) + cos(aa) * r, {"color": 0xffffff if r > float(SW["r"]) - 1.0 else 0xbfe0ff, "size": 0.6, "life": 0.3, "speed": 0.4, "gravity": 0})
	if not WFX.truthy(me.get("sweepHit")) and prev < float(SW["hitAt"]) and float(me["sweepT"]) >= float(SW["hitAt"]):
		me["sweepHit"] = true
		var kk: float = (1.3 if S["flags"].has("bulwark") else 1.0) * float(WFX.fx_reduce("sweepPower", 0.5))   # 反撃の心得で強くなる。盾槍以外（守護騎士）は半分
		api.circle(me["x"], me["z"], SW["r"], float(SW["mult"]) * kk, {"type": "heavy", "stun": float(SW["stun"]) * float(WFX.fx_reduce("sweepStun", 1))})
		api.fx.ringWave(me["x"], me["z"], 0xbfe0ff, float(SW["r"]) + 0.5, 0.4, 1.0, 1.0)
		api.fx.flash(me["x"], 1.2, me["z"], 0xbfe0ff, 50, 0.3)
		api.sfx("heavy")
		api.add_shake(0.45)
	if float(me["sweepT"]) >= float(SW["dur"]): me["sweepT"] = 0


# ---------------------------------------------------------------------------
# ハザード（loop.js hazardAt と毒沼）。毒沼は踏んでいる間ダメージ、流砂は足が遅くなる
# ---------------------------------------------------------------------------
## 立っている場所のハザード（なければ null）。屋内と、称号「霧を越えし者」は影響を受けない
static func hazard_at(api, x: float, z: float) -> Variant:
	if api.shape != "open" or _tf(api, "t_boss2"): return null
	for h in api.hazards:
		if sqrt(pow(float(h["x"]) - x, 2) + pow(float(h["z"]) - z, 2)) < float(h["r"]) - 0.3: return h
	return null


## 毒沼の毎フレーム（loop.js update の「ハザード」）。毒沼は 0.5 秒ごとに最大 HP の 2.5%（称号「霧を越えし者」は踏まない）
static func hazard_tick(api, dt: float) -> void:
	var me: Dictionary = api.me
	var hz: Variant = hazard_at(api, float(me["x"]), float(me["z"]))
	me["hazKind"] = hz["kind"] if hz != null else null
	if hz != null and hz["kind"] == "poison":
		me["hazT"] = (float(me["hazT"]) if me.get("hazT") != null else 0.0) - dt
		if float(me["hazT"]) <= 0.0:
			me["hazT"] = 0.5
			me["hp"] = float(me["hp"]) - maxf(1.0, _round(float(api.st["mhp"]) * 0.025))
			me["lastHurt"] = api.now()
			api.float_text(me["x"], 2.2, me["z"], "毒", "poison")
			api.fx.parts.burst(me["x"], 0.4, me["z"], 8, {"color": 0x9aff7a, "speed": 2, "size": 0.35, "life": 0.5, "gravity": -1})
			if float(me["hp"]) <= 0.0: fall(api)
