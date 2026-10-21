class_name GameAudio
extends Node

const INDEX_PATH := "res://assets/sfx/index.json"
const SFX_PATH := "res://assets/sfx/"

# 対応元: public/js/sample-sfx.js の jitter(range) と SampleBank.play() の既定値 pitch=0.05, vol=0.05。
const PITCH_JITTER := 0.05
const VOLUME_JITTER := 0.05

# 対応元: public/js/sample-sfx.js の VOICE_DEFAULTS と SampleBank.play()。
const VOICE_MERGE_SEC := 0.03
const VOICE_WINDOW_SEC := 0.15
const VOICE_REPEAT_GAIN := 0.6
const VOICE_MAX := 3

# 対応元: public/js/audio.js の AudioEngine.level() の master/music/sfx/amb 基準値。
const BUS_BASE_LEVELS := {"Master": 0.8, "Music": 0.42, "SFX": 0.7, "Amb": 0.5}
const BUS_NAMES := [&"Master", &"Music", &"SFX", &"Amb"]
const VOLUME_SMOOTH_SEC := 0.05

var _entries: Array[Dictionary] = []
var _entries_by_name: Dictionary = {}
var _streams: Dictionary = {}
var _voice_states: Dictionary = {}
var _player_pools: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _volume_tween: Tween
var _volumes := {"master": 1.0, "music": 1.0, "sfx": 1.0, "amb": 1.0}
var index_loaded := false


func _ready() -> void:
	_rng.randomize()
	load_index()
	set_volumes(_volumes["master"], _volumes["music"], _volumes["sfx"], _volumes["amb"])


func load_index() -> bool:
	_entries.clear()
	_entries_by_name.clear()
	_streams.clear()
	index_loaded = false
	if not FileAccess.file_exists(INDEX_PATH):
		push_error("SFX index がありません: %s" % INDEX_PATH)
		return false

	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(INDEX_PATH))
	if not parsed is Dictionary or not parsed.get("sounds", null) is Array:
		push_error("SFX index の形式が不正です: %s" % INDEX_PATH)
		return false

	var sounds: Array = parsed["sounds"]
	var all_loaded := true
	for raw_entry in sounds:
		if not raw_entry is Dictionary:
			push_error("SFX index に不正な項目があります")
			all_loaded = false
			continue
		var entry: Dictionary = raw_entry
		var sound_name := str(entry.get("name", ""))
		var filename := str(entry.get("file", ""))
		var options: Variant = entry.get("options", {})
		if sound_name.is_empty() or filename.get_file() != filename or not filename.ends_with(".wav") or not options is Dictionary:
			push_error("SFX index に不正な名前・ファイル・options があります: %s" % sound_name)
			all_loaded = false
			continue
		if _entries_by_name.has(sound_name):
			push_error("SFX index に重複した名前があります: %s" % sound_name)
			all_loaded = false
			continue

		var stream := ResourceLoader.load(SFX_PATH + filename) as AudioStreamWAV
		if stream == null:
			push_error("SFX WAV を読めません: %s" % (SFX_PATH + filename))
			all_loaded = false
			continue
		entry = entry.duplicate(true)
		_entries.append(entry)
		_entries_by_name[sound_name] = entry
		_streams[sound_name] = stream

	index_loaded = all_loaded and _entries.size() == sounds.size()
	return index_loaded


func get_sound_names() -> Array[String]:
	var names: Array[String] = []
	for entry in _entries:
		names.append(str(entry["name"]))
	return names


func loaded_sound_count() -> int:
	return _streams.size()


func resolve_sound_name(name: String, opt: Dictionary = {}) -> String:
	# index.json の name を直接指定できるため、試聴一覧から派生 WAV も個別に鳴らせる。
	if opt.is_empty() and _entries_by_name.has(name):
		return name

	# export_sfx.mjs の source/options（makeVariants()）と index.json を照合する。
	# option が完全一致する variant を優先し、未収録の組み合わせは基底 WAV に戻す。
	var base_name := ""
	for entry in _entries:
		if str(entry.get("source", "")) != name:
			continue
		var variant_options: Dictionary = entry.get("options", {})
		if variant_options.is_empty():
			base_name = str(entry["name"])
		if variant_options.size() != opt.size():
			continue
		var matches := true
		for key in variant_options:
			if not opt.has(key) or opt[key] != variant_options[key]:
				matches = false
				break
		if matches:
			return str(entry["name"])
	return base_name


func sfx(name: String, opt: Dictionary = {}) -> bool:
	var sound_name := resolve_sound_name(name, opt)
	if sound_name.is_empty() or not _streams.has(sound_name):
		return false

	var stream: AudioStreamWAV = _streams[sound_name]
	var now_sec := float(Time.get_ticks_usec()) / 1000000.0
	var decision := _reserve_voice(sound_name, now_sec, stream.get_length())
	if not decision["accepted"]:
		return false

	var player := _get_player(sound_name)
	if player == null:
		_remove_voice(sound_name, decision["voice"])
		return false
	var voice: Dictionary = decision["voice"]
	voice["player"] = player
	player.stream = stream
	player.pitch_scale = float(decision["pitch"])
	player.volume_db = linear_to_db(maxf(float(decision["gain"]), 0.0001))
	player.play()
	return true


func _reserve_voice(sound_name: String, now_sec: float, duration_sec: float) -> Dictionary:
	var previous: Array = _voice_states.get(sound_name, [])
	var active: Array = []
	for voice in previous:
		if float(voice["end"]) > now_sec:
			active.append(voice)
	_voice_states[sound_name] = active

	if not active.is_empty():
		var last: Dictionary = active.back()
		if now_sec - float(last["at"]) < VOICE_MERGE_SEC:
			return {"accepted": false, "reason": "merge"}

	var repeat_count := 0
	for voice in active:
		if now_sec - float(voice["at"]) < VOICE_WINDOW_SEC:
			repeat_count += 1

	# 完了条件に合わせ、VOICE_MAX に達している間の新規再生は拒否する。
	# 元の sample-sfx.js は最古の声をフェードしてから新しい声を鳴らす。
	if active.size() >= VOICE_MAX:
		return {"accepted": false, "reason": "max"}

	var gain := pow(VOICE_REPEAT_GAIN, repeat_count) * _jitter(VOLUME_JITTER)
	var pitch := _jitter(PITCH_JITTER)
	var voice := {
		"at": now_sec,
		"end": now_sec + maxf(duration_sec, 0.01) / pitch,
		"gain": gain,
		"pitch": pitch,
	}
	active.append(voice)
	_voice_states[sound_name] = active
	return {"accepted": true, "gain": gain, "pitch": pitch, "voice": voice, "repeat_count": repeat_count}


func _jitter(amount: float) -> float:
	return 1.0 + _rng.randf_range(-amount, amount)


func _get_player(sound_name: String) -> AudioStreamPlayer:
	var pool: Array = _player_pools.get(sound_name, [])
	for player in pool:
		if not player.playing:
			return player
	if pool.size() >= VOICE_MAX:
		return null
	var player := AudioStreamPlayer.new()
	player.name = "SFX_%s_%d" % [sound_name, pool.size() + 1]
	player.bus = "SFX"
	add_child(player)
	pool.append(player)
	_player_pools[sound_name] = pool
	return player


func _remove_voice(sound_name: String, target: Dictionary) -> void:
	var voices: Array = _voice_states.get(sound_name, [])
	voices.erase(target)
	_voice_states[sound_name] = voices


func set_volumes(master: float, music: float, sfx_level: float, amb: float) -> void:
	# 対応元: public/js/audio.js の setVolumes(vol) は各 bus に level(k) を 0.05 秒で追従させる。
	_volumes = {
		"master": clampf(master, 0.0, 1.0),
		"music": clampf(music, 0.0, 1.0),
		"sfx": clampf(sfx_level, 0.0, 1.0),
		"amb": clampf(amb, 0.0, 1.0),
	}
	if not is_inside_tree():
		return
	if _volume_tween != null and _volume_tween.is_running():
		_volume_tween.kill()
	_volume_tween = create_tween().set_parallel(true)
	for bus_name in BUS_NAMES:
		var bus_index := AudioServer.get_bus_index(bus_name)
		if bus_index < 0:
			push_error("Audio bus がありません: %s" % bus_name)
			continue
		var bus_key := String(bus_name)
		var volume_key := bus_key.to_lower()
		var target_linear := float(BUS_BASE_LEVELS[bus_key]) * float(_volumes[volume_key])
		var target_db := linear_to_db(maxf(target_linear, 0.0001))
		var current_db := AudioServer.get_bus_volume_db(bus_index)
		_volume_tween.tween_method(Callable(self, "_set_bus_db").bind(bus_key), current_db, target_db, VOLUME_SMOOTH_SEC)


func _set_bus_db(value_db: float, bus_name: String) -> void:
	var bus_index := AudioServer.get_bus_index(bus_name)
	if bus_index >= 0:
		AudioServer.set_bus_volume_db(bus_index, value_db)
