extends "res://scripts/game/combat/api.gd"
## 本物の文脈（ゲームの戦闘環境）。元は public/js/game/actions.js の buildCombat（senses・strikes・feedback・selfCare・party）と、
## actions.js の updateProjs・projRevive、hurt.js の downedAllies・reviveHit。
## combat/api.gd（ctx.gd を土台にした戦闘の環境）を継ぎ、呼ばれた操作 _op を実際の処理につなぐ:
##   arc・line・circle・proj・dash・hit は、敵（game.gd の mobs）に damage.gd の deal_damage で当てる（サーバーへの hit の送信は damage.gd の結果のまま）。
##   later はゲームの時刻（game.gd の t_now）の待ち行列（g.pending。game.gd が毎フレーム回す）。
##   fx・sfx・text・shake は、今ある見た目の関数があればそれを使い、なければ何もしない（下の TODO の一覧）。
## ゲームの状態は game.gd の me・S（能力値）・mobs・others を、bind() で参照として受ける（同じ Dictionary を共有する）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。
##
## ---- 見た目・音の TODO（エフェクトと音は G8。名前ごと。呼ばれた回数は todo に数え、確認用の --bot の終了時に FXTODO の行で出す）----
##   fx.ringWave   地面に広がる輪             fx.lightning  雷                      fx.flash      光（点光源）
##   parts.burst   粒の破裂                    parts.emit    粒を 1 つ出す
##   sfx(*)        音: swing・heavy・skill・hit・block・impact・wave・charge・charged・perfect・thunder・stunHit・buff ほか全部
##   （済み: fx.slash = 扇の斬撃の板、text / floatText = 浮かぶ文字、shake = 画面の揺れ、proj = 飛ぶ斬撃の板・投げ斧の板、arrow = 矢の板）
##   武器の手の位置（hand_pos）・武器ツリーの光（wt_aura）は人物のモデル待ち（06b）。矢 arrow・戻る飛び道具 boomerang・斧の形は短剣・大斧の分を入れた（見た目は板で代用）。
##   （済み: arrow = 矢の板。細長い板が飛び、update_projs が当てる。罠・旗は部品を置く）
##
## ---- 元と違う所 ----
##   * スキル変化（付加効果 sv_*）は未。castWeaponSkill は常に sv なしの経路（sk.run(combat)）を通る。
##   * 称号の天候（t_storm）は未（エリアの天候の表を書き出していない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const R = preload("res://scripts/game/rules.gd")
const Strikes = preload("res://scripts/game/skills/strikes.gd")

## game.gd（自分の状態 me・能力値 S・敵 mobs・他の人 others・時刻 t_now・世界 world）
var g
## 飛ぶ斬撃（strikes.proj。state.projs）
var projs: Array = []
## 見た目の TODO の呼ばれた回数: 名前 → 回数
var todo: Dictionary = {}
## 直前に送った hit のメッセージ（確認用の行 HIT に使う）
var last_hit: Dictionary = {}


func _init(game) -> void:
	super()
	g = game


## game.gd が me・S を作り直したときに呼ぶ（同じ Dictionary を参照する）
func bind() -> void:
	me = g.me
	st = g.S
	mobs = g.mobs
	pending = g.pending


# ---------------------------------------------------------------- 時刻・狙い・外への出力
func now() -> float: return g.t_now
func aim_angle() -> float: return g._aim_angle()
func aim() -> float: return g._aim_angle()
func point() -> Dictionary: return {"x": float(g.mouse_ground.x), "z": float(g.mouse_ground.z)}
func area() -> String: return g.area_id
func col() -> int: return int(weapon_color())
func wt(): return st.get("wt")
## 弓: 離したときの射程（なければ最大射程）。input.js pointerUp が決める me.releaseRange
func range():
	var r = me.get("releaseRange")
	return float(r) if WFX.truthy(r) else float(st["bowMax"])
## 突きの届く距離の倍率（騎士の雷で伸びる）
func reach(normal = null): return WFX.fx_reduce("reach", 1.0, [normal])
## field.aimPoint: マウスの指す地面の点
func aim_point() -> Dictionary: return point()

func net_send(msg: Dictionary) -> void:
	if msg.get("t") == "hit": last_hit = msg
	g.net.send(msg)

## 近くの敵（hp が残っていて、半径 r に敵の大きさを足した中）
func targets(x = null, z = null, r = null) -> Array:
	var out := []
	for mb in mobs.values():
		if float(mb["hp"]) > 0.0 and sqrt(pow(float(mb["x"]) - float(x), 2) + pow(float(mb["z"]) - float(z), 2)) < float(r) + float(mb["rad"]): out.append(mb)
	return out

func nearest(rng = null):
	var best = null
	var bd := float(rng)
	for mb in mobs.values():
		var d := sqrt(pow(float(mb["x"]) - float(me["x"]), 2) + pow(float(mb["z"]) - float(me["z"]), 2))
		if d < bd:
			bd = d
			best = mb
	return best


## 画面の文字（screen.floatText）。cls: "" 白・crit 黄・poison 緑・just 水色・info 薄い青・heal 緑・me 赤
func float_text(x, y, z, text, cls = null):
	var s := ""
	if text is float or text is int: s = str(int(text))
	else: s = str(text)
	g._float(Vector3(float(x), float(y), float(z)), s, _cls_color(String(cls) if cls != null else ""))

func _cls_color(cls: String) -> Color:
	match cls:
		"crit": return Color(1, 0.85, 0.3)
		"poison": return Color(0.6, 1, 0.45)
		"just": return Color(0.6, 1, 1)
		"info": return Color(0.7, 0.9, 1)
		"heal": return Color(0.5, 1, 0.6)
		"me": return Color(1, 0.35, 0.3)
	return Color.WHITE

## actions.js heal(n, show)
func heal_player(n: float, show: bool) -> void:
	if character_lost or me.get("crawl", false): return
	var before: float = me["hp"]
	me["hp"] = minf(float(st["mhp"]), float(me["hp"]) + n)
	if show and me["hp"] > before:
		float_text(me["x"], 2.2, me["z"], "+" + str(int(roundf(me["hp"] - before))), "heal")


# ---------------------------------------------------------------- 呼ばれた操作を実際の処理につなぐ
func _op(name: String, args: Array):
	match name:
		"arc": return _v(Callable(self, "strike_arc"), [float(args[0]), float(args[1]), float(args[2]), args[3] if args.size() > 3 and args[3] != null else {}])
		"line": return _v(Callable(self, "strike_line"), [float(args[0]), float(args[1]), float(args[2]), args[3] if args.size() > 3 and args[3] != null else {}])
		"circle": return _v(Callable(self, "strike_circle"), [float(args[0]), float(args[1]), float(args[2]), float(args[3]), args[4] if args.size() > 4 and args[4] != null else {}])
		"proj": return _v(Callable(self, "strike_proj"), [args[0] if args.size() > 0 and args[0] != null else {}])
		"hit": return _v(Callable(self, "deal"), [args[0], float(args[1]), args[2] if args.size() > 2 and args[2] != null else {}])
		"dash": return _v(Callable(self, "strike_dash"), [float(args[0]), float(args[1]), float(args[2]), float(args[3]) if args.size() > 3 and args[3] != null else 0.0])
		"fx.slash": return _v(Callable(self, "fx_slash"), [float(args[0]), float(args[1]), float(args[2]), float(args[3]), float(args[4]), args[5]])
		"text": return _v(Callable(self, "float_text"), [me["x"], 3, me["z"], args[0], args[1] if args.size() > 1 else null])
		"floatText": return _v(Callable(self, "float_text"), [args[0], args[1], args[2], args[3], args[4] if args.size() > 4 else null])
		"shake": return _v(Callable(self, "add_shake"), [float(args[0])])
		"buff": return _v(Callable(self, "add_buff"), [String(args[0]), String(args[1]), float(args[2]), args[3], args[4]])
		"heal":
			if args.size() == 1: heal_player(float(st["mhp"]) * float(args[0]), true)   # c.heal(frac)
			return null
		"resetCd":
			me["tcd"][args[0]] = 0.0
			return null
		"taunt": return _v(Callable(self, "net_send"), [{"t": "taunt", "r": args[0]}])
		"setHitStop", "onVariantHit", "run": return null
		"sfx": return _todo("sfx:" + str(args[0]))   # 音（TODO: G8）。名前ごとに数える
		"arrow": return _v(Callable(self, "strike_arrow"), [args[0] if args.size() > 0 and args[0] != null else {}])
	_todo(name)
	return null


## 戻り値のない関数を呼んで null を返す（_op の戻り値は JavaScript の undefined にあたる）
func _v(f: Callable, a: Array):
	f.callv(a)
	return null


func _todo(name: String):
	todo[name] = int(todo.get(name, 0)) + 1
	return null


# ---------------------------------------------------------------- 当てる（actions.js strikes）
func _nn(o: Dictionary, key: String, d):
	var v = o.get(key)
	return d if v == null else v


## dealDamage + 確認用の行（--bot のとき HIT <名前> <ダメージ> type=<種類> mult=<倍率> ...）
func deal(mb, mult: float, o: Dictionary) -> void:
	var before := float(mb["hp"]) if mb != null else 0.0
	last_hit = {}
	Dmg.deal_damage(self, mb, mult, o)
	if mb != null and g.args.has("bot") and float(mb["hp"]) < before:
		print("HIT %s %d type=%s mult=%.2f%s hp=%d" % [mb.get("name", "?"), int(before - float(mb["hp"])), String(o.get("type", "")), mult, " crit" if last_hit.get("crit", false) else "", int(mb["hp"])])


## strikes.arc: 扇形（range・deg）。倒れている仲間も起こす。形の判定は strikes.gd（照合: tests/strikes_golden.gd）
func strike_arc(rng: float, deg: float, mult: float, o: Dictionary) -> void:
	Strikes.arc(me, mobs, downed_allies(), rng, deg, mult, o, Callable(self, "deal"), Callable(self, "revive_hit"))


## strikes.line: 細長い当たり（len・w）。o.sx・o.sz で始点
func strike_line(length: float, w: float, mult: float, o: Dictionary) -> void:
	Strikes.line(me, mobs, downed_allies(), length, w, mult, o, Callable(self, "deal"), Callable(self, "revive_hit"))


## strikes.circle: 円。o.reach で o.a の向きへ縦に引き伸ばす（横幅は r のまま）
func strike_circle(x: float, z: float, r: float, mult: float, o: Dictionary) -> void:
	Strikes.circle(me, mobs, downed_allies(), x, z, r, mult, o, Callable(self, "deal"), Callable(self, "revive_hit"))


## strikes.dash
func strike_dash(a: float, dist: float, dur: float, iframe: float) -> void:
	me["dashA"] = a
	me["dashT"] = dur
	me["dashSpeed"] = dist / dur
	me["a"] = a
	if iframe != 0.0: me["iframe"] = maxf(float(me["iframe"]), iframe)


## strikes.proj: 飛ぶ斬撃（既定は速さ 22m/s・0.7 秒・半径 1.8m・威力 1.4。同じ敵には 1 回）。
## 形は斬撃波（PROJ_SHAPES.wave。wave = true）と、投げた斧（shape = "axe"。wave = false。回りながら飛ぶ板で代用）。
## o.boomerang があれば戻ってくる飛び道具（行き → 先で回る → 持ち主へ戻る。往復とも当たる）
func strike_proj(o: Dictionary) -> void:
	var color = _nn(o, "color", weapon_color())
	var w := Strikes.make_proj(o, me, color)
	var boom = o.get("boomerang")
	var is_axe: bool = o.get("shape") == "axe"
	var node := MeshInstance3D.new()
	if is_axe:
		var bm := BoxMesh.new()
		bm.size = Vector3(1.4, 0.1, 0.5)
		node.mesh = bm
		node.material_override = GameVisuals.mat(_color(color), true, 0.9)
	else:
		node.mesh = GameVisuals.shape_mesh({"k": "cone", "len": 1.8, "arc": deg_to_rad(120.0), "a": float(o["a"]) + PI}, 1.0)
		node.material_override = GameVisuals.mat(_color(color), true, 0.7)
	node.position = Vector3(w["x"], g.world.ground_y(w["x"], w["z"]) + 1.0, w["z"])
	if boom != null: node.scale = Vector3.ONE * float(_nn(o, "scale", 1.0))
	g.world.add_child(node)
	w["node"] = node
	projs.append(w)
	sfx("wave")


## strikes.arrow: 矢（弓・投げナイフ）。射程まで飛び、敵に 1 回ずつ当たる（貫通しない矢は最初の敵で止まる）。
## 射程: 指定がなければ、弓の通常攻撃は引かずに撃つ射程 bowBase・弓のスキルは最大射程 bowMax（弓以外の投げナイフなどは 24m）
func strike_arrow(o: Dictionary) -> void:
	var color = _nn(o, "color", weapon_color())
	var a: float = float(o["a"])
	var node := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.1, 0.1, 1.6 if WFX.truthy(o.get("big")) else 1.0)
	node.mesh = bm
	node.material_override = GameVisuals.mat(_color(color), true, 0.95)
	node.position = Vector3(me["x"], g.world.ground_y(me["x"], me["z"]) + 1.2, me["z"])
	node.rotation.y = a
	g.world.add_child(node)
	var w := Strikes.make_arrow(o, me, st, color)
	w["node"] = node
	projs.append(w)
	var fx0: float = me["x"] + sin(a) * 0.9
	var fz0: float = me["z"] + cos(a) * 0.9
	fx_flash_arrow(fx0, fz0, color, WFX.truthy(o.get("big")))   # 射出の閃光
	sfx("swing")


func fx_flash_arrow(x: float, z: float, color, big: bool) -> void:
	_op("fx.flash", [x, 1.3, z, color, 14 if big else 8, 0.15, 6])
	fx.parts.burst(x, 1.25, z, 18 if big else 8, {"color": color, "speed": 5, "size": 0.35, "life": 0.25, "gravity": 0})


## actions.js updateProjs（斬撃波・矢の分）。位置は向きと速さで進め、敵に 1 回ずつ当て、壁か寿命で消える。
## 当たりと動きは strikes.gd の proj_step（照合済み）。ここは見た目のノードの更新と片づけだけ
func update_projs(dt: float) -> void:
	var env := {"me": me, "mobs": mobs, "allies": Callable(self, "downed_allies"), "deal": Callable(self, "deal"), "revive": Callable(self, "revive_hit"),
		"collide": Callable(self, "_proj_collide"), "tf": Callable(self, "_proj_tf"), "rand": Callable(self, "random"), "vis": Callable(self, "_proj_vis")}
	for i in range(projs.size() - 1, -1, -1):
		var w: Dictionary = projs[i]
		var gone := Strikes.proj_step(w, dt, env)
		if gone:
			w["node"].queue_free()
			projs.remove_at(i)
			continue
		if w.get("arrow", false):
			w["node"].position = Vector3(w["x"], g.world.ground_y(w["x"], w["z"]) + 1.2, w["z"])
			continue
		w["node"].position = Vector3(w["x"], g.world.ground_y(w["x"], w["z"]) + 1.0, w["z"])
		if w["shape"] == "axe": w["node"].rotation.y -= dt * 20.0   # PROJ_SHAPES.axe の tick: 回りながら飛ぶ
		elif w["boom"] == null: w["node"].scale = Vector3.ONE * (1.0 + w["t"] * 1.5)   # shapes wave の tick: 広がりながら消える


func _proj_collide(x: float, z: float) -> Array:
	return R.collide_xz(g.area, x, z, 0.1, g.door_open)


func _proj_tf(id: String) -> bool:
	return Dmg.tf(self, id)


## proj_step の見た目（矢の軌跡・当たりの粒・遠矢の文字）
func _proj_vis(kind: String, a, b) -> void:
	match kind:
		"arrow_trail": fx.parts.emit(a["x"], 1.2, a["z"], {"color": a["color"], "size": 0.35, "life": 0.25, "speed": 0.4, "gravity": 0})
		"arrow_burst": fx.parts.burst(a["x"], 1.2, a["z"], 18 if WFX.truthy(a.get("full")) else 8, {"color": 0xffd84a if WFX.truthy(a.get("full")) else 0xffffff, "speed": 5, "size": 0.4, "life": 0.3})
		"far_text": float_text(a["x"], 3.4, a["z"], "遠矢", "info")


func clear_projs() -> void:
	for w in projs: w["node"].queue_free()
	projs.clear()


# ---------------------------------------------------------------- 倒れている仲間（hurt.js downedAllies・reviveHit）
func downed_allies() -> Array:
	var out := []
	for o in g.others.values():
		if float(o.get("rv", -1.0)) >= 0.0: out.append(o)
	return out


func revive_hit(p: Dictionary, opt: Dictionary) -> void:
	if me.get("crawl", false) or me.get("dead", false) or not float(p.get("rv", -1.0)) >= 0.0 or now() - float(p.get("revHitT", 0.0)) < 0.05: return
	p["revHitT"] = now()
	var rv: Dictionary = R.data()["revive"]
	var v := roundf(minf(float(rv["perHit"]), float(rv["flat"]) + Dmg.stun_value(self, opt)) * 10.0) / 10.0
	if v <= 0.0: return
	net_send({"t": "rev", "id": p["id"], "v": v})
	float_text(p["x"], 2.2, p["z"], "起こす +%s" % str(v), "info")


# ---------------------------------------------------------------- 見た目（今あるものだけ。ほかは TODO）
func _color(c) -> Color:
	if c is String: return Color.html(c)
	return Color.hex((int(c) << 8) | 0xFF)


## fx.slash(x, z, a, r, deg, color, ...): 扇の斬撃の板（0.12 秒で消える）
func fx_slash(x: float, z: float, a: float, r: float, deg: float, color) -> void:
	var m := MeshInstance3D.new()
	m.mesh = GameVisuals.shape_mesh({"k": "cone", "len": r, "arc": deg * PI / 180.0, "a": a}, 1.0)
	m.material_override = GameVisuals.mat(_color(color).lerp(Color.WHITE, 0.5), true, 0.5)
	m.position = Vector3(x, g.world.ground_y(x, z) + 0.9, z)
	g.world.add_child(m)
	var tw: Tween = g.create_tween()
	tw.tween_interval(0.12)
	tw.tween_callback(m.queue_free)


# ---------------------------------------------------------------- 罠・旗の見た目（meshes.js trapMesh・bannerMesh と fx.add）
## 罠: 地面の輪と棘。返した部品が me.traps[].mesh に入る
func trap_visual(x, z, o: Dictionary):
	var r := float(o.get("r", 1.8))
	var col = o.get("color") if o.get("color") != null else 0xffc860
	var n := Node3D.new()
	var ring := MeshInstance3D.new()
	ring.mesh = GameVisuals.shape_mesh({"k": "ring", "r0": r - 0.12, "r1": r}, 1.0)
	ring.material_override = GameVisuals.mat(_color(col), true, 0.55)
	ring.position.y = 0.06
	n.add_child(ring)
	for i in 6:
		var sp := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.0; cm.bottom_radius = 0.07; cm.height = 0.35
		sp.mesh = cm
		sp.material_override = GameVisuals.mat(Color.html("#d8c8a8"))
		var ang := i / 6.0 * TAU
		sp.position = Vector3(sin(ang) * r * 0.45, 0.15, cos(ang) * r * 0.45)
		n.add_child(sp)
	n.position = Vector3(float(x), g.world.ground_y(float(x), float(z)), float(z))
	g.world.add_child(n)
	return n


func trap_visual_free(t: Dictionary) -> void:
	var n = t.get("mesh")
	if n != null and is_instance_valid(n) and n is Node: n.queue_free()


## 旗: 旗竿と旗と効果範囲の輪（8 秒で消える）。前の旗は消す
func banner_visual(x, z, old):
	if old != null and is_instance_valid(old) and old is Node: old.queue_free()
	var n := Node3D.new()
	var pole := MeshInstance3D.new()
	var pm := CylinderMesh.new()
	pm.top_radius = 0.05; pm.bottom_radius = 0.05; pm.height = 3.2
	pole.mesh = pm
	pole.material_override = GameVisuals.mat(Color.html("#8a6a40"))
	pole.position.y = 1.6
	n.add_child(pole)
	var flag := MeshInstance3D.new()
	var fm := BoxMesh.new()
	fm.size = Vector3(0.05, 0.7, 1.1)
	flag.mesh = fm
	flag.material_override = GameVisuals.mat(Color.html("#6ab0ff"), true, 0.9)
	flag.position = Vector3(0, 2.8, 0.6)
	n.add_child(flag)
	var ring := MeshInstance3D.new()
	ring.mesh = GameVisuals.shape_mesh({"k": "ring", "r0": 4.85, "r1": 5.0}, 1.0)
	ring.material_override = GameVisuals.mat(Color.html("#6ab0ff"), true, 0.3)
	ring.position.y = 0.06
	n.add_child(ring)
	n.position = Vector3(float(x), g.world.ground_y(float(x), float(z)), float(z))
	g.world.add_child(n)
	var tw: Tween = g.create_tween()
	tw.tween_interval(8.0)
	tw.tween_callback(func(): if is_instance_valid(n): n.queue_free())
	return n
