extends Control

const AudioModule = preload("res://scripts/game/audio.gd")

var _audio: GameAudio
var _sound_grid: GridContainer
var _sound_count_hint: Label
var _volume_values := [1.0, 1.0, 1.0, 1.0]


func _ready() -> void:
	_build_ui()
	_audio = AudioModule.new()
	_audio.name = "GameAudio"
	add_child(_audio)
	_audio.set_volumes(_volume_values[0], _volume_values[1], _volume_values[2], _volume_values[3])
	_sound_count_hint.text = "全 %d 音。音量は各バスのスライダーで調整できます。" % _audio.get_sound_names().size()
	_build_sound_buttons()


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = Color(0.055, 0.065, 0.08)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	move_child(background, 0)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in [&"margin_left", &"margin_top", &"margin_right", &"margin_bottom"]:
		margin.add_theme_constant_override(side, 24)
	add_child(margin)

	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 14)
	margin.add_child(content)

	var title := Label.new()
	title.text = "効果音の試し聞き"
	title.add_theme_font_size_override("font_size", 28)
	content.add_child(title)

	var volume_row := HBoxContainer.new()
	volume_row.add_theme_constant_override("separation", 20)
	content.add_child(volume_row)
	var bus_names := ["Master", "Music", "SFX", "Amb"]
	for i in bus_names.size():
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		volume_row.add_child(column)
		var label := Label.new()
		label.text = bus_names[i]
		column.add_child(label)
		var slider := HSlider.new()
		slider.min_value = 0.0
		slider.max_value = 1.0
		slider.step = 0.01
		slider.value = 1.0
		slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slider.value_changed.connect(_on_volume_changed.bind(i))
		column.add_child(slider)

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 10)
	content.add_child(action_row)
	var repeat_button := Button.new()
	repeat_button.text = "8 連打"
	repeat_button.pressed.connect(_on_eight_pressed)
	action_row.add_child(repeat_button)
	var simultaneous_button := Button.new()
	simultaneous_button.text = "3 つ同時"
	simultaneous_button.pressed.connect(_on_three_pressed)
	action_row.add_child(simultaneous_button)
	_sound_count_hint = Label.new()
	_sound_count_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_row.add_child(_sound_count_hint)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(scroll)
	_sound_grid = GridContainer.new()
	_sound_grid.name = "SoundButtons"
	_sound_grid.columns = 8
	_sound_grid.add_theme_constant_override("h_separation", 8)
	_sound_grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(_sound_grid)


func _build_sound_buttons() -> void:
	var names := _audio.get_sound_names()
	for sound_name in names:
		var button := Button.new()
		button.text = sound_name
		button.custom_minimum_size = Vector2(155, 38)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_play_sound.bind(sound_name))
		_sound_grid.add_child(button)


func _play_sound(sound_name: String) -> void:
	_audio.sfx(sound_name)


func _on_eight_pressed() -> void:
	for i in range(8):
		_audio.sfx("swing")
		if i < 7:
			await get_tree().create_timer(0.04).timeout


func _on_three_pressed() -> void:
	_audio.sfx("swing")
	_audio.sfx("hit")
	_audio.sfx("skill")


func _on_volume_changed(value: float, bus_index: int) -> void:
	_volume_values[bus_index] = value
	_audio.set_volumes(_volume_values[0], _volume_values[1], _volume_values[2], _volume_values[3])
