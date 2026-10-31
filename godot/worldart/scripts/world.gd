@tool
extends Node3D
## ワールドアートの地図を組み立てる（L26）。data/<map_name>/ の地形・配置と、地図の JSON の光・地面の値を使う。
## エディタでも開いた時点で組み立てる（@tool）。地図を変えたら map_name を変えるか「rebuild」を押す。
## three.js（public/worldart/world.js）と同じにしてあるもの: 太陽（向き・色・強さ）、空の光（半球光）、地面と葉・草の材質、配置。
## 仕上げ（露出・彩度・上下のぼかし）とカメラは scripts/main.gd。

@export var map_name := "f1_field":
	set(v):
		map_name = v
		if is_inside_tree(): build()
@export var rebuild := false:
	set(v):
		if v and is_inside_tree(): build()

var spec: Dictionary
var placed: Dictionary
var terrain_mesh: MeshInstance3D
var ground_material: ShaderMaterial
var skyvis_available := false
var sun: DirectionalLight3D
var env: WorldEnvironment
var weather_effect: Node3D
var world_time := 0.0
var door_target_open := false
var lever_sticks: Array[Node3D] = []
var pressure_plates: Array[MeshInstance3D] = []
var pressure_plate_materials: Array[ShaderMaterial] = []
var pressure_plate_states: Array = []

const SH_GROUND := preload("res://shaders/ground.gdshader")
const SH_FOLIAGE := preload("res://shaders/foliage.gdshader")
const SH_LAMBERT := preload("res://shaders/lambert.gdshader")
const SH_ROCK := preload("res://shaders/rock.gdshader")
const WW := preload("res://scripts/water.gd")
const WX := preload("res://scripts/weather.gd")
const GRID_BOSS_ACCENT_FALLBACK := {1: "#ffcc33", 2: "#9cff7a", 3: "#ff6a2a"} # public/shared/data.js の FLOORS[].boss.accent。export_gamedata.mjs は省略する。


@export var auto_build := true   ## ゲーム（scripts/game/game.gd）は false にして load_area で組み立てる


## 太陽の色×強さと向きをシェーダーの全体の値に（水面 w1 が地面の材質の中で太陽の光を計算する。ビューの光の上書きも拾う）
func _process(dt: float) -> void:
	world_time += dt
	if sun != null and is_instance_valid(sun) and sun.is_inside_tree():
		var c := sun.light_color.srgb_to_linear() * (sun.light_energy * PI)   # three の色 × 強さ
		RenderingServer.global_shader_parameter_set("wa_sun_col", Vector3(c.r, c.g, c.b))
		RenderingServer.global_shader_parameter_set("wa_sun_dir", sun.global_transform.basis.z)
	for door in door_nodes:
		if not is_instance_valid(door): continue
		var rest_y := float(door.get_meta("grid_rest_y", door.position.y))
		var target_y := rest_y - 3.4 if door_target_open else rest_y
		door.position.y += (target_y - door.position.y) * minf(1.0, dt * 3.0)
		door.visible = door.position.y > rest_y - 3.3
	for stick in lever_sticks:
		if is_instance_valid(stick):
			var target_rotation := -0.6 if door_target_open else 0.6
			stick.rotation.z += (target_rotation - stick.rotation.z) * minf(1.0, dt * 6.0)
	for i in pressure_plate_materials.size():
		var intensity := 1.6 + sin(world_time * 8.0) * 0.4 if i < pressure_plate_states.size() and bool(pressure_plate_states[i]) else 0.0
		var emission := (Color("40c0ff").srgb_to_linear() * intensity).linear_to_srgb()
		pressure_plate_materials[i].set_shader_parameter("emission_col", emission)


func _ready() -> void:
	if auto_build or Engine.is_editor_hint(): build()   # エディタでは開いた時点で組み立てて見せる


## ゲームのエリアを組み立てる（L27）。data/<id>/map.json があれば第 3 世代の地図、なければ仮の地面（ゲームの輪郭・当たり判定の形だけ）
func load_area(id: String) -> void:
	_clear_weather()
	if FileAccess.file_exists("res://data/%s/map.json" % id):
		ToonLook.set_light(ToonLook.DEFAULT_LIGHT)
		map_name = id
		if not is_inside_tree() or not auto_build: build()
		_install_weather(id, GameRules.area(id), false)
		return
	for c in get_children():
		remove_child(c)
		c.free()
	spec = _json("res://data/f1_field/map.json")   # 光・階調は第 3 世代の雛形と同じ値（f1_field の地図から借りる）
	placed = {}
	_set_globals()
	_build_light()
	var ar := GameRules.area(id)
	if _build_legacy(id, ar):
		_install_weather(id, ar, true)
		return
	if ar["shape"] == "grid": _build_grid(ar)
	else: _build_fallback(ar)
	_install_weather(id, ar, false)


func _clear_weather() -> void:
	if weather_effect != null and is_instance_valid(weather_effect):
		if weather_effect.get_parent() == self: remove_child(weather_effect)
		weather_effect.free()
	weather_effect = null


func _install_weather(id: String, ar: Dictionary, legacy_baked: bool) -> void:
	var raw: Variant = ar.get("weather", null)
	if raw == null: return
	weather_effect = WX.new()
	weather_effect.name = "Weather"
	add_child(weather_effect)
	weather_effect.configure(id, String(raw), env.environment if env != null else null, legacy_baked)


var door_nodes: Array = []


## buildArea（open.js / grid.js）の GLB。open の当たり高さはブラウザの地面メッシュから取る。
func _build_legacy(id: String, ar: Dictionary) -> bool:
	var path := "res://data/legacy/%s.glb" % id
	if not FileAccess.file_exists(path): return false
	var index_path := "res://data/legacy/index.json"
	var index: Dictionary = _json(index_path) if FileAccess.file_exists(index_path) else {}
	var entry: Dictionary = index.get("areas", {}).get(id, {})
	var light: Dictionary = entry.get("light", {})
	if not light.is_empty():
		# 正本は public/shared/data.js FLOORS と public/js/env.js buildArea の light。
		# sun_dir=(20,40,10)、色・sun_i・hemi・fog は export_areas.mjs が index.json に書き出す。
		var sun_dir := _v3(light.get("sun_dir", [20, 40, 10]))
		var sun_color := Color.html(String(light.get("sun_color", "#fff1d6")))
		var sun_i := float(light.get("sun_i", 2.2))
		ToonLook.set_light({
			"sun_dir": sun_dir,
			"sun_color": sun_color,
			"sun_i": sun_i,
			"sky": Color.html(String(light.get("sky", "#cfe8ff"))),
			"ground": Color.html(String(light.get("ground", "#3a5a2a"))),
			"hemi_i": float(light.get("hemi_i", 1.1)),
			# 既存の旧エリア ToonLook 値。ゲームの post.gdshader はエリアの exposure=1.25 を使う。
			"aces": true, "exposure": 0.75, "outline_scale": 1.0,
		})
		# render.js の太陽方向・色・影を Godot Light3D にも入れる。
		# Godot の light() は LIGHT_COLOR=color×energy×PI なので、energy=sun_i/PI で Three.js の強さを保つ。
		if sun != null:
			sun.light_color = sun_color
			sun.light_energy = sun_i / PI
			if sun_dir.length_squared() > 0.0:
				sun.basis = Basis.looking_at(-sun_dir.normalized(), Vector3.UP if absf(sun_dir.y) < sun_dir.length() * 0.99 else Vector3.FORWARD)
			# public/js/game/render.js: castShadow=true, PCFSoftShadowMap、2048²、±30、near=1/far=120、bias=-0.0005。
			# Three.js は normalBias 未指定。共通の normal_bias=1.0 は影が浮きやすいため 0 にする。
			sun.shadow_enabled = true
			sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
			sun.directional_shadow_max_distance = 60.0
			sun.directional_shadow_split_1 = 0.5
			sun.shadow_bias = 0.03
			sun.shadow_normal_bias = 0.0
			sun.shadow_blur = 1.0
		if env != null and env.environment != null:
			var environment: Environment = env.environment
			environment.background_color = Color.html(String(light.get("sky_bot", "#d8f0ff")))
			environment.fog_enabled = true
			environment.fog_mode = Environment.FOG_MODE_DEPTH
			environment.fog_light_color = Color.html(String(light.get("fog", "#bfe3ff")))
			environment.fog_light_energy = 1.0
			environment.fog_depth_begin = float(light.get("fog_near", 40.0))
			environment.fog_depth_end = float(light.get("fog_far", 140.0))
			environment.fog_depth_curve = 1.0
			environment.fog_sky_affect = 1.0
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_file(path, state)
	if err != OK:
		push_error("legacy GLB を読めません: %s (%s)" % [id, error_string(err)])
		return false
	var scene := doc.generate_scene(state)
	if scene == null:
		push_error("legacy GLB の scene を作れません: %s" % id)
		return false
	scene.name = "LegacyArea"
	# Godot 4.3 は glTF extras を Node の meta に取り込まないため、末尾の __cs0 / __cs1 を読む。
	# 先に名前を元へ戻し、LegacyGround・LegacyDoor など既存の検索名を保つ。
	var shadow_count := 0
	var tagged_meshes := 0
	var tag_re := RegEx.new()
	tag_re.compile("__cs([01])[0-9]*$")  # Godot は同名ノードの末尾に連番を足すため、連番つきも読む
	for n in scene.find_children("*", "MeshInstance3D", true, false):
		var mesh_node := n as MeshInstance3D
		var m := tag_re.search(String(mesh_node.name))
		if m == null:
			continue
		var on := m.get_string(1) == "1"
		mesh_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mesh_node.name = String(mesh_node.name).substr(0, m.get_start())
		if on:
			shadow_count += 1
		tagged_meshes += 1
	var total_meshes := scene.find_children("*", "MeshInstance3D", true, false).size()
	if tagged_meshes != total_meshes:
		push_error("legacy GLB の影タグ数が合いません: %s (%d/%d)" % [id, tagged_meshes, total_meshes])
	var browser_shadow_count := int(entry.get("cast_shadow_meshes", -1))
	print("LEGACY_SHADOWS %s: Godot=%d Browser=%d" % [id, shadow_count, browser_shadow_count])
	if browser_shadow_count >= 0 and shadow_count != browser_shadow_count:
		push_error("legacy GLB の影を落とす Mesh 数が合いません: %s (%d/%d)" % [id, shadow_count, browser_shadow_count])
	add_child(scene)
	ToonLook.convert(scene, Color("448a9b"), true)
	door_nodes.clear()
	for n in scene.find_children("LegacyDoor", "Node3D", true, false): door_nodes.append(n)
	lever_sticks.clear(); pressure_plates.clear(); pressure_plate_materials.clear(); pressure_plate_states.clear()
	if ar["shape"] == "grid": _build_legacy_grid_details(id, ar, scene)
	if ar["shape"] == "grid":
		# Grid の buildGrid の床面上端は y=0。扉・レバー・板・宝箱の判定は従来の area データを使う。
		var body := StaticBody3D.new()
		body.name = "LegacyGridFloorCollision"
		var cs := CollisionShape3D.new()
		cs.shape = WorldBoundaryShape3D.new()
		body.add_child(cs)
		add_child(body)
	else:
		# makeHeight と同じ高さの頂点を持つ LegacyGround 自体から歩行・出口表示の高さを取る。
		var ground := scene.find_child("LegacyGround", true, false) as MeshInstance3D
		if ground != null: ground.create_trimesh_collision()
		else: push_error("legacy GLB に LegacyGround がありません: %s" % id)
	return true


## grid.js の扉・レバー・感圧板・罠床を、従来 GLB の上に組み立てる。
func _build_legacy_grid_details(id: String, ar: Dictionary, legacy_scene: Node) -> void:
	var points: Dictionary = ar.get("pts", {})
	var cell := float(ar.get("cell", 4.0))
	var floor_n := int(ar["floor"])
	# public/js/env/grid.js は fdef.boss.accent を使う。data/game.json に出ないため JS の階層値を使う。
	var accent := Color.html(String(GRID_BOSS_ACCENT_FALLBACK.get(floor_n, "#ffcc33")))
	world_time = 0.0
	door_target_open = false
	var doors: Array = points.get("D", [])
	if not doors.is_empty():
		for old_door in door_nodes:
			if is_instance_valid(old_door): old_door.visible = false
		door_nodes.clear()
		var door_bar := Color("5a5a64")
		for d in doors:
			var gate := Node3D.new()
			gate.name = "GridDoor"
			gate.position = Vector3(float(d.x), 0.0, float(d.z))
			for k in 6:
				var post := CylinderMesh.new(); post.top_radius = 0.1; post.bottom_radius = 0.1; post.height = 3.2; post.radial_segments = 6
				var post_node := _grid_detail_mesh(gate, post, "gate_post_%d" % k, door_bar)
				post_node.position = Vector3(-1.6 + k * 0.64, 1.6, 0.0)
			for y in [2.9, 0.5]:
				var bar := BoxMesh.new(); bar.size = Vector3(cell, 0.3, 0.3)
				var bar_node := _grid_detail_mesh(gate, bar, "gate_bar_%d" % int(y * 10.0), door_bar)
				bar_node.position = Vector3(0.0, y, 0.0)
			var seal := _grid_circle_mesh(0.6, 24)
			var seal_node := _grid_detail_mesh(gate, seal, "gate_seal", (accent.srgb_to_linear() * 1.4).linear_to_srgb(), true, true)
			seal_node.position = Vector3(0.0, 1.6, 0.2)
			ToonLook.convert(gate)
			add_child(gate)
			gate.set_meta("grid_rest_y", gate.position.y)
			door_nodes.append(gate)
	for p in points.get("L", []):
		var lever := Node3D.new(); lever.name = "GridLever"; lever.position = Vector3(float(p.x), 0.0, float(p.z))
		var base_found := false
		for candidate in legacy_scene.find_children("*", "MeshInstance3D", true, false):
			var existing_base := candidate as MeshInstance3D
			if existing_base.mesh == null or not existing_base.mesh.get_aabb().size.is_equal_approx(Vector3(1.2, 0.6, 0.8)): continue
			if existing_base.global_position.distance_to(Vector3(float(p.x), 0.3, float(p.z))) < 0.05:
				base_found = true
				break
		if not base_found:
			var base := BoxMesh.new(); base.size = Vector3(1.2, 0.6, 0.8)
			var new_base := _grid_detail_mesh(lever, base, "lever_base", Color("6a6a74")); new_base.position.y = 0.3
		var stick := Node3D.new(); stick.name = "LeverStick"; stick.position.y = 0.6; lever.add_child(stick); stick.rotation.z = 0.6
		var shaft := CylinderMesh.new(); shaft.top_radius = 0.07; shaft.bottom_radius = 0.07; shaft.height = 1.3; shaft.radial_segments = 8
		var shaft_node := _grid_detail_mesh(stick, shaft, "lever_shaft", Color("8a6a4a")); shaft_node.position.y = 0.65
		var knob := SphereMesh.new(); knob.radius = 0.16; knob.height = 0.32; knob.radial_segments = 10; knob.rings = 8
		var knob_node := _grid_detail_mesh(stick, knob, "lever_knob", Color("d04a3a")); knob_node.position.y = 1.3
		ToonLook.convert(lever); add_child(lever); lever_sticks.append(stick)
		var title := GameVisuals.label("レバー", Color("ffd27a")); title.font_size = 44; title.pixel_size = 3.0 / 512.0; title.outline_modulate = Color(0.0, 0.0, 0.0, 0.85); title.position = Vector3(float(p.x), 2.94, float(p.z)); add_child(title)
		var prompt := GameVisuals.label("[F] 引く", Color.WHITE); prompt.font_size = 30; prompt.pixel_size = 3.0 / 512.0; prompt.outline_modulate = Color(0.0, 0.0, 0.0, 0.85); prompt.position = Vector3(float(p.x), 2.60, float(p.z)); add_child(prompt)
	var plate_nodes := legacy_scene.find_children("LegacyPlate_*", "MeshInstance3D", true, false)
	plate_nodes.sort_custom(func(a: Node, b: Node) -> bool: return String(a.name) < String(b.name))
	var plate_points: Array = points.get("P", [])
	for i in plate_points.size():
		var p: Dictionary = plate_points[i]
		var plate: MeshInstance3D
		if i < plate_nodes.size():
			plate = plate_nodes[i] as MeshInstance3D
		else:
			var plate_holder := Node3D.new()
			plate_holder.name = "PressurePlate_%d" % i
			var plate_mesh := CylinderMesh.new(); plate_mesh.top_radius = 1.4; plate_mesh.bottom_radius = 1.5; plate_mesh.height = 0.15; plate_mesh.radial_segments = 24
			plate = _grid_detail_mesh(plate_holder, plate_mesh, "PressurePlate", Color("8a8aa0"), false, false)
			plate.position = Vector3(float(p.x), 0.08, float(p.z))
			add_child(plate_holder); ToonLook.convert(plate_holder)
		var source_material := plate.get_active_material(0) as ShaderMaterial
		if source_material != null:
			var unique_material := source_material.duplicate() as ShaderMaterial
			plate.set_surface_override_material(0, unique_material)
			pressure_plate_materials.append(unique_material)
		pressure_plates.append(plate); pressure_plate_states.append(false)
		for old_label in legacy_scene.find_children("AreaLabel", "MeshInstance3D", true, false):
			var label_node := old_label as MeshInstance3D
			if Vector2(label_node.global_position.x - float(p.x), label_node.global_position.z - float(p.z)).length() < 0.05 and absf(label_node.global_position.y - 2.2) < 0.05:
				label_node.visible = false
		var caption := GameVisuals.label("感圧板", Color("9ae8ff")); caption.font_size = 44; caption.pixel_size = 3.0 / 512.0; caption.outline_modulate = Color(0.0, 0.0, 0.0, 0.85); caption.position = Vector3(float(p.x), 2.2, float(p.z)); add_child(caption)
	if not pressure_plates.is_empty(): set_pressure_plates([])


func _grid_detail_mesh(parent: Node, mesh: Mesh, name: String, color: Color, glow := false, outline := true) -> MeshInstance3D:
	var material := StandardMaterial3D.new(); material.albedo_color = color
	if glow: material.resource_name = "glow"
	var display_mesh := mesh
	if mesh is PrimitiveMesh:
		# CylinderMesh / BoxMesh も ToonLook が扱える ArrayMesh にする。
		var array_mesh := ArrayMesh.new()
		array_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, (mesh as PrimitiveMesh).get_mesh_arrays())
		display_mesh = array_mesh
	var node := MeshInstance3D.new(); node.name = ("ow100_" if outline else "") + name; node.mesh = display_mesh; node.material_override = material; parent.add_child(node)
	return node


func _grid_circle_mesh(radius: float, segments: int) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in segments:
		var a0 := TAU * i / segments
		var a1 := TAU * (i + 1) / segments
		surface.set_normal(Vector3(0.0, 0.0, 1.0))
		surface.add_vertex(Vector3.ZERO)
		surface.set_normal(Vector3(0.0, 0.0, 1.0))
		surface.add_vertex(Vector3(cos(a0) * radius, sin(a0) * radius, 0.0))
		surface.set_normal(Vector3(0.0, 0.0, 1.0))
		surface.add_vertex(Vector3(cos(a1) * radius, sin(a1) * radius, 0.0))
	return surface.commit()


func set_pressure_plates(states: Array) -> void:
	pressure_plate_states = states.duplicate()


## 仮の屋内（マス目）: 床、壁の箱（MultiMesh）、扉（開くと消える）、レバー・感圧板・宝箱・ボス部屋の印
func _build_grid(ar: Dictionary) -> void:
	var CELL := float(ar["cell"]); var W := int(ar["W"]); var H := int(ar["H"])
	var floor_m := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(W * CELL, H * CELL)
	var fm := GameVisuals.mat(Color(0.42, 0.36, 0.3)); pm.material = fm; floor_m.mesh = pm
	add_child(floor_m)
	var body := StaticBody3D.new(); var cs := CollisionShape3D.new(); cs.shape = WorldBoundaryShape3D.new(); body.add_child(cs); add_child(body)
	var walls := []
	door_nodes.clear()
	var wall_m := GameVisuals.mat(Color(0.36, 0.33, 0.3))
	var door_m := GameVisuals.mat(Color(0.45, 0.3, 0.18))
	for r in H:
		var row := String(ar["rows"][r])
		for c in W:
			var ch := row[c]
			var x := (c - W / 2.0 + 0.5) * CELL; var z := (r - H / 2.0 + 0.5) * CELL
			if ch == "#":
				# 床に面した壁だけ置く（中の詰まった壁は省く）
				var edge := false
				for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
					var rr: int = r + d[1]; var cc: int = c + d[0]
					if rr >= 0 and cc >= 0 and rr < H and cc < W and String(ar["rows"][rr])[cc] != "#": edge = true
				if edge: walls.append(Vector3(x, 0, z))
			elif ch == "D":
				var dm := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(CELL, 3.2, CELL * 0.4); bm.material = door_m
				dm.mesh = bm; dm.position = Vector3(x, 1.6, z); add_child(dm); door_nodes.append(dm)
			elif ch in ["L", "P", "C", "B"]:
				var mk := MeshInstance3D.new(); var mm := BoxMesh.new()
				var col: Color = {"L": Color(0.9, 0.8, 0.3), "P": Color(0.6, 0.6, 0.65), "C": Color(0.75, 0.55, 0.25), "B": Color(0.8, 0.2, 0.2)}[ch]
				mm.size = Vector3(1.0, 1.2, 1.0) if ch == "L" else (Vector3(2.4, 0.1, 2.4) if ch == "P" else (Vector3(1.0, 0.7, 0.7) if ch == "C" else Vector3(1.2, 0.05, 1.2)))
				var m := GameVisuals.mat(col); mm.material = m
				mk.mesh = mm; mk.position = Vector3(x, mm.size.y / 2.0, z); add_child(mk)
	var mmw := MultiMesh.new(); mmw.transform_format = MultiMesh.TRANSFORM_3D
	var wb := BoxMesh.new(); wb.size = Vector3(CELL, 3.6, CELL); wb.material = wall_m
	mmw.mesh = wb; mmw.instance_count = walls.size()
	for i in walls.size(): mmw.set_instance_transform(i, Transform3D(Basis(), walls[i] + Vector3(0, 1.8, 0)))
	var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mmw; add_child(mmi)


func set_door_open(open: bool) -> void:
	door_target_open = open


## 仮の地面: 階層の地面の色の平面、輪郭の外の低い壁（灰色の岩の列）、当たり判定のある木・岩・建物を単純な形で
func _build_fallback(ar: Dictionary) -> void:
	var F: Dictionary = GameRules.data()["floors"][int(ar["floor"]) - 1]
	var size := float(ar.get("maxR", 60.0)) * 2.0 + 60.0
	var plane := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(size, size)
	var mat := GameVisuals.mat(Color.html(F["ground2"]))
	pm.material = mat; plane.mesh = pm; plane.name = "Ground"
	add_child(plane)
	var body := StaticBody3D.new(); var cs := CollisionShape3D.new(); var ws := WorldBoundaryShape3D.new()
	cs.shape = ws; body.add_child(cs); add_child(body)
	var rock := GameVisuals.mat(Color(0.45, 0.46, 0.42))
	var ol: Array = ar.get("outline", [])
	for i in range(0, ol.size(), 4):   # 輪郭の外に 4° ごとの岩
		var p := Vector2(ol[i][0], ol[i][1]); var p2 := p * (1.0 + 2.5 / maxf(p.length(), 1.0))
		var near_exit := false
		for e in ar["exits"]:
			if p.distance_to(Vector2(e["x"], e["z"])) < 6.0: near_exit = true
		if near_exit: continue
		var m := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 1.6; sm.height = 3.0; sm.material = rock
		m.mesh = sm; m.position = Vector3(p2.x, 0.6, p2.y); add_child(m)
	var tree := GameVisuals.mat(Color(0.25, 0.45, 0.2))
	for o in ar.get("obstacles", []):
		if not o["solid"]: continue
		var m := MeshInstance3D.new()
		if o.has("box"):
			var bm := BoxMesh.new(); var b: Dictionary = o["box"]
			bm.size = Vector3(b["w"], 4.0, b["d"]); bm.material = rock; m.mesh = bm
			m.position = Vector3(b["x"], 2.0, b["z"]); m.rotation.y = float(b["ry"])   # town-layout.js inBox と同じ回転
		else:
			var sm := SphereMesh.new(); sm.radius = float(o["r"]); sm.height = float(o["r"]) * (2.6 if o["kind"] == "tree" else 1.4)
			sm.material = tree if o["kind"] == "tree" else rock; m.mesh = sm
			m.position = Vector3(o["x"], sm.height * 0.45, o["z"])
		add_child(m)


func _json(path: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(path))


func _lin(hex: String) -> Vector3:
	var c := Color.html(hex).srgb_to_linear()   # three の Color('#...') と同じ（sRGB → 線形）
	return Vector3(c.r, c.g, c.b)


func _v3(a, d := [1, 1, 1]) -> Vector3:
	var x = a if a != null else d
	return Vector3(x[0], x[1], x[2])


func _tex(name: String) -> Texture2D:
	return load("res://data/tex/%s.png" % name)


func build() -> void:
	for c in get_children():
		remove_child(c)
		c.free()
	spec = _json("res://data/%s/map.json" % map_name)
	placed = _json("res://data/%s/placements.json" % map_name)
	_set_globals()
	_build_light()
	_build_terrain()
	_build_splat()
	_build_assets()


# ---------------------------------------------------------------- 規則の値（地図の JSON）→ シェーダーの全体の値
func _set_globals() -> void:
	var G: Dictionary = spec.get("ground", {})
	var F: Dictionary = spec.get("foliage", {})
	var S: Dictionary = spec.get("sky", {})
	var rs := RenderingServer
	rs.global_shader_parameter_set("wa_hemi_sky", _lin(S.get("light", S.get("color", "#cfe0ee"))))
	rs.global_shader_parameter_set("wa_hemi_ground", _lin(S.get("ground", "#4a5a2a")))
	rs.global_shader_parameter_set("wa_hemi_int", float(S.get("intensity", 0.6)))
	rs.global_shader_parameter_set("wa_albedo_sat", float(spec.get("albedoSat", 1.0)))
	rs.global_shader_parameter_set("wa_leaf_sat", float(F.get("sat", spec.get("albedoSat", 1.0))))
	rs.global_shader_parameter_set("wa_leaf_tint", _v3(F.get("tint")))
	rs.global_shader_parameter_set("wa_wrap", float(F.get("wrap", 0.0)))
	rs.global_shader_parameter_set("wa_grass_tint", _v3(G.get("grassTint")))
	rs.global_shader_parameter_set("wa_dirt_tint", _v3(G.get("dirtTint")))
	rs.global_shader_parameter_set("wa_alt_tint", _v3(G.get("altTint")))
	rs.global_shader_parameter_set("wa_rock_tint", _v3(G.get("rockTint")))
	rs.global_shader_parameter_set("wa_lush_tint", _v3(G.get("lushTint")))
	rs.global_shader_parameter_set("wa_lush_amt", float(G.get("lushAmt", 0.0)))
	rs.global_shader_parameter_set("wa_lush_bias", float(G.get("lushBias", 0.0)))
	rs.global_shader_parameter_set("wa_tuft_tint", _v3(G.get("tuftTint")))
	rs.global_shader_parameter_set("wa_alt_scale", float(G.get("altScale", 6.0)))
	var rk: String = G.get("rock", "")
	rs.global_shader_parameter_set("wa_rock_scale", 1.6 if rk == "crack" else 4.5)
	rs.global_shader_parameter_set("wa_rock_pix", 1.0 if G.get("rockPix", false) else 0.0)
	rs.global_shader_parameter_set("wa_gb_on", 1.0 if F.get("groundBlend", false) else 0.0)
	rs.global_shader_parameter_set("wa_leaf_lift", float(F.get("lift", 0.0)))
	rs.global_shader_parameter_set("wa_leaf_trans", float(F.get("trans", 0.0)))
	rs.global_shader_parameter_set("wa_leaf_recv", 1.0 if F.get("receiveShadow", true) else 0.0)
	var msaa := int(spec.get("post", {}).get("msaa", 0))
	rs.global_shader_parameter_set("wa_alpha_cut", 0.25 if msaa > 0 else 0.5)
	var W = spec.get("terrain", {}).get("water")
	rs.global_shader_parameter_set("wa_water", Vector2(float(W["level"]), 2.0 if String(W.get("rule", "")) == "w1" else 1.0) if W is Dictionary else Vector2.ZERO)   # y: 1 = 第 2 世代、2 = 水の規則 w1


# ---------------------------------------------------------------- 太陽と環境
func _build_light() -> void:
	var S: Dictionary = spec["sun"]
	var az := deg_to_rad(float(S["azimuth"]))
	var el := deg_to_rad(float(S["elevation"]))
	var to_sun := Vector3(sin(az) * cos(el), sin(el), cos(az) * cos(el))   # three の sunDir（太陽の方へ）
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = Color.html(S.get("color", "#fff0d0"))
	sun.light_energy = float(S.get("intensity", 3.0)) / PI   # three の強さ / π（shaders/common.gdshaderinc）
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 80.0
	sun.directional_shadow_split_1 = 0.45
	sun.shadow_blur = 1.5     # やわらかい影（three: VSM 半径 6）
	sun.shadow_bias = 0.03
	sun.shadow_normal_bias = 1.0
	add_child(sun)
	sun.basis = Basis.looking_at(-to_sun, Vector3.UP if abs(to_sun.y) < 0.99 else Vector3.FORWARD)
	env = WorldEnvironment.new()
	env.name = "Env"
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color.html(spec.get("sky", {}).get("color", "#cfe0ee"))
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR   # 空の光は材質の中で足す（three の半球光）。ここは 0
	e.ambient_light_color = Color.BLACK
	e.ambient_light_energy = 0.0
	e.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	e.tonemap_mode = Environment.TONE_MAPPER_LINEAR   # 露出と切り捨ては仕上げの板（shaders/post.gdshader）で
	e.tonemap_exposure = 1.0
	env.environment = e
	add_child(env)


## world.js の VSM 半径の差を Godot の既定 blur 1.5 から 0.25 倍で反映する。
func set_shadow_radius(radius: float) -> void:
	if sun != null and is_instance_valid(sun):
		var default_radius := float(spec.get("shadowRadius", 2.0))
		sun.shadow_blur = clampf(1.5 + (radius - default_radius) * 0.25, 0.0, 7.0)


## skyvis がある地図だけ、空の間接光を焼いた可視率で弱める。
func set_bake(amount: float) -> void:
	if ground_material != null and is_instance_valid(ground_material):
		ground_material.set_shader_parameter("bake", clampf(amount, 0.0, 1.0) if skyvis_available else 0.0)


# ---------------------------------------------------------------- 地形
func _build_terrain() -> void:
	var sc: Node = load("res://data/%s/terrain.glb" % map_name).instantiate()
	var mesh: Mesh = null
	var xf := Transform3D.IDENTITY
	var water: MeshInstance3D = null
	for n in sc.find_children("*", "MeshInstance3D", true, false):
		if not String(n.name).begins_with("water"):
			mesh = n.mesh
			xf = n.transform
		else:
			water = n
	if water != null: _build_water(water)
	sc.free()
	var m := ShaderMaterial.new()
	m.shader = SH_GROUND
	ground_material = m
	skyvis_available = false
	var G: Dictionary = spec.get("ground", {})
	var alt: String = {"cobble": "ground_cobble", "flagstone": "ground_flagstone"}.get(G.get("alt", ""), "ground_sand")
	var rk: String = {"face": "rock_face", "crack": "rock_crack"}.get(G.get("rock", ""), "rock")
	for k in [["t_grass", "ground_grass"], ["t_dirt", "ground_dirt"], ["t_alt", alt], ["t_rock", rk], ["t_noise", "noise_soft"]]:
		m.set_shader_parameter(k[0], _tex(k[1]))
	var skyvis_path := "res://data/%s/skyvis.png" % map_name
	if FileAccess.file_exists(skyvis_path) and placed.has("terrain"):
		var tm: Dictionary = placed["terrain"]
		m.set_shader_parameter("t_skyvis", load(skyvis_path))
		m.set_shader_parameter("skyvis_origin", Vector2(float(tm["x0"]), float(tm["z0"])))
		m.set_shader_parameter("skyvis_size", float(tm["size"]))
		m.set_shader_parameter("skyvis_on", true)
		skyvis_available = true
	terrain_mesh = MeshInstance3D.new()
	terrain_mesh.name = "Terrain"
	terrain_mesh.set_meta("wa_diff_ground", true)
	terrain_mesh.mesh = mesh
	terrain_mesh.transform = xf
	terrain_mesh.material_override = m
	add_child(terrain_mesh)
	if not Engine.is_editor_hint():
		terrain_mesh.create_trimesh_collision()   # 歩くときの地面の高さ（scripts/main.gd が光線で引く）


## 水面（world.js waterMaterial）: 作り方は scripts/water.gd（WorldWater.make）。高さマップ data/<地図>/height.png から深さを出す
func _build_water(src: MeshInstance3D) -> void:
	var mi := MeshInstance3D.new()
	mi.name = "Water"
	mi.set_meta("wa_diff_ignore_vegetation", true)
	mi.mesh = src.mesh
	mi.transform = src.global_transform if src.is_inside_tree() else src.transform
	mi.material_override = WW.make(self)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


# アイデア01: 地形の頂点色（R=土 G=砂/石畳）を格子と同じ解像度の絵に写す（草の房の根元が引く）
var splat_tex: ImageTexture
func _build_splat() -> void:
	var tm: Dictionary = placed["terrain"]
	var cell := float(spec["terrain"].get("cell", 0.5))
	var R := int(round(float(tm["size"]) / cell)) + 1
	var img := Image.create(R, R, false, Image.FORMAT_RGBA8)
	var a := terrain_mesh.mesh.surface_get_arrays(0)
	var P: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var C: PackedColorArray = a[Mesh.ARRAY_COLOR]
	for i in P.size():
		var p := terrain_mesh.transform * P[i]
		var ix := int(round((p.x - float(tm["x0"])) / cell))
		var iz := int(round((p.z - float(tm["z0"])) / cell))
		if ix >= 0 and iz >= 0 and ix < R and iz < R:
			img.set_pixel(ix, iz, Color(C[i].r, C[i].g, C[i].b, 1.0))
	splat_tex = ImageTexture.create_from_image(img)
	RenderingServer.global_shader_parameter_set("wa_splat_st", Vector3(float(tm["x0"]), float(tm["z0"]), (R - 1) * cell))


# ---------------------------------------------------------------- 配置（アセットごとに MultiMesh）
var _mats := {}
func _material_for(src: Material) -> Material:
	var name := src.resource_name
	if _mats.has(name):
		return _mats[name]
	var tex: Texture2D = src.albedo_texture if src is BaseMaterial3D else null
	var m := ShaderMaterial.new()
	var leafy := name.contains("leaf") or name.contains("frond") or name.contains("grass")
	var mask_vegetation := leafy or name.contains("clover") or name.contains("bush")
	m.set_meta("wa_source_name", name)
	m.set_meta("wa_diff_vegetation", mask_vegetation)
	if name == "rock_crack":
		m.shader = SH_ROCK
		m.set_shader_parameter("t_crack", _tex("rock_crack"))
		m.set_shader_parameter("t_moss", _tex("ground_grass"))
	elif leafy:
		m.shader = SH_FOLIAGE
		m.set_shader_parameter("albedo_tex", tex)
		m.set_shader_parameter("is_grass", name.contains("grass"))
		m.set_shader_parameter("t_noise", _tex("noise_soft"))
		m.set_shader_parameter("t_grass", _tex("ground_grass"))
		m.set_shader_parameter("t_dirt", _tex("ground_dirt"))
		m.set_shader_parameter("t_alt", _tex("ground_sand"))
		m.set_shader_parameter("t_splat", splat_tex)
	else:
		m.shader = SH_LAMBERT
		m.set_shader_parameter("albedo_tex", tex)
	_mats[name] = m
	return m


func _build_assets() -> void:
	_mats.clear()
	var holder := Node3D.new()
	holder.name = "Placements"
	add_child(holder)
	var A: Dictionary = placed["assets"]
	for key in A.keys():
		var shadow_only: bool = key.ends_with("@shadow")
		var aname: String = key.replace("@shadow", "")
		var sc: Node = load("res://data/assets/%s.glb" % aname).instantiate()
		var items: Array = A[key]
		for mi in sc.find_children("*", "MeshInstance3D", true, false):
			var mesh: Mesh = mi.mesh.duplicate()
			for s in mesh.get_surface_count():
				var src := mesh.surface_get_material(s)
				if src == null:
					src = mi.get_active_material(s)
				mesh.surface_set_material(s, _material_for(src))
			var local: Transform3D = mi.transform
			var p := mi.get_parent()
			while p != sc and p is Node3D:
				local = p.transform * local
				p = p.get_parent()
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = mesh
			mm.instance_count = items.size()
			for i in items.size():
				var it: Array = items[i]
				var b := Basis(Vector3.UP, float(it[3])).scaled(Vector3.ONE * float(it[4]))
				mm.set_instance_transform(i, Transform3D(b, Vector3(it[0], it[1], it[2])) * local)
			var mmi := MultiMeshInstance3D.new()
			mmi.name = key
			mmi.multimesh = mm
			var is_grass := aname.begins_with("grass")
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if shadow_only else (GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if is_grass else GeometryInstance3D.SHADOW_CASTING_SETTING_ON)
			holder.add_child(mmi)
		sc.free()


## 地面の高さ（光線）。地形の当たりは実行時だけ作る
func ground_y(x: float, z: float) -> float:
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(Vector3(x, 60, z), Vector3(x, -60, z))
	var hit := space.intersect_ray(q)
	return hit.position.y if hit else 0.0
