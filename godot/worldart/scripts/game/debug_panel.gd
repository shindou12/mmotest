class_name GameDebugPanel
extends RefCounted
## F2 の簡易デバッグパネル。配置・色・文言は public/js/game/debug.js L103-155 の CSS と操作に合わせる。

const PANEL_COLOR := Color(16.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.94)
const ACCENT := Color(1.0, 0.541, 0.659, 1.0)
const TEXT_COLOR := Color(0.91, 0.929, 0.961, 1.0)
const BUTTON_COLOR := Color(0.137, 0.165, 0.22, 1.0)
const BUTTON_LINE := Color(0.29, 0.329, 0.408, 1.0)
const HIT_SAMPLES := [
	{"id": "deeper", "file": "deeper.mp3"},
	{"id": "heavy-flesh-v2", "file": "heavy-flesh-v2.mp3"},
	{"id": "retake2", "file": "retake2.mp3"},
	{"id": "tight", "file": "tight.mp3"},
]

var game
var root: Control
var toggle_button: Button
var panel: PanelContainer
var level_value: SpinBox
var gear_slot: OptionButton
var gear_grade: OptionButton
var gold_value: SpinBox
var invincible_button: Button
var sound_pick := "synth"
var sound_pick_buttons: Dictionary = {}
var sound_samples: Dictionary = {}
var sound_samples_loaded := false
var synth_stream: AudioStreamWAV


func build(host: Control, owner_game) -> void:
	game = owner_game
	root = host
	toggle_button = _button("DEBUG（F2）")
	toggle_button.name = "DebugToggle"
	toggle_button.position = Vector2(200.0, 8.0)
	toggle_button.custom_minimum_size = Vector2(126.0, 28.0)
	toggle_button.add_theme_font_size_override("font_size", 12)
	_set_toggle_style()
	toggle_button.pressed.connect(toggle)
	toggle_button.visible = false
	host.add_child(toggle_button)

	panel = PanelContainer.new()
	panel.name = "DebugPanel"
	panel.position = Vector2(200.0, 40.0)
	panel.size = Vector2(minf(520.0, _screen_size().x - 232.0), minf(809.0, _screen_size().y - 60.0))
	panel.custom_minimum_size = Vector2(360.0, 0.0)
	panel.z_index = 60
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.visible = false
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = PANEL_COLOR
	panel_style.border_color = ACCENT
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(10)
	panel_style.content_margin_left = 12.0
	panel_style.content_margin_top = 10.0
	panel_style.content_margin_right = 12.0
	panel_style.content_margin_bottom = 10.0
	panel.add_theme_stylebox_override("panel", panel_style)
	host.add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.name = "DebugScroll"
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	var body := VBoxContainer.new()
	body.name = "DebugControls"
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	scroll.add_child(body)

	_section(body, "そのほか")
	var state_row := HBoxContainer.new()
	state_row.add_child(_button("全回復", _heal))
	invincible_button = _button("無敵: OFF", _toggle_invincibility)
	state_row.add_child(invincible_button)
	body.add_child(state_row)

	var level_row := HBoxContainer.new()
	var level_label := _label("レベル設定")
	level_label.custom_minimum_size.x = 88.0
	level_row.add_child(level_label)
	level_value = SpinBox.new()
	level_value.min_value = 1
	level_value.max_value = maxi(1, GameRules.data()["levels"].size())
	level_value.step = 1
	level_value.value = int(game.ch.get("lv", 1))
	level_value.custom_minimum_size.x = 96.0
	level_row.add_child(level_value)
	level_row.add_child(_button("設定", _set_level))
	body.add_child(level_row)

	_section(body, "装備を出す（Lv%d）" % int(level_value.max_value))
	var gear_row := HBoxContainer.new()
	gear_slot = OptionButton.new()
	gear_slot.add_item("武器", 0); gear_slot.set_item_metadata(0, "weapon")
	gear_slot.add_item("防具", 1); gear_slot.set_item_metadata(1, "armor")
	gear_slot.add_item("装飾品", 2); gear_slot.set_item_metadata(2, "acc")
	gear_slot.custom_minimum_size.x = 94.0
	gear_grade = OptionButton.new()
	for spec in [["特性なし", 0], ["特性1つ", 1], ["特性2つ", 2], ["特性3つ", 3]]:
		gear_grade.add_item(spec[0], spec[1])
	gear_grade.select(3)
	gear_grade.custom_minimum_size.x = 106.0
	gear_row.add_child(gear_slot)
	gear_row.add_child(gear_grade)
	gear_row.add_child(_button("生成", _make_gear))
	body.add_child(gear_row)

	_section(body, "ゴールド付与")
	var gold_row := HBoxContainer.new()
	gold_value = SpinBox.new()
	gold_value.min_value = 1
	gold_value.max_value = 1000000
	gold_value.step = 100
	gold_value.value = 1000
	gold_value.custom_minimum_size.x = 120.0
	gold_row.add_child(gold_value)
	gold_row.add_child(_button("付与", _add_gold))
	body.add_child(gold_row)

	_section(body, "ヒット音（合成 vs ファイル）")
	var sound_row := HFlowContainer.new()
	sound_row.name = "HitSoundChoices"
	sound_row.add_theme_constant_override("h_separation", 4)
	sound_row.add_theme_constant_override("v_separation", 4)
	sound_pick_buttons["synth"] = _button("合成音", func(): _select_sound("synth"))
	sound_row.add_child(sound_pick_buttons["synth"])
	for spec in HIT_SAMPLES:
		var sample_id := String(spec["id"])
		sound_pick_buttons[sample_id] = _button(sample_id, func(): _select_sound(sample_id))
		sound_row.add_child(sound_pick_buttons[sample_id])
	_update_sound_pick_styles()
	body.add_child(sound_row)

	var test_row := HFlowContainer.new()
	test_row.add_theme_constant_override("h_separation", 4)
	test_row.add_theme_constant_override("v_separation", 4)
	test_row.add_child(_button("試し鳴らし", _play_sound))
	test_row.add_child(_button("8連打", func(): _play_sound_burst(8, 0.12)))
	test_row.add_child(_button("3体同時", func(): _play_sound_burst(3, 0.0)))
	test_row.add_child(_button("クリティカル", _play_critical))
	body.add_child(test_row)
	_update_invincibility_text()


func toggle() -> void:
	if panel == null:
		return
	panel.visible = not panel.visible
	if panel.visible and game.chat_panel != null and game.chat_panel.is_editing():
		game.chat_panel.close_input()
	_update_invincibility_text()


func close() -> void:
	if panel != null: panel.visible = false


func is_open() -> bool:
	return panel != null and panel.visible


func set_active(active: bool) -> void:
	if toggle_button != null:
		toggle_button.visible = active
	if active and not sound_samples_loaded:
		_load_hit_samples()


func update() -> void:
	_update_invincibility_text()


func _section(host: VBoxContainer, text: String) -> void:
	var heading := _label(text)
	heading.add_theme_font_size_override("font_size", 12)
	heading.add_theme_color_override("font_color", Color.html("#ff9ab4"))
	heading.add_theme_constant_override("margin_top", 4)
	host.add_child(heading)


func _label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", TEXT_COLOR)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _button(text: String, callback: Callable = Callable()) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size.y = 28.0
	button.add_theme_font_size_override("font_size", 12)
	button.add_theme_color_override("font_color", TEXT_COLOR)
	var normal := StyleBoxFlat.new()
	normal.bg_color = BUTTON_COLOR
	normal.border_color = BUTTON_LINE
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(5)
	normal.content_margin_left = 7.0
	normal.content_margin_right = 7.0
	normal.content_margin_top = 3.0
	normal.content_margin_bottom = 3.0
	button.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.border_color = ACCENT
	button.add_theme_stylebox_override("hover", hover)
	if callback.is_valid():
		button.pressed.connect(callback)
	return button


func _set_toggle_style() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color.html("#5a1f2e")
	style.border_color = ACCENT
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 3.0
	style.content_margin_bottom = 3.0
	toggle_button.add_theme_stylebox_override("normal", style)
	toggle_button.add_theme_stylebox_override("hover", style)
	toggle_button.add_theme_color_override("font_color", Color.html("#ffd8e0"))


func _heal() -> void:
	game.me["dead"] = false
	game.me["crawl"] = false
	game.me["downT"] = 0.0
	game.me["hp"] = game.S["mhp"]
	game.me["potions"] = game.S["maxPot"]
	game._update_hud()


func _toggle_invincibility() -> void:
	game.me["god"] = not bool(game.me.get("god", false))
	_update_invincibility_text()


func _update_invincibility_text() -> void:
	if invincible_button == null:
		return
	var on := bool(game.me.get("god", false))
	invincible_button.text = "無敵: ON" if on else "無敵: OFF"
	invincible_button.add_theme_color_override("font_color", Color.html("#ffd8e0") if on else TEXT_COLOR)


func _set_level() -> void:
	game.ch["lv"] = clampi(int(level_value.value), 1, GameRules.data()["levels"].size())
	game.ch["xp"] = 0
	game._calc()
	game.me["hp"] = game.S["mhp"]
	game._save_char()
	game._update_hud()


func _make_gear() -> void:
	var inventory: Array = game.ch.get("inv", [])
	if inventory.size() >= 60:
		game.hud_ui.toast("インベントリがいっぱいです（Iで分解）", Color.html("#ff8888"))
		return
	var slot := String(gear_slot.get_item_metadata(gear_slot.selected))
	var item: Dictionary = game.items._make_item(int(level_value.max_value), gear_grade.get_selected_id(), slot)
	inventory.push_front(item)
	game.ch["inv"] = inventory
	game._save_char()
	if game.items.inventory_panel != null and game.items.inventory_panel.panel.visible:
		game.items.inventory_panel.refresh()
	game.hud_ui.toast("「%s」を持ち物に入れた" % String(item.get("name", "装備")), GameItems.rarity_color(int(item.get("rarity", 0))))


func _add_gold() -> void:
	var amount := int(gold_value.value)
	game.ch["gold"] = int(game.ch.get("gold", 0)) + amount
	game._save_char()
	game.hud_ui.toast("+%d G" % amount, Color.html("#ffe28a"))
	game._update_hud()


func _select_sound(sound_id: String) -> void:
	sound_pick = sound_id
	_update_sound_pick_styles()


func _update_sound_pick_styles() -> void:
	for sound_id in sound_pick_buttons:
		var button: Button = sound_pick_buttons[sound_id]
		var active := String(sound_id) == sound_pick
		var style := StyleBoxFlat.new()
		style.bg_color = Color.html("#5a1f2e") if active else BUTTON_COLOR
		style.border_color = ACCENT if active else BUTTON_LINE
		style.set_border_width_all(1)
		style.set_corner_radius_all(5)
		style.content_margin_left = 7.0
		style.content_margin_right = 7.0
		style.content_margin_top = 3.0
		style.content_margin_bottom = 3.0
		button.add_theme_stylebox_override("normal", style)
		var hover := style.duplicate() as StyleBoxFlat
		hover.border_color = ACCENT
		button.add_theme_stylebox_override("hover", hover)


func _load_hit_samples() -> void:
	# ブラウザ版 public/assets/sfx/hit の候補を読む。ファイルは変更せず、audio.gd と同じ SFX バスで試聴する。
	var sample_dir := ProjectSettings.globalize_path("res://").path_join("../../public/assets/sfx/hit").simplify_path()
	for spec in HIT_SAMPLES:
		var sound_id := String(spec["id"])
		var path := sample_dir.path_join(String(spec["file"]))
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			push_warning("ヒット音を開けません: " + path)
			continue
		var bytes := file.get_buffer(file.get_length())
		if bytes.is_empty():
			push_warning("ヒット音が空です: " + path)
			continue
		var sample := AudioStreamMP3.new()
		sample.data = bytes
		sound_samples[sound_id] = sample
	synth_stream = _make_synth_stream("hit")
	sound_samples_loaded = true


func _selected_sound_stream() -> AudioStream:
	if sound_pick == "synth":
		return synth_stream
	return sound_samples.get(sound_pick) as AudioStream


func _play_sound() -> void:
	_play_stream(_selected_sound_stream())


func _play_sound_burst(count: int, interval: float) -> void:
	for index in count:
		var timer: SceneTreeTimer = game.get_tree().create_timer(float(index) * interval)
		timer.timeout.connect(_play_sound)


func _play_critical() -> void:
	_play_stream(_selected_sound_stream(), 1.15)


func _play_stream(stream: AudioStream, pitch_scale: float = 1.0) -> void:
	if stream == null:
		game.hud_ui.toast("ヒット音を読み込めません", Color.html("#ff8888"))
		return
	var player := AudioStreamPlayer.new()
	player.bus = "SFX"
	player.stream = stream
	player.pitch_scale = pitch_scale
	game.audio.add_child(player)
	player.finished.connect(player.queue_free)
	player.play()


func _make_synth_stream(kind: String) -> AudioStreamWAV:
	const sample_rate := 22050
	var duration := 0.24
	var start_hz := 160.0
	var end_hz := 52.0
	var tone_gain := 0.75
	var noise_gain := 0.18
	match kind:
		"heavy": duration = 0.28; start_hz = 130.0; end_hz = 42.0; tone_gain = 0.82; noise_gain = 0.22
		"crit": duration = 0.2; start_hz = 210.0; end_hz = 64.0; tone_gain = 0.8; noise_gain = 0.24
		"block": duration = 0.18; start_hz = 240.0; end_hz = 100.0; tone_gain = 0.58; noise_gain = 0.3
		"hit": duration = 0.22; start_hz = 170.0; end_hz = 50.0; tone_gain = 0.76; noise_gain = 0.2
	var count := int(duration * sample_rate)
	var data := PackedByteArray()
	data.resize(count * 2)
	var seed := 12345 + absi(kind.hash())
	for i in range(count):
		var t := float(i) / sample_rate
		var phase := TAU * (start_hz * t + (end_hz - start_hz) * t * t / (2.0 * duration))
		seed = int((seed * 1664525 + 1013904223) & 0x7fffffff)
		var noise := float(seed) / 2147483647.0 * 2.0 - 1.0
		var envelope := pow(maxf(0.0, 1.0 - t / duration), 2.4)
		var attack := 1.0 + (1.0 - clampf(t / 0.012, 0.0, 1.0)) * 1.1
		var sample := clampf((sin(phase) * tone_gain + noise * noise_gain * attack) * envelope * 0.62, -1.0, 1.0)
		data.encode_s16(i * 2, int(round(sample * 32767.0)))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	return stream


func _screen_size() -> Vector2:
	return root.get_viewport_rect().size if root != null else Vector2(1532.0, 869.0)
