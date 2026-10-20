extends Node3D
## 歩いて見る（L26）: 注目点を WASD・矢印キーで動かし、カメラが付いていく。Q / E で向き、マウスのホイールで距離。
## カメラは地図の camera（第 3 世代: 俯角 45°・縦の画角 18°・距離 33m）。仕上げは画面全体の板（shaders/post.gdshader）。
## ゲームの遊びの形（地図の JSON の game）があれば、輪郭の外と当たり判定のある木・岩には入らない（出口は通れる）。
## 撮影: godot --path godot/worldart -- --shot=F01,F02 --out=<フォルダ>（scripts の README は godot/worldart/README.md）

@onready var world: Node3D = $World
var cam := Camera3D.new()
var post := MeshInstance3D.new()
var marker := MeshInstance3D.new()
var target := Vector3.ZERO
var yaw := 0.0
var pitch := 45.0
var dist := 33.0
var outline := PackedVector2Array()
var solids := []
var exits := []


func _ready() -> void:
	var spec: Dictionary = world.spec
	var C: Dictionary = spec["camera"]
	cam.fov = float(C["fov"])
	cam.near = 0.3
	cam.far = 600.0
	add_child(cam)
	yaw = float(C["yaw"]); pitch = float(C["pitch"]); dist = float(C["dist"])
	target = Vector3(C["target"][0], 0, C["target"][2])
	# 仕上げの板（カメラの前の、画面全体を覆う四角）
	var P: Dictionary = spec.get("post", {})
	var pm := ShaderMaterial.new()
	pm.shader = preload("res://shaders/post.gdshader")
	pm.set_shader_parameter("exposure", float(P.get("exposure", 1.0)))
	pm.set_shader_parameter("sat", float(P.get("sat", 1.0)))
	pm.set_shader_parameter("dof_amt", float(P.get("dof", 1.0)))
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
	# 遊びの形
	var g: Dictionary = spec.get("game", {})
	for p in g.get("outline", []):
		outline.append(Vector2(p[0], p[1]))
	for o in g.get("obstacles", []):
		if o.get("solid", false):
			solids.append(Vector3(o["x"], o["z"], o["r"]))
	for e in g.get("exits", []):
		exits.append(Vector2(e["x"], e["z"]))
	await get_tree().physics_frame
	await get_tree().physics_frame
	_place()
	var args := _args()
	if args.has("shot"):
		_shoot(String(args["shot"]).split(","), String(args.get("out", "user://shots")))


func _args() -> Dictionary:
	var d := {}
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--") and a.contains("="):
			var kv := a.substr(2).split("=", true, 1)
			d[kv[0]] = kv[1]
	return d


func _place() -> void:
	target.y = world.ground_y(target.x, target.z)
	var y := deg_to_rad(yaw)
	var p := deg_to_rad(pitch)
	cam.position = target + Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * dist
	cam.look_at(target, Vector3.UP)
	marker.position = target + Vector3(0, 0.85, 0)


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
	if v.length_squared() > 0.0 or turn != 0.0:
		_place()


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and ev.pressed:
		if ev.button_index == MOUSE_BUTTON_WHEEL_UP: dist = max(3.0, dist * 0.9); _place()
		elif ev.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = min(80.0, dist / 0.9); _place()


## 地図の views（固定ビュー）を撮って PNG に書き、終わる
func _shoot(names: PackedStringArray, out: String) -> void:
	DirAccess.make_dir_recursive_absolute(out)
	var views: Dictionary = world.spec.get("views", {})
	for n in names:
		var V: Dictionary = views[n]
		target = Vector3(V["target"][0], 0, V["target"][2])
		yaw = float(V["yaw"]); pitch = float(V["pitch"]); dist = float(V["dist"]); cam.fov = float(V["fov"])
		marker.visible = false
		_place()
		for i in 4:
			await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out, n])
		print("SHOT ", out, "/", n, ".png")
	get_tree().quit()
