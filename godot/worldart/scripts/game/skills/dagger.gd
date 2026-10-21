extends RefCounted
## 短剣の技。元は public/js/weapons/dagger.js の heavy（強攻撃）・weaponSkills（武器スキル）・skills（ツリーのQ/Eスキル）・mods、
## と public/js/advanced-skills.js の cast のうち dagger_* の技、public/js/skills.js の旧 TREE_SKILLS のうち poison・smoke。
## 関数の名前は元の名前のまま。メソッドの名前と引数、呼ぶ順番、数式は JavaScript と同じ（c は ctx.gd の文脈）。
## 表の値（cd・motion・duration・技の当たる時刻など）は data/game.json から読む。JavaScript の技の中の数値（3.1・100 など）はそのまま書く。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")

## dagger.js KNIFE_COLOR（投げナイフの色）
const KNIFE_COLOR := 0xcab4ff


# ---------------------------------------------------------------------------
# 強攻撃（dagger.js heavy「瞬影」）。lv は溜め段階 1〜2
# ---------------------------------------------------------------------------
static func heavy(c, lv: int) -> void:
	# 武器ツリー「影歩き」: A は距離と無敵が伸び、B は通り抜けた敵に毒
	var a: float = c.aim()
	var sx: float = c.me["x"]
	var sz: float = c.me["z"]
	var W = c.S()["wt"]
	var far := 1.3 if (W != null and W.br("dk_shadow") == "A") else 1.0
	var ln: float = (7.5 if lv == 2 else 6.0) * far
	c.dash(a, ln, 0.18, 0.5 if far > 1 else 0.3)
	c.later(0.16, func():
		c.line(ln, 2.4, 2.8 if lv == 2 else 1.8, {"type": "heavy", "a": a, "sx": sx, "sz": sz, "poison": 2 if (W != null and W.br("dk_shadow") == "B") else 0})
		c.fx.slash(c.me["x"], c.me["z"], a + PI, 2.5, 160, c.col(), 1.0)
	)


# ---------------------------------------------------------------------------
# 武器スキル（dagger.js weaponSkills）
# ---------------------------------------------------------------------------
static func ws_shadow(c) -> void:
	for i in 5:
		c.later(0.05 + i * 0.09, func():
			c.arc(3.0, 150, 1.0, {"type": "wskill"})
			c.fx.slash(c.me["x"], c.me["z"], c.me["a"] + (c.rnd() - 0.5) * 0.8, 3.0, 120, c.col(), 0.8 + i * 0.12, i % 2 == 1)
			c.sfx("swing")
		)


static func ws_phantom(c) -> void:
	var t = c.nearest(11)
	if t == null:
		c.dash(c.aim(), 5, 0.15, 0.3)
		return
	var back: float = t["a"] + PI
	c.fx.parts.burst(c.me["x"], 1, c.me["z"], 25, {"color": 0x6a4aff, "speed": 4, "size": 0.5, "life": 0.5})
	c.me["x"] = t["x"] + sin(back) * (t["rad"] + 1)
	c.me["z"] = t["z"] + cos(back) * (t["rad"] + 1)
	c.me["a"] = atan2(t["x"] - c.me["x"], t["z"] - c.me["z"])
	c.me["iframe"] = maxf(c.me["iframe"], 0.3)
	c.fx.parts.burst(c.me["x"], 1, c.me["z"], 25, {"color": 0x6a4aff, "speed": 4, "size": 0.5, "life": 0.5})
	c.later(0.08, func():
		c.hit(t, 3.5, {"type": "wskill", "crit": true})
		c.fx.slash(c.me["x"], c.me["z"], c.me["a"], 2.5, 140, c.col(), 1.1)
	)


static func ws_fan(c) -> void:
	var a: float = c.aim()
	for i in range(-3, 4):
		c.arrow({"a": a + i * 0.12, "mult": 0.62, "type": "wskill", "noZone": true, "speed": 36, "rad": 0.55, "color": 0xd8e0f0})


static func ws_venom(c) -> void:
	c.buff("poison", "毒刃", 6, {}, 0x8aff5a)
	for i in 3:
		c.later(i * 0.1, func():
			c.arc(2.9, 140, 0.9, {"type": "wskill"})
			c.fx.slash(c.me["x"], c.me["z"], c.me["a"] + (i - 1) * 0.3, 2.9, 120, 0x8aff5a, 0.9, i % 2 == 1)
			c.sfx("swing")
		)


# ---------------------------------------------------------------------------
# ツリーのスキル（Q/E。dagger.js skills）。c.wt() で振ったレベルと分岐を読む。毒・出血は c.poison / c.bleed で重ねる
# ---------------------------------------------------------------------------
## skills[id].cdOf(W)。短剣には無い
static func cd_of(_id: String, _W):
	return null


## skills[id].motionOf(W)。なければ null
static func motion_of(id: String, W):
	match id:
		"dk_flank": return "dk_flank_twin" if W.br("dk_flank") == "A" else "dagger_flank"
		"dk_bleed": return "dk_bleed_spin" if W.br("dk_bleed") == "B" else "dagger_bleed"
		"dk_pin": return "dk_pin_fan" if W.br("dk_pin") == "A" else "dagger_pin"
	return null


static func dk_flank(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 4.9 if W.lv("dk_flank") >= 2 else 3.9
	var b = W.br("dk_flank")
	c.dash(a + PI / 2, 4, 0.18, 0.25)
	c.me["a"] = a
	Common.at(c, Common.T("dagger_flank")["hits"][0], func():
		var o := {"type": "tskill", "a": a}
		if b == "B": o["crit"] = true   # crit: b === 'B' || undefined（undefined のキーは入れない）
		c.arc(3.1, 100, m, o)
		c.fx.slash(c.me["x"], c.me["z"], a, 3.1, 100, c.col(), 1.15)
		c.sfx("swing")
	)
	if b == "A":
		Common.at(c, Common.TM("dk_flank_twin")["hits"][1] - 0.16, func():
			c.dash(a - PI / 2, 4, 0.18, 0.25)
			c.me["a"] = a
			Common.at(c, 0.16, func():
				c.arc(3.1, 100, 1.5, {"type": "tskill", "a": a})
				c.fx.slash(c.me["x"], c.me["z"], a, 3.1, 100, c.col(), 1.15, true)
				c.sfx("swing")
			)
		)


static func dk_vital(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("dk_vital") >= 2
	var b = W.br("dk_vital")
	var a: float = c.aim()
	Common.at(c, Common.T("dagger_vital")["hits"][0], func():
		var t = c.nearest(3.5)
		if t == null: return
		var low: bool = t["hp"] <= t["mhp"] * 0.5
		c.hit(t, (6.8 if lv2 else 5.4) if low else (3.6 if lv2 else 2.8), {"type": "tskill"})
		c.fx.slash(t["x"], t["z"], a, 1.4, 60, c.col(), 0.8)
		if b == "B": c.bleed(t, 0.4)
		if b == "A" and t["hp"] <= 0: c.resetCd("dk_vital")
	)


static func dk_bleed(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("dk_bleed") >= 2
	var b = W.br("dk_bleed")
	var a: float = c.aim()
	var hits: Array = Common.T("dagger_bleed")["hits"]
	for i in hits.size():
		Common.at(c, hits[i], func():
			for t in c.targets(c.me["x"], c.me["z"], 3.2 if b == "B" else 2.8):
				var ang := atan2(t["x"] - c.me["x"], t["z"] - c.me["z"])
				if b != "B" and absf(atan2(sin(ang - a), cos(ang - a))) > 1.3: continue
				c.hit(t, 1.9 if lv2 else 1.5, {"type": "tskill"})
				if i == 0: c.bleed(t, 0.6 if lv2 else 0.45, b == "A")
			c.fx.slash(c.me["x"], c.me["z"], a + (-0.3 if i == 1 else 0.3), 3.2 if b == "B" else 2.8, 360 if b == "B" else 150, 0xff7283, 0.9, i == 1)
			c.sfx("swing")
		)


static func dk_poison(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("dk_poison") >= 2
	c.buff("dk_poison", "ポイズン・エッジ", 10 if lv2 else 8, {}, 0x8aff5a)
	if W.br("dk_poison") == "B":
		for t in c.targets(c.me["x"], c.me["z"], 4.5): c.poison(t, 3)
		c.fx.ringWave(c.me["x"], c.me["z"], 0x8aff5a, 4.5, 0.5)
		c.fx.parts.burst(c.me["x"], 0.8, c.me["z"], 50, {"color": 0x8aff5a, "speed": 5, "size": 0.8, "life": 0.9, "gravity": 0.5})


static func dk_smoke(c) -> void:
	var W = c.wt()
	var lv2: bool = W.lv("dk_smoke") >= 2
	c.fx.parts.burst(c.me["x"], 0.8, c.me["z"], 50, {"color": 0x8a8a9a, "speed": 4, "size": 0.9, "life": 1.0, "gravity": 0.5})
	c.dash(c.aim() + PI, 5, 0.2, 1.0)
	c.ambush(4 if lv2 else 3)
	if W.br("dk_smoke") == "A": c.buff("dk_smokeA", "影走り", 3, {"move": 40}, 0x9a9aaa)


static func dk_pin(c) -> void:
	var W = c.wt()
	var a: float = c.aim()
	var m := 3.4 if W.lv("dk_pin") >= 2 else 2.6
	var b = W.br("dk_pin")
	Common.at(c, Common.T("dagger_pin")["hits"][0], func():
		var spread := [-0.25, 0, 0.25] if b == "A" else [0]
		for d in spread:
			c.arrow({"a": a + d, "mult": m * (0.7 if b == "A" else 1), "type": "tskill", "tech": "dagger_pin", "noZone": true, "speed": 38, "color": KNIFE_COLOR, "poison": 3 if b == "B" else 0})
	)


## ツリーが足す能力値（ノードの mods 以外。dagger.js mods）
static func mods(_st: Dictionary, br: Callable, m: Dictionary) -> void:
	if br.call("dk_agile") == "B": m["move"] = m.get("move", 0.0) + 10
	if br.call("dk_vitalp") == "A": m["crit"] = m.get("crit", 0.0) + 8


# ---------------------------------------------------------------------------
# Q/E の「技」（advanced-skills.js の cast のうち dagger_*）。t は game.json の techniques[id]
# ---------------------------------------------------------------------------
static func tech(c, t: Dictionary) -> void:
	var k := Common.Cast.new(c, t)
	var a := k.a
	match t["id"]:
		"dagger_flank":
			c.dash(a + PI / 2, 4, 0.18, 0.25)
			c.me["a"] = a
			k.at(0, func(): k.slash(2.4, 3.1, 100))
		"dagger_vital":
			k.at(0, func():
				var target = c.nearest(3.5)
				if target != null:
					c.hit(target, 3.4 if target["hp"] <= target["mhp"] * 0.5 else 1.8, k.tag)
					c.fx.slash(target["x"], target["z"], a, 1.4, 60, c.col(), 0.8)
			)
		"dagger_bleed":
			var wounded := {}
			for i in t["hits"].size():
				k.at(i, func():
					for target in c.targets(c.me["x"], c.me["z"], 2.8):
						var angle := atan2(target["x"] - c.me["x"], target["z"] - c.me["z"])
						if absf(atan2(sin(angle - a), cos(angle - a))) > 1.3: continue
						c.hit(target, 1, k.tag)
						if not wounded.has(target["id"]):
							wounded[target["id"]] = true
							for kk in range(1, 5):
								k.schedule(kk, func():
									if target["hp"] > 0: c.hit(target, 0.35, {"type": "dot", "noProc": true})
								)
					c.fx.slash(c.me["x"], c.me["z"], a + (-0.3 if i == 1 else 0.3), 2.8, 150, 0xff7283, 0.9, i == 1)
					c.sfx("swing")
				)
		"dagger_pin":
			k.at(0, func(): c.arrow(Common.spread(Common.spread({"a": a, "mult": 1.4}, k.tag), {"noZone": true, "speed": 38, "color": 0xcab4ff})))
		"dagger_quicken": k.at(0, func(): k.buff(5, {"move": 35, "aspd": 25}))


# ---------------------------------------------------------------------------
# 旧来のツリースキル（skills.js TREE_SKILLS のうち短剣の旧スロット poison・smoke）
# ---------------------------------------------------------------------------
static func poison(c) -> void:
	c.buff("poison", "ポイズン・エッジ", 8, {}, 0x8aff5a)


static func smoke(c) -> void:
	c.fx.parts.burst(c.me["x"], 0.8, c.me["z"], 50, {"color": 0x8a8a9a, "speed": 4, "size": 0.9, "life": 1.0, "gravity": 0.5})
	c.dash(c.aim() + PI, 5, 0.2, 1.0)
	c.me["ambush"] = 3
