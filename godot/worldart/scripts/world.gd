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
var sun: DirectionalLight3D
var env: WorldEnvironment

const SH_GROUND := preload("res://shaders/ground.gdshader")
const SH_FOLIAGE := preload("res://shaders/foliage.gdshader")
const SH_LAMBERT := preload("res://shaders/lambert.gdshader")
const SH_ROCK := preload("res://shaders/rock.gdshader")


@export var auto_build := true   ## ゲーム（scripts/game/game.gd）は false にして load_area で組み立てる


func _ready() -> void:
	if auto_build: build()


## ゲームのエリアを組み立てる（L27）。data/<id>/map.json があれば第 3 世代の地図、なければ仮の地面（ゲームの輪郭・当たり判定の形だけ）
func load_area(id: String) -> void:
	if FileAccess.file_exists("res://data/%s/map.json" % id):
		map_name = id
		if not is_inside_tree() or not auto_build: build()
		return
	for c in get_children():
		remove_child(c)
		c.free()
	spec = _json("res://data/f1_field/map.json")   # 光・階調は第 3 世代の雛形と同じ値（f1_field の地図から借りる）
	placed = {}
	_set_globals()
	_build_light()
	var ar := GameRules.area(id)
	if ar["shape"] == "grid": _build_grid(ar)
	else: _build_fallback(ar)


var door_nodes: Array = []
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
	for d in door_nodes:
		if is_instance_valid(d): d.visible = not open


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


# ---------------------------------------------------------------- 地形
func _build_terrain() -> void:
	var sc: Node = load("res://data/%s/terrain.glb" % map_name).instantiate()
	var mesh: Mesh = null
	var xf := Transform3D.IDENTITY
	for n in sc.find_children("*", "MeshInstance3D", true, false):
		if not String(n.name).begins_with("water"):
			mesh = n.mesh
			xf = n.transform
	sc.free()
	var m := ShaderMaterial.new()
	m.shader = SH_GROUND
	var G: Dictionary = spec.get("ground", {})
	var alt: String = {"cobble": "ground_cobble", "flagstone": "ground_flagstone"}.get(G.get("alt", ""), "ground_sand")
	var rk: String = {"face": "rock_face", "crack": "rock_crack"}.get(G.get("rock", ""), "rock")
	for k in [["t_grass", "ground_grass"], ["t_dirt", "ground_dirt"], ["t_alt", alt], ["t_rock", rk], ["t_noise", "noise_soft"]]:
		m.set_shader_parameter(k[0], _tex(k[1]))
	terrain_mesh = MeshInstance3D.new()
	terrain_mesh.name = "Terrain"
	terrain_mesh.mesh = mesh
	terrain_mesh.transform = xf
	terrain_mesh.material_override = m
	add_child(terrain_mesh)
	if not Engine.is_editor_hint():
		terrain_mesh.create_trimesh_collision()   # 歩くときの地面の高さ（scripts/main.gd が光線で引く）


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
