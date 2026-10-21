extends SceneTree
## 技（scripts/game/skills/）が元の JavaScript と同じ呼び出し列を作るかの照合（画面なし）。
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/skills_golden.gd
## 期待値は data/skills_golden.json（tools/worldart/godot/golden_skills.mjs が元の JS で書く）:
##   { keys: { <キー>: { suite, in: {入力}, ev | meta | eff } }, misc: {...} }
##   キーは test/golden/skill-trace.mjs と同じ（heavy/<武器>/<lv>・ws/<id>・ts/<id>・wt/<id>/<段階>・wtmeta/<id>/<段階>・eff/<id>/<段階>）
## suite ごとに「OK n 件」か「NG」（最初の 3 件のキー・期待・実際）を出し、全部 OK のときだけ終了コード 0。
##   sword: 片手剣の heavy・ws・ts・wt   greatsword・dagger・axe: 大剣・短剣・大斧の同じもの   wtree: 武器ツリーの wtmeta と eff（片手剣・大剣・短剣・大斧のノード）
##
## 記録する文脈 Recorder は skill-trace.mjs の recorder と同じ: 呼ばれた操作を [時刻, 名前, 引数] で書き留め、later は記録してから
## 待ち行列（時刻 → 登録順）へ入れる。敵の仮の値・自分・point・area・range・zone・reach・col も同じ。
## 比べ方は _same: 数は 1e-6 の許容差、配列は中まで、辞書はキーの集合も同じ（技の照合は厳しい。JSON に出ない undefined のキーは Godot 側でも入れない）、
## 関数の引数は文字列 "fn"。

const TOL := 1e-6
const Ctx = preload("res://scripts/game/skills/ctx.gd")
const Skills = preload("res://scripts/game/skills/skills.gd")
const WTree = preload("res://scripts/game/skills/wtree.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const SUITES := ["sword", "greatsword", "dagger", "axe", "wtree"]


## skill-trace.mjs の recorder: 呼ばれたものをすべて書き留める文脈
class Recorder extends Ctx:
	var events: Array = []
	var queue: Array = []
	var time := 0.0
	var W = null
	var wk = null
	var mob := {"id": 7, "x": 0.5, "z": 3.0, "hp": 25.0, "mhp": 100.0, "rad": 0.8, "a": PI, "kind": 0}

	func _init(w, kind) -> void:
		super()
		W = w
		wk = kind
		me = {"x": 0.0, "z": 0.0, "a": 0.0, "hp": 80.0, "iframe": 0.0}

	func _op(name: String, args: Array):
		events.append([time, name, _clean(args)])
		return null

	## clean: 関数は "fn"、配列・辞書は中まで写す（途中で書き換えられても記録が変わらないように）
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

	func aim() -> float: return 0.0
	func col() -> int: return 0xcfd3da
	func wt(): return W
	func S() -> Dictionary: return {"wt": W, "wk": wk, "flags": [], "mhp": 100.0}
	func point() -> Dictionary: return {"x": 2.0, "z": 7.0}
	func targets(_x = null, _z = null, _r = null) -> Array: return [mob]
	func nearest(_r = null): return mob
	func area() -> String: return "f1_field"
	func range(): return 12.0
	func zone() -> Array: return [6.0, 10.0]
	func reach(): return 1.0
	func now() -> float: return time
	func rnd(a: float = 0.0, b: float = 1.0) -> float: return a + 0.5 * (b - a)

	func later(sec: float, fn: Callable) -> void:
		events.append([time, "later", [sec]])
		queue.append({"at": time + sec, "fn": fn, "seq": queue.size() + events.size()})

	## 待ち行列を 時刻 → 登録順 で回す（JavaScript の sort は安定なので、同じ並びのものは今の順のまま）
	func run() -> void:
		while not queue.is_empty():
			_stable_sort()
			var q: Dictionary = queue.pop_front()
			time = q["at"]
			q["fn"].call()

	func _stable_sort() -> void:
		for i in range(1, queue.size()):
			var x = queue[i]
			var j := i - 1
			while j >= 0 and _after(queue[j], x):
				queue[j + 1] = queue[j]
				j -= 1
			queue[j + 1] = x

	func _after(p: Dictionary, q: Dictionary) -> bool:
		if p["at"] != q["at"]: return p["at"] > q["at"]
		return p["seq"] > q["seq"]


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


## 最初に違う所の説明（呼び出し列なら何番目の操作か）
func _first_diff(e, g) -> String:
	if e is Array and g is Array and not (e.size() > 0 and e[0] is String):
		for i in mini(e.size(), g.size()):
			if not _same(e[i], g[i]):
				return "[%d] 期待 %s\n         実際 %s" % [i, JSON.stringify(e[i]), JSON.stringify(g[i])]
		return "長さが違う（期待 %d 実際 %d）" % [e.size(), g.size()]
	return "期待 %s\n         実際 %s" % [JSON.stringify(e), JSON.stringify(g)]


## 入力 in から武器ツリーの効果 W を作る（skill-trace.mjs の wt の組み立てと同じ）
func _make_w(wk: String, id: String, lv: int, br, from = null):
	var ch := {"lv": 1, "tree": {}, "prof": {}, "wt": {}}
	WTree.prof_of(ch, wk)["lv"] = 20
	if from != null: WTree.wt_learn(ch, from)
	for i in lv: WTree.wt_learn(ch, id)
	if br != null: WTree.wt_choose(ch, id, br)
	return WTree.effects(ch, wk)


func _node(wk: String, id: String) -> Dictionary:
	for row in Common.game()["wtrees"][wk]["rows"]:
		for n in row["nodes"]:
			if n["id"] == id: return n
	return {}


## suite の 1 件を動かして、(期待 e, 実際 g) を返す
func _run(key: String, e: Dictionary) -> Array:
	var inp: Dictionary = e["in"]
	var G := Common.game()
	match inp["kind"]:
		"heavy":
			var r := Recorder.new(null, inp["wk"])
			Skills.heavy(inp["wk"]).call(r, int(inp["lv"]))
			r.run()
			return [e["ev"], r.events]
		"ws":
			var r := Recorder.new(null, G["skills"]["weapon"][inp["id"]]["kind"])
			Skills.weapon_skill(inp["id"]).call(r)
			r.run()
			return [e["ev"], r.events]
		"ts":
			var r := Recorder.new(null, inp["wk"])
			Skills.tree_skill(inp["id"]).call(r)
			r.run()
			return [e["ev"], r.events]
		"wt":
			var w = _make_w(inp["wk"], inp["id"], int(inp["lv"]), inp["br"])
			var r := Recorder.new(w, inp["wk"])
			Skills.wt_skill(inp["id"]).call(r)
			r.run()
			return [e["ev"], r.events]
		"wtmeta":
			var w = _make_w(inp["wk"], inp["id"], int(inp["lv"]), inp["br"])
			return [e["meta"], Skills.wt_meta(inp["id"], w)]
		"eff":
			var n := _node(inp["wk"], inp["id"])
			var w = _make_w(inp["wk"], inp["id"], int(inp["lv"]), inp["br"], n.get("from"))
			var v := []
			for k in n:
				if n[k] is Array and k != "lv" and k != "tags" and n[k].size() > 0 and (n[k][0] is float or n[k][0] is int):
					v.append([k, w.v(inp["id"], k)])
			var act: Array = w.actives.keys()
			act.sort()
			return [e["eff"], {"st": w.st, "mods": w.mods, "actives": act, "ks1": w.ks1, "ks2": w.ks2, "lv": w.lv(inp["id"]), "br": w.br(inp["id"]), "v": v}]
	return [e, "未対応の種類 %s" % key]


func _init() -> void:
	var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/skills_golden.json"))
	if j == null:
		print("NG  data/skills_golden.json が読めない（node tools/worldart/godot/golden_skills.mjs で書く）")
		quit(1)
		return
	var all_ok := true
	for suite in SUITES:
		var n := 0
		var bad := []
		for key in j["keys"]:
			var e: Dictionary = j["keys"][key]
			if e["suite"] != suite: continue
			n += 1
			var pair := _run(key, e)
			if not _same(pair[0], pair[1]): bad.append([key, pair[0], pair[1]])
		if n == 0:
			print("NG  %s: 照合する項目が JSON にない" % suite)
			all_ok = false
		elif bad.is_empty():
			print("OK  %s %d 件" % [suite, n])
		else:
			all_ok = false
			print("NG  %s: %d / %d 件が不一致" % [suite, bad.size(), n])
			for i in mini(3, bad.size()):
				print("    キー %s\n    最初の違い %s" % [bad[i][0], _first_diff(bad[i][1], bad[i][2])])
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)
