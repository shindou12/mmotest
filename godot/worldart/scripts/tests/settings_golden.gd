extends SceneTree

const AudioModule = preload("res://scripts/game/audio.gd")
const SettingsPanel = preload("res://scripts/game/settings_panel.gd")

var all_ok := true


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var audio = AudioModule.new()
	root.add_child(audio)
	var values := {"master": 0.5, "music": 0.25, "sfx": 0.75, "amb": 0.4}
	SettingsPanel.apply_volumes(audio, values)
	if audio._volume_tween != null:
		await audio._volume_tween.finished
	for pair in [["Master", "master"], ["Music", "music"], ["SFX", "sfx"], ["Amb", "amb"]]:
		var bus_name: String = pair[0]
		var key: String = pair[1]
		var index := AudioServer.get_bus_index(StringName(bus_name))
		var base := float(AudioModule.BUS_BASE_LEVELS[bus_name])
		var expected := linear_to_db(base * float(values[key]))
		var actual := AudioServer.get_bus_volume_db(index)
		_expect(index >= 0 and absf(actual - expected) < 0.05, "%s バスに %s を反映" % [bus_name, key])
	audio.free()
	await process_frame
	if all_ok:
		print("設定 全部 OK")
	else:
		printerr("設定 NG")
	quit(0 if all_ok else 1)


func _expect(condition: bool, message: String) -> void:
	if condition:
		print("OK  %s" % message)
	else:
		all_ok = false
		printerr("NG  %s" % message)
