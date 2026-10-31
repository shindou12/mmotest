extends SceneTree
## ダメージの式（combat/damage.gd）と武器の効果の差し込み口（combat/weapon_fx.gd・fx_sword.gd・fx_greatsword.gd・fx_dagger.gd・fx_axe.gd）が
## 元の JavaScript と同じ結果になるかの照合（画面なし）。
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/combat_golden.gd
## 期待値は data/combat_golden.json（tools/worldart/godot/golden_combat.mjs が元の JS で書く）:
##   { base: {me}, states: { <id>: { wk, ch, S } }, scenes: [ { suite, name, in, out } ] }
##   in:  state（能力値の状態）・tms（時刻 ms）・rand（Math.random の値の列）・me（base.me への上書き）・mobs・aim・op（deal / stun / hook / ext / entry）
##   out: ret・args（呼んだあとの引数のオブジェクト）・ev（記録だけの操作 [時刻, 名前, 引数]）・net（サーバーへの送信）・
##        me / mobs（場面の前との差）・shake・hitStop・used（使った乱数の数）
## G4: hurt_<武器>（hurt.gd・ガード・回転なぎ払い・毒沼の判定）、variants（variants.gd のスキル変化）、titles（称号の補助）は op.k = "call" で、
##   op.mod（H = hurt.js・IN = input.js・AC = actions.js sweepTick・LP = loop.js hazardAt・V = variants.js）の op.fn を呼ぶ。引数の {$: mob | mob8 | sk} は参照、
##   普通の辞書は写して渡し、呼んだあとの形を args と比べる。場面ごとの能力値の上書き Sov（配列は Set）と sv も入力に持つ。
## suite ごとに「OK n 件」か「NG」（最初の 3 件の名前・どの項目・期待・実際）を出し、全部 OK のときだけ終了コード 0。
##   damage_<武器>（sword・greatsword・dagger・axe・spear・bow）: dealDamage・stunValue（敵・自分・バフ・オプションの組み合わせ）
##   hooks_<武器>: 差し込み口（fxCall・fxSome・fxReduce で呼ぶ効果）・tree-effects の入口・技の文脈に足す道具
## 比べ方は _same: 数は 1e-6 の許容差、配列は中まで、辞書はキーの集合も同じ。
## 環境 Rec は combat/api.gd を土台に、呼ばれた操作を書き留める（元の golden_combat.mjs のダミーと同じ形）。

const TOL := 1e-6
const Api = preload("res://scripts/game/combat/api.gd")
const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const FxSword = preload("res://scripts/game/combat/fx_sword.gd")
const FxGreatsword = preload("res://scripts/game/combat/fx_greatsword.gd")
const FxDagger = preload("res://scripts/game/combat/fx_dagger.gd")
const FxAxe = preload("res://scripts/game/combat/fx_axe.gd")
const FxSpear = preload("res://scripts/game/combat/fx_spear.gd")
const FxBow = preload("res://scripts/game/combat/fx_bow.gd")
const WTree = preload("res://scripts/game/skills/wtree.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Hurt = preload("res://scripts/game/combat/hurt.gd")
const Variants = preload("res://scripts/game/combat/variants.gd")
const SUITES := ["damage_sword", "damage_greatsword", "damage_dagger", "damage_axe", "damage_spear", "damage_bow", "hooks_sword", "hooks_greatsword", "hooks_dagger", "hooks_axe", "hooks_spear", "hooks_bow", "hurt_sword", "hurt_greatsword", "hurt_dagger", "hurt_axe", "hurt_spear", "hurt_bow", "variants", "titles"]


## 呼ばれた操作を書き留める環境（golden_combat.mjs のダミー）
class Rec extends Api:
	var events: Array = []
	var nets: Array = []
	var rand: Array = []
	var used := 0

	func _op(name: String, args: Array):
		events.append([now(), name, _clean(args)])
		return null

	func net_send(msg: Dictionary) -> void:
		nets.append(_clean(msg))

	func random() -> float:
		if used >= rand.size():
			push_error("乱数の列を使い切った")
			return 0.5
		var v: float = rand[used]
		used += 1
		return v

	## 武器の色（元のダミー combatD.col と同じ RARITIES[S.wr].color。文字列）
	func col(): return weapon_color()

	## world.area（照合のダミーのエリア）
	func area() -> String: return "f1_field"

	## handTracker のダミー: 自分の少し横
	func hand_pos(_model) -> Dictionary:
		return {"x": me["x"] + 0.3, "y": 1.1, "z": me["z"] + 0.2}

	## clean: 関数は "fn"、配列・辞書は中まで写す
	func _clean(v):
		if v is Callable: return "fn"
		if v is Array:
			var r := []
			for x in v: r.append(_clean(x))
			return r
		if v is Dictionary:
			var o := {}
			for k in v: o[k] = _clean(v[k])
			return o
		return v


func _same(e, g) -> bool:
	if (e is float or e is int) and (g is float or g is int):
		return absf(float(e) - float(g)) <= TOL
	if e is Array and g is Array:
		if e.size() != g.size(): return false
		for i in e.size():
			if not _same(e[i], g[i]): return false
		return true
	if e is Dictionary and g is Dictionary:
		if e.size() != g.size(): return false
		for k in e:
			if not g.has(k) or not _same(e[k], g[k]): return false
		return true
	return typeof(e) == typeof(g) and e == g


## 値が同じか（差分の検出用。数は ==）
func _eq(a, b) -> bool:
	if (a is float or a is int) and (b is float or b is int): return absf(float(a) - float(b)) <= 1e-9   # sin/cos/atan2 や JSON の読みの最後の桁の違いは同じとみなす（JavaScript 側の diff も同じ）
	if a is Array and b is Array:
		if a.size() != b.size(): return false
		for i in a.size():
			if not _eq(a[i], b[i]): return false
		return true
	if a is Dictionary and b is Dictionary:
		if a.size() != b.size(): return false
		for k in a:
			if not b.has(k) or not _eq(a[k], b[k]): return false
		return true
	return typeof(a) == typeof(b) and a == b


## 場面の前後の差（変わったキーだけ。消えたキーは {"$del": 1}）
func _diff(b: Dictionary, a: Dictionary) -> Dictionary:
	var o := {}
	for k in b:
		if not a.has(k): o[k] = {"$del": 1}
		elif not _eq(b[k], a[k]): o[k] = a[k]
	for k in a:
		if not b.has(k): o[k] = a[k]
	return o


func _state_s(st: Dictionary) -> Dictionary:
	var S := {}
	for k in st["S"]:
		var v = st["S"][k]
		if v is Array:
			var d := {}
			for x in v: d[x] = true
			S[k] = d
		else:
			S[k] = v
	S["W"] = Common.game()["weapons"][st["wk"]]
	S["wt"] = WTree.effects(st["ch"].duplicate(true), st["wk"])
	return S


## 場面ごとの能力値の上書き Sov（配列は Set）と sv（スキル変化。null もある）
func _apply_sov(S: Dictionary, inp: Dictionary) -> void:
	if inp.has("Sov"):
		for k in inp["Sov"]:
			var v = inp["Sov"][k]
			if v is Array:
				var d := {}
				for x in v: d[x] = true
				S[k] = d
			else:
				S[k] = v
	if inp.has("sv"): S["sv"] = inp["sv"]


## 照合の技（golden_combat.mjs の TEST_SKILLS と同じ内容）。c は元のコンテキストか、スキル変化で包んだもの
var cur_api = null


func _skill_a(c) -> void:
	var m: Dictionary = c.me
	c.arc(4, 120, 1.5, {"type": "wskill", "a": 0.3})
	c.fx.slash(m["x"], m["z"], 0.3, 4, 120, c.col(), 1.0)
	c.line(8, 1.4, 2, {"type": "wskill", "a": 0.3})
	c.circle(m["x"], m["z"], 3, 1.2, {"type": "wskill"})
	c.sfx("skill")


func _skill_b(c) -> void:
	var m: Dictionary = c.me
	c.proj({"a": 0.5, "mult": 2, "rad": 1.5, "type": "wskill"})
	c.arrow({"a": 0.1, "type": "wskill", "pierce": true})
	c.proj({"a": 0.2, "color": 0x123456, "type": "wskill"})
	c.hit(cur_api.mobs.get(7), 1.5, {"type": "wskill"})
	c.fx.ringWave(m["x"], m["z"], c.col(), 3, 0.3)
	c.later(0.2, func(): c.arc(3, 90, 1, {"type": "wskill", "a": 0.2}))
	c.dash(0.4, 3, 0.1)
	c.arc(2, 60, 1)


## op.k = "call": モジュールの関数を呼ぶ。a は解決した引数、結果は [戻り値] の配列（戻り値なしは空）
func _call(api, op: Dictionary, inp: Dictionary, a: Array) -> Array:
	var fn: String = op["fn"]
	match fn:
		"resolveTele": Hurt.resolve_tele(api, a[0])
		"takeDamage": Hurt.take_damage(api, a[0], a[1], a[2], a[3])
		"hitReaction": Hurt.hit_reaction(api, a[0], a[1], a[2])
		"knockFrom": Hurt.knock_from(api, a[0], a[1], a[2])
		"tryTech": return [Hurt.try_tech(api)]
		"getUp": Hurt.get_up(api)
		"onJustDodge": Hurt.on_just_dodge(api)
		"fall": Hurt.fall(api)
		"revived": Hurt.revived(api, a[0])
		"reviveHit": Hurt.revive_hit(api, a[0], a[1])
		"crawlTick":
			var dx := 0.0
			var dz := 0.0
			var keys: Array = inp.get("keys", [])
			if keys.has("w") or keys.has("arrowup"): dz -= 1.0
			if keys.has("s") or keys.has("arrowdown"): dz += 1.0
			if keys.has("a") or keys.has("arrowleft"): dx -= 1.0
			if keys.has("d") or keys.has("arrowright"): dx += 1.0
			var stick = op.get("stick")
			if stick != null and sqrt(float(stick["x"]) * float(stick["x"]) + float(stick["y"]) * float(stick["y"])) > 0.12:
				dx = stick["x"]
				dz = stick["y"]
			Hurt.crawl_tick(api, a[0], dx, dz)
		"die": Hurt.die(api)
		"startGuard": Hurt.start_guard(api)
		"canGuard": return [Hurt.can_guard(api)]
		"guardUp": return [Hurt.guard_up(api)]
		"guardDamage": return [Hurt.guard_damage(api, a[0], a[1])]
		"guardBreak": Hurt.guard_break(api)
		"guardRegen": Hurt.guard_regen(api, a[0])
		"armCounter": Hurt.arm_counter(api)
		"endGuard": Hurt.end_guard(api, a[0])
		"sweepTick": Hurt.sweep_tick(api, a[0])
		"hazardAt": return [Hurt.hazard_at(api, a[0], a[1])]
		"castWeaponSkill": Variants.cast_weapon_skill(api, a[0])
		"variantParams": return [Variants.variant_params(a[0], a[1])]
		"onVariantHit": Variants.on_variant_hit(api, a[0], a[1], a[2])
		"titleDmg": return [Dmg.title_dmg(api, a[0])]
		"titleMove": return [Variants.title_move(api)]
		"titleAspd": return [Variants.title_aspd(api)]
		"desperate": return [Variants.desperate(api)]
		"weatherNow": return [Variants.weather_now(api)]
		_: push_error("未知の fn " + fn)
	return []


## 1 場面を動かして、期待値と比べる。違えば最初に違う項目の説明、同じなら ""
func _run(api: Rec, base_me: Dictionary, states: Dictionary, sc: Dictionary) -> String:
	var inp: Dictionary = sc["in"]
	var out: Dictionary = sc["out"]
	api.events.clear()
	api.nets.clear()
	api.pending.clear()
	api.shake_v = 0.0
	api.hit_stop = 0.0
	api.aim_v = inp.get("aim", 0.0)
	for k in api.wt_aura_acc: api.wt_aura_acc[k] = 0.0
	api.character_lost = inp.get("lost", false)
	api.shape = "grid" if inp.get("indoor", false) else "open"
	api.rand = inp["rand"]
	api.used = 0
	api.tms = inp["tms"]
	api.st = _state_s(states[inp["state"]])
	_apply_sov(api.st, inp)
	if inp.get("sv") != null:   # S.sv は calcStats が { key, t, ...SKILL_VARIANTS[key] } で作る（名前・色は game.json の skillVariants）
		var made: Dictionary = Variants.make_sv(inp["sv"]["key"], inp["sv"]["t"])
		if not _same(inp["sv"], made): return "sv が元の形と違う: %s / %s" % [JSON.stringify(inp["sv"]), JSON.stringify(made)]
	api.ch = states[inp["state"]]["ch"]
	api.debug = inp.get("debug", false)
	api.weather = inp.get("weather") != null
	api.variants_real = sc["suite"] == "variants"
	api.hazards = []
	if inp.has("area"):
		var ar: Dictionary = Common.game()["areas"][inp["area"]]
		api.shape = ar["shape"]
		api.hazards = ar.get("hazards", [])
	cur_api = api
	var me: Dictionary = base_me.duplicate(true)
	me.merge(inp["me"].duplicate(true), true)
	api.me = me
	api.mobs = {}
	for m in inp["mobs"]: api.mobs[int(m["id"])] = m.duplicate(true)
	var before_me: Dictionary = me.duplicate(true)
	var before_mobs := {}
	for id in api.mobs: before_mobs[id] = api.mobs[id].duplicate(true)

	var op: Dictionary = inp["op"]
	var ret = null
	var args := []
	var mob = api.mobs.get(7)
	match op["k"]:
		"deal":
			var o: Dictionary = op["o"].duplicate(true)
			args.append(o)
			Dmg.deal_damage(api, api.mobs.get(int(op["mob"])), op["mult"], o)
		"stun":
			var o2: Dictionary = op["o"].duplicate(true)
			args.append(o2)
			ret = Dmg.stun_value(api, o2)
		"hook":
			var sx = null
			if op.has("Sx"): sx = op["Sx"].duplicate(true)
			var a := []
			for x in op["args"]:
				if x is Dictionary and x.has("$"):
					match x["$"]:
						"mob": a.append(mob)
						"W": a.append(api.st["wt"])
						"Sx": a.append(sx)
						"weapon": a.append(Common.game()["weapons"][states[inp["state"]]["wk"]])
				elif x is Dictionary:
					var c: Dictionary = x.duplicate(true)
					a.append(c)
					args.append(c)
				else:
					a.append(x)
			match op["kind"]:
				"call": WFX.fx_call(op["name"], a)
				"some": ret = WFX.fx_some(op["name"], a)
				"reduce": ret = WFX.fx_reduce(op["name"], op["acc"], a)
			if sx != null: args.append(sx)
		"call":
			var ca := []
			for x in op["args"]:
				if x is Dictionary and x.has("$"):
					match x["$"]:
						"mob": ca.append(mob)
						"mob8": ca.append(api.mobs.get(8))
						"sk": ca.append(_skill_a if x["id"] == "a" else _skill_b)
				elif x is Dictionary:
					var c2: Dictionary = x.duplicate(true)
					ca.append(c2)
					args.append(c2)
				else:
					ca.append(x)
			var rr: Array = _call(api, op, inp, ca)
			if not rr.is_empty(): ret = rr[0]
		"ext":
			var ea := []
			for x in op["args"]:
				ea.append(mob if (x is Dictionary and x.get("$") == "mob") else x)
			api.ext[op["name"]].callv(ea)
		"entry":
			var oe = null
			if op.has("o"):
				oe = op["o"].duplicate(true)
				args.append(oe)
			match op["name"]:
				"wtDmgMult": ret = Dmg.wt_dmg_mult(api, oe, mob, op["crit"])
				"wtOnHit": Dmg.wt_on_hit(api, mob, op["dmg"], op["crit"], oe, op["mult"])
				"wtAfterCast": Dmg.wt_after_cast(api, op["id"], op["free"])
				"phantomReady": ret = Dmg.phantom_ready(api, op["id"])
				"wtOnHurt": Dmg.wt_on_hurt(api, op["guarded"])
				"wtOnGuard": Dmg.wt_on_guard(api, op["raw"], mob if op["src"] else null)
				"wtDr": ret = Dmg.wt_dr(api)
				"wtCritAdd": ret = Dmg.wt_crit_add(api, oe)
				"wtChargeStart": Dmg.wt_charge_start(api)
				"wtHeavy": Dmg.wt_heavy(api, op["lv"])
				"wtAura": Dmg.wt_aura(api, op["dt"])
				_: return "未知の入口 %s" % op["name"]
		_:
			return "未知の op %s" % op["k"]
	api.run_pending()

	var got_mobs := {}
	for id in api.mobs:
		var d := _diff(before_mobs[id], api.mobs[id])
		if not d.is_empty(): got_mobs[str(id)] = d
	var checks := [
		["ev", out["ev"], api.events], ["net", out["net"], api.nets],
		["me", out["me"], _diff(before_me, api.me)], ["mobs", out["mobs"], got_mobs],
		["shake", out["shake"], api.shake_v], ["hitStop", out["hitStop"], api.hit_stop], ["used", out["used"], api.used],
		["args", out.get("args", []), args],
	]
	if out.has("ret") or ret != null: checks.append(["ret", out.get("ret"), ret])
	for c in checks:
		if not _same(c[1], c[2]): return "%s\n      期待 %s\n      実際 %s" % [c[0], _short(c[1], c[2], true), _short(c[1], c[2], false)]
	return ""


## 長い配列は最初に違う所だけ見せる
func _short(e, g, want_e: bool) -> String:
	if e is Array and g is Array:
		for i in mini(e.size(), g.size()):
			if not _same(e[i], g[i]): return "[%d] %s" % [i, JSON.stringify(e[i] if want_e else g[i])]
		return "長さ %d" % (e.size() if want_e else g.size())
	if e is Dictionary and g is Dictionary:
		for k in e:
			if not g.has(k): return "キー %s がない" % k if not want_e else "キー %s = %s" % [k, JSON.stringify(e[k])]
			if not _same(e[k], g[k]): return "%s = %s" % [k, JSON.stringify(e[k] if want_e else g[k])]
		for k in g:
			if not e.has(k): return "余分なキー %s" % k if not want_e else "(なし)"
		return "?"
	return JSON.stringify(e if want_e else g)


func _init() -> void:
	var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/combat_golden.json"))
	if j == null:
		print("NG  data/combat_golden.json が読めない（node tools/worldart/godot/golden_combat.mjs で書く）")
		quit(1)
		return
	var api := Rec.new()
	WFX.clear()
	FxSword.install(api)
	FxGreatsword.install(api)
	FxDagger.install(api)
	FxAxe.install(api)
	FxSpear.install(api)
	FxBow.install(api)
	WFX.register_placeholders()
	var base_me: Dictionary = j["base"]["me"]
	var by_suite := {}
	for sc in j["scenes"]:
		if not by_suite.has(sc["suite"]): by_suite[sc["suite"]] = []
		by_suite[sc["suite"]].append(sc)
	var all_ok := true
	for suite in SUITES:
		var cases: Array = by_suite.get(suite, [])
		var bad := []
		for sc in cases:
			var msg := _run(api, base_me, j["states"], sc)
			if msg != "": bad.append([sc["name"], msg])
		if cases.is_empty():
			print("NG  %s: 場面がない" % suite)
			all_ok = false
		elif bad.is_empty():
			print("OK  %s %d 件" % [suite, cases.size()])
		else:
			all_ok = false
			print("NG  %s: %d / %d 件が不一致" % [suite, bad.size(), cases.size()])
			for i in mini(3, bad.size()):
				print("    %s: %s" % [bad[i][0], bad[i][1]])
			if OS.get_environment("GOLDEN_HIST") != "":   # 調査用: 操作の名前 × 違った項目の件数
				var hist := {}
				for b in bad:
					var key := "%s / %s" % [String(b[0]).get_slice(" ", 0), String(b[1]).get_slice("\n", 0)]
					hist[key] = int(hist.get(key, 0)) + 1
				for k in hist: print("      %s: %d" % [k, hist[k]])
			if OS.get_environment("GOLDEN_SHOW") != "":   # 調査用: 名前に含む場面を全部出す
				for b in bad:
					if String(b[0]).contains(OS.get_environment("GOLDEN_SHOW")): print("    >> %s: %s" % [b[0], b[1]])
	WFX.clear()
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)
