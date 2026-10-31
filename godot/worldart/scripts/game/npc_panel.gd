class_name GameNpcPanel
extends RefCounted
## public/style.css #dialog / .npc-line / .quest と public/js/ui/panels/npc.js。

const TEXT := Color(232.0 / 255.0, 238.0 / 255.0, 248.0 / 255.0)
const DIM := Color(143.0 / 255.0, 160.0 / 255.0, 184.0 / 255.0)
const LINE := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
const QuestModel = preload("res://scripts/game/quests.gd")

var g
var panel: PanelContainer
var content: VBoxContainer
var npc: Dictionary = {}


func _init(game) -> void:
	g = game


func build_ui(root: Control) -> void:
	panel = PanelContainer.new()
	panel.name = "NpcDialog"
	panel.visible = false
	panel.z_index = 20
	panel.custom_minimum_size.x = minf(520.0, root.get_viewport_rect().size.x * 0.94)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -260.0
	panel.offset_right = 260.0
	var style := _panel_style()
	panel.add_theme_stylebox_override("panel", style)
	root.add_child(panel)
	content = VBoxContainer.new()
	content.add_theme_constant_override("separation", 8)
	panel.add_child(content)
	root.get_viewport().size_changed.connect(_fit_panel)
	_fit_panel()


func open(value: Dictionary) -> void:
	npc = value
	panel.visible = true
	refresh()
	g._sync_modal_ui()


func close() -> void:
	panel.visible = false
	g._sync_modal_ui()


func refresh() -> void:
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	var header := HBoxContainer.new()
	var title := _label(String(npc.get("name", "NPC")), 18, TEXT)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close_button := _button("×")
	close_button.custom_minimum_size = Vector2(34.0, 30.0)
	close_button.pressed.connect(close)
	header.add_child(close_button)
	content.add_child(header)
	var line := Label.new()
	line.text = "「%s」" % String(npc.get("line", ""))
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	line.add_theme_font_size_override("font_size", 14)
	line.add_theme_color_override("font_color", TEXT)
	line.add_theme_constant_override("line_spacing", 3)
	line.custom_minimum_size.x = 470.0
	var quote := PanelContainer.new()
	var quote_style := StyleBoxFlat.new()
	quote_style.bg_color = Color(0.0, 0.0, 0.0, 0.3)
	quote_style.set_corner_radius_all(8)
	quote_style.content_margin_left = 12.0
	quote_style.content_margin_right = 12.0
	quote_style.content_margin_top = 10.0
	quote_style.content_margin_bottom = 10.0
	quote.add_theme_stylebox_override("panel", quote_style)
	quote.add_child(line)
	content.add_child(quote)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 6)
	content.add_child(list)
	var quests := QuestModel.quests_for_npc(g.ch, String(npc.get("id", "")))
	if quests.is_empty():
		list.add_child(_label("今はお願いしたいことはないよ。", 13, DIM))
	else:
		for quest in quests:
			list.add_child(_quest_card(quest))
	_fit_panel()


func _quest_card(quest: Dictionary) -> Control:
	var card := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.16)
	style.border_color = LINE
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 8.0
	style.content_margin_bottom = 8.0
	card.add_theme_stylebox_override("panel", style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	card.add_child(row)
	var details := VBoxContainer.new()
	details.add_theme_constant_override("separation", 2)
	details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(details)
	var state: Variant = QuestModel.quest_state(g.ch, String(quest.id))
	details.add_child(_label(String(quest.name), 13, TEXT))
	var desc := _label(String(quest.desc), 12, DIM)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.add_child(desc)
	var reward := _label("報酬：%s" % QuestModel.reward_summary(quest), 11, Color.html("#ffd27a"))
	reward.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.add_child(reward)
	var action: Button
	if not state is Dictionary:
		action = _button("受ける")
		action.pressed.connect(func() -> void: g._accept_quest(String(quest.id)))
	elif bool(state.get("claimed", false)):
		action = _button("完了")
		action.disabled = true
	elif bool(state.get("done", false)):
		action = _button("報告する")
		action.add_theme_color_override("font_color", Color.html("#ffd84a"))
		action.pressed.connect(func() -> void: g._claim_quest(String(quest.id)))
	else:
		action = _button("%d / %d" % [int(state.get("p", 0)), int(quest.n)])
		action.disabled = true
	row.add_child(action)
	return card


func _fit_panel() -> void:
	if panel == null:
		return
	var viewport := panel.get_viewport_rect().size
	var width := minf(520.0, viewport.x * 0.94)
	panel.custom_minimum_size.x = width
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5


func _label(value: String, size: int, color: Color) -> Label:
	var result := Label.new()
	result.text = value
	result.add_theme_font_size_override("font_size", size)
	result.add_theme_color_override("font_color", color)
	return result


func _button(value: String) -> Button:
	var result := Button.new()
	result.text = value
	result.custom_minimum_size.y = 34.0
	result.add_theme_font_size_override("font_size", 13)
	return result


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72) # public/style.css :root --panel
	style.border_color = LINE
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 14.0
	style.content_margin_bottom = 14.0
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 16
	style.shadow_offset = Vector2(0.0, 6.0)
	return style
