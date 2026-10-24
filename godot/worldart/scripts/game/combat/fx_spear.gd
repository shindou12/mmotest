extends RefCounted
## 盾槍の武器ツリーの効果。元は public/js/weapons/spear.js の effects（register('spear', {...})）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js と同じ数）。
## ガード・ガードカウンター・回転なぎ払い（guardCounter・guardKeep など）の効果は登録してあるが、ガードそのもの（input.js の構え、hurt.js のガード分岐、
## actions.js の sweepTick）はゲームに移していない（次の段階 G4）。ゲームからは呼ばれない。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api

## 竜騎士の強攻撃（spear.js JUMP）
const JUMP_AIR := 0.55
const JUMP_MULT := [0.0, 5.0, 7.5]
const JUMP_RANGE := [0.0, 5.0, 8.0]
const JUMP_R := 2.5


## actions.js SWEEP（ガードカウンターの回転なぎ払い）: SPEAR_TIMINGS.counter に r・mult・stun と、dur・hitAt を足したもの
static func sweep() -> Dictionary:
	var S: Dictionary = Common.game()["skillTimings"]["counter"].duplicate()
	S["r"] = 5.2
	S["mult"] = 7.5
	S["stun"] = 14.0
	S["dur"] = S["wind"] + S["slash"] + S["rest"]
	S["hitAt"] = S["wind"] + S["slash"] * 0.5
	return S


## spear.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("spear", {
		"stats": s.h_stats, "dmgMult": s.h_dmg_mult, "critAfter": s.h_crit_after, "hitTech": s.h_hit_tech, "hitOpts": s.h_hit_opts,
		"reach": s.h_reach, "swingColor": s.h_swing_color, "swingExtra": s.h_swing_extra, "onHit": s.h_on_hit,
		"onHurtFirst": s.h_on_hurt_first, "onGuard": s.h_on_guard, "steadyGuard": s.h_steady_guard, "guardKeep": s.h_guard_keep,
		"guardRegen": s.h_guard_regen, "guardRegenDelay": s.h_guard_regen_delay, "guardLock": s.h_guard_lock, "guardCtrLock": s.h_guard_ctr_lock,
		"counterGauge": s.h_counter_gauge, "chargeStart": s.h_charge_start, "heavyOverride": s.h_heavy_override, "heavyStart": s.h_heavy_start,
		"guardCounter": s.h_guard_counter, "sweepPower": s.h_sweep_power, "sweepStun": s.h_sweep_stun, "shieldBack": s.h_shield_back, "aura": s.h_aura,
	}, {"dmgMult": 3, "onHit": 1, "onHurtFirst": 0, "onGuard": 0, "heavyStart": 0, "aura": 2})


func _wt():
	return api.st.get("wt")


# 攻撃が槍の先端で当たったか（間合い）: 1 = 先端 / -1 = 近すぎ / 0 = それ以外・対象外
func sp_tip(o: Dictionary) -> int:
	var W = _wt()
	if W == null or W.ks1 != "sp_reach" or o.get("tip") == null or not Dmg.ATK_TYPES.has(o.get("type")): return 0
	var tip: float = o["tip"]
	return 1 if tip >= 0.7 else (-1 if tip < 0.4 else 0)


# 突きの届く距離の倍率（槍の心得A「長柄」は通常攻撃だけ・騎士の雷は突き全部）
func sp_reach(normal) -> float:
	var W = _wt()
	return (1.2 if (WFX.truthy(normal) and W != null and W.br("sp_spear") == "A") else 1.0) * (1.5 if api.has_buff("sp_thunder") else 1.0)


# 騎士: 突きが雷をまとう
func sp_thunder() -> void:
	var me: Dictionary = api.me
	if not api.has_buff("sp_thunder"):
		api.fx.lightning(me["x"], me["z"], 0x9ad8ff)
		api.sfx("thunder")
	api.quiet_buff("sp_thunder", "雷槍", 3, {}, 0x9ad8ff)


# 竜騎士の強攻撃: 高く跳んで狙った場所へ突き降りる（空中は無敵）
func sp_jump(lv, soared: bool = false) -> void:
	var me: Dictionary = api.me
	var p: Dictionary = api.aim_point()
	var a := atan2(p["x"] - me["x"], p["z"] - me["z"])
	var d := minf(JUMP_RANGE[int(lv)], sqrt(pow(p["x"] - me["x"], 2) + pow(p["z"] - me["z"], 2)))
	var M: Dictionary = Common.TM("sp_jump")
	me["a"] = a
	me["swingT"] = 9
	me["motion"] = M["id"]
	me["motionT"] = 0
	me["skillT"] = 0
	me["skillDuration"] = M["duration"]
	me["act"] += 1
	api.dash(a, maxf(0.01, d), JUMP_AIR, JUMP_AIR + 0.15)
	api.fx.parts.burst(me["x"], 0.3, me["z"], 18, {"color": 0xd8c8a8, "speed": 4, "size": 0.45, "life": 0.4, "up": 3})
	api.sfx("dodge")
	api.later(JUMP_AIR, func():
		if WFX.truthy(me.get("dead")): return
		api.circle(me["x"], me["z"], JUMP_R, JUMP_MULT[int(lv)], {"type": "heavy", "stun": 10})
		api.fx.ringWave(me["x"], me["z"], api.weapon_color(), JUMP_R + 0.6, 0.35)
		api.fx.flash(me["x"], 1, me["z"], 0xffffff, 40, 0.25)
		api.fx.parts.burst(me["x"], 0.3, me["z"], 40, {"color": 0xc8b090, "speed": 7, "size": 0.5, "life": 0.6, "up": 2})
		api.sfx("heavy")
		api.add_shake(0.5 if lv == 2 else 0.3)
		api.set_hit_stop(0.06)
		if _wt() != null and _wt().ks2 == "sp_fang":   # 竜の牙: 着地点から衝撃が広がる
			api.later(0.08, func():
				api.circle(me["x"], me["z"], 4.5, 3.0, {"type": "heavy", "stun": 20})
				api.fx.ringWave(me["x"], me["z"], 0xff8a4a, 5, 0.45)
				api.fx.parts.burst(me["x"], 0.4, me["z"], 50, {"color": 0xff8a4a, "speed": 9, "size": 0.55, "life": 0.6, "up": 2})
				api.add_shake(0.4)
			)
		if _wt() != null and _wt().ks2 == "sp_soar" and not soared:
			me["soarReady"] = api.now() + 1.5
			api.fx.ringWave(me["x"], me["z"], 0x9affc8, 1.6, 0.3)
	)


# 旗手: ガードカウンターした場所に旗を立てる
func sp_banner(x: float, z: float) -> void:
	var me: Dictionary = api.me
	var old = me["banner"]["mesh"] if WFX.truthy(me.get("banner")) else null
	var g = api.banner_visual(x, z, old)   # 前の旗は消して、新しい旗の部品を返す
	me["banner"] = {"x": x, "z": z, "until": api.now() + 8, "mesh": g}
	api.fx.beam(x, z, 0x6ab0ff, 4, 0.5, 0.5)


# 一点突破: 溜めた次の突きが前方を貫く衝撃になる
func sp_pierce(a: float) -> void:
	var me: Dictionary = api.me
	if not WFX.truthy(me.get("pierceReady")): return
	me["pierceReady"] = false
	api.proj({"a": a, "mult": 1.6, "type": "normal", "speed": 30, "life": 0.45, "rad": 1.3, "color": 0xfff0a0, "wtNo": true})
	api.fx.flash(me["x"], 1.3, me["z"], 0xfff0a0, 30, 0.2)


# 竜騎士はガードの代わりに跳ぶ
func h_stats(S: Dictionary, WT, _W = null) -> void:
	S["guard"] = WFX.truthy(S.get("guard")) and (WT == null or WT.ks1 != "sp_dragoon")


func h_dmg_mult(k0: float, W, o: Dictionary, mb = null, _crit = null) -> float:
	var k := k0
	var tip := sp_tip(o)
	if tip == 1: k *= 1.25
	elif tip == -1: k *= 0.8
	if api.has_buff("sp_thunder") and (o.get("type") == "normal" or o.get("type") == "heavy"): k *= 1.2
	if W.br("sp_brk") == "A" and mb != null and mb["stunT"] > 0: k *= 1.2
	return k


# 間合い: 槍の先端は必ず会心
func h_crit_after(_mb = null, o: Dictionary = {}) -> bool:
	return sp_tip(o) == 1


# 間合い支配: 先端で当てた雑魚を押し戻す
func h_hit_tech(tech, o: Dictionary, mb: Dictionary):
	var W = _wt()
	return "spear_press" if (W != null and W.ks2 == "sp_hold" and sp_tip(o) == 1 and mb["kind"] != 2) else tech


# 範囲攻撃の当たり: 間合いのときは、届く距離のどのあたりで当たったか（tip）を付ける
func h_hit_opts(o: Dictionary, frac):
	var W = _wt()
	return Common.spread(o, {"tip": frac}) if (W != null and W.ks1 == "sp_reach") else o


func h_reach(k: float, normal = null) -> float:
	return k if api.st["wk"] != "spear" else k * sp_reach(normal)


func h_swing_color(col):
	return 0x9ad8ff if api.has_buff("sp_thunder") else col


# 槍の心得B「連突き」と一点突破（通常攻撃）
func h_swing_extra(a: float, range_: float, col) -> void:
	var me: Dictionary = api.me
	var W: Dictionary = api.st["W"]
	var wt = _wt()
	if wt != null and wt.br("sp_spear") == "B" and me["combo"] == 2:   # 連突き
		api.later(0.2, func():
			api.arc(range_, W["arc"], 0.6, {"a": a, "type": "normal"})
			api.fx.slash(me["x"], me["z"], a, range_, W["arc"], col, 0.8)
		)
	sp_pierce(a)


# 先端の連続（一点突破）と雷槍
func h_on_hit(mb: Dictionary, _dmg = null, _crit = null, o: Dictionary = {}, _mult = null) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W == null: return
	if W.ks1 == "sp_reach" and me["tipAct"] != me["act"] and Dmg.ATK_TYPES.has(o.get("type")):
		me["tipAct"] = me["act"]
		me["tipRun"] = me["tipRun"] + 1 if sp_tip(o) == 1 else 0
		if W.ks2 == "sp_pierce" and me["tipRun"] >= 3 and not WFX.truthy(me.get("pierceReady")):
			me["pierceReady"] = true
			me["tipRun"] = 0
			api.float_text(me["x"], 3.1, me["z"], "一点突破", "just")
			api.fx.ringWave(me["x"], me["z"], 0xfff0a0, 1.8, 0.3)
	if sp_tip(o) == 1: api.fx.flash(mb["x"], 1.3, mb["z"], 0xfff0a0, 14, 0.12)
	if W.ks2 == "sp_bolt" and api.has_buff("sp_thunder") and (o.get("type") == "normal" or o.get("type") == "heavy") and api.now() - me["boltT"] > 0.3:
		me["boltT"] = api.now()
		var x: float = mb["x"]
		var z: float = mb["z"]
		api.later(0.06, func():
			api.fx.lightning(x, z, 0x9ad8ff)
			api.circle(x, z, 2.5, 0.6, {"type": "proc", "noProc": true})
			api.sfx("thunder")
		)


# 迎撃の構えA「雷の構え」: 構えている間に受けると雷をまとう
func h_on_hurt_first() -> void:
	var W = _wt()
	if W != null and W.br("sp_intercept") == "A" and api.has_buff("sp_intercept"): sp_thunder()


func h_on_guard(_raw = null, src = null) -> void:
	var W = _wt()
	if W == null: return
	if W.br("sp_intercept") == "A" and api.has_buff("sp_intercept"): sp_thunder()
	if W.br("sp_shield") == "B" and src != null and src["hp"] > 0: Dmg.deal_damage(api, src, 0.3, {"type": "proc", "stun": 6, "noProc": true})   # 盾の重み


# 鉄壁A「不動」: ガードで受けても押し戻されない
func h_steady_guard() -> bool:
	var W = _wt()
	return W != null and W.br("sp_iron") == "A"


# 盾の心得: ガードゲージの減りが少ない / 挑発A「威圧」: 効果中は減らない / 盾の心得A: 回復が2倍
func h_guard_keep(_k = null) -> float:
	var W = _wt()
	if W != null and W.br("sp_taunt") == "A" and api.has_buff("sp_taunt"): return 0.0
	return 1 - (W.v("sp_shield", "gauge") if W != null else 0.0) / 100


func h_guard_regen(k: float) -> float:
	var W = _wt()
	return k * (1.6 if (W != null and W.br("sp_shield") == "A") else 1.0)


func h_guard_regen_delay(k: float) -> float:
	var W = _wt()
	return k * (0.5 if (W != null and W.br("sp_shield") == "A") else 1.0)


# 構え直しの隙: 鉄壁A「不動」は半分 / 反撃の心得A「反撃の守り」はカウンターのあとも普通に解いたときと同じ
func h_guard_lock(k: float) -> float:
	var W = _wt()
	return k * (0.5 if (W != null and W.br("sp_iron") == "A") else 1.0)


func h_guard_ctr_lock(k: float, P: Dictionary) -> float:
	var W = _wt()
	return (P["lock"] if (W != null and W.br("sp_ctr") == "A") else k) * (0.5 if (W != null and W.br("sp_iron") == "A") else 1.0)


# 騎士: ガードカウンターでガードゲージが20戻る
func h_counter_gauge(max_) -> void:
	var W = _wt()
	if api.st["wk"] == "spear" and W != null and W.ks1 == "sp_knight": api.me["gg"] = minf(max_, api.me["gg"] + 20)


# 竜翔: 溜めなしでもう一度跳ぶ
func h_charge_start() -> bool:
	var me: Dictionary = api.me
	if not (WFX.truthy(me.get("soarReady")) and api.now() < me["soarReady"] and not WFX.truthy(me.get("dead")) and me["downT"] <= 0 and me["staggerT"] <= 0): return false
	me["soarReady"] = 0
	me["charging"] = false
	me["skillT"] = -1
	api.float_text(me["x"], 3, me["z"], "竜翔", "just")
	sp_jump(2, true)
	return true


# 竜騎士の強攻撃は跳躍
func h_heavy_override(lv) -> bool:
	var W = _wt()
	if W == null or W.ks1 != "sp_dragoon": return false
	sp_jump(lv)
	return true


func h_heavy_start(_lv = null) -> void:
	var me: Dictionary = api.me
	if api.st["wk"] == "spear":
		me["motion"] = "heavy"
		me["motionT"] = 0
		sp_pierce(me["a"])


# ガードカウンター: 騎士の雷・旗手・反撃の心得A/B と、回転なぎ払い（sweepTick）
func h_guard_counter() -> bool:
	var me: Dictionary = api.me
	if api.st["wk"] != "spear": return false
	var W = _wt()
	var SW := sweep()
	if W != null and W.ks1 == "sp_knight": sp_thunder()
	if W != null and W.ks2 == "sp_banner": sp_banner(me["x"], me["z"])
	if W != null and W.br("sp_ctr") == "A": me["iframe"] = maxf(me["iframe"], SW["dur"])
	if W != null and W.br("sp_ctr") == "B":   # 二段反撃
		api.later(SW["dur"], func():
			if not WFX.truthy(me.get("dead")):
				var a: float = api.aim_angle()
				me["a"] = a
				me["swingT"] = 0
				me["swingDur"] = 0.4
				me["combo"] = 2
				me["sw"] += 1
				api.line(6 * sp_reach(false), 2, 1.5, {"type": "heavy", "a": a})
				api.fx.slash(me["x"], me["z"], a, 6, 30, 0xbfe0ff, 1.2)
				api.sfx("swing", {"heavy": true})
		)
	me["swingT"] = 9   # 振りのモーションの代わりに回転なぎ払い
	me["sweepT"] = 1e-4
	me["sweepHit"] = false
	me["motion"] = "counter"
	me["motionT"] = 0
	api.sfx("swing", {"heavy": true})
	return true


# 回転なぎ払いの威力（反撃の心得で強くなる。盾槍以外は半分）とスタン値（崩しの心得B）
func h_sweep_power(k: float) -> float:
	var W = _wt()
	return 1 + (W.v("sp_ctr", "ctr") if W != null else 0.0) / 100 if api.st["wk"] == "spear" else k


func h_sweep_stun(k: float) -> float:
	var W = _wt()
	return k * (2.0 if (W != null and W.br("sp_brk") == "B") else 1.0)


# 竜騎士は盾を背負う（他のプレイヤーにも見せる）
func h_shield_back() -> bool:
	var W = _wt()
	return W != null and W.ks1 == "sp_dragoon"


func h_aura(dt: float, _W = null) -> void:
	var me: Dictionary = api.me
	# 旗手: 旗のそばにいる間は守りと攻めが上がる
	if WFX.truthy(me.get("banner")):
		var b: Dictionary = me["banner"]
		if api.now() > b["until"]: me["banner"] = null
		elif sqrt(pow(me["x"] - b["x"], 2) + pow(me["z"] - b["z"], 2)) < 5: api.quiet_buff("sp_banner", "旗手", 0.3, {"dr": 20, "atkp": 15}, 0x6ab0ff)
	# 騎士: 雷をまとう間、槍の穂先から火花
	if api.has_buff("sp_thunder"):
		var hp: Dictionary = api.hand_pos(me.get("model"))
		api.wt_emit("thunder", 30, dt, func():
			var px: float = hp["x"] + api.rnd(-0.4, 0.4)
			var py: float = hp["y"] + api.rnd(0, 1.2)
			var pz: float = hp["z"] + api.rnd(-0.4, 0.4)
			var col := 0xffffff if api.random() < 0.5 else 0x9ad8ff
			api.fx.parts.emit(px, py, pz, {"abs": true, "color": col, "size": 0.28, "life": 0.2, "speed": 3, "gravity": 0})
		)
	if WFX.truthy(me.get("soarReady")) and api.now() < me["soarReady"]:
		api.wt_emit("soar", 20, dt, func():
			var px: float = me["x"] + api.rnd(-0.4, 0.4)
			var pz: float = me["z"] + api.rnd(-0.4, 0.4)
			api.fx.parts.emit(px, 0.2, pz, {"color": 0x9affc8, "size": 0.3, "life": 0.5, "speed": 1.5, "gravity": -5})
		)
