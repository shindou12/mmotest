class_name GameQuests
extends RefCounted
## public/js/quests.js の QUESTS / questProgress と public/js/game/progress.js の進行・報酬。

const NPCS := {
	"f1_town": [
		{"id": "captain", "name": "衛兵隊長 ガレス", "x": -9.0, "z": -6.0, "color": "#c0504a", "line": "迷宮区を越えねば、上の層へは行けん。腕を磨いてこい。"},
		{"id": "hunter", "name": "狩人 ミラ", "x": 10.0, "z": -4.0, "color": "#5aa060", "line": "北東の丘はイノシシだらけ。狩りの練習にはもってこいよ。"},
		{"id": "sage", "name": "賢者 オルド", "x": 6.0, "z": 10.0, "color": "#7a6ad0", "line": "草原の西、古井戸の底に古い宝が眠っているという噂じゃ。"},
		{"id": "smith1", "role": "smith", "name": "鍛冶屋 グラム", "x": 12.0, "z": 6.0, "color": "#8a5a3a", "line": ""},
	],
	"f2_camp": [
		{"id": "ranger", "name": "森番 セイル", "x": 7.0, "z": -5.0, "color": "#4a8a7a", "line": "霧の森の奥、朽ちた大樹の洞には近づくな…と言っても行くんだろう？ 毒沼には気をつけろ。"},
		{"id": "smith2", "role": "smith", "name": "旅の鍛冶屋 ボルグ", "x": -7.0, "z": -5.0, "color": "#8a5a3a", "line": ""},
	],
	"f3_camp": [
		{"id": "merchant", "name": "行商人 ハサン", "x": -7.0, "z": 2.0, "color": "#c08a3a", "line": "北の荒野は流砂だらけ、西の谷の奥には迷宮区。砂の下の神殿？ あそこの宝はとびきりだって話さ。"},
		{"id": "smith3", "role": "smith", "name": "砂漠の鍛冶屋 ナディア", "x": 10.0, "z": 11.0, "color": "#8a5a3a", "line": ""},
	],
}

const TITLES := {
	"t_guard": {"name": "不落の盾", "rarity": 4, "req": "spear", "desc": "ガードカウンターを出すと4秒間 被ダメージ -40%"},
	"t_wind": {"name": "疾風", "rarity": 3, "desc": "回避した後の1.5秒間、移動速度 +40%"},
	"t_delver": {"name": "井戸の探索者", "rarity": 3, "desc": "ダンジョン・迷宮区の中で移動速度 +15%"},
	"t_mapper": {"name": "地図職人", "rarity": 3, "desc": "迷宮・ダンジョンの自動マッピングの範囲が2倍。宝箱がミニマップに遠くから映る"},
	"t_traveler": {"name": "旅人", "rarity": 3, "desc": "エリアを移動・ワープした後の10秒間、移動速度 +30%"},
	"t_treasure": {"name": "宝探し", "rarity": 4, "desc": "宝箱を開けるとゴールドを追加で得て、HPが30%回復する"},
	"t_blood": {"name": "血の渇き", "rarity": 4, "req": "melee", "desc": "敵を倒すとHPを6%回復する"},
	"t_breaker": {"name": "崩しの達人", "rarity": 4, "desc": "ボスのスタン値の溜まり方 +30%。スタン中のボスへのダメージ +15%"},
	"t_hawk": {"name": "鷹の眼", "rarity": 4, "req": "bow", "desc": "最大まで引いた矢は会心率 +30%"},
	"t_relic": {"name": "古代の守護", "rarity": 4, "desc": "被ダメージ -8%。ひるみにくくなる"},
	"t_phoenix": {"name": "不死鳥", "rarity": 6, "desc": "倒れたとき、その場でHP30%で一度だけ復活する（5分に1回）"},
	"t_night": {"name": "夜目", "rarity": 3, "desc": "ダンジョン・迷宮区の中で会心率 +10%"},
	"t_spore": {"name": "薬師", "rarity": 3, "desc": "ポーションの回復量 +40%"},
	"t_spell": {"name": "呪い返し", "rarity": 4, "desc": "弾（遠距離攻撃）から受けるダメージ -35%"},
	"t_shell": {"name": "甲殻の守り", "rarity": 4, "req": "melee", "desc": "近接のみ。被ダメージ -12%。正面から受けたときの割り増しがなくなる"},
}

## quests.js QUESTS。報酬 XP は下で BALANCE.questXp を掛け、ブラウザ版と同じにする。
const QUESTS := [
	{"id": "q_slime", "npc": "captain", "name": "スライム退治", "desc": "ひだまりの草原でグリーンスライムを8体倒す", "type": "kill", "target": "グリーンスライム", "area": "f1_field", "n": 8, "reward": {"xp": 180, "rarity": 2, "title": "t_guard"}},
	{"id": "q_boar", "npc": "hunter", "name": "猪狩り", "desc": "イノシシの丘でフレンジーボアを15体倒す", "type": "kill", "target": "フレンジーボア", "area": "f1_hunt", "n": 15, "reward": {"xp": 380, "rarity": 2, "slot": "armor", "title": "t_wind"}},
	{"id": "q_well", "npc": "sage", "name": "古井戸の調査", "desc": "古井戸の洞窟の最奥にある宝箱を開ける", "type": "chest", "target": "f1_dun", "n": 1, "reward": {"xp": 450, "rarity": 3, "slot": "acc", "title": "t_delver"}},
	{"id": "q_lab1", "npc": "captain", "name": "迷宮区の主", "after": "q_slime", "desc": "第1層 迷宮区のボス「コボルド王 グラズ」を倒す", "type": "boss", "target": 1, "n": 1, "reward": {"xp": 900, "rarity": 3, "title": "t_mapper"}},
	{"id": "q_mist", "npc": "sage", "name": "霧の向こうへ", "after": "q_lab1", "desc": "第2層の「霧の野営地」にたどり着く", "type": "visit", "target": "f2_camp", "n": 1, "reward": {"xp": 300, "potion": 1, "title": "t_traveler"}},
	{"id": "q_hollow", "npc": "ranger", "name": "樹洞の秘宝", "desc": "朽ちた樹洞の最奥にある宝箱を開ける", "type": "chest", "target": "f2_dun", "n": 1, "reward": {"xp": 900, "rarity": 3, "title": "t_treasure"}},
	{"id": "q_wolf", "npc": "ranger", "name": "霧の狼", "desc": "霧の森でミストウルフを12体倒す", "type": "kill", "target": "ミストウルフ", "area": "f2_field", "n": 12, "reward": {"xp": 800, "rarity": 2, "slot": "weapon", "title": "t_blood"}},
	{"id": "q_lab2", "npc": "ranger", "name": "大樹の守り手", "after": "q_hollow", "desc": "第2層 迷宮区のボス「霧の大樹 ユグドラ」を倒す", "type": "boss", "target": 2, "n": 1, "reward": {"xp": 1800, "rarity": 3, "title": "t_breaker"}},
	{"id": "q_golem", "npc": "merchant", "name": "砂の巨人", "desc": "砂塵の荒野でサンドゴーレムを10体倒す", "type": "kill", "target": "サンドゴーレム", "area": "f3_field", "n": 10, "reward": {"xp": 1400, "rarity": 2, "slot": "armor", "title": "t_hawk"}},
	{"id": "q_temple", "npc": "merchant", "name": "埋もれた神殿", "desc": "埋もれた神殿の最奥にある宝箱を開ける", "type": "chest", "target": "f3_dun", "n": 1, "reward": {"xp": 1600, "rarity": 3, "title": "t_relic"}},
	{"id": "q_lab3", "npc": "merchant", "name": "砂塵の王", "after": "q_temple", "desc": "第3層 迷宮区のボス「砂塵の大蠍 スコルピオ」を倒す", "type": "boss", "target": 3, "n": 1, "reward": {"xp": 3000, "rarity": 4, "title": "t_phoenix"}},
	{"id": "q_bat", "npc": "hunter", "name": "洞窟の羽音", "desc": "古井戸の洞窟でケイブバットを10体倒す", "type": "kill", "target": "ケイブバット", "area": "f1_dun", "n": 10, "reward": {"xp": 420, "rarity": 2, "title": "t_night"}},
	{"id": "q_mush", "npc": "sage", "name": "毒キノコ採り", "desc": "ひだまりの草原でドクキノコを6体倒す", "type": "kill", "target": "ドクキノコ", "area": "f1_field", "n": 6, "reward": {"xp": 260, "potion": 1, "title": "t_spore"}},
	{"id": "q_shaman", "npc": "ranger", "name": "まじない師の影", "desc": "朽ちた樹洞でゴブリンシャーマンを8体倒す", "type": "kill", "target": "ゴブリンシャーマン", "area": "f2_dun", "n": 8, "reward": {"xp": 1000, "rarity": 3, "slot": "acc", "title": "t_spell"}},
	{"id": "q_scorp", "npc": "merchant", "name": "大蠍の尾", "desc": "蠍の巣でジャイアントスコーピオンを10体倒す", "type": "kill", "target": "ジャイアントスコーピオン", "area": "f3_hunt", "n": 10, "reward": {"xp": 1500, "rarity": 3, "slot": "weapon", "title": "t_shell"}},
]

static var id_counter: int = 0

static func npcs_for(area_id: String) -> Array:
	return NPCS.get(area_id, []).duplicate(true)

static func all() -> Array:
	return QUESTS

static func index() -> Dictionary:
	var result := {}
	for q in QUESTS:
		result[String(q.id)] = q
	return result

static func quest_state(character: Dictionary, quest_id: String) -> Variant:
	return character.get("quests", {}).get(quest_id)

## quests.js questAvailable
static func quest_available(character: Dictionary, quest: Dictionary) -> bool:
	var states: Dictionary = character.get("quests", {})
	if states.has(String(quest.id)):
		return false
	var after := String(quest.get("after", ""))
	return after == "" or bool(states.get(after, {}).get("claimed", false))

static func quests_for_npc(character: Dictionary, npc_id: String) -> Array:
	var result: Array = []
	for q in QUESTS:
		if String(q.npc) == npc_id and (quest_state(character, String(q.id)) != null or quest_available(character, q)):
			result.append(q)
	return result

## quests.js questProgress。進捗はイベントごとに1ずつ、n で止める。
static func progress(character: Dictionary, event: Dictionary) -> Array:
	var changed: Array = []
	var states: Dictionary = character.get("quests", {})
	for q in QUESTS:
		var state: Variant = states.get(String(q.id))
		if not state is Dictionary or bool(state.get("done", false)):
			continue
		var hit := false
		var event_type := String(event.get("type", ""))
		if q.type == "kill" and event_type == "kill" and String(event.get("name", "")) == String(q.target):
			hit = not q.has("area") or String(q.area) == String(event.get("area", ""))
		elif q.type == "chest" and event_type == "chest":
			hit = String(event.get("area", "")) == String(q.target)
		elif q.type == "boss" and event_type == "boss":
			hit = int(event.get("floor", 0)) == int(q.target)
		elif q.type == "visit" and event_type == "visit":
			hit = String(event.get("area", "")) == String(q.target)
		if not hit:
			continue
		state.p = mini(int(state.get("p", 0)) + 1, int(q.n))
		if int(state.p) >= int(q.n):
			state.done = true
		changed.append(q)
	return changed

static func accept(character: Dictionary, quest_id: String, current_area: String = "") -> Array:
	var q: Variant = index().get(quest_id)
	if not q is Dictionary or quest_state(character, quest_id) != null or not quest_available(character, q):
		return []
	if not character.get("quests") is Dictionary:
		character["quests"] = {}
	character["quests"][quest_id] = {"p": 0}
	if String(q.type) == "visit" and current_area == String(q.target):
		return progress(character, {"type": "visit", "area": q.target})
	return []

static func reward(quest: Dictionary) -> Dictionary:
	var result: Dictionary = quest.reward.duplicate(true)
	result["xp"] = roundi(float(result.xp) * float(GameRules.data()["balance"]["questXp"]))
	return result

## progress.js claimQuest のアイテムレベル・第1層補正・15%上振れ。
static func reward_item_params(character: Dictionary, floor_n: int, upgrade_roll: float) -> Dictionary:
	var floor_level := 1 + (floor_n - 1) * int(GameRules.data()["balance"]["floorSpacing"])
	return {"ilvl": maxi(int(character.get("lv", 1)), floor_level + 3)}

static func reward_item_params_for(quest: Dictionary, character: Dictionary, floor_n: int, upgrade_roll: float) -> Dictionary:
	var result := reward_item_params(character, floor_n, upgrade_roll)
	var rarity := int(quest.reward.get("rarity", -1))
	if rarity >= 0:
		var base := mini(rarity, 2) if floor_n == 1 else rarity
		result["grade"] = mini(5, base + (1 if upgrade_roll < 0.15 else 0))
	else:
		result.erase("grade")
	return result

static func reward_summary(quest: Dictionary) -> String:
	var r := reward(quest)
	var parts: Array[String] = ["経験値 %d" % int(r.xp)]
	if r.has("rarity"):
		var slot_name: String = String({"weapon": "武器", "armor": "防具", "acc": "装飾品"}.get(String(r.get("slot", "")), "装備"))
		parts.append(("伝説の" if int(r.rarity) >= 4 else "特性%dつ付きの" % int(r.rarity)) + slot_name)
	if r.has("potion"):
		parts.append("ポーション所持数 +%d" % int(r.potion))
	if r.has("title"):
		var title: Dictionary = TITLES.get(String(r.title), {})
		parts.append("称号「%s」（%s）" % [String(title.get("name", r.title)), String(title.get("desc", ""))])
	return "・".join(parts)

static func hud_entries(character: Dictionary) -> Array:
	var entries: Array = []
	for q in QUESTS:
		var state: Variant = quest_state(character, String(q.id))
		if not state is Dictionary or bool(state.get("claimed", false)):
			continue
		entries.append({"name": q.name, "desc": q.desc, "p": int(state.get("p", 0)), "n": int(q.n), "done": bool(state.get("done", false))})
	return entries

static func make_title_item(title_id: String) -> Dictionary:
	var title: Dictionary = TITLES.get(title_id, {})
	id_counter += 1
	return {"id": "qtitle_%s_%d" % [title_id, id_counter], "slot": "title", "kind": null, "rarity": int(title.get("rarity", 3)), "ilvl": 1,
		"affixes": [], "enh": 0, "v": 3, "weight": 0, "name": "「%s」" % String(title.get("name", title_id)), "title": title_id,
		"req": title.get("req", null)}
