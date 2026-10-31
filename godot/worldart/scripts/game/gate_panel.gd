class_name GameGatePanel
extends RefCounted
## public/style.css #gate-menu / #gate-list と public/js/ui/panels/npc.js P.gate。

const MAX_FLOOR := 3 # public/shared/data.js MAX_FLOOR

var g
var panel: PanelContainer
var content: VBoxContainer
var list: VBoxContainer


func _init(game) -> void:
	g = game


func build_ui(root: Control) -> void:
	panel = PanelContainer.new()
	panel.name = "GateMenu"
	panel.visible = false
	panel.z_index = 20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72) # public/style.css :root --panel
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
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
	content.add_theme_constant_override("separation", 8)
	panel.add_child(content)
	var header := HBoxContainer.new()
	var title := Label.new()
	title.text = "転移門"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 18)
	header.add_child(title)
	var close_button := Button.new()
	close_button.text = "×"
	close_button.custom_minimum_size = Vector2(34, 30)
	close_button.pressed.connect(close)
	header.add_child(close_button)
	content.add_child(header)
	list = VBoxContainer.new()
	list.add_theme_constant_override("separation", 6)
	content.add_child(list)
	var note := Label.new()
	note.text = "第4層以降は準備中"
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	note.add_theme_font_size_override("font_size", 12)
	note.add_theme_color_override("font_color", Color.html("#8fa0b8"))
	content.add_child(note)
	root.get_viewport().size_changed.connect(_fit_panel)
	_fit_panel()


func open() -> void:
	panel.visible = true
	refresh()
	g._sync_modal_ui()


func close() -> void:
	panel.visible = false
	g._sync_modal_ui()


func _fit_panel() -> void:
	if panel == null: return
	var width := minf(380.0, panel.get_viewport_rect().size.x * 0.94)
	panel.custom_minimum_size.x = width
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5


func refresh() -> void:
	for child in list.get_children():
		list.remove_child(child)
		child.queue_free()
	var floors: Array = GameRules.data().get("floors", [])
	for index in range(mini(floors.size(), MAX_FLOOR)):
		var floor_data: Dictionary = floors[index]
		var number := int(floor_data.get("n", 0))
		var available := number <= int(g.unlocked)
		var current := number == int(g.area.get("floor", 1))
		var button := Button.new()
		button.text = "第%d層  %s    推奨Lv%d〜" % [number, String(floor_data.get("name", "？？？")) if available else "？？？", 1 + (number - 1) * 5]
		button.custom_minimum_size = Vector2(340.0, 40.0)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.disabled = not available
		button.add_theme_font_size_override("font_size", 13)
		if current:
			var active := StyleBoxFlat.new()
			active.bg_color = Color(0.08, 0.12, 0.2, 0.9)
			active.border_color = Color.html("#6ad0ff")
			active.set_border_width_all(1)
			active.set_corner_radius_all(6)
			button.add_theme_stylebox_override("normal", active)
			button.add_theme_stylebox_override("hover", active)
		button.add_theme_color_override("font_color", Color.html("#6ad0ff"))
		button.pressed.connect(func() -> void: g._warp_floor(number))
		list.add_child(button)
	panel.custom_minimum_size.x = minf(380.0, panel.get_viewport_rect().size.x * 0.94)

