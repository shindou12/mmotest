extends Node3D
class_name WorldWeather
## 屋外の天候。元は public/shared/areas.js WEATHERS と public/js/env/ambient.js。

const WEATHER := {
	"rain": {"count": 1400, "tint": "#5a6880", "mix": 0.55, "sun": 0.4, "fog_scale": 1.5, "camera_distance": 5.0},
	"fog": {"count": 260, "tint": "#d4dee2", "mix": 0.5, "sun": 0.8, "fog_scale": 1.5, "camera_distance": 9.0},
	"sandstorm": {"count": 900, "tint": "#d09a58", "mix": 0.5, "sun": 0.75, "fog_scale": 1.4, "camera_distance": 10.0},
}

var particle_node: GPUParticles3D
var fog_overlay: GPUParticles2D
var particle_started := false
var camera_distance := 10.0


func configure(area_id: String, kind: String, environment: Environment, legacy_baked: bool) -> void:
	var cfg: Dictionary = WEATHER.get(kind, {})
	if cfg.is_empty(): return
	set_process(true)
	camera_distance = float(cfg.get("camera_distance", 10.0))
	var tint := Color.html(String(cfg["tint"]))
	if legacy_baked and environment != null:
		# export_areas.mjs がブラウザの霧・空・日差しを出力済み。Three.js Fog は空を霧で覆わない。
		environment.fog_sky_affect = 0.0
		# Godot の深度霧を同じ位置の Three.js 画像に合わせた倍率。
		environment.fog_depth_begin *= float(cfg["fog_scale"])
		environment.fog_depth_end *= float(cfg["fog_scale"])
		if kind == "fog":
			# 霧エリアの画面平均輝度をブラウザ撮影値に合わせる。
			environment.adjustment_enabled = true
			environment.adjustment_brightness *= 1.2
	# f1_lake は第3世代地図の光を保ち、雨の粒と画面の暗さだけを重ねる。
	if area_id == "f1_lake":
		var shade := float(cfg["mix"]) * (1.0 - float(cfg["sun"]))
		_add_screen_tint(tint, shade)
	_add_particles(kind, cfg)


func _add_screen_tint(color: Color, alpha: float) -> void:
	var layer := CanvasLayer.new()
	layer.name = "WeatherScreenTint"
	layer.layer = 0
	add_child(layer)
	var rect := ColorRect.new()
	rect.name = "RainShade"
	rect.color = Color(color.r, color.g, color.b, alpha)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(rect)


func _add_particles(kind: String, cfg: Dictionary) -> void:
	if kind == "fog":
		_add_fog_particles(cfg)
		return
	particle_node = GPUParticles3D.new()
	particle_node.name = "WeatherParticles"
	particle_node.amount = int(cfg["count"])
	particle_node.emitting = false
	particle_node.one_shot = false
	particle_node.explosiveness = 0.0
	particle_node.local_coords = false
	particle_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	particle_node.visibility_aabb = AABB(Vector3(-36.0, -20.0, -36.0), Vector3(72.0, 58.0, 72.0))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(30.0, 7.5, 30.0)
	process.gravity = Vector3.ZERO
	var mesh := QuadMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# 霧は滑らかな半透明、雨と砂は粒が見える Alpha Hash で描く。
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_HASH
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	match kind:
		"rain":
			# ambient.js downpour: 線の色 #c8d8f0、不透明度 0.45、速度 x=3 / y=-26〜-32。
			particle_node.lifetime = 0.55
			particle_node.preprocess = 0.55
			process.direction = Vector3(0.1, -1.0, 0.0)
			process.spread = 0.5
			process.initial_velocity_min = 26.0
			process.initial_velocity_max = 32.0
			process.particle_flag_align_y = true
			mesh.size = Vector2(0.025, 0.9)
			material.albedo_color = Color(0.784, 0.847, 0.941, 0.45)
		"sandstorm":
			# ambient.js sand: #d8a860、0.28、0.75。横殴りの速度 x=14〜22 / z=3〜5。
			particle_node.lifetime = 3.5
			particle_node.preprocess = 3.5
			process.emission_box_extents.y = 3.5
			process.direction = Vector3(1.0, 0.0, 0.22)
			process.spread = 2.0
			process.initial_velocity_min = 14.0
			process.initial_velocity_max = 22.0
			mesh.size = Vector2(0.12, 0.42)
			process.particle_flag_align_y = true
			material.albedo_color = Color(0.847, 0.659, 0.376, 0.75)
			material.albedo_texture = _dot_texture()
	mesh.material = material
	particle_node.draw_pass_1 = mesh
	particle_node.process_material = process
	add_child(particle_node)


func _add_fog_particles(cfg: Dictionary) -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	var layer := CanvasLayer.new()
	layer.name = "WeatherFogLayer"
	layer.layer = 0
	add_child(layer)
	fog_overlay = GPUParticles2D.new()
	fog_overlay.name = "FogParticles"
	fog_overlay.amount = int(cfg["count"])
	fog_overlay.one_shot = false
	fog_overlay.lifetime = 30.0
	fog_overlay.preprocess = 30.0
	fog_overlay.visibility_rect = Rect2(-2000.0, -2000.0, 4000.0, 4000.0)
	fog_overlay.texture = _dot_texture()
	# ambient.js mist: #e4ecee、透明度 0.12。画面全体の比較値に合わせて粒の重なりを調整。
	fog_overlay.modulate = Color(0.894, 0.925, 0.933, 0.32)
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(viewport_size.x * 1.25, viewport_size.y * 1.25, 0.0)
	process.direction = Vector3.RIGHT
	process.spread = 8.0
	process.gravity = Vector3.ZERO
	process.initial_velocity_min = 18.0
	process.initial_velocity_max = 30.0
	process.scale_min = 1.0
	process.scale_max = 1.8
	fog_overlay.process_material = process
	fog_overlay.position = viewport_size * 0.5
	layer.add_child(fog_overlay)
	fog_overlay.restart()
	fog_overlay.emitting = true


func _dot_texture() -> ImageTexture:
	var img := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	for y in 32:
		for x in 32:
			var r := Vector2(x - 15.5, y - 15.5).length() / 16.0
			var alpha := lerpf(1.0, 0.6, r / 0.4) if r < 0.4 else lerpf(0.6, 0.0, (r - 0.4) / 0.6)
			img.set_pixel(x, y, Color(1.0, 1.0, 1.0, clampf(alpha, 0.0, 1.0)))
	return ImageTexture.create_from_image(img)


func _process(_dt: float) -> void:
	if particle_node == null:
		if fog_overlay != null:
			fog_overlay.position = get_viewport().get_visible_rect().size * 0.5
		return
	var camera := get_viewport().get_camera_3d()
	if camera == null: return
	var host := get_parent()
	var x := camera.global_position.x
	var z := camera.global_position.z
	var game := host.get_parent() if host != null else null
	var player: Variant = game.get("me") if game != null else null
	if player is Dictionary:
		x = float(player.get("x", x))
		z = float(player.get("z", z))
	var y := 0.0
	if host != null and host.has_method("ground_y"):
		y = float(host.call("ground_y", x, z))
	# カメラ前方で発生させ、地面に隠れない距離から粒子を見せる。
	global_position = Vector3.ZERO
	var emitter := camera.global_position - camera.global_basis.z * camera_distance
	particle_node.global_position = Vector3(emitter.x, emitter.y, emitter.z)
	if not particle_started:
		particle_node.restart()
		particle_node.emitting = true
		particle_started = true
