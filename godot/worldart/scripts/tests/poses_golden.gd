extends SceneTree
## 人物の姿勢（player_rig.gd）が元の three.js と同じ世界行列を返すかの照合（画面なし）。
##   node tools/worldart/godot/export_rig.mjs                         # data/rig.json・motions.json・poses_golden.json を書く（自己確認つき）
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/poses_golden.gd
## poses_golden.json は test/golden/pose-trace.mjs と同じ入力の、ハッシュにする前の sample:
##   cases[キー] = { kind, rarity, style, states: [animatePlayer に渡した状態...], expect: [sample...] }
##   キーは motion/<id>/<武器> と basic/<武器>/<形>。sample = [model.visible, (visible, 世界行列 16 個（列優先）) × 部品...]
##   部品の順: body head armL armR elbowL elbowR hand handL leg0 leg1 cape weapon weaponModel shield（無い部品は null）
## rig.json から Node3D の骨組みを組み、状態を 1 つずつ与えて世界行列を作り、1e-4 で比べる
## （Node3D の Transform3D は 32 ビットなので 1e-6 ではなく 1e-4）。
## suite: basic（全武器・全形）/ motion_greatsword / motion_sword / motion_other（ほかの武器と、武器の決まらない動きの各武器）
## 完了は basic・motion_greatsword・motion_sword が全部 OK のとき（終了コード 0）。motion_other は件数と OK の数を出す。

const TOL := 1e-4
const PR = preload("res://scripts/game/rig/player_rig.gd")
const ORDER := ["body", "head", "armL", "armR", "elbowL", "elbowR", "hand", "handL", "leg0", "leg1", "cape", "weapon", "weaponModel", "shield"]
const REQUIRED := ["basic", "motion_greatsword", "motion_sword"]


func _load(path: String):
	var j = JSON.parse_string(FileAccess.get_file_as_string(path))
	if j == null:
		print("NG  %s が読めない（node tools/worldart/godot/export_rig.mjs で書く）" % path)
		quit(1)
	return j


func _suite_of(key: String, kind: String) -> String:
	if key.begins_with("basic/"): return "basic"
	if kind == "greatsword": return "motion_greatsword"
	if kind == "sword": return "motion_sword"
	return "motion_other"


## three.js の matrixWorld.elements と同じ並び（列優先）
func _elements(t: Transform3D) -> Array:
	var b := t.basis
	return [b.x.x, b.x.y, b.x.z, 0.0, b.y.x, b.y.y, b.y.z, 0.0, b.z.x, b.z.y, b.z.z, 0.0, t.origin.x, t.origin.y, t.origin.z, 1.0]


## 部品の世界変換。木に入れずに親の transform を順にかける（matrixWorld と同じ）
func _world(o: Node3D) -> Transform3D:
	var t := o.transform
	var p := o.get_parent()
	while p is Node3D:
		t = p.transform * t
		p = p.get_parent()
	return t


func _sample(nodes: Dictionary) -> Array:
	var v: Array = [nodes["model"].visible]
	for n in ORDER:
		if not nodes.has(n):
			v.append(null)
			continue
		var o: Node3D = nodes[n]
		v.append(o.visible)
		v.append_array(_elements(_world(o)))
	return v


## 最初に違った所（要素の番号）を返す。全部一致なら ""
func _diff(e: Array, g: Array) -> String:
	if e.size() != g.size(): return "要素数 %d / %d" % [e.size(), g.size()]
	for i in e.size():
		var a = e[i]
		var b = g[i]
		if a == null or b == null or a is bool or b is bool:
			if a != b: return "%s 期待 %s 実際 %s" % [_label(e, i), a, b]
		elif absf(float(a) - float(b)) > TOL:
			return "%s 期待 %s 実際 %s（差 %s）" % [_label(e, i), a, b, String.num(absf(float(a) - float(b)), 8)]
	return ""


## sample の i 番目がどの部品のどの要素か（null の部品は 1 要素、それ以外は visible + 行列 16 個の 17 要素）
func _label(e: Array, i: int) -> String:
	if i == 0: return "model.visible"
	var pos := 1
	for n in ORDER:
		var w := 1 if e[pos] == null else 17
		if i < pos + w:
			var k := i - pos
			return "%s.%s" % [n, "visible" if k == 0 else "m[%d]" % (k - 1)]
		pos += w
	return "?"


func _init() -> void:
	var rigj: Dictionary = _load("res://data/rig.json")
	var motions: Dictionary = _load("res://data/motions.json")
	var golden: Dictionary = _load("res://data/poses_golden.json")
	var tables: Dictionary = PR.make_tables(motions)
	var stats := {}   # suite -> {n, ok, bad: [文字列]}
	var keys: Array = golden["cases"].keys()
	keys.sort()
	for key in keys:
		var c: Dictionary = golden["cases"][key]
		var suite := _suite_of(key, c["kind"])
		if not stats.has(suite): stats[suite] = {"n": 0, "ok": 0, "bad": []}
		var nodes := PR.build_skeleton(rigj, c["kind"], int(c["style"]))
		var rig = PR.new()
		rig.setup(nodes, rigj, tables, c["kind"], int(c["style"]))
		var first := ""
		for i in c["states"].size():
			rig.animate(c["states"][i])
			var d := _diff(c["expect"][i], _sample(nodes))
			if d != "":
				first = "状態 %d: %s 入力 %s" % [i, d, JSON.stringify(c["states"][i])]
				break
		stats[suite]["n"] += 1
		if first == "": stats[suite]["ok"] += 1
		else: stats[suite]["bad"].append("%s  %s" % [key, first])
		nodes["model"].free()
	var required_ok := true
	for suite in ["basic", "motion_greatsword", "motion_sword", "motion_other"]:
		if not stats.has(suite): continue
		var st: Dictionary = stats[suite]
		if st["bad"].is_empty():
			print("OK  %s %d 件" % [suite, st["n"]])
		else:
			print("NG  %s: %d / %d 件が不一致（OK %d）" % [suite, st["bad"].size(), st["n"], st["ok"]])
			for i in mini(3, st["bad"].size()): print("    " + st["bad"][i])
			if suite in REQUIRED: required_ok = false
	print("照合 %s" % ("basic・motion_greatsword・motion_sword 全部 OK" if required_ok else "NG あり"))
	quit(0 if required_ok else 1)
