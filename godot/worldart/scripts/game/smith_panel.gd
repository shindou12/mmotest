class_name GameSmithPanel
extends RefCounted
## public/style.css #smith / .smith-body / #smith-detail と public/js/ui/panels/smith.js。

const TEXT := Color(232.0 / 255.0, 238.0 / 255.0, 248.0 / 255.0)
const DIM := Color(143.0 / 255.0, 160.0 / 255.0, 184.0 / 255.0)
const GOLD := Color(1.0, 231.0 / 255.0, 160.0 / 255.0)
const LINE := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
const TABS := [["enh", "⚒", "強化"], ["affix", "◈", "特性変更"], ["skill", "✦", "スキル変更"], ["lore", "❖", "伝承化"], ["codex", "☰", "特性リスト"]]
const GLYPHS := {"sword": "剣", "greatsword": "大", "spear": "盾", "dagger": "短", "axe": "斧", "bow": "弓", "armor": "鎧", "acc": "飾", "title": "銘"}

var g
var panel: PanelContainer
var content: VBoxContainer
var tabs_box: VBoxContainer
var list: GridContainer
var detail: VBoxContainer
var title_label: Label
var mats_label: Label
var tab := "enh"
var selected: Dictionary = {}
var selected_slot := -1
var selected_key := ""
var selected_skill := ""
var npc_name := "鍛冶屋"
var message := ""
var message_ok := false


func _init(game) -> void:
	g = game


func build_ui(root: Control) -> void:
	panel = PanelContainer.new()
	panel.name = "SmithPanel"
	panel.visible = false
	panel.z_index = 20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(28.0 / 255.0, 22.0 / 255.0, 16.0 / 255.0, 0.92) # public/style.css #smith のグラデーション先頭色
	style.border_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.3)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 12.0
	style.content_margin_bottom = 12.0
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 16
	style.shadow_offset = Vector2(0.0, 6.0)
	panel.add_theme_stylebox_override("panel", style)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	root.add_child(panel)
	content = VBoxContainer.new()
	content.add_theme_constant_override("separation", 10)
	panel.add_child(content)
	var header := HBoxContainer.new()
	title_label = _label("鍛冶屋", 17, GOLD)
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_label)
	mats_label = _label("", 12, GOLD)
	header.add_child(mats_label)
	var close_button := _button("×", 34.0)
	close_button.pressed.connect(close)
	header.add_child(close_button)
	content.add_child(header)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_child(body)
	tabs_box = VBoxContainer.new()
	tabs_box.custom_minimum_size.x = 120.0
	tabs_box.add_theme_constant_override("separation", 6)
	body.add_child(tabs_box)
	for entry in TABS:
		var button := _button("%s  %s" % [String(entry[1]), String(entry[2])], 38.0)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.pressed.connect(_set_tab.bind(String(entry[0])))
		tabs_box.add_child(button)
	list = GridContainer.new()
	list.name = "SmithItems"
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list.custom_minimum_size.x = 280.0
	list.add_theme_constant_override("h_separation", 6)
	list.add_theme_constant_override("v_separation", 6)
	body.add_child(list)
	var scroll := ScrollContainer.new()
	scroll.name = "SmithDetailScroll"
	scroll.custom_minimum_size.x = 380.0
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var detail_frame := PanelContainer.new()
	detail_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var detail_style := StyleBoxFlat.new()
	detail_style.bg_color = Color(0.0, 0.0, 0.0, 0.3)
	detail_style.border_color = Color(1.0, 1.0, 1.0, 0.06)
	detail_style.set_border_width_all(1)
	detail_style.set_corner_radius_all(10)
	detail_style.content_margin_left = 12.0
	detail_style.content_margin_right = 12.0
	detail_style.content_margin_top = 10.0
	detail_style.content_margin_bottom = 10.0
	detail_frame.add_theme_stylebox_override("panel", detail_style)
	scroll.add_child(detail_frame)
	detail = VBoxContainer.new()
	detail.add_theme_constant_override("separation", 8)
	detail_frame.add_child(detail)
	root.get_viewport().size_changed.connect(_fit_panel)
	_fit_panel()


func open(npc: String = "鍛冶屋") -> void:
	npc_name = npc
	panel.visible = true
	refresh()
	g._sync_modal_ui()


func close() -> void:
	panel.visible = false
	g._sync_modal_ui()


func refresh() -> void:
	title_label.text = npc_name
	var mats: Dictionary = g.ch.get("mats", {})
	mats_label.text = "◎ %s G    ◆ 強化の欠片 %d" % [_grouped(int(g.ch.get("gold", 0))), int(mats.get("shard", 0))]
	for child in tabs_box.get_children():
		var index := tabs_box.get_children().find(child)
		child.add_theme_stylebox_override("normal", _tab_style(index == _tab_index()))
		child.add_theme_stylebox_override("hover", _tab_style(index == _tab_index()))
	for child in list.get_children():
		list.remove_child(child)
		child.queue_free()
	for child in detail.get_children():
		detail.remove_child(child)
		child.queue_free()
	if tab == "codex":
		list.visible = false
		_render_codex()
	else:
		list.visible = true
		var candidates := _items_for_tab()
		if not _contains_item(candidates, selected):
			selected = candidates[0] if not candidates.is_empty() else {}
			selected_slot = -1
			selected_key = ""
			selected_skill = ""
		for item in candidates:
			list.add_child(_item_button(item))
		if candidates.is_empty():
			list.add_child(_label(_empty_text(), 12, DIM))
			_render_empty_detail()
		elif tab == "enh": _render_enhancement()
		elif tab == "affix": _render_affix()
		elif tab == "skill": _render_skill()
		elif tab == "lore": _render_lore()
	if message != "":
		var result := _label(message, 13, Color.html("#9ff0a8") if message_ok else Color.html("#ffb0a0"))
		result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		detail.add_child(result)
	_fit_panel()


func _items_for_tab() -> Array:
	var result: Array = []
	var equipped: Dictionary = g.ch.get("eq", {})
	for slot in ["weapon", "armor", "acc"]:
		var item: Variant = equipped.get(slot)
		if item is Dictionary and _filter_item(item): result.append(item)
	for item in g.ch.get("inv", []):
		if item is Dictionary and _filter_item(item): result.append(item)
	return result


func _filter_item(item: Dictionary) -> bool:
	match tab:
		"enh": return String(item.get("slot", "")) != "title"
		"affix": return String(item.get("slot", "")) != "title" and not item.get("affixes", []).is_empty()
		"skill": return String(item.get("slot", "")) == "weapon"
		"lore": return String(item.get("slot", "")) != "title" and int(item.get("rarity", 0)) >= 6 and not item.get("fx", []).is_empty()
	return false


func _item_button(item: Dictionary) -> Button:
	var button := Button.new()
	var slot := String(item.get("slot", ""))
	var glyph := String(GLYPHS.get(String(item.get("kind", slot)), GLYPHS.get(slot, "装")))
	button.text = "%s\n%s" % [glyph, String(g.items.display_name(item))]
	button.tooltip_text = String(g.items.describe(item))
	button.custom_minimum_size = Vector2(62.0, 62.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 11)
	button.add_theme_color_override("font_color", GameItems.rarity_color(int(item.get("rarity", 0))))
	button.add_theme_stylebox_override("normal", _cell_style(_same_item(item, selected)))
	button.add_theme_stylebox_override("hover", _cell_style(true))
	button.pressed.connect(_select_item.bind(item))
	return button


func _render_enhancement() -> void:
	var item := selected
	_render_head(item)
	var enh := int(item.get("enh", 0))
	var pip_text := "■".repeat(enh) + "□".repeat(maxi(0, GameItems.ENH_MAX - enh))
	_add_text(pip_text + "   +%d / +%d" % [enh, GameItems.ENH_MAX], 13, GOLD)
	var multiplier_before := 1.0 + float(enh) * 0.08
	var multiplier_after := 1.0 + float(enh + 1) * 0.08
	for stat in [["攻撃力", "atk", ""], ["HP", "hp", ""], ["被ダメ軽減", "def", "%"]]:
		if not item.has(stat[1]): continue
		var value := float(item[stat[1]])
		var text := "%s   %.1f" % [String(stat[0]), snappedf(value * multiplier_before, 0.1)]
		if enh < GameItems.ENH_MAX: text += "   →   +%.1f%s" % [snappedf(value * multiplier_after, 0.1), String(stat[2])]
		_add_text(text, 13, TEXT)
	if enh < GameItems.ENH_MAX:
		var rate := float(GameItems.ENH_RATE[enh])
		_add_text("成功率  %d%%%s" % [roundi(rate * 100.0), "\n失敗しても強化値は下がりません（素材とゴールドは消費）" if rate < 1.0 else "\n+5 までは必ず成功します"], 13, Color.html("#7fe08a") if rate >= 1.0 else Color.html("#ffb060"))
		var cost := GameItems.enhancement_cost(item)
		_add_cost(cost)
		var button := _action_button("強化する（+%d → +%d）" % [enh, enh + 1], _can_pay(cost))
		button.pressed.connect(_do_enhance)
		detail.add_child(button)
	else:
		_add_text("最大まで強化済み", 14, DIM)


func _render_affix() -> void:
	var item := selected
	_render_head(item)
	_add_text("付け替える特性　置き換える枠を選びます", 13, GOLD)
	var affixes: Array = item.get("affixes", [])
	for index in affixes.size():
		var row := _button("%s  T%d" % [_affix_name(String(affixes[index][0])), int(affixes[index][1])], 34.0)
		row.add_theme_stylebox_override("normal", _cell_style(selected_slot == index))
		row.pressed.connect(_select_affix_slot.bind(index))
		detail.add_child(row)
	_add_text("付ける特性　特性リストで解放したものだけ。ティアはランダム（低いほど出やすい）", 13, GOLD)
	var keys: Array = GameRules.data()["affixes"].keys()
	if String(item.get("slot", "")) == "weapon": keys.append_array(GameRules.data()["skillVariants"].keys())
	var key_grid := GridContainer.new()
	key_grid.columns = 2
	key_grid.add_theme_constant_override("h_separation", 5)
	key_grid.add_theme_constant_override("v_separation", 5)
	var codex: Dictionary = g.ch.get("codex", {})
	var gems: Dictionary = g.ch.get("mats", {}).get("gems", {})
	for key_value in keys:
		var key := String(key_value)
		var level := int(codex.get(key, 0))
		var gem_count := int(gems.get(key, 0))
		var duplicate := false
		var variants: Dictionary = GameRules.data()["skillVariants"]
		for i in affixes.size():
			if i == selected_slot: continue
			if String(affixes[i][0]) == key or (variants.has(key) and variants.has(String(affixes[i][0]))): duplicate = true
		var option := _button("%s\n%s" % ["？？？" if level <= 0 else _affix_name(key), "未解放" if level <= 0 else "T1〜T%d・◇%d" % [level, gem_count]], 48.0)
		option.disabled = level <= 0 or gem_count <= 0 or duplicate
		option.add_theme_stylebox_override("normal", _cell_style(selected_key == key))
		option.pressed.connect(_select_affix_key.bind(key))
		key_grid.add_child(option)
	detail.add_child(key_grid)
	if selected_slot >= 0 and selected_slot < affixes.size() and int(affixes[selected_slot][1]) >= 6:
		_add_text("⚠ T%d の特性が消えます（超越は鍛冶屋では付け直せません）" % int(affixes[selected_slot][1]), 11, Color.html("#ffb060"))
	if selected_key != "":
		var cost := GameItems.affix_cost(item)
		cost["gemKey"] = selected_key
		cost["gem"] = 1
		_add_cost(cost)
	var action := _action_button("特性を付け替える", selected_slot >= 0 and selected_key != "" and _can_pay(_affix_action_cost(item)))
	action.pressed.connect(_do_affix)
	detail.add_child(action)


func _render_skill() -> void:
	var item := selected
	_render_head(item)
	_add_text("武器スキル　この武器種のスキルから選べます", 13, GOLD)
	var pool: Array = GameRules.data()["weaponSkillPool"].get(String(item.get("kind", "")), [])
	var skills: Dictionary = GameRules.data()["skills"]["weapon"]
	for id_value in pool:
		var id := String(id_value)
		var skill: Dictionary = skills.get(id, {})
		var current := String(item.get("skill", "")) == id
		var option := _button("%s%s\n%s（CT %s秒）" % [String(skill.get("name", id)), "　現在" if current else "", String(skill.get("desc", "")), str(skill.get("cd", "?"))], 54.0)
		option.disabled = current
		option.add_theme_stylebox_override("normal", _cell_style(selected_skill == id or current))
		option.pressed.connect(_select_skill.bind(id))
		detail.add_child(option)
	var cost := GameItems.skill_cost(item)
	_add_cost(cost)
	var action := _action_button("スキルを変更する", selected_skill != "" and _can_pay(cost))
	action.pressed.connect(_do_skill)
	detail.add_child(action)


func _render_lore() -> void:
	var item := selected
	_render_head(item)
	_add_text("▼ 伝承化", 15, GOLD)
	_add_text("「%s」の伝承" % String(item.get("name", "装備")), 15, GameItems.rarity_color(int(item.get("rarity", 0))))
	_add_text("称号（4つ目の装備枠・ステータスなし）", 12, DIM)
	for effect in item.get("fx", []):
		_add_text("✦ %s" % _fx_description(String(effect)), 12, TEXT)
	if item.get("fx", []).has("wave"):
		_add_text("近接武器のみ", 11, Color.html("#cfe6ff"))
	_add_text("⚠ 元の装備はなくなります（ステータスと特性は失われ、固有効果だけが称号として残ります）", 11, Color.html("#ffb060"))
	var cost := GameItems.lore_cost(item)
	_add_cost(cost)
	var action := _action_button("伝承化する", _can_pay(cost))
	action.pressed.connect(_do_lore)
	detail.add_child(action)


func _render_codex() -> void:
	var data: Dictionary = GameRules.data()
	var keys: Array = data["affixes"].keys()
	keys.append_array(data["skillVariants"].keys())
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	detail.add_child(_label("特性リスト", 16, GOLD))
	detail.add_child(_label("装備を分解すると、その特性と付与できる最高ティアが追加されます。鍛冶屋で付けられるのは T5 まで（超越はドロップのみ）", 11, DIM))
	detail.add_child(grid)
	var codex: Dictionary = g.ch.get("codex", {})
	var gems: Dictionary = g.ch.get("mats", {}).get("gems", {})
	for key_value in keys:
		var key := String(key_value)
		var level := int(codex.get(key, 0))
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(105.0, 62.0)
		card.add_theme_stylebox_override("panel", _cell_style(false))
		var stack := VBoxContainer.new()
		stack.add_theme_constant_override("separation", 2)
		stack.add_child(_label("%s   ◇%d" % ["？？？" if level <= 0 else _affix_name(key), int(gems.get(key, 0))], 11, DIM if level <= 0 else TEXT))
		stack.add_child(_label("%s%s" % ["T1  T2  T3  T4  T5", "   未解放" if level <= 0 else "   T%d まで" % level], 9, Color.html("#c8a0ff") if GameRules.data()["skillVariants"].has(key) else DIM))
		card.add_child(stack)
		grid.add_child(card)


func _render_head(item: Dictionary) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var icon := PanelContainer.new()
	icon.custom_minimum_size = Vector2(46.0, 46.0)
	var rarity := GameItems.rarity_color(int(item.get("rarity", 0)))
	var icon_style := StyleBoxFlat.new()
	icon_style.bg_color = Color(0.0, 0.0, 0.0, 0.35)
	icon_style.border_color = rarity
	icon_style.set_border_width_all(2)
	icon_style.set_corner_radius_all(8)
	icon.add_theme_stylebox_override("panel", icon_style)
	var glyph := _label(String(GLYPHS.get(String(item.get("kind", item.get("slot", ""))), GLYPHS.get(String(item.get("slot", "")), "装"))), 22, rarity)
	glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	glyph.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon.add_child(glyph)
	row.add_child(icon)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_child(_label(String(g.items.display_name(item)), 15, rarity))
	var is_worn := _is_worn(item)
	stack.add_child(_label("%s・iLv%d%s" % [String(GameRules.data()["rarities"][int(item.get("rarity", 0))]["name"]), int(item.get("ilvl", 1)), "・装備中" if is_worn else ""], 11, DIM))
	row.add_child(stack)
	detail.add_child(row)


func _add_cost(cost: Dictionary) -> void:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 6)
	row.add_theme_constant_override("v_separation", 6)
	if int(cost.get("gold", 0)) > 0:
		row.add_child(_cost_chip("◎ %s G\n所持 %s" % [_grouped(int(cost.gold)), _grouped(int(g.ch.get("gold", 0)))], int(g.ch.get("gold", 0)) >= int(cost.gold)))
	if int(cost.get("shard", 0)) > 0:
		var have := int(g.ch.get("mats", {}).get("shard", 0))
		row.add_child(_cost_chip("◆ 強化の欠片 ×%d\n所持 %d" % [int(cost.shard), have], have >= int(cost.shard)))
	if cost.has("gemKey"):
		var key := String(cost.gemKey)
		var have_gem := int(g.ch.get("mats", {}).get("gems", {}).get(key, 0))
		row.add_child(_cost_chip("◇ %sの宝石 ×%d\n所持 %d" % [_affix_name(key), int(cost.get("gem", 1)), have_gem], have_gem >= int(cost.get("gem", 1))))
	detail.add_child(row)


func _cost_chip(value: String, enough: bool) -> Control:
	var chip := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 1.0, 1.0, 0.06)
	style.border_color = Color(1.0, 1.0, 1.0, 0.1) if enough else Color.html("#ff6a5a")
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 9.0
	style.content_margin_right = 9.0
	style.content_margin_top = 4.0
	style.content_margin_bottom = 4.0
	chip.add_theme_stylebox_override("panel", style)
	var label := _label(value, 11, TEXT if enough else Color.html("#ff9a8a"))
	chip.add_child(label)
	return chip


func _render_empty_detail() -> void:
	var text := "左の一覧から装備を選んでください" if tab == "lore" or tab == "affix" else _empty_text()
	var empty := _label(text, 13, DIM)
	empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty.custom_minimum_size.y = 80.0
	detail.add_child(empty)


func _empty_text() -> String:
	return {"enh": "強化できる装備がありません", "affix": "特性の付いた装備がありません", "skill": "武器がありません", "lore": "伝説・神器の装備がありません"}.get(tab, "装備がありません")


func _select_item(item: Dictionary) -> void:
	selected = item
	selected_slot = -1
	selected_key = ""
	selected_skill = ""
	message = ""
	g._sfx("ui")
	refresh()

func _select_affix_slot(index: int) -> void:
	selected_slot = index
	selected_key = ""
	message = ""
	refresh()

func _select_affix_key(key: String) -> void:
	selected_key = key
	message = ""
	refresh()

func _select_skill(id: String) -> void:
	selected_skill = id
	message = ""
	refresh()

func _set_tab(value: String) -> void:
	tab = value
	selected = {}
	selected_slot = -1
	selected_key = ""
	selected_skill = ""
	message = ""
	g._sfx("ui")
	refresh()

func _do_enhance() -> void:
	var result: Dictionary = g.items.smith_enhance(selected)
	message = String(result.get("msg", "")); message_ok = bool(result.get("ok", false))
	if not message_ok: g._sfx("ui")
	refresh()

func _do_affix() -> void:
	var result: Dictionary = g.items.smith_affix(selected, selected_slot, selected_key)
	message = String(result.get("msg", "")); message_ok = bool(result.get("ok", false))
	refresh()

func _do_skill() -> void:
	var result: Dictionary = g.items.smith_skill(selected, selected_skill)
	message = String(result.get("msg", "")); message_ok = bool(result.get("ok", false))
	if message_ok: selected_skill = ""
	refresh()

func _do_lore() -> void:
	var result: Dictionary = g.items.smith_lore(selected)
	message = String(result.get("msg", "")); message_ok = bool(result.get("ok", false))
	if message_ok: selected = {}
	refresh()

func _can_pay(cost: Dictionary) -> bool:
	var mats: Dictionary = g.ch.get("mats", {})
	var gems: Dictionary = mats.get("gems", {})
	return int(g.ch.get("gold", 0)) >= int(cost.get("gold", 0)) and int(mats.get("shard", 0)) >= int(cost.get("shard", 0)) and (not cost.has("gemKey") or int(gems.get(String(cost.gemKey), 0)) >= int(cost.get("gem", 0)))

func _affix_action_cost(item: Dictionary) -> Dictionary:
	var cost := GameItems.affix_cost(item)
	cost["gemKey"] = selected_key
	cost["gem"] = 1
	return cost

func _add_text(value: String, size: int, color: Color) -> void:
	var label := _label(value, size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_child(label)

func _action_button(value: String, enabled: bool) -> Button:
	var button := _button(value, 46.0)
	button.disabled = not enabled
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color.html("#ffe9a8")
	normal.set_corner_radius_all(22)
	normal.content_margin_top = 10.0
	normal.content_margin_bottom = 10.0
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", normal)
	button.add_theme_color_override("font_color", Color.html("#2a1d00"))
	return button

func _button(value: String, height: float) -> Button:
	var button := Button.new()
	button.text = value
	button.custom_minimum_size.y = height
	button.add_theme_font_size_override("font_size", 12)
	return button

func _label(value: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label

func _tab_index() -> int:
	for i in TABS.size():
		if String(TABS[i][0]) == tab: return i
	return -1

func _tab_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.22) if active else Color(1.0, 1.0, 1.0, 0.04)
	style.border_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.55) if active else Color(1.0, 1.0, 1.0, 0.08)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 12.0
	style.content_margin_right = 8.0
	return style

func _cell_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.1) if active else Color(0.0, 0.0, 0.0, 0.25)
	style.border_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.55) if active else LINE
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	return style

func _contains_item(items: Array, target: Dictionary) -> bool:
	for item in items:
		if _same_item(item, target): return true
	return false

func _same_item(item: Variant, target: Dictionary) -> bool:
	if not item is Dictionary: return false
	var id := String(target.get("id", ""))
	return item == target or (id != "" and String(item.get("id", "")) == id)

func _is_worn(item: Dictionary) -> bool:
	for value in g.ch.get("eq", {}).values():
		if _same_item(value, item): return true
	return false

func _affix_name(key: String) -> String:
	var data: Dictionary = GameRules.data()
	if data["skillVariants"].has(key):
		return "スキル変化「%s」" % String(data["skillVariants"][key].get("name", key))
	return String(data["affixes"].get(key, {}).get("name", key))

func _fx_description(key: String) -> String:
	return {"wave": "コンボ3段目が光の斬撃波となって飛ぶ", "thunder": "会心時、対象に落雷（周囲にダメージ）", "vamp": "与ダメージの4%を吸収", "aegis": "25%の確率で被ダメージを無効化", "mirror": "ジャスト回避で衝撃波＋5秒間ダメージ1.5倍", "star": "スキルのクールタイム-35%", "skillcrit": "スキルが必ず会心になる", "flame": "攻撃が炎上し、周囲に延焼ダメージ"}.get(key, key)

func _grouped(value: int) -> String:
	var source := str(value)
	var result := ""
	while source.length() > 3:
		result = "," + source.right(3) + result
		source = source.left(source.length() - 3)
	return source + result

func _fit_panel() -> void:
	if panel == null: return
	var viewport := panel.get_viewport_rect().size
	var width := minf(980.0, viewport.x * 0.96)
	var height := minf(620.0, viewport.y * 0.9)
	var list_width := maxf(0.0, width - 24.0 - 120.0 - 380.0 - 24.0)
	list.columns = maxi(1, floori((list_width + 6.0) / 68.0))
	panel.custom_minimum_size = Vector2(width, height)
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5
	panel.offset_top = -height * 0.5
	panel.offset_bottom = height * 0.5

