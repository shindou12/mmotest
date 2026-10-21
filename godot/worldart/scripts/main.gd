extends Node3D
## 地図を見る（L26、goal-worldart-port で全地図・全ビューに）。world.js の歩く・ビュー・仕上げと同じ。
## 操作: WASD・矢印 注目点を動かす、Q / E 向き、マウスのホイール 距離、M 地図とビューを選ぶ画面（scripts/viewer_menu.gd があれば）。
## カメラは地図の camera か views（見本の基準カメラ。ビューごとの光の上書き light: sun・hemi・exposure・sat・vignette・topDark）か、
## 標準ビュー（oblique・side・top・walker・near・far。基準ビューの注目点のまわりに置く、world.js の STD_VIEWS）。
## ゲームの遊びの形（地図の JSON の game）があれば、輪郭の外と当たり判定のある木・岩には入らない（出口は通れる）。
## 起動の引数（-- の後）: --map=<地図> --view=<ビュー>[@<基準>] --shot=<ビュー,...> --out=<絶対パス>（撮って終わる）--post=0 --dof=0

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


func _ready() -> void:
	args = _args()
	cam.near = 0.3
	cam.far = 600.0
	add_child(cam)
	pm.shader = preload("res://shaders/post.gdshader")
	pm.render_priority = 100
	var q := QuadMesh.new()
	q.size = Vector2(2, 2)
	post.mesh = q
	post.material_override = pm
	post.extra_cull_margin = 16384
	post.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cam.add_child(post)
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
	if args.has("shot"):
		_shoot(String(args["shot"]).split(","), String(args.get("out", "user://shots")))


func _args() -> Dictionary:
	var d := {}
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			d[kv[0]] = kv[1] if kv.size() > 1 else "1"
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
	pm.set_shader_parameter("tone", 1 if String(spec.get("tone", "aces")) == "aces" else 0)
	pm.set_shader_parameter("exposure", float(P.get("exposure", 1.0)))
	pm.set_shader_parameter("sat", float(P.get("sat", 1.0)))
	pm.set_shader_parameter("contrast", float(P.get("contrast", 1.0)))
	pm.set_shader_parameter("lift", _v3(P.get("lift", [0, 0, 0])))
	pm.set_shader_parameter("gain", _v3(P.get("gain", [1, 1, 1])))
	pm.set_shader_parameter("dof_amt", float(P.get("dof", 1.0)))
	pm.set_shader_parameter("dof_top", float(P.get("dofTop", 0.30)))
	pm.set_shader_parameter("dof_bot", float(P.get("dofBot", 0.80)))
	var hz = P.get("haze", [0.8, 0.86, 0.9, 0.0])
	pm.set_shader_parameter("haze", Vector4(hz[0], hz[1], hz[2], hz[3]))
	pm.set_shader_parameter("enabled", args.get("post", "1") != "0")
	pm.set_shader_parameter("dof_on", args.get("dof", "1") != "0")
	get_viewport().msaa_3d = Viewport.MSAA_4X if int(P.get("msaa", 0)) > 0 else Viewport.MSAA_DISABLED   # 第 2 世代は MSAA なし
	light0 = {"sun": world.sun.light_energy, "hemi": float(spec.get("sky", {}).get("intensity", 0.6)), "exposure": float(P.get("exposure", 1.0)), "sat": float(P.get("sat", 1.0))}
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
	if menu != null and menu.has_method("refresh"): menu.refresh()


func _v3(a) -> Vector3:
	return Vector3(a[0], a[1], a[2])


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


## world.js applyLight: 地図の光に掛ける（sun・hemi・exposure・sat）と、仕上げの周辺減光・上の暗がり
func _apply_light(L: Dictionary) -> void:
	world.sun.light_energy = float(light0["sun"]) * float(L.get("sun", 1.0))
	RenderingServer.global_shader_parameter_set("wa_hemi_int", float(light0["hemi"]) * float(L.get("hemi", 1.0)))
	pm.set_shader_parameter("exposure", float(light0["exposure"]) * float(L.get("exposure", 1.0)))
	pm.set_shader_parameter("sat", float(light0["sat"]) * float(L.get("sat", 1.0)))
	pm.set_shader_parameter("vignette", float(L.get("vignette", 0.0)))
	pm.set_shader_parameter("top_dark", float(L.get("topDark", 0.0)))


func _place() -> void:
	var y := deg_to_rad(yaw)
	var p := deg_to_rad(pitch)
	var tgt := target + Vector3(0, ty, 0)
	cam.position = tgt + Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * dist
	cam.look_at(tgt, Vector3.UP)
	marker.position = target + Vector3(0, 0.85, 0)
	marker.visible = args.has("marker")


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
	if ev is InputEventMouseButton and ev.pressed:
		if ev.button_index == MOUSE_BUTTON_WHEEL_UP: dist = max(3.0, dist * 0.9); _place()
		elif ev.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = min(80.0, dist / 0.9); _place()


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
