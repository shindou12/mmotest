extends SceneTree
## rules.gd（Godot の式）が元の JavaScript と同じ値を返すかの照合（画面なし）。
##   cd godot/worldart && godot --headless --path . -s res://scripts/tests/rules_golden.gd
## 入力と期待値は data/rules_golden.json（tools/worldart/godot/golden_rules.mjs が元の JS で書く）:
##   { suites: { <名前>: [ { in: [引数...], out: 期待値 }, ... ] } }
## 関数ごとに「OK n 件」か「NG」（最初の 3 件の入力・期待値・実際の値）を出し、全部 OK のときだけ終了コード 0。
##
## 新しい照合（suite）の足し方:
##   1) golden_rules.mjs に同じ名前の suite を足して JSON を書き直す。
##   2) 下の SUITES の表に「名前: 入力の配列を受けて値を返す Callable」を足す（rules.gd を呼ぶだけの薄い関数）。
## 比べ方は _same: 数は 1e-6 の許容差、配列・辞書は中まで比べる（辞書は期待値にあるキーだけ）。
## calc_stats_tree（G1-3b）: 武器ツリー・旧ツリー・称号・武器の 'stats' を含む calcStats（S の数・真偽・文字と Set の全項目）。

const TOL := 1e-6
const R = preload("res://scripts/game/rules.gd")
const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Api = preload("res://scripts/game/combat/api.gd")
const FxSword = preload("res://scripts/game/combat/fx_sword.gd")
const FxGreatsword = preload("res://scripts/game/combat/fx_greatsword.gd")
const FxDagger = preload("res://scripts/game/combat/fx_dagger.gd")
const FxAxe = preload("res://scripts/game/combat/fx_axe.gd")

## 名前 → 入力の配列 a を受けて値を返す関数
var SUITES := {
	"collide": func(a): return R.collide_xz(R.area(a[0]), a[1], a[2], a[3], a[4]),
	"in_shape": func(a): return R.in_shape(a[0], a[1], a[2], a[3]),
	"bound_r": func(a): return R.bound_r(R.area(a[0]), a[1]),
	"ang_diff": func(a): return R.ang_diff(a[0], a[1]),
	"xp_to_next": func(a): return R.xp_to_next(int(a[0])),
	"calc_stats": func(a): return _calc_stats(a[0]),
	"calc_stats_tree": func(a): return _calc_stats(a[0]),
}


## calc_stats の戻り値を、JS の calcStats と比べる形にそろえる（golden_rules.mjs と同じ: 数・真偽・文字はそのまま、Set は並べた配列。
## roll は重さの階級の値）。ツリーの効果 wt・技の表 ws・W・wc・title などの入れ物は比べない
func _calc_stats(ch: Dictionary) -> Dictionary:
	var s: Dictionary = R.calc_stats(ch.duplicate(true))
	var o := {}
	for k in s:
		var v = s[k]
		if v is float or v is int or v is bool or v is String: o[k] = v
		elif v is Dictionary and k in ["fx", "flags", "actives", "tfx"]:
			var ks: Array = v.keys()
			ks.sort()
			o[k] = ks
	o["roll"] = s["wc"]["roll"]
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
		for k in e:
			if not g.has(k) or not _same(e[k], g[k]): return false
		return true
	return typeof(e) == typeof(g) and e == g


func _init() -> void:
	var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/rules_golden.json"))
	if j == null:
		print("NG  data/rules_golden.json が読めない（node tools/worldart/godot/golden_rules.mjs で書く）")
		quit(1)
		return
	# 武器の効果の 'stats'・'afterStats'（片手剣・大剣・短剣・大斧）を登録する（calc_stats が呼ぶ）。道具 Api は何も起こさない代用品
	WFX.clear()
	var api := Api.new()
	FxSword.install(api)
	FxGreatsword.install(api)
	FxDagger.install(api)
	FxAxe.install(api)
	WFX.register_placeholders()
	var all_ok := true
	for name in j["suites"]:
		var cases: Array = j["suites"][name]
		if not SUITES.has(name):
			print("NG  %s: 照合の関数が SUITES にない" % name)
			all_ok = false
			continue
		var bad := []
		for c in cases:
			var got = SUITES[name].call(c["in"])
			if not _same(c["out"], got): bad.append([c["in"], c["out"], got])
		if bad.is_empty():
			print("OK  %s %d 件" % [name, cases.size()])
		else:
			all_ok = false
			print("NG  %s: %d / %d 件が不一致" % [name, bad.size(), cases.size()])
			for i in mini(3, bad.size()):
				print("    入力 %s\n    期待 %s\n    実際 %s" % [JSON.stringify(bad[i][0]), JSON.stringify(bad[i][1]), JSON.stringify(bad[i][2])])
	WFX.clear()
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)
