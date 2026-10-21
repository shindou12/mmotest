class_name GameRules
extends RefCounted
## ゲームの共通の式を GDScript に移したもの（L27）。元は public/shared/areas.js・data.js と public/js/game/*.js。
## 数値の表は data/game.json（tools/worldart/godot/export_gamedata.mjs が public/shared/ から書く）。
## 元の式を変えたら、ここも同じに直す（どの関数が元のどれかは各関数の説明に書いてある）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const WTree = preload("res://scripts/game/skills/wtree.gd")

static var G: Dictionary = {}


static func data() -> Dictionary:
	if G.is_empty():
		G = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	return G


static func area(id: String) -> Dictionary:
	return data()["areas"][id]


## data.js angDiff
static func ang_diff(a: float, b: float) -> float:
	var d := a - b
	while d > PI: d -= TAU
	while d < -PI: d += TAU
	return d


## areas.js boundR（元の式のまま。値は export_gamedata.mjs が bound に書く）。a は北 0・東 +（angOf = atan2(x, -z)）
## 計算は 64 ビットの float だけで行う（Vector2 は 32 ビットなので使わない）
static func bound_r(ar: Dictionary, a: float) -> float:
	var b: Dictionary = ar["bound"]
	var R := float(b["R"]); var n := float(b["sq"]); var w := float(b["wob"])
	var dx := sin(a); var dz := -cos(a)
	var base := 1.0 / pow(pow(absf(dx / (R * float(b["ell"][0]))), n) + pow(absf(dz / (R * float(b["ell"][1]))), n), 1.0 / n)
	return base * (1.0 + w * (0.55 * sin(3.0 * a + float(b["p1"])) + 0.3 * sin(5.0 * a + float(b["p2"])) + 0.15 * sin(8.0 * a + float(b["p3"]))))


static func ang_of(x: float, z: float) -> float:
	return atan2(x, -z)


## town-layout.js pushOutBox
static func push_out_box(b: Dictionary, x: float, z: float, rad: float):
	var c := cos(float(b["ry"])); var s := sin(float(b["ry"]))
	var dx := x - float(b["x"]); var dz := z - float(b["z"])
	var lx := dx * c - dz * s; var lz := dx * s + dz * c
	var hw := float(b["w"]) / 2.0; var hd := float(b["d"]) / 2.0
	var nx := clampf(lx, -hw, hw); var nz := clampf(lz, -hd, hd)
	var ox := lx - nx; var oz := lz - nz; var d := sqrt(ox * ox + oz * oz)
	if d >= rad: return null
	var px: float; var pz: float
	if d > 1e-4:
		px = nx + ox / d * rad; pz = nz + oz / d * rad
	else:
		var opts := [[hw + rad - lx, 0.0], [-hw - rad - lx, 0.0], [0.0, hd + rad - lz], [0.0, -hd - rad - lz]]
		opts.sort_custom(func(p, q): return absf(p[0] + p[1]) < absf(q[0] + q[1]))
		px = lx + opts[0][0]; pz = lz + opts[0][1]
	return [float(b["x"]) + px * c + pz * s, float(b["z"]) - px * s + pz * c]


## areas.js solidAt（屋内のマス目: 壁と閉じた扉）
static func solid_at(ar: Dictionary, c: int, r: int, door_open: bool) -> bool:
	if r < 0 or c < 0 or r >= int(ar["H"]) or c >= int(ar["W"]): return true
	var ch := String(ar["rows"][r])[c]
	return ch == "#" or (ch == "D" and not door_open)


## areas.js collide を Vector2 で返す（ゲームの座標用）。照合は collide_xz の 64 ビットの値で行う
static func collide(ar: Dictionary, x: float, z: float, rad := 0.5, door_open := false) -> Vector2:
	var q := collide_xz(ar, x, z, rad, door_open)
	return Vector2(q[0], q[1])


## areas.js collide（屋外: 輪郭と当たり判定のある物。屋内: マス目の壁と扉）。[x, z] を 64 ビットの float で返す
static func collide_xz(ar: Dictionary, x: float, z: float, rad := 0.5, door_open := false) -> Array:
	if ar["shape"] == "grid":
		var CELL := float(ar["cell"]); var W := int(ar["W"]); var H := int(ar["H"])
		for _p in 2:
			var c := int(floor(x / CELL + W / 2.0)); var r := int(floor(z / CELL + H / 2.0))
			for dr in [-1, 0, 1]:
				for dc in [-1, 0, 1]:
					if not solid_at(ar, c + dc, r + dr, door_open): continue
					var cx: float = (c + dc - W / 2.0) * CELL; var cz: float = (r + dr - H / 2.0) * CELL
					var nx := clampf(x, cx, cx + CELL); var nz := clampf(z, cz, cz + CELL)
					var dx := x - nx; var dz := z - nz; var d := sqrt(dx * dx + dz * dz)
					if d < rad:
						if d > 1e-4:
							x = nx + dx / d * rad; z = nz + dz / d * rad
						else:
							var opts := [[cx - rad - x, 0.0], [cx + CELL + rad - x, 0.0], [0.0, cz - rad - z], [0.0, cz + CELL + rad - z]]
							opts.sort_custom(func(p, q): return absf(p[0] + p[1]) < absf(q[0] + q[1]))
							x += opts[0][0]; z += opts[0][1]
		return [x, z]
	var passes := 2 if String(ar.get("layout", "")) != "" else 1
	for _p in passes:
		for o in ar["obstacles"]:
			if not o["solid"]: continue
			if o.has("box"):
				if sqrt(pow(x - float(o["x"]), 2) + pow(z - float(o["z"]), 2)) > float(o["r"]) + rad: continue
				var q = push_out_box(o["box"], x, z, rad)
				if q != null: x = q[0]; z = q[1]
				continue
			var dx := x - float(o["x"]); var dz := z - float(o["z"]); var d := sqrt(dx * dx + dz * dz); var mn := float(o["r"]) + rad
			if d < mn:
				var k := mn / d if d > 1e-4 else 1.0
				x = float(o["x"]) + (dx if d > 1e-4 else mn) * k
				z = float(o["z"]) + (dz if d > 1e-4 else 0.0) * k
	var a := ang_of(x, z); var mx := bound_r(ar, a) - 1.0; var dd := sqrt(x * x + z * z)
	if dd > mx: return [x * mx / dd, z * mx / dd]
	return [x, z]


## data.js inShape（敵の攻撃の予告の形: circle・ring・cone・line）
static func in_shape(s: Dictionary, x: float, z: float, pad := 0.4) -> bool:
	var dx := x - float(s["x"]); var dz := z - float(s["z"]); var d := sqrt(dx * dx + dz * dz)
	match String(s["k"]):
		"circle": return d <= float(s["r"]) + pad
		"ring": return d >= float(s["r0"]) - pad and d <= float(s["r1"]) + pad
		"cone":
			if d > float(s["len"]) + pad: return false
			if d < 1.2: return true
			return absf(ang_diff(atan2(dx, dz), float(s["a"]))) <= float(s["arc"]) / 2.0 + pad / maxf(d, 1.0)
		"line":
			var fx := sin(float(s["a"])); var fz := cos(float(s["a"]))
			var along := dx * fx + dz * fz; var side := absf(dx * fz - dz * fx)
			return along >= -pad and along <= float(s["len"]) + pad and side <= float(s["w"]) / 2.0 + pad
	return false


## data.js mobDef（d: 敵の番号。負はボスの手下、ELITE_BASE 以上は精鋭）
static func mob_def(floor_n: int, d: int) -> Dictionary:
	var F: Dictionary = data()["floors"][floor_n - 1]
	if d == int(data()["treasure"]["id"]): return data()["treasure"]
	if d < 0 and F["boss"] != null: return F["boss"]["minions"][-1 - d]
	if d >= 100 and d - 100 < F["elites"].size(): return F["elites"][d - 100]
	if d < F["mobs"].size(): return F["mobs"][d]
	return {"t": "slime", "name": "?", "color": "#888888", "scale": 1.0}


## 装備の強化倍率（data.js enhMult）
static func enh_mult(it) -> float:
	return 1.0 + float(it.get("enh", 0)) * 0.08 if it is Dictionary else 1.0


static func item_weight(it) -> float:
	if not it is Dictionary: return 0.0
	if it.has("weight"): return float(it["weight"])
	if it["slot"] == "weapon": return float(data()["weapons"].get(it.get("kind", "sword"), {}).get("weight", 4))
	if it["slot"] == "armor": return float(data()["armorClasses"][it.get("armor", "medium")]["weight"])
	return 0.5


## 武器ツリーの効果と技を移してある武器。ほかの武器は S.wt = null（ツリーの mods と効果は未）
const TREE_PORTED := ["sword", "greatsword"]

## 旧スキルツリーのノードの表（skills.js NODE_INDEX。表は game.json の trees から。手で写さない）
static var _node_index: Dictionary = {}


static func node_index() -> Dictionary:
	if _node_index.is_empty():
		for tid in data()["trees"]:
			for n in data()["trees"][tid]["nodes"]:
				var m: Dictionary = n.duplicate()
				m["tree"] = tid
				_node_index[n["id"]] = m
	return _node_index


## skills.js treeEffects: 旧スキルツリー（stat・style）の効果の集計。{ mods, flags, actives }（flags・actives は Set = キーが値の Dictionary）
static func tree_effects(ch: Dictionary, _wk: String) -> Dictionary:
	var mods := {}
	var flags := {}
	var actives := {}
	var idx := node_index()
	var tree = ch.get("tree")
	if tree is Dictionary:
		for id in tree:
			var r := float(tree[id])
			if not idx.has(id) or r == 0.0: continue
			var n: Dictionary = idx[id]
			if n.has("mods"):
				for k in n["mods"]: mods[k] = float(mods.get(k, 0.0)) + float(n["mods"][k]) * r
			if n.has("flag"): flags[n["flag"]] = true
			if n.has("active"): actives[n["active"]] = true
	return {"mods": mods, "flags": flags, "actives": actives}


## stats.js weaponSkillId: 武器のスキル。その武器種のものでなければ候補の先頭
static func weapon_skill_id(wk: String, w) -> String:
	var id = w.get("skill") if w is Dictionary else null
	var tbl: Dictionary = data()["skills"]["weapon"]
	if id != null and String(id) != "" and tbl.has(id) and tbl[id].get("kind") == wk: return String(id)
	return String(data()["weaponSkillPool"][wk][0])


## data.js titleReqOk
static func title_req_ok(req, wk: String) -> bool:
	if req == null or String(req) == "": return true
	if req == "melee": return bool(data()["weapons"].get(wk, {}).get("melee", false))
	return req == wk


## stats.js calcStats: 装備（武器・防具・装飾・称号）・旧スキルツリー・武器ツリー・重さから能力値 S を作る。
## Set（fx・flags・actives・tfx）は「キーが値の Dictionary」（.has(キー) で JavaScript の Set.has と同じ）。
## 武器ごとの効果の 'stats'・'afterStats'（weapon_fx.gd に登録済みのもの）も呼ぶ。me を渡すと HP を最大 HP に切り詰める（元の calcStats と同じ）。
## api（戦闘の環境）を渡すと、afterStats の前に api.st を新しい S にする。
## まだ入れていないもの: スキル変化（sv_ の付加効果。S.sv = null）、見た目 wst・arm（ゲームの外観の関数）、ほかの武器（短剣・盾槍・大斧・弓）のツリー
static func calc_stats(ch: Dictionary, me = null, api = null) -> Dictionary:
	var D := data()
	var eq: Dictionary = ch.get("eq", {})
	var items := []
	for k in ["weapon", "armor", "acc"]:
		if eq.get(k) is Dictionary: items.append(eq[k])
	var aff := {}
	var fxs := {}
	for it in items:
		for a in it.get("affixes", []):
			var key := String(a[0])
			if not D["affixes"].has(key): continue   # スキル変化（sv_*）は未
			aff[key] = float(aff.get(key, 0.0)) + float(D["affixes"][key]["tiers"][int(a[1]) - 1])
		for f in it.get("fx", []): fxs[String(f)] = true
	var arm = eq.get("armor")
	if arm is Dictionary and arm.get("base") is Array:
		aff[String(arm["base"][0])] = float(aff.get(String(arm["base"][0]), 0.0)) + float(arm["base"][1])
	var w = eq.get("weapon")
	var acc = eq.get("acc")
	var wk: String = w["kind"] if w is Dictionary else String(D["defaultWeapon"])
	# 称号: 条件（近接のみ など）を満たすときだけ効く。同じ固有効果は重ならない（Set）
	var title = eq.get("title")
	var title_on: bool = title is Dictionary and title_req_ok(title.get("req"), wk)
	var tfx := {}
	if title_on:
		if title.get("title") != null and String(title["title"]) != "": tfx[String(title["title"])] = true
		for f in title.get("fx", []): fxs[String(f)] = true
	var T := tree_effects(ch, wk)
	var WT = WTree.effects(ch, wk) if wk in TREE_PORTED else null
	var m := func(k: String) -> float: return float(aff.get(k, 0.0)) + float(T["mods"].get(k, 0.0)) + (float(WT.mods.get(k, 0.0)) if WT != null else 0.0)
	for f in T["flags"]: fxs[f] = true
	var base := func(it, k: String) -> float: return float(it.get(k, 0.0)) * enh_mult(it) if it is Dictionary else 0.0
	var W: Dictionary = D["weapons"][wk]
	var lv := int(ch["lv"])
	var L: Dictionary = D["levels"][lv - 1]
	var atk: float = (float(L["atk"]) + base.call(w, "atk") + base.call(acc, "atk")) * (1 + m.call("atkp") / 100.0)
	var mhp: float = (float(L["hp"]) + base.call(arm, "hp") + base.call(acc, "hp")) * (1 + m.call("hpp") / 100.0)
	var weight := 0.0
	for it in items: weight += item_weight(it)
	var wc: Dictionary = D["weightClasses"][-1]
	for c in D["weightClasses"]:
		if weight <= float(c["max"]): wc = c; break
	var def := minf(65.0, m.call("def") + base.call(arm, "def") + (float(D["instinct"]["dr"]) if W.get("melee", false) else 0.0) + float(L["wdef"][wk]))
	var actives: Dictionary = T["actives"].duplicate()
	if WT != null:
		for id in WT.actives: actives[id] = true
	var ws_id := weapon_skill_id(wk, w)
	var cs: Dictionary = D["consts"]
	var S := {"wk": wk, "W": W, "atk": atk, "mhp": roundf(mhp), "fx": fxs, "flags": T["flags"], "actives": actives,
		"wt": WT, "guard": bool(W.get("guard", false)), "chargeMax": float(cs["chargeMax"]), "dodgeDist": 1.0,
		"dStackPer": 0.0, "dStackMax": 10.0, "dStackT": 3.0,
		"crit": 5.0 + m.call("crit"), "critd": 150.0 + m.call("critd"), "aspd": m.call("aspd"), "move": m.call("move"),
		"vamp": m.call("vamp") + (4.0 if fxs.has("vamp") else 0.0), "cdr": minf(60.0, m.call("cdr") + (35.0 if fxs.has("star") else 0.0)),
		"def": def, "wr": int(w["rarity"]) if w is Dictionary else 0,
		"sv": null, "title": title, "titleOn": title_on, "tfx": tfx,
		"normp": m.call("normp"), "heavyp": m.call("heavyp"), "wskillp": m.call("wskillp"), "dodgecd": minf(60.0, m.call("dodgecd")),
		"justbuff": m.call("justbuff"), "counter": m.call("counter"), "backwater": m.call("backwater"), "maxPot": 3 + int(m.call("potion")) + int(ch.get("potBonus", 0)),
		"ws": D["skills"]["weapon"][ws_id], "skill": ws_id, "weight": weight, "wc": wc,
		"dodgeCd": float(cs["dodgeCd"]) * float(wc["cd"]) * (1 - minf(60.0, m.call("dodgecd")) / 100.0) * 1.0,
		"iframeBonus": 0.0, "stunp": m.call("stunp"),
		"bowBase": float(W.get("baseRange", 0.0)), "bowMax": float(W.get("range", 0.0)), "bowDraw": float(W.get("draw", 1.0))}
	WFX.fx_call("stats", [S, WT, W])   # 武器ツリーで変わるもの（ガード・溜め・回避の距離・連撃）は各武器が決める
	if me != null: me["hp"] = minf(float(me["hp"]), float(S["mhp"]))
	if api != null: api.st = S   # afterStats の効果が新しい S を読めるように（元は module の S を読む）
	WFX.fx_call("afterStats")
	return S


## data.js xpToNext
static func xp_to_next(lv: int) -> int:
	return int(data()["levels"][lv - 1]["xp"])
