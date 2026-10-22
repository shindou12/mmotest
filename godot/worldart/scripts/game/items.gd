class_name GameItems
extends RefCounted
## 落とし物と持ち物（L27 CP5）。元は public/js/game/loot.js（spawnDrop・updateDrops・pickupDrop）と、持ち物の画面（ui）の最小限。
## 落とし物はブラウザ版と同じく画面側だけのもの: サーバーの loot で落ち、体が触れる（1.3m）と拾う。150 秒で消える。持ち物は 60 個まで。
## 持ち物の画面（I）: 一覧を選んで「装備する」。武器・防具・装飾品。弓はまだ使えない（遠距離の攻撃が未）

const LOOT := {"touch": 1.3, "life": 150.0, "max": 60}

var g
var drops := []   # {it, x, z, t, node, label}
var panel: PanelContainer
var list: ItemList
var detail: Label
var eq_label: Label


func _init(game) -> void:
	g = game


static func rarity_color(r: int) -> Color:
	return Color.html(String(GameRules.data()["rarities"][clampi(r, 0, 7)]["color"]))   # data.js RARITIES の色（'#rrggbb'）


func on_loot(m: Dictionary) -> void:
	for d in m.items:
		var it: Dictionary = d["it"]
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


## いちばん近い落とし物（自動操作が拾いに行く）
func nearest() -> Variant:
	var best = null; var bd := 1e9
	for d in drops:
		var dd := Vector2(d.x - g.me.x, d.z - g.me.z).length()
		if dd < bd: bd = dd; best = d
	return best


# ---------------------------------------------------------------- 持ち物の画面
func build_ui(root: Control) -> void:
	panel = PanelContainer.new(); panel.visible = false
	root.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_RIGHT)
	panel.offset_left = -520; panel.offset_right = -16; panel.offset_top = -300; panel.offset_bottom = 300
	var v := VBoxContainer.new(); panel.add_child(v)
	var t := Label.new(); t.text = "持ち物（I で閉じる）"; t.add_theme_font_size_override("font_size", 22); v.add_child(t)
	eq_label = Label.new(); eq_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(eq_label)
	list = ItemList.new(); list.custom_minimum_size = Vector2(480, 300); list.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(list)
	detail = Label.new(); detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; detail.custom_minimum_size = Vector2(480, 90); v.add_child(detail)
	var b := Button.new(); b.text = "装備する"; v.add_child(b)
	list.item_selected.connect(func(i): detail.text = describe(g.ch["inv"][i]))
	list.item_activated.connect(func(i): equip(i))
	b.pressed.connect(func():
		var sel := list.get_selected_items()
		if sel.size() > 0: equip(sel[0]))


func toggle() -> void:
	panel.visible = not panel.visible
	if panel.visible: g._sfx("ui") # ui/app.js panelState.enter L246: game.sfx('ui')
	refresh()


## public/shared/data.js transcendCount と同じ条件で、ドロップ音の stars を求める。
func _transcend_count(it: Dictionary) -> int:
	var count := 0
	for a in it.get("affixes", []):
		if GameRules.data()["skillVariants"].has(String(a[0])) or int(a[1]) >= 6: count += 1
	return count


func describe(it: Dictionary) -> String:
	var s := "%s  [%s]  iLv%d" % [it.get("name", "?"), GameRules.data()["rarities"][int(it.get("rarity", 0))]["name"], int(it.get("ilvl", 1))]
	if it.slot == "weapon": s += "\n%s  攻撃力 +%.0f" % [GameRules.data()["weapons"].get(it.get("kind", ""), {}).get("name", "?"), float(it.get("atk", 0)) * GameRules.enh_mult(it)]
	if it.has("hp"): s += "  HP +%.0f" % (float(it["hp"]) * GameRules.enh_mult(it))
	if it.has("def"): s += "  被ダメ軽減 +%.1f%%" % (float(it["def"]) * GameRules.enh_mult(it))
	for a in it.get("affixes", []):
		var A = GameRules.data()["affixes"].get(String(a[0]))
		if A != null: s += "\n  %s +%s%s" % [A["name"], A["tiers"][int(a[1]) - 1], A["unit"]]
	return s


func equip(i: int) -> void:
	var inv: Array = g.ch["inv"]
	var it: Dictionary = inv[i]
	var slot := String(it.get("slot", ""))
	if not slot in ["weapon", "armor", "acc"]:
		g._banner("この種類はまだ装備できない"); return
	if slot == "weapon" and not GameRules.data()["weapons"].get(it.get("kind", ""), {}).get("melee", false):
		g._banner("遠距離の武器（弓）はまだ使えない"); return
	var eq: Dictionary = g.ch.get("eq", {})
	inv.remove_at(i)
	if eq.get(slot) is Dictionary: inv.push_front(eq[slot])
	eq[slot] = it
	g.ch["eq"] = eq
	g.ch["inv"] = inv
	g._recalc()
	g._sfx("equip") # items.js equip L18: audio.sfx('equip')
	g._log("装備: " + String(it.get("name", "?")))
	refresh()


func refresh() -> void:
	if panel == null or not panel.visible: return
	list.clear()
	for it in g.ch.get("inv", []):
		var idx := list.add_item("%s  %s" % [{"weapon": "武器", "armor": "防具", "acc": "装飾"}.get(it.get("slot", ""), it.get("slot", "")), it.get("name", "?")])
		list.set_item_custom_fg_color(idx, rarity_color(int(it.get("rarity", 0))))
	var eq: Dictionary = g.ch.get("eq", {})
	var S: Dictionary = g.S
	eq_label.text = "武器: %s\n防具: %s\n装飾: %s\n攻撃力 %d  HP %d  被ダメ軽減 %.1f%%  会心 %.0f%%  重さ %.0f（%s）" % [
		eq.get("weapon", {}).get("name", "なし") if eq.get("weapon") is Dictionary else "なし",
		eq.get("armor", {}).get("name", "なし") if eq.get("armor") is Dictionary else "なし",
		eq.get("acc", {}).get("name", "なし") if eq.get("acc") is Dictionary else "なし",
		int(S.atk), int(S.mhp), float(S.def), float(S.crit), float(S.weight), S.wc.name]
