class_name GameSettingsPanel
extends Control
## ブラウザ版 #settings の項目・表示順・値は public/index.html と public/js/ui/panels/settings.js を参照。

signal setting_changed(key: String, value: Variant)

const SETTINGS_KEY := "eterna_settings_v1"
const PANEL_WIDTH := 460.0 # public/style.css #settings
const AUDIO_KEYS := ["master", "music", "sfx", "amb"]
const QUALITY_VALUES := ["high", "mid", "low"]
const FX_VALUES := ["blend", "anime", "flashy", "subtle", "classic"]

class VolumeVisual extends Control:
	var ratio := 1.0

	func _draw() -> void:
		# public/index.html の range input の既定トラックと青い進捗表示を 1532×869 の比較寸法で描く。
		var left := 8.0
		var right := size.x - 8.0
		var center_y := size.y * 0.5
		var end_x := lerpf(left, right, clampf(ratio, 0.0, 1.0))
		var track := Color.html("#dee2e6")
		var fill := Color.html("#0d6efd")
		draw_rect(Rect2(Vector2(left + 2.0, center_y - 2.0), Vector2(maxf(right - left - 4.0, 0.0), 4.0)), track)
		draw_circle(Vector2(left + 2.0, center_y), 2.0, track)
		draw_circle(Vector2(right - 2.0, center_y), 2.0, track)
		if end_x > left + 2.0:
			draw_rect(Rect2(Vector2(left + 2.0, center_y - 2.0), Vector2(end_x - left - 2.0, 4.0)), fill)
			draw_circle(Vector2(left + 2.0, center_y), 2.0, fill)
		draw_circle(Vector2(end_x, center_y), 7.0, fill)

class CheckVisual extends Control:
	var checked := true

	func _draw() -> void:
		var box_size := Vector2(18.0, 18.0)
		var origin := (size - box_size) * 0.5
		var box := Rect2(origin, box_size)
		if checked:
			draw_rect(box, Color.html("#0d6efd"))
			draw_line(origin + Vector2(4.0, 9.0), origin + Vector2(7.0, 12.0), Color.WHITE, 2.0, true)
			draw_line(origin + Vector2(7.0, 12.0), origin + Vector2(14.0, 5.0), Color.WHITE, 2.0, true)
		else:
			draw_rect(box, Color.WHITE)
			draw_rect(box, Color.html("#adb5bd"), false, 1.5)

var game
var panel: PanelContainer
var backdrop: ColorRect
var volume_outputs := {}
var volume_sliders := {}
var volume_visuals := {}
var quality_select: OptionButton
var fx_select: OptionButton
var shake_check: CheckBox
var dmgnum_check: CheckBox
var occlusion_check: CheckBox


static func apply_volumes(audio, values: Dictionary) -> void:
	if audio == null: return
	audio.set_volumes(float(values.get("master", 1.0)), float(values.get("music", 1.0)), float(values.get("sfx", 1.0)), float(values.get("amb", 1.0)))


func build(owner) -> void:
	game = owner
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel = PanelContainer.new()
	panel.name = "SettingsPanel"
	panel.custom_minimum_size.x = PANEL_WIDTH
	panel.custom_minimum_size.y = 468.0 # 1532×869 の #settings 実寸（public/style.css）
	panel.add_theme_stylebox_override("panel", _panel_style())
	backdrop = game.hud_ui.add_panel_backdrop(self)
	add_child(panel)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	panel.add_child(body)
	_build_header(body)
	_build_sound_group(body)
	_build_display_group(body)
	var footer := _label("設定はこのブラウザに保存されます", 12, Color.html("#8fa0b8"))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(footer)
	_fit_panel()
	panel.visible = false


func _build_header(parent: VBoxContainer) -> void:
	var header_margin := MarginContainer.new()
	header_margin.add_theme_constant_override("margin_bottom", 10)
	parent.add_child(header_margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	header_margin.add_child(row)
	var title := _label("設定", 16, Color.html("#e8eef8"))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(title)
	var close := _button("×", 16)
	close.custom_minimum_size = Vector2(28.0, 28.0)
	row.add_child(close)
	close.pressed.connect(close_panel)


func _build_sound_group(parent: VBoxContainer) -> void:
	var group := VBoxContainer.new()
	group.add_theme_constant_override("separation", 8)
	parent.add_child(group)
	group.add_child(_label("サウンド", 12, Color.html("#6ad0ff")))
	for spec in [["master", "全体の音量"], ["music", "BGM"], ["sfx", "効果音"], ["amb", "環境音"]]:
		var key := String(spec[0])
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		group.add_child(row)
		var title := _label(String(spec[1]), 13, Color.html("#e8eef8"))
		title.custom_minimum_size.x = 110.0
		row.add_child(title)
		var slider := HSlider.new()
		slider.name = "Volume_" + key
		slider.min_value = 0.0
		slider.max_value = 100.0
		slider.step = 1.0
		slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slider.custom_minimum_size.y = 20.0
		row.add_child(slider)
		var visual := VolumeVisual.new()
		visual.mouse_filter = Control.MOUSE_FILTER_IGNORE
		visual.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		slider.add_child(visual)
		var output := _label("100", 13, Color.html("#8fa0b8"))
		output.custom_minimum_size.x = 36.0
		output.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(output)
		slider.value_changed.connect(_on_volume_changed.bind(key, output, visual))
		volume_sliders[key] = slider
		volume_outputs[key] = output
		volume_visuals[key] = visual


func _build_display_group(parent: VBoxContainer) -> void:
	var group := VBoxContainer.new()
	group.add_theme_constant_override("separation", 8)
	parent.add_child(group)
	group.add_child(_label("表示", 12, Color.html("#6ad0ff")))
	quality_select = _add_select(group, "画質", ["高（光の演出・影・草すべて）", "標準（草を半分に）", "軽量（光の演出と影なし・草少なめ）"], QUALITY_VALUES, "quality")
	fx_select = _add_select(group, "エフェクト", ["A+B（アニメ調・明るめ）", "アニメ調", "派手", "控えめ", "以前の見た目"], FX_VALUES, "fx")
	shake_check = _add_check(group, "画面の揺れ", "shake")
	dmgnum_check = _add_check(group, "ダメージの数字", "dmgnum")
	occlusion_check = _add_check(group, "手前の敵・障害物を透かす", "occlusion")


func _add_select(parent: VBoxContainer, title_text: String, labels: Array, values: Array, key: String) -> OptionButton:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var title := _label(title_text, 13, Color.html("#e8eef8"))
	title.custom_minimum_size.x = 110.0
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	row.add_child(title)
	var select := OptionButton.new()
	select.name = "Select_" + key
	select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	select.add_theme_font_size_override("font_size", 13)
	select.add_theme_color_override("font_color", Color.html("#e8eef8"))
	select.add_theme_stylebox_override("normal", _select_style())
	select.add_theme_stylebox_override("hover", _select_style())
	for value in labels: select.add_item(String(value))
	row.add_child(select)
	select.item_selected.connect(func(index: int):
		if index >= 0 and index < values.size(): setting_changed.emit(key, values[index])
	)
	return select


func _add_check(parent: VBoxContainer, title_text: String, key: String) -> CheckBox:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var title := _label(title_text, 13, Color.html("#e8eef8"))
	title.custom_minimum_size.x = 110.0
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	row.add_child(title)
	var check := CheckBox.new()
	check.name = "Check_" + key
	check.custom_minimum_size = Vector2(18.0, 18.0)
	var visual := CheckVisual.new()
	visual.name = "CheckVisual"
	visual.mouse_filter = Control.MOUSE_FILTER_IGNORE
	visual.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	check.add_child(visual)
	row.add_child(check)
	check.toggled.connect(func(value: bool):
		visual.checked = value
		visual.queue_redraw()
		setting_changed.emit(key, value)
	)
	return check


func _on_volume_changed(value: float, key: String, output: Label, visual: VolumeVisual) -> void:
	output.text = str(roundi(value))
	visual.ratio = value / 100.0
	visual.queue_redraw()
	setting_changed.emit(key, value / 100.0)


func refresh(values: Dictionary) -> void:
	for key in AUDIO_KEYS:
		var percent := roundi(float(values.get(key, 1.0)) * 100.0)
		volume_sliders[key].set_block_signals(true)
		volume_sliders[key].value = percent
		volume_sliders[key].set_block_signals(false)
		volume_outputs[key].text = str(percent)
		volume_visuals[key].ratio = float(percent) / 100.0
		volume_visuals[key].queue_redraw()
	_select_value(quality_select, QUALITY_VALUES, String(values.get("quality", "high")))
	_select_value(fx_select, FX_VALUES, String(values.get("fx", "blend")))
	_set_check(shake_check, bool(values.get("shake", true)))
	_set_check(dmgnum_check, bool(values.get("dmgnum", true)))
	_set_check(occlusion_check, bool(values.get("occlusion", true)))


func _set_check(check: CheckBox, value: bool) -> void:
	check.set_block_signals(true)
	check.button_pressed = value
	check.set_block_signals(false)
	var visual := check.get_node("CheckVisual") as CheckVisual
	visual.checked = value
	visual.queue_redraw()


func _select_value(select: OptionButton, values: Array, value: String) -> void:
	var index := values.find(value)
	if index < 0: index = 0
	select.set_block_signals(true)
	select.select(index)
	select.set_block_signals(false)


func is_open() -> bool:
	return panel != null and panel.visible


func open() -> void:
	panel.visible = true
	backdrop.visible = true
	refresh(game.settings)
	_fit_panel()


func close_panel() -> void:
	if panel != null: panel.visible = false
	if backdrop != null: backdrop.visible = false


func _fit_panel() -> void:
	if panel == null: return
	var viewport := get_viewport_rect().size if is_inside_tree() else Vector2(1532.0, 869.0)
	var desired := panel.get_combined_minimum_size()
	var w := minf(PANEL_WIDTH, viewport.x * 0.94)
	panel.size = Vector2(w, minf(maxf(desired.y, 120.0), viewport.y * 0.94))
	panel.position = (viewport - panel.size) * 0.5
	if backdrop != null:
		backdrop.position = panel.position + Vector2.ONE
		backdrop.size = panel.size - Vector2(2.0, 2.0)
		(backdrop.material as ShaderMaterial).set_shader_parameter("panel_size", backdrop.size)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree(): call_deferred("_fit_panel")


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0, 0.0)
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 24
	style.content_margin_left = 14.0; style.content_margin_right = 14.0
	style.content_margin_top = 14.0; style.content_margin_bottom = 14.0
	return style


func _select_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.45)
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 6.0; style.content_margin_right = 6.0
	style.content_margin_top = 6.0; style.content_margin_bottom = 6.0
	return style


func _button(value: String, font_size: int) -> Button:
	var button := Button.new()
	button.text = value
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", Color.html("#e8eef8"))
	var style := StyleBoxFlat.new()
	style.bg_color = Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	style.set_border_width_all(1); style.set_corner_radius_all(6)
	style.content_margin_left = 10.0; style.content_margin_right = 10.0
	style.content_margin_top = 6.0; style.content_margin_bottom = 6.0
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)
	button.add_theme_stylebox_override("pressed", style)
	return button


func _label(value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label
