extends SceneTree

const AudioModule = preload("res://scripts/game/audio.gd")

var _all_ok := true


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var audio: GameAudio = AudioModule.new()
	root.add_child(audio)
	_expect(audio.index_loaded, "index.json と WAV がすべて読める")
	var sound_count := audio.loaded_sound_count()
	print("WAV 読み込み: %d 件" % sound_count)
	_expect(sound_count == audio.get_sound_names().size(), "index.json の全音が読み込まれた")

	_expect(audio.resolve_sound_name("swing", {"heavy": true}) == "swing_heavy", "swing + heavy が swing_heavy.wav に対応")
	_expect(audio.resolve_sound_name("hit", {"crit": true}) == "hit_crit", "hit + crit が hit_crit.wav に対応")
	_expect(audio.resolve_sound_name("drop", {"rarity": 7, "slot": "weapon", "stars": 2}) == "drop_r7_weapon_stars2", "drop options が index.json の variant に対応")
	_expect(audio.resolve_sound_name("drop", {"rarity": 7, "slot": "weapon", "stars": 5}) == "drop", "未収録 options は基底 WAV に戻る")

	var merged_first := audio._reserve_voice("test_merge", 0.0, 1.0)
	var merged_second := audio._reserve_voice("test_merge", 0.02, 1.0)
	_expect(merged_first["accepted"] and not merged_second["accepted"] and merged_second["reason"] == "merge", "merge 0.03 秒以内の2回目を拒否")

	var repeat_first := audio._reserve_voice("test_repeat", 0.0, 1.0)
	var repeat_second := audio._reserve_voice("test_repeat", 0.04, 1.0)
	var repeat_third := audio._reserve_voice("test_repeat", 0.08, 1.0)
	_expect(repeat_first["accepted"] and repeat_second["accepted"] and repeat_third["accepted"], "merge 後の声を window 内に受け入れる")
	_expect(float(repeat_first["gain"]) >= 0.95 and float(repeat_first["gain"]) <= 1.05 and float(repeat_first["pitch"]) >= 0.95 and float(repeat_first["pitch"]) <= 1.05, "pitch と volume に ±5% の jitter をかける")
	_expect(float(repeat_second["gain"]) < float(repeat_first["gain"]) and float(repeat_third["gain"]) < float(repeat_second["gain"]), "repeatGain で2回目以降が小さくなる")
	print("連打 gain: %.3f → %.3f → %.3f" % [repeat_first["gain"], repeat_second["gain"], repeat_third["gain"]])

	var max_id := "swing"
	var now_sec := float(Time.get_ticks_usec()) / 1000000.0
	var first := audio._reserve_voice(max_id, now_sec - 0.13, 1.0)
	var second := audio._reserve_voice(max_id, now_sec - 0.09, 1.0)
	var third := audio._reserve_voice(max_id, now_sec - 0.05, 1.0)
	var players: Array[AudioStreamPlayer] = []
	for i in range(AudioModule.VOICE_MAX):
		var player := AudioStreamPlayer.new()
		player.stream = audio._streams[max_id]
		audio.add_child(player)
		player.play()
		players.append(player)
	first["voice"]["player"] = players[0]
	second["voice"]["player"] = players[1]
	third["voice"]["player"] = players[2]
	audio._player_pools[max_id] = players
	var fourth_played := audio.sfx(max_id)
	var voices_after: Array = audio._voice_states[max_id]
	var newest_voice: Dictionary = voices_after.back()
	var fade_tween: Tween = audio._fade_tweens.get(players[0])
	_expect(first["accepted"] and second["accepted"] and third["accepted"] and fourth_played, "window 内の4回目も新しい声を鳴らす")
	_expect(voices_after.size() == AudioModule.VOICE_MAX and voices_after[0] == second["voice"] and voices_after[1] == third["voice"], "上限では最古の声を外し、登録数を max 3 に保つ")
	_expect(fade_tween != null and audio._fading_players[max_id].has(players[0]) and players[0].playing and newest_voice["player"].playing, "最古の声をフェードしながら新しい声を再生する")
	if fade_tween != null:
		await fade_tween.finished
		_expect(not players[0].playing, "最古の声を 0.03 秒後に停止する")

	for bus_name in AudioModule.BUS_NAMES:
		_expect(AudioServer.get_bus_index(bus_name) >= 0, "Audio bus %s が存在する" % bus_name)
	audio.set_volumes(0.5, 0.25, 0.75, 1.0)
	await audio._volume_tween.finished
	_expect(_close_db(AudioServer.get_bus_volume_db(AudioServer.get_bus_index(&"Master")), linear_to_db(0.8 * 0.5)), "Master 音量を基準値に掛けて反映")
	_expect(_close_db(AudioServer.get_bus_volume_db(AudioServer.get_bus_index(&"Music")), linear_to_db(0.42 * 0.25)), "Music 音量を基準値に掛けて反映")
	_expect(_close_db(AudioServer.get_bus_volume_db(AudioServer.get_bus_index(&"SFX")), linear_to_db(0.7 * 0.75)), "SFX 音量を基準値に掛けて反映")
	_expect(_close_db(AudioServer.get_bus_volume_db(AudioServer.get_bus_index(&"Amb")), linear_to_db(0.5)), "Amb 音量を基準値に掛けて反映")
	for player in audio._player_pools[max_id]:
		player.stop()
		player.stream = null
	audio._player_pools.clear()
	audio._voice_states.clear()
	audio._streams.clear()
	fade_tween = null
	audio.free()
	await process_frame

	if _all_ok:
		print("音の規則 全部 OK")
	else:
		print("音の規則 NG")
	quit(0 if _all_ok else 1)


func _expect(condition: bool, message: String) -> void:
	if condition:
		print("OK  %s" % message)
	else:
		_all_ok = false
		printerr("NG  %s" % message)


func _close_db(actual: float, expected: float) -> bool:
	return absf(actual - expected) < 0.05
