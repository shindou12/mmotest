extends RefCounted
## 弓の技。元は public/js/weapons/bow.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## public/js/advanced-skills.js の cast のうち bow_* の技、public/js/skills.js の旧来のツリースキル（backshot・focus）。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 矢は c.arrow（ctx.gd）。ゲームでは skills/game_ctx.gd の strike_arrow が飛ばし、update_projs が当てる。
## 表の値（cd・motion・duration・技の当たる時刻など）は data/game.json から読む。JavaScript の技の中の数値はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")


# ---------------------------------------------------------------------------
# 強攻撃（bow.js heavy）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	# 射程は離したときの円の大きさ（c.range()）。最大射程まで引くと最大の溜め
	# 武器ツリー: 狙撃手は最大溜めが必ず会心 / 重矢は矢が太い
	var W = c.S()["wt"]
	var snipe: bool = lv == 2 and W != null and W.ks1 == "bw_sniper"
	var fat := 1.5 if (W != null and W.br("bw_draw") == "B") else 1.0
	var o := {"a": c.aim(), "mult": 2.6 if lv == 2 else 1.6, "type": "heavy", "pierce": true, "speed": 55, "rad": (1.2 if lv == 2 else 0.8) * fat,
		"big": true, "range": c.range(), "snipe": snipe, "full": lv == 2}
	if snipe: o["crit"] = true   # crit: snipe || undefined
	c.arrow(o)


# ---------------------------------------------------------------------------
# 武器スキル（bow.js weaponSkills）
# ---------------------------------------------------------------------------
static func ws_multishot(c) -> void:
	var a: float = c.aim()
	for i in range(-2, 3): c.arrow({"a": a + i * 0.14, "mult": 0.75, "type": "wskill"})


static func ws_arrowrain(c) -> void:
	var p: Dictionary = c.point()
	for i in 8:
		c.later(0.15 + i * 0.07, func():
			var x: float = p["x"] + c.rnd(-0.5, 0.5) * 4
			var z: float = p["z"] + c.rnd(-0.5, 0.5) * 4
			c.circle(x, z, 1.6, 0.42, {"type": "wskill", "stun": 0.5})
			c.fx.parts.burst(x, 0.3, z, 8, {"color": 0xd8e8ff, "speed": 3, "size": 0.35, "life": 0.3})
		)
	c.fx.ringWave(p["x"], p["z"], 0xd8e8ff, 3.5, 0.6)


static func ws_snipe(c) -> void:
	var a: float = c.aim()
	c.fx.parts.burst(c.me["x"], 1.3, c.me["z"], 16, {"color": c.col(), "speed": 2, "size": 0.4, "life": 0.35, "gravity": 0})
	c.later(0.3, func(): c.arrow({"a": a, "mult": 3.0, "type": "wskill", "pierce": true, "noZone": true, "speed": 75, "big": true, "rad": 0.9}))


static func ws_blast(c) -> void:
	var a: float = c.aim()
	var p: Dictionary = c.point()
	var d := minf(16, sqrt(pow(p["x"] - c.me["x"], 2) + pow(p["z"] - c.me["z"], 2)))
	var x: float = c.me["x"] + sin(a) * d
	var z: float = c.me["z"] + cos(a) * d
	c.arrow({"a": a, "mult": 0.5, "type": "wskill", "noZone": true, "speed": 40})
	c.later(d / 40 + 0.05, func():
		c.circle(x, z, 3.4, 2.2, {"type": "wskill", "stun": 3})
		c.fx.ringWave(x, z, 0xffa040, 3.8, 0.4)
		c.fx.parts.burst(x, 0.8, z, 60, {"color": 0xffa040, "speed": 9, "size": 0.7, "life": 0.6, "gravity": -2})
		c.shake(0.35)
		c.sfx("impact")
	)


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。bow.js skills）。c.wt() で振ったレベルと分岐を読む
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。弓には無い
static func cd_of(_id: String, _W):
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"bw_double": return "bw_double_tri" if W.br("bw_double") == "A" else "bow_double"
		"bw_chime": return "bw_chime_leap" if W.br("bw_chime") == "B" else "bow_chime"
		"bw_side": return "bw_side_tri" if W.br("bw_side") == "A" else "bow_side"
	return null


static func bw_double(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.15 if W.lv("bw_double") >= 2 else 0.9
	var b = W.br("bw_double")
	var H: Array = (Common.TM("bw_double_tri") if b == "A" else Common.T("bow_double"))["hits"]
	Common.at(c, H[0], func(): c.arrow({"a": a, "mult": m, "type": "tskill"}))
	Common.at(c, H[1], func(): c.arrow({"a": a, "mult": m * 2, "type": "tskill", "big": true, "pierce": b == "B"}))
	if b == "A": Common.at(c, H[2], func(): c.arrow({"a": a, "mult": 1.2, "type": "tskill"}))


static func bw_tether(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 2.1 if W.lv("bw_tether") >= 2 else 1.6
	var b = W.br("bw_tether")
	Common.at(c, Common.T("bow_tether")["hits"][0], func():
		var on_hit = null
		if b != null:
			on_hit = func(mb):
				if b == "A":
					c.circle(mb["x"], mb["z"], 3, m * 0.5, {"type": "tskill", "tech": "bow_tether", "noProc": true, "skip": mb})
					c.fx.ringWave(mb["x"], mb["z"], 0x85d9ff, 3.2, 0.35)
				if b == "B": c.buff("bw_mark", "狙い印", 5, {"dmgp": 15}, 0xffd84a)
		c.arrow({"a": a, "mult": m, "type": "tskill", "tech": "bow_tether", "color": 0x85d9ff, "onHit": on_hit})
	)


static func bw_back(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.25 if W.lv("bw_back") >= 2 else 1.0
	var b = W.br("bw_back")
	c.dash(a + PI, 5, 0.22, 0.3)
	c.me["a"] = a
	var spread := [-0.24, -0.12, 0, 0.12, 0.24] if b == "A" else [-0.1, 0, 0.1]
	Common.at(c, Common.TM("bw_back")["hits"][0], func():
		for d in spread: c.arrow({"a": a + d, "mult": m * (0.8 if b == "A" else 1), "type": "tskill"})
	)
	if b == "B": c.buff("bw_shadow", "影走り", 2.2, {"chargeRate": 100}, 0x9ae8ff)


static func bw_trap(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.3 if W.lv("bw_trap") >= 2 else 2.6
	var b = W.br("bw_trap")
	var p: Dictionary = c.point()
	var d := minf(8, sqrt(pow(p["x"] - c.me["x"], 2) + pow(p["z"] - c.me["z"], 2)))
	var spot: Dictionary = Common.sp_off(c.me["x"], c.me["z"], a, d)
	var spots := [spot]
	if b == "A": spots = [Common.sp_off(spot["x"], spot["z"], a + PI / 2, 2.2), spot, Common.sp_off(spot["x"], spot["z"], a - PI / 2, 2.2)]
	Common.at(c, Common.T("bow_trap")["hits"][0], func():
		for q in spots:
			c.trap(q["x"], q["z"], {"mult": m * (0.6 if b == "A" else 1), "r": 2.7 if b == "B" else 1.8, "stun": 16 if b == "B" else 3, "life": 5, "arm": 0.2, "color": 0x85d9ff})
	)


static func bw_chime(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.8 if W.lv("bw_chime") >= 2 else 1.4
	var b = W.br("bw_chime")
	var ring := func(mult):
		c.circle(c.me["x"], c.me["z"], 3, mult, {"type": "tskill", "tech": "bow_chime"})
		c.fx.ringWave(c.me["x"], c.me["z"], 0x85d9ff, 3.2, 0.3)
		c.sfx("wave")
	var h0: float = Common.T("bow_chime")["hits"][0]
	Common.at(c, h0, func(): ring.call(m))
	if b == "A": Common.at(c, h0 + 0.6, func(): ring.call(1.0))
	if b == "B":
		Common.at(c, h0 + 0.05, func():
			c.dash(a + PI, 4, 0.22, 0.35)
			c.me["a"] = a
		)


static func bw_side(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 1.5 if W.lv("bw_side") >= 2 else 1.2
	var b = W.br("bw_side")
	c.dash(a - PI / 2, 5.25 if b == "B" else 3.5, 0.22, 0.3)
	c.me["a"] = a
	var H: Array = (Common.TM("bw_side_tri") if b == "A" else Common.T("bow_side"))["hits"]
	var off := [-0.05, 0, 0.05] if b == "A" else [-0.035, 0.035]
	for i in H.size():
		Common.at(c, H[i], func():
			var o := {"a": c.aim() + off[i], "mult": m, "type": "tskill"}
			if b == "B" and i == 0: o["crit"] = true   # crit: (b === 'B' && i === 0) || undefined
			c.arrow(o)
		)


## ツリーが足す能力値（ノードの mods 以外。bow.js mods。弓は何も足さない）
static func mods(_st: Dictionary, _br: Callable, _m: Dictionary) -> void:
	pass


# ---------------------------------------------------------------------------
# 旧来のツリースキル（skills.js TREE_SKILLS のうち弓の旧スロット）
# ---------------------------------------------------------------------------
static func backshot(c) -> void:
	var a: float = c.aim()
	c.dash(a + PI, 5, 0.22, 0.3)
	c.me["a"] = a
	for i in range(-1, 2):
		c.later(0.05, func(): c.arrow({"a": a + i * 0.1, "mult": 1.0, "type": "tskill"}))


static func focus(c) -> void:
	c.buff("focus", "集中", 8, {"chargeRate": 100}, 0x9ae8ff)


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち bow_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
## cast の arrow(mult, angle=a, options={}) = c.arrow({a: angle, mult, ...tag, ...options})
static func _cast_arrow(k, mult: float, angle = null, options: Dictionary = {}) -> void:
	var o := {"a": k.a if angle == null else angle, "mult": mult}
	o.merge(k.tag, true)
	o.merge(options, true)
	k.c.arrow(o)


static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"bow_double":
			k.at(0, func(): _cast_arrow(k, 0.9))
			k.at(1, func(): _cast_arrow(k, 1.8, a, {"big": true}))
		"bow_tether": k.at(0, func(): _cast_arrow(k, 1.6, a, {"color": 0x85d9ff}))
		"bow_side":
			c.dash(a - PI / 2, 3.5, 0.22, 0.3)
			c.me["a"] = a
			k.at(0, func(): _cast_arrow(k, 1.2, a - 0.035))
			k.at(1, func(): _cast_arrow(k, 1.2, a + 0.035))
		"bow_trap":
			var p: Dictionary = c.point()
			var d := minf(8, sqrt(pow(p["x"] - k.start["x"], 2) + pow(p["z"] - k.start["z"], 2)))
			var spot: Dictionary = Common.sp_off(k.start["x"], k.start["z"], a, d)
			var state := {"triggered": false}
			k.at(0, func():
				c.fx.ringWave(spot["x"], spot["z"], 0x85d9ff, 1.8, 5, 0.08, 0.25)
				for n in 20:
					k.schedule(0.2 + n * 0.25, func():
						if state["triggered"] or c.targets(spot["x"], spot["z"], 1.8).is_empty(): return
						state["triggered"] = true
						c.circle(spot["x"], spot["z"], 1.8, 2.6, k.tag)
						c.fx.parts.burst(spot["x"], 0.4, spot["z"], 30, {"color": 0x85d9ff, "speed": 6, "size": 0.4, "life": 0.4, "up": 3})
						c.sfx("hit")
					)
			)
		"bow_chime":
			k.at(0, func():
				c.circle(c.me["x"], c.me["z"], 3, 1.4, k.tag)
				c.fx.ringWave(c.me["x"], c.me["z"], 0x85d9ff, 3, 0.3)
				c.sfx("wave")
			)
