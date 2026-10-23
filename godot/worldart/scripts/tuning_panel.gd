extends CanvasLayer
## 調整・比較・プリセット用のパネル。値の定義は tuning_params.gd、読み書きは親の main.gd に任せる。

const PARAMS = preload("res://scripts/tuning_params.gd")

var panel_open := false
var _main: Node
var _panel: PanelContainer
var _map_opt: OptionButton
var _view_opt: OptionButton
var _preset_opt: OptionButton
var _preset_names := PackedStringArray()
var _status: Label
var _ref: TextureRect
var _group_boxes := {}
var _controls := {}
var _value_labels := {}
var _ref_cache := {}
var _busy := false
var _updating := false


func _ready() -> void:
	layer = 60
	_main = get_parent()
	_build_comparison()
	_build_panel()
	_panel.visible = panel_open
	refresh()
	set_hold_state(_main.hold_kind)


func _build_panel() -> void:
	_panel = PanelContainer.new()
	_panel.name = "TuningPanel"
	_panel.anchor_left = 1.0
	_panel.anchor_right = 1.0
	_panel.anchor_top = 0.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = -700
	_panel.offset_right = -290
	_panel.offset_top = 10
	_panel.offset_bottom = -10
	_panel.custom_minimum_size = Vector2(410, 0)
	add_child(_panel)

	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 6)
	_panel.add_child(outer)
	var title := Label.new()
	title.text = "調整ラボ　Tab で開閉"
	title.add_theme_font_size_override("font_size", 18)
	outer.add_child(title)

	var selectors := GridContainer.new()
	selectors.columns = 2
	selectors.add_child(_label("地図"))
	_map_opt = OptionButton.new()
	_map_opt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_map_opt.item_selected.connect(_on_map_selected)
	selectors.add_child(_map_opt)
	selectors.add_child(_label("ビュー"))
	_view_opt = OptionButton.new()
	_view_opt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_view_opt.item_selected.connect(_on_view_selected)
	selectors.add_child(_view_opt)
	outer.add_child(selectors)

	var compare_row := HBoxContainer.new()
	var ref_button := Button.new()
	ref_button.text = "見本を押して見る (1)"
	ref_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ref_button.button_down.connect(func(): _main.set_hold("ref"))
	ref_button.button_up.connect(func(): _main.set_hold(""))
	compare_row.add_child(ref_button)
	var default_button := Button.new()
	default_button.text = "既定を押して見る (2)"
	default_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	default_button.button_down.connect(func(): _main.set_hold("default"))
	default_button.button_up.connect(func(): _main.set_hold(""))
	compare_row.add_child(default_button)
	outer.add_child(compare_row)

	var reset_row := HBoxContainer.new()
	var reset_all := Button.new()
	reset_all.text = "すべて既定に戻す"
	reset_all.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset_all.pressed.connect(_reset_group.bind(""))
	reset_row.add_child(reset_all)
	outer.add_child(reset_row)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	outer.add_child(scroll)
	var sections := VBoxContainer.new()
	sections.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sections.add_theme_constant_override("separation", 4)
	scroll.add_child(sections)
	for group in ["光", "色", "仕上げ", "研究の切り替え"]:
		_add_group(sections, group)

	var preset_box := VBoxContainer.new()
	preset_box.add_child(_label("プリセット"))
	var save_row := HBoxContainer.new()
	var preset_name := LineEdit.new()
	preset_name.name = "PresetName"
	preset_name.placeholder_text = "名前（48文字まで）"
	preset_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_row.add_child(preset_name)
	var save_button := Button.new()
	save_button.text = "保存"
	save_button.pressed.connect(_save_preset.bind(preset_name))
	save_row.add_child(save_button)
	preset_box.add_child(save_row)
	var preset_row := HBoxContainer.new()
	_preset_opt = OptionButton.new()
	_preset_opt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preset_row.add_child(_preset_opt)
	var load_button := Button.new()
	load_button.text = "読み込み"
	load_button.pressed.connect(_load_preset)
	preset_row.add_child(load_button)
	var delete_button := Button.new()
	delete_button.text = "削除"
	delete_button.pressed.connect(_delete_preset)
	preset_row.add_child(delete_button)
	preset_box.add_child(preset_row)
	var copy_button := Button.new()
	copy_button.text = "既定との差をコピー"
	copy_button.pressed.connect(_copy_values)
	preset_box.add_child(copy_button)
	outer.add_child(preset_box)

	_status = _label("")
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	outer.add_child(_status)
	var help := _label("1 / 2 は押している間だけ比較。M は地図・ビューの既存メニュー。")
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	outer.add_child(help)


func _build_comparison() -> void:
	var root := Control.new()
	root.name = "ComparisonOverlay"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_ref = TextureRect.new()
	_ref.name = "ReferenceImage"
	_ref.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ref.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_ref.stretch_mode = TextureRect.STRETCH_SCALE
	_ref.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ref.visible = false
	root.add_child(_ref)
	var badge := PanelContainer.new()
	badge.offset_left = 10
	badge.offset_top = 10
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(badge)
	var label := Label.new()
	label.name = "HoldLabel"
	label.add_theme_font_size_override("font_size", 13)
	badge.add_child(label)
	root.set_meta("hold_label", label)


func _add_group(parent: VBoxContainer, group: String) -> void:
	var header := HBoxContainer.new()
	var toggle := Button.new()
	toggle.text = group
	toggle.toggle_mode = true
	toggle.button_pressed = true
	toggle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(toggle)
	var reset := Button.new()
	reset.text = "既定"
	reset.custom_minimum_size.x = 58
	reset.pressed.connect(_reset_group.bind(group))
	header.add_child(reset)
	parent.add_child(header)
	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 3)
	parent.add_child(content)
	toggle.toggled.connect(func(open: bool): content.visible = open)
	_group_boxes[group] = content
	for item in PARAMS.PARAMS:
		if item.group == group:
			_add_param(content, item)


func _add_param(parent: VBoxContainer, item: Dictionary) -> void:
	var line := VBoxContainer.new()
	line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_theme_constant_override("separation", 1)
	var head := HBoxContainer.new()
	var title := _label(item.label)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var value_label := _label("")
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.custom_minimum_size.x = 56
	head.add_child(value_label)
	line.add_child(head)
	var control: Control
	match item.kind:
		"slider":
			var slider := HSlider.new()
			slider.min_value = item.min
			slider.max_value = item.max
			slider.step = item.step
			slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			slider.value_changed.connect(_on_slider_changed.bind(item.key))
			control = slider
		"toggle":
			var check := CheckButton.new()
			check.text = item.label
			check.toggled.connect(_on_toggle_changed.bind(item.key))
			control = check
		"choice":
			var choice := OptionButton.new()
			for option in item.choices:
				choice.add_item(String(option))
			choice.item_selected.connect(_on_choice_changed.bind(item.key))
			control = choice
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(control)
	parent.add_child(line)
	_controls[item.key] = control
	_value_labels[item.key] = value_label


func _label(value: String) -> Label:
	var result := Label.new()
	result.text = value
	result.add_theme_font_size_override("font_size", 13)
	return result


func refresh() -> void:
	if _main == null or _map_opt == null:
		return
	_busy = true
	var maps: PackedStringArray = _main.maps()
	var views: PackedStringArray = _main.views()
	_map_opt.clear()
	for name in maps:
		_map_opt.add_item(name)
	_map_opt.select(maps.find(_main.world.map_name))
	_view_opt.clear()
	for name in views:
		_view_opt.add_item(name)
	_view_opt.select(views.find(_main.view_name))
	refresh_values()
	_refresh_presets()
	_busy = false


func refresh_values() -> void:
	if _main == null:
		return
	_updating = true
	for item in PARAMS.PARAMS:
		if not _controls.has(item.key):
			continue
		var value = _main.get_param(item.key)
		var control: Control = _controls[item.key]
		match item.kind:
			"slider":
				(control as HSlider).value = float(value)
				_value_labels[item.key].text = _format_number(float(value), 2)
			"toggle":
				(control as CheckButton).button_pressed = bool(value)
				_value_labels[item.key].text = "ON" if bool(value) else "OFF"
			"choice":
				var options: Array = item.choices
				(control as OptionButton).select(options.find(value))
				_value_labels[item.key].text = String(value)
	_updating = false
	_update_reference()


func set_panel_open(open: bool) -> void:
	panel_open = open
	if _panel != null:
		_panel.visible = open


func toggle_panel() -> void:
	set_panel_open(not panel_open)


func set_hold_state(kind: String) -> void:
	if not is_instance_valid(_ref):
		return
	var label: Label = get_node("ComparisonOverlay").get_meta("hold_label")
	var has_ref := _update_reference_texture()
	_ref.visible = kind == "ref" and has_ref
	label.text = "見本" if kind == "ref" and has_ref else ("既定" if kind == "default" else "")
	label.get_parent().visible = not label.text.is_empty()
	if _status != null:
		_status.text = "見本がないビューです" if kind == "ref" and not has_ref else ""


func _update_reference() -> void:
	if _main != null:
		set_hold_state(_main.hold_kind)


func _update_reference_texture() -> bool:
	if _main == null or _main.world.map_name != "mihon2":
		_ref.texture = null
		return false
	var view := String(_main.view_name).split("@")[0]
	if not ["B01", "B02", "B03", "B04"].has(view):
		_ref.texture = null
		return false
	if not _ref_cache.has(view):
		var path := ProjectSettings.globalize_path("res://../../art/ref/%s.webp" % view)
		var image := Image.new()
		if image.load(path) != OK:
			_ref_cache[view] = null
			return false
		if image.get_width() < 1530 or image.get_height() < 868:
			_ref_cache[view] = null
			return false
		var x := int((image.get_width() - 1530) / 2)
		var cropped := image.get_region(Rect2i(x, 0, 1530, 868))
		_ref_cache[view] = ImageTexture.create_from_image(cropped)
	_ref.texture = _ref_cache[view]
	return _ref.texture != null


func _on_slider_changed(value: float, key: String) -> void:
	if _updating:
		return
	_main.set_param(key, value)
	_value_labels[key].text = _format_number(value, 2)


func _on_toggle_changed(value: bool, key: String) -> void:
	if not _updating:
		_main.set_param(key, value)


func _on_choice_changed(index: int, key: String) -> void:
	if _updating:
		return
	var item := PARAMS.find(key)
	if index >= 0 and index < item.choices.size():
		_main.set_param(key, item.choices[index])
		_value_labels[key].text = String(item.choices[index])


func _on_map_selected(index: int) -> void:
	if _busy:
		return
	var maps: PackedStringArray = _main.maps()
	if index < 0 or index >= maps.size():
		return
	_busy = true
	await _main.load_map(maps[index])
	refresh()


func _on_view_selected(index: int) -> void:
	if _busy:
		return
	var views: PackedStringArray = _main.views()
	if index >= 0 and index < views.size():
		_main.set_view(views[index])
		refresh_values()


func _reset_group(group: String) -> void:
	for item in PARAMS.PARAMS:
		if group.is_empty() or item.group == group:
			_main.set_param(item.key, item.default)
	refresh_values()


func _preset_dir() -> String:
	return "user://presets"


func _refresh_presets() -> void:
	if _preset_opt == null:
		return
	_preset_names.clear()
	var dir := DirAccess.open(_preset_dir())
	if dir != null:
		for file in dir.get_files():
			if file.ends_with(".json"):
				_preset_names.append(file.trim_suffix(".json"))
	_preset_names.sort()
	_preset_opt.clear()
	for name in _preset_names:
		_preset_opt.add_item(name)
	if not _preset_names.is_empty():
		_preset_opt.select(0)


func _save_preset(name_edit: LineEdit) -> void:
	var name := name_edit.text.strip_edges()
	for invalid in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"]:
		name = name.replace(invalid, "_")
	while name.ends_with(".") or name.ends_with(" "):
		name = name.substr(0, name.length() - 1)
	if name.is_empty() or name in [".", ".."] or name.length() > 48:
		_status.text = "名前を入力してください（48 文字まで）"
		return
	var full_dir := ProjectSettings.globalize_path(_preset_dir())
	DirAccess.make_dir_recursive_absolute(full_dir)
	var values := {}
	for item in PARAMS.PARAMS:
		values[item.key] = _main.get_param(item.key)
	var file := FileAccess.open("%s/%s.json" % [_preset_dir(), name], FileAccess.WRITE)
	if file == null:
		_status.text = "保存できませんでした"
		return
	file.store_string(JSON.stringify({"name": name, "values": values}, "\t"))
	_refresh_presets()
	_preset_opt.select(_preset_names.find(name))
	_status.text = "保存しました: %s" % name


func _load_preset() -> void:
	if _preset_opt.selected < 0 or _preset_opt.selected >= _preset_names.size():
		return
	var name: String = _preset_names[_preset_opt.selected]
	var file := FileAccess.open("%s/%s.json" % [_preset_dir(), name], FileAccess.READ)
	if file == null:
		_status.text = "読み込めませんでした"
		return
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary or not data.get("values", {}) is Dictionary:
		_status.text = "プリセットの形式が正しくありません"
		return
	for key in data.values:
		_main.set_param(String(key), data.values[key])
	refresh_values()
	_status.text = "読み込みました: %s" % name


func _delete_preset() -> void:
	if _preset_opt.selected < 0 or _preset_opt.selected >= _preset_names.size():
		return
	var name: String = _preset_names[_preset_opt.selected]
	var path := ProjectSettings.globalize_path("%s/%s.json" % [_preset_dir(), name])
	if DirAccess.remove_absolute(path) == OK:
		_refresh_presets()
		_status.text = "削除しました: %s" % name
	else:
		_status.text = "削除できませんでした"


func _copy_values() -> void:
	var pairs := PackedStringArray()
	for item in PARAMS.PARAMS:
		var value = _main.get_param(item.key)
		var default_value = item.default
		if value is float or value is int:
			if abs(float(value) - float(default_value)) < 0.00001:
				continue
		elif value == default_value:
			continue
		pairs.append("%s=%s" % [item.key, _url_value(value)])
	var query := "&".join(pairs)
	DisplayServer.clipboard_set(query)
	print("COPY ", query)
	_status.text = "クリップボードにコピーしました"


func _url_value(value) -> String:
	if value is bool:
		return "1" if value else "0"
	if value is float or value is int:
		return _format_number(float(value), 4)
	return String(value)


func _format_number(value: float, decimals: int) -> String:
	var result := String.num(value, decimals)
	while result.contains(".") and result.ends_with("0"):
		result = result.substr(0, result.length() - 1)
	if result.ends_with("."):
		result = result.substr(0, result.length() - 1)
	return "0" if result == "-0" else result
