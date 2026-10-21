class_name PlayerModel
extends RefCounted
## 人物の見た目を組み立てる（G2-2）: 姿勢の骨組み（rig/player_rig.gd）の部品に、名前のついた GLB の形を付ける。
##   var pm := PlayerModel.new()
##   pm.build({"kind": "greatsword", "form": 3, "tier": 4, "armor": 0, "color": Color("448a9b")})
##   add_child(pm.root); pm.animate(state)         # state は animatePlayer に渡す状態
## 元: models.js の makePlayer / setPlayerWeapon / setPlayerArmor（装備の付け方）。GLB は tools/worldart/godot/export_models.mjs が書く。
## 形は three.js と同じ座標（Y 上、+Z が前）のまま置く。向きの変換は呼び出し側（game.gd の me_node.rotation.y）。

const PR = preload("res://scripts/game/rig/player_rig.gd")
const MODELS := "res://data/models/"
## 骨組みの部品の名前（rig.json の parts）。GLB の同じ名前のノードの中身を、骨組みの同じ名前のノードへ移す
const PARTS := ["body", "head", "armL", "armR", "elbowL", "elbowR", "hand", "handL", "leg0", "leg1", "cape"]

static var _rigj: Dictionary
static var _tables: Dictionary
static var _weapon_index: Dictionary
static var _armor_json: Dictionary
static var _bow_parts: Dictionary

var root: Node3D
var rig                          # PlayerRig
var nodes: Dictionary
var grip_hand: Node3D = null
var kind := ""
# 弓の弦と矢（kit.js bowString の userData.bow）。弦は 3 点の折れ線（先端・sx・先端）で、引くと中央の点が sx - 引き分 に動く
var bow_string: ImmediateMesh = null
var bow_arrow: Node3D = null
var bow_tip := 0.0
var bow_sx := 0.0


static func _json(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))


static func load_data() -> void:
	if not _rigj.is_empty(): return
	_rigj = _json("res://data/rig.json")
	_tables = PR.make_tables(_json("res://data/motions.json"))
	_weapon_index = _json(MODELS + "weapons/index.json")
	_armor_json = _json(MODELS + "armor_looks.json")
	_bow_parts = _json(MODELS + "weapons/bow_parts.json")


## GLB を読む。書き出しの根（model / weaponModel / shield / armor / gripHand）のノードを、取り込みの外側の入れ物から外して返す
static func _scene(file: String) -> Node:
	var wrap: Node = (load(MODELS + file) as PackedScene).instantiate()
	var inner: Node = wrap.get_child(0)
	wrap.remove_child(inner)
	wrap.free()
	return inner


## GLB の部品 src の中身を、骨組みの dst へ移す。部品の名前の子は再帰、それ以外（メッシュ・hair・baseGear・shoulders など）はそのまま移す
func _move_parts(src: Node, dst: Node3D) -> void:
	for c in src.get_children():
		if String(c.name) in PARTS and nodes.has(String(c.name)):
			_move_parts(c, nodes[String(c.name)])
		elif String(c.name) == "ring":
			continue    # 足元の輪はゲーム側の描画
		else:
			src.remove_child(c)
			dst.add_child(c)


## 部品がメッシュ自身のとき（外套 cape）は、骨組みのノードの子に同じメッシュを置く
func _move_mesh_part(src: Node, dst: Node3D) -> void:
	if src is MeshInstance3D:
		var mi := MeshInstance3D.new()
		mi.name = String(src.name) + "Mesh"
		mi.mesh = (src as MeshInstance3D).mesh
		dst.add_child(mi)


## opts: no_weapon（武器を付けない）, kind, form（大剣 0〜7・片手剣 0〜8）, tier（飾りの段階 0〜5）, armor（防具の見た目 0〜6）, color（プレイヤーの色）
func build(opts: Dictionary) -> void:
	load_data()
	kind = String(opts.get("kind", "sword"))
	var form := int(opts.get("form", 0))
	var tier := int(opts.get("tier", 0))
	var armor := int(opts.get("armor", 0))
	var color: Color = opts.get("color", Color("448a9b"))
	var rig_style := form if form < 4 else 0     # 骨組みの武器の取り付けは形 0〜3 だけ表にある（sword / greatsword は 4 形とも同じ）
	nodes = PR.build_skeleton(_rigj, kind, rig_style)
	root = nodes["model"]
	# 人物
	var pl := _scene("player.glb")
	_move_parts(pl, root)
	_move_mesh_part(pl.find_child("cape", true, false), nodes["cape"])
	pl.free()
	# 武器
	var wfile: String = String(_weapon_index.get("%s:%d:%d" % [kind, form, tier], ""))
	if wfile != "" and not bool(opts.get("no_weapon", false)):
		var w := _scene("weapons/" + wfile)
		_move_parts(w, nodes["weaponModel"])
		w.free()
		if kind == "bow" and _bow_parts.has("%s:%d:%d" % [kind, form, tier]): _add_bow_parts(_bow_parts["%s:%d:%d" % [kind, form, tier]])
	# 盾（kite）
	if nodes.has("shield"):
		var sh := _scene("shield_kite_t%d.glb" % tier)
		_move_parts(sh, nodes["shield"])
		sh.free()
	# 握り手（片手剣）: 既定の手（hand の直下のメッシュ）を隠し、武器の向きに合わせて回す
	if kind == "sword":
		for c in nodes["hand"].get_children():
			if c is MeshInstance3D: c.visible = false
		grip_hand = _scene("grip_hand.glb") as Node3D
		nodes["hand"].add_child(grip_hand)
		grip_hand.transform = Transform3D.IDENTITY
	# 防具の見た目
	var hide := {}
	if armor > 0:
		var ar := _scene("armor_look%d.glb" % armor)
		for c in ar.get_children():
			ar.remove_child(c)
			if String(c.name) == "onBody": nodes["body"].add_child(c)
			elif String(c.name) == "onHead": nodes["head"].add_child(c)
		ar.free()
		hide = _armor_json[str(armor)]["hide"]
		if hide["baseGear"]: nodes["body"].find_child("baseGear", false, false).visible = false
		if hide["shoulders"]: nodes["body"].find_child("shoulders", false, false).visible = false
		if hide["hair"]: nodes["head"].find_child("hair", false, false).visible = false
	ToonLook.convert(root, color)
	rig = PR.new()
	rig.setup(nodes, _rigj, _tables, kind, rig_style)
	if armor > 0 and hide["cape"]:
		rig.cape.visible = false
		rig._apply()


## 弦（THREE.Line、色は bowString の引数）と矢（bow_arrow.glb）を弓の形に足す。引き具合は animate が毎フレーム入れる
func _add_bow_parts(bp: Dictionary) -> void:
	bow_tip = float(bp["tip"])
	bow_sx = float(bp["sx"])
	bow_string = ImmediateMesh.new()
	var mi := MeshInstance3D.new()
	mi.name = "bowString"
	mi.mesh = bow_string
	mi.material_override = ToonLook.line_material(Color(String(bp["color"])))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	nodes["weaponModel"].add_child(mi)
	bow_arrow = _scene("bow_arrow.glb") as Node3D
	bow_arrow.visible = false
	nodes["weaponModel"].add_child(bow_arrow)
	_set_bow_draw(0.0, false)


func _set_bow_draw(pull: float, arrow_visible: bool) -> void:
	bow_string.clear_surfaces()
	bow_string.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	bow_string.surface_add_vertex(Vector3(bow_sx, -bow_tip, 0.0))
	bow_string.surface_add_vertex(Vector3(bow_sx - pull, 0.0, 0.0))
	bow_string.surface_add_vertex(Vector3(bow_sx, bow_tip, 0.0))
	bow_string.surface_end()
	bow_arrow.visible = arrow_visible
	bow_arrow.position.x = bow_sx - pull


## applyBowPose / applyBowTechnique（weapons/bow.js）の弦と矢の部分。姿勢は rig が作り、ここは引き具合だけを見る
func _update_bow(s: Dictionary) -> void:
	var charging := bool(s.get("charging", false))
	var swing := float(s.get("swing", -1.0))
	var pull := 0.0
	var show := false
	var tid := String(s.get("motion", ""))
	var ms: Dictionary = rig.tables["m"]["motions"]
	if ms.has(tid) and ms[tid]["kind"] == "bow" and not (float(s.get("down", 0.0)) > 0.0 or float(s.get("dodge", 0.0)) > 0.0 or float(s.get("hurt", 0.0)) > 0.0):
		var draw: float = rig._sample_technique(tid, float(s.get("motionT", 0.0)))["draw"]
		pull = 0.22 * clampf(draw, 0.0, 1.0)
		show = draw > 0.03
	elif charging or swing >= 0.0:
		var draw := clampf(float(s.get("charge", 1.0)), 0.0, 1.0) if charging else 1.0 - clampf(swing / 0.25, 0.0, 1.0)
		pull = 0.22 * draw
		show = charging or swing < 0.15
	_set_bow_draw(pull, show)


func animate(state: Dictionary) -> void:
	rig.animate(state)
	if bow_string != null: _update_bow(state)
	# alignGripHand（grip-hands.js）: 握り手は武器と同じ向き
	if grip_hand != null: grip_hand.quaternion = nodes["weapon"].quaternion
