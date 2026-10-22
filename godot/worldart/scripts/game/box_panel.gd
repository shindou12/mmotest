class_name GameBoxPanel
extends RefCounted
## public/style.css #box / .box-body / .box-col と public/js/ui/panels/npc.js P.box。

const DIM := Color(143.0 / 255.0, 160.0 / 255.0, 184.0 / 255.0)
const GLYPHS := {"sword": "剣", "greatsword": "大", "spear": "盾", "dagger": "短", "axe": "斧", "bow": "弓", "armor": "鎧", "acc": "飾", "title": "銘"}

var g
var panel: PanelContainer
var content: VBoxContainer
var mine: GridContainer
var shared: GridContainer
var count_label: Label


func _init(game) -> void:
	g = game


func build_ui(root: Control) -> void:
	panel = PanelContainer.new()
	panel.name = "SharedBox"
	panel.visible = false
	panel.z_index = 20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72) # public/style.css :root --panel
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10) # public/style.css .panel
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
	title.text = "共有ボックス"
	title.add_theme_font_size_override("font_size", 17)
	header.add_child(title)
	var note := Label.new()
	note.text = "みんなで共有する箱です。クリックで入れる / 取り出す（どの町の箱でも中身は同じ）"
	note.add_theme_font_size_override("font_size", 11)
	note.add_theme_color_override("font_color", DIM)
	note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(note)
	count_label = Label.new()
	count_label.add_theme_color_override("font_color", DIM)
	header.add_child(count_label)
	var close_button := Button.new()
	close_button.text = "×"
	close_button.custom_minimum_size = Vector2(34, 30)
	close_button.pressed.connect(close)
	header.add_child(close_button)
	content.add_child(header)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_child(body)
	var mine_col := _column("自分の持ち物")
	body.add_child(mine_col[0])
	mine = mine_col[1]
	var shared_col := _column("共有ボックスの中")
	body.add_child(shared_col[0])
	shared = shared_col[1]
	root.get_viewport().size_changed.connect(_fit_panel)
	_fit_panel()


func _column(heading: String) -> Array:
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var label := Label.new()
	label.text = heading
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", Color.html("#9ae8ff"))
	column.add_child(label)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var grid := GridContainer.new()
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.columns = 5
	scroll.add_child(grid)
	return [column, grid]


func open() -> void:
	panel.visible = true
	refresh()
	g._box_open()
	g._sync_modal_ui()


func close() -> void:
	if panel.visible: g._box_close()
	panel.visible = false
	g._sync_modal_ui()


func refresh() -> void:
	if panel == null: return
	count_label.text = "%d / %d" % [g.box_items.size(), g.box_max]
	_clear(mine)
	_clear(shared)
	var inventory: Array = g.ch.get("inv", [])
	for item in inventory:
		if item is Dictionary: mine.add_child(_item_button(item, false))
	for item in g.box_items:
		if item is Dictionary: shared.add_child(_item_button(item, true))
	if mine.get_child_count() == 0: mine.add_child(_empty("インベントリは空です"))
	if shared.get_child_count() == 0: shared.add_child(_empty("共有ボックスは空です。装備をクリックして入れよう"))
	_fit_panel()


func _item_button(item: Dictionary, from_box: bool) -> Button:
	var slot := String(item.get("slot", ""))
	var glyph := String(GLYPHS.get(String(item.get("kind", slot)), GLYPHS.get(slot, "装")))
	var button := Button.new()
	button.text = "%s\n%s" % [glyph, String(g.items.display_name(item))]
	button.custom_minimum_size = Vector2(62.0, 62.0)
	button.tooltip_text = String(g.items.describe(item))
	button.add_theme_font_size_override("font_size", 10)
	button.add_theme_color_override("font_color", GameItems.rarity_color(int(item.get("rarity", 0))))
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.4)
	style.border_color = GameItems.rarity_color(int(item.get("rarity", 0)))
	style.set_border_width_all(2 if int(item.get("rarity", 0)) >= 5 else 1)
	style.set_corner_radius_all(8)
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)
	if from_box:
		button.pressed.connect(func() -> void: g._box_take(item))
	else:
		button.pressed.connect(func() -> void: g._box_put(item))
	return button


func _empty(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", DIM)
	return label


func _clear(node: Control) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()


func _fit_panel() -> void:
	if panel == null: return
	var viewport := panel.get_viewport_rect().size
	var width := minf(820.0, viewport.x * 0.96)
	panel.custom_minimum_size = Vector2(width, 0.0)
	var columns := maxi(1, floori(((width - 24.0 - 12.0) * 0.5 + 6.0) / 68.0))
	var mine_rows := maxi(1, ceili(float(g.ch.get("inv", []).size()) / float(columns)))
	var box_rows := maxi(1, ceili(float(g.box_items.size()) / float(columns)))
	var rows := maxi(mine_rows, box_rows)
	var cells_height := rows * 62.0 + maxi(0, rows - 1) * 6.0
	var body_height := 17.0 + cells_height
	var header_height: float = content.get_child(0).get_combined_minimum_size().y if content.get_child_count() > 0 else 20.0
	var height := minf(viewport.y * 0.86, header_height + 8.0 + body_height + 26.0)
	panel.custom_minimum_size = Vector2(width, height)
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5
	panel.offset_top = -height * 0.5
	panel.offset_bottom = height * 0.5

