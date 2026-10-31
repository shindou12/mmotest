class_name WorldWater
## 水面（world.js の waterMaterial）。terrain.water.rule == "w1" の地図は、水面を地面の材質の中で描く（shaders/water_w1.gdshaderinc。
## 仕上げの板に半透明が入らない問題のため、その理由はそこに書いた）。高さマップ data/<地図>/height.png（R=高さ G=岸からの距離）から深さを出す。
## それ以外の地図（第 2 世代）は、水面の板に簡単な半透明の材質（make）。

static func is_w1(spec: Dictionary) -> bool:
	var W = spec.get("terrain", {}).get("water")
	return W is Dictionary and String(W.get("rule", "")) == "w1"


## 地面の材質に水の値を入れる
static func configure(ground: ShaderMaterial, world) -> void:
	var spec: Dictionary = world.spec
	var W: Dictionary = spec["terrain"]["water"]
	var tm: Dictionary = world.placed["terrain"]
	ground.set_shader_parameter("t_wh", load("res://data/%s/height.png" % world.map_name))
	ground.set_shader_parameter("u_wt", Vector4(float(tm["x0"]), float(tm["z0"]), float(tm["size"]), float(tm.get("shoreMax", 0.0))))
	ground.set_shader_parameter("u_whr", Vector3(float(tm["hmin"]), float(tm["hmax"]), float(W["level"])))
	ground.set_shader_parameter("u_wshallow", _lin(W.get("shallowW1", "#629aa3")))
	ground.set_shader_parameter("u_wdeep", _lin(W.get("colorW1", "#3a6e87")))
	ground.set_shader_parameter("u_wwd", Vector4(float(W.get("deepAt", 2.6)), float(W.get("causticAt", 1.6)), float(W.get("bandAt", 0.28)), float(W.get("glint", 0.0))))
	ground.set_shader_parameter("u_wsky", _lin(spec.get("sky", {}).get("color", "#cfe0ee")))
	ground.set_shader_parameter("u_wrefl", float(W.get("refl", 1.0)))
	ground.set_shader_parameter("u_wsg", Vector2(float(W.get("surfScale", 0.32)), float(W.get("surfAmt", 2.0))))


## w1 以外: 水面の板の材質（簡単な半透明。仕上げの板より後に描く＝階調・ぼかしは掛からない）
static func make(world) -> Material:
	var W: Dictionary = world.spec["terrain"]["water"]
	var m := StandardMaterial3D.new()
	var c := Color.html(W.get("color", "#2f6f9a")).lerp(Color.html(W.get("shallow", "#5fb8b0")), 0.4)
	c.a = 0.8
	m.albedo_color = c
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.render_priority = 120
	return m


static func _lin(hex: String) -> Vector3:
	var c := Color.html(hex).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)
