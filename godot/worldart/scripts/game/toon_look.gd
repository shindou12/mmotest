class_name ToonLook
extends RefCounted
## 人物・武器・防具のトゥーン材質と輪郭線（G2-2）。
## tools/worldart/godot/export_models.mjs が書いた GLB（材質は toon / glow / player_color*、ノード名に ow<太さ×100>_ gm<倍率×100>_）を、
## shaders/toon.gdshader（MeshToonMaterial の式）+ shaders/toon_outline.gdshader（toon.js の outline）に置き換える。
## 元の関数: toon.js の toon() / glow() / outlineMat() / hullGeo() / outline()。

const SHADER := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/toon_outline.gdshader")
const COLOR_RECIPES := "res://data/models/player_color.json"

## 光の既定: 第 1 層の野外（shared/data.js FLOORS[0]: sun 0xfff1d6 強さ 2.2、hemi 空 0xcfe8ff 地 0x3a5a2a、野外の hemi 強さ 1.1）
## 太陽の位置は game/loop.js の sun.position (x+20, 40, z+10) → 向きは (20,40,10)
const DEFAULT_LIGHT := {
	"sun_dir": Vector3(20, 40, 10), "sun_color": Color("fff1d6"), "sun_i": 2.2,
	"sky": Color("cfe8ff"), "ground": Color("3a5a2a"), "hemi_i": 1.1, "aces": true, "exposure": 1.0,
	"outline_scale": 1.0,   # 輪郭線の太さの倍率（1 = toon.js と同じ。確かめ用に変えられる）
}

static var _shader_cache := {}
static var _materials: Array = []          # 作った ShaderMaterial（光の値を後から入れ直すため）
static var _mat_cache := {}
static var _outline_cache := {}
static var _hull_cache := {}               # 元の Mesh → 輪郭線の法線を足した ArrayMesh
static var _light: Dictionary = DEFAULT_LIGHT.duplicate()
static var _recipes: Dictionary = {}


## 光を入れる。色は sRGB（three.js の Color.set(hex) と同じ入力）で、ここで線形にして強さを掛ける
static func set_light(l: Dictionary = {}) -> void:
	for k in l: _light[k] = l[k]
	for m in _materials: _apply_light(m)
	for m in _outline_cache.values(): _apply_outline_light(m)


static func _apply_light(m: ShaderMaterial) -> void:
	var sun: Color = _light["sun_color"].srgb_to_linear()
	var sky: Color = _light["sky"].srgb_to_linear()
	var gnd: Color = _light["ground"].srgb_to_linear()
	var si: float = _light["sun_i"]
	var hi: float = _light["hemi_i"]
	m.set_shader_parameter("sun_dir", (_light["sun_dir"] as Vector3).normalized())
	m.set_shader_parameter("sun_col", Vector3(sun.r, sun.g, sun.b) * si)
	m.set_shader_parameter("hemi_sky", Vector3(sky.r, sky.g, sky.b) * hi)
	m.set_shader_parameter("hemi_ground", Vector3(gnd.r, gnd.g, gnd.b) * hi)
	m.set_shader_parameter("aces", _light["aces"])
	m.set_shader_parameter("exposure", _light["exposure"])


static func _apply_outline_light(m: ShaderMaterial) -> void:
	m.set_shader_parameter("width", float(m.get_meta("ow", 1.0)) * float(_light["outline_scale"]))
	m.set_shader_parameter("aces", _light["aces"])
	m.set_shader_parameter("exposure", _light["exposure"])


static func _shader_variant(double_sided: bool, vertex_colors: bool, has_texture: bool, transparent: bool, additive: bool) -> Shader:
	var key := "%s|%s|%s|%s|%s" % [double_sided, vertex_colors, has_texture, transparent, additive]
	if _shader_cache.has(key): return _shader_cache[key]
	var code := SHADER.code
	var mode := "render_mode unshaded, cull_disabled;" if double_sided else "render_mode unshaded, cull_back;"
	if transparent: mode = mode.replace(";", ", %s, depth_draw_never;" % ("blend_add" if additive else "blend_mix"))
	code = code.replace("render_mode unshaded, cull_back;", mode)
	var base := "albedo.rgb"
	if has_texture:
		code = code.replace("uniform vec4 albedo : source_color", "uniform sampler2D albedo_tex : source_color;\nuniform vec4 albedo : source_color")
		code = code.replace("void fragment() {", "void fragment() {\n\tvec4 tex_col = texture(albedo_tex, UV);")
		base += " * tex_col.rgb"
	if vertex_colors: base += " * COLOR.rgb"
	code = code.replace("col = albedo.rgb * color_scale;", "col = %s * color_scale;" % base)
	code = code.replace("col = albedo.rgb / PI * irr + emission_col.rgb;", "col = %s / PI * irr + emission_col.rgb;" % base)
	if transparent:
		var alpha := "albedo.a"
		if has_texture: alpha += " * tex_col.a"
		if vertex_colors: alpha += " * COLOR.a"
		code = code.replace("ALBEDO = col;", "ALBEDO = col;\n\tALPHA = %s;" % alpha)
	var shader := Shader.new()
	shader.code = code
	_shader_cache[key] = shader
	return shader


static func _toon_material(albedo: Color, emission: Color, unlit: bool, scale: float, double_sided: bool, ow: float, vertex_colors := false, tex: Texture2D = null, transparent := false, additive := false) -> ShaderMaterial:
	var key := "%s|%s|%s|%.3f|%s|%.2f|%s|%s|%s|%s" % [albedo.to_html(true), emission.to_html(false), unlit, scale, double_sided, ow, vertex_colors, tex.get_instance_id() if tex != null else 0, transparent, additive]
	if _mat_cache.has(key): return _mat_cache[key]
	var m := ShaderMaterial.new()
	m.shader = _shader_variant(double_sided, vertex_colors, tex != null, transparent, additive)
	m.set_shader_parameter("albedo", albedo)
	if tex != null: m.set_shader_parameter("albedo_tex", tex)
	m.set_shader_parameter("emission_col", emission)
	m.set_shader_parameter("color_scale", scale)
	m.set_shader_parameter("unlit", unlit)
	_apply_light(m)
	if ow > 0.0:
		var okey := "%.2f" % ow
		if not _outline_cache.has(okey):
			var om := ShaderMaterial.new()
			om.shader = OUTLINE
			om.set_meta("ow", ow)
			om.set_shader_parameter("outline_color", Color("17121f"))   # source_color の既定値は線形に直されないので、必ず入れる
			_apply_outline_light(om)
			_outline_cache[okey] = om
		m.next_pass = _outline_cache[okey]
	_materials.append(m)
	_mat_cache[key] = m
	return m


## 線（THREE.Line + LineBasicMaterial）用の材質: 光らない単色（glow と同じ unlit の扱い）。弓の弦
static func line_material(c: Color) -> ShaderMaterial:
	return _toon_material(c, Color(0, 0, 0), true, 1.0, true, 0.0)


# ---------------------------------------------------------------------------
# プレイヤーの色から作る材質（models.js makePlayer / setPlayerArmor の式。作り方は data/models/player_color.json）
# ---------------------------------------------------------------------------

static func _load_recipes() -> void:
	if not _recipes.is_empty(): return
	var j = JSON.parse_string(FileAccess.get_file_as_string(COLOR_RECIPES))
	if j == null: return
	for k in j["roles"]:
		var d: Dictionary = j["roles"][k]
		_recipes[d["name"]] = d


static func _hex(h: int) -> Color:
	return Color8((h >> 16) & 255, (h >> 8) & 255, h & 255)


## three.js の Color.lerp は線形空間で行われるので、線形で混ぜて sRGB に戻す
static func player_role_color(role_name: String, player: Color) -> Color:
	_load_recipes()
	var d: Dictionary = _recipes[role_name]
	var a: Color = player if str(d["a"]) == "player" else _hex(int(d["a"]))
	var b: Color = player if str(d["b"]) == "player" else _hex(int(d["b"]))
	var c := a.srgb_to_linear().lerp(b.srgb_to_linear(), float(d["t"]))
	return c.linear_to_srgb()


# ---------------------------------------------------------------------------
# 輪郭線: hullGeo（toon.js）と同じ「位置で統合した滑らかな法線」を CUSTOM0 に足した Mesh
# ---------------------------------------------------------------------------

## hullGeo 相当。mergeVertices(geo, 1e-3) で位置が同じ頂点をまとめ、computeVertexNormals（面積で重み付けした平均）を取る
static func add_hull(mesh: Mesh) -> ArrayMesh:
	if _hull_cache.has(mesh): return _hull_cache[mesh]
	var out := ArrayMesh.new()
	for s in mesh.get_surface_count():
		var arr := mesh.surface_get_arrays(s)
		var pos: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var idx = arr[Mesh.ARRAY_INDEX]
		var ids := PackedInt32Array()
		ids.resize(pos.size())
		var table := {}
		var count := 0
		for i in pos.size():
			var p := pos[i]
			var k := Vector3i(roundi(p.x * 1000.0), roundi(p.y * 1000.0), roundi(p.z * 1000.0))
			var id: int = table.get(k, -1)
			if id < 0:
				id = count
				table[k] = id
				count += 1
			ids[i] = id
		var sums := PackedVector3Array()
		sums.resize(count)
		var n_idx: int = idx.size() if idx != null and idx.size() > 0 else pos.size()
		for t in range(0, n_idx - 2, 3):
			var i0: int = idx[t] if idx != null and idx.size() > 0 else t
			var i1: int = idx[t + 1] if idx != null and idx.size() > 0 else t + 1
			var i2: int = idx[t + 2] if idx != null and idx.size() > 0 else t + 2
			# Godot の表の面は時計回り（取り込みで glTF の反時計回りを反転している）なので、外向きは (p2 - p0) × (p1 - p0)
			var fn := (pos[i2] - pos[i0]).cross(pos[i1] - pos[i0])
			sums[ids[i0]] += fn
			sums[ids[i1]] += fn
			sums[ids[i2]] += fn
		var custom := PackedFloat32Array()
		custom.resize(pos.size() * 3)
		for i in pos.size():
			var n := sums[ids[i]]
			n = n.normalized() if n.length_squared() > 1e-20 else Vector3.UP
			custom[i * 3] = n.x
			custom[i * 3 + 1] = n.y
			custom[i * 3 + 2] = n.z
		arr[Mesh.ARRAY_CUSTOM0] = custom
		out.add_surface_from_arrays(mesh.surface_get_primitive_type(s), arr, [], {}, Mesh.ARRAY_CUSTOM_RGB_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)
	_hull_cache[mesh] = out
	return out


# ---------------------------------------------------------------------------
# 変換
# ---------------------------------------------------------------------------

static var _re_ow: RegEx
static var _re_gm: RegEx


## root 以下の MeshInstance3D の材質を、トゥーン + 輪郭線に置き換える。player: プレイヤーの色（sRGB）
static func convert(root: Node, player: Color = Color("448a9b")) -> void:
	if _re_ow == null:
		_re_ow = RegEx.new(); _re_ow.compile("ow(\\d+)_")
		_re_gm = RegEx.new(); _re_gm.compile("gm(\\d+)_")
	for node in root.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = node
		if mi.mesh == null: continue
		var nm := String(mi.name)
		var ow := 0.0
		var gm := 1.0
		var m1 := _re_ow.search(nm)
		if m1 != null: ow = float(m1.get_string(1)) / 100.0
		var m2 := _re_gm.search(nm)
		if m2 != null: gm = float(m2.get_string(1)) / 100.0
		var src_mesh: Mesh = mi.mesh
		var use_hull := false
		for s in src_mesh.get_surface_count():
			var src: Material = src_mesh.surface_get_material(s)
			if src == null: src = mi.get_active_material(s)
			if not (src is BaseMaterial3D): continue
			var b: BaseMaterial3D = src
			var rn := String(b.resource_name)
			var glow := rn == "glow" or rn == "glow_add"
			var additive := rn == "glow_add"
			var alb: Color = b.albedo_color
			if rn.begins_with("player_color"): alb = player_role_color(rn, player)
			var emi: Color = b.emission if b.emission_enabled and not glow else Color(0, 0, 0)
			var o := 0.0 if glow else ow
			var arrays := src_mesh.surface_get_arrays(s)
			var colors = arrays[Mesh.ARRAY_COLOR]
			var vertex_colors: bool = colors != null and colors.size() > 0
			var tex: Texture2D = b.albedo_texture
			var transparent := b.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA or alb.a < 0.999
			if o > 0.0: use_hull = true
			mi.set_surface_override_material(s, _toon_material(alb, emi, glow, gm, b.cull_mode == BaseMaterial3D.CULL_DISABLED, o, vertex_colors, tex, transparent, additive))
		if use_hull: mi.mesh = add_hull(src_mesh)
