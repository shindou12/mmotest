class_name GameFx
extends Node3D
## 技の見た目（エフェクト）。元は public/js/fx.js（FX・Particles）と public/js/fx-styles.js（FX_STYLES 5 様式・StyledFX）。
## 粒・斬撃の帯・衝撃波の輪・光の柱・雷・点光源の閃光・線の火花・飛ぶ光波。数値（色・大きさ・寿命・加算合成・光の強さ）は元と同じ。
## 設定の「エフェクト」（blend = A+B（既定）・anime・flashy・subtle・classic = 以前の見た目）を set_style で切り替える。
##
## 描き方（確かめた定番の手法）:
##   * 粒 = MultiMeshInstance3D の板 1 枚を使い回す（Godot 公式 MultiMesh。instance の色とカスタムデータに大きさ・透明度を入れ、buffer で毎フレーム 1 回で書く）。
##     板は頂点シェーダーで常にカメラを向け、大きさは three.js の gl_PointSize = size * 300 / 距離（ピクセル）と同じ画面上の大きさにする。
##   * 加算合成は blend_add のシェーダー（unshaded・depth_draw_never）。render_priority = 110 で仕上げの板（post.gdshader、100）の後に描く
##     （仕上げは hint_screen_texture を読むので、先に描くと上書きされる。visuals.gd の mat() と同じ決まり）。
##   * 閃光 = OmniLight3D（4 つのプール。three の PointLight(強さ, 距離, 減衰 2) と同じ数値。flat / ground 系のシェーダーの light() が拾う）。
##   * 雷・火花 = ImmediateMesh の線（元も 1 ピクセルの線）。
## 元と違う所: Bloom（UnrealBloomPass。style の bloom の値）は仕上げの板にないので、にじみは出さない（gain と粒の芯で近づける）。武器の振りの軌跡（swordTrail）・残像（ghost）は人物の武器モデル待ち。

const MAXP := 3000
const PRIO := 110
## 点光源の強さの係数。three の PointLight（階調の前に足されて圧縮される）に見た目を合わせる（比べて決めた値）
const LIGHT_K := 0.3

## fx-styles.js FX_STYLES。classic は null（今までの見た目）
const STYLES := {
	"anime": {"bloom": 0.55, "flash": 1.0, "parts": {"shape": 1, "count": 1.0, "size": 1.1}, "sparks": 0.7,
		"slash": {"width": 0.34, "core": 0.3, "hard": 1.0, "gain": 1.3, "opacity": 1.0, "life": 0.26, "tail": 0.75, "feather": 0.4},
		"ring": {"width": 0.26, "fill": 0.0, "hard": 0.0, "gain": 1.4, "double": true}, "trail": {"core": 0.45, "hard": 0.0}},
	"flashy": {"bloom": 0.85, "flash": 1.25, "parts": {"shape": 2, "count": 1.5, "size": 1.25}, "sparks": 1.0,
		"slash": {"width": 0.5, "core": 0.4, "hard": 0.0, "gain": 1.8, "opacity": 0.9, "life": 0.32, "tail": 1.0, "feather": 0.0},
		"ring": {"width": 0.2, "fill": 0.22, "hard": 0.0, "gain": 1.8, "double": false}, "trail": {"core": 0.6, "hard": 0.0}},
	"blend": {"bloom": 0.72, "flash": 1.15, "parts": {"shape": 1, "count": 1.35, "size": 1.2}, "sparks": 1.0,
		"slash": {"width": 0.42, "core": 0.34, "hard": 1.0, "gain": 1.7, "opacity": 1.0, "life": 0.3, "tail": 0.9, "feather": 0.4},
		"ring": {"width": 0.3, "fill": 0.1, "hard": 0.0, "gain": 1.7, "double": true}, "trail": {"core": 0.5, "hard": 0.0}},
	"subtle": {"bloom": 0.3, "flash": 0.6, "parts": {"shape": 3, "count": 0.5, "size": 0.8}, "sparks": 0.1,
		"slash": {"width": 0.2, "core": 0.2, "hard": 0.0, "gain": 1.0, "opacity": 0.6, "life": 0.2, "tail": 0.6, "feather": 0.0},
		"ring": {"width": 0.05, "fill": 0.0, "hard": 0.0, "gain": 1.0, "double": false}, "trail": {"core": 0.2, "hard": 0.0}},
}

const PART_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, skip_vertex_transform;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform float world_k = 0.31;   // 粒の大きさ 1 あたりのワールドの大きさ（m）
uniform int shape = 0;   // 0 = 以前の見た目、1 = 星形、2 = にじむ光、3 = 小さな点
varying vec3 vC;
varying float vA;
void vertex() {
	vC = COLOR.rgb;
	vA = INSTANCE_CUSTOM.y;
	vec3 center = (MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	// three.js の gl_PointSize = size * 300 / 距離（ピクセル）= ワールドでの大きさ size * 300 * 2 tan(fov/2) / 画面の高さ。元の画角 50°・高さ 900 px 相当の定数にする
	// （第 3 世代の画角 18° でも、粒の大きさが世界に対して元と同じになる）
	float ws = INSTANCE_CUSTOM.x * world_k;
	VERTEX = center + vec3(VERTEX.xy * ws, 0.0);
	POSITION = PROJECTION_MATRIX * vec4(VERTEX, 1.0);
}
void fragment() {
	vec2 c = UV - 0.5;
	float d = length(c);
	vec3 col = vec3(0.0);
	float a = 0.0;
	if (shape == 0) {
		if (d > 0.5) discard;
		a = 1.0 - smoothstep(0.0, 0.5, d);
		col = vC * (1.0 + a);
	} else if (shape == 1) {
		float dd = abs(c.x) + abs(c.y);
		float cr = max(1.0 - smoothstep(0.0, 0.06, abs(c.x)), 1.0 - smoothstep(0.0, 0.06, abs(c.y))) * (1.0 - smoothstep(0.1, 0.5, d));
		a = max(step(dd, 0.32), cr);
		if (a <= 0.0) discard;
		col = mix(vC, vec3(1.0), 1.0 - smoothstep(0.0, 0.2, dd)) * 1.4;
	} else if (shape == 2) {
		if (d > 0.5) discard;
		a = exp(-d * d * 14.0);
		col = vC * (1.0 + 2.0 * a) + vec3(pow(a, 6.0));
	} else {
		if (d > 0.3) discard;
		a = 1.0 - smoothstep(0.1, 0.3, d);
		col = vC * 1.2;
		a *= 0.9;
	}
	ALBEDO = fxm(col);
	ALPHA = a * vA;
}
"""

## 三日月の帯（斬撃・光波）。頭 uHead が振りの向きへ走り、通ったあとは尾を引いて消える
const BAND_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform vec3 uColor : source_color = vec3(1.0);
uniform float uHead = 0.0;
uniform float uTail = 0.75;
uniform float uCore = 0.3;
uniform float uHard = 0.0;
uniform float uGain = 1.0;
uniform float uOpacity = 1.0;
uniform float uRev = 0.0;
uniform float uFeather = 0.0;
void fragment() {
	float t = mix(UV.x, 1.0 - UV.x, uRev);
	float s = UV.y;
	float behind = uHead - t;
	float sweep = step(0.0, behind) * (1.0 - smoothstep(0.0, uTail, behind));
	float soft = smoothstep(0.0, 0.5, s) * sweep;
	float hard = step(0.12, s) * step(0.15, sweep);
	float f = max(uFeather, 0.0001);
	float edge = 1.0 - smoothstep(1.0 - f, 1.0, s);
	float a = mix(soft, hard, uHard) * edge;
	float c0 = 1.0 - uCore - uFeather * 0.5;
	float c1 = 1.0 - uFeather * 0.5;
	float core = mix(smoothstep(c0, c1, s), step(c0, s), uHard);
	vec3 c = mix(uColor * uGain, vec3(1.0), core * 0.85);
	ALBEDO = fxm(c);
	ALPHA = a * uOpacity;
}
"""

## 衝撃波の輪。円盤の中心からの距離。外周に明るい縁、uFill で内側を塗る。地形より手前に描く（深度を見ない）
const RING_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, depth_test_disabled, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform vec3 uColor : source_color = vec3(1.0);
uniform float uK = 0.0;
uniform float uWidth = 0.3;
uniform float uFill = 0.0;
uniform float uHard = 0.0;
uniform float uGain = 1.0;
void fragment() {
	float r = length(UV - 0.5) * 2.0;
	float wave = smoothstep(1.0 - 2.0 * uWidth, 1.0 - 0.5 * uWidth, r) * (1.0 - smoothstep(1.0 - 0.5 * uWidth, 1.0, r));
	float band = mix(wave, step(abs(1.0 - uWidth - r), uWidth), uHard);
	float fill = uFill * smoothstep(0.2, 1.0, r) * step(r, 1.0);
	float a = (band + fill) * (1.0 - uK);
	vec3 c = mix(uColor * uGain, vec3(1.0), band * (1.0 - uK) * mix(0.25, 0.4, uHard));
	ALBEDO = fxm(c);
	ALPHA = a;
}
"""

## 色と透明度を uniform で渡す単色の加算（以前の見た目の斬撃・輪・雷）。depth は uDepth で切り替える
const FLAT_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform vec3 uColor : source_color = vec3(1.0);
uniform float uA = 1.0;
void fragment() { ALBEDO = fxm(uColor); ALPHA = uA; }
"""
const FLAT_NODEPTH_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, depth_test_disabled, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform vec3 uColor : source_color = vec3(1.0);
uniform float uA = 1.0;
void fragment() { ALBEDO = fxm(uColor); ALPHA = uA; }
"""

## 光の柱
const BEAM_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
uniform vec3 uColor : source_color = vec3(1.0);
uniform float uTime = 0.0;
uniform float uFade = 1.0;
void fragment() {
	float h = UV.y;   // 0 = 根元 … 1 = 先（_tube が作る向き）
	float a = pow(1.0 - h, 1.6) * (0.6 + 0.4 * sin(h * 20.0 - uTime * 6.0));
	ALBEDO = fxm(uColor * 1.6);
	ALPHA = a * uFade;
}
"""

## 線（雷・火花）。頂点の色と透明度
const LINE_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
vec3 fxm(vec3 c) { return c / (1.0 + 0.35 * c); }   // 仕上げ（階調）の後に足すので、元の（階調の前に足されて明るい所ほど圧縮される）明るさに近づける曲線
void fragment() { ALBEDO = fxm(COLOR.rgb); ALPHA = COLOR.a; }
"""

var st: Variant = null          # Dictionary（様式）か null（classic）
var style_name := "blend"
var ground: Callable = func(_x, _z): return 0.0
var _items: Array = []          # {obj, life, max, update}
var _lights: Array = []         # {l, t, max, i0}

# 粒（fx.js Particles）
var _n := 0
var _p := PackedFloat32Array()
var _v := PackedFloat32Array()
var _c := PackedFloat32Array()
var _s0 := PackedFloat32Array()
var _life := PackedFloat32Array()
var _maxlife := PackedFloat32Array()
var _grav := PackedFloat32Array()
var _drag := PackedFloat32Array()
var _buf := PackedFloat32Array()
var _last_n := 0
var _mm: MultiMesh
var _part_mat: ShaderMaterial
# 線の火花（fx-styles.js Sparks）
var _sparks: Array = []
var _spark_mesh := ImmediateMesh.new()
var _shaders := {}


func _init() -> void:
	for arr in [_p, _v, _c]: arr.resize(MAXP * 3)
	for arr in [_s0, _life, _maxlife, _grav, _drag]: arr.resize(MAXP)
	_buf.resize(MAXP * 20)


func _ready() -> void:
	_part_mat = _mk_shader_mat(PART_SHADER)
	var q := QuadMesh.new(); q.size = Vector2(1, 1)
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.use_custom_data = true
	_mm.mesh = q
	_mm.instance_count = MAXP
	_mm.visible_instance_count = 0
	_mm.custom_aabb = AABB(Vector3(-4000, -4000, -4000), Vector3(8000, 8000, 8000))
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = _mm
	mmi.material_override = _part_mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	var sl := MeshInstance3D.new()
	sl.mesh = _spark_mesh
	sl.material_override = _mk_shader_mat(LINE_SHADER)
	sl.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sl.extra_cull_margin = 16384
	add_child(sl)
	for i in 4:
		var l := OmniLight3D.new()
		l.light_energy = 0.0; l.omni_range = 10.0; l.omni_attenuation = 2.0; l.shadow_enabled = false
		add_child(l)
		_lights.append({"l": l, "t": 0.0, "max": 1.0, "i0": 0.0})
	set_style(style_name)


## 'classic' か知らない名前は以前の見た目
func set_style(name: String) -> void:
	style_name = name
	st = STYLES.get(name)
	if _part_mat != null: _part_mat.set_shader_parameter("shape", int(st["parts"]["shape"]) if st != null else 0)


func bloom() -> float: return float(st["bloom"]) if st != null else 0.5


func _mk_shader_mat(code: String) -> ShaderMaterial:
	var sh: Shader = _shaders.get(code)
	if sh == null:
		sh = Shader.new(); sh.code = code; _shaders[code] = sh
	var m := ShaderMaterial.new()
	m.shader = sh
	m.render_priority = PRIO
	return m


static func color_of(c) -> Color:
	if c is Color: return c
	if c is String: return Color.html(c)
	return Color.hex((int(c) << 8) | 0xFF)


func _ground(x: float, z: float) -> float: return float(ground.call(x, z))


# ---------------------------------------------------------------- 粒（fx.js Particles）
## emit(x, y, z, o): y は地面からの高さ（o.abs ならワールドの高さ）
func emit(x: float, y: float, z: float, o: Dictionary = {}) -> void:
	if _n >= MAXP: return
	var i := _n
	_n += 1
	var col := color_of(o.get("color", 0xffffff) if o.get("color") != null else 0xffffff).srgb_to_linear()
	var sp := float(o.get("speed", 3)) if o.get("speed") != null else 3.0
	var sp2 := float(o.get("spread", 1)) if o.get("spread") != null else 1.0
	var dir = o.get("dir")
	if not bool(o.get("abs", false)): y += _ground(x, z)
	var jit := float(o.get("jitter", 0.0)) if o.get("jitter") != null else 0.0
	_p[i * 3] = x + (randf() - 0.5) * jit
	_p[i * 3 + 1] = y
	_p[i * 3 + 2] = z + (randf() - 0.5) * jit
	if dir is Array:
		_v[i * 3] = float(dir[0]) * sp + (randf() - 0.5) * sp2
		_v[i * 3 + 1] = float(dir[1]) * sp + (randf() - 0.5) * sp2
		_v[i * 3 + 2] = float(dir[2]) * sp + (randf() - 0.5) * sp2
	else:
		var th := randf() * TAU
		var ph := acos(2.0 * randf() - 1.0)
		var s := sp * (0.3 + randf() * 0.7)
		var up := float(o.get("up", 1.0)) if o.get("up") != null else 1.0
		_v[i * 3] = sin(ph) * cos(th) * s
		_v[i * 3 + 1] = absf(cos(ph)) * s * up
		_v[i * 3 + 2] = sin(ph) * sin(th) * s
	_c[i * 3] = col.r; _c[i * 3 + 1] = col.g; _c[i * 3 + 2] = col.b
	_s0[i] = (float(o.get("size", 0.5)) if o.get("size") != null else 0.5) * (0.6 + randf() * 0.8)
	var lf := (float(o.get("life", 0.8)) if o.get("life") != null else 0.8) * (0.6 + randf() * 0.8)
	_life[i] = lf; _maxlife[i] = lf
	_grav[i] = float(o.get("gravity", -6.0)) if o.get("gravity") != null else -6.0
	_drag[i] = float(o.get("drag", 2.0)) if o.get("drag") != null else 2.0


## StyledFX の parts.burst: 様式の粒の数・大きさの倍率。速く飛び散る粒（当たり・弾き）には線の火花も添える
func burst(x: float, y: float, z: float, count: float, o: Dictionary = {}) -> void:
	if st == null:
		for k in int(count): emit(x, y, z, o)
		return
	var P: Dictionary = st["parts"]
	var n := maxi(1, int(roundf(count * float(P["count"]))))
	var o2 := o.duplicate()
	o2["size"] = (float(o.get("size", 0.5)) if o.get("size") != null else 0.5) * float(P["size"])
	for k in n: emit(x, y, z, o2)
	var spd := float(o.get("speed", 3)) if o.get("speed") != null else 3.0
	if spd >= 5.0 and float(st["sparks"]) > 0.0:
		var gy := y if bool(o.get("abs", false)) else y + _ground(x, z)
		var col = o.get("color") if o.get("color") != null else 0xffffff
		var sn := int(roundf(count * float(st["sparks"])))
		for k in sn: _spark(x, gy, z, (float(o.get("speed", 6)) if o.get("speed") != null else 6.0) * 1.6, col)


func _update_parts(dt: float) -> void:
	var i := 0
	while i < _n:
		_life[i] -= dt
		if _life[i] <= 0.0:
			_kill(i)
			continue
		var d := maxf(0.0, 1.0 - _drag[i] * dt)
		_v[i * 3] *= d
		_v[i * 3 + 1] = _v[i * 3 + 1] * d + _grav[i] * dt
		_v[i * 3 + 2] *= d
		_p[i * 3] += _v[i * 3] * dt
		_p[i * 3 + 1] += _v[i * 3 + 1] * dt
		_p[i * 3 + 2] += _v[i * 3 + 2] * dt
		i += 1
	if _n == 0 and _last_n == 0: return
	for j in _n:
		var k := _life[j] / _maxlife[j]
		var o := j * 20
		_buf[o] = 1.0; _buf[o + 1] = 0.0; _buf[o + 2] = 0.0; _buf[o + 3] = _p[j * 3]
		_buf[o + 4] = 0.0; _buf[o + 5] = 1.0; _buf[o + 6] = 0.0; _buf[o + 7] = _p[j * 3 + 1]
		_buf[o + 8] = 0.0; _buf[o + 9] = 0.0; _buf[o + 10] = 1.0; _buf[o + 11] = _p[j * 3 + 2]
		_buf[o + 12] = _c[j * 3]; _buf[o + 13] = _c[j * 3 + 1]; _buf[o + 14] = _c[j * 3 + 2]; _buf[o + 15] = 1.0
		_buf[o + 16] = _s0[j] * (0.4 + 0.6 * k)   # 大きさ
		_buf[o + 17] = minf(1.0, k * 2.5)          # 透明度
		_buf[o + 18] = 0.0; _buf[o + 19] = 0.0
	_mm.buffer = _buf
	_mm.visible_instance_count = _n
	_last_n = _n


func _kill(i: int) -> void:
	_n -= 1
	var j := _n
	if i == j: return
	for k in 3:
		_p[i * 3 + k] = _p[j * 3 + k]; _v[i * 3 + k] = _v[j * 3 + k]; _c[i * 3 + k] = _c[j * 3 + k]
	_s0[i] = _s0[j]; _life[i] = _life[j]; _maxlife[i] = _maxlife[j]; _grav[i] = _grav[j]; _drag[i] = _drag[j]


# ---------------------------------------------------------------- 線の火花（Sparks）
func _spark(x: float, y: float, z: float, speed: float, color) -> void:
	if _sparks.size() >= 1200: return
	var th := randf() * TAU
	var up := randf() * 0.9
	var s := speed * (0.6 + randf() * 0.8)
	var tint := color_of(color).srgb_to_linear()
	_sparks.append({"x": x, "y": y, "z": z, "vx": cos(th) * s, "vy": up * s, "vz": sin(th) * s, "life": 0.18 + randf() * 0.14, "tint": tint})


func _update_sparks(dt: float) -> void:
	_spark_mesh.clear_surfaces()
	if _sparks.is_empty(): return
	_spark_mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	var i := _sparks.size() - 1
	while i >= 0:
		var p: Dictionary = _sparks[i]
		p["life"] -= dt
		if p["life"] <= 0.0:
			_sparks.remove_at(i)
		i -= 1
	for p in _sparks:
		p["vy"] -= 18.0 * dt
		p["x"] += p["vx"] * dt; p["y"] += p["vy"] * dt; p["z"] += p["vz"] * dt
		var k := 0.045   # 線の長さ（速さ × 秒）
		var a := minf(1.0, float(p["life"]) / 0.12)
		var tint: Color = (p["tint"] as Color).lerp(Color.WHITE, 0.5) * 1.6
		_spark_mesh.surface_set_color(Color(tint.r, tint.g, tint.b, a))
		_spark_mesh.surface_add_vertex(Vector3(p["x"], p["y"], p["z"]))
		_spark_mesh.surface_set_color(Color(tint.r, tint.g, tint.b, 0.0))
		_spark_mesh.surface_add_vertex(Vector3(p["x"] - p["vx"] * k, p["y"] - p["vy"] * k, p["z"] - p["vz"] * k))
	_spark_mesh.surface_end()


# ---------------------------------------------------------------- 一時的なもの（fx.js add / update）
func add_item(obj: Node3D, life: float, update: Callable = Callable()) -> Node3D:
	add_child(obj)
	_items.append({"obj": obj, "life": life, "max": life, "update": update})
	return obj


## true のとき自分では進めない（撮影の確認で、決まった刻みで update を呼ぶ）
var manual := false

func _process(dt: float) -> void:
	if not manual: update(dt)


func update(dt: float) -> void:
	_update_parts(dt)
	_update_sparks(dt)
	var i := _items.size() - 1
	while i >= 0:
		var it: Dictionary = _items[i]
		it["life"] = float(it["life"]) - dt
		var k := 1.0 - maxf(0.0, float(it["life"])) / float(it["max"])
		if (it["update"] as Callable).is_valid(): (it["update"] as Callable).call(it["obj"], k, dt)
		if float(it["life"]) <= 0.0:
			if is_instance_valid(it["obj"]): (it["obj"] as Node).queue_free()
			_items.remove_at(i)
		i -= 1
	for L in _lights:
		L["t"] = maxf(0.0, float(L["t"]) - dt)
		(L["l"] as OmniLight3D).light_energy = float(L["i0"]) * (float(L["t"]) / float(L["max"])) if float(L["max"]) > 0.0 else 0.0


func clear() -> void:
	for it in _items:
		if is_instance_valid(it["obj"]): (it["obj"] as Node).queue_free()
	_items.clear()
	_n = 0; _last_n = 0
	if _mm != null: _mm.visible_instance_count = 0
	_sparks.clear()


## flash(x, y, z, color, intensity = 30, life = 0.25, dist = 12): 点光源（4 つのプールで一番古いものを使う）
func flash(x: float, y: float, z: float, color, intensity := 30.0, life := 0.25, dist := 12.0) -> void:
	var L: Dictionary = _lights[0]
	for q in _lights:
		if float(q["t"]) < float(L["t"]): L = q
	var l: OmniLight3D = L["l"]
	l.position = Vector3(x, y + _ground(x, z), z)
	l.light_color = color_of(color)
	l.omni_range = dist
	L["t"] = life; L["max"] = life
	L["i0"] = intensity * (float(st["flash"]) if st != null else 1.0) * LIGHT_K


# ---------------------------------------------------------------- 斬撃・光波
## 三日月の帯（前 = +z）。uv.x 0〜1 は振りの向き、uv.y 0 内側〜1 外側。両端ほど細く、真ん中が太い
func _crescent(rng: float, arc: float, width: float) -> ArrayMesh:
	var N := 40
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var idx := PackedInt32Array()
	for i in N + 1:
		var t := float(i) / N
		var phi := -arc / 2.0 + arc * t
		var thick := rng * width * pow(sin(PI * t), 0.6)
		for pair in [[0.0, rng - thick], [1.0, rng]]:
			pos.append(Vector3(sin(phi) * pair[1], 0, cos(phi) * pair[1])); uv.append(Vector2(t, pair[0]))
	for i in N:
		var a := i * 2
		idx.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
	return _mk_mesh(pos, uv, idx)


## 輪の扇（以前の見た目の斬撃 / 光波）。RingGeometry(r0, r1, seg, 1, 中心 +z, arc)
func _fan(r0: float, r1: float, arc: float, seg: int) -> ArrayMesh:
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var idx := PackedInt32Array()
	for i in seg + 1:
		var phi := -arc / 2.0 + arc * float(i) / seg
		for r in [r0, r1]:
			pos.append(Vector3(sin(phi) * r, 0, cos(phi) * r)); uv.append(Vector2(float(i) / seg, 0.0 if r == r0 else 1.0))
	for i in seg:
		var a := i * 2
		idx.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
	return _mk_mesh(pos, uv, idx)


func _ring_mesh(r0: float, r1: float, seg: int) -> ArrayMesh:
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var idx := PackedInt32Array()
	for i in seg + 1:
		var t := TAU * float(i) / seg
		for r in [r0, r1]:
			pos.append(Vector3(cos(t) * r, 0, sin(t) * r)); uv.append(Vector2(0, 0))
	for i in seg:
		var a := i * 2
		idx.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
	return _mk_mesh(pos, uv, idx)


func _mk_mesh(pos: PackedVector3Array, uv: PackedVector2Array, idx: PackedInt32Array) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	m.custom_aabb = AABB(Vector3(-100, -100, -100), Vector3(200, 200, 200))
	return m


func _band_mat(color, S: Dictionary, rev: bool) -> ShaderMaterial:
	var m := _mk_shader_mat(BAND_SHADER)
	m.set_shader_parameter("uColor", color_of(color))
	m.set_shader_parameter("uHead", 0.0)
	m.set_shader_parameter("uTail", float(S["tail"]))
	m.set_shader_parameter("uCore", float(S["core"]))
	m.set_shader_parameter("uHard", float(S["hard"]))
	m.set_shader_parameter("uGain", float(S["gain"]))
	m.set_shader_parameter("uOpacity", float(S["opacity"]))
	m.set_shader_parameter("uRev", 1.0 if rev else 0.0)
	m.set_shader_parameter("uFeather", float(S.get("feather", 0.0)))
	return m


func _flat_mat(color, a: float, nodepth := false) -> ShaderMaterial:
	var m := _mk_shader_mat(FLAT_NODEPTH_SHADER if nodepth else FLAT_SHADER)
	m.set_shader_parameter("uColor", color_of(color))
	m.set_shader_parameter("uA", a)
	return m


func _mesh_node(mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## 扇の範囲で一番高い地面（坂でも扇が埋まらないように）
func _fan_ground(x: float, z: float, a: float, rng: float, arc: float) -> float:
	var gy := _ground(x, z)
	for i in 6:
		var t := a + (float(i) / 5.0 - 0.5) * arc
		for f in [0.5, 1.0]: gy = maxf(gy, _ground(x + sin(t) * rng * f, z + cos(t) * rng * f))
	return gy


## 斬撃: 三日月が振りの向きへ走って消える（classic は輪の扇が薄くなる）
func slash(x: float, z: float, a: float, rng: float, arc_deg: float, color, y := 1.0, reverse := false) -> void:
	var arc := deg_to_rad(arc_deg)
	var gy := _fan_ground(x, z, a, rng, arc)
	if st == null:
		var mat := _flat_mat(color, 0.9)
		var mesh := _mesh_node(_fan(rng * 0.35, rng, arc, 32), mat)
		mesh.position = Vector3(x, y + gy, z); mesh.rotation = Vector3(0, a, 0.25 if reverse else -0.25)
		add_item(mesh, 0.22, func(o, k, _dt): mat.set_shader_parameter("uA", 0.9 * (1.0 - k)); (o as Node3D).scale = Vector3.ONE * (0.85 + k * 0.25))
		for i in 10:
			var t := (randf() - 0.5) * arc + a
			var r := rng * (0.5 + randf() * 0.5)
			emit(x + sin(t) * r, y, z + cos(t) * r, {"color": color, "size": 0.35, "life": 0.35, "speed": 2, "gravity": 0})
		return
	var S: Dictionary = st["slash"]
	var mat := _band_mat(color, S, reverse)
	var mesh := _mesh_node(_crescent(rng, arc, float(S["width"])), mat)
	mesh.position = Vector3(x, y + gy, z); mesh.rotation = Vector3(0, a, 0.25 if reverse else -0.25)
	add_item(mesh, float(S["life"]), func(o, k, _dt):
		mat.set_shader_parameter("uHead", k * (1.0 + float(S["tail"])) * 1.15)
		(o as Node3D).scale = Vector3.ONE * (0.92 + k * 0.12))
	for i in 10:
		var t := (randf() - 0.5) * arc + a
		var r := rng * (0.7 + randf() * 0.3)
		emit(x + sin(t) * r, y, z + cos(t) * r, {"color": color, "size": 0.35 * float(st["parts"]["size"]), "life": 0.35, "speed": 2, "gravity": 0})


## 衝撃波: 縁の光る輪（アニメ調・A+B は少し遅れてもう 1 本）
func ring_wave(x: float, z: float, color, max_r := 6.0, life := 0.45, y := 0.15, _width := 0.6) -> void:
	if st == null:
		var mat := _flat_mat(color, 1.0, true)
		var mesh := _mesh_node(_ring_mesh(0.8, 1.0, 48), mat)
		mesh.position = Vector3(x, y + _ground(x, z), z)
		add_item(mesh, life, func(o, k, _dt):
			var r := 0.5 + max_r * sqrt(k)
			(o as Node3D).scale = Vector3(r, 1, r)
			mat.set_shader_parameter("uA", 1.0 - k))
		return
	var R: Dictionary = st["ring"]
	_ring_one(x, z, color, max_r, life, y, R, 0.0, 1.0)
	if bool(R["double"]): _ring_one(x, z, color, max_r, life, y, R, life * 0.25, 0.7)


func _ring_one(x: float, z: float, color, max_r: float, life: float, y: float, R: Dictionary, delay: float, scale: float) -> void:
	var m := _mk_shader_mat(RING_SHADER)
	m.set_shader_parameter("uColor", color_of(color))
	m.set_shader_parameter("uWidth", float(R["width"]))
	m.set_shader_parameter("uFill", float(R["fill"]))
	m.set_shader_parameter("uHard", float(R["hard"]))
	m.set_shader_parameter("uGain", float(R["gain"]))
	m.set_shader_parameter("uK", 0.0)
	var pm := PlaneMesh.new(); pm.size = Vector2(2, 2)
	var mesh := _mesh_node(pm, m)
	mesh.position = Vector3(x, y + _ground(x, z), z)
	mesh.visible = false
	add_item(mesh, life + delay, func(o, k, _dt):
		var t := maxf(0.0, (k * (life + delay) - delay) / life)
		(o as Node3D).visible = t > 0.0
		var r := 0.5 + max_r * scale * sqrt(t)
		(o as Node3D).scale = Vector3(r, 1, r)
		m.set_shader_parameter("uK", t))


## 光の柱（ドロップ・レベルアップ・技の演出）
func beam(x: float, z: float, color, height := 14.0, radius := 0.45, life := 1.0) -> void:
	var cm := _tube(radius, radius * 1.4, height, 16)
	var m := _mk_shader_mat(BEAM_SHADER)
	m.set_shader_parameter("uColor", color_of(color))
	m.set_shader_parameter("uTime", 0.0)
	var mesh := _mesh_node(cm, m)
	var clock := [0.0]
	var root := Node3D.new()
	root.add_child(mesh)
	root.position = Vector3(x, _ground(x, z), z)
	add_item(root, life, func(o, k, dt):
		clock[0] += dt
		m.set_shader_parameter("uTime", clock[0])
		m.set_shader_parameter("uFade", 1.0 - k)
		(o as Node3D).scale = Vector3(1.0 + k * 1.5, 1.0, 1.0 + k * 1.5))


## 筒（上下の蓋なし）。uv.y: 0 = 根元 … 1 = 先（CylinderGeometry(上の半径, 下の半径, 高さ, 分割, 1, true) を根元から上へ）
func _tube(r_top: float, r_bot: float, height: float, seg: int) -> ArrayMesh:
	var pos := PackedVector3Array(); var uv := PackedVector2Array(); var idx := PackedInt32Array()
	for i in seg + 1:
		var t := TAU * float(i) / seg
		pos.append(Vector3(sin(t) * r_bot, 0.0, cos(t) * r_bot)); uv.append(Vector2(float(i) / seg, 0.0))
		pos.append(Vector3(sin(t) * r_top, height, cos(t) * r_top)); uv.append(Vector2(float(i) / seg, 1.0))
	for i in seg:
		var a := i * 2
		idx.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
	return _mk_mesh(pos, uv, idx)


func lightning(x: float, z: float, color = 0xbfd8ff) -> void:
	var pts: Array[Vector3] = []
	var px := x + (randf() - 0.5) * 2.0
	var pz := z + (randf() - 0.5) * 2.0
	var y := 18.0
	while y >= 0.0:
		pts.append(Vector3(px, y, pz))
		px += (randf() - 0.5) * 1.4; pz += (randf() - 0.5) * 1.4
		if y < 3.0:
			px = px * 0.5 + x * 0.5; pz = pz * 0.5 + z * 0.5
		y -= 1.5
	pts.append(Vector3(x, 0, z))
	var g0 := _ground(x, z)
	var im := ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for p in pts: im.surface_add_vertex(p + Vector3(0, g0, 0))
	im.surface_end()
	var mat := _flat_mat(color, 1.0)
	var mi := _mesh_node(im, mat)
	mi.extra_cull_margin = 16384
	add_item(mi, 0.25, func(_o, k, _dt): mat.set_shader_parameter("uA", (1.0 - k) if randf() > 0.3 else 0.2))
	flash(x, 4.0, z, color, 60.0, 0.25, 20.0)
	burst(x, 0.3, z, 30, {"color": color, "size": 0.5, "speed": 8, "life": 0.4})
	ring_wave(x, z, color, 3.5, 0.35)
	if st != null and float(st["sparks"]) > 0.0:
		for i in int(24.0 * float(st["sparks"])): _spark(x, 0.3 + _ground(x, z), z, 12.0, color)


## 飛ぶ光波の板（斬撃波）。前 = +z（呼び出し側が rotation.y を向きに合わせる）。classic は輪の扇（不透明度は update_projs が 0.9 * (1 - t / life) にする）
func wave_mesh(color) -> MeshInstance3D:
	if st == null:
		return _mesh_node(_fan(0.9, 1.5, 1.8, 24), _flat_mat(color, 0.9))
	var S: Dictionary = (st["slash"] as Dictionary).duplicate()
	S["tail"] = 9.0
	var m := _band_mat(color, S, false)
	m.set_shader_parameter("uHead", 1.0)
	return _mesh_node(_crescent(1.5, 1.8, float(S["width"]) * 1.4), m)
