extends RefCounted
## 盾槍の技。元は public/js/weapons/spear.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## public/js/advanced-skills.js の cast のうち spear_* の技、public/js/skills.js の旧来のツリースキル（shieldbash・taunt・javelin・whirl）。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 表の値（cd・motion・duration・技の当たる時刻・SPEAR_TIMINGS など）は data/game.json から読む。JavaScript の技の中の数値はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")


## shared/skill-timings.js SPEAR_TIMINGS[id]
static func TI(id: String) -> Dictionary:
	return Common.game()["skillTimings"][id]


## skill-timings.js repeatHitAt
static func repeat_hit_at(timing: Dictionary, index: int) -> float:
	return timing["hitAt"] + index * timing["interval"]


## 向き a に沿って d を刻みながら粒を出す（技の中でよく出てくる for (let d = d0; d < len; d += step) c.fx.parts.emit(...)）
static func _trail(c, sx: float, sz: float, a: float, d0: float, length: float, step: float, y: float, o: Dictionary) -> void:
	var d := d0
	while d < length:
		c.fx.parts.emit(sx + sin(a) * d, y, sz + cos(a) * d, o)
		d += step


# ---------------------------------------------------------------------------
# 強攻撃（spear.js heavy）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	var k: float = c.reach(false)   # 騎士の雷で届く距離が伸びる
	c.dash(a, 3, TI("heavy")["dashDuration"], 0)
	c.later(TI("heavy")["hitAt"], func():
		c.line((8.0 if lv == 2 else 6.5) * k, 2.0, 3.8 if lv == 2 else 2.4, {"type": "heavy", "a": a, "sx": sx, "sz": sz})
		var d := 0.0
		while d < 8 * k:
			c.fx.parts.emit(sx + sin(a) * d, 1.1, sz + cos(a) * d, {"color": c.col(), "size": 0.5, "life": 0.35, "speed": 1, "gravity": 0})
			d += 0.5
	)


# ---------------------------------------------------------------------------
# 武器スキル（spear.js weaponSkills）
# ---------------------------------------------------------------------------
static func ws_lance(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.later(TI("lance")["hitAt"], func():
		c.line(12, 2.2, 3.0, {"type": "wskill", "a": a, "sx": sx, "sz": sz})
		c.sfx("thunder")
		_trail(c, sx, sz, a, 0.0, 12, 0.4, 1.1, {"color": 0xbfe0ff, "size": 0.7, "life": 0.45, "speed": 2, "gravity": 0})
		c.fx.lightning(sx + sin(a) * 10, sz + cos(a) * 10, 0xbfe0ff)
	)


static func ws_helix(c) -> void:
	var a: float = c.aim()
	var T := TI("helix")
	for i in int(T["count"]):
		c.later(repeat_hit_at(T, i), func():
			var aa: float = a + c.rnd(-0.5, 0.5) * 0.25
			c.line(5.2, 1.6, 1.8 if i == int(T["count"]) - 1 else 0.8, {"type": "wskill", "a": aa})
			_trail(c, c.me["x"], c.me["z"], aa, 1.0, 5, 0.6, 1.1, {"color": c.col(), "size": 0.4, "life": 0.25, "speed": 0.5, "gravity": 0})
			c.sfx("swing")
		)


static func ws_piercer(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.dash(a, 8, TI("piercer")["dashDuration"], 0.3)
	c.later(TI("piercer")["hitAt"], func():
		c.line(8.5, 2.4, 2.6, {"type": "wskill", "a": a, "sx": sx, "sz": sz, "threat": 3})
		_trail(c, sx, sz, a, 0.0, 8, 0.5, 1.1, {"color": c.col(), "size": 0.6, "life": 0.4, "speed": 1, "gravity": 0})
		c.sfx("wave")
	)


static func ws_whirlspear(c) -> void:
	var T := TI("whirlspear")
	c.taunt(9)
	for i in int(T["count"]):
		c.later(repeat_hit_at(T, i), func():
			c.circle(c.me["x"], c.me["z"], 3.4, 1.0, {"type": "wskill", "threat": 2})
			c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 3.4, 0.25)
			c.sfx("swing")
		)


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。spear.js skills）。c.wt() で振ったレベルと分岐を読む
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。盾槍には無い
static func cd_of(_id: String, _W):
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"sp_fan": return "sp_fan_leap" if W.br("sp_fan") == "A" else "spear_fan"
		"sp_sweep": return "sp_sweep_spin" if W.br("sp_sweep") == "A" else "spear_sweep"
		"sp_bash":
			var b = W.br("sp_bash")
			if b == "A": return "sp_bash_twin"
			if b == "B": return "sp_bash_rush"
			return "sp_bash"
		"sp_stake": return "sp_stake_tri" if W.br("sp_stake") == "B" else "spear_stake"
	return null


static func sp_fan(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.65 if W.lv("sp_fan") >= 2 else 1.3
	var b = W.br("sp_fan")
	var length := 7.5 if b == "B" else 5.0
	if b == "A": c.dash(a, 2.5, 0.2, 0.3)
	var hits: Array = (Common.TM("sp_fan_leap") if b == "A" else Common.T("spear_fan"))["hits"]
	for i in hits.size():
		Common.at(c, hits[i], func():
			var ang: float = a + (i - 1) * 0.5
			c.line(length, 1.5, m, {"type": "tskill", "a": ang})
			_trail(c, c.me["x"], c.me["z"], ang, 0.7, length, 0.5, 1.2, {"color": c.col(), "size": 0.42, "life": 0.25, "speed": 1, "gravity": 0})
			c.sfx("swing")
		)
	if b == "A":
		Common.at(c, Common.TM("sp_fan_leap")["hits"][0], func():
			c.circle(c.me["x"], c.me["z"], 3, 1.0, {"type": "tskill", "stun": 4})
			c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 3.4, 0.3)
			c.shake(0.25)
		)


static func sp_sweep(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.0 if W.lv("sp_sweep") >= 2 else 2.4
	var b = W.br("sp_sweep")
	var deg := 360 if b == "A" else 180
	Common.at(c, Common.TM("sp_sweep_spin")["hits"][0] if b == "A" else Common.T("spear_sweep")["hits"][0], func():
		c.arc(4, deg, m, {"type": "tskill", "a": a, "tech": "spear_sweep", "stun": 12 if b == "B" else 6})
		c.fx.slash(c.me["x"], c.me["z"], a, 4, deg, c.col(), 0.5)
		c.sfx("swing")
	)


static func sp_bash(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.5 if W.lv("sp_bash") >= 2 else 2.8
	var b = W.br("sp_bash")
	c.dash(a, 3 if b == "B" else 1.5, 0.16 if b == "B" else 0.1, 0.3 if b == "B" else 0)
	var bash := func(mult, stun):
		c.arc(3.4, 110, mult, {"type": "tskill", "a": a, "threat": 4, "stun": stun})
		c.fx.ringWave(c.me["x"] + sin(a) * 2, c.me["z"] + cos(a) * 2, 0xbfd8ff, 3, 0.3)
		c.sfx("block")
		c.shake(0.3)
	Common.at(c, Common.TM("sp_bash_rush")["hits"][0] if b == "B" else Common.TM("sp_bash")["hits"][0], func(): bash.call(m, 14))
	if b == "A": Common.at(c, Common.TM("sp_bash_twin")["hits"][1], func(): bash.call(1.5, 8))


static func sp_stake(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 4.8 if W.lv("sp_stake") >= 2 else 3.8
	var b = W.br("sp_stake")
	var p: Dictionary = c.point()
	var d := minf(6, sqrt(pow(p["x"] - c.me["x"], 2) + pow(p["z"] - c.me["z"], 2)))
	var spot: Dictionary = Common.sp_off(c.me["x"], c.me["z"], a, d)
	var spots := [spot]
	if b == "B": spots = [spot, Common.sp_off(spot["x"], spot["z"], a + 2.1, 1.8), Common.sp_off(spot["x"], spot["z"], a - 2.1, 1.8)]
	for q in spots: c.fx.ringWave(q["x"], q["z"], c.col(), 1.8, 0.4)
	if b == "B":   # 右・正面・左の順に打つ
		var order := [spots[2], spots[0], spots[1]]
		for i in order.size():
			var q: Dictionary = order[i]
			Common.at(c, Common.TM("sp_stake_tri")["hits"][i], func():
				c.circle(q["x"], q["z"], 1.8, m * 0.6, {"type": "tskill", "threat": 3, "stun": 5})
				c.fx.lightning(q["x"], q["z"], c.col())
				c.sfx("thunder")
			)
		return
	Common.at(c, Common.T("spear_stake")["hits"][0], func():
		for q in spots:
			c.circle(q["x"], q["z"], 1.8, m, {"type": "tskill", "threat": 3, "stun": 10})
			c.fx.lightning(q["x"], q["z"], c.col())
		c.sfx("thunder")
		if b == "A":
			for k in range(1, 7):
				Common.at(c, k * 0.5, func():
					c.circle(spot["x"], spot["z"], 1.8, 0.4, {"type": "tskill", "stun": 1})
					c.fx.lightning(spot["x"], spot["z"], 0xbfd8ff)
				)
	)


static func sp_intercept(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.9 if W.lv("sp_intercept") >= 2 else 1.5
	var b = W.br("sp_intercept")
	c.buff("sp_intercept", "迎撃の構え", 3, {"dr": 60 if b == "B" else 35}, 0xbfd8ff)
	c.taunt(8)
	for h in Common.T("spear_intercept")["hits"]:
		Common.at(c, h, func():
			c.line(5.5, 2, m, {"type": "tskill", "a": a, "threat": 3})
			c.sfx("swing")
		)


static func sp_taunt(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("sp_taunt") >= 2
	c.taunt(14)
	var mods := {"dr": 40 if lv2 else 30}
	if W.br("sp_taunt") == "B": mods["atkp"] = 20
	c.buff("sp_taunt", "挑発", 6, mods, 0xff6a4a)
	c.fx.ringWave(c.me["x"], c.me["z"], 0xff6a4a, 14, 0.6)
	c.text("こっちだ！", "info")
	c.sfx("roar")


## ツリーが足す能力値（ノードの mods 以外。spear.js mods(st, br, mods)）。br は W.br（Callable）
static func mods(st: Dictionary, br: Callable, m: Dictionary) -> void:
	if st["ks1"] == "sp_dragoon": m["aspd"] = m.get("aspd", 0.0) + 30
	if br.call("sp_iron") == "B": m["hpp"] = m.get("hpp", 0.0) + 10


# ---------------------------------------------------------------------------
# 旧来のツリースキル（skills.js TREE_SKILLS のうち盾槍の旧スロット）
# ---------------------------------------------------------------------------
static func shieldbash(c) -> void:
	var a: float = c.aim()
	c.dash(a, 1.5, 0.1, 0)
	c.later(0.08, func():
		c.arc(3.4, 110, 2.2, {"type": "tskill", "a": a, "threat": 4, "stun": 14})
		c.fx.ringWave(c.me["x"] + sin(a) * 2, c.me["z"] + cos(a) * 2, 0xbfd8ff, 3, 0.3)
		c.sfx("block")
		c.shake(0.3)
	)


static func taunt(c) -> void:
	c.taunt(14)
	c.buff("taunt", "挑発", 6, {"dr": 30}, 0xff6a4a)
	c.fx.ringWave(c.me["x"], c.me["z"], 0xff6a4a, 14, 0.6)
	c.text("こっちだ！", "info")
	c.sfx("roar")


static func javelin(c) -> void:
	var a: float = c.aim()
	c.later(TI("javelin")["hitAt"], func():
		c.proj({"a": a, "mult": 3.5, "speed": 32, "life": 0.6, "rad": 1.4, "type": "tskill", "color": 0xbfe0ff})
		c.sfx("wave")
	)


static func whirl(c) -> void:
	var T := TI("whirl")
	c.later(T["hitAt"], func():
		c.circle(c.me["x"], c.me["z"], 5, 2.4, {"type": "tskill"})
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 5.5, 0.35)
	)
	for i in int(T["effectCount"]):
		c.later(i * T["effectInterval"], func(): c.fx.slash(c.me["x"], c.me["z"], c.me["a"] + i * 2.1, 5, 200, c.col(), 1.0))
	c.sfx("swing", {"heavy": true})


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち spear_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"spear_fan":
			for i in t["hits"].size(): k.at(i, func(): k.line(1, 5, 1.5, a + (i - 1) * 0.5))
		"spear_sweep": k.at(0, func(): k.slash(1.8, 4, 180, a, {"stun": 6}))
		"spear_press":
			c.dash(a, 2, 0.2, 0)
			k.at(0, func(): k.line(2.2, 3.8, 2.4, a, {"threat": 5}))
		"spear_stake":
			var p: Dictionary = c.point()
			var d := minf(6, sqrt(pow(p["x"] - k.start["x"], 2) + pow(p["z"] - k.start["z"], 2)))
			var spot: Dictionary = Common.sp_off(k.start["x"], k.start["z"], a, d)
			c.fx.ringWave(spot["x"], spot["z"], c.col(), 1.8, 0.4)
			k.at(0, func():
				c.circle(spot["x"], spot["z"], 1.8, 3, Common.spread(k.tag, {"threat": 3, "stun": 10}))
				c.fx.lightning(spot["x"], spot["z"], c.col())
				c.sfx("thunder")
			)
		"spear_intercept":
			k.buff(3, {"dr": 35})
			c.taunt(8)
			for i in t["hits"].size(): k.at(i, func(): k.line(1.5, 5.5, 2, a, {"threat": 3}))
