extends SceneTree

const AudioModule = preload("res://scripts/game/audio.gd")
const EXPECTED_AREAS := {
	"f1_town": ["area_01", "meadow", ""],
	"f1_field": ["area_01", "meadow", ""],
	"f1_hunt": ["area_01", "meadow", "rain"],
	"f1_lake": ["area_01", "meadow", "rain"],
	"f1_dun": ["area_01", "cave", ""],
	"f1_lab": ["area_01", "cave", ""],
	"f2_camp": ["area_02", "forest", ""],
	"f2_field": ["area_02", "forest", "fog"],
	"f2_dun": ["area_02", "cave", ""],
	"f2_hunt": ["area_02", "forest", "fog"],
	"f2_lab": ["area_02", "cave", ""],
	"f3_camp": ["area_03", "desert", ""],
	"f3_field": ["area_03", "desert", ""],
	"f3_dun": ["area_03", "cave", ""],
	"f3_hunt": ["area_03", "desert", "sandstorm"],
	"f3_canyon": ["area_03", "desert", "sandstorm"],
	"f3_lab": ["area_03", "cave", ""],
}

var _all_ok := true


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var audio: GameAudio = AudioModule.new()
	root.add_child(audio)
	_expect(audio.music != null and audio.music.index_loaded, "音楽・環境音 index と OGG が読める")
	if audio.music == null or not audio.music.index_loaded:
		_finish(audio)
		return

	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	_expect(typeof(data) == TYPE_DICTIONARY, "ゲームデータを読める")
	if typeof(data) != TYPE_DICTIONARY:
		_finish(audio)
		return
	var area_defs: Dictionary = data.get("areas", {})
	audio.set_area(area_defs.get("f1_town", {}))
	var music_players: Array = audio.music._loop_players.get("music", [])
	var music_player: AudioStreamPlayer = music_players.back() if not music_players.is_empty() else null
	var ambience_players: Array = audio.music._loop_players.get("ambient", [])
	var ambience_player: AudioStreamPlayer = ambience_players.back() if not ambience_players.is_empty() else null
	_expect(music_player != null and music_player.playing and music_player.bus == &"Music", "曲 OGG を Music バスで再生する")
	_expect(ambience_player != null and ambience_player.playing and ambience_player.bus == &"Amb", "環境音 OGG を Amb バスで再生する")
	audio.set_area(area_defs.get("f1_hunt", {}))
	var weather_players: Array = audio.music._loop_players.get("weather", [])
	var weather_player: AudioStreamPlayer = weather_players.back() if not weather_players.is_empty() else null
	_expect(weather_player != null and weather_player.playing and weather_player.bus == &"Amb", "天候 OGG を Amb バスで再生する")
	audio.music._play_event("bird")
	var event_players: Array = audio.music._event_players.get("bird", [])
	var event_player: AudioStreamPlayer = event_players.back() if not event_players.is_empty() else null
	_expect(event_player != null and event_player.playing and event_player.bus == &"Amb", "散発音 OGG を Amb バスで再生する")

	for area_id_variant in EXPECTED_AREAS:
		var area_id: String = String(area_id_variant)
		var expected: Array = EXPECTED_AREAS[area_id]
		var area: Dictionary = area_defs.get(area_id, {})
		var music_name: String = audio.set_area(area)
		_expect(not area.is_empty(), "%s のエリア定義がある" % area_id)
		_expect(music_name == expected[0], "%s → %s" % [area_id, expected[0]])
		_expect(audio.music.current_ambient_kind() == expected[1], "%s 環境音 → %s" % [area_id, expected[1]])
		_expect(audio.music.current_weather_kind() == expected[2], "%s 天候音 → %s" % [area_id, (expected[2] if expected[2] != "" else "なし")])

	var labyrinth: Dictionary = area_defs.get("f1_lab", {})
	audio.set_area(labyrinth)
	var boss_music: String = audio.set_boss_state(true, true)
	_expect(boss_music == "area_01_boss", "ボス部屋で戦闘開始 → area_01_boss")
	var far_music: String = audio.set_boss_state(true, false)
	_expect(far_music == "area_01", "ボス部屋から離れる → 通常曲")
	var ended_music: String = audio.set_boss_state(false, true)
	_expect(ended_music == "area_01", "ボス戦終了 → 通常曲")
	_expect(audio.music.set_music(10, false) == "area_10", "10階分の曲 index を読める")

	_expect(audio.music.loop_assets_are_valid(), "全ループ OGG が取り込み設定で loop=true、つなぎ目差分が -60 dBFS 以下（%d 件）" % audio.music.loop_asset_count())
	_expect(audio.music.one_shot_assets_are_valid(), "散発音 OGG は loop しない")
	_expect(is_equal_approx(GameMusic.EVENT_INTERVAL_SEC, 0.2), "散発音の抽選間隔は 200ms")
	_expect(is_equal_approx(GameMusic.AMBIENT_EVENT_CHANCES["cave"]["drip"], 0.12), "洞窟の滴は抽選ごとに 12%")
	_expect(is_equal_approx(GameMusic.WEATHER_EVENT_CHANCES["rain"]["drip"], 0.2), "雨だれは抽選ごとに 20%")
	_expect(is_equal_approx(GameMusic.EVENT_VOLUME_JITTER, 0.05), "散発音の音量に ±5% の揺れ")
	print("OGG loop 検査: %d / %d 件" % [audio.music.loop_asset_count(), 33])

	_finish(audio)


func _finish(audio: GameAudio) -> void:
	audio.free()
	await process_frame
	if _all_ok:
		print("音楽 全部 OK")
	else:
		print("音楽 NG")
	quit(0 if _all_ok else 1)


func _expect(condition: bool, message: String) -> void:
	if condition:
		print("OK  %s" % message)
	else:
		_all_ok = false
		printerr("NG  %s" % message)
