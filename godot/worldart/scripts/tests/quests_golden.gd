extends SceneTree
## quests.js・progress.js・data.js の式を、元の JavaScript が作った期待値と照合する。

const TOL := 1e-6
const QuestModel = preload("res://scripts/game/quests.gd")
const ItemModel = preload("res://scripts/game/items.gd")

class FakeGame extends RefCounted:
	var ch: Dictionary = {}
	var hud_ui = null

	func _sfx(_name: String, _options: Dictionary = {}) -> void:
		pass

	func _recalc() -> void:
		pass


func _init() -> void:
	var path := OS.get_environment("QUESTS_GOLDEN_PATH")
	if path.is_empty() or not FileAccess.file_exists(path):
		print("NG  QUESTS_GOLDEN_PATH がない。node tools/worldart/godot/golden_quests.mjs で期待値を作る")
		quit(1)
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not data is Dictionary or not data.get("suites") is Dictionary:
		print("NG  クエスト照合データが読めない")
		quit(1)
		return
	var all_ok := true
	for name in data.suites:
		var bad: Array = []
		var cases: Array = data.suites[name]
		for test_case in cases:
			var got: Variant = _run_case(String(name), test_case["in"])
			if not _same(test_case["out"], got): bad.append([test_case["in"], test_case["out"], got])
		if bad.is_empty():
			print("OK  %s %d 件" % [String(name), cases.size()])
		else:
			all_ok = false
			print("NG  %s: %d / %d 件が不一致" % [String(name), bad.size(), cases.size()])
			for i in mini(3, bad.size()):
				print("    入力 %s\n    期待 %s\n    実際 %s" % [JSON.stringify(bad[i][0]), JSON.stringify(bad[i][1]), JSON.stringify(bad[i][2])])
	print("照合 %s" % ("全部 OK" if all_ok else "NG あり"))
	quit(0 if all_ok else 1)


func _run_case(name: String, input: Variant) -> Variant:
	match name:
		"quest_progress": return _quest_progress(input)
		"quest_available": return QuestModel.quest_available({"quests": input.quests}, QuestModel.index()[String(input.id)])
		"quest_rewards": return _quest_reward(input)
		"smith_costs": return _smith_costs(input)
		"smith_results": return _smith_result(input)
	return null


func _quest_progress(input: Dictionary) -> Dictionary:
	var character := {"quests": input.quests.duplicate(true)}
	var changed: Array[String] = []
	for event in input.events:
		for quest in QuestModel.progress(character, event): changed.append(String(quest.id))
	return {"quests": character.quests, "changed": changed}


func _quest_reward(input: Dictionary) -> Dictionary:
	var quest: Dictionary = QuestModel.index()[String(input.id)]
	var reward := QuestModel.reward(quest)
	var item: Variant = null
	if reward.has("rarity"):
		item = QuestModel.reward_item_params_for(quest, {"lv": int(input.lv)}, int(input.floor), float(input.roll))
	return {"reward": reward, "item": item}


func _smith_costs(input: Dictionary) -> Dictionary:
	return {"enhance": ItemModel.enhancement_cost(input), "affix": ItemModel.affix_cost(input), "skill": ItemModel.skill_cost(input), "lore": ItemModel.lore_cost(input)}


func _smith_result(input: Dictionary) -> Dictionary:
	var game := FakeGame.new()
	var item: Dictionary = input.item.duplicate(true)
	game.ch = {"gold": int(input.gold), "mats": input.mats.duplicate(true), "codex": input.get("codex", {}).duplicate(true),
		"inv": [item], "eq": {"weapon": null, "armor": null, "acc": null}}
	var items := ItemModel.new(game)
	var result: Dictionary
	match String(input.op):
		"enhance": result = items.smith_enhance(item, float(input.roll))
		"affix": result = items.smith_affix(item, int(input.slot), String(input.key), float(input.roll))
		"skill": result = items.smith_skill(item, String(input.skill))
		"lore": result = items.smith_lore(item)
	var result_summary := {}
	for key in ["ok", "msg", "enh", "tier"]:
		if result.has(key): result_summary[key] = result[key]
	var stored_items: Array = []
	for stored in game.ch.inv: stored_items.append(_item_summary(stored))
	var equipped := {}
	for slot in game.ch.eq: equipped[slot] = _item_summary(game.ch.eq[slot])
	return {"result": result_summary, "gold": int(game.ch.gold), "mats": game.ch.mats, "items": stored_items, "equipped": equipped}


func _item_summary(item: Variant) -> Variant:
	if not item is Dictionary: return null
	var result := {}
	for key in ["slot", "kind", "name", "rarity", "ilvl", "enh", "affixes", "skill", "fx", "lore", "req", "from"]:
		if item.has(key): result[key] = item[key]
	return result


func _same(expected: Variant, actual: Variant) -> bool:
	if expected is int or expected is float:
		return (actual is int or actual is float) and absf(float(expected) - float(actual)) <= TOL
	if expected is Array and actual is Array:
		if expected.size() != actual.size(): return false
		for i in expected.size():
			if not _same(expected[i], actual[i]): return false
		return true
	if expected is Dictionary and actual is Dictionary:
		for key in expected:
			if not actual.has(key) or not _same(expected[key], actual[key]): return false
		return true
	return typeof(expected) == typeof(actual) and expected == actual
