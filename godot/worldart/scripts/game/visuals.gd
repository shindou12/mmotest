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


## 人物（仮）: 体の円柱・頭の球・向きの印（剣）。高さ ≈1.7m
static func player(color: Color) -> Node3D:
	var n := Node3D.new()
	var body := CapsuleMesh.new(); body.radius = 0.32; body.height = 1.25
	_part(n, body, mat(color), Vector3(0, 0.62, 0))
	var head := SphereMesh.new(); head.radius = 0.27; head.height = 0.54
	_part(n, head, mat(Color(1.0, 0.86, 0.72)), Vector3(0, 1.45, 0))
	var sword := BoxMesh.new(); sword.size = Vector3(0.08, 0.08, 1.0)
	var s := _part(n, sword, mat(Color(0.85, 0.88, 0.95)), Vector3(0.38, 0.9, 0.45))
	s.name = "Sword"
	return n


## 敵（仮）: 形の種類 t ごとに単純な形。色と大きさは階層の表
static func mob(t: String, color: Color, sc: float) -> Node3D:
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
	l.font_size = 40; l.pixel_size = 0.0075; l.outline_size = 10; l.no_depth_test = true
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
