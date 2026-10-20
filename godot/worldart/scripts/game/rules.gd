class_name GameRules
extends RefCounted
## ゲームの共通の式を GDScript に移したもの（L27）。元は public/shared/areas.js・data.js と public/js/game/*.js。
## 数値の表は data/game.json（tools/worldart/godot/export_gamedata.mjs が public/shared/ から書く）。
## 元の式を変えたら、ここも同じに直す（どの関数が元のどれかは各関数の説明に書いてある）。

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


## areas.js boundR（輪郭を 1° ごとに書き出した表を補間）。a は北 0・東 +（angOf = atan2(x, -z)）
static func bound_r(ar: Dictionary, a: float) -> float:
	var ol: Array = ar["outline"]
	var deg := fposmod(rad_to_deg(a), 360.0)
	var i := int(floor(deg)) % 360
	var j := (i + 1) % 360
	var ri := Vector2(ol[i][0], ol[i][1]).length()
	var rj := Vector2(ol[j][0], ol[j][1]).length()
	return lerp(ri, rj, deg - floor(deg))


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
	return Vector2(float(b["x"]) + px * c + pz * s, float(b["z"]) - px * s + pz * c)


## areas.js solidAt（屋内のマス目: 壁と閉じた扉）
static func solid_at(ar: Dictionary, c: int, r: int, door_open: bool) -> bool:
	if r < 0 or c < 0 or r >= int(ar["H"]) or c >= int(ar["W"]): return true
	var ch := String(ar["rows"][r])[c]
	return ch == "#" or (ch == "D" and not door_open)


## areas.js collide（屋外: 輪郭と当たり判定のある物。屋内: マス目の壁と扉）
static func collide(ar: Dictionary, x: float, z: float, rad := 0.5, door_open := false) -> Vector2:
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
		return Vector2(x, z)
	var passes := 2 if String(ar.get("layout", "")) != "" else 1
	for _p in passes:
		for o in ar["obstacles"]:
			if not o["solid"]: continue
			if o.has("box"):
				if Vector2(x - o["x"], z - o["z"]).length() > float(o["r"]) + rad: continue
				var q = push_out_box(o["box"], x, z, rad)
				if q != null: x = q.x; z = q.y
				continue
			var dx := x - float(o["x"]); var dz := z - float(o["z"]); var d := sqrt(dx * dx + dz * dz); var mn := float(o["r"]) + rad
			if d < mn:
				var k := mn / d if d > 1e-4 else 1.0
				x = float(o["x"]) + (dx if d > 1e-4 else mn) * k
				z = float(o["z"]) + (dz if d > 1e-4 else 0.0) * k
	var a := ang_of(x, z); var mx := bound_r(ar, a) - 1.0; var dd := sqrt(x * x + z * z)
	if dd > mx: return Vector2(x * mx / dd, z * mx / dd)
	return Vector2(x, z)


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


## stats.js calcStats のうち、試作で使う部分: 装備（武器・防具・装飾）の基礎値と強化、付加効果（affixes）、防具の基本効果、重さ。
## まだ入れていないもの: スキルツリー・武器ツリー・称号・スキル変化（sv）・固有効果（fx）
static func enh_mult(it) -> float:
	return 1.0 + float(it.get("enh", 0)) * 0.08 if it is Dictionary else 1.0


static func item_weight(it) -> float:
	if not it is Dictionary: return 0.0
	if it.has("weight"): return float(it["weight"])
	if it["slot"] == "weapon": return float(data()["weapons"].get(it.get("kind", "sword"), {}).get("weight", 4))
	if it["slot"] == "armor": return float(data()["armorClasses"][it.get("armor", "medium")]["weight"])
	return 0.5


static func calc_stats(ch: Dictionary) -> Dictionary:
	var D := data()
	var eq: Dictionary = ch.get("eq", {})
	var items := []
	for k in ["weapon", "armor", "acc"]:
		if eq.get(k) is Dictionary: items.append(eq[k])
	var aff := {}
	for it in items:
		for a in it.get("affixes", []):
			var key := String(a[0])
			if not D["affixes"].has(key): continue   # スキル変化（sv_*）はまだ
			aff[key] = float(aff.get(key, 0.0)) + float(D["affixes"][key]["tiers"][int(a[1]) - 1])
	var arm = eq.get("armor")
	if arm is Dictionary and arm.get("base") is Array:
		aff[String(arm["base"][0])] = float(aff.get(String(arm["base"][0]), 0.0)) + float(arm["base"][1])
	var m := func(k: String) -> float: return float(aff.get(k, 0.0))
	var base := func(it, k: String) -> float: return float(it.get(k, 0.0)) * enh_mult(it) if it is Dictionary else 0.0
	var w = eq.get("weapon")
	var acc = eq.get("acc")
	var wk: String = w["kind"] if w is Dictionary else String(D["defaultWeapon"])
	var W: Dictionary = D["weapons"][wk]
	var lv := int(ch["lv"])
	var L: Dictionary = D["levels"][lv - 1]
	var atk: float = (float(L["atk"]) + base.call(w, "atk") + base.call(acc, "atk")) * (1 + m.call("atkp") / 100.0)
	var mhp: float = roundf((float(L["hp"]) + base.call(arm, "hp") + base.call(acc, "hp")) * (1 + m.call("hpp") / 100.0))
	var weight := 0.0
	for it in items: weight += item_weight(it)
	var wc: Dictionary = D["weightClasses"][-1]
	for c in D["weightClasses"]:
		if weight <= float(c["max"]): wc = c; break
	var def := minf(65.0, m.call("def") + base.call(arm, "def") + (float(D["instinct"]["dr"]) if W.get("melee", false) else 0.0) + float(L["wdef"][wk]))
	return {"wk": wk, "W": W, "atk": atk, "mhp": mhp, "def": def, "crit": 5.0 + m.call("crit"), "critd": 150.0 + m.call("critd"),
		"aspd": m.call("aspd"), "move": m.call("move"), "vamp": m.call("vamp"), "cdr": minf(60.0, m.call("cdr")),
		"normp": m.call("normp"), "heavyp": m.call("heavyp"), "wskillp": m.call("wskillp"),
		"maxPot": 3 + int(m.call("potion")), "dodgeCd": 0.75 * float(wc["cd"]) * (1 - minf(60.0, m.call("dodgecd")) / 100.0), "roll": float(wc["roll"]),
		"wr": int(w["rarity"]) if w is Dictionary else 0, "weight": weight, "wc": wc, "skill": String(w.get("skill", "retreat")) if w is Dictionary else "retreat"}


## data.js xpToNext
static func xp_to_next(lv: int) -> int:
	return int(data()["levels"][lv - 1]["xp"])
