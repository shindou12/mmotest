extends SceneTree
## ダメージの式（combat/damage.gd）と武器の効果の差し込み口（combat/weapon_fx.gd・fx_sword.gd・fx_greatsword.gd・fx_dagger.gd・fx_axe.gd）が
## 元の JavaScript と同じ結果になるかの照合（画面なし）。
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/combat_golden.gd
## 期待値は data/combat_golden.json（tools/worldart/godot/golden_combat.mjs が元の JS で書く）:
##   { base: {me}, states: { <id>: { wk, ch, S } }, scenes: [ { suite, name, in, out } ] }
##   in:  state（能力値の状態）・tms（時刻 ms）・rand（Math.random の値の列）・me（base.me への上書き）・mobs・aim・op（deal / stun / hook / ext / entry）
##   out: ret・args（呼んだあとの引数のオブジェクト）・ev（記録だけの操作 [時刻, 名前, 引数]）・net（サーバーへの送信）・
##        me / mobs（場面の前との差）・shake・hitStop・used（使った乱数の数）
## suite ごとに「OK n 件」か「NG」（最初の 3 件の名前・どの項目・期待・実際）を出し、全部 OK のときだけ終了コード 0。
##   damage_<武器>（sword・greatsword・dagger・axe）: dealDamage・stunValue（敵・自分・バフ・オプションの組み合わせ）
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
const WTree = preload("res://scripts/game/skills/wtree.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const SUITES := ["damage_sword", "damage_greatsword", "damage_dagger", "damage_axe", "hooks_sword", "hooks_greatsword", "hooks_dagger", "hooks_axe"]


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
	if (a is float or a is int) and (b is float or b is int): return float(a) == float(b)
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
	WFX.clear()
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)
