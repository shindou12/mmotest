extends RefCounted
## 人物の姿勢（動き）を GDScript に移したもの（G2-1）。元は public/js の
##   models.js animatePlayer / setPlayerWeapon、player-motion.js、weapon-motion.js、weapon-pose.js、pose-rig.js、
##   technique-motion.js、motions/index.js・melee.js・styles.js、spear-motion.js、weapons/{sword,greatsword,spear,bow}.js の motion。
## 部品は「名前 → Node3D」の辞書で受ける（あとでゲームの GLB の同じ名前の部品を動かす）。
##   名前: model body head armL armR elbowL elbowR hand handL leg0 leg1 cape weapon weaponModel shield（shield は盾のない武器では無し）
## 表（休みの姿勢・動きの表）は data/rig.json・data/motions.json（tools/worldart/godot/export_rig.mjs が public/ から書く）。手で写さない。
##
## three.js との違いに合わせたこと:
##  - 計算は全部 GDScript の float（64 ビット）。Vector3・Quaternion・Basis（32 ビット）は最後に Node3D の transform を入れるときだけ使う。
##  - three.js の Object3D は rotation（オイラー XYZ）と quaternion が互いに同期している。`rotation.x = v` は y・z を今の値のまま残す。
##    同じ挙動にするため、各部品に e（オイラー）と q（四元数）を両方持ち、片方を変えたらもう片方を three.js と同じ式で更新する（_set_e / _set_q）。
##  - 行列は three.js と同じく「回転 XYZ・列優先」。Godot の Node3D には rotation_order = EULER_ORDER_XYZ を設定する（build_skeleton）。
##  - `.visible` は部品自身の値（親から受け継いだ値ではない）。盾を背負う / 腕に戻すときは reparent する。
##
## 使い方:
##   var tables = PlayerRig.make_tables(motions_json)
##   var nodes = PlayerRig.build_skeleton(rig_json, kind, style)      # または自分の GLB の部品の辞書
##   var r = PlayerRig.new(); r.setup(nodes, rig_json, tables, kind, style)   # setPlayerWeapon 相当
##   r.animate({"t": 1.0, "kind": kind, ...})                           # animatePlayer 相当

const EPS := 2.220446049250313e-16  # Number.EPSILON

## 部品 1 つぶんの three.js 相当の状態
class N:
	var name := ""
	var parent := ""
	var p := [0.0, 0.0, 0.0]
	var e := [0.0, 0.0, 0.0]
	var q := [0.0, 0.0, 0.0, 1.0]
	var s := [1.0, 1.0, 1.0]
	var visible := true
	var node: Node3D = null

var model: N
var body: N
var head: N
var armL: N
var armR: N
var elbowL: N
var elbowR: N
var hand: N
var handL: N
var legs: Array = []
var cape: N
var weapon: N
var weaponModel: N
var shield: N = null
var w_kind := ""
var shield_back := false
var rig: Dictionary = {}
var tables: Dictionary = {}
var bow_sx := 0.0
var all: Array = []


# ---------------------------------------------------------------------------
# 組み立て
# ---------------------------------------------------------------------------

## rig.json から Node3D の骨組みを作る。戻り値は 名前 → Node3D の辞書
static func build_skeleton(rigj: Dictionary, kind: String, style: int) -> Dictionary:
	var nodes := {}
	var root := Node3D.new()
	root.name = "model"
	root.rotation_order = EULER_ORDER_XYZ
	nodes["model"] = root
	var specs := {}
	for n in rigj["parts"]: specs[n] = rigj["parts"][n]
	var wst: Dictionary = rigj["weapons"][kind]["styles"][style]
	specs["weapon"] = wst["weapon"]
	specs["weaponModel"] = wst["weaponModel"]
	if wst["shield"] != null: specs["shield"] = wst["shield"]
	# 親が先に作られるように、親の名前をたどって作る
	var make := func(self_make: Callable, n: String) -> Node3D:
		if nodes.has(n): return nodes[n]
		var spec: Dictionary = specs[n]
		var parent: Node3D = self_make.call(self_make, spec["parent"]) if spec["parent"] != "model" else root
		var o := Node3D.new()
		o.name = n
		o.rotation_order = EULER_ORDER_XYZ
		parent.add_child(o)
		nodes[n] = o
		return o
	for n in specs: make.call(make, n)
	return nodes


## 動きの表（motions.json）から、技ごとのキーフレームを作る。technique-motion.js の TECHNIQUE_FRAMES
static func make_tables(m: Dictionary) -> Dictionary:
	var base: Dictionary = m["base"]
	var frames := {}
	for id in m["motions"]:
		var t: Dictionary = m["motions"][id]
		var style: String = t["style"]
		var fr: Array = []
		if m["keyframes"].has(style):
			for f in m["keyframes"][style]: fr.append(_merge(base, f))
			frames[id] = fr
			continue
		fr.append(_merge(base, {"at": 0.0}))
		var hits: Array = t["hits"]
		for i in hits.size():
			var prof := _profile(m, style, i)
			var hit: float = hits[i]
			var previous: float = hits[i - 1] if i > 0 else 0.0
			var nxt: float = hits[i + 1] if i + 1 < hits.size() else float(t["duration"])
			fr.append(_merge(_merge(base, {"at": maxf(previous + 0.02, hit - 0.12)}), prof[0]))
			fr.append(_merge(_merge(base, {"at": hit}), prof[1]))
			fr.append(_merge(_merge(base, {"at": minf(hit + 0.10, nxt - 0.02)}), prof[1]))
		fr.append(_merge(_merge(base, {"at": float(t["duration"])}), {"bodyYaw": TAU if m["fullTurn"].has(style) else 0.0}))
		# JS の sort は安定。GDScript の sort_custom は安定でないので挿入ソートにする
		for i in range(1, fr.size()):
			var cur = fr[i]
			var j := i - 1
			while j >= 0 and fr[j]["at"] > cur["at"]:
				fr[j + 1] = fr[j]
				j -= 1
			fr[j + 1] = cur
		frames[id] = fr
	return {"m": m, "frames": frames}


static func _merge(a: Dictionary, b: Dictionary) -> Dictionary:
	var o := a.duplicate()
	for k in b: o[k] = b[k]
	return o


## technique-motion.js profile
static func _profile(m: Dictionary, style: String, i: int) -> Array:
	var d: Dictionary = m["styles"][style] if m["styles"].has(style) else m["defaultStyle"]
	if d.has("hits"): return d["hits"][mini(i, d["hits"].size() - 1)]
	return d["pose"]


func _mk(name: String, spec: Dictionary, nodes: Dictionary) -> N:
	var n := N.new()
	n.name = name
	n.parent = spec["parent"]
	n.p = [float(spec["pos"][0]), float(spec["pos"][1]), float(spec["pos"][2])]
	n.s = [float(spec["scl"][0]), float(spec["scl"][1]), float(spec["scl"][2])]
	_set_e(n, float(spec["rot"][0]), float(spec["rot"][1]), float(spec["rot"][2]))
	n.node = nodes.get(name)
	all.append(n)
	return n


## setPlayerWeapon（models.js）相当: 武器と盾を付けて、最後に animatePlayer を 1 回呼ぶ
func setup(nodes: Dictionary, rigj: Dictionary, tabs: Dictionary, kind: String, style: int) -> void:
	rig = rigj
	tables = tabs
	w_kind = kind
	var parts: Dictionary = rigj["parts"]
	var wst: Dictionary = rigj["weapons"][kind]["styles"][style]
	model = N.new()
	model.name = "model"
	model.node = nodes["model"]
	body = _mk("body", parts["body"], nodes)
	head = _mk("head", parts["head"], nodes)
	armL = _mk("armL", parts["armL"], nodes)
	armR = _mk("armR", parts["armR"], nodes)
	elbowL = _mk("elbowL", parts["elbowL"], nodes)
	elbowR = _mk("elbowR", parts["elbowR"], nodes)
	hand = _mk("hand", parts["hand"], nodes)
	handL = _mk("handL", parts["handL"], nodes)
	legs = [_mk("leg0", parts["leg0"], nodes), _mk("leg1", parts["leg1"], nodes)]
	cape = _mk("cape", parts["cape"], nodes)
	weapon = _mk("weapon", wst["weapon"], nodes)
	weaponModel = _mk("weaponModel", wst["weaponModel"], nodes)
	shield = _mk("shield", wst["shield"], nodes) if wst["shield"] != null else null
	bow_sx = float(wst["bowSx"]) if wst["bowSx"] != null else 0.0
	shield_back = false
	_set_e(elbowL, 0, 0, 0)
	_set_e(elbowR, 0, 0, 0)
	animate({"t": 0.0, "moving": false, "walkT": 0.0, "kind": kind, "combo": 0, "swing": -1.0, "spin": -1.0, "sweep": -1.0, "dodge": 0.0, "down": 0.0, "hurt": 0.0})


# ---------------------------------------------------------------------------
# 数学（three.js の Vector3 / Quaternion / Euler と同じ式。配列で持つ: v=[x,y,z] q=[x,y,z,w]）
# ---------------------------------------------------------------------------

static func _clamp(x: float, a: float, b: float) -> float:
	return maxf(a, minf(b, x))


## pose-rig.js ease（clamp なし）
static func _ease(k: float) -> float:
	return k * k * (3.0 - 2.0 * k)


## spear-motion.js ease（0〜1 に収める）
static func _ease_c(x: float) -> float:
	x = _clamp(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


static func _vsub(a: Array, b: Array) -> Array:
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


static func _vadd(a: Array, b: Array) -> Array:
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


## Vector3.addScaledVector（新しい配列を返す）
static func _vaddsc(a: Array, v: Array, s: float) -> Array:
	return [a[0] + v[0] * s, a[1] + v[1] * s, a[2] + v[2] * s]


static func _vmuls(a: Array, s: float) -> Array:
	return [a[0] * s, a[1] * s, a[2] * s]


static func _vdot(a: Array, b: Array) -> float:
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


static func _vcross(a: Array, b: Array) -> Array:
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


static func _vlen(a: Array) -> float:
	return sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


## Vector3.normalize = divideScalar(length || 1) = multiplyScalar(1 / s)
static func _vnorm(a: Array) -> Array:
	var l := _vlen(a)
	if l == 0.0: l = 1.0
	return _vmuls(a, 1.0 / l)


## Vector3.applyQuaternion
static func _vapplyq(v: Array, q: Array) -> Array:
	var x: float = v[0]
	var y: float = v[1]
	var z: float = v[2]
	var qx: float = q[0]
	var qy: float = q[1]
	var qz: float = q[2]
	var qw: float = q[3]
	var ix := qw * x + qy * z - qz * y
	var iy := qw * y + qz * x - qx * z
	var iz := qw * z + qx * y - qy * x
	var iw := -qx * x - qy * y - qz * z
	return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]


## Quaternion.normalize
static func _qnorm(q: Array) -> Array:
	var l := sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3])
	if l == 0.0: return [0.0, 0.0, 0.0, 1.0]
	l = 1.0 / l
	return [q[0] * l, q[1] * l, q[2] * l, q[3] * l]


## Quaternion.multiply（a * b）
static func _qmul(a: Array, b: Array) -> Array:
	var qax: float = a[0]
	var qay: float = a[1]
	var qaz: float = a[2]
	var qaw: float = a[3]
	var qbx: float = b[0]
	var qby: float = b[1]
	var qbz: float = b[2]
	var qbw: float = b[3]
	return [qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
		qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
		qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
		qaw * qbw - qax * qbx - qay * qby - qaz * qbz]


## Quaternion.invert（共役）
static func _qinv(q: Array) -> Array:
	return [-q[0], -q[1], -q[2], q[3]]


## Quaternion.setFromEuler（XYZ）
static func _q_from_euler(x: float, y: float, z: float) -> Array:
	var c1 := cos(x / 2.0)
	var c2 := cos(y / 2.0)
	var c3 := cos(z / 2.0)
	var s1 := sin(x / 2.0)
	var s2 := sin(y / 2.0)
	var s3 := sin(z / 2.0)
	return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]


## Quaternion.setFromAxisAngle
static func _q_from_axis(axis: Array, angle: float) -> Array:
	var h := angle / 2.0
	var s := sin(h)
	return [axis[0] * s, axis[1] * s, axis[2] * s, cos(h)]


## Quaternion.setFromUnitVectors
static func _q_from_unit(vf: Array, vt: Array) -> Array:
	var r := _vdot(vf, vt) + 1.0
	var q: Array
	if r < EPS:
		r = 0.0
		if absf(vf[0]) > absf(vf[2]): q = [-vf[1], vf[0], 0.0, r]
		else: q = [0.0, -vf[2], vf[1], r]
	else:
		q = [vf[1] * vt[2] - vf[2] * vt[1], vf[2] * vt[0] - vf[0] * vt[2], vf[0] * vt[1] - vf[1] * vt[0], r]
	return _qnorm(q)


## Quaternion.setFromRotationMatrix(Matrix4.makeBasis(x, y, z))（x・y・z は列）
static func _q_from_basis(xa: Array, ya: Array, za: Array) -> Array:
	var m11: float = xa[0]
	var m21: float = xa[1]
	var m31: float = xa[2]
	var m12: float = ya[0]
	var m22: float = ya[1]
	var m32: float = ya[2]
	var m13: float = za[0]
	var m23: float = za[1]
	var m33: float = za[2]
	var trace := m11 + m22 + m33
	var sc: float
	if trace > 0.0:
		sc = 0.5 / sqrt(trace + 1.0)
		return [(m32 - m23) * sc, (m13 - m31) * sc, (m21 - m12) * sc, 0.25 / sc]
	elif m11 > m22 and m11 > m33:
		sc = 2.0 * sqrt(1.0 + m11 - m22 - m33)
		return [0.25 * sc, (m12 + m21) / sc, (m13 + m31) / sc, (m32 - m23) / sc]
	elif m22 > m33:
		sc = 2.0 * sqrt(1.0 + m22 - m11 - m33)
		return [(m12 + m21) / sc, 0.25 * sc, (m23 + m32) / sc, (m13 - m31) / sc]
	sc = 2.0 * sqrt(1.0 + m33 - m11 - m22)
	return [(m13 + m31) / sc, (m23 + m32) / sc, 0.25 * sc, (m21 - m12) / sc]


## Quaternion.slerp（a を t だけ qb へ。新しい配列を返す）
static func _qslerp(a: Array, b: Array, t: float) -> Array:
	if t == 0.0: return a.duplicate()
	if t == 1.0: return b.duplicate()
	var x: float = a[0]
	var y: float = a[1]
	var z: float = a[2]
	var w: float = a[3]
	var cos_h: float = w * b[3] + x * b[0] + y * b[1] + z * b[2]
	var r: Array
	if cos_h < 0.0:
		r = [-b[0], -b[1], -b[2], -b[3]]
		cos_h = -cos_h
	else:
		r = b.duplicate()
	if cos_h >= 1.0: return [x, y, z, w]
	var sqr := 1.0 - cos_h * cos_h
	if sqr <= EPS:
		var s := 1.0 - t
		return _qnorm([s * x + t * r[0], s * y + t * r[1], s * z + t * r[2], s * w + t * r[3]])
	var sin_h := sqrt(sqr)
	var half := atan2(sin_h, cos_h)
	var ra := sin((1.0 - t) * half) / sin_h
	var rb := sin(t * half) / sin_h
	return [x * ra + r[0] * rb, y * ra + r[1] * rb, z * ra + r[2] * rb, w * ra + r[3] * rb]


## Euler.setFromQuaternion（XYZ）= makeRotationFromQuaternion → Euler.setFromRotationMatrix
static func _e_from_q(q: Array) -> Array:
	var x: float = q[0]
	var y: float = q[1]
	var z: float = q[2]
	var w: float = q[3]
	var x2 := x + x
	var y2 := y + y
	var z2 := z + z
	var xx := x * x2
	var xy := x * y2
	var xz := x * z2
	var yy := y * y2
	var yz := y * z2
	var zz := z * z2
	var wx := w * x2
	var wy := w * y2
	var wz := w * z2
	var m11 := 1.0 - (yy + zz)
	var m21 := xy + wz
	var m12 := xy - wz
	var m22 := 1.0 - (xx + zz)
	var m32 := yz + wx
	var m13 := xz + wy
	var m23 := yz - wx
	var m33 := 1.0 - (xx + yy)
	var ey := asin(_clamp(m13, -1.0, 1.0))
	if absf(m13) < 0.9999999:
		return [atan2(-m23, m33), ey, atan2(-m12, m11)]
	return [atan2(m32, m22), ey, 0.0]


# ---------------------------------------------------------------------------
# 部品の rotation / quaternion（three.js の同期と同じ）
# ---------------------------------------------------------------------------

static func _set_e(n: N, x: float, y: float, z: float) -> void:
	n.e = [x, y, z]
	n.q = _q_from_euler(x, y, z)


static func _set_ex(n: N, v: float) -> void:
	_set_e(n, v, n.e[1], n.e[2])


static func _set_ey(n: N, v: float) -> void:
	_set_e(n, n.e[0], v, n.e[2])


static func _set_q(n: N, q: Array) -> void:
	n.q = q.duplicate()
	n.e = _e_from_q(q)


# ---------------------------------------------------------------------------
# 状態 s の読み取り（JavaScript の undefined / 真偽 / 比較と同じ扱い）
# ---------------------------------------------------------------------------

static func _truthy(v) -> bool:
	if v == null: return false
	if v is bool: return v
	if v is float or v is int: return v != 0
	if v is String: return v != ""
	return true


static func _b(s: Dictionary, k: String) -> bool:
	return _truthy(s.get(k))


## s[k] >= 0（未定義は false）
static func _ge0(s: Dictionary, k: String) -> bool:
	var v = s.get(k)
	return (v is float or v is int) and v >= 0


## s[k] > 0（未定義は false）
static func _gt0(s: Dictionary, k: String) -> bool:
	var v = s.get(k)
	return (v is float or v is int) and v > 0


static func _f(s: Dictionary, k: String, d: float) -> float:
	var v = s.get(k)
	if v is float or v is int: return float(v)
	return d


## `s.x || 0`
static func _f0(s: Dictionary, k: String) -> float:
	var v = s.get(k)
	if (v is float or v is int) and v != 0: return float(v)
	return 0.0


# ---------------------------------------------------------------------------
# pose-rig.js
# ---------------------------------------------------------------------------

## aimHand(arm, elbow, goal, bend): 腕 2 本ぶんの関節を目標の手の位置へ向ける。握りの位置（体の空間）を返す
func _aim_hand(arm: N, elbow: N, goal: Array, bend: Array) -> Array:
	var direction := _vsub(goal, arm.p)
	var distance := _clamp(_vlen(direction), 0.03, 0.595)
	direction = _vnorm(direction)
	var side := _vaddsc(bend, direction, -_vdot(bend, direction))
	if side[0] * side[0] + side[1] * side[1] + side[2] * side[2] < 1e-6:
		side = _vaddsc([0.0, 0.0, 1.0], direction, -direction[2])
	side = _vnorm(side)
	var joint := _vaddsc(_vmuls(direction, distance / 2.0), side, sqrt(pow(0.3, 2.0) - pow(distance / 2.0, 2.0)))
	var target := _vmuls(direction, distance)
	_set_q(arm, _q_from_unit([0.0, -1.0, 0.0], _vnorm(joint)))
	var forearm := _q_from_unit([0.0, -1.0, 0.0], _vnorm(_vsub(target, joint)))
	_set_q(elbow, _qmul(_qinv(arm.q), forearm))
	return _vadd(target, arm.p)


## orientWeapon(u, yaw, pitch, roll): 刃の向きを（腕の回転を打ち消して）武器の quaternion にする
func _orient_weapon(yaw: float, pitch: float, roll: float = 0.0) -> void:
	var width := [cos(yaw), 0.0, -sin(yaw)]
	var shaft := [sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)]
	var normal := _vnorm(_vcross(width, shaft))
	if roll != 0.0:
		var c := cos(roll)
		var s := sin(roll)
		width = _vaddsc(_vmuls(width, c), normal, s)
		normal = _vnorm(_vcross(width, shaft))
	var desired := _q_from_basis(width, shaft, normal)
	var off_hand: bool = rig["weapons"][w_kind]["offHand"]
	var arm: N = armL if off_hand else armR
	var elbow: N = elbowL if off_hand else elbowR
	_set_q(weapon, _qmul(_qinv(_qmul(arm.q, elbow.q)), desired))


func _axis(yaw: float, pitch: float) -> Array:
	return [sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)]


# ---------------------------------------------------------------------------
# animatePlayer（player-motion.js）
# ---------------------------------------------------------------------------

func animate(s: Dictionary) -> void:
	_animate(s)
	_apply()


func _animate(s: Dictionary) -> void:
	_set_e(elbowL, 0, 0, 0)
	_set_e(elbowR, 0, 0, 0)
	_set_ey(head, 0.0)
	var moving := _b(s, "moving")
	var walk := sin(_f(s, "walkT", 0.0) * 10.0) if moving else 0.0
	_set_ex(legs[0], walk * 0.75)
	_set_ex(legs[1], -walk * 0.75)
	if _b(s, "guard") and not shield_back:
		# ガード: 盾を前に突き出して構える
		_set_e(armL, -1.35, 0.0, 0.45)
		if shield != null: _set_e(shield, PI / 2.0, 0.0, 0.0)
	else:
		_set_e(armL, -walk * 0.6, 0.0, -0.15)
		if shield != null and not shield_back: _set_e(shield, 0.0, -PI / 2.0 + 0.25, 0.0)
	var t := _f(s, "t", 0.0)
	body.p[1] = absf(cos(_f(s, "walkT", 0.0) * 10.0)) * 0.07 if moving else sin(t * 2.0) * 0.015
	_set_ex(head, 0.05 if moving else sin(t * 1.3) * 0.03)
	_set_ex(cape, -0.35 - absf(walk) * 0.1 if moving else -0.06 + sin(t * 1.7) * 0.03)
	_attack_motion(s, walk)
	if _gt0(s, "dodge"):
		var d := _f(s, "dodge", 0.0)
		_set_ex(body, (1.0 - d) * PI * 2.0)
		body.p[1] = 0.4 * sin((1.0 - d) * PI)
	elif _b(s, "crawl"):
		# 這いずり: うつ伏せで、腕を交互に前へ伸ばして地面をかき、脚で蹴る
		var c := sin(_f(s, "walkT", 0.0) * 7.0) if moving else 0.0
		var br := sin(t * 2.0) * 0.04
		_set_ex(body, 1.38)
		body.p[1] = 0.2 + absf(c) * 0.03
		_set_e(armR, -2.5 - c * 0.55 + br, 0.0, 0.35)
		_set_e(armL, -2.5 + c * 0.55 + br, 0.0, -0.35)
		_set_ex(elbowR, -0.5 - maxf(0.0, c) * 0.6)
		_set_ex(elbowL, -0.5 - maxf(0.0, -c) * 0.6)
		_set_ex(legs[0], -0.15 + c * 0.35)
		_set_ex(legs[1], -0.15 - c * 0.35)
		_set_ex(head, -0.75)
		_set_ex(cape, -0.2)
	elif _gt0(s, "down"):
		# ダウン: 仰向けに倒れる
		var dn := _f(s, "down", 0.0)
		_set_ex(body, -dn * 1.45)
		body.p[1] = 0.12 * dn
		_set_e(armR, -2.6 * dn, 0.0, 0.5)
		_set_e(armL, -2.6 * dn, 0.0, -0.5)
		_set_ex(legs[0], 0.3 * dn)
		_set_ex(legs[1], -0.15 * dn)
		_set_ex(head, -0.3 * dn)
	elif _gt0(s, "hurt"):
		# のけぞり
		var h := _f(s, "hurt", 0.0)
		_set_ex(body, -h * 0.35)
		_set_ex(head, -h * 0.4)
	else:
		_set_ex(body, 0.0)
	# 盾の光（材質の色・透明度）は行列に関係しないので移さない
	_update_weapon_pose(s)
	# 竜騎士: 盾を背負う（腕から背中へ付け替える）
	if shield != null and _b(s, "shieldBack") != shield_back:
		shield_back = _b(s, "shieldBack")
		if shield_back:
			shield.parent = "body"
			shield.p = [0.0, 1.05, -0.28]
			_set_e(shield, 0.15, PI, 0.0)
		else:
			shield.parent = "elbowL"
			shield.p = [-0.08, -0.14, 0.12]
	if shield != null and not shield_back and not _gt0(s, "down"):
		# 盾は前腕が曲がっていても、体の空間で前を向く
		_set_q(shield, _qinv(_qmul(armL.q, elbowL.q)))
	# 這いずり中は武器と盾を見せない
	if weapon != null: weapon.visible = not _b(s, "crawl")
	if shield != null: shield.visible = not _b(s, "crawl")
	model.visible = not _b(s, "dead")


## applyAttackMotion（weapon-motion.js）
func _attack_motion(s: Dictionary, walk: float) -> void:
	if _ge0(s, "sweep"):
		_set_ey(body, _f(s, "sweep", 0.0))
		_set_e(armR, -0.15, 0.0, 1.25)
		armR.p[2] = 0.0
	elif _ge0(s, "swing"):
		var k := _f(s, "swing", 0.0)
		var e := k / 0.25 if k < 0.25 else 1.0 - (k - 0.25) / 0.75 * 0.3
		var dir := 1.0 if int(_f0(s, "combo")) % 2 == 0 else -1.0
		_swing(String(s.get("kind", "")), s, e, dir)
		if w_kind == "bow": _set_ex(weapon, PI / 2.0)  # afterSwing（弓）
	elif _ge0(s, "spin"):
		_set_ey(body, _f(s, "spin", 0.0) * PI * 4.0)
		_set_e(armR, -PI / 2.0, 0.0, 0.0)
	else:
		_set_e(armR, walk * 0.4 - 0.25, 0.0, 0.12)
		armR.p[2] = 0.0
		_set_ey(body, 0.0)
		if w_kind == "bow": _set_ex(weapon, 0.0)  # rest（弓）


## weaponMotion(kind).swing
func _swing(kind: String, s: Dictionary, e: float, dir: float) -> void:
	match kind:
		"spear":
			armR.p[2] = 0.0
			_set_ey(body, 0.0)
		"bow":
			_set_e(armR, -PI / 2.0, 0.0, 0.1)
			armR.p[2] = 0.0
			_set_e(armL, -PI / 2.0 + 0.2, 0.0, -0.6 + e * 0.3)
			_set_ey(body, 0.0)
		_:
			# applyMeleeSwing（melee.js）
			_set_e(armR, -1.4 + e * 0.2, 0.0, dir * (1.4 - e * 2.8))
			armR.p[2] = 0.0
			_set_ey(body, dir * (0.5 - e) * 0.6)


## updateWeaponPose（weapon-pose.js）。握り手の飾り（alignGripHand）は行列を見ないので移さない
func _update_weapon_pose(s: Dictionary) -> void:
	if weapon == null: return
	if not _technique_pose(s):
		if _gt0(s, "down"): _set_e(weapon, PI / 2.0, 0.0, 0.0)
		else: _pose(w_kind, s)


## weaponMotion(kind).pose
func _pose(kind: String, s: Dictionary) -> void:
	match kind:
		"sword": _sword_pose(s)
		"greatsword": _greatsword_pose(s)
		"spear": _spear_pose(s)
		"bow": _bow_pose(s)
		_: _melee_pose(s)


# ---------------------------------------------------------------------------
# 近接（motions/melee.js）
# ---------------------------------------------------------------------------

func _melee_pose(s: Dictionary) -> void:
	var heavy_weapon: bool = rig["weapons"][w_kind]["twoHanded"]
	var k := _clamp(_f(s, "swing", -1.0), 0.0, 1.0)
	var dir := 1.0 if int(_f0(s, "combo")) % 2 == 0 else -1.0
	var yaw := -0.2
	var pitch := 0.25
	var roll := 0.0
	if _ge0(s, "swing"):
		var cut := k / 0.25 if k < 0.25 else 1.0 - (k - 0.25) / 0.75 * 0.3
		yaw = dir * (1.1 - cut * 2.2)
		pitch = 0.10
	if _ge0(s, "spin"):
		yaw = PI / 2.0
		pitch = 0.0
	if heavy_weapon:
		var overhead := _ge0(s, "swing") and (_b(s, "heavy") or _f(s, "combo", -1.0) == 2.0)
		if overhead:
			yaw = 0.0
			pitch = 1.25 + 0.25 * k / 0.24 if k < 0.24 else 1.5 - 1.7 * _clamp((k - 0.24) / 0.45, 0.0, 1.0)
		elif not _ge0(s, "swing") and not _ge0(s, "spin"):
			pitch = 0.60
		var y := 1.15 + 0.53 * sin(PI * _clamp(k / 0.7, 0.0, 1.0)) if overhead else 1.15
		armR.p[2] = 0.0
		var grip := _aim_hand(armR, elbowR, [-0.04, y, 0.22 if overhead else 0.34], [1.0, -0.6, -0.2])
		var axis := _axis(yaw, pitch)
		_aim_hand(armL, elbowL, _vaddsc(grip, axis, -0.18), [-1.0, -0.6, -0.2])
		# 刃を前へ: 構えと縦振りは刃を立てる。横振りは振り始めに寝かせて、刃が振る向きを向く
		if rig["weapons"][w_kind]["edgeForward"]:
			if overhead or not (_ge0(s, "swing") or _ge0(s, "spin")): roll = PI / 2.0
			elif _ge0(s, "swing"): roll = PI / 2.0 * _clamp(1.0 - k / 0.15, 0.0, 1.0)
			else: roll = 0.0
	_orient_weapon(yaw, pitch, roll)


## applyMeleeTechnique: 技の姿勢。p は sampleTechnique の結果
func _melee_technique(s: Dictionary, t: Dictionary, p: Dictionary) -> void:
	var two_handed: bool = rig["weapons"][t["kind"]]["twoHanded"]
	armR.p[2] = 0.0
	_set_ey(body, p["bodyYaw"])
	_set_ex(body, p["lean"])
	body.p[1] += p["lift"]
	var grip := _aim_hand(armR, elbowR, [p["x"] - 0.34 if two_handed else p["x"], p["y"], p["z"]], [1.0, -0.6, -0.3])
	if two_handed:
		var yaw: float = p["yaw"] - p["bodyYaw"]
		var axis := _axis(yaw, p["pitch"])
		_aim_hand(armL, elbowL, _vaddsc(grip, axis, -0.18), [-1.0, -0.6, -0.2])
	elif p["guard"] > 0:
		_set_e(armL, -1.15 * p["guard"], 0.0, -0.3)
		_set_ex(elbowL, -0.4 * p["guard"])
	_orient_weapon(p["yaw"] - p["bodyYaw"], p["pitch"])
	_set_ey(head, -p["bodyYaw"] * 0.6)


# ---------------------------------------------------------------------------
# 片手剣（weapons/sword.js applySwordPose）
# ---------------------------------------------------------------------------

func _sword_pose(s: Dictionary) -> void:
	var no_react := not _gt0(s, "down") and not _gt0(s, "dodge") and not _gt0(s, "hurt")
	if _b(s, "guard"):
		# 片手剣のガード: 剣を横に倒して胸の前で受ける。左手は刃の腹に添える
		var yaw := -1.38
		var pitch := 0.22
		armR.p[2] = 0.0
		var grip := _aim_hand(armR, elbowR, [0.22, 1.26, 0.46], [1.0, -0.6, -0.3])
		_aim_hand(armL, elbowL, _vaddsc(grip, _axis(yaw, pitch), 0.5), [-1.0, -0.6, -0.2])
		_orient_weapon(yaw, pitch)
		return
	if _b(s, "charging") and no_react:
		armR.p[2] = 0.0
		_aim_hand(armR, elbowR, [0.49, 1.15, 0.23], [1.0, -0.3, -0.35])
		_orient_weapon(0.85, 1.10)
		return
	if _ge0(s, "swing") and no_react:
		# 通常斬りの軌道を保ち、肘を少し曲げて手首を読みやすくする
		var goal := _vadd(_vapplyq([0.0, -0.54, 0.0], armR.q), armR.p)
		_aim_hand(armR, elbowR, goal, [1.0, -0.3, -0.4])
		_melee_pose(s)
		return
	if no_react and not _ge0(s, "spin") and not _ge0(s, "sweep"):
		var walk := sin(_f(s, "walkT", 0.0) * 10.0) if _b(s, "moving") else 0.0
		armR.p[2] = 0.0
		_aim_hand(armR, elbowR, [0.38, 1.04 + walk * 0.025, 0.30], [1.0, -0.5, -0.25])
		_orient_weapon(-0.18, 0.62 if _b(s, "moving") else 0.80)
		return
	_melee_pose(s)


# ---------------------------------------------------------------------------
# 大剣（weapons/greatsword.js の motion）
# ---------------------------------------------------------------------------

const GS_REST := {"x": -0.04, "y": 1.15, "z": 0.34, "pitch": 0.60, "yaw": 0.0, "lean": 0.0, "twist": 0.0, "stance": 0.0}
const GS_STRIKE := {"x": -0.04, "y": 1.12, "z": 0.50, "pitch": -0.20, "yaw": 0.0, "lean": 0.26, "twist": 0.12, "stance": 1.0}


static func _lerp(a: float, b: float, k: float) -> float:
	return a + (b - a) * k


static func _gs_windup(c: float) -> Dictionary:
	return {"x": _lerp(-0.04, 0.02, c), "y": _lerp(1.60, 1.76, c), "z": _lerp(0.06, -0.22, c), "pitch": _lerp(1.75, 2.65, c),
		"yaw": _lerp(0.0, -0.35, c), "lean": _lerp(-0.06, -0.26, c), "twist": _lerp(0.0, -0.5, c), "stance": c}


static func _gs_mix(a: Dictionary, b: Dictionary, k: float) -> Dictionary:
	var o := {}
	for key in a: o[key] = _lerp(a[key], b[key], k)
	return o


func _gs_hold(s: Dictionary, p: Dictionary) -> void:
	armR.p[2] = 0.0
	if not _gt0(s, "dodge") and not _gt0(s, "down") and not _gt0(s, "hurt"):
		_set_ex(body, p["lean"])
		_set_ey(body, p["twist"])
		# 足は体に付いているので、反らした分を戻して地面に立たせ、前後に踏ん張る（歩いているときは歩きのまま）
		if not _b(s, "moving"):
			_set_ex(legs[0], -p["lean"] - 0.35 * p["stance"])
			_set_ex(legs[1], -p["lean"] + 0.25 * p["stance"])
		_set_ey(head, -p["twist"] * 0.6)
	var grip := _aim_hand(armR, elbowR, [p["x"], p["y"], p["z"]], [1.0, -0.6, -0.2])
	var axis := _axis(p["yaw"], p["pitch"])
	_aim_hand(armL, elbowL, _vaddsc(grip, axis, -0.18), [-1.0, -0.6, -0.2])
	_orient_weapon(p["yaw"], p["pitch"], PI / 2.0)  # 縦振り: 刃を前へ


func _greatsword_pose(s: Dictionary) -> void:
	var k := _f(s, "swing", -1.0)
	if _b(s, "heavy") and k >= 0.0:
		# 振りかぶりを保つ → 一気に振り下ろす → 構えに戻る
		var top := _gs_windup(1.0)
		var p: Dictionary
		if k < 0.06: p = top
		elif k < 0.28: p = _gs_mix(top, GS_STRIKE, _ease((k - 0.06) / 0.22))
		elif k < 0.62: p = GS_STRIKE
		else: p = _gs_mix(GS_STRIKE, GS_REST, _ease((k - 0.62) / 0.38))
		_gs_hold(s, p)
	elif _b(s, "charging") and k >= 0.0 and k <= 0.02:
		var charge := minf(1.0, maxf(0.0, _f(s, "charge", 0.0)))
		var p := _gs_windup(_ease(minf(1.0, charge / 0.6)))
		if charge >= 1.0: p["pitch"] += sin(_f(s, "t", 0.0) * 45.0) * 0.02
		_gs_hold(s, p)
	else:
		_melee_pose(s)


# ---------------------------------------------------------------------------
# 槍（spear-motion.js spearPose と weapons/spear.js の motion）
# ---------------------------------------------------------------------------

func _spear_timings() -> Dictionary:
	return tables["m"]["spearTimings"]


func _counter_angle(t: float) -> float:
	var T: Dictionary = _spear_timings()["counter"]
	if t < T["wind"]: return T["windAng"] * _ease_c(t / T["wind"])
	if t < T["slashEnd"]:
		var k: float = (t - T["wind"]) / T["slash"]
		return T["windAng"] + (TAU - T["windAng"]) * (1.0 - pow(1.0 - k, 2.0))
	return TAU


static func _stroke(t: float, hit: float, end: float) -> float:
	if t <= hit: return _ease_c(t / hit)
	return 1.0 - _ease_c((t - hit) / (end - hit))


func _thrust_curve(name: String, t: float, T: Dictionary) -> float:
	match name:
		"stroke": return _stroke(t, T["hitAt"], T["duration"])
		"dash": return 1.0 if t < T["dashDuration"] else 1.0 - _ease_c((t - T["dashDuration"]) / T["recovery"])
		"repeat":
			var i := int(_clamp(floorf(t / T["interval"]), 0.0, T["count"] - 1.0))
			var start: float = i * T["interval"]
			var last: bool = float(i) == T["count"] - 1.0
			return _stroke(t - start, T["hitAt"], T["finalRecovery"] if last else T["interval"]) * (1.0 if last else T["repeatScale"])
	return 0.0


## spearPose(s): 槍の構え（p の辞書。lateral / side は無いこともある）
func _spear_state(s: Dictionary) -> Dictionary:
	var TM := _spear_timings()
	var id := String(s.get("motion", ""))
	var t := maxf(0.0, _f0(s, "motionT"))
	var p := {"yaw": 0.0, "pitch": 0.18, "x": 0.32, "y": 1.24, "z": 0.24, "lean": 0.0, "step": 0.0}
	var is_sweep: bool = TM.has(id) and _truthy(TM[id].get("sweep"))
	var is_spin: bool = TM.has(id) and _truthy(TM[id].get("spin"))
	if _ge0(s, "sweep") or is_sweep:
		p["yaw"] = _f(s, "sweep", 0.0) if _ge0(s, "sweep") else _counter_angle(t)
		p["pitch"] = 0.0
		p["x"] = 0.58
		p["z"] = 0.03
		p["y"] = 1.25
		p["lateral"] = true
		var C: Dictionary = TM["counter"]
		var rest := _ease_c((t - C["slashEnd"]) / C["rest"])
		p["x"] += (0.32 - p["x"]) * rest
		p["z"] += (0.24 - p["z"]) * rest
		p["side"] = 1.0 - rest
		p["pitch"] = 0.18 * rest
		return p
	if is_spin or _ge0(s, "spin"):
		var timing: Dictionary = TM[id] if is_spin else TM["whirl"]
		var turns: float = timing.get("count", 1.0)
		var duration: float = timing["rotationDuration"]
		var cycle := _clamp(t / duration * turns if id != "" else _f(s, "spin", 0.0) * turns, 0.0, turns)
		p["yaw"] = TAU * (floorf(cycle) + _ease_c(fmod(cycle, 1.0)))
		p["pitch"] = 0.0
		p["x"] = 0.58
		p["z"] = 0.03
		p["lateral"] = true
		p["lean"] = 0.06
		var rest := _ease_c((t - duration) / (timing["duration"] - duration)) if id != "" else 0.0
		p["x"] += (0.32 - p["x"]) * rest
		p["z"] += (0.24 - p["z"]) * rest
		p["lean"] *= 1.0 - rest
		p["pitch"] = 0.18 * rest
		p["side"] = 1.0 - rest
		return p
	var out := 0.0
	var thrust = null
	if TM.has(id) and TM[id].has("thrust"): thrust = TM[id]
	if thrust != null:
		out = _thrust_curve(thrust["thrust"], t, thrust)
		if thrust.has("pitchFollow"): p["pitch"] = thrust["pitchFollow"] * (1.0 - out)
	elif _b(s, "charging") or _b(s, "guard"):
		p["z"] = 0.14
		p["pitch"] = 0.0
		p["yaw"] = -0.08
		return p
	elif _ge0(s, "swing"):
		out = _stroke(_f(s, "swing", 0.0), 0.18, 1.0)
	else:
		return p
	p["z"] = 0.24 + 0.31 * out
	p["y"] = 1.25
	p["pitch"] = p["pitch"] if (thrust != null and thrust.has("pitchFollow")) else 0.0
	p["yaw"] = 0.12 * out
	p["lean"] = 0.08 * out
	p["step"] = 0.24 * out
	return p


func _spear_pose(s: Dictionary) -> void:
	var p := _spear_state(s)
	armR.p[2] = 0.0
	_set_ey(body, p["yaw"])
	if not _gt0(s, "dodge") and not _gt0(s, "hurt"): _set_ex(body, p["lean"])
	var grip := _aim_hand(armR, elbowR, [p["x"], p["y"], p["z"]], [1.0, -0.6, -0.3])
	# 突きは体がひねっても狙いの線上、薙ぎは横へ伸びる
	var yaw: float = PI / 2.0 * p.get("side", 1.0) if p.has("lateral") else -p["yaw"]
	_orient_weapon(yaw, p["pitch"])
	# 竜騎士（盾を背負っている）: 左手も柄の後ろを握って両手で持つ
	if _b(s, "shieldBack"):
		_aim_hand(armL, elbowL, _vaddsc(grip, _axis(yaw, p["pitch"]), -0.3), [-1.0, -0.6, -0.2])
	if p["step"] != 0.0:
		_set_ex(legs[0], -p["step"])
		_set_ex(legs[1], p["step"])


# ---------------------------------------------------------------------------
# 弓（weapons/bow.js の motion）
# ---------------------------------------------------------------------------

func _bow_pose(s: Dictionary) -> void:
	var active := _b(s, "charging") or _ge0(s, "swing")
	var draw := 0.0
	if _b(s, "charging"): draw = _clamp(_f(s, "charge", 1.0), 0.0, 1.0)
	elif _ge0(s, "swing"): draw = 1.0 - _clamp(_f(s, "swing", 0.0) / 0.25, 0.0, 1.0)
	# 体は横向き、弓と頭は狙いの向きのまま
	var stance := _f(s, "bowStance", 1.0)
	_set_ey(body, stance)
	_set_ey(head, -stance)
	var aim := [-sin(stance), 0.0, cos(stance)]
	var grip := _aim_hand(armL, elbowL, [-0.10, _f(s, "bowHeight", 1.36 if active else 1.25), 0.53], [-1.0, -0.7, 0.0])
	if active:
		var pull := 0.22 * draw
		_aim_hand(armR, elbowR, _vaddsc(grip, aim, bow_sx - pull), [1.0, 0.0, -0.7])
	# 弓の腕は縦のまま。モデルの -90 度の yaw で弦が体のほうを向く（弦と矢の見た目は行列に関係しないので移さない）
	var hand_orientation := _qmul(armL.q, elbowL.q)
	_set_q(weapon, _qmul(_qinv(hand_orientation), _q_from_axis([0.0, 1.0, 0.0], -stance)))


## applyBowTechnique: 引き具合 p.draw で弓を引き、始めと終わりは構えから溶け込む
func _bow_technique(s: Dictionary, t: Dictionary, p: Dictionary) -> void:
	var time := _f0(s, "motionT")
	var blend := _ease(minf(1.0, time / 0.08)) * _ease(maxf(0.0, minf(1.0, (t["duration"] - time) / 0.12)))
	var s2 := s.duplicate()
	s2["charging"] = true
	s2["charge"] = p["draw"]
	s2["swing"] = -1.0
	s2["bowStance"] = 1.0 + p["bodyYaw"]
	s2["bowHeight"] = 1.25 + 0.11 * blend
	_bow_pose(s2)
	var idle := _q_from_euler(-0.25, 0.0, 0.12)
	idle = _qslerp(idle, armR.q, blend)
	_set_q(armR, idle)
	_set_q(elbowR, _qslerp(elbowR.q, [0.0, 0.0, 0.0, 1.0], 1.0 - blend))
	_set_ex(body, p["lean"])
	body.p[1] += p["lift"]


# ---------------------------------------------------------------------------
# 技（technique-motion.js）
# ---------------------------------------------------------------------------

## sampleTechnique(id, time)
func _sample_technique(id: String, time: float) -> Dictionary:
	var frames: Array = tables["frames"][id]
	var base: Dictionary = tables["m"]["base"]
	if time <= 0.0: return frames[0].duplicate()
	var a: Dictionary = frames[0]
	var b: Dictionary = frames[frames.size() - 1]
	for i in range(1, frames.size()):
		b = frames[i]
		if time <= b["at"]: break
		a = b
	var k := _ease(maxf(0.0, minf(1.0, (time - a["at"]) / maxf(0.00001, b["at"] - a["at"]))))
	var p := {}
	for key in base: p[key] = a[key] + (b[key] - a[key]) * k
	return p


## applyTechniquePose。技の姿勢を使ったら true
func _technique_pose(s: Dictionary) -> bool:
	var id := String(s.get("motion", ""))
	var ms: Dictionary = tables["m"]["motions"]
	if not ms.has(id): return false
	var t: Dictionary = ms[id]
	if t["kind"] != w_kind or _gt0(s, "down") or _gt0(s, "dodge") or _gt0(s, "hurt"): return false
	var p := _sample_technique(id, _f0(s, "motionT"))
	if t["kind"] == "bow": _bow_technique(s, t, p)
	else: _melee_technique(s, t, p)
	if p["leg"] != 0.0:
		_set_ex(legs[0], -p["leg"])
		_set_ex(legs[1], p["leg"])
	return true


# ---------------------------------------------------------------------------
# Node3D へ反映（最後に 1 度だけ。Godot の Transform3D は 32 ビット）
# ---------------------------------------------------------------------------

## 部品の位置・回転（四元数）・拡大から、three.js の Matrix4.compose と同じ列を作る
static func _local_transform(n: N) -> Transform3D:
	var x: float = n.q[0]
	var y: float = n.q[1]
	var z: float = n.q[2]
	var w: float = n.q[3]
	var x2 := x + x
	var y2 := y + y
	var z2 := z + z
	var xx := x * x2
	var xy := x * y2
	var xz := x * z2
	var yy := y * y2
	var yz := y * z2
	var zz := z * z2
	var wx := w * x2
	var wy := w * y2
	var wz := w * z2
	var sx: float = n.s[0]
	var sy: float = n.s[1]
	var sz: float = n.s[2]
	var c0 := Vector3((1.0 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx)
	var c1 := Vector3((xy - wz) * sy, (1.0 - (xx + zz)) * sy, (yz + wx) * sy)
	var c2 := Vector3((xz + wy) * sz, (yz - wx) * sz, (1.0 - (xx + yy)) * sz)
	return Transform3D(Basis(c0, c1, c2), Vector3(n.p[0], n.p[1], n.p[2]))


func _apply() -> void:
	if model.node != null: model.node.visible = model.visible
	for n in all:
		var o: Node3D = n.node
		if o == null: continue
		var want: Node3D = null
		if n.parent == "model": want = model.node
		else:
			for m in all:
				if m.name == n.parent:
					want = m.node
					break
		if want != null and o.get_parent() != want:
			if o.get_parent() != null: o.get_parent().remove_child(o)
			want.add_child(o)
		o.transform = _local_transform(n)
		o.visible = n.visible
