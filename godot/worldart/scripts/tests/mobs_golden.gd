extends SceneTree
## public/js/models.js の animateMob (306-357 行)を MobAnim と照合する画面なしテスト。
## 期待値は golden_mobs.mjs がブラウザ版の animateMob を呼び、部品の値と発光を保存する。
const TOL := 1e-4
const GameVisuals = preload("res://scripts/game/visuals.gd")
const MobAnim = preload("res://scripts/game/mob_anim.gd")


func _load_golden() -> Dictionary:
	var value = JSON.parse_string(FileAccess.get_file_as_string("res://data/mobs_golden.json"))
	if value is Dictionary: return value
	print("NG  data/mobs_golden.json が読めない（node tools/worldart/godot/golden_mobs.mjs で作る）")
	return {}


func _same(expected: Variant, actual: Variant, where: String) -> String:
	if (expected is float or expected is int) and (actual is float or actual is int):
		if absf(float(expected) - float(actual)) <= TOL: return ""
		return "%s 期待 %s / 実際 %s" % [where, expected, actual]
	if expected is Array:
		if not actual is Array or expected.size() != actual.size(): return "%s 配列長 %s / %s" % [where, expected.size(), actual.size() if actual is Array else "なし"]
		for i in expected.size():
			var difference := _same(expected[i], actual[i], "%s[%d]" % [where, i])
			if difference != "": return difference
		return ""
	if expected is Dictionary:
		if not actual is Dictionary: return "%s 辞書がない" % where
		if expected.size() != actual.size(): return "%s キー数 %d / %d" % [where, expected.size(), actual.size()]
		for key in expected:
			if not actual.has(key): return "%s.%s がない" % [where, key]
			var difference := _same(expected[key], actual[key], "%s.%s" % [where, key])
			if difference != "": return difference
		return ""
	if typeof(expected) != typeof(actual) or expected != actual: return "%s 期待 %s / 実際 %s" % [where, expected, actual]
	return ""


func _unique_colors(values: Array) -> Array:
	var unique: Array = []
	for value in values:
		var found := false
		for prior in unique:
			if _same(value, prior, "color") == "":
				found = true
				break
		if not found: unique.append(value)
	return unique


func _same_materials(expected: Array, actual: Array) -> String:
	var expected_unique := _unique_colors(expected)
	var actual_unique := _unique_colors(actual)
	if expected_unique.size() != actual_unique.size(): return "materials 色数 %d / %d" % [expected_unique.size(), actual_unique.size()]
	for i in expected_unique.size():
		var found := false
		for value in actual_unique:
			if _same(expected_unique[i], value, "materials") == "":
				found = true
				break
		if not found: return "materials[%d] %s がない" % [i, expected_unique[i]]
	return ""


func _compare(expected: Dictionary, actual: Dictionary) -> String:
	var part_difference := _same(expected.get("parts", {}), actual.get("parts", {}), "parts")
	if part_difference != "": return part_difference
	return _same_materials(expected.get("materials", []), actual.get("materials", []))


func _init() -> void:
	var golden := _load_golden()
	if golden.is_empty():
		quit(1)
		return
	var stats: Dictionary = {}
	var all_ok := true
	var total_states := 0
	for entry in golden.get("cases", []):
		var kind := String(entry.get("type", ""))
		if not stats.has(kind): stats[kind] = {"cases": 0, "states": 0, "bad": []}
		var model := GameVisuals.mob(kind, Color(String(entry.get("color", "#448a9b"))), 1.0, false, Color(String(entry.get("accent", "#ff4030"))))
		MobAnim.setup(model)
		var failure := ""
		var inputs: Array = entry.get("states", [])
		var expected: Array = entry.get("expect", [])
		if inputs.size() != expected.size():
			failure = "状態数 %d / %d" % [inputs.size(), expected.size()]
		else:
			for i in inputs.size():
				MobAnim.animate(model, inputs[i])
				var difference := _compare(expected[i], MobAnim.sample(model))
				if difference != "":
					failure = "状態 %d (%s): %s" % [i, JSON.stringify(inputs[i]), difference]
					break
		stats[kind]["cases"] += 1
		stats[kind]["states"] += inputs.size()
		total_states += inputs.size()
		if failure != "":
			stats[kind]["bad"].append(failure)
			all_ok = false
		model.free()
	for entry in golden.get("cases", []):
		var kind := String(entry.get("type", ""))
		if not stats.has(kind): continue
		var row: Dictionary = stats[kind]
		if int(row.get("reported", 0)) != 0: continue
		row["reported"] = 1
		if row["bad"].is_empty():
			print("OK  mob %s (%d 件・%d 状態)" % [kind, row["cases"], row["states"]])
		else:
			print("NG  mob %s (%d / %d 件)" % [kind, row["bad"].size(), row["cases"]])
			for i in mini(3, row["bad"].size()): print("    " + row["bad"][i])
	print("照合 %s (%d 形・%d 件・%d 状態)" % ["全部 OK" if all_ok else "NG あり", stats.size(), golden.get("cases", []).size(), total_states])
	quit(0 if all_ok else 1)
