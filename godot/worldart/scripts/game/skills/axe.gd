extends RefCounted
## 大斧の技。元は public/js/weapons/axe.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## と public/js/advanced-skills.js の cast のうち axe_* の技、public/js/skills.js の旧 TREE_SKILLS のうち warstomp・bloodlust。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 表の値（cd・motion・duration・技の当たる時刻など）は data/game.json から読む。JavaScript の技の中の数値（3.2・70 など）はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")


# ---------------------------------------------------------------------------
# 強攻撃（axe.js heavy「大地砕き」）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	var a: float = c.aim()
	var d: Array = Common.fwd(a, 2.4)
	var x: float = c.me["x"] + d[0]
	var z: float = c.me["z"] + d[1]
	c.fx.slash(c.me["x"], c.me["z"], a, 3.2, 70, c.col(), 2.4)
	c.later(0.16, func():
		c.circle(x, z, 3.4 if lv == 2 else 2.8, 5.0 if lv == 2 else 3.2, {"type": "heavy", "stun": 16 if lv == 2 else 10})
		c.fx.ringWave(x, z, 0xd8b080, 4.5 if lv == 2 else 3.5, 0.4)
		c.fx.parts.burst(x, 0.3, z, 50, {"color": 0xb89870, "speed": 8, "size": 0.6, "life": 0.7, "up": 2.5})
		c.shake(0.6 if lv == 2 else 0.35)
		c.sfx("impact")
	)


# ---------------------------------------------------------------------------
# 武器スキル（axe.js weaponSkills）
# ---------------------------------------------------------------------------
static func ws_rampage(c) -> void:
	for i in 3:
		c.later(i * 0.22, func():
			var a: float = c.aim()
			c.dash(a, 1.6, 0.1, 0)
			c.later(0.08, func():
				c.arc(3.4, 130, 1.5, {"type": "wskill", "a": a, "stun": 6})
				c.fx.slash(c.me["x"], c.me["z"], a, 3.4, 130, c.col(), 1.2, i % 2 == 1)
				c.sfx("swing", {"heavy": true})
			)
		)


static func ws_tomahawk(c) -> void:
	c.proj({"a": c.aim(), "mult": 2.8, "speed": 26, "life": 0.7, "rad": 1.6, "type": "wskill", "color": 0xd8b080})


static func ws_earthsplit(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.shake(0.3)
	c.sfx("heavy")
	for i in 5:
		c.later(0.08 + i * 0.08, func():
			var d: Array = Common.fwd(a, 2 + i * 2.2)
			var x: float = sx + d[0]
			var z: float = sz + d[1]
			c.circle(x, z, 2, 1.3, {"type": "wskill", "stun": 3})
			c.fx.parts.burst(x, 0.2, z, 22, {"color": 0xb89870, "speed": 6, "size": 0.6, "life": 0.5, "up": 3})
			if i % 2 == 0: c.sfx("impact")
		)


static func ws_bloodaxe(c) -> void:
	var S: Dictionary = c.S()
	var a: float = c.aim()
	c.me["hp"] = maxf(1.0, c.me["hp"] - S["mhp"] * 0.08)
	c.fx.parts.burst(c.me["x"], 1.2, c.me["z"], 30, {"color": 0xff3040, "speed": 4, "size": 0.5, "life": 0.6})
	c.later(0.25, func():
		c.arc(4.2, 120, 5.0, {"type": "wskill", "a": a, "stun": 14})
		c.fx.slash(c.me["x"], c.me["z"], a, 4.2, 120, 0xff3040, 2.2)
		c.fx.ringWave(c.me["x"] + sin(a) * 2.5, c.me["z"] + cos(a) * 2.5, 0xff3040, 3, 0.35)
		c.shake(0.7)
		c.sfx("impact")
	)


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。axe.js skills）。c.wt() で振ったレベルと分岐を読む
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。大斧には無い
static func cd_of(_id: String, _W):
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"ax_hook":
			var b = W.br("ax_hook")
			if b == "A": return "ax_hook_spin"
			if b == "B": return "ax_hook_twin"
			return "axe_hook"
		"ax_return": return "ax_return_tri" if W.br("ax_return") == "A" else "axe_return"
		"ax_exec": return "ax_exec_sweep" if W.br("ax_exec") == "B" else "axe_execute"
		"ax_rush": return "ax_rush_twin" if W.br("ax_rush") == "B" else "axe_rush"
	return null


static func ax_hook(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.6 if W.lv("ax_hook") >= 2 else 2.8
	var b = W.br("ax_hook")
	var deg := 360 if b == "A" else 110
	var T: Dictionary = Common.T("axe_hook")
	Common.at(c, T["hits"][0], func():
		c.arc(6 if b == "A" else 4.6, deg, 1, {"type": "tskill", "a": a, "tech": "axe_hook", "stun": 2})
		c.fx.slash(c.me["x"], c.me["z"], a, 6 if b == "A" else 4.6, deg, c.col(), 1.0)
		c.sfx("swing")
	)
	Common.at(c, T["hits"][1], func():
		c.arc(3.5, 120, m, {"type": "tskill", "a": a, "stun": 9})
		c.fx.slash(c.me["x"], c.me["z"], a, 3.5, 120, c.col(), 1.6)
		c.sfx("impact")
		c.shake(0.3)
	)
	if b == "B":
		Common.at(c, Common.TM("ax_hook_twin")["hits"][2], func():
			c.arc(3.5, 120, 1.5, {"type": "tskill", "a": a, "stun": 5})
			c.fx.ringWave(c.me["x"] + sin(a) * 2, c.me["z"] + cos(a) * 2, c.col(), 2.6, 0.3)
			c.sfx("impact")
			c.shake(0.35)
		)


static func ax_return(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.0 if W.lv("ax_return") >= 2 else 2.4
	var b = W.br("ax_return")
	var boomerang := {"out": 0.5, "hover": 1.5 if b == "B" else 0, "hoverMult": 0.7, "rehit": 0.25}
	Common.at(c, Common.T("axe_return")["hits"][0], func():
		# 投げる: 足元の衝撃と前への斬撃。斧は大きく、渦を巻いて飛ぶ
		var first := boomerang.duplicate()
		first["onCatch"] = func():
			c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 2.2, 0.3)
			c.sfx("block")
		c.proj({"a": a, "mult": m, "speed": 18, "rad": 2.2, "scale": 1.7, "shape": "axe", "type": "tskill", "stun": 4, "boomerang": first})
		if b == "A":
			for d in [-0.4, 0.4]: c.proj({"a": a + d, "mult": m * 0.375, "speed": 18, "rad": 1.6, "scale": 1.2, "shape": "axe", "type": "tskill", "boomerang": boomerang})
		c.fx.slash(c.me["x"], c.me["z"], a, 3.2, 70, c.col(), 1.1)
		c.fx.parts.burst(c.me["x"] + sin(a) * 1.2, 0.3, c.me["z"] + cos(a) * 1.2, 24, {"color": 0xd8b080, "speed": 6, "size": 0.5, "life": 0.45, "up": 2})
		c.sfx("heavy")
		c.shake(0.25)
	)


static func ax_stomp(c) -> void:
	var W = c.wt()
	var m := 2.3 if W.lv("ax_stomp") >= 2 else 1.8
	var b = W.br("ax_stomp")
	var r := 7.5 if b == "B" else 5.0
	var quake := func(mult, stun, rr):
		c.circle(c.me["x"], c.me["z"], rr, mult, {"type": "tskill", "stun": stun})
		c.fx.ringWave(c.me["x"], c.me["z"], 0xd8b080, rr + 1, 0.45)
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 60, {"color": 0xb89870, "speed": 8, "size": 0.6, "life": 0.7, "up": 2})
		c.sfx("heavy")
		c.shake(0.5)
	var h0: float = Common.TM("ax_stomp")["hits"][0]
	Common.at(c, h0, func(): quake.call(m, 22, r))
	if b == "A": Common.at(c, h0 + 1, func(): quake.call(1.0, 8, r))


static func ax_exec(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 4.2 if W.lv("ax_exec") >= 2 else 3.4
	var b = W.br("ax_exec")
	Common.at(c, Common.T("axe_execute")["hits"][0], func():
		var low := func(t): return 2 if t["hp"] <= t["mhp"] * 0.3 else 1
		if b == "B":
			for t in c.targets(c.me["x"], c.me["z"], 4.5):
				if Common.in_front(c, t, a, 150): c.hit(t, m * 0.7 * low.call(t), {"type": "tskill", "stun": 10})
			c.fx.slash(c.me["x"], c.me["z"], a, 4.5, 150, c.col(), 2)
		else:
			var t = c.nearest(4.2)
			if t != null:
				c.hit(t, m * low.call(t), {"type": "tskill", "stun": 16})
				c.fx.slash(c.me["x"], c.me["z"], a, 4, 75, c.col(), 2)
				if b == "A" and t["hp"] <= 0: c.resetCd("ax_exec")
		c.sfx("impact")
		c.shake(0.4)
	)


static func ax_lust(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("ax_lust") >= 2
	var b = W.br("ax_lust")
	if b == "A": c.pay(0.15)
	var mods := {"atkp": 20 if lv2 else 15, "vamp": 8 if lv2 else 5}
	if b == "A": mods["aspd"] = 20
	c.buff("ax_lust", "ブラッドラスト", 12 if b == "B" else 8, mods, 0xff3a3a)
	c.fx.ringWave(c.me["x"], c.me["z"], 0xff3a3a, 3, 0.4)
	c.fx.parts.burst(c.me["x"], 1.2, c.me["z"], 30, {"color": 0xff3a3a, "speed": 4, "size": 0.5, "life": 0.6, "gravity": -2})
	c.sfx("roar")


static func ax_rush(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 4.0 if W.lv("ax_rush") >= 2 else 3.2
	var b = W.br("ax_rush")
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.buff("ax_rush", "猛進", 0.4, {"dr": 30}, 0xd8b080)
	c.dash(a, 5, 0.28, 0)
	if b == "A": Common.at(c, 0.28, func(): c.line(5, 2, 1.0, {"type": "tskill", "a": a, "sx": sx, "sz": sz, "stun": 2}))
	Common.at(c, Common.T("axe_rush")["hits"][0], func():
		c.arc(3.5, 120, m, {"type": "tskill", "a": a, "tech": "axe_rush", "stun": 10})
		c.fx.slash(c.me["x"], c.me["z"], a, 3.5, 120, c.col(), 2)
		c.sfx("impact")
		c.shake(0.4)
	)
	if b == "B":
		Common.at(c, Common.TM("ax_rush_twin")["hits"][1], func():
			c.circle(c.me["x"], c.me["z"], 3, 2.0, {"type": "tskill", "stun": 6})
			c.fx.ringWave(c.me["x"], c.me["z"], 0xd8b080, 3.6, 0.35)
			c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 40, {"color": 0xb89870, "speed": 7, "size": 0.5, "life": 0.6, "up": 2})
			c.sfx("heavy")
			c.shake(0.45)
		)


## ツリーが足す能力値（ノードの mods 以外。axe.js mods。大斧は何も足さない）
static func mods(_st: Dictionary, _br: Callable, _m: Dictionary) -> void:
	pass


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち axe_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"axe_hook":
			k.at(0, func(): k.slash(1, 4.6, 110))
			k.at(1, func(): k.slash(2.2, 3.5, 120, a, {"tech": null, "stun": 9}))
		"axe_execute":
			k.at(0, func():
				var target = c.nearest(4.2)
				if target != null:
					c.hit(target, 6 if target["hp"] <= target["mhp"] * 0.3 else 3, Common.spread(k.tag, {"stun": 16}))
					c.fx.slash(c.me["x"], c.me["z"], a, 4, 75, c.col(), 2)
					c.sfx("impact")
					c.shake(0.4)
			)
		"axe_return":
			k.at(0, func(): c.proj(Common.spread({"a": a, "mult": 1.7, "speed": 20, "life": 0.4, "rad": 1.3, "shape": "axe"}, k.tag)))
			k.at(1, func():
				var from := Common.sp_off(k.start["x"], k.start["z"], a, 8)
				c.proj(Common.spread({"a": a + PI, "mult": 1.7, "speed": 20, "life": 0.4, "rad": 1.3, "shape": "axe", "sx": from["x"], "sz": from["z"]}, k.tag))
			)
		"axe_blood": k.at(0, func(): k.slash(2.5, 4.2, 230, a, {"healOnHit": 0.10}))
		"axe_rush":
			k.buff(0.4, {"dr": 30})
			c.dash(a, 5, 0.28, 0)
			k.at(0, func(): k.slash(3.2, 3.5, 120, a, {"stun": 10}))


# ---------------------------------------------------------------------------
# 旧来のツリースキル（skills.js TREE_SKILLS のうち大斧の旧スロット warstomp・bloodlust）
# ---------------------------------------------------------------------------
static func warstomp(c) -> void:
	c.later(0.1, func():
		c.circle(c.me["x"], c.me["z"], 5, 1.8, {"type": "tskill", "stun": 22})
		c.fx.ringWave(c.me["x"], c.me["z"], 0xd8b080, 6, 0.45)
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 60, {"color": 0xb89870, "speed": 8, "size": 0.6, "life": 0.7, "up": 2})
		c.sfx("heavy")
		c.shake(0.5)
	)


static func bloodlust(c) -> void:
	c.buff("bloodlust", "ブラッドラスト", 8, {"atkp": 20, "vamp": 8}, 0xff3a3a)
