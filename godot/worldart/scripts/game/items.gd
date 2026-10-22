class_name GameItems
extends RefCounted
## 落とし物と持ち物（L27 CP5）。元は public/js/game/loot.js（spawnDrop・updateDrops・pickupDrop）と、持ち物の画面（ui）の最小限。
## 落とし物はブラウザ版と同じく画面側だけのもの: サーバーの loot で落ち、体が触れる（1.3m）と拾う。150 秒で消える。持ち物は 60 個まで。
## 持ち物の画面（I）: 武器・防具・装飾品・称号の装備、分解、説明。

const LOOT := {"touch": 1.3, "life": 150.0, "max": 60}
const InventoryPanel = preload("res://scripts/game/inventory_panel.gd")
# public/shared/data.js の salvageValue(ilvl=20)/4 と salvageMats(enh=0) を Node 22 で出力した表。
const SALVAGE_BASE := [1, 2, 5, 14, 40, 80, 130, 400]
const SALVAGE_SHARDS := [1, 1, 2, 4, 8, 12, 16, 30]

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
		var col := rarity_color(int(it.get("rarity", 0)))
		var n := MeshInstance3D.new()
		var bm := BoxMesh.new(); bm.size = Vector3(0.45, 0.25, 0.45)
		n.mesh = bm; n.material_override = GameVisuals.mat(col)
		var x := float(d["x"]); var z := float(d["z"])
		n.position = Vector3(x, g.world.ground_y(x, z) + 0.15, z)
		g.world.add_child(n)
		var lb := GameVisuals.label(String(it.get("name", "?")), col)
		lb.position = n.position + Vector3(0, 0.8, 0)
		g.world.add_child(lb)
		drops.append({"it": it, "x": x, "z": z, "t": 0.0, "node": n, "label": lb})
		if Vector2(x - g.me.x, z - g.me.z).length() < 40.0:
			var stars := _transcend_count(it)
			g._sfx("drop", {"rarity": int(it.get("rarity", 0)), "slot": String(it.get("slot", "")), "stars": stars}) # loot.js landDrop L31: audio.sfx('drop', {rarity, slot, stars})


func clear() -> void:
	for d in drops:
		d.node.queue_free(); d.label.queue_free()
	drops.clear()


func update(dt: float) -> void:
	for i in range(drops.size() - 1, -1, -1):
		var d: Dictionary = drops[i]
		d.t += dt
		d.node.rotation.y = d.t * 1.5
		if d.t > LOOT.life:
			d.node.queue_free(); d.label.queue_free(); drops.remove_at(i); continue
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
	d.node.queue_free(); d.label.queue_free(); drops.remove_at(i)
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
