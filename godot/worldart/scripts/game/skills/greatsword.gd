extends RefCounted
## 大剣の技。元は public/js/weapons/greatsword.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## と public/js/advanced-skills.js の cast のうち gs_* の技。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 表の値（cd・motion・duration・技の当たる時刻など）は data/game.json から読む。JavaScript の技の中の数値（5.2・0.18 など）はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")

## greatsword.js LIGHT_COLOR（光波の色）
const LIGHT_COLOR := 0xa8e4ff


# ---------------------------------------------------------------------------
# 強攻撃（greatsword.js heavy）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	var a: float = c.aim()
	var d: Array = Common.fwd(a, 2.6)
	var x: float = c.me["x"] + d[0]
	var z: float = c.me["z"] + d[1]
	var r := 3.8 if lv == 2 else 3.0
	var reach := 0.8   # 横幅は r のまま、前へ reach だけ縦に長い
	var m: Array = Common.fwd(a, reach / 2)   # 衝撃の見た目は伸ばした当たりの真ん中に
	var cx: float = x + m[0]
	var cz: float = z + m[1]
	c.fx.slash(c.me["x"], c.me["z"], a, 3.4 + reach, 90, c.col(), 2.2)
	c.later(0.12, func():
		c.circle(x, z, r, 4.6 if lv == 2 else 3.0, {"type": "heavy", "a": a, "reach": reach})
		c.fx.ringWave(cx, cz, c.col(), r + 1, 0.4)
		c.fx.parts.burst(cx, 0.3, cz, 40, {"color": 0xc8b090, "speed": 7, "size": 0.5, "life": 0.6, "up": 2})
		c.shake(0.5 if lv == 2 else 0.3)
		if c.S()["flags"].has("quake"):
			c.later(0.15, func():
				c.circle(x, z, 6.5, 1.5, {"type": "heavy"})
				c.fx.ringWave(x, z, 0xffd27a, 7, 0.5)
			)
	)


# ---------------------------------------------------------------------------
# 武器スキル（greatsword.js weaponSkills）
# ---------------------------------------------------------------------------
static func ws_cyclone(c) -> void:
	for i in 3:
		c.later(0.1 + i * 0.15, func():
			c.arc(4.6, 360, 0.9, {"type": "wskill"})
			c.fx.slash(c.me["x"], c.me["z"], c.me["a"] + i * 2.1, 4.6, 200, c.col(), 1.0, i % 2 == 1)
			c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 4.6, 0.3)
			c.sfx("swing", {"heavy": true})
		)


static func ws_breaker(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	c.shake(0.3)
	for i in 6:
		c.later(0.08 + i * 0.07, func():
			var d: Array = Common.fwd(a, 1.8 + i * 1.7)
			var x: float = sx + d[0]
			var z: float = sz + d[1]
			c.circle(x, z, 1.9, 1.25, {"type": "wskill"})
			c.fx.parts.burst(x, 0.2, z, 18, {"color": 0xb8a080, "speed": 7, "size": 0.6, "life": 0.6, "up": 3})
			c.fx.ringWave(x, z, 0xd8c0a0, 2, 0.25)
		)


static func ws_avalanche(c) -> void:
	var a: float = c.aim()
	c.dash(a, 7, 0.3, 0.35)
	c.later(0.32, func():
		c.circle(c.me["x"], c.me["z"], 3.8, 3.2, {"type": "wskill", "stun": 12})
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 4.5, 0.4)
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 60, {"color": 0xc8b090, "speed": 9, "size": 0.7, "life": 0.7, "up": 3})
		c.shake(0.6)
		c.sfx("impact")
	)


static func ws_meteor(c) -> void:
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	var ds := [3, 5.5, 8]
	for i in ds.size():
		var dd = ds[i]
		c.later(0.1 + i * 0.16, func():
			var f: Array = Common.fwd(a, dd)
			var x: float = sx + f[0]
			var z: float = sz + f[1]
			c.circle(x, z, 2.6, 1.8, {"type": "wskill", "stun": 4})
			c.fx.ringWave(x, z, c.col(), 3, 0.35)
			c.fx.parts.burst(x, 0.3, z, 30, {"color": c.col(), "speed": 7, "size": 0.6, "life": 0.5, "up": 2})
			c.shake(0.3)
			c.sfx("impact")
		)


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。greatsword.js skills）。c.wt() で振ったレベルと分岐を読む
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。大剣には無い
static func cd_of(_id: String, _W):
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"gt_rising": return "gt_rising_twin" if W.br("gt_rising") == "A" else "gs_rising"
		"gt_broad": return "gt_broad_wide" if W.br("gt_broad") == "A" else "gs_broad"
	return null


static func gt_rising(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 5.2 if W.lv("gt_rising") >= 2 else 4.2
	var b = W.br("gt_rising")
	Common.at(c, Common.T("gs_rising")["hits"][0], func(): Common.slash_at(c, a, 3.7, 100, m, {"stun": 36 if b == "B" else 18}))
	if b == "A":
		Common.at(c, Common.TM("gt_rising_twin")["hits"][1], func():
			Common.slash_at(c, a, 3.4, 80, 2.0, {"stun": 5})
			c.shake(0.3)
		)


static func gt_broad(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 5.3 if W.lv("gt_broad") >= 2 else 4.2
	var b = W.br("gt_broad")
	Common.at(c, Common.T("gs_broad")["hits"][0], func():
		if b == "A": Common.slash_at(c, a, 5.6, 300, m, {"stun": 8})
		else: Common.slash_at(c, a, 4.7, 230, m, {"stun": 8})
		if b == "B": c.proj({"a": a, "mult": 1.5, "speed": 22, "life": 0.6, "rad": 1.6, "type": "tskill", "color": LIGHT_COLOR})
	)


static func gt_recoil(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 6.4 if W.lv("gt_recoil") >= 2 else 5.0
	var b = W.br("gt_recoil")
	c.dash(a + PI, 2, 0.18, 0)
	c.me["a"] = a
	Common.at(c, Common.T("gs_recoil")["hits"][0], func():
		if b == "A":
			for d in [-0.18, 0.18]: c.proj({"a": a + d, "mult": m * 0.7, "speed": 21, "life": 0.45, "rad": 1.3, "type": "tskill", "color": LIGHT_COLOR})
		elif b == "B": c.proj({"a": a, "mult": m * 1.15, "speed": 23, "life": 0.65, "rad": 2.1, "type": "tskill", "color": LIGHT_COLOR})
		else: c.proj({"a": a, "mult": m, "speed": 21, "life": 0.42, "rad": 1.3, "type": "tskill", "color": LIGHT_COLOR})
		c.sfx("heavy")
	)


static func gt_guillo(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 8.0 if W.lv("gt_guillo") >= 2 else 6.5
	var b = W.br("gt_guillo")
	Common.at(c, Common.T("gs_guillotine")["hits"][0], func():
		c.line(4.5, 1.8, m, {"type": "tskill", "a": a, "stun": 22, "exec": 2 if b == "A" else 0})
		c.fx.slash(c.me["x"], c.me["z"], a, 4.5, 50, c.col(), 2.2)
		c.shake(0.5)
		c.sfx("impact")
		if b == "B":
			var sx: float = c.me["x"] + sin(a) * 4
			var sz: float = c.me["z"] + cos(a) * 4
			Common.at(c, 0.15, func():
				c.line(6, 2.2, 2.0, {"type": "tskill", "a": a, "sx": sx, "sz": sz, "stun": 4})
				var d := 0.0
				while d < 6.0:
					c.fx.parts.burst(sx + sin(a) * d, 0.3, sz + cos(a) * d, 6, {"color": 0xc8b090, "speed": 5, "size": 0.5, "life": 0.4, "up": 2})
					d += 0.6
			)
	)


static func gt_slam(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 6.5 if W.lv("gt_slam") >= 2 else 5.2
	var b = W.br("gt_slam")
	var r := 7.2 if b == "A" else 4.8
	c.dash(a, 6, 0.35, 0.45)
	Common.at(c, Common.TM("gt_slam")["hits"][0], func():
		c.circle(c.me["x"], c.me["z"], r, m, {"type": "tskill", "stun": 8})
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), r + 1.2, 0.45)
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 60, {"color": 0xc8b090, "speed": 9, "size": 0.6, "life": 0.7, "up": 2})
		c.sfx("heavy")
		c.shake(0.6)
		if b == "B": c.primeCharge(0.5)
	)


static func gt_siege(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("gt_siege") >= 2
	Common.at(c, Common.T("gs_siege")["hits"][0], func():
		c.buff("gt_siege", "破城の構え", 7 if lv2 else 5, {"heavyp": 45 if lv2 else 30, "stunp": 80, "move": -25}, c.col())
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 2.6, 0.35)
	)


## ツリーが足す能力値（ノードの mods 以外。greatsword.js mods。大剣は何も足さない）
static func mods(_st: Dictionary, _br: Callable, _m: Dictionary) -> void:
	pass


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち gs_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"gs_guillotine":
			k.at(0, func():
				k.line(4.8, 4.5, 1.8, a, {"stun": 22})
				c.shake(0.5)
				c.sfx("impact")
			)
		"gs_rising": k.at(0, func(): k.slash(2.6, 3.7, 100, a, {"stun": 18}))
		"gs_broad": k.at(0, func(): k.slash(3, 4.7, 230, a, {"stun": 8}))
		"gs_recoil":
			c.dash(a + PI, 2, 0.18, 0)
			c.me["a"] = a
			k.at(0, func():
				c.proj(Common.spread({"a": a, "mult": 3.8, "speed": 21, "life": 0.42, "rad": 1.3}, k.tag))
				c.sfx("heavy")
			)
		"gs_siege": k.at(0, func(): k.buff(5, {"heavyp": 60, "stunp": 80, "move": -25}))
