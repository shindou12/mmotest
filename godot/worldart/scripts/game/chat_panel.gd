class_name GameChatPanel
extends RefCounted
## #chat と #chat-log の表示・Enter 入力。寸法・色・行数は public/style.css L89-92 と public/js/ui/panels/messages.js L25-32。

signal send_requested(text: String)

const CHAT_WIDTH := 250.0
const CHAT_LOG_HEIGHT := 180.0
const CHAT_MAX_LINES := 60
const LINE_COLOR := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
const TEXT_COLOR := Color(0.91, 0.933, 0.973, 1.0)

var root: Control
var scroll: ScrollContainer
var rows: VBoxContainer
var input: LineEdit


func build(host: Control) -> Control:
	root = Control.new()
	root.name = "Chat"
	root.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	root.offset_left = 12.0
	root.offset_top = -226.0
	root.offset_right = 12.0 + CHAT_WIDTH
	root.offset_bottom = -14.0
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.visible = false
	host.add_child(root)

	var column := VBoxContainer.new()
	column.name = "ChatColumn"
	column.set_anchors_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", 0)
	root.add_child(column)

	scroll = ScrollContainer.new()
	scroll.name = "ChatLog"
	scroll.custom_minimum_size = Vector2(CHAT_WIDTH, CHAT_LOG_HEIGHT)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	column.add_child(scroll)
	rows = VBoxContainer.new()
	rows.name = "Messages"
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 2)
	var padding := MarginContainer.new()
	padding.name = "ChatLogPadding"
	padding.add_theme_constant_override("margin_left", 4)
	padding.add_theme_constant_override("margin_top", 4)
	padding.add_theme_constant_override("margin_right", 4)
	padding.add_theme_constant_override("margin_bottom", 4)
	padding.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(padding)
	padding.add_child(rows)

	input = LineEdit.new()
	input.name = "ChatInput"
	input.placeholder_text = "Enterでチャット"
	input.max_length = 120
	input.custom_minimum_size = Vector2(CHAT_WIDTH, 34.0)
	input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	input.focus_mode = Control.FOCUS_ALL
	input.add_theme_font_size_override("font_size", 13)
	input.add_theme_color_override("font_color", TEXT_COLOR)
	input.add_theme_color_override("font_placeholder_color", Color(0.9, 0.93, 0.98, 0.55))
	_apply_input_style()
	input.modulate.a = 0.5
	input.focus_entered.connect(func(): input.modulate.a = 1.0)
	input.focus_exited.connect(func(): input.modulate.a = 0.5)
	input.text_submitted.connect(_on_submit)
	input.gui_input.connect(_on_gui_input)
	column.add_child(input)
	return root


func add_message(from: String, text: String, color: Color) -> void:
	var row := RichTextLabel.new()
	row.name = "ChatLine"
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.custom_minimum_size.x = CHAT_WIDTH - 8.0
	row.fit_content = true
	row.scroll_active = false
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.selection_enabled = false
	row.add_theme_font_size_override("normal_font_size", 12)
	row.add_theme_color_override("default_color", TEXT_COLOR)
	row.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 1.0))
	row.add_theme_constant_override("shadow_offset_x", 0)
	row.add_theme_constant_override("shadow_offset_y", 1)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if from.is_empty():
		row.push_color(color)
		row.add_text(text)
		row.pop()
	else:
		row.push_color(color)
		row.push_bold()
		row.add_text(from)
		row.pop()
		row.pop()
		row.add_text(": ")
		row.push_color(TEXT_COLOR)
		row.add_text(text)
		row.pop()
	rows.add_child(row)
	while rows.get_child_count() > CHAT_MAX_LINES:
		var oldest := rows.get_child(0)
		rows.remove_child(oldest)
		oldest.queue_free()
	scroll.call_deferred("set", "scroll_vertical", 1_000_000)


func open_input() -> void:
	if input == null:
		return
	input.grab_focus()


func close_input() -> void:
	if input == null:
		return
	input.clear()
	input.release_focus()


func is_editing() -> bool:
	return input != null and input.has_focus()


func _apply_input_style() -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.0, 0.0, 0.0, 0.45)
	normal.border_color = LINE_COLOR
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(6)
	normal.content_margin_left = 8.0
	normal.content_margin_right = 8.0
	normal.content_margin_top = 6.0
	normal.content_margin_bottom = 6.0
	input.add_theme_stylebox_override("normal", normal)
	var focus := normal.duplicate() as StyleBoxFlat
	focus.border_color = Color.html("#6ad0ff")
	input.add_theme_stylebox_override("focus", focus)


func _on_submit(text: String) -> void:
	var message := text.strip_edges()
	if not message.is_empty():
		send_requested.emit(message.substr(0, 120))
	close_input()


func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		close_input()
		input.accept_event()
