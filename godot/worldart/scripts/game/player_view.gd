class_name PlayerView
extends RefCounted
## ゲームの中の人物 1 人分（G2-3）: PlayerModel（名前付き部品の GLB・武器・盾・防具）を作り、毎フレーム「状態 → animatePlayer の入力」を作って
## player_rig.gd で動かす。輪郭線とトゥーン（ToonLook）はモデルを作るときにかかる。エリアごとの光は ToonLook.set_light。
## 元: game/loop.js の自キャラモデル・他プレイヤーの節（animatePlayer に渡す状態）、game/snapshot.js onSnap（他の人の項目）、
##     models.js の weaponStyle・armorLook・setPlayerWeapon・setPlayerArmor（装備 → 見た目の選び方）。
##
## game.gd からの呼び出しは 2 か所だけ:
##   GameVisuals.player(色)                  人物の入れ物（Node3D）を作る。中身（モデル）は装備に合わせて PlayerView が付け替える
##   PlayerView.update_all(self, dt)         毎フレーム、自分と他の人を動かす（_sync_nodes の最後）
##   PlayerView.on_snap_player(o, p)         スナップショットの人物 1 行を受けたとき、他の人の項目（武器・防具・動き）を渡す
## game.gd の自分の状態（me）の項目の読み取りは me_fields() の 1 か所にまとめてある。名前が違うときはここだけ合わせる。

const DOWN_T := 1.1        # hurt.js REACT.downT
const DOWN_IN := 0.12      # 倒れる速さ（loop.js: (REACT.downT - downT) / 0.12）
const DOWN_OUT := 0.25     # 起き上がる速さ（loop.js: downT / 0.25）
const GUARD_MAX := 100.0   # input.js GUARD.max
const HURT_DUR := 0.28     # loop.js: hurtT / 0.28
const DODGE_DUR := 0.38
const CHARGE_MIN := 0.22
const CHARGE_MAX := 0.9
const OTHER_SWING := 0.35  # 他の人の通常攻撃の長さ（loop.js: o.swingT < 0.35）
const SPIN_DUR := 0.55


static var _area_light: Dictionary = {}
static var _light_area := "?"

var holder: Node3D             # game.gd が位置と向きを入れる入れ物
var pm: PlayerModel = null
var color := Color("448a9b")
var key := ""                  # 作った装備の印（変わったら付け替える）
var equip := {"kind": "sword", "wr": 0, "wst": 0, "arm": 0}
# 動きの状態（loop.js の me / others の項目にあたる）
var walk_t := 0.0
var moving := false
var last_x := 0.0
var last_z := 0.0
var has_last := false
# 他の人（snapshot.js onSnap で入る）
var swing_t := 9.0
var combo := 0
var spin_t := -1.0
var sw := 0
var sk := 0
var seen_snap := false
var motion := ""
var motion_t := 0.0
var dead := false
var dg := 0
var gd := 0
var rc := 0
var rv := -1.0
var cl := 0


## 人物の入れ物を作る。装備は update_all が合わせる（それまでは武器なしの素手の姿）
static func create(c: Color) -> Node3D:
	var pv := PlayerView.new()
	pv.color = c
	pv.holder = Node3D.new()
	pv.holder.set_meta("pv", pv)
	return pv.holder


# ---------------------------------------------------------------------------
# 装備 → 見た目（models.js）
# ---------------------------------------------------------------------------

static var _styles: Dictionary = {}


## 固有武器の形・防具の見た目の表（data/models/weapons/styles.json。export_models.mjs が weapon-appearances.js と armorLook から作る）
static func _style_tables() -> Dictionary:
	if _styles.is_empty():
		var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/models/weapons/styles.json"))
		_styles = j if j is Dictionary else {"unique": {}, "armor": {}}
	return _styles


## models.js weaponStyle(it): 装備から武器の形を決める。固有武器（レア度 6 以上）は固有の形（weapon-appearances.js uniqueWeaponStyle）、
## 未登録の伝説・神器は 3、それ以外は名前から選ぶ
static func weapon_style(it) -> int:
	if not (it is Dictionary): return 0
	if int(it.get("rarity", 0)) >= 6:
		var u = it.get("unique")
		var tbl: Dictionary = _style_tables()["unique"].get(String(it.get("kind", "")), {})
		if u is String and tbl.has(u): return int(tbl[u])
		return 3
	var s := 7
	for ch in String(it.get("name", "")):
		var c := ch.unicode_at(0)
		if c > 0xFFFF: c = 0xD800 + ((c - 0x10000) >> 10)    # JS の charCodeAt(0)（UTF-16 の先頭）
		s = (s * 31 + c) & 0xFFFFFFFF
	if String(it.get("kind", "")) == "greatsword":
		if s % 8 == 0: return 4
		if s % 8 == 1: return 5
	return s % 3


## models.js armorLook(it): 防具の見た目 0〜6（cls × atype の表を JS の armorLook から書き出してある）
static func armor_look(it) -> int:
	if not (it is Dictionary) or String(it.get("slot", "")) != "armor": return 0
	var tbl: Dictionary = _style_tables()["armor"]
	var cls := String(it.get("armor", "")) if String(it.get("armor", "")) != "" else "medium"
	var k := "%s:%s" % [cls, String(it.get("atype", ""))]
	if tbl.has(k): return int(tbl[k])
	return int(tbl.get(cls + ":", 0))


## models.js visTier: レアリティ → 飾りの段階（0〜5）
static func vis_tier(r: int) -> int:
	return r - 2 if r >= 6 else maxi(0, r - 1)


## 装備が変わっていたら、モデルを作り直して入れ物に付ける（setPlayerWeapon・setPlayerArmor）
func ensure_model(kind: String, wr: int, wst: int, arm: int) -> void:
	var k := "%s|%d|%d|%d" % [kind, wr, wst, arm]
	if k == key and pm != null: return
	key = k
	equip = {"kind": kind, "wr": wr, "wst": wst, "arm": arm}
	if pm != null and pm.root != null: pm.root.free()
	PlayerModel.load_data()
	var tier := vis_tier(wr)
	var form := wst
	var widx: Dictionary = PlayerModel._weapon_index
	var no_weapon := false
	if not widx.has("%s:%d:%d" % [kind, form, tier]):
		form = 0
		if not widx.has("%s:%d:%d" % [kind, form, tier]): no_weapon = true    # 武器の GLB がない種類は素手
	pm = PlayerModel.new()
	pm.build({"kind": kind, "form": form, "tier": tier, "armor": arm, "color": color, "no_weapon": no_weapon})
	holder.add_child(pm.root)


# ---------------------------------------------------------------------------
# 自分の状態（game.gd の me）の読み取り口。ここだけが me の項目名を知っている
# ---------------------------------------------------------------------------

## me（と S・ch）から、animatePlayer の入力の元になる値を取り出す。ない項目は既定値
static func me_fields(g) -> Dictionary:
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	var eq: Dictionary = g.ch.get("eq", {})
	return {
		"x": float(me.get("x", 0.0)), "z": float(me.get("z", 0.0)), "a": float(me.get("a", 0.0)),
		"dead": bool(me.get("dead", false)), "crawl": bool(me.get("crawl", false)),
		"kind": String(S.get("wk", "sword")), "wr": int(S.get("wr", 0)),
		"wst": weapon_style(eq.get("weapon")), "arm": armor_look(eq.get("armor")),
		"swingT": float(me.get("swingT", 9.0)), "swingDur": float(me.get("swingDur", 0.4)), "combo": int(me.get("combo", 0)),
		"charging": bool(me.get("charging", false)), "chargeT": float(me.get("chargeT", 0.0)), "chargeMax": float(S.get("chargeMax", CHARGE_MAX)),
		"skillT": float(me.get("skillT", -1.0)), "spin": bool(me.get("spin", false)),
		"dodgeT": float(me.get("dodgeT", 0.0)), "hurtT": float(me.get("hurtT", 0.0)), "downT": float(me.get("downT", 0.0)),
		"motion": String(me.get("motion", "")), "motionT": float(me.get("motionT", 0.0)),
		"heavy": bool(me.get("heavySwing", false)), "guarding": bool(me.get("guarding", false)),
		"hasMoving": me.has("moving") and me.has("walkT"), "moving": bool(me.get("moving", false)), "walkT": float(me.get("walkT", 0.0)),
		"skillDur": float(me.get("skillDuration", SPIN_DUR)),
		"gg": float(me.get("gg", 0.0)), "sweep": float(me.get("sweep", -1.0)), "shieldBack": bool(me.get("shieldBack", false)),
	}


## loop.js「自キャラモデル」の animatePlayer に渡す状態
func me_anim(f: Dictionary, t: float) -> Dictionary:
	var swing := -1.0
	if f["swingT"] < f["swingDur"]: swing = f["swingT"] / maxf(f["swingDur"], 0.001)
	elif f["charging"] and f["chargeT"] > CHARGE_MIN: swing = 0.02
	var down := 0.0
	if f["crawl"]: down = 1.0
	elif f["downT"] > 0.0: down = minf(1.0, minf((DOWN_T - f["downT"]) / DOWN_IN, f["downT"] / DOWN_OUT))
	var hurt: float = sin(f["hurtT"] / HURT_DUR * PI) if f["hurtT"] > 0.0 else 0.0
	return {
		"t": t, "moving": f["moving"] if f["hasMoving"] else moving, "walkT": f["walkT"] if f["hasMoving"] else walk_t, "kind": f["kind"], "combo": f["combo"], "dead": f["dead"],
		"guard": f["guarding"], "shieldBack": f["shieldBack"], "swing": swing,
		"spin": f["skillT"] / maxf(f["skillDur"], 0.001) if f["skillT"] >= 0.0 and f["spin"] else -1.0,
		"dodge": f["dodgeT"] / DODGE_DUR if f["dodgeT"] > 0.0 else 0.0,
		"crawl": f["crawl"], "down": down, "hurt": hurt, "motion": f["motion"], "motionT": f["motionT"],
		"heavy": f["heavy"] and f["swingT"] < f["swingDur"],
		"charging": f["charging"], "charge": minf(1.0, f["chargeT"] / maxf(f["chargeMax"], 0.001)),
		"gg": f["gg"] / GUARD_MAX, "sweep": f["sweep"],
	}


func _track_walk(x: float, z: float, dt: float) -> void:
	if has_last and dt > 0.0:
		moving = Vector2(x - last_x, z - last_z).length() / dt > 0.8
	last_x = x; last_z = z; has_last = true
	if moving: walk_t += dt


# ---------------------------------------------------------------------------
# 他の人（snapshot.js onSnap）
# ---------------------------------------------------------------------------

## スナップショットの人物 1 行 p を受けたとき。o は game.gd の others[id]
static func on_snap_player(o: Dictionary, p: Array) -> void:
	var pv: PlayerView = o["node"].get_meta("pv", null)
	if pv == null: return
	if p.size() < 17: return
	pv.ensure_model(String(p[9]), int(p[10]), int(p[16]), int(p[17]))
	var nsw := int(p[11])
	var nsk := int(p[12])
	if pv.seen_snap:
		if nsw != pv.sw: pv.swing_t = 0.0; pv.combo += 1
		if nsk != pv.sk: pv.spin_t = 0.0
	pv.sw = nsw; pv.sk = nsk; pv.seen_snap = true
	pv.dead = bool(int(p[13])); pv.dg = int(p[14]); pv.gd = int(p[15])
	pv.rc = int(p[18]) if p.size() > 18 else 0
	pv.motion = String(p[19]) if p.size() > 19 else ""
	pv.motion_t = float(p[20]) if p.size() > 20 else 0.0
	pv.rv = float(p[21]) if p.size() > 21 else -1.0
	pv.cl = int(p[22]) if p.size() > 22 else 0


## loop.js「他プレイヤー」の animatePlayer に渡す状態
func other_anim(t: float) -> Dictionary:
	var W: Dictionary = _wdef(equip["kind"])
	var spin := -1.0
	if spin_t >= 0.0 and (bool(W.get("skillSpin", false)) or _is_spin_motion(motion)): spin = spin_t / SPIN_DUR
	return {
		"t": t, "moving": moving, "walkT": walk_t, "kind": equip["kind"], "motion": motion, "motionT": motion_t, "combo": combo, "dead": dead,
		"guard": gd != 0, "shieldBack": bool(W.get("shield", false)) and (cl & 1) > 0,
		"swing": swing_t / OTHER_SWING if swing_t < OTHER_SWING else -1.0, "spin": spin,
		"dodge": 0.5 if dg > 0 else 0.0, "crawl": rv >= 0.0, "down": 1.0 if rv >= 0.0 or rc == 2 else 0.0, "hurt": 0.8 if rc == 1 else 0.0,
	}


static func _wdef(kind: String) -> Dictionary:
	return GameRules.data()["weapons"].get(kind, {})


## shared/skill-timings.js isSpinMotion
static func _is_spin_motion(id: String) -> bool:
	var st: Dictionary = GameRules.data().get("skillTimings", {})
	return id != "" and st.has(id) and bool(st[id].get("spin", false))


# ---------------------------------------------------------------------------
# 毎フレーム
# ---------------------------------------------------------------------------

## エリアが変わったら、そのエリアの光（data/area_light.json: export_arealight.mjs）を人物に入れる
static func _apply_area_light(area_id: String) -> void:
	if area_id == _light_area: return
	_light_area = area_id
	if _area_light.is_empty():
		var j = JSON.parse_string(FileAccess.get_file_as_string("res://data/area_light.json"))
		_area_light = j if j is Dictionary else {}
	var l: Dictionary = _area_light.get(area_id, {})
	if l.is_empty(): return
	ToonLook.set_light({"sun_color": Color(String(l["sun"])), "sun_i": float(l["sun_i"]), "sky": Color(String(l["sky"])),
		"ground": Color(String(l["ground"])), "hemi_i": float(l["hemi_i"])})


## game.gd の _sync_nodes の最後から呼ぶ。自分と他の人を、状態に合わせて動かす
static func update_all(g, dt: float) -> void:
	_apply_area_light(String(g.area_id))
	var t: float = g.t_now
	var mn: Node3D = g.me_node
	if mn != null and mn.has_meta("pv"):
		var pv: PlayerView = mn.get_meta("pv")
		var f := me_fields(g)
		pv.ensure_model(f["kind"], f["wr"], f["wst"], f["arm"])
		pv._track_walk(f["x"], f["z"], dt)
		# 仮の動き（弾み・ひねり・つぶし）は骨組みの動きに任せる。位置の高さと向きだけ戻す
		mn.position.y = g.world.ground_y(f["x"], f["z"])
		mn.rotation.y = f["a"]
		mn.scale = Vector3.ONE
		pv.pm.animate(pv.me_anim(f, t))
	for id in g.others:
		var o: Dictionary = g.others[id]
		var pv: PlayerView = o["node"].get_meta("pv", null)
		if pv == null or pv.pm == null: continue
		pv._track_walk(float(o.x), float(o.z), dt)
		pv.swing_t += dt
		if pv.spin_t >= 0.0:
			pv.spin_t += dt
			if pv.spin_t > SPIN_DUR: pv.spin_t = -1.0
		pv.motion_t += dt
		var md: Dictionary = GameRules.data().get("motionDurations", {})
		if pv.motion_t > float(md.get(pv.motion, 0.0)): pv.motion = ""
		pv.pm.animate(pv.other_anim(t))
