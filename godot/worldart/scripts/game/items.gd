class_name GameItems
extends RefCounted
## 落とし物と持ち物（L27 CP5）。元は public/js/game/loot.js（spawnDrop・updateDrops・pickupDrop）と、持ち物の画面（ui）の最小限。
## 落とし物はブラウザ版と同じく画面側だけのもの: サーバーの loot で落ち、体が触れる（1.3m）と拾う。150 秒で消える。持ち物は 60 個まで。
## 持ち物の画面（I）: 武器・防具・装飾品・称号の装備、分解、説明。

const LOOT := {"touch": 1.3, "life": 150.0, "max": 60}
const InventoryPanel = preload("res://scripts/game/inventory_panel.gd")
const QuestModel = preload("res://scripts/game/quests.gd")
# public/shared/data.js の salvageValue(ilvl=20)/4 と salvageMats(enh=0) を Node 22 で出力した表。
const SALVAGE_BASE := [1, 2, 5, 14, 40, 80, 130, 400]
const SALVAGE_SHARDS := [1, 1, 2, 4, 8, 12, 16, 30]
# public/shared/data.js ENH_MAX / ENH_RATE / enhCost / DROP_GRADES / ARMOR_TYPES / ACC_BASE / TIER_PREFIX。
const ENH_MAX := 10
const ENH_RATE := [1.0, 1.0, 1.0, 1.0, 1.0, 0.8, 0.65, 0.5, 0.4, 0.3]
const ENH_SHARDS := [1, 1, 2, 2, 3, 4, 6, 8, 10, 12]
const CRAFT_MAX_TIER := 5
const MAX_TIER := 7
const QUALITY_STEPS := [0.07, 0.24, 0.45, 0.64, 0.82]
const DROP_GRADES := [
	{"affixes": 0, "mult": [0.92, 1.18]}, {"affixes": 1, "mult": [0.95, 1.25]},
	{"affixes": 2, "mult": [1.0, 1.32]}, {"affixes": 3, "mult": [1.05, 1.4]},
	{"affixes": 3, "mult": [1.7, 1.7], "rarity": 6}, {"affixes": 4, "mult": [2.1, 2.1], "rarity": 7},
]
const TIER_PREFIX := ["木の", "青銅の", "鉄の", "鋼の", "銀の", "ミスリルの", "魔鋼の", "アダマンの", "星鉄の", "天鋼の", "神鉄の"]
const ACC_BASE := ["お守り", "銅の指輪", "銀の首飾り", "翠玉の指輪", "紅玉の護符", "星の耳飾り", "天球の指輪"]
const ARMOR_TYPES := [
	{"id": "cloth", "name": "布の服", "cls": "light", "lv": 1, "trait": ["move", 3]}, {"id": "tunic", "name": "革の胴着", "cls": "light", "lv": 1, "trait": ["aspd", 3]},
	{"id": "hunter", "name": "狩人の外套", "cls": "light", "lv": 4, "trait": ["crit", 3]}, {"id": "robe", "name": "魔導ローブ", "cls": "light", "lv": 6, "trait": ["cdr", 6]},
	{"id": "ninja", "name": "忍び装束", "cls": "light", "lv": 8, "trait": ["move", 6]}, {"id": "bard", "name": "吟遊詩人の衣", "cls": "light", "lv": 10, "trait": ["aspd", 5]},
	{"id": "leather", "name": "革の鎧", "cls": "medium", "lv": 1, "trait": ["hpp", 4]}, {"id": "chain", "name": "鎖帷子", "cls": "medium", "lv": 3, "trait": ["def", 2]},
	{"id": "scale", "name": "鱗鎧", "cls": "medium", "lv": 6, "trait": ["critd", 8]}, {"id": "brigandine", "name": "ブリガンダイン", "cls": "medium", "lv": 8, "trait": ["atkp", 4]},
	{"id": "ranger", "name": "遊撃兵の胸甲", "cls": "medium", "lv": 10, "trait": ["move", 4]}, {"id": "dragonhide", "name": "竜革の鎧", "cls": "medium", "lv": 12, "trait": ["vamp", 1]},
	{"id": "breast", "name": "鉄の胸当て", "cls": "heavy", "lv": 1, "trait": ["def", 2]}, {"id": "plate", "name": "板金鎧", "cls": "heavy", "lv": 4, "trait": ["hpp", 6]},
	{"id": "knight", "name": "騎士の甲冑", "cls": "heavy", "lv": 7, "trait": ["def", 3]}, {"id": "oyoroi", "name": "大鎧", "cls": "heavy", "lv": 9, "trait": ["atkp", 5]},
	{"id": "paladin", "name": "聖騎士の鎧", "cls": "heavy", "lv": 11, "trait": ["hpp", 8]}, {"id": "fortress", "name": "城塞の重甲冑", "cls": "heavy", "lv": 13, "trait": ["def", 4]},
]
static var item_seq: int = 0

var g
var drops := []   # {it, x, z, t, node, label}
var inventory_panel
var salvage_arm: Dictionary = {}


func _init(game) -> void:
	g = game


static func rarity_color(r: int) -> Color:
	return Color.html(String(GameRules.data()["rarities"][clampi(r, 0, 7)]["color"]))   # data.js RARITIES の色（'#rrggbb'）


func on_loot(m: Dictionary) -> void:
	for d in m.get("items", []):
		var it: Dictionary = d["it"]
		if salvage_target(it):
			# browser の net-client.js / items.js と同じ対象条件。Godot では獲得分をキャラクターに反映する。
			_harvest(it)
			_salvage_gold(salvage_value(it))
			continue
		_spawn_drop(it, float(d["x"]), float(d["z"]))


func spawn_quest_reward(it: Dictionary, x: float, z: float) -> void:
	# progress.js claimQuest は report した位置に通常の装備ドロップを出す。
	_spawn_drop(it, x, z)


func _spawn_drop(it: Dictionary, x: float, z: float) -> void:
	var col := rarity_color(int(it.get("rarity", 0)))
	var n := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = Vector3(0.45, 0.25, 0.45)
	n.mesh = bm; n.material_override = GameVisuals.mat(col)
	n.position = Vector3(x, g.world.ground_y(x, z) + 0.15, z)
	g.world.add_child(n)
	var lb := GameVisuals.label(String(it.get("name", "?")), col)
	lb.position = n.position + Vector3(0, 0.8, 0)
	g.world.add_child(lb)
	var beam: Node3D
	var transcend_stars := _transcend_count(it)
	var rarity := int(it.get("rarity", 0))
	if transcend_stars > 0:
		beam = g.combat.ctx._fx().beam(x, z, 0xff7ab0, 12.0 + transcend_stars * 4.0, 0.45 + transcend_stars * 0.1) # loot.js landDrop / fx.js FX.beam
	elif rarity >= 4:
		beam = g.combat.ctx._fx().beam(x, z, col, 14.0 if rarity == 4 else 22.0, 0.45 if rarity == 4 else 0.7) # loot.js landDrop / fx.js FX.beam
	drops.append({"it": it, "x": x, "z": z, "t": 0.0, "node": n, "label": lb, "beam": beam})
	if Vector2(x - g.me.x, z - g.me.z).length() < 40.0:
		var stars := _transcend_count(it)
		g._sfx("drop", {"rarity": int(it.get("rarity", 0)), "slot": String(it.get("slot", "")), "stars": stars}) # loot.js landDrop L31: audio.sfx('drop', {rarity, slot, stars})


func clear() -> void:
	for d in drops:
		d.node.queue_free(); d.label.queue_free()
		if d.get("beam") != null: g.combat.ctx._fx().remove_item(d.beam)
	drops.clear()


func update(dt: float) -> void:
	for i in range(drops.size() - 1, -1, -1):
		var d: Dictionary = drops[i]
		d.t += dt
		d.node.rotation.y = d.t * 1.5
		if d.t > LOOT.life:
			d.node.queue_free(); d.label.queue_free()
			if d.get("beam") != null: g.combat.ctx._fx().remove_item(d.beam)
			drops.remove_at(i); continue
		if not g.me.dead and not g.me.crawl and Vector2(d.x - g.me.x, d.z - g.me.z).length() <= LOOT.touch:
			pickup(i)


func pickup(i: int) -> void:
	var inv: Array = g.ch.get("inv", [])
	if inv.size() >= LOOT.max:
		g._banner("持ち物がいっぱい！")
		return
	var d: Dictionary = drops[i]
	inv.push_front(d.it)
	g.ch["inv"] = inv
	g._save_char()
	var r := int(d.it.get("rarity", 0))
	g._log("%s「%s」を入手" % [GameRules.data()["rarities"][r]["name"], d.it.get("name", "?")], rarity_color(r))
	g._sfx("pickup") # loot.js pickupDrop L61: audio.sfx('pickup')
	if g.args.has("bot"): print("PICKUP %s %s" % [d.it.get("slot"), d.it.get("name")])
	d.node.queue_free(); d.label.queue_free()
	if d.get("beam") != null: g.combat.ctx._fx().remove_item(d.beam)
	drops.remove_at(i)
	refresh()


func apply_inventory_demo() -> void:
	# --inv-demo 撮影用。user:// のキャラクターを読まず、同じ状態を毎回作る。
	var eq := {
		"weapon": {"id": "demo-eq-weapon", "slot": "weapon", "kind": "sword", "rarity": 4, "ilvl": 18, "affixes": [["atkp", 3], ["crit", 2]], "enh": 2, "atk": 30, "name": "紅蓮の細剣", "skill": "leap", "fx": []},
		"armor": {"id": "demo-eq-armor", "slot": "armor", "armor": "medium", "atype": "leather", "rarity": 3, "ilvl": 16, "affixes": [["hpp", 3], ["def", 2]], "enh": 1, "hp": 18, "def": 4, "base": ["def", 2], "name": "革の鎧", "fx": []},
		"acc": {"id": "demo-eq-acc", "slot": "acc", "rarity": 2, "ilvl": 14, "affixes": [["crit", 2]], "enh": 0, "atk": 4, "hp": 3, "name": "銀の首飾り", "fx": []},
		"title": {"id": "demo-eq-title", "slot": "title", "kind": null, "rarity": 4, "ilvl": 1, "affixes": [], "enh": 0, "weight": 0, "name": "「コボルド王を討つ者」", "title": "t_boss1", "req": null},
	}
	var inv := [
		{"id": "demo-inv-weapon", "slot": "weapon", "kind": "sword", "rarity": 5, "ilvl": 22, "affixes": [["atkp", 4], ["sv_blaze", 3], ["crit", 6]], "enh": 3, "atk": 34, "name": "炎纏う剣", "skill": "leap", "fx": []},
		{"id": "demo-inv-cloth", "slot": "armor", "armor": "light", "atype": "cloth", "rarity": 0, "ilvl": 8, "affixes": [], "enh": 0, "hp": 6, "def": 0, "name": "布の服", "fx": []},
		{"id": "demo-inv-ring", "slot": "acc", "rarity": 1, "ilvl": 10, "affixes": [["crit", 1]], "enh": 0, "atk": 2, "name": "銅の指輪", "fx": []},
		{"id": "demo-inv-greatsword", "slot": "weapon", "kind": "greatsword", "rarity": 2, "ilvl": 14, "affixes": [["atkp", 2]], "enh": 1, "atk": 24, "name": "砕岩の大剣", "skill": "cyclone", "fx": []},
		{"id": "demo-inv-dagger", "slot": "weapon", "kind": "dagger", "rarity": 3, "ilvl": 15, "affixes": [["move", 3], ["crit", 3]], "enh": 0, "atk": 18, "name": "夜風の短剣", "skill": "shadow", "fx": []},
		{"id": "demo-inv-spear", "slot": "weapon", "kind": "spear", "rarity": 4, "ilvl": 18, "affixes": [["hpp", 2], ["def", 2]], "enh": 1, "atk": 27, "name": "銀嶺の盾槍", "skill": "lance", "fx": []},
		{"id": "demo-inv-axe", "slot": "weapon", "kind": "axe", "rarity": 3, "ilvl": 16, "affixes": [["atkp", 3]], "enh": 2, "atk": 25, "name": "旅人の斧", "skill": "rampage", "fx": []},
		{"id": "demo-inv-bow", "slot": "weapon", "kind": "bow", "rarity": 2, "ilvl": 13, "affixes": [["crit", 3]], "enh": 0, "atk": 17, "name": "狙撃の長弓", "fx": []},
		{"id": "demo-inv-dragonhide", "slot": "armor", "armor": "medium", "atype": "dragonhide", "rarity": 4, "ilvl": 19, "affixes": [["vamp", 3]], "enh": 2, "hp": 22, "def": 5, "base": ["vamp", 1], "name": "竜革の鎧", "fx": []},
		{"id": "demo-inv-heavy", "slot": "armor", "armor": "heavy", "atype": "plate", "rarity": 5, "ilvl": 20, "affixes": [["def", 3]], "enh": 4, "hp": 30, "def": 8, "name": "白銀の甲冑", "fx": []},
		{"id": "demo-inv-amulet", "slot": "acc", "rarity": 0, "ilvl": 7, "affixes": [["hpp", 1]], "enh": 0, "hp": 4, "name": "お守り", "fx": []},
		{"id": "demo-inv-title", "slot": "title", "kind": null, "rarity": 3, "ilvl": 1, "affixes": [], "enh": 0, "weight": 0, "name": "「疾風」", "title": "t_wind", "req": null},
	]
	g.ch = {
		"name": "InvTest", "color": "#448a9b", "lv": 5, "xp": 130, "gold": 1234,
		"eq": eq, "inv": inv, "autoSalvage": -1,
		"tree": {}, "prof": {}, "wt": {}, "slots": ["focus", "warstomp"],
		"mats": {"shard": 23, "gems": {}}, "codex": {}, "titles": {},
	}
	print("INV_DEMO_STATE_JSON=", JSON.stringify(g.ch))


## いちばん近い落とし物（自動操作が拾いに行く）
func nearest() -> Variant:
	var best = null; var bd := 1e9
	for d in drops:
		var dd := Vector2(d.x - g.me.x, d.z - g.me.z).length()
		if dd < bd: bd = dd; best = d
	return best


# ---------------------------------------------------------------- 持ち物の画面
func build_ui(root: Control) -> void:
	inventory_panel = InventoryPanel.new(g)
	inventory_panel.build_ui(root)


func toggle() -> void:
	if inventory_panel != null:
		inventory_panel.toggle()


## public/shared/data.js transcendCount と同じ条件で、ドロップ音の stars を求める。
func _transcend_count(it: Dictionary) -> int:
	var count := 0
	for a in it.get("affixes", []):
		if GameRules.data()["skillVariants"].has(String(a[0])) or int(a[1]) >= 6: count += 1
	return count


func describe(it: Dictionary) -> String:
	var s := "%s  [%s]  iLv%d" % [display_name(it), GameRules.data()["rarities"][clampi(int(it.get("rarity", 0)), 0, 7)]["name"], int(it.get("ilvl", 1))]
	if String(it.get("slot", "")) == "weapon":
		s += "\n%s  攻撃力 +%.0f" % [GameRules.data()["weapons"].get(it.get("kind", ""), {}).get("name", "?"), float(it.get("atk", 0)) * GameRules.enh_mult(it)]
	if it.has("hp"): s += "  HP +%.0f" % (float(it["hp"]) * GameRules.enh_mult(it))
	if it.has("def"): s += "  被ダメ軽減 +%.1f%%" % (float(it["def"]) * GameRules.enh_mult(it))
	for a in it.get("affixes", []):
		var data = GameRules.data()["affixes"].get(String(a[0]))
		if data != null: s += "\n  %s +%s%s" % [data["name"], data["tiers"][int(a[1]) - 1], data["unit"]]
	return s


## public/shared/data.js enhCost
static func enhancement_cost(it: Dictionary) -> Dictionary:
	var enh := int(it.get("enh", 0))
	return {"gold": roundi((20.0 + float(it.get("ilvl", 1)) * 6.0) * pow(1.55, enh)), "shard": ENH_SHARDS[clampi(enh, 0, ENH_SHARDS.size() - 1)]}


## public/shared/data.js affixCost / skillCost / loreCost
static func affix_cost(it: Dictionary) -> Dictionary:
	return {"gold": 50 + int(it.get("ilvl", 1)) * 10, "gem": 1}

static func skill_cost(it: Dictionary) -> Dictionary:
	return {"gold": 40 + int(it.get("ilvl", 1)) * 8}

static func lore_cost(it: Dictionary) -> Dictionary:
	return {"gold": 300 + int(it.get("ilvl", 1)) * 20, "shard": 10}


## public/shared/data.js weightedTier。random_value は 0..1 の試験入力も受け取る。
static func weighted_tier(maximum: int, high: bool, random_value: float) -> int:
	if maximum <= 0:
		return 1
	var weights: Array[float] = []
	var total := 0.0
	for i in maximum:
		var weight := pow(0.6, float(maximum - 1 - i if high else i))
		weights.append(weight)
		total += weight
	var roll := random_value * total
	for i in maximum:
		roll -= weights[i]
		if roll <= 0.0:
			return i + 1
	return 1


## public/shared/data.js itemQuality / qualityRarity / gradeItem
static func item_quality(it: Dictionary) -> float:
	var ilvl := int(it.get("ilvl", 1))
	var cap := maxi(3, maxi(1, mini(CRAFT_MAX_TIER, 1 + int(floor(float(ilvl) / 5.0)))))
	var affix_sum := 0.0
	var variants: Dictionary = GameRules.data()["skillVariants"]
	for affix in it.get("affixes", []):
		var key := String(affix[0])
		var tier := float(affix[1])
		affix_sum += 1.25 if variants.has(key) else minf(1.5, tier / float(cap))
	var bm := clampf((float(it.get("bm", 1.1)) - 0.92) / 0.48, 0.0, 1.0)
	return 0.7 * affix_sum / 3.0 + 0.3 * bm + float(it.get("enh", 0)) * 0.03


static func quality_rarity(quality: float) -> int:
	var rarity := 0
	while rarity < QUALITY_STEPS.size() and quality >= float(QUALITY_STEPS[rarity]):
		rarity += 1
	return rarity


static func grade_item(it: Dictionary) -> void:
	if String(it.get("slot", "")) == "title" or (it.get("unique") != null and int(it.get("rarity", 0)) >= 6):
		return
	var rarity := quality_rarity(item_quality(it))
	it["rarity"] = maxi(4, rarity) if it.get("unique") != null else rarity


func smith_enhance(it: Dictionary, random_roll: float = -1.0) -> Dictionary:
	if not _owns_item(it) or String(it.get("slot", "")) == "title":
		return {"ok": false, "msg": "強化できない装備です"}
	var enh := int(it.get("enh", 0))
	if enh >= ENH_MAX:
		return {"ok": false, "msg": "これ以上は強化できません"}
	var cost := enhancement_cost(it)
	var error := _smith_pay(cost)
	if error != "": return {"ok": false, "msg": error}
	var roll := randf() if random_roll < 0.0 else random_roll
	var ok := roll < float(ENH_RATE[enh])
	var up := ""
	if ok:
		it["enh"] = enh + 1
		up = _regrade(it)
		g._sfx("perfect" if int(it.enh) >= 6 else "levelup")
		if g is Node3D: g.combat.ctx._fx().beam(g.me.x, g.me.z, 0xffa236 if int(it.enh) >= 6 else 0xffd84a, 10.0, 0.6, 0.8) # items.js smithEnhance / fx.js FX.beam
	else:
		g._sfx("block")
	g._recalc()
	var message := "+%d に強化した！%s" % [int(it.get("enh", 0)), up] if ok else "強化に失敗した…（+%d のまま）" % int(it.get("enh", 0))
	return {"ok": ok, "msg": message, "enh": int(it.get("enh", 0))}


func smith_affix(it: Dictionary, slot_index: int, key: String, random_roll: float = -1.0) -> Dictionary:
	var affixes: Array = it.get("affixes", [])
	if not _owns_item(it) or slot_index < 0 or slot_index >= affixes.size():
		return {"ok": false, "msg": "特性を選んでください"}
	var codex: Dictionary = g.ch.get("codex", {})
	if int(codex.get(key, 0)) <= 0:
		return {"ok": false, "msg": "まだ特性リストにない特性です（その特性の付いた装備を分解すると追加されます）"}
	var variants: Dictionary = GameRules.data()["skillVariants"]
	for i in affixes.size():
		if i == slot_index: continue
		if String(affixes[i][0]) == key:
			return {"ok": false, "msg": "同じ特性はひとつの装備に1つまでです"}
		if variants.has(key) and variants.has(String(affixes[i][0])):
			return {"ok": false, "msg": "スキル変化は武器に1つまでです"}
	if variants.has(key) and String(it.get("slot", "")) != "weapon":
		return {"ok": false, "msg": "スキル変化は武器に1つまでです"}
	var cost := affix_cost(it)
	cost["gemKey"] = key
	var error := _smith_pay(cost)
	if error != "": return {"ok": false, "msg": error}
	var roll := randf() if random_roll < 0.0 else random_roll
	var tier := weighted_tier(mini(int(codex[key]), CRAFT_MAX_TIER), false, roll)
	var data: Dictionary = GameRules.data()
	var value: Variant = tier if variants.has(key) else data["affixes"][key]["tiers"][tier - 1]
	affixes[slot_index] = [key, tier, value]
	it["affixes"] = affixes
	var up := _regrade(it)
	g._sfx("buff")
	g._recalc()
	return {"ok": true, "msg": "%s T%d を付与した%s" % [_affix_name(key), tier, up], "tier": tier}


func smith_skill(it: Dictionary, skill_id: String) -> Dictionary:
	var data: Dictionary = GameRules.data()
	var pool: Array = data["weaponSkillPool"].get(String(it.get("kind", "")), [])
	if not _owns_item(it) or String(it.get("slot", "")) != "weapon" or not pool.has(skill_id):
		return {"ok": false, "msg": "変更できないスキルです"}
	if String(it.get("skill", "")) == skill_id:
		return {"ok": false, "msg": "すでにそのスキルです"}
	var error := _smith_pay(skill_cost(it))
	if error != "": return {"ok": false, "msg": error}
	it["skill"] = skill_id
	g._sfx("skill")
	g._recalc()
	var skill: Dictionary = data["skills"]["weapon"].get(skill_id, {})
	return {"ok": true, "msg": "武器スキルを「%s」に変えた" % String(skill.get("name", skill_id))}


func smith_lore(it: Dictionary) -> Dictionary:
	if not _owns_item(it) or int(it.get("rarity", 0)) < 6 or it.get("fx", []).is_empty() or String(it.get("slot", "")) == "title":
		return {"ok": false, "msg": "伝説・神器の装備だけが伝承化できます"}
	var error := _smith_pay(lore_cost(it))
	if error != "": return {"ok": false, "msg": error}
	var effects: Array = it.get("fx", []).duplicate()
	var requirement = "melee" if effects.has("wave") else null
	item_seq += 1
	var title := {"id": "lore_%d_%d" % [Time.get_ticks_usec(), item_seq], "slot": "title", "kind": null, "rarity": int(it.rarity), "ilvl": int(it.ilvl),
		"affixes": [], "enh": 0, "v": 3, "weight": 0, "name": "「%s」の伝承" % String(it.get("name", "装備")),
		"fx": effects, "lore": it.get("lore", ""), "req": requirement, "from": String(it.get("name", "装備"))}
	var index := _index_of(it)
	if index >= 0:
		g.ch["inv"].remove_at(index)
	else:
		var equipped: Dictionary = g.ch.get("eq", {})
		for slot in equipped.keys():
			if _same_item(equipped[slot], it): equipped[slot] = null
		g.ch["eq"] = equipped
	g.ch["inv"].push_front(title)
	g._sfx("clear")
	if g is Node3D: g.combat.ctx._fx().beam(g.me.x, g.me.z, 0xffa236, 16.0, 1.0, 1.4) # items.js smithLore / fx.js FX.beam
	g._recalc()
	return {"ok": true, "msg": "%s を手に入れた" % String(title.name), "id": title.id}


func make_quest_reward(quest: Dictionary, floor_n: int, upgrade_roll: float) -> Dictionary:
	var params := QuestModel.reward_item_params_for(quest, g.ch, floor_n, upgrade_roll)
	return _make_item(int(params.ilvl), int(params.get("grade", 0)), String(quest.reward.get("slot", "")))


## public/shared/data.js makeItem。debug-panel は kind / unique_def を指定して同じ基礎計算を使う。
func _make_item(ilvl: int, grade: int, forced_slot: String, forced_kind := "", unique_def: Dictionary = {}) -> Dictionary:
	var data: Dictionary = GameRules.data()
	grade = clampi(grade, 0, DROP_GRADES.size() - 1)
	var drop_grade: Dictionary = DROP_GRADES[grade]
	if not unique_def.is_empty():
		forced_slot = String(unique_def.get("slot", forced_slot))
		forced_kind = String(unique_def.get("kind", forced_kind))
	var slot: String = forced_slot if forced_slot != "" else String(["weapon", "weapon", "weapon", "armor", "acc"][randi_range(0, 4)])
	var kinds: Array = data["weapons"].keys()
	var kind := forced_kind if slot == "weapon" and forced_kind != "" else String(kinds[randi_range(0, kinds.size() - 1)]) if slot == "weapon" else ""
	var multiplier: Array = drop_grade["mult"]
	var bm := roundf(randf_range(float(multiplier[0]), float(multiplier[1])) * 1000.0) / 1000.0
	var growth := pow(float(data["balance"]["playerGrowth"]), ilvl - 1) * bm
	item_seq += 1
	var item := {"id": "qitem_%d_%d" % [Time.get_ticks_usec(), item_seq], "slot": slot, "kind": kind if kind != "" else null,
		"rarity": int(drop_grade.get("rarity", 0)), "ilvl": ilvl, "bm": bm, "affixes": [], "enh": 0, "v": 3}
	var prefix_index := clampi(int(floor(float(ilvl - 1) / 5.0)), 0, TIER_PREFIX.size() - 1)
	if slot == "weapon":
		item["atk"] = roundi(7.0 * growth)
		item["name"] = TIER_PREFIX[prefix_index] + String(data["weapons"][kind]["name"])
		var skill_pool: Array = data["weaponSkillPool"][kind]
		item["skill"] = skill_pool[randi_range(0, skill_pool.size() - 1)]
	elif slot == "armor":
		var pool: Array = []
		for armor_type in ARMOR_TYPES:
			var wanted_armor := String(unique_def.get("armor", ""))
			if int(armor_type.lv) <= maxi(ilvl, 1) and (wanted_armor == "" or String(armor_type.cls) == wanted_armor): pool.append(armor_type)
		if pool.is_empty(): pool = [ARMOR_TYPES[0], ARMOR_TYPES[1], ARMOR_TYPES[6], ARMOR_TYPES[12]]
		var armor_type: Dictionary = pool[randi_range(0, pool.size() - 1)]
		var armor: Dictionary = data["armorClasses"][String(armor_type.cls)]
		item["armor"] = armor_type.cls
		item["atype"] = armor_type.id
		item["base"] = armor_type.trait.duplicate()
		item["hp"] = roundi(45.0 * growth * float(armor.hp))
		item["def"] = int(armor.def)
		item["name"] = String(unique_def["name"]) if not unique_def.is_empty() else armor_type.name
	else:
		item["atk"] = roundi(2.5 * growth)
		item["hp"] = roundi(15.0 * growth)
		item["name"] = String(unique_def["name"]) if not unique_def.is_empty() else ACC_BASE[mini(ACC_BASE.size() - 1, int(floor(float(ilvl - 1) / 8.0)))]
	if slot == "weapon" and not unique_def.is_empty(): item["name"] = String(unique_def["name"])
	if not unique_def.is_empty():
		item["unique"] = String(unique_def["key"])
		item["fx"] = unique_def.get("fx", []).duplicate()
		item["lore"] = String(unique_def.get("lore", ""))
	item["weight"] = GameRules.item_weight(item)
	var keys: Array = data["affixes"].keys()
	for i in range(keys.size() - 1, 0, -1):
		var j := randi_range(0, i)
		var swap = keys[i]; keys[i] = keys[j]; keys[j] = swap
	for index in int(drop_grade.affixes):
		var key := String(keys[index])
		var tier := _roll_tier(ilvl, grade)
		item.affixes.append([key, tier, data["affixes"][key]["tiers"][tier - 1]])
	if slot == "weapon" and not item.affixes.is_empty() and randf() < [0.0, 0.0, 0.08, 0.15, 0.3, 0.45][grade]:
		var variant_keys: Array = data["skillVariants"].keys()
		var variant := String(variant_keys[randi_range(0, variant_keys.size() - 1)])
		var variant_tier := _roll_tier(ilvl, grade)
		item.affixes[item.affixes.size() - 1] = [variant, variant_tier, variant_tier]
	grade_item(item)
	return item


func _roll_tier(ilvl: int, grade: int) -> int:
	var maximum := maxi(1, mini(MAX_TIER, 1 + int(floor(float(ilvl) / 5.0)) + (1 if grade >= 4 else 0)))
	var tier := weighted_tier(mini(maximum, CRAFT_MAX_TIER), true, randf())
	if maximum >= 6 and tier == CRAFT_MAX_TIER and randf() < 0.25 + float(grade) * 0.05: tier = 6
	if maximum >= 7 and tier == 6 and randf() < 0.2 + float(grade) * 0.04: tier = 7
	return tier


func _smith_pay(cost: Dictionary) -> String:
	var materials: Dictionary = g.ch.get("mats", {})
	var gems: Dictionary = materials.get("gems", {})
	if int(g.ch.get("gold", 0)) < int(cost.get("gold", 0)): return "ゴールドが足りません"
	if int(materials.get("shard", 0)) < int(cost.get("shard", 0)): return "強化の欠片が足りません"
	if cost.has("gemKey") and int(gems.get(String(cost.gemKey), 0)) < int(cost.get("gem", 0)): return "宝石が足りません"
	g.ch["gold"] = int(g.ch.get("gold", 0)) - int(cost.get("gold", 0))
	materials["shard"] = int(materials.get("shard", 0)) - int(cost.get("shard", 0))
	if cost.has("gemKey"):
		gems[String(cost.gemKey)] = int(gems.get(String(cost.gemKey), 0)) - int(cost.get("gem", 0))
	materials["gems"] = gems
	g.ch["mats"] = materials
	return ""


func _regrade(it: Dictionary) -> String:
	var before := int(it.get("rarity", 0))
	grade_item(it)
	var after := int(it.get("rarity", before))
	if after == before: return ""
	var rarities: Array = GameRules.data()["rarities"]
	var label := "「%s」から「%s」に%s" % [String(rarities[before]["name"]), String(rarities[after]["name"]), "上がった" if after > before else "下がった"]
	if g.hud_ui != null: g.hud_ui.toast("%s：%s" % [String(it.get("name", "装備")), label], rarity_color(after), after > before)
	return "（%s）" % label


func _owns_item(it: Dictionary) -> bool:
	for candidate in g.ch.get("inv", []):
		if _same_item(candidate, it): return true
	for candidate in g.ch.get("eq", {}).values():
		if _same_item(candidate, it): return true
	return false


func _same_item(candidate: Variant, target: Dictionary) -> bool:
	if not candidate is Dictionary: return false
	var id := String(target.get("id", ""))
	return candidate == target or (id != "" and String(candidate.get("id", "")) == id)


func equip(i: int) -> void:
	var inv: Array = g.ch["inv"]
	var it: Dictionary = inv[i]
	var slot := String(it.get("slot", ""))
	if not slot in ["weapon", "armor", "acc", "title"]:
		g._banner("この種類はまだ装備できない"); return
	var eq: Dictionary = g.ch.get("eq", {})
	inv.remove_at(i)
	if eq.get(slot) is Dictionary: inv.insert(i, eq[slot])
	eq[slot] = it
	g.ch["eq"] = eq
	g.ch["inv"] = inv
	g._recalc()
	g._sfx("equip") # items.js equip L18: audio.sfx('equip')
	g._log("装備: " + String(it.get("name", "?")))
	refresh()


func equip_item(it: Dictionary) -> void:
	var index := _index_of(it)
	if index >= 0:
		equip(index)


func unequip(slot: String) -> void:
	var eq: Dictionary = g.ch.get("eq", {})
	if slot == "weapon" or not (eq.get(slot) is Dictionary):
		return
	var inv: Array = g.ch.get("inv", [])
	if inv.size() >= LOOT.max:
		g._banner("持ち物がいっぱいです")
		return
	inv.push_front(eq[slot])
	eq[slot] = null
	g.ch["eq"] = eq
	g.ch["inv"] = inv
	g._recalc()
	g._sfx("equip")
	refresh()


func salvage_item(it: Dictionary) -> void:
	var index := _index_of(it)
	if index < 0:
		return
	var inv: Array = g.ch.get("inv", [])
	var target: Dictionary = inv[index]
	if String(target.get("slot", "")) == "title":
		g._banner("称号は分解できません")
		return
	var id := String(target.get("id", ""))
	if int(target.get("rarity", 0)) >= 5 and (String(salvage_arm.get("id", "")) != id or g.t_now - float(salvage_arm.get("t", -10.0)) > 2.0):
		salvage_arm = {"id": id, "t": g.t_now}
		g._banner("もう一度右クリックで「%s」を分解" % String(target.get("name", "?")))
		return
	inv.remove_at(index)
	g.ch["inv"] = inv
	_harvest(target)
	_salvage_gold(salvage_value(target))
	g._save_char()
	refresh()


func salvage_common() -> void:
	var inv: Array = g.ch.get("inv", [])
	var junk: Array = []
	for it in inv:
		if it is Dictionary and salvage_target(it):
			junk.append(it)
	if junk.is_empty():
		return
	var total := 0
	var remaining: Array = []
	for it in inv:
		if it is Dictionary and salvage_target(it):
			total += salvage_value(it)
			_harvest(it)
		else:
			remaining.append(it)
	g.ch["inv"] = remaining
	_salvage_gold(total)
	g._log("%d個を分解した" % junk.size(), Color.html("#ffd84a"))
	g._save_char()
	refresh()


func set_auto_salvage(value: float) -> void:
	g.ch["autoSalvage"] = clampi(roundi(value), -1, 4)
	g._save_char()
	refresh()


func salvage_target(it: Dictionary) -> bool:
	var limit := int(g.ch.get("autoSalvage", -1))
	return limit >= 0 and String(it.get("slot", "")) != "title" \
		and int(it.get("rarity", 0)) <= limit \
		and int(it.get("rarity", 0)) < 6 \
		and _transcend_count(it) == 0


func salvage_value(it: Dictionary) -> int:
	# public/shared/data.js salvageValue: Math.round(SALVAGE_BASE[r] * (1 + (ilvl || 1) * 0.15))
	var rarity := clampi(int(it.get("rarity", 0)), 0, SALVAGE_BASE.size() - 1)
	var ilvl := int(it.get("ilvl", 1))
	if ilvl == 0:
		ilvl = 1
	return roundi(float(SALVAGE_BASE[rarity]) * (1.0 + float(ilvl) * 0.15))


func item_power(it) -> int:
	# 元の式: public/js/game/stats.js itemPower。装備比較と ▲ の判定で共有する。
	if not it is Dictionary or it.is_empty():
		return 0
	var enhance := GameRules.enh_mult(it)
	var atk := float(it.get("atk", 0.0))
	var p := atk * 3.0 * enhance + float(it.get("hp", 0.0)) * 0.5 * enhance + float(it.get("def", 0.0)) * 4.0 * enhance
	for affix in it.get("affixes", []):
		var key := String(affix[0])
		var tier := int(affix[1])
		if GameRules.data()["skillVariants"].has(key):
			p += 40.0 + float(tier) * 10.0
		else:
			p += float(tier) * ((atk if atk != 0.0 else 10.0) * 0.6 + 2.0)
	if it.get("fx", []) is Array:
		p *= 1.0 + float(it.get("fx", []).size()) * 0.25
	if String(it.get("slot", "")) == "title":
		p = 100.0 + float(it.get("rarity", 0)) * 20.0
	return roundi(p)


func display_name(it: Dictionary) -> String:
	var stars := ""
	for i in _transcend_count(it):
		stars += "★"
	return stars + String(it.get("name", "?"))


func _index_of(it: Dictionary) -> int:
	var inv: Array = g.ch.get("inv", [])
	var id := String(it.get("id", ""))
	for i in inv.size():
		var candidate = inv[i]
		if candidate is Dictionary and ((id != "" and String(candidate.get("id", "")) == id) or (id == "" and candidate == it)):
			return i
	return -1


func _salvage_gold(value: int) -> void:
	# items.js salvageGold は実行中のブラウザで硬貨を発生させる。Godot には硬貨の拾得処理がないため、
	# 拾得後と同じ所持ゴールドに反映し、既存の st 同期・ローカル保存を使う。
	g.ch["gold"] = int(g.ch.get("gold", 0)) + value
	g._sfx("equip")
	g._save_char()
	if g.hud_ui != null:
		g.hud_ui.update()
	refresh()


func _harvest(it: Dictionary) -> void:
	# 元式: public/shared/data.js salvageMats / game/items.js harvest。
	var materials: Dictionary = g.ch.get("mats", {})
	if materials.is_empty():
		materials = {"shard": 0, "gems": {}}
	if not materials.get("gems") is Dictionary:
		materials["gems"] = {}
	materials["shard"] = int(materials.get("shard", 0)) + SALVAGE_SHARDS[clampi(int(it.get("rarity", 0)), 0, 7)] + int(it.get("enh", 0))
	var codex: Dictionary = g.ch.get("codex", {})
	for affix in it.get("affixes", []):
		var key := String(affix[0])
		var tier := mini(int(affix[1]), 5)
		materials["gems"][key] = int(materials["gems"].get(key, 0)) + 1
		var before := int(codex.get(key, 0))
		if tier > before:
			codex[key] = tier
			g._log("特性リストに追加：%s（%sT%d まで付与可能）" % [_affix_name(key), ("T%d → " % before) if before > 0 else "", tier], Color.html("#c8a0ff"))
	g.ch["mats"] = materials
	g.ch["codex"] = codex


func _affix_name(key: String) -> String:
	var variants: Dictionary = GameRules.data()["skillVariants"]
	if variants.has(key):
		return "スキル変化「%s」" % String(variants[key].get("name", key))
	return String(GameRules.data()["affixes"].get(key, {}).get("name", key))


func refresh() -> void:
	if inventory_panel != null:
		inventory_panel.refresh()
