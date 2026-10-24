extends SceneTree
## ゲームの中の当たり（skills/strikes.gd の arc・line・circle と、飛び道具 proj・arrow・戻る斧・罠の毎フレーム）が
## 元の JavaScript（actions.js の strikes・updateProjs・projRevive・boomerangStep）と同じ結果になるかの照合（画面なし）。
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/strikes_golden.gd
## 期待値は data/strikes_golden.json（tools/worldart/godot/golden_strikes.mjs が元の JS で書く）:
##   { base: {me}, states: { <id>: { wk, ch, S } }, scenes: [ { suite, name, in, out } ] }
##   in:  state・area・door・tms（時刻 ms）・rand（Math.random の値の列）・me・mobs・allies（倒れた仲間）・op
##   out: ev（[時刻, 名前, 引数]。deal = 当てた敵と倍率とオプション、revive = 起こした仲間）・created（飛び道具を作った直後の値）・
##        frames（フレームごとの [x, z, a]）・left（残った飛び道具）・me（場面の前との差）・shake・used（使った乱数の数）
## suite ごとに「OK n 件」か「NG」（最初の 3 件の名前・どの項目・期待・実際）を出し、全部 OK のときだけ終了コード 0。
##   arc・line・circle・proj・arrow・boomerang・trap
## 比べ方は _same: 数は 1e-6 の許容差、配列は中まで、辞書はキーの集合も同じ。
## 環境 Rec は combat/api.gd を土台に、strikes.gd の関数を呼んで当たりを書き留める（元の golden_strikes.mjs のダミーと同じ形）。

const TOL := 1e-6
const DT := 1.0 / 60.0
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
const Strikes = preload("res://scripts/game/skills/strikes.gd")
const R = preload("res://scripts/game/rules.gd")
const SUITES := ["arc", "line", "circle", "proj", "arrow", "boomerang", "trap"]


## 当たりを書き留める環境（golden_strikes.mjs のダミー）
class Rec extends Api:
	var events: Array = []
	var rand: Array = []
	var used := 0
	var area_id := "f1_field"
	var area_def: Dictionary = {}
	var door := false
	var allies: Array = []
	var projs: Array = []

	func random() -> float:
		if used >= rand.size():
			push_error("乱数の列を使い切った")
			return 0.5
		var v: float = rand[used]
		used += 1
		return v

	func area() -> String: return area_id

	func hand_pos(_model) -> Dictionary:
		return {"x": me["x"] + 0.3, "y": 1.1, "z": me["z"] + 0.2}

	func net_send(_msg: Dictionary) -> void: pass

	## dealDamage のダミー: 呼ばれた（敵の id・倍率・オプション）だけ書く
	func deal(mb, mult: float, o: Dictionary) -> void:
		events.append([now(), "deal", [mb["id"], mult, _norm_o(o)]])

	func revive_hit(p: Dictionary, o: Dictionary) -> void:
		events.append([now(), "revive", [p["id"], _norm_o(o)]])

	func downed_allies() -> Array: return allies

	## オプションの書き留め方（golden_strikes.mjs の cleanO と同じ）: skip は敵の id に、proj は "w" に
	func _norm_o(o: Dictionary) -> Dictionary:
		var c := o.duplicate()
		if c.has("skip") and c["skip"] != null: c["skip"] = c["skip"]["id"]
		if c.has("proj") and c["proj"] != null: c["proj"] = "w"
		return clean(c)

	## 関数は "fn"、null の項目は消す（JavaScript の undefined）、配列・辞書は中まで写す
	func clean(v):
		if v is Callable: return "fn"
		if v is Array:
			var r := []
			for x in v: r.append(clean(x))
			return r
		if v is Dictionary:
			var o := {}
			for k in v:
				if v[k] != null: o[k] = clean(v[k])
			return o
		return v

	func _op(name: String, args: Array):
		match name:
			"parts.burst", "parts.emit": return null   # 粒は記録しない
			"arc": Strikes.arc(me, mobs, allies, float(args[0]), float(args[1]), float(args[2]), args[3] if args.size() > 3 and args[3] != null else {}, Callable(self, "deal"), Callable(self, "revive_hit")); return null
			"line": Strikes.line(me, mobs, allies, float(args[0]), float(args[1]), float(args[2]), args[3] if args.size() > 3 and args[3] != null else {}, Callable(self, "deal"), Callable(self, "revive_hit")); return null
			"circle": Strikes.circle(me, mobs, allies, float(args[0]), float(args[1]), float(args[2]), float(args[3]), args[4] if args.size() > 4 and args[4] != null else {}, Callable(self, "deal"), Callable(self, "revive_hit")); return null
			"proj": projs.append(Strikes.make_proj(args[0] if args.size() > 0 and args[0] != null else {}, me, _nn_color(args[0]))); return null
			"arrow": projs.append(Strikes.make_arrow(args[0] if args.size() > 0 and args[0] != null else {}, me, st, _nn_color(args[0]))); return null
		events.append([now(), name, clean(args)])
		return null

	func _nn_color(o):
		if o != null and o.get("color") != null: return o["color"]
		return weapon_color()

	## proj_step の見た目（遠矢の文字だけ記録する。粒は記録しない）
	func vis(kind: String, a, _b) -> void:
		if kind == "far_text": float_text(a["x"], 3.4, a["z"], "遠矢", "info")

	func env() -> Dictionary:
		return {"me": me, "mobs": mobs, "allies": Callable(self, "downed_allies"), "deal": Callable(self, "deal"), "revive": Callable(self, "revive_hit"),
			"collide": func(x, z): return R.collide_xz(area_def, x, z, 0.1, door), "tf": func(id): return Dmg.tf(self, id), "rand": Callable(self, "random"), "vis": Callable(self, "vis")}

	## 飛び道具の値（golden_strikes.mjs の snapW と同じ: node は除く。hit・hitT は文字にして並べる）
	func snap(w: Dictionary) -> Dictionary:
		var o := {}
		for k in w:
			if k == "node" or w[k] == null: continue
			if k == "hit":
				var ks := []
				for key in w[k]: ks.append(str(key))
				ks.sort()
				o[k] = ks
			elif k == "hitT":
				var h := {}
				for key in w[k]: h[str(key)] = w[k][key]
				o[k] = h
			else:
				o[k] = clean(w[k])
		return o


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


## 引数のオプション: skip・boomerang.catch・onHit を、JS の mkO と同じに直す
func _mk_o(api: Rec, o0) -> Dictionary:
	var o: Dictionary = (o0 as Dictionary).duplicate(true) if o0 != null else {}
	if o.has("skip") and o["skip"] is Dictionary and o["skip"].has("$"): o["skip"] = api.mobs.get(int(o["skip"]["id"]))
	var boom = o.get("boomerang")
	if boom is Dictionary and boom.has("catch"):
		boom.erase("catch")
		boom["onCatch"] = func(): api.events.append([api.now(), "catch", []])
	if o.get("onHit") is bool and o["onHit"]:
		o["onHit"] = func(mb): api.events.append([api.now(), "onHit", [mb["id"]]])
	return o


## 1 場面を動かして、期待値と比べる。違えば最初に違う項目の説明、同じなら ""
func _run(api: Rec, base_me: Dictionary, states: Dictionary, sc: Dictionary) -> String:
	var inp: Dictionary = sc["in"]
	var out: Dictionary = sc["out"]
	api.events.clear()
	api.pending.clear()
	api.projs.clear()
	api.shake_v = 0.0
	api.hit_stop = 0.0
	api.aim_v = 0.0
	for k in api.wt_aura_acc: api.wt_aura_acc[k] = 0.0
	api.character_lost = false
	api.shape = "grid" if R.area(inp["area"])["shape"] == "grid" else "open"
	api.area_id = inp["area"]
	api.area_def = R.area(inp["area"])
	api.door = inp["door"]
	api.rand = inp["rand"]
	api.used = 0
	api.tms = inp["tms"]
	api.st = _state_s(states[inp["state"]])
	var me: Dictionary = base_me.duplicate(true)
	me.merge(inp["me"].duplicate(true), true)
	api.me = me
	api.mobs = {}
	for m in inp["mobs"]: api.mobs[int(m["id"])] = m.duplicate(true)
	api.allies = []
	for p in inp["allies"]: api.allies.append(p.duplicate(true))
	var before_me: Dictionary = api.clean(me.duplicate(true))
	var op: Dictionary = inp["op"]
	var created := []
	var frames := []
	match op["k"]:
		"arc", "line":
			var a: Array = op["args"].duplicate(true)
			var o = _mk_o(api, a[3] if a.size() > 3 else null)
			if op["k"] == "arc": Strikes.arc(me, api.mobs, api.allies, a[0], a[1], a[2], o, Callable(api, "deal"), Callable(api, "revive_hit"))
			else: Strikes.line(me, api.mobs, api.allies, a[0], a[1], a[2], o, Callable(api, "deal"), Callable(api, "revive_hit"))
		"circle":
			var a2: Array = op["args"].duplicate(true)
			var o2 = _mk_o(api, a2[4] if a2.size() > 4 else null)
			Strikes.circle(me, api.mobs, api.allies, a2[0], a2[1], a2[2], a2[3], o2, Callable(api, "deal"), Callable(api, "revive_hit"))
		"run":
			for sp in op["spawns"]:
				var so = _mk_o(api, sp["o"])
				if sp["fn"] == "proj": api.projs.append(Strikes.make_proj(so, me, api._nn_color(so)))
				else: api.projs.append(Strikes.make_arrow(so, me, api.st, api._nn_color(so)))
				created.append(api.snap(api.projs[api.projs.size() - 1]))
			api.events.clear()
			var env := api.env()
			var mv: Array = op.get("meV", [0.0, 0.0])
			for f in int(op["frames"]):
				if api.projs.is_empty() and not (op.get("aura", false) and f < int(op.get("minFrames", 0))): break
				api.tms = api.tms + DT * 1000.0
				me["x"] += float(mv[0]) * DT
				me["z"] += float(mv[1]) * DT
				for m in api.mobs.values():
					if m.get("vx", 0.0) != 0.0 or m.get("vz", 0.0) != 0.0:
						m["x"] += float(m.get("vx", 0.0)) * DT
						m["z"] += float(m.get("vz", 0.0)) * DT
				if op.get("aura", false): WFX.fx_call("aura", [DT, api.st["wt"]])
				for i in range(api.projs.size() - 1, -1, -1):
					if Strikes.proj_step(api.projs[i], DT, env): api.projs.remove_at(i)
				var fr := []
				for w in api.projs: fr.append([w["x"], w["z"], w["a"]])
				frames.append(fr)
		_:
			return "未知の op %s" % op["k"]
	var left := []
	for w in api.projs: left.append(api.snap(w))
	var checks := [
		["ev", out["ev"], api.events], ["created", out["created"], created], ["frames", out["frames"], frames], ["left", out["left"], left],
		["me", out["me"], _diff(before_me, api.clean(me))], ["shake", out["shake"], api.shake_v], ["used", out["used"], api.used],
	]
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
	var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/strikes_golden.json"))
	if j == null:
		print("NG  data/strikes_golden.json が読めない（node tools/worldart/godot/golden_strikes.mjs で書く）")
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
	WFX.clear()
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)
