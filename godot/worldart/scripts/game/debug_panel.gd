class_name GameDebugPanel
extends RefCounted
## F2 の簡易デバッグパネル。配置・色・文言は public/js/game/debug.js L103-155 の CSS と操作に合わせる。

const PANEL_COLOR := Color(16.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.94)
const ACCENT := Color(1.0, 0.541, 0.659, 1.0)
const TEXT_COLOR := Color(0.91, 0.929, 0.961, 1.0)
const BUTTON_COLOR := Color(0.137, 0.165, 0.22, 1.0)
const BUTTON_LINE := Color(0.29, 0.329, 0.408, 1.0)
const HIT_SAMPLES := [
	{"id": "retake2", "file": "retake2.mp3", "name": "撮り直し2", "gain": 0.5, "trim": 0.0, "lowCut": 0.0, "drive": 0.0, "click": 0.0},
	{"id": "heavyFleshV2", "file": "heavy-flesh-v2.mp3", "name": "2回目A", "gain": 0.5, "trim": 0.0, "lowCut": 0.0, "drive": 0.0, "click": 0.0},
	{"id": "deeper", "file": "deeper.mp3", "name": "より低く重く", "gain": 0.8, "trim": 0.0, "lowCut": 80.0, "drive": 0.2, "click": 0.5},
	{"id": "tight", "file": "tight.mp3", "name": "締まった", "gain": 0.5, "trim": 0.0, "lowCut": 0.0, "drive": 0.0, "click": 0.0},
]
const DEBUG_UNIQUES := [
	{"key":"amenomurakumo","name":"天叢雲剣","rarity":7,"slot":"weapon","kind":"sword","fx":["wave","thunder"],"lore":"八岐大蛇の尾より出でし神剣。"},
	{"key":"gungnir","name":"グングニル","rarity":7,"slot":"weapon","kind":"spear","fx":["thunder","skillcrit"],"lore":"必中の神槍。放てば必ず主の手に還る。"},
	{"key":"excalibur","name":"エクスカリバー","rarity":7,"slot":"weapon","kind":"greatsword","fx":["wave","star"],"lore":"湖の乙女より授けられし聖剣。"},
	{"key":"kusanagi_dagger","name":"月詠ノ小太刀","rarity":7,"slot":"weapon","kind":"dagger","fx":["mirror","vamp"],"lore":"月光を纏う夜の神の刃。"},
	{"key":"aegis","name":"アイギスの聖鎧","rarity":7,"slot":"armor","armor":"heavy","fx":["aegis","mirror"],"lore":"女神の加護を宿す不壊の鎧。"},
	{"key":"yata","name":"八咫鏡","rarity":7,"slot":"acc","fx":["mirror","star"],"lore":"真実を映す神鏡。"},
	{"key":"durandal","name":"デュランダル","rarity":6,"slot":"weapon","kind":"sword","fx":["wave"],"lore":"決して折れぬ聖騎士の剣。"},
	{"key":"gaebolg","name":"ゲイ・ボルグ","rarity":6,"slot":"weapon","kind":"spear","fx":["thunder"],"lore":"三十の棘を持つ魔槍。"},
	{"key":"muramasa","name":"妖刀 村正","rarity":6,"slot":"weapon","kind":"dagger","fx":["vamp"],"lore":"血を求めて止まぬ妖刀。"},
	{"key":"dainsleif","name":"ダーインスレイヴ","rarity":6,"slot":"weapon","kind":"greatsword","fx":["vamp","flame"],"lore":"一度抜けば血を見ずには収まらぬ。"},
	{"key":"laevateinn","name":"レーヴァテイン","rarity":6,"slot":"weapon","kind":"sword","fx":["flame"],"lore":"世界を焼く炎の枝。"},
	{"key":"oni_kiba","name":"鬼牙","rarity":6,"slot":"weapon","kind":"sword","fx":[],"lore":"鬼の牙のように前へ湾曲した刃を持つ剣。"},
	{"key":"sosei","name":"双星剣","rarity":6,"slot":"weapon","kind":"sword","fx":[],"lore":"二つに分かれた切先が双星を刻む剣。"},
	{"key":"labrys","name":"ラブリュス","rarity":6,"slot":"weapon","kind":"axe","fx":["flame"],"lore":"迷宮の王が掲げた両刃の斧。"},
	{"key":"yoichi","name":"与一の弓","rarity":6,"slot":"weapon","kind":"bow","fx":["thunder"],"lore":"揺れる扇の的をも射抜いたという名弓。"},
	{"key":"artemis","name":"アルテミスの銀弓","rarity":7,"slot":"weapon","kind":"bow","fx":["skillcrit","star"],"lore":"月の女神の銀の弓。"},
	{"key":"mjolnir","name":"雷斧ミョルニル","rarity":7,"slot":"weapon","kind":"axe","fx":["thunder","vamp"],"lore":"雷神の怒りを宿す、振るえば戻る斧。"},
	{"key":"dragonscale","name":"竜鱗の鎧","rarity":6,"slot":"armor","armor":"heavy","fx":["aegis"],"lore":"古竜の鱗を編んだ鎧。"},
	{"key":"starseer","name":"星詠みの指輪","rarity":6,"slot":"acc","fx":["star"],"lore":"星の巡りを識る指輪。"},
	{"key":"phantom","name":"幻影の外套","rarity":6,"slot":"armor","armor":"light","fx":["mirror"],"lore":"纏う者の影を揺らがせる。"},
]
const DEBUG_TITLES := [
	["t_boss1","コボルド王を討つ者",4,""], ["t_boss2","霧を越えし者",4,""], ["t_boss3","砂王を屠りし者",6,""],
	["t_lake","湖のヌシ殺し",4,""], ["t_shark","砂鮫狩り",6,""], ["t_wind","疾風",3,""], ["t_blood","血の渇き",4,"melee"],
	["t_hawk","鷹の眼",4,"bow"], ["t_guard","不落の盾",4,"spear"], ["t_phoenix","不死鳥",6,""], ["t_delver","井戸の探索者",3,""],
	["t_mapper","地図職人",3,""], ["t_traveler","旅人",3,""], ["t_treasure","宝探し",4,""], ["t_breaker","崩しの達人",4,""],
	["t_relic","古代の守護",4,""], ["t_night","夜目",3,""], ["t_spore","薬師",3,""], ["t_spell","呪い返し",4,""],
	["t_shell","甲殻の守り",4,"melee"], ["t_lucky","幸運の星",6,""], ["t_reaper","死神の影",6,""], ["t_berserk","狂戦士",6,"melee"],
	["t_star","流星",7,""], ["t_storm","嵐を歩む者",4,""], ["t_hunter","百獣の狩人",4,""],
]
const DEBUG_WEAPON_NAMES := {"sword":"片手剣", "greatsword":"大剣", "spear":"盾槍", "dagger":"短剣", "axe":"大斧", "bow":"弓"}

var game
var root: Control
var toggle_button: Button
var panel: PanelContainer
var level_value: SpinBox
var gear_kind: OptionButton
var gear_grade: OptionButton
var gold_value: SpinBox
var invincible_button: Button
var sound_pick := "synth"
var sound_pick_buttons: Dictionary = {}
var sound_samples: Dictionary = {}
var sound_settings: Dictionary = {}
var voice_settings := {"merge": 0.03, "window": 0.15, "repeatGain": 0.6, "max": 3}
var sound_players: Array[Dictionary] = []
var sound_voices: Dictionary = {}
var sound_last_at := -10.0
var sound_repeat_count := 0
var sound_samples_loaded := false
var synth_stream: AudioStreamWAV
var click_stream: AudioStreamWAV
var debug_bus_index := -1
var sound_parameter_labels: Dictionary = {}
var sound_parameter_controls: Dictionary = {}
var title_pick: OptionButton


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

	_section(body, "移動")
	var room_row := HFlowContainer.new()
	for spec in [["第1層 敵の部屋", "f1_dun"], ["第2層 敵の部屋", "f2_dun"], ["第3層 敵の部屋", "f3_dun"]]:
		room_row.add_child(_button(String(spec[0]), _warp_debug.bind(String(spec[1]))))
	body.add_child(room_row)
	var boss_row := HFlowContainer.new()
	for spec in [["第1層 ボス", "f1_lab"], ["第2層 ボス", "f2_lab"], ["第3層 ボス", "f3_lab"], ["はじまりの街", "f1_town"]]:
		boss_row.add_child(_button(String(spec[0]), _warp_debug.bind(String(spec[1]))))
	body.add_child(boss_row)

	_section(body, "部屋の敵のレベル（表示）")
	var enemy_levels := HFlowContainer.new()
	for lv in [1, 10, 25, 50]:
		enemy_levels.add_child(_button("Lv%d" % lv, _set_debug_enemy_level.bind(lv)))
	body.add_child(enemy_levels)
	_section(body, "ボスのレベル（次に出るボスの表示）")
	var boss_levels := HFlowContainer.new()
	for spec in [["本来", 0], ["Lv25", 25], ["Lv50", 50]]:
		boss_levels.add_child(_button(String(spec[0]), _set_debug_boss_level.bind(int(spec[1]))))
	body.add_child(boss_levels)

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
	gear_kind = OptionButton.new()
	for kind in ["sword", "greatsword", "spear", "dagger", "axe", "bow"]:
		gear_kind.add_item(String(DEBUG_WEAPON_NAMES[kind]))
		gear_kind.set_item_metadata(gear_kind.item_count - 1, kind)
	gear_kind.custom_minimum_size.x = 94.0
	gear_grade = OptionButton.new()
	for spec in [["特性なし", 0], ["特性1つ", 1], ["特性2つ", 2], ["特性3つ", 3]]:
		gear_grade.add_item(spec[0], spec[1])
	gear_grade.select(3)
	gear_grade.custom_minimum_size.x = 106.0
	gear_row.add_child(gear_kind)
	gear_row.add_child(gear_grade)
	gear_row.add_child(_button("武器", func(): _make_gear("weapon")))
	gear_row.add_child(_button("防具", func(): _make_gear("armor")))
	gear_row.add_child(_button("装飾品", func(): _make_gear("acc")))
	body.add_child(gear_row)

	_section(body, "ユニーク")
	var unique_row := HFlowContainer.new()
	unique_row.add_theme_constant_override("h_separation", 4)
	unique_row.add_theme_constant_override("v_separation", 4)
	for unique in DEBUG_UNIQUES:
		var spec: Dictionary = unique
		var unique_button: Button = _button(String(spec["name"]), _make_unique.bind(spec))
		unique_button.add_theme_color_override("font_color", GameItems.rarity_color(int(spec["rarity"])))
		unique_row.add_child(unique_button)
	body.add_child(unique_row)

	_section(body, "称号")
	var title_row := HBoxContainer.new()
	title_pick = OptionButton.new()
	for spec in DEBUG_TITLES:
		title_pick.add_item(String(spec[1]))
		title_pick.set_item_metadata(title_pick.item_count - 1, spec)
	title_pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title_pick)
	title_row.add_child(_button("出す", _make_title))
	body.add_child(title_row)

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

	_section(body, "ヒット音（敵に当てたとき）")
	var sound_row := HFlowContainer.new()
	sound_row.name = "HitSoundChoices"
	sound_row.add_theme_constant_override("h_separation", 4)
	sound_row.add_theme_constant_override("v_separation", 4)
	sound_pick_buttons["synth"] = _button("今の合成音", func(): _select_sound("synth"))
	sound_row.add_child(sound_pick_buttons["synth"])
	for spec in HIT_SAMPLES:
		var sample_id := String(spec["id"])
		sound_pick_buttons[sample_id] = _button(String(spec["name"]), func(): _select_sound(sample_id))
		sound_row.add_child(sound_pick_buttons[sample_id])
	_update_sound_pick_styles()
	body.add_child(sound_row)
	_add_sound_slider(body, "音量", "gain", 0.0, 2.0, 0.05, "%.0f%%", 100.0)
	_add_sound_slider(body, "頭出し", "trim", 0.0, 0.12, 0.005, "%.0fms", 1000.0)
	_add_sound_slider(body, "ピッチの揺れ", "pitch", 0.0, 0.25, 0.01, "±%.0f%%", 100.0)
	_add_sound_slider(body, "音量の揺れ", "vol", 0.0, 0.4, 0.01, "±%.0f%%", 100.0)
	_section(body, "聞き取りやすさ（この音だけ）")
	_add_sound_slider(body, "低音カット", "lowCut", 0.0, 200.0, 10.0, "%.0fHz以下", 1.0)
	_add_sound_slider(body, "倍音（歪み）", "drive", 0.0, 1.0, 0.05, "%.0f%%", 100.0)
	_add_sound_slider(body, "アタックを重ねる", "click", 0.0, 1.0, 0.05, "%.0f%%", 100.0)
	_section(body, "連打・複数ヒット（全部の音）")
	_add_sound_slider(body, "同時ヒットをまとめる", "merge", 0.0, 0.08, 0.005, "%.0fms以内", 1000.0)
	_add_sound_slider(body, "続けて当てた音量", "repeatGain", 0.2, 1.0, 0.05, "%.0f%%ずつ", 100.0)
	_add_sound_slider(body, "「続けて」の間隔", "window", 0.05, 0.4, 0.01, "%.0fms以内", 1000.0)
	_add_sound_slider(body, "同時に鳴る数", "max", 1.0, 8.0, 1.0, "%.0fつまで", 1.0)

	var test_row := HFlowContainer.new()
	test_row.add_theme_constant_override("h_separation", 4)
	test_row.add_theme_constant_override("v_separation", 4)
	test_row.add_child(_button("試し鳴らし", _play_sound))
	test_row.add_child(_button("8連打", func(): _play_sound_burst(8, 0.12)))
	test_row.add_child(_button("3体同時", func(): _play_sound_burst(3, 0.0)))
	test_row.add_child(_button("クリティカル", _play_critical))
	body.add_child(test_row)

	_section(body, "そのほか")
	var state_row := HFlowContainer.new()
	state_row.add_child(_button("全回復", _heal))
	invincible_button = _button("無敵: OFF", _toggle_invincibility)
	state_row.add_child(invincible_button)
	state_row.add_child(_button("クールタイムを戻す", _reset_cooldowns))
	state_row.add_child(_button("持ち物を空にする", _clear_inventory))
	body.add_child(state_row)
	_update_sound_controls()
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


func _add_sound_slider(host: VBoxContainer, label_text: String, key: String, minimum: float, maximum: float, step: float, format_text: String, display_scale: float) -> void:
	var row := HBoxContainer.new()
	var label := _label(label_text)
	label.custom_minimum_size.x = 142.0
	row.add_child(label)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = step
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(slider)
	var value_label := _label("")
	value_label.custom_minimum_size.x = 72.0
	row.add_child(value_label)
	slider.value = _sound_parameter_value(key)
	slider.value_changed.connect(func(value):
		_change_sound_parameter(key, float(value))
		value_label.text = format_text % (float(value) * display_scale)
	)
	slider.focus_exited.connect(func(): slider.release_focus())
	sound_parameter_controls[key] = {"slider": slider, "label": value_label, "format": format_text, "scale": display_scale}
	value_label.text = format_text % (slider.value * display_scale)
	host.add_child(row)


func _sound_parameter_value(key: String) -> float:
	if key in ["merge", "window", "repeatGain", "max"]:
		return float(voice_settings.get(key, 0.0))
	if key in ["pitch", "vol"]:
		return float(sound_settings.get("__common", {}).get(key, 0.05 if key == "pitch" or key == "vol" else 0.0))
	return float(sound_settings.get(sound_pick, {}).get(key, 0.0))


func _change_sound_parameter(key: String, value: float) -> void:
	if key in ["merge", "window", "repeatGain", "max"]:
		voice_settings[key] = int(value) if key == "max" else value
	elif key in ["pitch", "vol"]:
		var common: Dictionary = sound_settings.get("__common", {"pitch": 0.05, "vol": 0.05})
		common[key] = value
		sound_settings["__common"] = common
	else:
		var per: Dictionary = sound_settings.get(sound_pick, {}).duplicate()
		per[key] = value
		sound_settings[sound_pick] = per
	_update_sound_controls()


func _update_sound_controls() -> void:
	for key in sound_parameter_controls:
		var spec: Dictionary = sound_parameter_controls[key]
		var slider: HSlider = spec["slider"]
		var enabled := not (sound_pick == "synth" and not (String(key) in ["pitch", "vol", "merge", "window", "repeatGain", "max"]))
		slider.editable = enabled
		var value := _sound_parameter_value(String(key))
		if not slider.has_focus(): slider.value = value
		var value_label: Label = spec["label"]
		value_label.text = String(spec["format"]) % (value * float(spec["scale"]))
		value_label.modulate = Color.WHITE if enabled else Color(0.55, 0.58, 0.63)
	_sync_debug_bus()


func _sync_debug_bus() -> void:
	if debug_bus_index < 0:
		return
	var effects := AudioServer.get_bus_effect_count(debug_bus_index)
	if effects > 0:
		var high_pass := AudioServer.get_bus_effect(debug_bus_index, 0) as AudioEffectHighPassFilter
		if high_pass != null:
			var low_cut := float(sound_settings.get(sound_pick, {}).get("lowCut", 0.0))
			high_pass.enabled = low_cut > 0.0
			high_pass.cutoff_hz = maxf(low_cut, 20.0)
	if effects > 1:
		var distortion := AudioServer.get_bus_effect(debug_bus_index, 1) as AudioEffectDistortion
		if distortion != null:
			distortion.drive = float(sound_settings.get(sound_pick, {}).get("drive", 0.0))
			distortion.enabled = distortion.drive > 0.0


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


func _warp_debug(destination: String) -> void:
	if not GameRules.data().get("areas", {}).has(destination): return
	game.combat.ctx._fx().beam(game.me.x, game.me.z, 0x6ad8ff, 12.0, 1.2, 0.8)
	game.net.send({"t": "wp", "to": destination}) # debug.js warp。移動先の階層解放はサーバー側が検証する


func _set_debug_enemy_level(level: int) -> void:
	game.debug_enemy_level = level
	game.hud_ui.toast("敵の表示レベルを Lv%d にした" % level, Color.html("#9fe"))


func _set_debug_boss_level(level: int) -> void:
	game.debug_boss_level = level
	game.hud_ui.toast("次のボスの表示レベルを %s にした" % ("本来" if level == 0 else "Lv%d" % level), Color.html("#9fe"))


func _reset_cooldowns() -> void:
	for key in game.me.get("tcd", {}): game.me["tcd"][key] = 0.0
	game.me["wsCd"] = 0.0
	game.me["dodgeCd"] = 0.0
	game.me["potCd"] = 0.0


func _clear_inventory() -> void:
	game.ch["inv"] = []
	game._save_char()
	if game.items.inventory_panel != null and game.items.inventory_panel.panel.visible:
		game.items.inventory_panel.refresh()
	game.hud_ui.toast("持ち物を空にした（装備中の物は残る）", Color.html("#9fe"))


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


func _make_gear(slot: String) -> void:
	var inventory: Array = game.ch.get("inv", [])
	if inventory.size() >= 60:
		game.hud_ui.toast("インベントリがいっぱいです（Iで分解）", Color.html("#ff8888"))
		return
	var kind := String(gear_kind.get_item_metadata(gear_kind.selected)) if slot == "weapon" else ""
	var item: Dictionary = game.items._make_item(int(level_value.max_value), gear_grade.get_selected_id(), slot, kind)
	_add_inventory_item(item)


func _make_unique(unique: Dictionary) -> void:
	if game.ch.get("inv", []).size() >= 60:
		game.hud_ui.toast("インベントリがいっぱいです（Iで分解）", Color.html("#ff8888"))
		return
	var grade := 5 if int(unique["rarity"]) == 7 else 4
	var item: Dictionary = game.items._make_item(int(level_value.max_value), grade, String(unique["slot"]), String(unique.get("kind", "")), unique)
	_add_inventory_item(item)


func _make_title() -> void:
	if game.ch.get("inv", []).size() >= 60:
		game.hud_ui.toast("インベントリがいっぱいです（Iで分解）", Color.html("#ff8888"))
		return
	var spec: Array = title_pick.get_item_metadata(title_pick.selected)
	GameItems.item_seq += 1
	var item := {"id": "debug_title_%d_%d" % [Time.get_ticks_usec(), GameItems.item_seq], "slot": "title", "kind": null,
		"rarity": int(spec[2]), "ilvl": 1, "affixes": [], "enh": 0, "v": 3, "weight": 0,
		"name": "「%s」" % String(spec[1]), "title": String(spec[0]), "req": String(spec[3]) if String(spec[3]) != "" else null}
	_add_inventory_item(item)


func _add_inventory_item(item: Dictionary) -> void:
	var inventory: Array = game.ch.get("inv", [])
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
	_update_sound_controls()


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
		sound_settings[sound_id] = {"gain": float(spec["gain"]), "trim": float(spec["trim"]), "lowCut": float(spec["lowCut"]), "drive": float(spec["drive"]), "click": float(spec["click"])}
	sound_settings["__common"] = {"pitch": 0.05, "vol": 0.05}
	synth_stream = _make_synth_stream("hit")
	click_stream = _make_click_stream()
	sound_samples_loaded = true
	_update_sound_controls()


func _selected_sound_stream() -> AudioStream:
	if sound_pick == "synth":
		return synth_stream
	return sound_samples.get(sound_pick) as AudioStream


func _play_sound() -> void:
	play_selected_sound()


func play_selected_sound(critical := false) -> void:
	_play_stream(_selected_sound_stream(), 1.15 if critical else 1.0)


func _play_sound_burst(count: int, interval: float) -> void:
	for index in count:
		var timer: SceneTreeTimer = game.get_tree().create_timer(float(index) * interval)
		timer.timeout.connect(_play_sound)


func _play_critical() -> void:
	play_selected_sound(true)


func _play_stream(stream: AudioStream, pitch_scale: float = 1.0) -> void:
	if stream == null:
		game.hud_ui.toast("ヒット音を読み込めません", Color.html("#ff8888"))
		return
	_ensure_debug_bus()
	var now := float(Time.get_ticks_usec()) / 1000000.0
	var voices: Array = sound_voices.get(sound_pick, [])
	var active: Array[Dictionary] = []
	for voice in voices:
		var player: AudioStreamPlayer = voice.get("player")
		if is_instance_valid(player) and player.playing:
			active.append(voice)
	if not active.is_empty() and now - float(active.back()["at"]) < float(voice_settings["merge"]):
		sound_voices[sound_pick] = active
		return
	var repeat_count := 0
	for voice in active:
		if now - float(voice["at"]) < float(voice_settings["window"]): repeat_count += 1
	if active.size() >= int(voice_settings["max"]):
		var oldest: Dictionary = active.pop_front()
		var old_player: AudioStreamPlayer = oldest.get("player")
		if is_instance_valid(old_player): old_player.stop(); old_player.queue_free()
	var params: Dictionary = sound_settings.get(sound_pick, {})
	var common: Dictionary = sound_settings.get("__common", {"pitch": 0.05, "vol": 0.05})
	_sync_debug_bus()
	var player := AudioStreamPlayer.new()
	player.bus = "DebugHit"
	player.stream = stream
	player.pitch_scale = pitch_scale * (1.0 + randf_range(-float(common["pitch"]), float(common["pitch"])))
	var gain := float(params.get("gain", 1.0)) * (1.0 + randf_range(-float(common["vol"]), float(common["vol"])))
	player.volume_db = linear_to_db(maxf(0.0001, gain * pow(float(voice_settings["repeatGain"]), repeat_count)))
	game.audio.add_child(player)
	player.finished.connect(player.queue_free)
	player.play(float(params.get("trim", 0.0)))
	active.append({"at": now, "player": player})
	sound_voices[sound_pick] = active
	if sound_pick != "synth" and click_stream != null and float(params.get("click", 0.0)) > 0.0:
		var click := AudioStreamPlayer.new()
		click.bus = "DebugHit"
		click.stream = click_stream
		click.volume_db = linear_to_db(0.35 * float(params["click"]))
		game.audio.add_child(click)
		click.finished.connect(click.queue_free)
		click.play()


func _ensure_debug_bus() -> void:
	if debug_bus_index >= 0: return
	debug_bus_index = AudioServer.get_bus_count()
	AudioServer.add_bus(debug_bus_index)
	AudioServer.set_bus_name(debug_bus_index, "DebugHit")
	AudioServer.set_bus_send(debug_bus_index, "SFX")
	var high_pass := AudioEffectHighPassFilter.new()
	AudioServer.add_bus_effect(debug_bus_index, high_pass)
	var distortion := AudioEffectDistortion.new()
	AudioServer.add_bus_effect(debug_bus_index, distortion)
	_sync_debug_bus()


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


func _make_click_stream() -> AudioStreamWAV:
	const sample_rate := 22050
	const duration := 0.08
	var data := PackedByteArray()
	data.resize(int(sample_rate * duration) * 2)
	var seed := 25731
	for i in range(int(sample_rate * duration)):
		seed = int((seed * 1664525 + 1013904223) & 0x7fffffff)
		var noise := float(seed) / 2147483647.0 * 2.0 - 1.0
		var t := float(i) / sample_rate
		var envelope := exp(-t * 34.0)
		data.encode_s16(i * 2, int(round(clampf(noise * envelope * 0.8, -1.0, 1.0) * 32767.0)))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	return stream


func _screen_size() -> Vector2:
	return root.get_viewport_rect().size if root != null else Vector2(1532.0, 869.0)
