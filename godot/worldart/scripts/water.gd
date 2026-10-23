class_name WorldWater
## world.js の waterMaterialW1 / waterMaterialG2 と同じ水面。地形の Plane に描き、仕上げの板の前に合成する。

const SH_W1 := preload("res://shaders/water_w1.gdshader")
const SH_G2 := preload("res://shaders/water_g2.gdshader")


static func is_w1(spec: Dictionary) -> bool:
	var W = spec.get("terrain", {}).get("water")
	return W is Dictionary and String(W.get("rule", "")) == "w1"


## 水面 Plane の材質に、地図・水の規則・光の値を入れる。
static func make(world) -> ShaderMaterial:
	var W: Dictionary = world.spec["terrain"]["water"]
	var w1 := is_w1(world.spec)
	var m := ShaderMaterial.new()
	m.shader = SH_W1 if w1 else SH_G2
	m.render_priority = 90   # main.gd の仕上げの板は 100
	configure(m, world)
	return m


static func configure(water: ShaderMaterial, world) -> void:
	var spec: Dictionary = world.spec
	var W: Dictionary = spec["terrain"]["water"]
	var tm: Dictionary = world.placed["terrain"]
	var w1 := is_w1(spec)
	water.set_shader_parameter("t_wh", load("res://data/%s/height.png" % world.map_name))
	water.set_shader_parameter("u_wt", Vector4(float(tm["x0"]), float(tm["z0"]), float(tm["size"]), float(tm.get("shoreMax", 0.0))))
	water.set_shader_parameter("u_whr", Vector3(float(tm["hmin"]), float(tm["hmax"]), float(W["level"])))
	water.set_shader_parameter("u_wshallow", _lin(W.get("shallowW1", "#629aa3") if w1 else W.get("shallow", "#5fb8b0")))
	water.set_shader_parameter("u_wdeep", _lin(W.get("colorW1", "#3a6e87") if w1 else W.get("color", "#2f6f9a")))
	water.set_shader_parameter("u_wsky", _lin(spec.get("sky", {}).get("color", "#cfe0ee")))
	water.set_shader_parameter("u_wshadow", float(W.get("wshadow", 0.0 if w1 else 1.0)))
	if w1:
		water.set_shader_parameter("t_noise", world._tex("noise_soft"))
		water.set_shader_parameter("u_wwd", Vector4(float(W.get("deepAt", 2.6)), float(W.get("causticAt", 1.6)), float(W.get("bandAt", 0.28)), float(W.get("glint", 0.0))))
		water.set_shader_parameter("u_wrefl", float(W.get("refl", 1.0)))
		water.set_shader_parameter("u_wsg", Vector2(float(W.get("surfScale", 0.32)), float(W.get("surfAmt", 2.0))))
	else:
		water.set_shader_parameter("t_sand", world._tex("ground_sand"))


static func _lin(hex: String) -> Vector3:
	var c := Color.html(hex).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)
