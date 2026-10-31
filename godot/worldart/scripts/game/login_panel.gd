class_name GameLoginPanel
extends RefCounted
## ログイン画面。配置・文言・色は public/index.html L19-37 と public/style.css L1-36 を参照。

signal start_requested(name: String, color: Color, kind: String)
signal fresh_requested(name: String, color: Color, kind: String)

const WEAPON_NAMES := {
	"sword": "片手剣", "greatsword": "大剣", "spear": "盾槍",
	"axe": "大斧", "bow": "弓", "dagger": "短剣",
}
const PANEL_COLOR := Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72)
const LINE_COLOR := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
const TEXT_COLOR := Color(0.91, 0.933, 0.973, 1.0)
const DIM_COLOR := Color(0.561, 0.627, 0.722, 1.0)

var panel: Control
var name_edit: LineEdit
var color_picker: ColorPickerButton
var weapon_wrap: VBoxContainer
var weapon_buttons: Dictionary = {}
var existing_label: Label
var start_button: Button
var fresh_button: Button
var selected_kind := "sword"
var has_existing := false
var fresh_armed_until := 0
var saved_level := 1


func build(host: Control, character: Dictionary, saved: bool, fresh_kind: String, fresh_color: Color) -> Control:
	var frame := Control.new()
	frame.name = "LoginScreen"
	frame.set_anchors_preset(Control.PRESET_FULL_RECT)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(frame)

	var backdrop := TextureRect.new()
	backdrop.name = "LoginBackdrop"
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([
		Color(10.0 / 255.0, 25.0 / 255.0, 60.0 / 255.0, 0.35),
		Color(4.0 / 255.0, 8.0 / 255.0, 20.0 / 255.0, 0.85),
	])
	var backdrop_texture := GradientTexture2D.new()
	backdrop_texture.gradient = gradient
	backdrop_texture.width = 512
	backdrop_texture.height = 512
	backdrop_texture.fill = GradientTexture2D.FILL_RADIAL
	backdrop_texture.fill_from = Vector2(0.5, 0.4)
	backdrop_texture.fill_to = Vector2(0.5, 0.96)
	backdrop.texture = backdrop_texture
	frame.add_child(backdrop)

	var center := CenterContainer.new()
	center.name = "LoginCenter"
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(center)
	var group := VBoxContainer.new()
	group.name = "LoginGroup"
	group.custom_minimum_size.x = 380.0
	group.add_theme_constant_override("separation", 28)
	center.add_child(group)

	var logo := VBoxContainer.new()
	logo.name = "Logo"
	logo.add_theme_constant_override("separation", 8)
	group.add_child(logo)
	var subtitle := Label.new()
	subtitle.text = "― CO-OP HARD / 3 FLOORS / 3–5 PLAYERS ―"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 12)
	subtitle.add_theme_color_override("font_color", Color.html("#9ac8ff"))
	subtitle.add_theme_constant_override("font_spacing", 4)
	logo.add_child(subtitle)
	var title := Label.new()
	title.text = "浮遊城エテルナ"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 72)
	title.add_theme_color_override("font_color", Color.html("#8fd8ff"))
	title.add_theme_constant_override("font_spacing", 9)
	var title_settings := LabelSettings.new()
	title_settings.font_size = 72
	title_settings.font_color = Color.html("#8fd8ff")
	title_settings.shadow_color = Color(80.0 / 255.0, 160.0 / 255.0, 1.0, 0.6)
	title_settings.shadow_size = 20
	title.label_settings = title_settings
	logo.add_child(title)

	panel = PanelContainer.new()
	panel.name = "LoginPanel"
	panel.custom_minimum_size.x = 380.0
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = PANEL_COLOR
	panel_style.border_color = LINE_COLOR
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(10)
	panel_style.content_margin_left = 22.0
	panel_style.content_margin_top = 22.0
	panel_style.content_margin_right = 22.0
	panel_style.content_margin_bottom = 22.0
	panel_style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	panel_style.shadow_size = 24
	panel.add_theme_stylebox_override("panel", panel_style)
	group.add_child(panel)
	var fields := VBoxContainer.new()
	fields.name = "LoginFields"
	fields.add_theme_constant_override("separation", 14)
	panel.add_child(fields)

	name_edit = LineEdit.new()
	name_edit.name = "CharacterName"
	name_edit.max_length = 12
	name_edit.placeholder_text = "名前を入力"
	name_edit.custom_minimum_size.y = 34.0
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_edit.text = String(character.get("name", "")) if saved else ""
	_apply_input_style(name_edit)
	fields.add_child(_labeled_row("キャラクター名", name_edit, true))

	color_picker = ColorPickerButton.new()
	color_picker.name = "CharacterColor"
	color_picker.custom_minimum_size = Vector2(60.0, 34.0)
	color_picker.edit_alpha = false
	color_picker.color = _read_color(character.get("color", "#3aa0ff"), fresh_color) if saved else fresh_color
	_apply_color_button_style(color_picker)
	fields.add_child(_labeled_row("カラー", color_picker, false))

	weapon_wrap = VBoxContainer.new()
	weapon_wrap.name = "InitialWeapon"
	weapon_wrap.add_theme_constant_override("separation", 6)
	fields.add_child(weapon_wrap)
	var weapon_heading := Label.new()
	weapon_heading.text = "初期武器（新規キャラのみ）"
	weapon_heading.add_theme_font_size_override("font_size", 13)
	weapon_heading.add_theme_color_override("font_color", DIM_COLOR)
	weapon_wrap.add_child(weapon_heading)
	var weapon_row := HBoxContainer.new()
	weapon_row.name = "WeaponChoices"
	weapon_row.add_theme_constant_override("separation", 4)
	weapon_wrap.add_child(weapon_row)
	var weapon_kinds := ["sword", "greatsword", "spear", "axe", "bow", "dagger"]
	selected_kind = String(character.get("eq", {}).get("weapon", {}).get("kind", fresh_kind)) if saved else fresh_kind
	if not WEAPON_NAMES.has(selected_kind): selected_kind = "sword"
	for kind in weapon_kinds:
		var choice := Button.new()
		choice.text = WEAPON_NAMES[kind]
		choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		choice.custom_minimum_size.y = 32.0
		choice.focus_mode = Control.FOCUS_NONE
		choice.add_theme_font_size_override("font_size", 11)
		choice.add_theme_color_override("font_color", TEXT_COLOR)
		choice.pressed.connect(func(): _select_weapon(kind))
		weapon_buttons[kind] = choice
		weapon_row.add_child(choice)
	_update_weapon_styles()

	existing_label = Label.new()
	existing_label.name = "ExistingCharacter"
	existing_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	existing_label.add_theme_font_size_override("font_size", 13)
	existing_label.add_theme_color_override("font_color", Color.html("#99ffee"))
	fields.add_child(existing_label)

	start_button = Button.new()
	start_button.name = "StartGame"
	start_button.custom_minimum_size.y = 48.0
	start_button.add_theme_font_size_override("font_size", 18)
	start_button.add_theme_color_override("font_color", TEXT_COLOR)
	start_button.add_theme_constant_override("font_spacing", 3)
	var start_gradient := Gradient.new()
	start_gradient.colors = PackedColorArray([Color.html("#2a6aff"), Color.html("#3ad0ff")])
	var start_texture := GradientTexture2D.new()
	start_texture.gradient = start_gradient
	start_texture.width = 256
	start_texture.height = 2
	start_texture.fill = GradientTexture2D.FILL_LINEAR
	start_texture.fill_from = Vector2(0.0, 0.5)
	start_texture.fill_to = Vector2(1.0, 0.5)
	var start_style := StyleBoxTexture.new()
	start_style.texture = start_texture
	start_button.add_theme_stylebox_override("normal", start_style)
	start_button.add_theme_stylebox_override("hover", start_style)
	start_button.pressed.connect(_on_start)
	fields.add_child(start_button)

	fresh_button = Button.new()
	fresh_button.name = "StartFresh"
	fresh_button.text = "最初からはじめる"
	fresh_button.custom_minimum_size.y = 30.0
	fresh_button.focus_mode = Control.FOCUS_NONE
	fresh_button.add_theme_font_size_override("font_size", 13)
	fresh_button.add_theme_color_override("font_color", DIM_COLOR)
	_apply_fresh_style(false)
	fresh_button.pressed.connect(_on_fresh)
	fields.add_child(fresh_button)

	var note := Label.new()
	note.name = "LoginNote"
	note.text = "協力ハード・3〜5人推奨。戦闘不能でキャラクターデータ消失。通常版とは別セーブです。"
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_theme_font_size_override("font_size", 11)
	note.add_theme_color_override("font_color", DIM_COLOR)
	fields.add_child(note)

	has_existing = saved
	if saved:
		saved_level = int(character.get("lv", 1))
		var weapon_name := String(WEAPON_NAMES.get(selected_kind, WEAPON_NAMES.sword))
		existing_label.text = "つづきから：Lv%d %s（%s）" % [saved_level, String(character.get("name", "")), weapon_name]
		weapon_wrap.visible = false
		fresh_button.visible = true
	else:
		existing_label.visible = false
		fresh_button.visible = false
	_update_start_text()
	name_edit.text_submitted.connect(func(_text: String): _on_start())
	name_edit.call_deferred("grab_focus")
	return frame


func _labeled_row(caption: String, field: Control, expand: bool) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var label := Label.new()
	label.text = caption
	label.custom_minimum_size.x = 92.0
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 14)
	row.add_child(label)
	if expand:
		field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		var spacer := Control.new()
		spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(spacer)
	row.add_child(field)
	return row


func _apply_input_style(field: LineEdit) -> void:
	field.add_theme_color_override("font_color", TEXT_COLOR)
	field.add_theme_color_override("font_placeholder_color", Color(143.0 / 255.0, 160.0 / 255.0, 184.0 / 255.0, 0.65))
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.0, 0.0, 0.0, 0.4)
	normal.border_color = LINE_COLOR
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(6)
	normal.content_margin_left = 8
	normal.content_margin_right = 8
	normal.content_margin_top = 5
	normal.content_margin_bottom = 5
	field.add_theme_stylebox_override("normal", normal)
	var focus := normal.duplicate() as StyleBoxFlat
	focus.border_color = Color.html("#6ad0ff")
	field.add_theme_stylebox_override("focus", focus)


func _apply_color_button_style(button: ColorPickerButton) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.4)
	style.border_color = LINE_COLOR
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 2
	style.content_margin_right = 2
	style.content_margin_top = 2
	style.content_margin_bottom = 2
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)


func _apply_fresh_style(armed: bool) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(255.0 / 255.0, 90.0 / 255.0, 70.0 / 255.0, 0.15) if armed else Color.TRANSPARENT
	style.border_color = Color.html("#ff7a6a") if armed else LINE_COLOR
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	fresh_button.add_theme_stylebox_override("normal", style)
	fresh_button.add_theme_stylebox_override("hover", style)
	fresh_button.add_theme_color_override("font_color", Color.html("#ffb0a0") if armed else DIM_COLOR)


func _select_weapon(kind: String) -> void:
	selected_kind = kind
	_update_weapon_styles()
	_update_start_text()


func _update_weapon_styles() -> void:
	for kind in weapon_buttons:
		var button: Button = weapon_buttons[kind]
		var active := String(kind) == selected_kind
		var style := StyleBoxFlat.new()
		style.bg_color = Color(100.0 / 255.0, 190.0 / 255.0, 1.0, 0.55) if active else Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
		style.border_color = Color.html("#9ad8ff") if active else LINE_COLOR
		style.set_border_width_all(1)
		style.set_corner_radius_all(6)
		button.add_theme_stylebox_override("normal", style)
		var hover := style.duplicate() as StyleBoxFlat
		hover.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.4)
		button.add_theme_stylebox_override("hover", hover)


func _update_start_text() -> void:
	if start_button == null:
		return
	var weapon_name := String(WEAPON_NAMES.get(selected_kind, WEAPON_NAMES.sword))
	start_button.text = "つづきから（%s）" % weapon_name if has_existing else "%sで新規開始" % weapon_name


func _on_start() -> void:
	start_requested.emit(name_edit.text.strip_edges(), color_picker.color, selected_kind)


func _on_fresh() -> void:
	if not has_existing:
		return
	var now_ms := Time.get_ticks_msec()
	if now_ms > fresh_armed_until:
		fresh_armed_until = now_ms + 5000
		fresh_button.text = "Lv%d のデータが消えます。もう一度押すと最初から" % saved_level
		_apply_fresh_style(true)
		return
	fresh_requested.emit(name_edit.text.strip_edges(), color_picker.color, selected_kind)
	has_existing = false
	fresh_armed_until = 0
	existing_label.text = "新しいキャラクターではじめます"
	weapon_wrap.visible = true
	fresh_button.visible = false
	_update_start_text()
	_apply_fresh_style(false)


func _read_color(value: Variant, fallback: Color) -> Color:
	var raw := String(value)
	return Color.from_string(raw, fallback)
