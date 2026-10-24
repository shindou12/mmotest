extends RefCounted
## 片手剣の武器ツリーの効果。元は public/js/weapons/sword.js の effects（register('sword', {...}) と extendCombat）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js と同じ数）。
## 武器の効果に渡す道具（player・attack・tree・show・party）は combat/api.gd の環境 api。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api
## actions.js SWEEP（盾槍の回転なぎ払い）。片手剣のガードカウンターが威力とスタンを借りる。r: 5.2, mult: 7.5, stun: 14
const SWEEP_MULT := 7.5
const SWEEP_STUN := 14.0


## sword.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("sword", {
		"stats": s.h_stats, "afterStats": s.h_after_stats, "treeReset": s.h_tree_reset,
		"critAlways": s.h_crit_always, "dmgMult": s.h_dmg_mult, "dmgMultLast": s.h_dmg_mult_last,
		"onHit": s.h_on_hit, "afterCast": s.h_after_cast, "afterCastLate": s.h_after_cast_late, "phantomReady": s.h_phantom_ready,
		"parry": s.h_parry, "onHurt": s.h_on_hurt, "onGuard": s.h_on_guard, "beforeHeavy": s.h_before_heavy, "guardCounter": s.h_guard_counter,
		"drLowHp": s.h_dr_low_hp, "incoming": s.h_incoming, "swingAspd": s.h_swing_aspd, "swingLate": s.h_swing_late, "swingLast": s.h_swing_last,
		"justDodge": s.h_just_dodge, "cooldownDt": s.h_cooldown_dt, "tick": s.h_tick, "onKill": s.h_on_kill, "aura": s.h_aura,
	}, {"dmgMult": 5, "onHit": 0, "onHurt": 1, "onGuard": 1, "aura": 4, "justDodge": 0, "incoming": 0, "swingLate": 0, "afterCast": 0})
	# スキルに渡す文脈に、受け流しの構えを足す（c.parry）
	a.extend_combat({"parry": s.ext_parry})


func _wt():
	return api.st.get("wt")


# 剣闘士の「勢い」（バフ欄に数を出す）
func set_mom(n0: float) -> void:
	var me: Dictionary = api.me
	var n := clampf(n0, 0.0, 10.0)
	if n == me["mom"]: return
	var up: bool = n > me["mom"]
	me["mom"] = n
	if up and n == 10.0 and WFX.truthy(me.get("model")):
		api.fx.ringWave(me["x"], me["z"], 0xffb040, 3, 0.35)
		api.fx.flash(me["x"], 1.4, me["z"], 0xffb040, 25, 0.25)   # 勢いが最大になった合図
	var keep := []
	for b in me["buffs"]:
		if b["id"] != "sw_mom": keep.append(b)
	me["buffs"] = keep
	if n > 0: me["buffs"].append({"id": "sw_mom", "label": "勢い %d" % int(n), "t": 1e9, "max": 1e9, "mods": {}, "color": 0xff9a2e})


# 片手剣のガードカウンター（守護騎士）: 踏み込みながら大きく横に斬り払う。威力は盾槍の回転なぎ払いの半分
func sword_counter() -> void:
	var me: Dictionary = api.me
	var M: Dictionary = Common.TM("sw_counter")
	var a: float = me["a"]
	me["swingT"] = 9
	me["motion"] = M["id"]
	me["motionT"] = 0
	me["skillT"] = 0
	me["skillDuration"] = M["duration"]
	api.dash(a, 1.4, 0.16, 0.3)
	api.sfx("swing", {"heavy": true})
	api.later(M["hits"][0], func():
		api.arc(4.2, 300, SWEEP_MULT * 0.5, {"type": "heavy", "stun": SWEEP_STUN, "a": a})
		api.fx.slash(me["x"], me["z"], a, 4.2, 300, 0xbfe0ff, 1.4)
		api.fx.ringWave(me["x"], me["z"], 0xbfe0ff, 4.6, 0.35)
		api.sfx("heavy")
		api.add_shake(0.35)
	)


## extendCombat の c.parry(sec, dr)
func ext_parry(sec, dr) -> void:
	api.add_buff("sw_parry", "受け流し", sec, {"dr": dr}, 0xbfe0ff)
	api.me["parryUntil"] = api.now() + sec
	api.me["parryDone"] = false


# ---- 能力値: 守護騎士はガードできる・軽身（回避の距離と無敵） ----
func h_stats(S: Dictionary, WT, _W = null) -> void:
	S["guard"] = WFX.truthy(S.get("guard")) or (WT != null and WT.ks1 == "sw_guard")
	if WT != null and WT.br("sw_light") == "B": S["dodgeDist"] = 1.3
	S["iframeBonus"] = S["iframeBonus"] + (WT.v("sw_light", "iframe") if WT != null else 0.0)


func h_after_stats() -> void:
	var W = _wt()
	if (W == null or W.ks1 != "sw_glad") and WFX.truthy(api.me.get("mom")): set_mom(0)


func h_tree_reset() -> void:
	set_mom(0)
	api.me["revenge"] = 0


# 剣聖: 全会心
func h_crit_always(o: Dictionary) -> bool:
	return api.has_buff("sw_saint") and o.get("type") != "dot"


func h_dmg_mult(k0: float, W, o: Dictionary, _mb = null, _crit = null) -> float:
	var me: Dictionary = api.me
	var k := k0
	if W.ks1 == "sw_glad": k *= 1 + me["mom"] * 0.03
	if W.br("sw_tough") == "B" and me["hp"] < api.st["mhp"] * 0.5: k *= 1.15
	if WFX.truthy(o.get("wave")) and W.br("sw_dance") == "B" and api.has_buff("sw_dance"): k *= 1.5
	return k


# 幻剣で出したもう1回は威力 -30%（後の先の +50% のあと）
func h_dmg_mult_last(k: float, _W = null, o: Dictionary = {}, _mb = null, _crit = null) -> float:
	var t = o.get("type")
	return k * 0.7 if (t == "tskill" or t == "wskill") and api.now() < api.me["phantomUntil"] else k


func h_on_hit(mb: Dictionary, dmg: float, crit: bool, o: Dictionary, _mult = null) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	var S: Dictionary = api.st
	var bal: Dictionary = Common.game()["balance"]
	# 技の巡り: 1回の攻撃で1回まで
	if W.lv("sw_cycle") != 0 and me["cycleAct"] != me["act"]:
		me["cycleAct"] = me["act"]
		api.cut_cds(W.v("sw_cycle", "cut") * (2.0 if crit and W.br("sw_cycle") == "A" else 1.0))
	if W.ks1 == "sw_glad":
		set_mom(me["mom"] + 1)
		if W.ks2 == "sw_saint" and me["mom"] >= 10 and not WFX.truthy(me.get("saintOn")):
			me["saintOn"] = true
			api.add_buff("sw_saint", "剣聖・全会心", 3, {}, 0xffd84a)
			api.float_text(me["x"], 3.2, me["z"], "剣聖!", "just")
	# 狂剣士の吸収も、ふつうの吸収と同じく間隔に1回（継続ダメージは対象外）
	if W.ks2 == "sw_berserk" and me["mom"] > 0 and o.get("type") != "dot" and api.now() - float(Dmg.or_(me.get("berserkVampT"), -1e9)) >= bal["lifestealGap"]:
		me["berserkVampT"] = api.now()
		api.heal_player(dmg * me["mom"] / 100.0 * bal["lifestealEfficiency"], false)
	if crit and W.br("sw_edge") == "A" and api.now() - me["edgeT"] > 0.5:
		me["edgeT"] = api.now()
		api.proj({"a": atan2(mb["x"] - me["x"], mb["z"] - me["z"]), "mult": 0.5, "type": "proc", "speed": 26, "life": 0.45, "rad": 0.9, "wtNo": true})
	if crit and W.br("sw_edge") == "B" and api.now() - me["edgeHealT"] > 0.15:
		me["edgeHealT"] = api.now()
		api.heal_player(S["mhp"] * 0.01, false)
	if o.get("type") == "normal" and W.br("sw_norm") == "B":
		if me["normHealAct"] != me["act"]:
			me["normHealAct"] = me["act"]
			me["normHeals"] = 0
		if me["normHeals"] < 2:
			me["normHeals"] += 1
			api.heal_player(S["mhp"] * 0.005, false)
	if o.get("type") == "normal" and W.br("sw_dance") == "A" and me["danceAct"] != me["act"] and me["danceExt"] < 4:
		var b = null
		for q in me["buffs"]:
			if q["id"] == "sw_dance":
				b = q
				break
		if b != null:
			me["danceAct"] = me["act"]
			me["danceExt"] += 0.2
			b["t"] += 0.2
			b["max"] = maxf(b["max"], b["t"])
	# 天剣: 斬撃波1発につき1回
	var proj = o.get("proj")
	if WFX.truthy(o.get("wave")) and W.ks2 == "sw_heaven" and proj != null and not WFX.truthy(proj.get("heaven")):
		proj["heaven"] = true
		api.cut_cds(0.15)
		# 天剣: 当たった所から光の粒が持ち主へ戻ってくる（クールタイムが縮んだ合図）
		var dx: float = me["x"] - mb["x"]
		var dz: float = me["z"] - mb["z"]
		var d: float = Dmg.or_(sqrt(dx * dx + dz * dz), 1.0)
		for i in 6:
			api.fx.parts.emit(mb["x"], 1.3, mb["z"], {"color": 0xfff0a0, "size": 0.32, "life": minf(0.6, d / 14.0), "dir": [dx / d, 0.05, dz / d], "speed": 14, "spread": 0.15, "gravity": 0, "drag": 0})
		api.fx.parts.burst(me["x"], 1.3, me["z"], 6, {"color": 0xfff0a0, "speed": 2.5, "size": 0.3, "life": 0.35})


# スキルを使った後（free: 幻剣のもう1回）
func h_after_cast(_id = null, _free = null) -> void:
	var W = _wt()
	if W.ks1 == "sw_mage": api.me["mageT"] = api.now() + 3
	if W.br("sw_cycle") == "B": api.quiet_buff("sw_cycleB", "余勢", 2, {"aspd": 12}, 0x9affc8)


func h_after_cast_late(id, free) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if id == "sw_dance": me["danceExt"] = 0
	if WFX.truthy(free):
		me["phantom"] = null
		me["phantomUntil"] = api.now() + 1.2
		api.float_text(me["x"], 3.4, me["z"], "幻剣", "just")
		api.fx.ringWave(me["x"], me["z"], 0xb86cff, 2.6, 0.35)
	elif W.ks2 == "sw_phantom":
		me["phantom"] = {"id": id, "until": api.now() + 3}


func h_phantom_ready(id) -> bool:
	var W = _wt()
	var ph = api.me.get("phantom")
	return W != null and W.ks2 == "sw_phantom" and ph != null and ph["id"] == id and api.now() < ph["until"]


# 受け流し（構えている間に受けた）: ほかの被弾の効果は起きない
func h_parry() -> bool:
	var me: Dictionary = api.me
	var W = _wt()
	if not (api.now() < me["parryUntil"] and not WFX.truthy(me["parryDone"])): return false
	me["parryDone"] = true
	api.float_text(me["x"], 3, me["z"], "受け流し!", "just")
	api.sfx("block")
	api.fx.ringWave(me["x"], me["z"], 0xbfe0ff, 2.4, 0.3)
	if W.br("sw_parry") == "A": api.cut_cds(3)
	if W.br("sw_parry") == "B": api.add_buff("sw_parryB", "奮い立ち", 5, {"atkp": 25}, 0xffb040)
	return true


# 攻撃を受けた（不撓A・勢いのリセット）
func h_on_hurt() -> void:
	var W = _wt()
	if W.br("sw_tough") == "A": api.cut_cds(1)
	if W.ks1 == "sw_glad" and W.ks2 != "sw_berserk": set_mom(0)


# ガードで受けた（守護騎士・報復者）
func h_on_guard(raw: float, _src = null) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	var S: Dictionary = api.st
	if W.ks2 == "sw_paladin" and api.now() - me["paladinT"] > 1.5:
		me["paladinT"] = api.now()
		api.heal_player(S["mhp"] * 0.05, true)
		api.taunt(8)
		api.fx.ringWave(me["x"], me["z"], 0xfff0a0, 4, 0.4)
	if W.ks2 == "sw_avenger":
		me["revenge"] = minf(S["mhp"], me["revenge"] + raw)
		api.fx.ringWave(me["x"], me["z"], 0xff4a3a, 1.6 + minf(1.0, me["revenge"] / (S["mhp"] * 0.5)) * 1.6, 0.3)


# 報復者: 溜めたダメージを次の強攻撃（ガードカウンター）に上乗せ
func h_before_heavy() -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if not (me["revenge"] > 0) or W == null or W.ks2 != "sw_avenger": return
	var mult: float = me["revenge"] / api.st["atk"]
	me["revenge"] = 0
	api.later(0.15, func():
		api.circle(me["x"], me["z"], 3.6, mult, {"type": "heavy"})
		api.fx.ringWave(me["x"], me["z"], 0xff6a5a, 4, 0.4)
		api.fx.flash(me["x"], 1.5, me["z"], 0xff6a5a, 40, 0.3)
		api.float_text(me["x"], 3.2, me["z"], "報復!", "just")
		api.add_shake(0.3)
	)


# 守護騎士のガードカウンター（盾槍以外）
func h_guard_counter() -> bool:
	if api.st["wk"] == "spear": return false
	sword_counter()
	return true


# 不撓B「背水」
func h_dr_low_hp(dr: float) -> float:
	var W = _wt()
	return dr + (15.0 if W != null and W.br("sw_tough") == "B" and api.me["hp"] < api.st["mhp"] * 0.5 else 0.0)


# 狂剣士: 勢いの分だけ被ダメージが増える
func h_incoming(raw: float) -> float:
	var W = _wt()
	return raw * (1 + 0.02 * api.me["mom"]) if W != null and W.ks2 == "sw_berserk" else raw


func h_swing_aspd(v: float) -> float:
	var W = _wt()
	return v + (api.me["mom"] * 2 if W != null and W.ks1 == "sw_glad" else 0.0)


# 3段目: 剣の心得A「閃光」（斬撃波の特性がないとき）/ 魔剣士の光波
func h_swing_late(a: float, waved) -> void:
	var W = _wt()
	if not WFX.truthy(waved) and api.me["combo"] == 2 and W != null and W.br("sw_norm") == "A":
		api.proj({"a": a, "mult": 1.2, "type": "normal"})   # 剣の心得A「閃光」


func h_swing_last(a: float) -> void:
	var W = _wt()
	if W != null and W.ks1 == "sw_mage" and api.now() < api.me["mageT"]:
		api.proj({"a": a, "mult": 0.8, "type": "normal", "speed": 26, "life": 0.5, "rad": 1.1})   # 魔剣士


func h_just_dodge() -> void:
	var W = _wt()
	if W != null and W.br("sw_light") == "A":
		api.me["afterJust"] = true
		api.float_text(api.me["x"], 3.0, api.me["z"], "後の先", "just")


# ブレイブハートB「速攻」: 効果中はクールタイムが早く戻る
func h_cooldown_dt(dt: float) -> float:
	var W = _wt()
	return dt / 0.7 if W != null and W.br("sw_brave") == "B" and api.has_buff("sw_brave") else dt


# 剣聖の全会心が終わったら勢いは0
func h_tick() -> void:
	if WFX.truthy(api.me.get("saintOn")) and not api.has_buff("sw_saint"):
		api.me["saintOn"] = false
		set_mom(0)


# とどめを刺した（直前に当てた）: ブレイブハートA「猛り」
func h_on_kill(mb) -> void:
	var W = _wt()
	if mb != null and W != null and W.br("sw_brave") == "A" and api.now() - mb["localT"] < 1.2:
		var b = null
		for q in api.me["buffs"]:
			if q["id"] == "sw_brave":
				b = q
				break
		if b != null:
			b["t"] += 2
			b["max"] = maxf(b["max"], b["t"])


func h_aura(dt: float, W) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	# 剣闘士: 勢いが溜まるほど、橙の火の粉が体から立ちのぼる（最大で足元に炎の輪）
	if W.ks1 == "sw_glad" and me["mom"] > 0:
		var mom: float = me["mom"]
		api.wt_emit("mom", mom * 7, dt, func():
			var x: float = me["x"] + api.rnd(-0.55, 0.55)
			var y: float = api.rnd(0.1, 1.5)
			var z: float = me["z"] + api.rnd(-0.55, 0.55)
			api.fx.parts.emit(x, y, z, {"color": 0xffc040 if me["mom"] >= 10 else 0xff7a2a, "size": 0.3 + me["mom"] * 0.03, "life": 0.7, "speed": 1.4, "gravity": -4})
		)
		if me["mom"] >= 10 and api.now() - float(Dmg.or_(me.get("momFxT"), 0.0)) > 0.7:
			me["momFxT"] = api.now()
			api.fx.ringWave(me["x"], me["z"], 0xff9a2e, 1.8, 0.45)
	# 剣聖: 全会心の間は、剣から金の光がこぼれ、足元に金の輪
	if api.has_buff("sw_saint"):
		var hp: Dictionary = api.hand_pos(me.get("model"))
		api.wt_emit("saint", 45, dt, func():
			var x: float = hp["x"] + api.rnd(-0.35, 0.35)
			var y: float = hp["y"] + api.rnd(-0.2, 0.7)
			var z: float = hp["z"] + api.rnd(-0.35, 0.35)
			api.fx.parts.emit(x, y, z, {"abs": true, "color": 0xffe070, "size": 0.34, "life": 0.45, "speed": 0.6, "gravity": -2})
		)
		if api.now() - float(Dmg.or_(me.get("saintFxT"), 0.0)) > 0.5:
			me["saintFxT"] = api.now()
			api.fx.ringWave(me["x"], me["z"], 0xffd84a, 2.2, 0.4)
	# 報復者: 溜めたダメージが多いほど、赤い揺らめきが濃くなり、足元の赤い輪が脈打つ
	if W.ks2 == "sw_avenger" and me["revenge"] > 0:
		var k: float = minf(1.0, me["revenge"] / (S["mhp"] * 0.5))
		api.wt_emit("rev", 12 + 45 * k, dt, func():
			var x: float = me["x"] + api.rnd(-0.5, 0.5)
			var y: float = api.rnd(0.1, 1.3)
			var z: float = me["z"] + api.rnd(-0.5, 0.5)
			api.fx.parts.emit(x, y, z, {"color": 0xff2a2a if k > 0.7 else 0xff6a5a, "size": 0.28 + 0.28 * k, "life": 0.6, "speed": 0.9, "gravity": -2.5})
		)
		if api.now() - float(Dmg.or_(me.get("revFxT"), 0.0)) > 1.1 - 0.6 * k:
			me["revFxT"] = api.now()
			api.fx.ringWave(me["x"], me["z"], 0xff4a3a, 1.4 + k, 0.4)
