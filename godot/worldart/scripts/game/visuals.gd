class_name GameVisuals
extends RefCounted
## 試作の見た目（L27）: 人物・敵は仮の形（Blender で作る前の置き換え）。予告の形・斬撃・数字。

static var _mats := {}


static func mat(c: Color, unshaded := false, alpha := 1.0) -> Material:
	var key := "%s_%s_%s" % [c.to_html(), unshaded, alpha]
	if _mats.has(key): return _mats[key]
	var m: Material
	if unshaded or alpha < 1.0:   # 予告・斬撃・出口の輪: 仕上げの板の後に描く（画面の写しに入らないため。render_priority 110）
		var sm := StandardMaterial3D.new()
		sm.albedo_color = Color(c.r, c.g, c.b, alpha)
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sm.cull_mode = BaseMaterial3D.CULL_DISABLED
		sm.render_priority = 110
		m = sm
	else:   # 人物・敵の仮の形: 地図と同じ光の式（shaders/flat.gdshader）
		var fm := ShaderMaterial.new()
		fm.shader = preload("res://shaders/flat.gdshader")
		fm.set_shader_parameter("base_color", c)
		m = fm
	_mats[key] = m
	return m


static func _part(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh; mi.material_override = m; mi.position = pos; mi.scale = scl
	parent.add_child(mi)
	return mi


## ゲームのモデル（data/models/<名>.glb。tools/worldart/godot/export_models.mjs が models.js の形を書き出したもの）。
## 材質は色だけなので、地図と同じ光の式の単色（flat.gdshader）に、光る部品（目など）は光るまま（unshaded）に置き換える。なければ null
static var _model_cache := {}
static var _mob_alpha_shaders := {}


static func _instantiate_model(name: String) -> Node3D:
	var path := "res://data/models/%s.glb" % name
	if not ResourceLoader.exists(path): return null
	if not _model_cache.has(name): _model_cache[name] = load(path)
	var packed: PackedScene = _model_cache[name]
	return packed.instantiate() as Node3D


static func model(name: String) -> Node3D:
	var n := _instantiate_model(name)
	if n == null: return null
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		for s in mi.mesh.get_surface_count():
			var src: Material = mi.get_active_material(s)
			if src is BaseMaterial3D:
				var glow: bool = src.resource_name == "glow"
				mi.set_surface_override_material(s, mat(src.albedo_color, glow, 1.0) if not glow else _glow(src.albedo_color))
	return n


static func _glow(c: Color) -> Material:
	var key := "glow_" + c.to_html()
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c; m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mats[key] = m
	return m


## 人物: 入れ物（中身のモデルは PlayerView が装備に合わせて付ける）。モデルがなければ仮の形（体の円柱・頭の球・向きの印）。高さ ≈1.7m
static func player(color: Color) -> Node3D:
	if ResourceLoader.exists("res://data/models/player.glb"): return PlayerView.create(color)   # 名前付き部品のモデル・動き・トゥーン（player_view.gd）
	var gm := model("player")
	if gm != null: return gm
	var n := Node3D.new()
	var body := CapsuleMesh.new(); body.radius = 0.32; body.height = 1.25
	_part(n, body, mat(color), Vector3(0, 0.62, 0))
	var head := SphereMesh.new(); head.radius = 0.27; head.height = 0.54
	_part(n, head, mat(Color(1.0, 0.86, 0.72)), Vector3(0, 1.45, 0))
	var sword := BoxMesh.new(); sword.size = Vector3(0.08, 0.08, 1.0)
	var s := _part(n, sword, mat(Color(0.85, 0.88, 0.95)), Vector3(0.38, 0.9, 0.45))
	s.name = "Sword"
	return n


## public/js/models/npc-models.js makePlayer(color) と docs/godot/inventory/models.md 2.6。
## NPC は player.glb の服色だけを変え、武器は付けない。
static func npc(color: Color) -> Node3D:
	if not ResourceLoader.exists("res://data/models/player.glb"):
		return player(color)
	var model := PlayerModel.new()
	model.build({"kind": "sword", "no_weapon": true, "color": color})
	return model.root


## mob-models.js の body / mD / mL / ac の色計算を、glTF の役割名から再現する。
static func _mob_role_color(role: String, color: Color, accent: Color) -> Color:
	var c := color.srgb_to_linear()
	match role:
		"mob_body", "mob_body_glow": return color
		"mob_body_dark50": return (c * 0.5).linear_to_srgb()
		"mob_body_dark55": return (c * 0.55).linear_to_srgb()
		"mob_body_dark60": return (c * 0.6).linear_to_srgb()
		"mob_body_light35": return c.lerp(Color.WHITE, 0.35).linear_to_srgb()
		"mob_accent", "mob_accent_glow": return accent
	return Color.WHITE


## GameRules.data() が持つ FLOORS / treasure（public/shared/data.js の書き出し）から、敵と本体色が一致するアクセントを探す。
static func _mob_table_accent(t: String, color: Color) -> Color:
	var rows: Array = []
	for floor in GameRules.data().get("floors", []):
		rows.append_array(floor.get("mobs", []))
		rows.append_array(floor.get("elites", []))
		var boss = floor.get("boss")
		if boss is Dictionary:
			rows.append(boss)
			rows.append_array(boss.get("minions", []))
	rows.append(GameRules.data().get("treasure", {}))
	for row in rows:
		if not row is Dictionary or String(row.get("t", "")) != t or not row.has("accent"): continue
		if Color(String(row.get("color", "#000000"))) == color:
			return Color(String(row["accent"]))
	return Color("ff4030")


## GLB の mob_palette_<本体色>_<アクセント色> から、呼び出し側が省略したアクセントを補う。
static func _mob_asset_accent(root: Node3D, color: Color) -> Variant:
	var target := color.to_html(false).to_lower()
	var found: Variant = null
	var markers: Array[Node] = []
	for child in root.find_children("*", "Node3D", true, false):
		var child_name := String(child.name)
		if child_name.begins_with("mob_palette_") and child_name.trim_prefix("mob_palette_").split("_").size() == 2:
			markers.append(child)
	# 名前を先に全部読んでから消す（目印が目印の子にあると、親を消した時点で子も消え、あとで読むと previously freed になる）
	for marker in markers:
		var parts := String(marker.name).trim_prefix("mob_palette_").split("_")
		if parts.size() == 2 and parts[0].to_lower() == target:
			found = Color("#" + parts[1])
	for marker in markers:
		if is_instance_valid(marker): marker.free()
	return found


static func _mob_alpha_shader(source: Shader) -> Shader:
	var key := str(source.get_instance_id())
	if _mob_alpha_shaders.has(key): return _mob_alpha_shaders[key]
	var shader := Shader.new()
	var code := source.code
	code = code.replace("unshaded, cull_back;", "unshaded, cull_back, blend_mix;")
	code = code.replace("unshaded, cull_disabled;", "unshaded, cull_disabled, blend_mix;")
	code = code.replace("ALBEDO = col;", "ALBEDO = col;\n\tALPHA = albedo.a;")
	shader.code = code
	_mob_alpha_shaders[key] = shader
	return shader


## export_models.mjs が出した GLB の子順を、models.js の部品名に結び付ける。
static func _mob_anim_part(root: Node3D, name: String, path: Array) -> Node3D:
	var node: Node = root
	for index in path:
		if index < 0 or index >= node.get_child_count(): return null
		node = node.get_child(index)
	var part := node as Node3D
	if part != null:
		part.name = "MobAnim_" + name
		part.rotation_order = EULER_ORDER_XYZ
	return part


static func _mob_anim_parts(root: Node3D, t: String, boss: bool) -> void:
	var body := _mob_anim_part(root, "body", [0, 0])
	root.set_meta("mob_anim_float", t == "bat" or t == "wisp")
	root.set_meta("mob_anim_hover", t == "mage")
	root.set_meta("mob_anim_flap", t == "bat")
	match t:
		"slime", "rootknot":
			_mob_anim_part(root, "squash", [0, 0, 0])
		"beast":
			_mob_anim_part(root, "head", [0, 0, 1])
			for i in 4: _mob_anim_part(root, "legs_%d" % i, [0, 0, i + 2])
			_mob_anim_part(root, "tail", [0, 0, 6])
		"golem":
			for i in 2: _mob_anim_part(root, "arms_%d" % i, [0, 0, i])
		"wisp":
			_mob_anim_part(root, "shell", [0, 0, 0, 3])
		"bat":
			for i in 2: _mob_anim_part(root, "wings_%d" % i, [0, 0, 0, i + 1])
		"mushroom":
			_mob_anim_part(root, "squash", [0, 0, 0])
			_mob_anim_part(root, "cap", [0, 0, 0, 1])
		"scorpion":
			for i in 6: _mob_anim_part(root, "legs_%d" % i, [0, 0, i + 1])
			for i in 2: _mob_anim_part(root, "arms_%d" % i, [0, 0, i + 7])
			_mob_anim_part(root, "tail", [0, 0, 9])
		"lizard":
			_mob_anim_part(root, "head", [0, 0, 0, 1])
			for i in 4: _mob_anim_part(root, "legs_%d" % i, [0, 0, 0, i + 2])
			_mob_anim_part(root, "tail", [0, 0, 0, 6])
		"mage":
			_mob_anim_part(root, "head", [0, 0, 2])
			_mob_anim_part(root, "arm", [0, 0, 3])
			_mob_anim_part(root, "shell", [0, 0, 4])
		"knight":
			for i in 2: _mob_anim_part(root, "legs2_%d" % i, [0, 0, i + 3])
			_mob_anim_part(root, "arm", [0, 0, 5])
			if boss:
				_mob_anim_part(root, "guardArm", [0, 0, 6])
				_mob_anim_part(root, "cape", [0, 0, 7])
				_mob_anim_part(root, "tail", [0, 0, 8])
	if boss:
		for light in root.find_children("*", "OmniLight3D", true, false):
			light.name = "MobAnim_aura"
			light.rotation_order = EULER_ORDER_XYZ
		if body != null and root.get_child_count() > 0:
			var imported_root := root.get_child(0)
			for child in imported_root.get_children():
				if child == body or String(child.name).begins_with("mob_palette_"): continue
				if child is MeshInstance3D:
					child.name = "MobAnim_sigil"
					(child as Node3D).rotation_order = EULER_ORDER_XYZ


## 敵: mob-models.js の形を使い、GLB の部品役割から階層色とアクセントを差し替える。
## 色の式: makeMob() の m / mD / mL / ac。トゥーンと輪郭線は toon_look.gd の ToonLook.convert。
static func mob(t: String, color: Color, sc: float, boss := false, accent: Variant = null) -> Node3D:
	var accent_color: Color = _mob_table_accent(t, color)
	if accent is Color: accent_color = accent
	var gm := _instantiate_model(("boss_" if boss else "mob_") + t)
	if gm != null:
		if not accent is Color:
			var asset_accent: Variant = _mob_asset_accent(gm, color)
			if asset_accent is Color: accent_color = asset_accent
		ToonLook.convert(gm)
		for mi in gm.find_children("*", "MeshInstance3D", true, false):
			var role := String(mi.name).get_slice("__", 0)
			if not role.begins_with("mob_") or mi.mesh == null: continue
			for s in mi.mesh.get_surface_count():
				var src: Material = mi.get_active_material(s)
				if not (src is ShaderMaterial): continue
				var source_albedo: Color = (src as ShaderMaterial).get_shader_parameter("albedo")
				var recolored := (src as ShaderMaterial).duplicate() as ShaderMaterial
				var new_albedo := _mob_role_color(role, color, accent_color)
				new_albedo.a = source_albedo.a
				# 半透明殻の輝度を three.js の撮影値に合わせる。
				if t == "wisp" and source_albedo.a < 0.999: new_albedo.a *= 0.85
				recolored.set_shader_parameter("albedo", new_albedo)
				if source_albedo.a < 0.999:
					recolored.shader = _mob_alpha_shader(recolored.shader)
				var old_emission: Color = (src as ShaderMaterial).get_shader_parameter("emission_col")
				var old_base_linear := source_albedo.srgb_to_linear()
				var old_emission_linear := old_emission.srgb_to_linear()
				if old_base_linear.r > 0.0001:
					var emission_scale := old_emission_linear.r / old_base_linear.r
					if emission_scale > 0.0 and absf(old_emission_linear.g - old_base_linear.g * emission_scale) < 0.01 and absf(old_emission_linear.b - old_base_linear.b * emission_scale) < 0.01:
						var new_emission := (new_albedo.srgb_to_linear() * emission_scale).linear_to_srgb()
						new_emission.a = old_emission.a
						recolored.set_shader_parameter("emission_col", new_emission)
				mi.set_surface_override_material(s, recolored)
		_mob_anim_parts(gm, t, boss)
		gm.scale = Vector3.ONE * sc
		return gm
	var n := Node3D.new()
	var m := mat(color)
	match t:
		"slime":
			var s := SphereMesh.new(); s.radius = 0.6; s.height = 0.9
			_part(n, s, m, Vector3(0, 0.42, 0))
		"mushroom":
			var st := CylinderMesh.new(); st.top_radius = 0.22; st.bottom_radius = 0.3; st.height = 0.7
			_part(n, st, mat(Color(0.95, 0.92, 0.85)), Vector3(0, 0.35, 0))
			var cap := SphereMesh.new(); cap.radius = 0.65; cap.height = 0.6
			_part(n, cap, m, Vector3(0, 0.8, 0))
		"bat":
			var b := SphereMesh.new(); b.radius = 0.3; b.height = 0.5
			_part(n, b, m, Vector3(0, 1.4, 0))
			var w := BoxMesh.new(); w.size = Vector3(1.4, 0.05, 0.4)
			_part(n, w, m, Vector3(0, 1.45, 0))
		_:
			var bd := BoxMesh.new(); bd.size = Vector3(0.8, 0.8, 1.3)
			_part(n, bd, m, Vector3(0, 0.6, 0))
			var hd := BoxMesh.new(); hd.size = Vector3(0.55, 0.5, 0.5)
			_part(n, hd, m, Vector3(0, 0.8, 0.8))
	n.scale = Vector3.ONE * sc
	return n


## 頭の上の名前と HP の札
static func label(text: String, color := Color.WHITE) -> Label3D:
	var l := Label3D.new()
	l.text = text; l.modulate = color; l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.font_size = 32; l.pixel_size = 0.0065; l.outline_size = 8; l.no_depth_test = true
	l.fixed_size = false
	l.render_priority = 110   # 仕上げの板（render_priority 100）の後
	return l


## 地面に貼る平らな形（予告・斬撃）。circle・ring・cone・line を三角形で作る（原点 = 形の基準点）
static func shape_mesh(s: Dictionary, fill := 1.0) -> ArrayMesh:
	if fill < 0.02: return null   # 面のない形を作らない
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var k := String(s["k"])
	var seg := 40
	match k:
		"circle", "ring":
			var r1 := float(s["r"]) if k == "circle" else float(s["r1"])
			var r0 := 0.0 if k == "circle" else float(s["r0"])
			r1 = r0 + (r1 - r0) * fill
			for i in seg:
				var a0 := TAU * i / seg; var a1 := TAU * (i + 1) / seg
				var p00 := Vector3(sin(a0) * r0, 0, cos(a0) * r0); var p01 := Vector3(sin(a1) * r0, 0, cos(a1) * r0)
				var p10 := Vector3(sin(a0) * r1, 0, cos(a0) * r1); var p11 := Vector3(sin(a1) * r1, 0, cos(a1) * r1)
				for v in [p00, p10, p11, p00, p11, p01]: st.add_vertex(v)
		"cone":
			var L := float(s["len"]) * fill; var arc := float(s["arc"]); var a := float(s["a"])
			for i in seg:
				var a0 := a - arc / 2 + arc * i / seg; var a1 := a - arc / 2 + arc * (i + 1) / seg
				for v in [Vector3.ZERO, Vector3(sin(a0) * L, 0, cos(a0) * L), Vector3(sin(a1) * L, 0, cos(a1) * L)]: st.add_vertex(v)
		"line":
			var L := float(s["len"]) * fill; var w := float(s["w"]) / 2; var a := float(s["a"])
			var f := Vector3(sin(a), 0, cos(a)); var sd := Vector3(cos(a), 0, -sin(a)) * w
			for v in [-sd, sd, sd + f * L, -sd, sd + f * L, -sd + f * L]: st.add_vertex(v)
	return st.commit()
