class_name GameMusic
extends Node

const MUSIC_INDEX_PATH := "res://assets/music/index.json"
const MUSIC_PATH := "res://assets/music/"
const AMBIENT_INDEX_PATH := "res://assets/ambient/index.json"
const AMBIENT_PATH := "res://assets/ambient/"

# 対応元: public/js/audio.js setMusic() の曲差し替え待ち 900ms を曲間のクロスフェードに使う。
const MUSIC_CROSSFADE_SEC := 0.9
# 対応元: public/js/audio.js fadeOut() の 0.5 秒と layer() の 1 秒フェードを重ねる。
const AMBIENT_CROSSFADE_SEC := 1.0
const WEATHER_CROSSFADE_SEC := 1.0
const EVENT_INTERVAL_SEC := 0.2
const EVENT_VOLUME_JITTER := 0.05
const EVENT_PITCH_JITTER := 0.05
const BED_SWAY_DB := 1.5
const SILENT_DB := -60.0

# 対応元: public/shared/data.js の FLOORS[n - 1].amb。
const AMBIENT_BY_FLOOR := {
	1: "meadow", 2: "forest", 3: "desert", 4: "cave", 5: "lava",
	6: "snow", 7: "underwater", 8: "storm", 9: "void", 10: "heaven",
}

# 対応元: public/js/audio.js ambientEvents()。200ms ごとの抽選確率。
const AMBIENT_EVENT_CHANCES := {
	"meadow": {"bird": 0.12, "gust": 0.02},
	"forest": {"bird": 0.07, "owl": 0.04},
	"desert": {"gust": 0.02},
	"cave": {"drip": 0.12, "chime": 0.05},
	"lava": {"crackle": 0.15, "rumble": 0.02},
	"snow": {"gust": 0.02},
	"underwater": {"drip": 0.06, "bubble": 0.1},
	"storm": {"thunder": 0.012},
	"void": {"whisper": 0.03},
	"heaven": {"bird": 0.03, "chime": 0.05},
}

# 対応元: public/js/audio.js ambientEvents() の天候ごとの抽選確率。
const WEATHER_EVENT_CHANCES := {
	"rain": {"thunder": 0.006, "drip": 0.2},
	"fog": {"whisper": 0.02},
	"sandstorm": {"gust": 0.08},
}

var _music_tracks: Dictionary = {}
var _music_streams: Dictionary = {}
var _ambient_streams: Dictionary = {}
var _weather_streams: Dictionary = {}
var _event_streams: Dictionary = {}
var _loop_players: Dictionary = {"music": [], "ambient": [], "weather": []}
var _event_players: Dictionary = {}
var _transition_tweens: Dictionary = {}
var _bed_sway_tween: Tween
var _rng := RandomNumberGenerator.new()
var _event_tick := 0.0
var _bed_sway_timer := 1.5
var _loop_asset_count := 0
var _expected_loop_asset_count := 0
var _loop_streams_ok := true
var _loop_seams_ok := true
var index_loaded := false

var _current_floor := 1
var _current_music_name := ""
var _current_ambient_kind := ""
var _current_weather_kind := ""
var _current_ambient_player: AudioStreamPlayer


func _ready() -> void:
	_rng.randomize()
	load_indexes()


func _process(delta: float) -> void:
	_event_tick += delta
	while _event_tick >= EVENT_INTERVAL_SEC:
		_event_tick -= EVENT_INTERVAL_SEC
		ambient_events()
	_update_bed_sway(delta)


func load_indexes() -> bool:
	_music_tracks.clear()
	_music_streams.clear()
	_ambient_streams.clear()
	_weather_streams.clear()
	_event_streams.clear()
	_loop_asset_count = 0
	_expected_loop_asset_count = 0
	_loop_streams_ok = true
	_loop_seams_ok = true
	index_loaded = false

	var music_index: Variant = _read_index(MUSIC_INDEX_PATH)
	var ambient_index: Variant = _read_index(AMBIENT_INDEX_PATH)
	if typeof(music_index) != TYPE_DICTIONARY or typeof(ambient_index) != TYPE_DICTIONARY:
		return false

	var music_songs: Variant = music_index.get("songs", [])
	var music_files: Variant = music_index.get("files", [])
	var beds: Variant = ambient_index.get("beds", [])
	var weather: Variant = ambient_index.get("weather", [])
	var events: Variant = ambient_index.get("events", [])
	if typeof(music_songs) != TYPE_ARRAY or typeof(music_files) != TYPE_ARRAY \
		or typeof(beds) != TYPE_ARRAY or typeof(weather) != TYPE_ARRAY or typeof(events) != TYPE_ARRAY:
		return false

	var music_meta_by_file: Dictionary = {}
	for row_variant in music_files:
		if typeof(row_variant) == TYPE_DICTIONARY:
			var row: Dictionary = row_variant
			music_meta_by_file[String(row.get("file", ""))] = row

	for song_variant in music_songs:
		if typeof(song_variant) != TYPE_DICTIONARY:
			continue
		var song: Dictionary = song_variant
		var floor_number: int = int(song.get("floor", 0))
		var normal_file: String = String(song.get("normal", ""))
		var boss_file: String = String(song.get("boss", ""))
		if floor_number <= 0 or normal_file.is_empty() or boss_file.is_empty():
			continue
		var normal_stream: AudioStreamOggVorbis = _load_loop_stream(MUSIC_PATH, normal_file, music_meta_by_file.get(normal_file, {}))
		var boss_stream: AudioStreamOggVorbis = _load_loop_stream(MUSIC_PATH, boss_file, music_meta_by_file.get(boss_file, {}))
		if normal_stream == null or boss_stream == null:
			continue
		_music_tracks[floor_number] = {"normal": normal_file.get_basename(), "boss": boss_file.get_basename()}
		_music_streams[normal_file.get_basename()] = normal_stream
		_music_streams[boss_file.get_basename()] = boss_stream
		_expected_loop_asset_count += 2

	for bed_variant in beds:
		if typeof(bed_variant) != TYPE_DICTIONARY:
			continue
		var bed: Dictionary = bed_variant
		var kind: String = String(bed.get("kind", ""))
		var file: String = String(bed.get("file", ""))
		var stream: AudioStreamOggVorbis = _load_loop_stream(AMBIENT_PATH, file, bed)
		if not kind.is_empty() and stream != null:
			_ambient_streams[kind] = stream
			_expected_loop_asset_count += 1

	for weather_variant in weather:
		if typeof(weather_variant) != TYPE_DICTIONARY:
			continue
		var weather_row: Dictionary = weather_variant
		var kind: String = String(weather_row.get("kind", ""))
		var file: String = String(weather_row.get("file", ""))
		var stream: AudioStreamOggVorbis = _load_loop_stream(AMBIENT_PATH, file, weather_row)
		if not kind.is_empty() and stream != null:
			_weather_streams[kind] = stream
			_expected_loop_asset_count += 1

	for event_variant in events:
		if typeof(event_variant) != TYPE_DICTIONARY:
			continue
		var event_row: Dictionary = event_variant
		var event_name: String = String(event_row.get("event", ""))
		var event_file: String = String(event_row.get("file", ""))
		var event_stream: AudioStreamOggVorbis = _load_one_shot(AMBIENT_PATH, event_file)
		if not event_name.is_empty() and event_stream != null:
			_event_streams[event_name] = event_stream

	index_loaded = _music_streams.size() == music_songs.size() * 2 \
		and _ambient_streams.size() == beds.size() and _weather_streams.size() == weather.size() \
		and _event_streams.size() == events.size()
	return index_loaded


func set_area(area: Dictionary) -> String:
	_current_floor = int(area.get("floor", 1))
	var music_name: String = set_music(_current_floor, false)
	set_ambient(ambient_kind_for_area(area))
	set_weather(weather_kind_for_area(area))
	return music_name


func set_music(floor_number: int, boss: bool = false) -> String:
	_current_floor = floor_number
	var tracks: Dictionary = _music_tracks.get(floor_number, {})
	var music_name: String = String(tracks.get("boss" if boss else "normal", ""))
	if music_name.is_empty():
		return ""
	if music_name == _current_music_name:
		return music_name
	_current_music_name = music_name
	var stream: AudioStreamOggVorbis = _music_streams.get(music_name)
	_transition_loop("music", stream, "Music", MUSIC_CROSSFADE_SEC)
	return music_name


func set_boss_state(fighting: bool, near_lair: bool) -> String:
	# 対応元: public/js/game/loop.js の bossNear と audio.setMusic(fdef.music, bossNear)。
	return set_music(_current_floor, fighting and near_lair)


func set_ambient(kind: String) -> void:
	if kind == _current_ambient_kind:
		return
	_current_ambient_kind = kind
	var stream: AudioStreamOggVorbis = _ambient_streams.get(kind)
	_current_ambient_player = _transition_loop("ambient", stream, "Amb", AMBIENT_CROSSFADE_SEC)
	_bed_sway_timer = 1.5


func set_weather(kind: String) -> void:
	if kind == _current_weather_kind:
		return
	_current_weather_kind = kind
	var stream: AudioStreamOggVorbis = _weather_streams.get(kind)
	_transition_loop("weather", stream, "Amb", WEATHER_CROSSFADE_SEC)


func ambient_events() -> void:
	# 対応元: public/js/audio.js ambientEvents()。200ms ごとに天候、環境の順で独立抽選。
	_play_event_chances(WEATHER_EVENT_CHANCES.get(_current_weather_kind, {}))
	_play_event_chances(AMBIENT_EVENT_CHANCES.get(_current_ambient_kind, {}))


func current_music_name() -> String:
	return _current_music_name


func current_ambient_kind() -> String:
	return _current_ambient_kind


func current_weather_kind() -> String:
	return _current_weather_kind


func loop_asset_count() -> int:
	return _loop_asset_count


func loop_assets_are_valid() -> bool:
	return index_loaded and _loop_streams_ok and _loop_seams_ok \
		and _loop_asset_count == _expected_loop_asset_count and _expected_loop_asset_count > 0


func one_shot_assets_are_valid() -> bool:
	for stream_variant in _event_streams.values():
		var stream: AudioStreamOggVorbis = stream_variant
		if stream.loop:
			return false
	return not _event_streams.is_empty()


static func ambient_kind_for_area(area: Dictionary) -> String:
	# 対応元: public/js/game/area.js。屋内は cave、屋外は FLOORS[def.floor - 1].amb。
	if String(area.get("shape", "")) == "grid":
		return "cave"
	return String(AMBIENT_BY_FLOOR.get(int(area.get("floor", 0)), ""))


static func weather_kind_for_area(area: Dictionary) -> String:
	# 対応元: public/js/game/area.js。屋内は天候音を無効にし、屋外だけ def.weather を使う。
	if String(area.get("shape", "")) == "grid":
		return ""
	var weather: Variant = area.get("weather", null)
	return String(weather) if typeof(weather) == TYPE_STRING else ""


func _read_index(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


func _load_loop_stream(directory: String, file: String, metadata: Dictionary) -> AudioStreamOggVorbis:
	if file.get_file() != file or not file.ends_with(".ogg"):
		return null
	var stream: AudioStreamOggVorbis = ResourceLoader.load(directory + file) as AudioStreamOggVorbis
	if stream == null:
		return null
	_loop_asset_count += 1
	if not stream.loop:
		_loop_streams_ok = false
	if float(metadata.get("seam_boundary_delta_dbfs", 0.0)) > -60.0:
		_loop_seams_ok = false
	return stream


func _load_one_shot(directory: String, file: String) -> AudioStreamOggVorbis:
	if file.get_file() != file or not file.ends_with(".ogg"):
		return null
	var stream: AudioStreamOggVorbis = ResourceLoader.load(directory + file) as AudioStreamOggVorbis
	return stream


func _transition_loop(category: String, stream: AudioStreamOggVorbis, bus_name: String, fade_sec: float) -> AudioStreamPlayer:
	var players: Array = _loop_players.get(category, [])
	var prior_tween: Tween = _transition_tweens.get(category)
	if prior_tween != null and prior_tween.is_running():
		prior_tween.kill()
	if category == "ambient" and _bed_sway_tween != null and _bed_sway_tween.is_running():
		_bed_sway_tween.kill()
		_bed_sway_tween = null

	var new_player: AudioStreamPlayer
	if stream != null and is_inside_tree() and AudioServer.get_bus_index(bus_name) >= 0:
		new_player = AudioStreamPlayer.new()
		new_player.name = "%s_%s" % [category.capitalize(), stream.resource_path.get_file().get_basename()]
		new_player.bus = bus_name
		new_player.stream = stream
		new_player.volume_db = SILENT_DB
		add_child(new_player)
		players.append(new_player)
		new_player.play()

	if players.is_empty():
		_loop_players[category] = players
		return new_player
	var tween := create_tween().set_parallel(true)
	for old_variant in players.duplicate():
		var old_player: AudioStreamPlayer = old_variant
		if old_player == new_player or not is_instance_valid(old_player):
			continue
		tween.tween_property(old_player, "volume_db", SILENT_DB, fade_sec)
		tween.tween_callback(Callable(self, "_finish_loop_player").bind(category, old_player)).set_delay(fade_sec)
	if new_player != null:
		tween.tween_property(new_player, "volume_db", 0.0, fade_sec)
	_transition_tweens[category] = tween
	_loop_players[category] = players
	return new_player


func _finish_loop_player(category: String, player: AudioStreamPlayer) -> void:
	if is_instance_valid(player):
		player.stop()
		player.queue_free()
	var players: Array = _loop_players.get(category, [])
	players.erase(player)
	_loop_players[category] = players


func _play_event_chances(chances: Dictionary) -> void:
	for event_variant in chances.keys():
		var event_name: String = String(event_variant)
		if _rng.randf() < float(chances[event_variant]):
			_play_event(event_name)


func _play_event(event_name: String) -> void:
	var stream: AudioStreamOggVorbis = _event_streams.get(event_name)
	if stream == null or not is_inside_tree() or AudioServer.get_bus_index("Amb") < 0:
		return
	var players: Array = _event_players.get(event_name, [])
	var player: AudioStreamPlayer
	for i in range(players.size() - 1, -1, -1):
		var candidate_variant: Variant = players[i]
		if not is_instance_valid(candidate_variant):
			players.remove_at(i)
			continue
		var candidate: AudioStreamPlayer = candidate_variant
		if not candidate.playing:
			player = candidate
			break
	if player == null and players.size() < 3:
		player = AudioStreamPlayer.new()
		player.name = "AmbEvent_%s_%d" % [event_name, players.size() + 1]
		player.bus = "Amb"
		add_child(player)
		players.append(player)
	_event_players[event_name] = players
	if player == null:
		return
	player.stream = stream
	player.pitch_scale = _rng.randf_range(1.0 - EVENT_PITCH_JITTER, 1.0 + EVENT_PITCH_JITTER)
	player.volume_db = linear_to_db(_rng.randf_range(1.0 - EVENT_VOLUME_JITTER, 1.0 + EVENT_VOLUME_JITTER))
	player.play()


func _update_bed_sway(delta: float) -> void:
	if _current_ambient_player == null or not is_instance_valid(_current_ambient_player) or not _current_ambient_player.playing:
		return
	_bed_sway_timer -= delta
	if _bed_sway_timer > 0.0:
		return
	_bed_sway_timer = _rng.randf_range(2.0, 5.0)
	_bed_sway_tween = create_tween()
	_bed_sway_tween.tween_property(_current_ambient_player, "volume_db", _rng.randf_range(-BED_SWAY_DB, BED_SWAY_DB), _rng.randf_range(1.0, 2.5))
