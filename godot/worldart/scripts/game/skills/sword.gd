extends RefCounted
## 片手剣の技。元は public/js/weapons/sword.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## と public/js/advanced-skills.js の cast のうち sword_* の技。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 表の値（cd・motion・duration・技の当たる時刻など）は data/game.json から読む。JavaScript の技の中の数値（3.7・100 など）はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")


# ---------------------------------------------------------------------------
# 強攻撃（sword.js heavy）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	var a: float = c.aim()
	var m := 3.4 if lv == 2 else 2.2
	c.fx.slash(c.me["x"], c.me["z"], a, 3.8, 210, c.col(), 1.0)
	c.later(0.05, func(): c.arc(3.8, 210, m, {"type": "heavy", "a": a}))
	if lv == 2: c.proj({"a": a, "mult": 1.6, "type": "heavy"})


# ---------------------------------------------------------------------------
# 武器スキル（sword.js weaponSkills）。id → 関数は WEAPON_SKILLS
# ---------------------------------------------------------------------------
static func ws_retreat(c) -> void:
	var a: float = c.aim()
	c.later(0.06, func():
		c.fx.slash(c.me["x"], c.me["z"], a, 3.4, 180, c.col(), 1.1)
		c.arc(3.4, 180, 2.0, {"type": "wskill", "a": a})
		c.sfx("swing")
		c.dash(a + PI, 3.5, 0.22, 0.22)
		c.me["a"] = a
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 16, {"color": c.col(), "speed": 3, "size": 0.35, "life": 0.3, "up": 1})
	)


static func ws_vorpal(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.dash(a, 8, 0.2, 0.25)
	c.later(0.12, func():
		c.line(8.5, 2.6, 3.2, {"type": "wskill", "a": a, "sx": sx, "sz": sz})
		var d := 0.0
		while d < 9.0:
			c.fx.parts.emit(sx + sin(a) * d, 1.1, sz + cos(a) * d, {"color": c.col(), "size": 0.6, "life": 0.5, "speed": 1.5, "gravity": 0})
			d += 0.5
	)


static func ws_square(c) -> void:
	var a: float = c.aim()
	for i in 4:
		c.later(i * 0.1, func():
			var aa: float = a + i * PI / 2
			c.arc(3.6, 120, 1.1, {"type": "wskill", "a": aa})
			c.fx.slash(c.me["x"], c.me["z"], aa, 3.6, 120, c.col(), 1.0, i % 2 == 1)
			c.sfx("swing")
		)


static func ws_leap(c) -> void:
	var a: float = c.aim()
	c.dash(a, 6, 0.28, 0.35)
	c.later(0.3, func():
		c.circle(c.me["x"], c.me["z"], 3.2, 3.0, {"type": "wskill"})
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 4, 0.35)
		c.shake(0.3)
	)


static func ws_horizon(c) -> void:
	var a: float = c.aim()
	c.fx.slash(c.me["x"], c.me["z"], a, 3.8, 220, c.col(), 1.2)
	c.later(0.05, func(): c.arc(3.8, 220, 1.4, {"type": "wskill", "a": a}))
	c.later(0.2, func():
		c.fx.slash(c.me["x"], c.me["z"], a, 3.8, 220, c.col(), 1.2, true)
		c.arc(3.8, 220, 1.5, {"type": "wskill", "a": a})
		c.sfx("swing")
	)
	c.sfx("swing")


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。sword.js skills）。c.wt() で振ったレベルと分岐を読む
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。なければ null
static func cd_of(id: String, W):
	if id == "sw_aircut":
		var cd: float = Common.game()["skills"]["tree"]["sw_aircut"]["cd"]
		return cd * 0.85 if W.lv("sw_aircut") >= 2 else cd
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"sw_aircut": return "sw_aircut_fan" if W.br("sw_aircut") == "A" else "sword_aircut"
		"sw_slant": return "sw_slant_spin" if W.br("sw_slant") == "B" else "sw_slant"
		"sw_side": return "sw_side_long" if W.br("sw_side") == "A" else "sword_sideturn"
	return null


static func sw_aircut(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var p := 3.6 if W.lv("sw_aircut") >= 2 else 2.8
	var b = W.br("sw_aircut")
	Common.at(c, Common.TM("sw_aircut_fan")["hits"][0] if b == "A" else Common.T("sword_aircut")["hits"][0], func():
		if b == "A":
			for d in [-0.32, 0, 0.32]: c.proj({"a": a + d, "mult": p * 0.7, "speed": 24, "life": 0.55, "rad": 1, "type": "tskill"})
		elif b == "B": c.proj({"a": a, "mult": p, "speed": 26, "life": 0.85, "rad": 1.6, "type": "tskill"})
		else: c.proj({"a": a, "mult": p, "speed": 24, "life": 0.55, "rad": 1, "type": "tskill"})
		c.fx.slash(c.me["x"], c.me["z"], a, 3, 100, c.col(), 0.9)
	)


static func sw_parry(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("sw_parry") >= 2
	var a: float = c.aim()
	c.parry(0.55 if lv2 else 0.4, 80 if lv2 else 70)
	Common.at(c, Common.T("sword_parry")["hits"][0] + (0.1 if lv2 else 0.0), func():
		c.line(4.3, 1.8, 3.0 if lv2 else 2.2, {"type": "tskill", "a": a})
		var d := 0.7
		while d < 4.3:
			c.fx.parts.emit(c.me["x"] + sin(a) * d, 1.2, c.me["z"] + cos(a) * d, {"color": c.col(), "size": 0.42, "life": 0.25, "speed": 1, "gravity": 0})
			d += 0.5
		c.sfx("swing")
	)


static func sw_slant(c) -> void:
	var W = c.wt()
	var each := 2.6 if W.lv("sw_slant") >= 2 else 2.0
	var b = W.br("sw_slant")
	for i in 3:
		Common.at(c, i * 0.2, func():
			var a: float = c.aim()
			c.dash(a, 3, 0.1, 0.15)
			Common.at(c, 0.08, func():
				c.arc(3.2, 140, each, {"type": "tskill", "a": a})
				c.fx.slash(c.me["x"], c.me["z"], a, 3.2, 140, c.col(), 1.0, i % 2 == 1)
				c.sfx("swing")
				if b == "A": c.proj({"a": a, "mult": 0.6, "speed": 24, "life": 0.45, "rad": 0.9, "type": "tskill"})
			)
		)
	if b == "B":
		Common.at(c, Common.TM("sw_slant_spin")["hits"][3], func():
			c.circle(c.me["x"], c.me["z"], 3.6, 2.0, {"type": "tskill"})
			c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 3.8, 0.35)
			c.sfx("wave")
		)


static func sw_side(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var p := 4.4 if W.lv("sw_side") >= 2 else 3.4
	var b = W.br("sw_side")
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	var side: float = a + PI / 2
	var dist := 6.0 if b == "A" else 3.0
	c.dash(side, dist, 0.3 if b == "A" else 0.22, 0.35 if b == "A" else 0.25)
	c.me["a"] = a
	if b == "A": Common.at(c, 0.15, func(): c.line(dist, 1.8, 1.2, {"type": "tskill", "a": side, "sx": sx, "sz": sz}))
	Common.at(c, Common.TM("sw_side_long")["hits"][0] if b == "A" else Common.T("sword_sideturn")["hits"][0], func():
		if b == "B": c.proj({"a": a, "mult": p, "speed": 24, "life": 0.55, "rad": 1.2, "type": "tskill"})
		else: c.arc(3.7, 150, p, {"type": "tskill", "a": a})
		c.fx.slash(c.me["x"], c.me["z"], a, 3.7, 150, c.col(), 1.15)
		c.sfx("swing")
	)


static func sw_dance(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("sw_dance") >= 2
	Common.at(c, Common.T("sword_dance")["hits"][0], func():
		c.buff("sw_dance", "連撃の構え", 7 if lv2 else 5, {"normp": 40 if lv2 else 30, "aspd": 15}, c.col())
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 2.6, 0.35)
	)


static func sw_brave(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("sw_brave") >= 2
	Common.at(c, Common.TM("sw_brave")["hits"][0], func(): c.buff("sw_brave", "ブレイブハート", 10 if lv2 else 8, {"atkp": 28 if lv2 else 20, "crit": 15}, 0xffb040))


## ツリーが足す能力値（ノードの mods 以外。sword.js mods(st, br, mods)）。br は W.br（Callable）
static func mods(st: Dictionary, br: Callable, m: Dictionary) -> void:
	if st["ks1"] == "sw_mage": m["normp"] = m.get("normp", 0.0) - 10
	if br.call("sw_light") == "B": m["dodgecd"] = m.get("dodgecd", 0.0) + 20


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち sword_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"sword_parry":
			k.buff(0.4, {"dr": 70})
			k.at(0, func(): k.line(2.2, 4.3, 1.8))
		"sword_aircut":
			k.at(0, func():
				c.proj(Common.spread({"a": a, "mult": 1.8, "speed": 24, "life": 0.55, "rad": 1}, k.tag))
				c.fx.slash(c.me["x"], c.me["z"], a, 3, 100, c.col(), 0.9)
			)
		"sword_sideturn":
			c.dash(a + PI / 2, 3, 0.22, 0.25)
			c.me["a"] = a
			k.at(0, func(): k.slash(2.4, 3.7, 150))
		"sword_dance":
			k.at(0, func(): k.buff(5, {"normp": 40, "aspd": 15}))
