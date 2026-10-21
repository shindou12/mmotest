extends RefCounted
## 弓の照準ガイド: 足元の射程の円（引くほど広がり、最大射程で止まる）と狙いの線。
## 元は public/js/game/loop.js の updateBowGuide（bowGuide = meshes.js の弓の円）。射程は stats.js bowRange（combat.gd の bow_range）。
## 円の大きさ r = 引かずに撃つ射程 bowBase から、引くほど bowDraw m/秒で広がり、最大射程 bowMax で止まる。最大まで引いたら金色。
## g は scripts/game/game.gd。エリアを移ると世界の子が消えることがあるので、足りなければ作り直す。

var g
var group: Node3D
var disc: MeshInstance3D
var ring: MeshInstance3D
var max_ring: MeshInstance3D
var aim: MeshInstance3D


func _init(game) -> void:
	g = game


func _make() -> void:
	group = Node3D.new()
	disc = _mesh({"k": "circle", "r": 1.0}, Color(0.6, 1.0, 0.85))
	ring = _mesh({"k": "ring", "r0": 0.97, "r1": 1.0}, Color(0.6, 1.0, 0.85))
	max_ring = _mesh({"k": "ring", "r0": 0.985, "r1": 1.0}, Color(1, 0.85, 0.3))
	aim = _mesh({"k": "line", "len": 1.0, "w": 0.16, "a": 0.0}, Color.WHITE)
	for m in [disc, ring, max_ring, aim]: group.add_child(m)
	g.world.add_child(group)


func _mesh(shape: Dictionary, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.mesh = GameVisuals.shape_mesh(shape, 1.0)
	m.material_override = GameVisuals.mat(color, true, 0.5).duplicate()   # 色と濃さを毎フレーム変えるので、共有の材質は使わない
	return m


func _paint(m: MeshInstance3D, color: Color, alpha: float) -> void:
	var sm: StandardMaterial3D = m.material_override
	sm.albedo_color = Color(color.r, color.g, color.b, alpha)


## 毎フレーム（combat.gd tick_actions から）
func update() -> void:
	var S: Dictionary = g.S
	var me: Dictionary = g.me
	if S.is_empty() or me.is_empty(): return
	var ranged: bool = S["W"].get("ranged", false)
	if not ranged or me["dead"]:
		if group != null and is_instance_valid(group): group.visible = false
		return
	if group == null or not is_instance_valid(group) or group.get_parent() == null: _make()
	group.visible = true
	var t: float = g.t_now
	var r: float = g.combat.bow_range()
	var drawing: bool = me["charging"] and me["chargeT"] >= GameCombat.charge_min()
	var full: bool = drawing and r >= float(S["bowMax"]) - 0.01
	group.position = Vector3(me["x"], g.world.ground_y(me["x"], me["z"]) + 0.1, me["z"])
	disc.scale = Vector3(r, 1, r)
	ring.scale = Vector3(r, 1, r)
	max_ring.scale = Vector3(float(S["bowMax"]), 1, float(S["bowMax"]))
	_paint(ring, Color(1, 0.85, 0.3) if full else (Color.WHITE if drawing else Color(0.6, 1.0, 0.85)), 0.9 if drawing else 0.4)
	_paint(disc, Color(1, 0.85, 0.3) if full else Color(0.6, 1.0, 0.85), (0.07 + (0.04 * sin(t * 10) if full else 0.0)) if drawing else 0.03)
	max_ring.visible = drawing and not full
	_paint(max_ring, Color(1, 0.85, 0.3), 0.35)
	aim.visible = drawing
	if drawing:
		var k := clampf(float(me["chargeT"]) / float(S["chargeMax"]), 0.0, 1.0)
		aim.rotation.y = g._aim_angle()
		aim.scale = Vector3(1.0 + k, 1, r)
		_paint(aim, Color.WHITE, 0.35 + 0.4 * k + 0.15 * sin(t * 20))
