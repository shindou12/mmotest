extends SceneTree

const CAMERA_DISTANCE := 19.5
const CAMERA_FOV := 50.0
const CAMERA_PITCHES := {
	"f1_hunt": 0.8891169672,
	"f2_field": 1.1033465802,
	"f3_hunt": 0.7485714286,
}
const DEFAULT_CAMERA_PITCH := 0.8891169672


class CaptureGuard extends Node:
	var game: Node
	var target_area := ""

	func _ready() -> void:
		process_priority = 1000
		set_process(true)

	func _process(_dt: float) -> void:
		if game == null or String(game.get("area_id")) != target_area:
			return
		var player: Dictionary = game.get("me")
		var stats: Dictionary = game.get("S")
		if player.is_empty():
			return
		player["hp"] = float(stats.get("mhp", 100.0))
		player["dead"] = false
		player["crawl"] = false
		player["downT"] = 0.0
		player["hurtT"] = 0.0
		player["deathAt"] = 0.0
		game.set("me", player)
		var player_node := game.get("me_node") as Node3D
		if player_node != null:
			player_node.visible = true
			player_node.scale = Vector3.ONE
		var hud := game.get("hud_ui") as Node
		if hud != null:
			hud.call("banner", "")
			hud.call("update")
			for key in ["death_overlay", "help_panel", "toast_stack"]:
				var panel := hud.get(key) as Control
				if panel != null:
					panel.visible = false


class CameraMatch extends Node:
	var game: Node
	var target_area := ""
	var spawn_override := Vector2.ZERO
	var has_spawn_override := false
	var reported := false
	var stable_frames := 0

	func _ready() -> void:
		process_priority = 100
		set_process(true)

	func _process(_dt: float) -> void:
		if game == null or not bool(game.get("started")):
			return
		if String(game.get("area_id")) != target_area:
			stable_frames = 0
			return
		var player: Dictionary = game.get("me")
		var world: Node = game.get("world")
		var camera := game.get("cam") as Camera3D
		if player.is_empty() or world == null or camera == null:
			return
		if has_spawn_override:
			player["x"] = spawn_override.x
			player["z"] = spawn_override.y
			game.set("me", player)
		var x := float(player.get("x", 0.0))
		var z := float(player.get("z", 0.0))
		var area_id := String(game.get("area_id"))
		var pitch := float(CAMERA_PITCHES.get(area_id, DEFAULT_CAMERA_PITCH))
		var target := Vector3(x, float(world.call("ground_y", x, z)) + 1.2, z)
		game.set("dist", CAMERA_DISTANCE)
		camera.fov = CAMERA_FOV
		camera.global_position = target + Vector3(0.0, sin(pitch), cos(pitch)) * CAMERA_DISTANCE
		camera.look_at(target, Vector3.UP)
		if not reported:
			print("WX_VIEW area=%s player=(%.3f,%.3f) distance=%.2f pitch=%.4f fov=%.1f" % [area_id, x, z, camera.global_position.distance_to(target), pitch, CAMERA_FOV])
			var weather := world.get("weather_effect") as Node3D
			var particles := weather.get("particle_node") as GPUParticles3D if weather != null else null
			if particles != null:
				print("WX_PARTICLES emitting=%s visible=%s amount=%d pos=%s global=%s" % [particles.emitting, particles.visible, particles.amount, particles.position, particles.global_position])
			reported = true
		stable_frames += 1
		if stable_frames == 12:
			var weather := world.get("weather_effect") as Node3D
			var particles := weather.get("particle_node") as GPUParticles3D if weather != null else null
			if particles != null:
				print("WX_FOLLOW processing=%s root=%s particle=%s emitting=%s amount=%d aabb=%s" % [weather.is_processing(), weather.global_position, particles.global_position, particles.emitting, particles.amount, particles.visibility_aabb])
			var hud = game.get("hud_ui")
			if hud != null:
				hud.call("banner", "")
				var help_panel := hud.get("help_panel") as Control
				if help_panel != null: help_panel.visible = false
				var toast_stack := hud.get("toast_stack") as Control
				if toast_stack != null: toast_stack.visible = false


func _initialize() -> void:
	seed(0x53a91)
	call_deferred("_boot")


func _boot() -> void:
	var scene := load("res://scenes/game.tscn") as PackedScene
	if scene == null:
		push_error("res://scenes/game.tscn を読み込めません")
		quit(1)
		return
	var game := scene.instantiate()
	root.add_child(game)
	var camera_match := CameraMatch.new()
	camera_match.game = game
	for arg in OS.get_cmdline_user_args():
		var value := String(arg)
		if value.begins_with("--start="):
			camera_match.target_area = value.get_slice("=", 1)
		elif value.begins_with("--weather-at="):
			var position := value.trim_prefix("--weather-at=").split(",", true, 1)
			if position.size() == 2:
				camera_match.spawn_override = Vector2(float(position[0]), float(position[1]))
				camera_match.has_spawn_override = true
	var capture_guard := CaptureGuard.new()
	capture_guard.game = game
	capture_guard.target_area = camera_match.target_area
	game.add_child(capture_guard)
	game.add_child(camera_match)
