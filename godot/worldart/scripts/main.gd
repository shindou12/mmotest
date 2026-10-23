extends Node3D
const TUNING_PARAMS = preload("res://scripts/tuning_params.gd")
## 地図を見る（L26、goal-worldart-port で全地図・全ビューに）。world.js の歩く・ビュー・仕上げと同じ。
## 操作: WASD・矢印 注目点を動かす、Q / E 向き、マウスのホイール 距離、M 地図とビューを選ぶ画面（scripts/viewer_menu.gd があれば）。
## カメラは地図の camera か views（見本の基準カメラ。ビューごとの光の上書き light: sun・hemi・exposure・sat・vignette・topDark）か、
## 標準ビュー（oblique・side・top・walker・near・far。基準ビューの注目点のまわりに置く、world.js の STD_VIEWS）。
## ゲームの遊びの形（地図の JSON の game）があれば、輪郭の外と当たり判定のある木・岩には入らない（出口は通れる）。
## 起動の引数（-- の後）: --map=<地図> --view=<ビュー>[@<基準>] --shot=<ビュー,...> --out=<絶対パス>（撮って終わる）
## 仕上げ調整: --vwarm --vcool --vdesat --vlift --diff --diffr --diffmask --diffd0 --diffd1 --diffe --diffdebug --bake --srad

const STD_VIEWS := {
	"oblique": {"yaw": 45, "pitch": 40, "dist": 26},
	"side": {"yaw": 90, "pitch": 18, "dist": 30},
	"top": {"yaw": 0, "pitch": 85, "dist": 40},
	"walker": {"yaw": 20, "pitch": 6, "dist": 9, "ty": 1.6},
	"near": {"yaw": 0, "pitch": 45, "dist": 9},
	"far": {"yaw": 0, "pitch": 52, "dist": 60},
}

@onready var world: Node3D = $World
var cam := Camera3D.new()
var post := MeshInstance3D.new()
var pm := ShaderMaterial.new()
var default_post_shader: Shader = preload("res://shaders/post_default.gdshader")
var tuning_post_shader: Shader = preload("res://shaders/post.gdshader")
var source_cam: Camera3D
var source_post: MeshInstance3D
var source_pm: ShaderMaterial
var source_viewport: SubViewport
var blur_h_viewport: SubViewport
var blur_v_viewport: SubViewport
var mask_viewport: SubViewport
var mask_camera: Camera3D
var mask_root: Node3D
var mask_material_cache: Dictionary = {}
var blur_h_material: ShaderMaterial
var blur_v_material: ShaderMaterial
var tuning: Variant = preload("res://scripts/tuning.gd").new()
var tuning_args_applied := false
var marker := MeshInstance3D.new()
var target := Vector3.ZERO
var ty := 0.0
var yaw := 0.0
var pitch := 45.0
var dist := 33.0
var outline := PackedVector2Array()
var solids := []
var exits := []
var args := {}
var view_name := ""
var light0 := {}   # 地図の光の基準（ビューの上書きはこれに掛ける）
var menu: Node = null
var tuning_panel: Node = null
var hold_kind := ""
var _param_values: Dictionary = TUNING_PARAMS.defaults()
var srad_map_default := 2.0


func _ready() -> void:
	args = _args()
	hold_kind = String(args.get("hold", ""))
	_create_post_chain()
	get_viewport().size_changed.connect(_resize_post_chain)
	cam.near = 0.3
	cam.far = 600.0
	# 人物の代わりの印（three と同じ赤い円柱）
	var cy := CylinderMesh.new()
	cy.top_radius = 0.3; cy.bottom_radius = 0.3; cy.height = 1.7
	var mk := StandardMaterial3D.new()
	mk.albedo_color = Color("c04030")
	cy.material = mk
	marker.mesh = cy
	add_child(marker)
	if ResourceLoader.exists("res://scripts/viewer_menu.gd"):
		menu = load("res://scripts/viewer_menu.gd").new()
		add_child(menu)
	await load_map(String(args.get("map", world.map_name)), String(args.get("view", "")))
	_apply_command_values()
	tuning_panel = load("res://scripts/tuning_panel.gd").new()
	tuning_panel.panel_open = args.has("tune")
	add_child(tuning_panel)
	if args.has("shot"):
		_shoot(String(args["shot"]).split(","), String(args.get("out", "user://shots")))


func _create_post_chain() -> void:
	var root_viewport := get_viewport()
	var size: Vector2i = root_viewport.size
	cam.near = 0.3
	cam.far = 600.0
	cam.current = true
	# World3D を共有する補助カメラと、全画面ポスト板を別レイヤーに分ける。
	cam.cull_mask = 0xFFFF ^ 4
	add_child(cam)
	pm.shader = default_post_shader
	pm.render_priority = 100
	var quad := QuadMesh.new()
	quad.size = Vector2(2, 2)
	post.name = "Post"
	post.mesh = quad
	post.material_override = pm
	post.layers = 2
	post.extra_cull_margin = 16384
	post.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cam.add_child(post)

	# 仕上げ前の色を別カメラで描き、半解像度の横・縦ぼかしへ渡す。
	source_viewport = SubViewport.new()
	source_viewport.name = "DiffusionSourceViewport"
	source_viewport.size = size
	source_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(source_viewport)
	source_viewport.world_3d = root_viewport.world_3d
	source_cam = Camera3D.new()
	source_cam.name = "DiffusionSourceCamera"
	source_cam.near = cam.near
	source_cam.far = cam.far
	source_cam.cull_mask = 0xFFFF ^ 2
	source_cam.current = true
	source_viewport.add_child(source_cam)
	source_pm = ShaderMaterial.new()
	source_pm.shader = tuning_post_shader
	source_pm.render_priority = 100
	source_pm.set_shader_parameter("source_only", true)
	var source_quad := QuadMesh.new()
	source_quad.size = Vector2(2, 2)
	source_post = MeshInstance3D.new()
	source_post.name = "DiffusionGrade"
	source_post.mesh = source_quad
	source_post.material_override = source_pm
	source_post.layers = 4
	source_post.extra_cull_margin = 16384
	source_post.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	source_cam.add_child(source_post)

	blur_h_viewport = _make_blur_viewport("DiffusionHorizontal", source_viewport.get_texture(), Vector2(1, 0))
	blur_v_viewport = _make_blur_viewport("DiffusionVertical", blur_h_viewport.get_texture(), Vector2(0, 1))
	var blur_h_rect := blur_h_viewport.get_child(0) as TextureRect
	var blur_v_rect := blur_v_viewport.get_child(0) as TextureRect
	blur_h_material = blur_h_rect.material as ShaderMaterial
	blur_v_material = blur_v_rect.material as ShaderMaterial

	mask_viewport = SubViewport.new()
	mask_viewport.name = "DiffusionMaskViewport"
	mask_viewport.size = size
	mask_viewport.own_world_3d = true
	mask_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(mask_viewport)
	var mask_environment := Environment.new()
	mask_environment.background_mode = Environment.BG_COLOR
	mask_environment.background_color = Color.BLACK
	mask_environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	mask_environment.ambient_light_color = Color.BLACK
	mask_environment.ambient_light_energy = 0.0
	mask_environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var mask_world_environment := WorldEnvironment.new()
	mask_world_environment.environment = mask_environment
	mask_viewport.add_child(mask_world_environment)
	mask_camera = Camera3D.new()
	mask_camera.name = "DiffusionMaskCamera"
	mask_camera.current = true
	mask_viewport.add_child(mask_camera)
	mask_root = Node3D.new()
	mask_root.name = "DiffusionMask"
	mask_viewport.add_child(mask_root)

	pm.set_shader_parameter("t_blur", blur_v_viewport.get_texture())
	pm.set_shader_parameter("t_mask", mask_viewport.get_texture())
	source_pm.set_shader_parameter("t_blur", blur_v_viewport.get_texture())
	source_pm.set_shader_parameter("t_mask", mask_viewport.get_texture())
	_resize_post_chain()


func _make_blur_viewport(viewport_name: String, source_texture: Texture2D, axis: Vector2) -> SubViewport:
	var vp := SubViewport.new()
	var size: Vector2i = get_viewport().size
	vp.name = viewport_name
	vp.size = Vector2i(maxi(1, int(ceil(float(size.x) * 0.5))), maxi(1, int(ceil(float(size.y) * 0.5))))
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(vp)
	var rect := TextureRect.new()
	rect.name = "Blur"
	rect.texture = source_texture
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/diffusion_blur.gdshader")
	material.set_shader_parameter("source_tex", source_texture)
	material.set_shader_parameter("source_size", Vector2(size))
	material.set_shader_parameter("axis", axis)
	rect.material = material
	material.set_shader_parameter("radius", 0.012)
	vp.add_child(rect)
	return vp


func _resize_post_chain() -> void:
	if source_viewport == null or not is_instance_valid(source_viewport):
		return
	var size: Vector2i = get_viewport().size
	if size.x <= 0 or size.y <= 0:
		return
	var half_size := Vector2i(maxi(1, int(ceil(float(size.x) * 0.5))), maxi(1, int(ceil(float(size.y) * 0.5))))
	source_viewport.size = size
	mask_viewport.size = size
	blur_h_viewport.size = half_size
	blur_v_viewport.size = half_size
	blur_h_material.set_shader_parameter("source_size", Vector2(size))
	blur_v_material.set_shader_parameter("source_size", Vector2(size))
	pm.set_shader_parameter("viewport_size", Vector2(size))
	source_pm.set_shader_parameter("viewport_size", Vector2(size))


func _args() -> Dictionary:
	var d := {}
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			var value := kv[1] if kv.size() > 1 else "1"
			if kv[0] == "set" and d.has("set"):
				d["set"] = "%s&%s" % [d["set"], value]
			else:
				d[kv[0]] = value
	return d


# ---------------------------------------------------------------- 地図とビュー（viewer_menu.gd もこれを呼ぶ）
## 地図の一覧（data/<名>/map.json があるもの）
func maps() -> PackedStringArray:
	var out := PackedStringArray()
	var d := DirAccess.open("res://data")
	if d == null: return out
	for n in d.get_directories():
		if FileAccess.file_exists("res://data/%s/map.json" % n): out.append(n)
	out.sort()
	return out


## 選べるビュー: "cam"（地図のカメラ）、地図の views、標準ビュー（基準は最初の views か cam）
func views() -> PackedStringArray:
	var out := PackedStringArray(["cam"])
	for k in world.spec.get("views", {}).keys(): out.append(k)
	for k in STD_VIEWS.keys(): out.append(k)
	return out


func load_map(name: String, view := "") -> void:
	world.map_name = name   # world.gd の map_name の設定で組み立て直す
	var spec: Dictionary = world.spec
	var P: Dictionary = spec.get("post", {})
	srad_map_default = float(spec.get("shadowRadius", 2.0))
	tuning.set_map_default("srad", srad_map_default)
	_set_post_parameter("tone", 1 if String(spec.get("tone", "aces")) == "aces" else 0)
	_set_post_parameter("exposure", float(P.get("exposure", 1.0)))
	_set_post_parameter("sat", float(P.get("sat", 1.0)))
	_set_post_parameter("contrast", float(P.get("contrast", 1.0)))
	_set_post_parameter("lift", _v3(P.get("lift", [0, 0, 0])))
	_set_post_parameter("gain", _v3(P.get("gain", [1, 1, 1])))
	_set_post_parameter("dof_amt", float(P.get("dof", 1.0)))
	_set_post_parameter("dof_top", float(P.get("dofTop", 0.30)))
	_set_post_parameter("dof_bot", float(P.get("dofBot", 0.80)))
	var hz = P.get("haze", [0.8, 0.86, 0.9, 0.0])
	_set_post_parameter("haze", Vector4(hz[0], hz[1], hz[2], hz[3]))
	_set_post_parameter("enabled", args.get("post", "1") != "0")
	_set_post_parameter("dof_on", args.get("dof", "1") != "0")
	get_viewport().msaa_3d = Viewport.MSAA_4X if int(P.get("msaa", 0)) > 0 else Viewport.MSAA_DISABLED   # 第 2 世代は MSAA なし
	light0 = {"sun": world.sun.light_energy, "hemi": float(spec.get("sky", {}).get("intensity", 0.6)), "exposure": float(P.get("exposure", 1.0)), "sat": float(P.get("sat", 1.0))}
	_rebuild_mask_scene()
	# 遊びの形
	outline = PackedVector2Array(); solids = []; exits = []
	var g: Dictionary = spec.get("game", {})
	for p in g.get("outline", []): outline.append(Vector2(p[0], p[1]))
	for o in g.get("obstacles", []):
		if o.get("solid", false): solids.append(Vector3(o["x"], o["z"], o["r"]))
	for e in g.get("exits", []): exits.append(Vector2(e["x"], e["z"]))
	await get_tree().physics_frame
	await get_tree().physics_frame
	set_view(view if view != "" else "cam")
	if not tuning_args_applied:
		for key in tuning.values().keys():
			if args.has(key): tuning.set_value(String(key), args[key])
		tuning_args_applied = true
	if menu != null and menu.has_method("refresh"): menu.refresh()
	apply_tuning()
	if tuning_panel != null and tuning_panel.has_method("refresh"): tuning_panel.refresh()


func _v3(a) -> Vector3:
	return Vector3(a[0], a[1], a[2])


func _set_post_parameter(name: String, value: Variant) -> void:
	pm.set_shader_parameter(name, value)
	if source_pm != null:
		source_pm.set_shader_parameter(name, value)


## 次の調整 UI もこの値辞書を読み書きする。
func get_tuning_values() -> Dictionary:
	return tuning.values()


func set_tuning_value(name: String, value: Variant) -> bool:
	if not tuning.set_value(name, value): return false
	apply_tuning()
	return true


func apply_tuning() -> void:
	var values: Dictionary = tuning.values().duplicate()
	if hold_kind == "default":   # 押している間だけ既定（研究の切り替えも全部切。影の縁は地図の既定）
		for k in ["vwarm", "vcool", "vdesat", "vlift", "diff", "bake"]: values[k] = 0.0
		values["diffdebug"] = false
		values["srad"] = srad_map_default   # 地図の shadowRadius（無ければ 2）
	var effect_enabled: bool = String(args.get("post", "1")) != "0"
	var use_tuning_shader: bool = effect_enabled and (
		float(values["vwarm"]) != 0.0 or float(values["vcool"]) != 0.0
		or float(values["vdesat"]) != 0.0 or float(values["vlift"]) != 0.0
		or float(values["diff"]) > 0.0 or bool(values["diffdebug"])
	)
	var wanted_shader: Shader = tuning_post_shader if use_tuning_shader else default_post_shader
	if pm.shader != wanted_shader:
		pm.shader = wanted_shader
	for key in ["vwarm", "vcool", "vdesat", "vlift"]:
		_set_post_parameter(key, float(values[key]))
	_set_post_parameter("diff_amt", float(values["diff"]))
	_set_post_parameter("diffd0", float(values["diffd0"]))
	_set_post_parameter("diffd1", float(values["diffd1"]))
	_set_post_parameter("diffe", float(values["diffe"]))
	_set_post_parameter("diff_debug", bool(values["diffdebug"]))
	var mask_modes := {"none": 0, "depth": 1, "edge": 2, "veg": 3, "soft": 4, "lum": 5}
	_set_post_parameter("diff_mask_mode", int(mask_modes[String(values["diffmask"])]))
	var blur_enabled: bool = effect_enabled and float(values["diff"]) > 0.0
	var source_update: int = SubViewport.UPDATE_ALWAYS if blur_enabled else SubViewport.UPDATE_DISABLED
	source_viewport.render_target_update_mode = source_update
	blur_h_viewport.render_target_update_mode = source_update
	blur_v_viewport.render_target_update_mode = source_update
	var mask_mode := String(values["diffmask"])
	var mask_enabled: bool = effect_enabled and (float(values["diff"]) > 0.0 or bool(values["diffdebug"])) and (mask_mode == "veg" or mask_mode == "soft")
	mask_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if mask_enabled else SubViewport.UPDATE_DISABLED
	blur_h_material.set_shader_parameter("radius", float(values["diffr"]))
	blur_v_material.set_shader_parameter("radius", float(values["diffr"]))
	world.set_bake(float(values["bake"]))
	world.set_shadow_radius(float(values["srad"]))


## world.js resolveView・__setView と同じ: ビューの名前 → カメラ（と光の上書き）。"名前@基準" で標準ビューの基準を選ぶ
func set_view(v: String) -> void:
	var spec: Dictionary = world.spec
	var parts := v.split("@")
	var name := parts[0]
	var views_d: Dictionary = spec.get("views", {})
	var base_name := parts[1] if parts.size() > 1 else ""
	var base: Dictionary = views_d.get(base_name, spec["camera"])
	var C: Dictionary
	if views_d.has(name): C = spec["camera"].duplicate(); C.merge(views_d[name], true)
	elif STD_VIEWS.has(name):
		C = base.duplicate(); C.merge(STD_VIEWS[name], true)
		C["yaw"] = float(base.get("yaw", 0)) + float(STD_VIEWS[name]["yaw"])
		C.erase("light")
		if base.has("light"): C["light"] = base["light"]
	else: C = spec["camera"]
	view_name = v
	target = Vector3(C["target"][0], C["target"][1], C["target"][2])
	ty = float(C.get("ty", 0.0))
	yaw = float(C["yaw"]); pitch = float(C["pitch"]); dist = float(C["dist"]); cam.fov = float(C["fov"])
	if spec.has("views"): target.y = world.ground_y(target.x, target.z)   # 区画のある地図: 注目点を地面に置く（world.js と同じ）
	_apply_light(C.get("light", {}))
	_place()
	if tuning_panel != null and tuning_panel.has_method("refresh"):
		tuning_panel.refresh()


## world.js applyLight: 地図の光に掛ける（sun・hemi・exposure・sat）と、仕上げの周辺減光・上の暗がり
func _apply_light(L: Dictionary) -> void:
	var use_default := hold_kind == "default"
	world.sun.light_energy = float(light0["sun"]) * _param_ratio("sun", use_default) * float(L.get("sun", 1.0))
	RenderingServer.global_shader_parameter_set("wa_hemi_int", float(light0["hemi"]) * _param_ratio("hemi", use_default) * float(L.get("hemi", 1.0)))
	_set_post_parameter("exposure", float(light0["exposure"]) * _param_ratio("exposure", use_default) * float(L.get("exposure", 1.0)))
	_set_post_parameter("sat", float(light0["sat"]) * _param_ratio("sat", use_default) * float(L.get("sat", 1.0)))
	_set_post_parameter("contrast", float(world.spec.get("post", {}).get("contrast", 1.0)) * _param_ratio("contrast", use_default))
	_set_post_parameter("vignette", clampf(float(L.get("vignette", 0.0)) + float(_param("vignette", use_default)), 0.0, 1.0))
	_set_post_parameter("top_dark", clampf(float(L.get("topDark", 0.0)) + float(_param("topDark", use_default)), 0.0, 1.0))
	_set_post_parameter("dof_amt", float(world.spec.get("post", {}).get("dof", 1.0)) * _param_ratio("dof", use_default))
	_set_post_parameter("dof_top", clampf(float(world.spec.get("post", {}).get("dofTop", 0.30)) + float(_param("dofTop", use_default)) - float(TUNING_PARAMS.find("dofTop").default), 0.0, 1.0))
	_set_post_parameter("dof_bot", clampf(float(world.spec.get("post", {}).get("dofBot", 0.80)) + float(_param("dofBot", use_default)) - float(TUNING_PARAMS.find("dofBot").default), 0.0, 1.0))
	var F: Dictionary = world.spec.get("foliage", {})
	RenderingServer.global_shader_parameter_set("wa_wrap", float(F.get("wrap", 0.0)) * _param_ratio("wrap", use_default))
	RenderingServer.global_shader_parameter_set("wa_leaf_sat", float(F.get("sat", world.spec.get("albedoSat", 1.0))) * _param_ratio("lsat", use_default))
	var S: Dictionary = world.spec.get("sun", {})
	var az := deg_to_rad(float(S.get("azimuth", 0.0)) + float(_param("sunAz", use_default)) - float(TUNING_PARAMS.find("sunAz").default))
	var el := deg_to_rad(float(S.get("elevation", 0.0)) + float(_param("sunEl", use_default)) - float(TUNING_PARAMS.find("sunEl").default))
	var to_sun := Vector3(sin(az) * cos(el), sin(el), cos(az) * cos(el))
	world.sun.basis = Basis.looking_at(-to_sun, Vector3.UP if abs(to_sun.y) < 0.99 else Vector3.FORWARD)


func _place() -> void:
	var y := deg_to_rad(yaw)
	var p := deg_to_rad(pitch)
	var tgt := target + Vector3(0, ty, 0)
	cam.position = tgt + Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * dist
	cam.look_at(tgt, Vector3.UP)
	tuning.set_reference_distance(dist)
	pm.set_shader_parameter("diffd0", float(tuning.get_value("diffd0")))
	pm.set_shader_parameter("diffd1", float(tuning.get_value("diffd1")))
	pm.set_shader_parameter("camera_near", cam.near)
	pm.set_shader_parameter("camera_far", cam.far)
	pm.set_shader_parameter("camera_tan_half_fov", tan(deg_to_rad(cam.fov) * 0.5))
	_sync_aux_cameras()
	marker.position = target + Vector3(0, 0.85, 0)
	marker.visible = args.has("marker")


func _sync_aux_cameras() -> void:
	if source_cam != null:
		source_cam.transform = cam.transform
		source_cam.fov = cam.fov
		source_cam.near = cam.near
		source_cam.far = cam.far
	if mask_camera != null:
		mask_camera.transform = cam.transform
		mask_camera.fov = cam.fov
		mask_camera.near = cam.near
		mask_camera.far = cam.far


func _rebuild_mask_scene() -> void:
	mask_material_cache.clear()
	for child in mask_root.get_children():
		mask_root.remove_child(child)
		child.free()
	for node in world.find_children("*", "GeometryInstance3D", true, false):
		var source := node as GeometryInstance3D
		if source == null or not source.is_visible_in_tree(): continue
		if source.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY: continue
		if source is MeshInstance3D:
			var src_mesh := source as MeshInstance3D
			if src_mesh.mesh == null: continue
			var copy := MeshInstance3D.new()
			copy.name = src_mesh.name
			copy.mesh = src_mesh.mesh
			copy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mask_root.add_child(copy)
			copy.global_transform = src_mesh.global_transform
			var include_ground := bool(source.get_meta("wa_diff_ground", false)) or String(source.name) == "Terrain"
			for surface in copy.mesh.get_surface_count():
				copy.set_surface_override_material(surface, _mask_material(src_mesh.get_active_material(surface), include_ground))
		elif source is MultiMeshInstance3D:
			var src_multi := source as MultiMeshInstance3D
			if src_multi.multimesh == null or src_multi.multimesh.mesh == null: continue
			var copy := MultiMeshInstance3D.new()
			copy.name = src_multi.name
			copy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var multi := src_multi.multimesh.duplicate() as MultiMesh
			var mesh := multi.mesh.duplicate() as Mesh
			var include_ground := bool(source.get_meta("wa_diff_ground", false)) or String(source.name) == "Terrain"
			for surface in mesh.get_surface_count():
				var source_material := mesh.surface_get_material(surface)
				if source_material == null: source_material = src_multi.material_override
				mesh.surface_set_material(surface, _mask_material(source_material, include_ground))
			multi.mesh = mesh
			copy.multimesh = multi
			mask_root.add_child(copy)
			copy.global_transform = src_multi.global_transform


func _mask_material(source: Material, include_ground: bool) -> ShaderMaterial:
	var name := String(source.get_meta("wa_source_name", source.resource_name)).to_lower() if source != null else ""
	var included := include_ground
	if source != null:
		included = included or bool(source.get_meta("wa_diff_vegetation", false))
		for token in ["leaf", "frond", "grass", "clover", "bush"]:
			included = included or name.contains(token)
	var alpha_texture: Texture2D = null
	if source is ShaderMaterial:
		var tex: Variant = (source as ShaderMaterial).get_shader_parameter("albedo_tex")
		if tex is Texture2D: alpha_texture = tex
	elif source is BaseMaterial3D:
		alpha_texture = (source as BaseMaterial3D).albedo_texture
	var use_alpha := included and alpha_texture != null
	var key := "%s|%s|%s" % [str(included), str(alpha_texture.get_instance_id()) if alpha_texture != null else "0", str(use_alpha)]
	if mask_material_cache.has(key): return mask_material_cache[key]
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/diffusion_mask.gdshader")
	material.set_shader_parameter("alpha_tex", alpha_texture)
	material.set_shader_parameter("use_alpha", use_alpha)
	material.set_shader_parameter("alpha_cut", 0.25 if int(world.spec.get("post", {}).get("msaa", 0)) > 0 else 0.5)
	material.set_shader_parameter("mask_value", 1.0 if included else 0.0)
	mask_material_cache[key] = material
	return material


func _can_walk(x: float, z: float) -> bool:
	if outline.size() > 2 and not Geometry2D.is_point_in_polygon(Vector2(x, z), outline):
		var near_exit := false
		for e in exits:
			if Vector2(x, z).distance_to(e) < 8.0:
				near_exit = true
		if not near_exit:
			return false
	for s in solids:
		if Vector2(x, z).distance_to(Vector2(s.x, s.y)) < s.z + 0.4:
			return false
	return true


func _process(dt: float) -> void:
	var v := Vector3(Input.get_axis("move_left", "move_right"), 0, Input.get_axis("move_up", "move_down"))
	var turn := Input.get_axis("turn_left", "turn_right")
	if turn != 0.0:
		yaw += turn * 70.0 * dt
	if v.length_squared() > 0.0:
		v = v.normalized().rotated(Vector3.UP, deg_to_rad(yaw)) * 5.0 * dt
		if _can_walk(target.x + v.x, target.z + v.z):
			target.x += v.x; target.z += v.z
			target.y = world.ground_y(target.x, target.z)
		marker.visible = true
	if v.length_squared() > 0.0 or turn != 0.0:
		_place()
		marker.visible = true


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey:
		if ev.keycode == KEY_TAB and ev.pressed and not ev.echo:
			if tuning_panel != null:
				tuning_panel.toggle_panel()
			get_viewport().set_input_as_handled()
		elif ev.keycode == KEY_1:
			if ev.pressed and not ev.echo:
				set_hold("ref")
			elif not ev.pressed and hold_kind == "ref":
				set_hold("")
			get_viewport().set_input_as_handled()
		elif ev.keycode == KEY_2:
			if ev.pressed and not ev.echo:
				set_hold("default")
			elif not ev.pressed and hold_kind == "default":
				set_hold("")
			get_viewport().set_input_as_handled()
	if ev is InputEventMouseButton and ev.pressed:
		if ev.button_index == MOUSE_BUTTON_WHEEL_UP: dist = max(3.0, dist * 0.9); _place()
		elif ev.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = min(80.0, dist / 0.9); _place()


## 調整パネルから参照する値。まだ描画へつないでいない研究値も保持する。
func get_param(key: String):
	if tuning.values().has(key): return tuning.get_value(key)   # 研究の切り替え（tuning.gd が正）
	return _param_values.get(key, null)


## 調整パネルから値を受け取り、現在の地図とビューへ反映する。
func set_param(key: String, value) -> void:
	var item: Dictionary = TUNING_PARAMS.find(key)
	if item.is_empty():
		return
	match item.kind:
		"slider":
			_param_values[key] = clampf(float(value), float(item.min), float(item.max))
		"toggle":
			_param_values[key] = bool(value) if value is bool else String(value).to_lower() in ["1", "true", "on"]
		"choice":
			if item.choices.has(value):
				_param_values[key] = value
	if tuning.values().has(key):   # 研究の切り替えは tuning.gd へ（色の移り・にじみ・ベイク・影の縁）
		tuning.set_value(key, _param_values[key])
		apply_tuning()
	elif world != null and not world.spec.is_empty():
		_apply_light(_current_view_light())
	if tuning_panel != null and tuning_panel.has_method("refresh_values"):
		tuning_panel.refresh_values()
	print("TUNE_SET ", key, "=", _param_values[key])


func _param(key: String, use_default := false):
	var item: Dictionary = TUNING_PARAMS.find(key)
	return item.default if use_default else _param_values.get(key, item.default)


func _param_ratio(key: String, use_default := false) -> float:
	var item: Dictionary = TUNING_PARAMS.find(key)
	return float(_param(key, use_default)) / float(item.default)


func _current_view_light() -> Dictionary:
	var view_key: String = view_name.split("@")[0]
	var views_d: Dictionary = world.spec.get("views", {})
	return views_d.get(view_key, {}).get("light", {})


func _apply_command_values() -> void:
	if not args.has("set"):
		return
	for pair in String(args["set"]).split("&"):
		var parts := pair.split("=", true, 1)
		if parts.size() != 2:
			continue
		var item: Dictionary = TUNING_PARAMS.find(parts[0])
		if item.is_empty():
			continue
		var value = parts[1]
		if item.kind == "slider":
			value = float(value)
		elif item.kind == "toggle":
			value = value.to_lower() in ["1", "true", "on"]
		set_param(parts[0], value)


func set_hold(kind: String) -> void:
	hold_kind = kind if kind in ["ref", "default"] else ""
	if world != null and not world.spec.is_empty():
		_apply_light(_current_view_light())
		apply_tuning()
	if tuning_panel != null and tuning_panel.has_method("set_hold_state"):
		tuning_panel.set_hold_state(hold_kind)


## ビューを撮って PNG に書き、終わる（tools/worldart/godot/run.sh・port_check.py）
func _shoot(names: PackedStringArray, out: String) -> void:
	DirAccess.make_dir_recursive_absolute(out)
	if menu != null and "visible" in menu: menu.visible = false
	for n in names:
		set_view(n)
		marker.visible = false
		for i in 4:
			await RenderingServer.frame_post_draw
		var file := "%s/%s.png" % [out, n.replace("@", "_")]
		get_viewport().get_texture().get_image().save_png(file)
		print("SHOT ", file)
	get_tree().quit()
