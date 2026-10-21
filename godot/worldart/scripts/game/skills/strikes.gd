extends RefCounted
## 当たりと飛び道具の毎フレームの純粋な部分。元は public/js/game/actions.js の
##   buildCombat の strikes（arc・line・circle・proj・arrow）、boomerangStep、updateProjs、projRevive。
## ノード（見た目）・音・粒には触れない。ゲーム（skills/game_ctx.gd）はこれを呼び、見た目は呼んだあとに自分で更新する。
## 照合は tests/strikes_golden.gd（元の JavaScript を tools/worldart/godot/golden_strikes.mjs で動かした記録と比べる）。
## 入力は 自分 me・敵 mobs（id → Dictionary）・倒れた仲間 allies・引数・dt。当てたものは deal / revive の Callable に渡す
## （呼ぶ順は元と同じ。dealDamage の式はここに入れない）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const R = preload("res://scripts/game/rules.gd")


## o.key ?? d
static func nn(o: Dictionary, key: String, d):
	var v = o.get(key)
	return d if v == null else v


# ---------------------------------------------------------------- 当たりの形（strikes.arc・line・circle）
## strikes.arc: 扇形（rng・deg）。deal(mb, mult, opts)・revive(p, o) を元と同じ順に呼ぶ
static func arc(me: Dictionary, mobs: Dictionary, allies: Array, rng: float, deg: float, mult: float, o: Dictionary, deal: Callable, revive: Callable) -> void:
	var a: float = float(nn(o, "a", me["a"]))
	var arc_ := deg * PI / 180.0 / 2.0
	for mb in mobs.values():
		var dx: float = float(mb["x"]) - float(me["x"])
		var dz: float = float(mb["z"]) - float(me["z"])
		var d := sqrt(dx * dx + dz * dz)
		if d > rng + float(mb["rad"]): continue
		if absf(R.ang_diff(atan2(dx, dz), a)) <= arc_ + float(mb["rad"]) / maxf(d, 0.5) or d < float(mb["rad"]) + 0.6:
			deal.call(mb, mult, WFX.fx_reduce("hitOpts", o, [d / (rng + float(mb["rad"]))]))
	for p in allies:
		var dx2: float = float(p["x"]) - float(me["x"])
		var dz2: float = float(p["z"]) - float(me["z"])
		var d2 := sqrt(dx2 * dx2 + dz2 * dz2)
		if d2 < rng + 0.6 and (absf(R.ang_diff(atan2(dx2, dz2), a)) <= arc_ + 0.6 / maxf(d2, 0.5) or d2 < 1.2): revive.call(p, o)


## strikes.line: 細長い当たり（length・w）。o.sx・o.sz で始点
static func line(me: Dictionary, mobs: Dictionary, allies: Array, length: float, w: float, mult: float, o: Dictionary, deal: Callable, revive: Callable) -> void:
	var a: float = float(nn(o, "a", me["a"]))
	var sx: float = float(nn(o, "sx", me["x"]))
	var sz: float = float(nn(o, "sz", me["z"]))
	var fx_ := sin(a)
	var fz := cos(a)
	for mb in mobs.values():
		var dx: float = float(mb["x"]) - sx
		var dz: float = float(mb["z"]) - sz
		var along := dx * fx_ + dz * fz
		var side := absf(dx * fz - dz * fx_)
		if along > -float(mb["rad"]) and along < length + float(mb["rad"]) and side < w / 2.0 + float(mb["rad"]):
			deal.call(mb, mult, WFX.fx_reduce("hitOpts", o, [along / (length + float(mb["rad"]))]))
	for p in allies:
		var dx2: float = float(p["x"]) - sx
		var dz2: float = float(p["z"]) - sz
		var along2 := dx2 * fx_ + dz2 * fz
		var side2 := absf(dx2 * fz - dz2 * fx_)
		if along2 > -0.6 and along2 < length + 0.6 and side2 < w / 2.0 + 0.6: revive.call(p, o)


## strikes.circle: 円。o.reach で o.a の向きへ縦に引き伸ばす（横幅は r のまま）。o.skip の敵は除く
static func circle(me: Dictionary, mobs: Dictionary, allies: Array, x: float, z: float, r: float, mult: float, o: Dictionary, deal: Callable, revive: Callable) -> void:
	var reach: float = float(nn(o, "reach", 0.0))
	var a: float = float(nn(o, "a", me["a"]))
	var fx_ := sin(a)
	var fz := cos(a)
	var skip = o.get("skip")
	for mb in mobs.values():
		if skip != null and is_same(mb, skip): continue
		if reach_dist(float(mb["x"]), float(mb["z"]), x, z, fx_, fz, reach) < r + float(mb["rad"]): deal.call(mb, mult, o)
	for p in allies:
		if reach_dist(float(p["x"]), float(p["z"]), x, z, fx_, fz, reach) < r + 0.6: revive.call(p, o)


static func reach_dist(px: float, pz: float, x: float, z: float, fx_: float, fz: float, reach: float) -> float:
	var dx := px - x
	var dz := pz - z
	var t := clampf(dx * fx_ + dz * fz, 0.0, reach)
	var ex := dx - fx_ * t
	var ez := dz - fz * t
	return sqrt(ex * ex + ez * ez)


# ---------------------------------------------------------------- 飛び道具を作る（strikes.proj・arrow の状態の部分）
## strikes.proj が state.projs に足す値（node は呼んだ側が足す）。color は RARITIES[S.wr].color
## 形は斬撃波（wave = true）と投げた斧（shape = "axe"。wave = false）。o.boomerang があれば戻ってくる
static func make_proj(o: Dictionary, me: Dictionary, color) -> Dictionary:
	var boom = o.get("boomerang")
	var is_axe: bool = o.get("shape") == "axe"
	var life: float = (float(boom["out"]) + float(Dmg.or_(boom.get("hover"), 0.0)) + 3.0) if boom != null else float(nn(o, "life", 0.7))
	return {"x": float(nn(o, "sx", me["x"])), "z": float(nn(o, "sz", me["z"])), "a": float(o["a"]), "tech": o.get("tech"), "shape": o.get("shape"), "color": color, "t": 0.0,
		"speed": float(nn(o, "speed", 22.0)), "life": life, "rad": float(nn(o, "rad", 1.8)), "mult": float(nn(o, "mult", 1.4)),
		"type": o.get("type"), "hit": {}, "sv": o.get("sv"), "cast": o.get("cast"), "wave": not is_axe, "wtNo": WFX.truthy(o.get("wtNo")),
		"stun": o.get("stun"), "eclipse": WFX.truthy(o.get("eclipse")), "boom": boom, "phase": 0, "hitT": {}}


## strikes.arrow が state.projs に足す値（node は呼んだ側が足す）。
## 射程: 指定がなければ、弓の通常攻撃は引かずに撃つ射程 bowBase・弓のスキルは最大射程 bowMax（弓以外の投げナイフなどは 24m）
static func make_arrow(o: Dictionary, me: Dictionary, st: Dictionary, color) -> Dictionary:
	var ranged: bool = WFX.truthy(st["W"].get("ranged"))
	var rng: float
	if o.get("range") != null: rng = float(o["range"])
	elif ranged: rng = float(st["bowBase"]) if o.get("type") == "normal" else float(st["bowMax"])
	else: rng = 24.0
	var speed: float = float(nn(o, "speed", 42.0))
	return {"arrow": true, "x": float(me["x"]), "z": float(me["z"]), "sx": float(me["x"]), "sz": float(me["z"]), "a": float(o["a"]), "t": 0.0, "speed": speed,
		"life": (rng + 0.6) / speed, "range": rng, "rad": float(nn(o, "rad", 0.7)), "mult": float(nn(o, "mult", 1.0)), "type": o.get("type"),
		"pierce": WFX.truthy(o.get("pierce")), "hit": {}, "color": color, "sv": o.get("sv"), "cast": o.get("cast"), "tech": o.get("tech"),
		"poison": float(Dmg.or_(o.get("poison"), 0.0)), "crit": o.get("crit"), "snipe": o.get("snipe"), "full": o.get("full"), "onHit": o.get("onHit")}


# ---------------------------------------------------------------- 毎フレーム（updateProjs）
## projRevive: 斬撃波・矢が倒れている仲間に当たったら起こす（貫通しない矢はそこで止まる）
static func proj_revive(w: Dictionary, allies: Array, revive: Callable, arrow: bool) -> bool:
	for p in allies:
		var key := "p" + str(p["id"])
		if w["hit"].has(key) or sqrt(pow(float(p["x"]) - w["x"], 2) + pow(float(p["z"]) - w["z"], 2)) > w["rad"] + 0.6: continue
		w["hit"][key] = true
		revive.call(p, {"type": w["type"], "sv": w["sv"]})
		if arrow and not w["pierce"]: return true
	return false


## boomerangStep: 戻ってくる飛び道具の動き（位置は proj_step が先に向きと速さで進めている）。持ち主に戻ったら true
static func boomerang_step(w: Dictionary, me: Dictionary, dt: float) -> bool:
	var B: Dictionary = w["boom"]
	if w["phase"] == 0 and w["t"] >= B["out"]:
		w["phase"] = 1 if WFX.truthy(B.get("hover")) else 2
		w["turnT"] = w["t"]
		if w["phase"] == 2: w["hit"].clear()
	if w["phase"] == 1:
		w["x"] -= sin(w["a"]) * w["speed"] * dt   # 先で止まって回る
		w["z"] -= cos(w["a"]) * w["speed"] * dt
		if w["t"] >= float(B["out"]) + float(B["hover"]):
			w["phase"] = 2
			w["hit"].clear()
		return false
	if w["phase"] != 2: return false
	# 持ち主へ向かって曲がりながら戻る（少し速く）
	var tx: float = float(me["x"]) - w["x"]
	var tz: float = float(me["z"]) - w["z"]
	var d := sqrt(tx * tx + tz * tz)
	w["x"] -= sin(w["a"]) * w["speed"] * dt
	w["z"] -= cos(w["a"]) * w["speed"] * dt
	w["a"] = atan2(tx, tz)
	var v: float = w["speed"] * 1.15 * dt
	w["x"] += sin(w["a"]) * minf(v, d)
	w["z"] += cos(w["a"]) * minf(v, d)
	return d < 1.2


## updateProjs の 1 個分。w を進め、当てて、消えるなら true（消すのは呼んだ側。ノードは呼んだ側が片づける）。
## env: { me, mobs, allies: Callable() → Array, deal(mb, mult, opts), revive(p, o), collide(x, z) → [x, z],
##        tf(id) → bool, rand() → float, vis(kind, a, b) }
## vis は見た目だけ（結果に関わらない）: "arrow_trail"(w)・"arrow_burst"(w)・"far_text"(mb)
static func proj_step(w: Dictionary, dt: float, env: Dictionary) -> bool:
	var me: Dictionary = env["me"]
	var mobs: Dictionary = env["mobs"]
	var deal: Callable = env["deal"]
	var vis: Callable = env["vis"]
	w["t"] += dt
	w["x"] += sin(w["a"]) * w["speed"] * dt
	w["z"] += cos(w["a"]) * w["speed"] * dt
	if w.get("arrow", false):
		# 矢: 射程（離したときの円の大きさ）まで飛ぶ
		if env["rand"].call() < 0.7: vis.call("arrow_trail", w, null)
		var done := false
		WFX.fx_call("arrowTick", [w])   # 射抜き など
		for mb in mobs.values():
			if w["hit"].has(mb["id"]) or sqrt(pow(float(mb["x"]) - w["x"], 2) + pow(float(mb["z"]) - w["z"], 2)) > w["rad"] + float(mb["rad"]): continue
			w["hit"][mb["id"]] = true
			# 射程の中はどこでも本来のダメージ。遠矢（射程の端で +20%）は弓のファイル
			var d := sqrt(pow(float(mb["x"]) - w["sx"], 2) + pow(float(mb["z"]) - w["sz"], 2))
			var edge: bool = WFX.fx_some("arrowEdge", [w, d])
			var hawk: bool = WFX.truthy(w.get("full")) and bool(env["tf"].call("t_hawk")) and env["rand"].call() < 0.3
			var opt := {"type": w["type"], "tech": w["tech"], "sv": w["sv"], "cast": w["cast"], "poison": w["poison"], "full": w["full"], "snipe": w["snipe"]}
			if hawk or WFX.truthy(w.get("crit")): opt["crit"] = true   # crit: hawk || w.crit || undefined
			deal.call(mb, w["mult"] * (1.2 if edge else 1.0), opt)
			if w["onHit"] is Callable: w["onHit"].call(mb)
			WFX.fx_call("arrowHit", [w, mb])   # 鷹の目・狙い澄まし など
			if edge: vis.call("far_text", mb, null)
			vis.call("arrow_burst", w, null)
			if not w["pierce"]:
				done = true
				break
		if not done: done = proj_revive(w, env["allies"].call(), env["revive"], true)
		var c: Array = env["collide"].call(w["x"], w["z"])
		if done or w["t"] > w["life"] or sqrt(pow(c[0] - w["x"], 2) + pow(c[1] - w["z"], 2)) > 0.05:
			WFX.fx_call("arrowGone", [w])
			return true
		return false
	var caught: bool = w["boom"] != null and boomerang_step(w, me, dt)
	var hovering: bool = w["boom"] != null and w["phase"] == 1
	for mb in mobs.values():
		if w["hit"].has(mb["id"]) and not (w["boom"] != null and WFX.truthy(w["boom"].get("rehit")) and hovering and w["t"] - float(w["hitT"].get(mb["id"], -9.0)) >= w["boom"]["rehit"]): continue
		var dx: float = float(mb["x"]) - w["x"]
		var dz: float = float(mb["z"]) - w["z"]
		if sqrt(dx * dx + dz * dz) < w["rad"] + float(mb["rad"]):
			w["hit"][mb["id"]] = true
			w["hitT"][mb["id"]] = w["t"]
			var pm: float = w["mult"]
			if hovering and w["boom"].get("hoverMult") != null: pm = w["boom"]["hoverMult"]
			deal.call(mb, pm, {"type": w["type"], "tech": w["tech"], "noProc": true, "sv": w["sv"], "cast": w["cast"], "wave": w["wave"], "proj": w, "wtNo": w["wtNo"], "stun": w["stun"]})
	proj_revive(w, env["allies"].call(), env["revive"], false)
	# 戻ってくる斧は壁を抜ける（持ち主のところへ必ず帰る）
	var c2: Array = [w["x"], w["z"]] if w["boom"] != null else env["collide"].call(w["x"], w["z"])
	if caught or w["t"] > w["life"] or sqrt(pow(c2[0] - w["x"], 2) + pow(c2[1] - w["z"], 2)) > 0.05:
		if caught and w["boom"].get("onCatch") is Callable: w["boom"]["onCatch"].call()
		return true
	return false
