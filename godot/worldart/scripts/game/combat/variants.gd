extends RefCounted
## スキル変化（武器の特性 sv_*）と称号の補助（G4）。元は public/js/game/variants.js
## （tf・indoorNow・weatherNow・titleMove・titleAspd・titleDmg・desperate・variantParams・variantCtx・castWeaponSkill・onVariantHit・galeAt・holyAt・meteorsAt）。
## スキル変化は武器の特性で、武器スキルの性質を変える（二連・巨大化・迅速・爆炎・雷鳴・吸命・瞬身・崩撃・氷結・旋風・剛撃・聖光・猛毒・流星・疾駆・守護）。
## 関数は元の名前を snake_case にしたもの。式・順番・乱数を引く順・記録される操作の引数の数は JavaScript と同じ。
## api は combat/api.gd の環境。表（SV）は data/game.json の sv（export_gamedata.mjs が元の JS から書く。関数は t = 0〜8 の配列）、
## 名前・色は skillVariants。手で写さない。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const R = preload("res://scripts/game/rules.gd")


# ---------------------------------------------------------------------------
# 表
# ---------------------------------------------------------------------------
## SV.<名前>(t)（関数の表）
static func sv_f(name: String, t) -> float:
	return float(Common.game()["sv"][name][int(t)])


## SV.<名前>（定数）
static func sv_c(name: String) -> float:
	return float(Common.game()["sv"][name])


## stats.js calcStats の sv: { key, t, ...SKILL_VARIANTS[key] }（名前・アイコン・色。desc の関数は持たない）
static func make_sv(key: String, t) -> Dictionary:
	return R.make_sv(key, t)


# ---------------------------------------------------------------------------
# 称号（variants.js）
# ---------------------------------------------------------------------------
## 屋内（迷宮・ダンジョン）の天候はないものとして扱う
static func weather_now(api) -> bool:
	return api.weather and not Dmg.indoor_now(api)


## 称号による移動速度の上乗せ（%）
static func title_move(api) -> float:
	var me: Dictionary = api.me
	return (15.0 if Dmg.tf(api, "t_delver") and Dmg.indoor_now(api) else 0.0) \
		+ (30.0 if Dmg.tf(api, "t_traveler") and api.now() < Dmg.or_(me.get("travelT"), 0.0) else 0.0) \
		+ (15.0 if Dmg.tf(api, "t_storm") and weather_now(api) else 0.0)


## 称号による攻撃速度の上乗せ（%）
static func title_aspd(api) -> float:
	return 10.0 if Dmg.tf(api, "t_storm") and weather_now(api) else 0.0


## 称号「砂王を屠りし者」: HPが半分以下の間、強い
static func desperate(api) -> bool:
	return Dmg.tf(api, "t_boss3") and float(api.me["hp"]) < float(api.st["mhp"]) * 0.5


# ---------------------------------------------------------------------------
# スキル変化
# ---------------------------------------------------------------------------
## variantParams: 威力・範囲・クールタイムの倍率
static func variant_params(v: Dictionary, second: bool = false) -> Dictionary:
	var t = v["t"]
	var P := {"mult": 1.0, "range": 1.0, "cd": 1.0}
	var key: String = v["key"]
	if key == "sv_giant":
		P["range"] = sv_f("giantRange", t)
		P["mult"] = sv_f("giantMult", t)
		P["cd"] = 1.3
	if key == "sv_rapid":
		P["mult"] = sv_c("rapidMult")
		P["cd"] = maxf(0.2, 1.0 - sv_f("rapidCd", t))
	if key == "sv_heavy":
		P["mult"] = sv_f("heavyMult", t)
		P["cd"] = 1.8
	if second: P["mult"] = float(P["mult"]) * sv_f("twinMult", t)   # 二連の2回目
	return P


## 集合 cast.hitSet に id を入れる（JavaScript の Set.add。順番は記録に出ないよう昇順に保つ）
static func hit_set_add(cast: Dictionary, id) -> void:
	var arr: Array = cast["hitSet"]
	if not arr.has(id):
		arr.append(id)
		arr.sort()


## スキルに渡すコンテキストを包んで、威力・範囲・色・当たったときの効果を差し込む（variantCtx）
static func variant_ctx(api, v: Dictionary, second: bool = false):
	return VCtx.new(api, v, variant_params(v, second), {"left": sv_f("stormChains", v["t"]), "hitSet": [], "exploded": false, "quakeT": 0.0})


## 包んだコンテキスト。JavaScript の Object.create(rules.combat) にあたる（読む・呼ぶものは元の api にそのまま渡す）。
## 範囲・威力を掛けるのは arc・line・circle・proj・arrow・hit。色は v.color ?? 元の色。当たりには sv と cast（雷鳴の連鎖・爆炎の爆発の印）を付ける
class VCtx extends RefCounted:
	var p            # 元のコンテキスト（api）
	var v: Dictionary
	var P: Dictionary
	var cast: Dictionary
	var me: Dictionary
	var fx

	func _init(api, sv: Dictionary, params: Dictionary, cast_: Dictionary) -> void:
		p = api
		v = sv
		P = params
		cast = cast_
		me = api.me
		fx = VFx.new(self)

	## tag(o): { ...o, sv: v, cast }
	func tag(o = null) -> Dictionary:
		var d: Dictionary = o.duplicate() if o is Dictionary else {}
		d["sv"] = v
		d["cast"] = cast
		return d

	func _v_color():
		return v.get("color")

	# 読む・呼ぶもの（元の api へ）
	func col():
		var c = v.get("color")
		return c if c != null else p.col()
	func aim() -> float: return p.aim()
	func wt(): return p.wt()
	func S() -> Dictionary: return p.S()
	func point() -> Dictionary: return p.point()
	func targets(x = null, z = null, r = null) -> Array: return p.targets(x, z, r)
	func nearest(r = null): return p.nearest(r)
	func area() -> String: return p.area()
	func range(): return p.range()
	func zone() -> Array: return p.zone()
	func reach(normal = null): return p.reach(normal)
	func now() -> float: return p.now()
	func rnd(a: float = 0.0, b: float = 1.0) -> float: return p.rnd(a, b)
	func later(sec: float, fn: Callable) -> void: p.later(sec, fn)
	func dash(a, dist, dur, iframe = null): return p.dash(a, dist, dur, iframe)
	func sfx(name, opt = null): return p.sfx(name, opt)
	func text(str, cls = null): return p.text(str, cls)
	func shake(x): return p.shake(x)
	func buff(id, label, sec, mods, color): return p.buff(id, label, sec, mods, color)
	func heal(frac): return p.heal(frac)
	func resetCd(p1 = null, p2 = null): return p.resetCd(p1, p2)
	func taunt(r = null): return p.taunt(r)
	func primeCharge(x = null): return p.primeCharge(x)
	func parry(sec = null, pct = null): return p.parry(sec, pct)
	func poison(p1 = null, p2 = null): return p.poison(p1, p2)
	func bleed(p1 = null, p2 = null, p3 = null): return p.bleed(p1, p2, p3)
	func ambush(p1 = null): return p.ambush(p1)
	func pay(p1 = null, p2 = null): return p.pay(p1, p2)
	func trap(p1 = null, p2 = null, p3 = null): return p.trap(p1, p2, p3)

	# 威力・範囲を掛けて当てる
	func hit(t, mult, o = null): return p.hit(t, float(mult) * float(P["mult"]), tag(o))
	func arc(r, deg, mult, o = null): return p.arc(float(r) * float(P["range"]), deg, float(mult) * float(P["mult"]), tag(o))
	func line(length, w, mult, o = null): return p.line(float(length) * float(P["range"]), float(w) * float(P["range"]), float(mult) * float(P["mult"]), tag(o))
	func circle(x, z, r, mult, o = null): return p.circle(x, z, float(r) * float(P["range"]), float(mult) * float(P["mult"]), tag(o))

	func proj(o = null):
		var src: Dictionary = o if o is Dictionary else {}
		var d := tag(src)
		d["mult"] = (float(src["mult"]) if src.get("mult") != null else 1.4) * float(P["mult"])
		d["rad"] = (float(src["rad"]) if src.get("rad") != null else 1.8) * float(P["range"])
		d["life"] = (float(src["life"]) if src.get("life") != null else 0.7) * float(P["range"])
		var c = v.get("color") if v.get("color") != null else src.get("color")
		if c != null: d["color"] = c
		else: d.erase("color")
		return p.proj(d)

	func arrow(o = null):
		var src: Dictionary = o if o is Dictionary else {}
		var d := tag(src)
		d["mult"] = (float(src["mult"]) if src.get("mult") != null else 1.0) * float(P["mult"])
		d["rad"] = (float(src["rad"]) if src.get("rad") != null else 0.7) * float(P["range"])
		var c = v.get("color") if v.get("color") != null else src.get("color")
		if c != null: d["color"] = c
		else: d.erase("color")
		return p.arrow(d)


## 見た目も大きさと色を合わせる（c.fx）
class VFx extends RefCounted:
	var c
	var parts

	func _init(vc) -> void:
		c = vc
		parts = vc.p.fx.parts

	func slash(x, z, a, r, deg, color, w = null, flip = null):
		var col = c.v.get("color") if c.v.get("color") != null else color
		return c.p.fx.slash(x, z, a, float(r) * float(c.P["range"]), deg, col, w, flip)

	func ringWave(x, z, color, r, t, p6 = null, p7 = null):
		var col = c.v.get("color") if c.v.get("color") != null else color
		return c.p.fx.ringWave(x, z, col, float(r) * float(c.P["range"]), t, p6, p7)

	func lightning(x = null, z = null, p3 = null, p4 = null): return c.p.fx.lightning(x, z, p3, p4)
	func flash(x = null, y = null, z = null, color = null, p5 = null, p6 = null, p7 = null): return c.p.fx.flash(x, y, z, color, p5, p6, p7)
	func beam(x = null, z = null, color = null, p4 = null, p5 = null, p6 = null): return c.p.fx.beam(x, z, color, p4, p5, p6)


## castWeaponSkill: 武器スキルを出す。スキル変化があれば包んだコンテキストで、なければそのまま。run は技の関数 run(c)
static func cast_weapon_skill(api, run: Callable) -> void:
	var me: Dictionary = api.me
	var v = api.st.get("sv")
	if v == null:
		run.call(api)
		return
	var go := func():
		run.call(variant_ctx(api, v))
		if v["key"] == "sv_twin":
			api.later(0.42, func():
				if not WFX.truthy(me.get("dead")):
					me["a"] = api.aim_angle()
					run.call(variant_ctx(api, v, true))
					api.fx.ringWave(me["x"], me["z"], 0xffffff, 2.5, 0.25))
	if v["key"] == "sv_blink":
		# 瞬身: 狙った方向へ一瞬で移動してから発動
		var a: float = api.aim_angle()
		var d: float = sv_f("blinkDist", v["t"])
		api.fx.parts.burst(me["x"], 1, me["z"], 25, {"color": 0x9affff, "speed": 4, "size": 0.5, "life": 0.4})
		api.dash(a, d, 0.1, 0.45)
		api.later(0.12, func():
			api.fx.parts.burst(me["x"], 1, me["z"], 25, {"color": 0x9affff, "speed": 4, "size": 0.5, "life": 0.4})
			go.call())
	else:
		go.call()
	if v["key"] == "sv_gale": gale_at(api, api.aim_point(), v)
	if v["key"] == "sv_holy": holy_at(api, api.aim_point(), v)
	if v["key"] == "sv_meteor": meteors_at(api, api.aim_point(), v)
	if v["key"] == "sv_haste": api.add_buff("sv_haste", "疾駆", sv_c("hasteSec"), {"move": sv_f("haste", v["t"]), "aspd": sv_f("haste", v["t"])}, 0x9affc8)
	if v["key"] == "sv_ward":
		api.add_buff("sv_ward", "守護", sv_c("wardSec"), {"dr": sv_f("ward", v["t"])}, 0xbfe0ff)
		api.fx.ringWave(me["x"], me["z"], 0xbfe0ff, 2.4, 0.4)
	if v["key"] == "sv_heavy":
		api.add_shake(0.25)
		api.fx.parts.burst(me["x"], 1, me["z"], 30, {"color": 0xff5040, "speed": 7, "size": 0.6, "life": 0.4})
	if WFX.truthy(v.get("color")): api.fx.flash(me["x"], 1.5, me["z"], v["color"], 30, 0.3)


## onVariantHit: スキル変化の付いた攻撃が敵に当たった。dmg: 与えたダメージ、o: 攻撃のオプション（sv・cast・type）
static func on_variant_hit(api, mb: Dictionary, dmg: float, o: Dictionary) -> void:
	var v: Dictionary = o["sv"]
	var c: Dictionary = o["cast"]
	var key: String = v["key"]
	if key == "sv_blaze":
		mb["burnUntil"] = api.now() + 3
		mb["burnPow"] = sv_f("blazeDot", v["t"])
		if not WFX.truthy(c.get("exploded")):
			c["exploded"] = true
			api.fx.parts.burst(mb["x"], 1, mb["z"], 50, {"color": 0xff7a20, "speed": 8, "size": 0.7, "life": 0.6, "gravity": -2})
			api.fx.ringWave(mb["x"], mb["z"], 0xff6a20, 3, 0.35)
			api.fx.flash(mb["x"], 1.5, mb["z"], 0xff6a20, 40, 0.3)
			api.sfx("flame")
			api.add_shake(0.2)
			api.later(0.05, func(): api.circle(mb["x"], mb["z"], 2.6, sv_c("blazeBoom"), {"type": "dot", "noProc": true}))
	if key == "sv_storm" and float(c["left"]) > 0.0:
		hit_set_add(c, mb["id"])
		var best = null
		var bd := 7.0
		for m2 in api.mobs.values():
			if c["hitSet"].has(m2["id"]) or is_same(m2, mb): continue
			var d := sqrt(pow(float(m2["x"]) - float(mb["x"]), 2) + pow(float(m2["z"]) - float(mb["z"]), 2))
			if d < bd:
				bd = d
				best = m2
		if best != null:
			c["left"] = float(c["left"]) - 1.0
			hit_set_add(c, best["id"])
			var from: Dictionary = mb
			var to: Dictionary = best
			var pow_: float = sv_f("stormMult", v["t"])
			api.later(0.08, func():
				api.fx.lightning(to["x"], to["z"], 0xffe040)
				for k in 9:
					api.fx.parts.emit(float(from["x"]) + (float(to["x"]) - float(from["x"])) * k / 8.0, 1.3, float(from["z"]) + (float(to["z"]) - float(from["z"])) * k / 8.0, {"color": 0xfff080, "size": 0.5, "life": 0.25, "speed": 1, "gravity": 0})
				api.sfx("thunder")
				Dmg.deal_damage(api, to, pow_, {"type": "wskill", "noProc": true, "sv": v, "cast": c}))
	if key == "sv_drain": api.heal_player(dmg * sv_f("drain", v["t"]) * float(Common.game()["balance"]["lifestealEfficiency"]), true)
	if key == "sv_venom" and o.get("type") != "dot":
		mb["poisonUntil"] = api.now() + sv_c("venomSec")
		mb["poisonPow"] = sv_f("venomDot", v["t"])
		api.fx.parts.burst(mb["x"], 1.2, mb["z"], 14, {"color": 0x8aff5a, "speed": 3, "size": 0.45, "life": 0.6, "gravity": -1})
	if key == "sv_quake" and api.now() - float(c["quakeT"]) > 0.2:
		c["quakeT"] = api.now()
		api.fx.ringWave(mb["x"], mb["z"], 0xd8b080, 3.5, 0.35)
		api.fx.parts.burst(mb["x"], 0.3, mb["z"], 20, {"color": 0xb89870, "speed": 6, "size": 0.6, "life": 0.5, "up": 2})
		api.add_shake(0.15)
	# 氷結: 当たった敵が凍り、1秒後に砕けて周りにも当たる（1回の発動で敵ごとに1回）
	if key == "sv_frost" and not c["hitSet"].has(mb["id"]) and o.get("type") != "dot":
		hit_set_add(c, mb["id"])
		var x: float = mb["x"]
		var z: float = mb["z"]
		api.fx.parts.burst(x, 1, z, 16, {"color": 0xbfefff, "speed": 2, "size": 0.5, "life": 1, "gravity": 0})
		api.fx.ringWave(x, z, 0x80d8ff, 1.6, 0.9, 0.2, 0.4)
		api.later(1.0, func():
			api.fx.parts.burst(x, 1, z, 40, {"color": 0xd8f6ff, "speed": 8, "size": 0.55, "life": 0.5, "gravity": 6})
			api.fx.ringWave(x, z, 0x80d8ff, 3.2, 0.3)
			api.fx.flash(x, 1.5, z, 0x80d8ff, 30, 0.25)
			api.sfx("hit", {"crit": true})
			api.circle(x, z, 3, sv_f("frost", v["t"]), {"type": "wskill", "noProc": true}))


## 旋風: 狙った場所に竜巻を残す
static func gale_at(api, p: Dictionary, v: Dictionary) -> void:
	var life: float = sv_f("galeLife", v["t"])
	var pw: float = sv_f("galeMult", v["t"])
	api.fx.ringWave(p["x"], p["z"], 0x8affb0, 3, 0.4)
	api.sfx("wave")
	var k := 0
	while k * 0.1 < life:
		var kk := k
		api.later(kk * 0.1, func():
			for j in 4:
				var a: float = kk * 0.9 + j * PI / 2.0
				var h: float = (j + (kk % 3)) * 0.8
				var r: float = 0.6 + h * 0.35
				api.fx.parts.emit(float(p["x"]) + sin(a) * r, h, float(p["z"]) + cos(a) * r, {"color": 0x8affb0 if j % 2 == 1 else 0xe0fff0, "size": 0.45, "life": 0.35, "speed": 1, "gravity": -2})
			if kk % 4 == 0: api.circle(p["x"], p["z"], 2.6, pw, {"type": "wskill", "noProc": true}))
		k += 1


## 聖光: 少し遅れて光の柱が落ちる
static func holy_at(api, p: Dictionary, v: Dictionary) -> void:
	api.fx.ringWave(p["x"], p["z"], 0xfff0a0, 2.8, 0.6, 0.15, 0.3)
	api.later(0.6, func():
		api.fx.beam(p["x"], p["z"], 0xfff0a0, 16, 1.4, 0.45)
		api.fx.flash(p["x"], 3, p["z"], 0xfff0a0, 60, 0.4, 16)
		api.fx.parts.burst(p["x"], 0.5, p["z"], 50, {"color": 0xfff6c0, "speed": 6, "size": 0.6, "life": 0.6, "gravity": -4})
		api.sfx("thunder")
		api.add_shake(0.2)
		api.circle(p["x"], p["z"], 3, sv_f("holyMult", v["t"]), {"type": "wskill", "noProc": true})
		api.heal_player(float(api.st["mhp"]) * sv_f("holyHeal", v["t"]) / 100.0, true))


## 流星: 狙った場所の周りに、少しずつずれて流星が降る
static func meteors_at(api, p: Dictionary, v: Dictionary) -> void:
	var n := int(sv_f("meteorCount", v["t"]))
	var pw: float = sv_f("meteorMult", v["t"])
	for i in n:
		var a: float = api.random() * PI * 2.0
		var r: float = 0.0 if i == 0 else 1.5 + api.random() * 2.0
		var x: float = float(p["x"]) + sin(a) * r
		var z: float = float(p["z"]) + cos(a) * r
		var ii := i
		api.later(0.25 + i * 0.18, func():
			api.fx.ringWave(x, z, 0xffa060, 2.2, 0.25, 0.1, 0.2)
			api.fx.beam(x, z, 0xffa060, 10, 0.5, 0.25)
			api.fx.parts.burst(x, 0.4, z, 30, {"color": 0xffd080 if ii % 2 == 1 else 0xff7a30, "speed": 7, "size": 0.55, "life": 0.5, "up": 2})
			api.sfx("impact")
			api.add_shake(0.12)
			api.circle(x, z, 2.2, pw, {"type": "wskill", "noProc": true}))
