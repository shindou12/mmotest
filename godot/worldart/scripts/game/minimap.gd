extends Control
## ミニマップ（G7-3）。形・色・記号の大きさは public/js/ui/panels/minimap.js の areaShapes と
## public/js/ui/helpers.js の CanvasView.draw、枠は public/style.css L78・L466（#nav #minimap: 164px・枠 3px rgba(236,226,196,.75)）を写す。
## 図形は 180×180 のキャンバスの座標で作り、_draw で内側の円（158px）に縮めて、円で切り抜く。


const CELL := 4.0            # public/shared/areas.js L14
const CANVAS := 180.0        # index.html #minimap width/height
const BORDER := 3.0          # style.css L466
const CENTER := Vector2(90.0, 90.0)

var shapes: Array = []
var explored := {}           # エリア id → PackedByteArray（屋内の自動マッピング。progress.js exploredOf / exploreTick。保存は TODO）
var clip_poly := PackedVector2Array()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(164.0, 164.0)
	size = custom_minimum_size
	for i in range(72):
		var a := TAU * float(i) / 72.0
		clip_poly.append(CENTER + Vector2(cos(a), sin(a)) * 90.0)


# ---------------------------------------------------------------- 図形の組み立て（minimap.js areaShapes）
func tick_explore(game) -> void:
	var def: Dictionary = game.area
	if String(def.get("shape", "")) != "grid":
		return
	var w := int(def["W"]); var h := int(def["H"])
	var id := String(def["id"])
	if not explored.has(id):
		var arr := PackedByteArray(); arr.resize(w * h); arr.fill(0)
		explored[id] = arr
	var arr2: PackedByteArray = explored[id]
	var c := int(floor(float(game.me.x) / CELL + float(w) / 2.0))
	var r := int(floor(float(game.me.z) / CELL + float(h) / 2.0))
	var radius := 2   # t_mapper 称号は 4（称号は未移植）
	for dr in range(-radius, radius + 1):
		for dc in range(-radius, radius + 1):
			var cc := c + dc; var rr := r + dr
			if cc < 0 or rr < 0 or cc >= w or rr >= h: continue
			arr2[rr * w + cc] = 1
	explored[id] = arr2


func build_shapes(game) -> void:
	shapes = _make_shapes(game, Vector2(CANVAS, CANVAS), false, {}).get("shapes", [])
	queue_redraw()


func build_area_shapes(game, viewport: Vector2, map_meta: Dictionary) -> Dictionary:
	return _make_shapes(game, viewport, true, map_meta)


func _make_shapes(game, viewport: Vector2, full: bool, map_meta: Dictionary) -> Dictionary:
	# 元は public/js/ui/panels/minimap.js の areaShapes。ミニマップと同じ形・座標変換を使う。
	var me: Dictionary = game.me
	var def: Dictionary = game.area
	if def.is_empty(): return {"shapes": [], "tf": {}}
	var indoor := String(def.get("shape", "")) == "grid"
	var meta: Dictionary = map_meta.get(String(def.get("id", "")), {})
	var gw := int(def.get("W", 0)); var gh := int(def.get("H", 0))
	var seen: PackedByteArray = explored.get(String(def["id"]), PackedByteArray())
	var out_r := 0.0
	if not indoor:
		var samples := 64 if full else 32
		for i in range(samples):
			out_r = maxf(out_r, GameRules.bound_r(def, float(i) / float(samples) * TAU))
		out_r += 4.0
	var cx := float(me.x) if indoor and not full else 0.0
	var cz := float(me.z) if indoor and not full else 0.0
	var sc: float
	if full and indoor:
		sc = minf(viewport.x / (float(gw) * CELL + 8.0), viewport.y / (float(gh) * CELL + 8.0))
	elif full:
		var x0 := 1e20; var x1 := -1e20; var z0 := 1e20; var z1 := -1e20
		for i in range(64):
			var a := float(i) / 64.0 * TAU
			var rr := GameRules.bound_r(def, a)
			var px := sin(a) * rr; var pz := -cos(a) * rr
			x0 = minf(x0, px); x1 = maxf(x1, px); z0 = minf(z0, pz); z1 = maxf(z1, pz)
		cx = (x0 + x1) * 0.5; cz = (z0 + z1) * 0.5
		sc = minf(viewport.x / (x1 - x0 + 16.0), viewport.y / (z1 - z0 + 16.0))
	else:
		sc = 90.0 / (30.0 if indoor else out_r)
	var center := viewport * 0.5 if full else CENTER
	var k := 1.5 if full else 1.0
	var sh: Array = [{"t": "bg", "fill": Color.html("#0c0e16dd" if indoor else "#0a0c14aa")}]

	var known := func(x: float, z: float) -> bool:
		if not indoor: return true
		var c := int(floor(x / CELL + float(gw) / 2.0)); var r := int(floor(z / CELL + float(gh) / 2.0))
		return c >= 0 and r >= 0 and c < gw and r < gh and seen.size() == gw * gh and seen[r * gw + c] != 0
	var p := func(x: float, z: float) -> Vector2:
		return center + Vector2((x - cx) * sc, (z - cz) * sc)

	if indoor:
		var rows: Array = def["rows"]
		for r in range(gh):
			for c in range(gw):
				var ch := String(rows[r])[c]
				if ch == "#" or seen.size() != gw * gh or seen[r * gw + c] == 0: continue
				var pt: Vector2 = p.call((float(c) - float(gw) / 2.0) * CELL, (float(r) - float(gh) / 2.0) * CELL)
				if not full and pt.distance_to(CENTER) > 90.0 + CELL * sc * 1.5: continue
				var col := "#4a5064"
				if ch == "D": col = "#6a8a6a" if game.door_open else "#c04a4a"
				elif ch == "T" or ch == "t": col = "#6a4a3a"
				sh.append({"t": "rect", "x": pt.x, "y": pt.y, "w": CELL * sc + 0.5, "h": CELL * sc + 0.5, "fill": Color.html(col)})
		for pair in [["L", "#ff9a4a"], ["P", "#6ad0ff"]]:
			for q in def.get("pts", {}).get(pair[0], []):
				if not known.call(float(q.x), float(q.z)): continue
				var pt2: Vector2 = p.call(float(q.x), float(q.z))
				sh.append({"t": "rect", "x": pt2.x - 3.0 * k, "y": pt2.y - 3.0 * k, "w": 6.0 * k, "h": 6.0 * k, "fill": Color.html(pair[1])})
				if full: sh.append({"t": "text", "x": pt2.x, "y": pt2.y - 12.0, "text": "レバー" if pair[0] == "L" else "感圧板", "fill": Color.html(pair[1]), "size": 12})
	else:
		var pts := PackedVector2Array()
		for i in range(64):
			var a := float(i) / 64.0 * TAU
			var rr := GameRules.bound_r(def, a)
			pts.append(p.call(sin(a) * rr, -cos(a) * rr))
		var floors: Array = GameRules.data()["floors"]
		var ground := String(floors[clampi(int(def.get("floor", 1)) - 1, 0, floors.size() - 1)]["ground"])
		sh.append({"t": "poly", "pts": pts, "close": true, "fill": Color.html(ground + "aa"), "stroke": Color(1, 1, 1, 0.35), "lw": 2.0})
		var town: Dictionary = meta.get("town", {})
		if full and not town.is_empty():
			for street in town.get("streets", []):
				var road := PackedVector2Array()
				for q in street.get("pts", []): road.append(p.call(float(q[0]), float(q[1])))
				sh.append({"t": "poly", "pts": road, "close": false, "stroke": Color.html("#d8ccb0aa"), "lw": maxf(2.0, float(street.get("w", 0.0)) * sc)})
			var square: Dictionary = town.get("square", {})
			if not square.is_empty():
				var plaza := PackedVector2Array([p.call(float(square.x0), float(square.z0)), p.call(float(square.x1), float(square.z0)), p.call(float(square.x1), float(square.z1)), p.call(float(square.x0), float(square.z1))])
				sh.append({"t": "poly", "pts": plaza, "close": true, "fill": Color.html("#d8ccb0aa")})
		for o in def.get("obstacles", []):
			if o.has("box"):
				var b: Dictionary = o["box"]
				var c2 := cos(float(b.ry)); var s2 := sin(float(b.ry))
				var bp := PackedVector2Array()
				for uw in [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]]:
					bp.append(p.call(float(b.x) + uw[0] * float(b.w) / 2.0 * c2 + uw[1] * float(b.d) / 2.0 * s2, float(b.z) - uw[0] * float(b.w) / 2.0 * s2 + uw[1] * float(b.d) / 2.0 * c2))
				sh.append({"t": "poly", "pts": bp, "close": true, "fill": Color.html("#8a5a48dd")})
				continue
			var po: Vector2 = p.call(float(o.x), float(o.z))
			sh.append({"t": "circle", "x": po.x, "y": po.y, "r": maxf(1.5, float(o.r) * sc), "fill": Color.html("#3a8ad0cc" if String(o.kind) == "pond" else "#20242ecc")})
		for h in def.get("hazards", []):
			var ph: Vector2 = p.call(float(h.x), float(h.z))
			sh.append({"t": "circle", "x": ph.x, "y": ph.y, "r": maxf(1.5, float(h.r) * sc), "fill": Color.html("#8a3ab0aa" if String(h.kind) == "poison" else "#e0c890aa")})

	var chests_state: Dictionary = game.ch.get("chests", {})
	for cdef in def.get("chests", []):
		if not known.call(float(cdef.x), float(cdef.z)): continue
		var pc: Vector2 = p.call(float(cdef.x), float(cdef.z))
		var cd_ms := (300 if bool(cdef.get("big", false)) else 600) * 1000
		var is_open := Time.get_unix_time_from_system() * 1000.0 - float(chests_state.get(String(cdef.id), 0)) < float(cd_ms)   # progress.js chestOpen
		sh.append({"t": "rect", "x": pc.x - 3.0, "y": pc.y - 3.0, "w": 6.0, "h": 6.0, "fill": Color.html("#6a6a6a" if is_open else "#ffd27a")})

	var box: Variant = def.get("box", meta.get("boxData"))
	if box is Dictionary:
		var pb: Vector2 = p.call(float(box.x), float(box.z))
		sh.append({"t": "rect", "x": pb.x - 3.5 * k, "y": pb.y - 3.5 * k, "w": 7.0 * k, "h": 7.0 * k, "fill": Color.html("#7ae0ff")})
		if full: sh.append({"t": "text", "x": pb.x, "y": pb.y - 12.0, "text": "共有ボックス", "fill": Color.html("#7ae0ff"), "size": 12})
	var gate: Variant = def.get("gate", meta.get("gateData"))
	if gate is Dictionary and known.call(float(gate.x), float(gate.z)):
		var pg: Vector2 = p.call(float(gate.x), float(gate.z))
		sh.append({"t": "circle", "x": pg.x, "y": pg.y, "r": 5.0 * k, "fill": Color.html("#6ad0ff")})
		if full: sh.append({"t": "text", "x": pg.x, "y": pg.y - 14.0, "text": "転移門", "fill": Color.html("#6ad0ff"), "size": 12})
	var wp = def.get("waypoint")
	if wp is Dictionary and known.call(float(wp.x), float(wp.z)):
		var on: bool = bool(meta.get("gate", false)) or bool(game.ch.get("waypoints", {}).get(String(def["id"]), false))   # area.js waypointOk
		var pw: Vector2 = p.call(float(wp.x), float(wp.z))
		var rw := 5.0 * k
		sh.append({"t": "poly", "pts": PackedVector2Array([Vector2(pw.x, pw.y - rw), Vector2(pw.x + rw * 0.7, pw.y), Vector2(pw.x, pw.y + rw), Vector2(pw.x - rw * 0.7, pw.y)]), "close": true, "fill": Color.html("#6ad8ff" if on else "#4a5464"), "stroke": Color.html("#e8f6ff"), "lw": 1.0})
		if full: sh.append({"t": "text", "x": pw.x, "y": pw.y - 14.0, "text": "ワープポイント" if on else "ワープポイント（未解放）", "fill": Color.html("#9ae8ff" if on else "#8a96a8"), "size": 12})

	for e in def.get("exits", []):
		if not known.call(float(e.x), float(e.z)): continue
		var pe: Vector2 = p.call(float(e.x), float(e.z))
		sh.append({"t": "poly", "pts": PackedVector2Array([Vector2(pe.x, pe.y - 5.0 * k), Vector2(pe.x + 5.0 * k, pe.y + 4.0 * k), Vector2(pe.x - 5.0 * k, pe.y + 4.0 * k)]), "close": true, "fill": Color.html("#bfe6ff")})
		if full: sh.append({"t": "text", "x": pe.x, "y": pe.y - 12.0, "text": "→ %s" % String(GameRules.data()["areas"][String(e.to)].get("name", "")), "fill": Color.html("#bfe6ff"), "size": 12})
	for n in meta.get("npcs", []):
		if not known.call(float(n.x), float(n.z)): continue
		var pn: Vector2 = p.call(float(n.x), float(n.z))
		sh.append({"t": "circle", "x": pn.x, "y": pn.y, "r": 3.5 * k, "fill": Color.html("#e0e0e0")})
		if full: sh.append({"t": "text", "x": pn.x, "y": pn.y - 10.0, "text": String(n.name), "fill": Color.html("#e0e0e0"), "size": 12})

	if game.items != null:
		var rar: Array = GameRules.data().get("rarities", [])
		for d in game.items.drops:
			var pd: Vector2 = p.call(float(d.x), float(d.z))
			var rc := "#ffffff"
			var ri := int(d.it.get("rarity", 0))
			if ri >= 0 and ri < rar.size(): rc = String(rar[ri].get("color", rc))
			sh.append({"t": "rect", "x": pd.x - 2.0, "y": pd.y - 2.0, "w": 4.0, "h": 4.0, "fill": Color.html(rc)})

	for mb in game.mobs.values():
		if not known.call(float(mb.x), float(mb.z)): continue
		var pm: Vector2 = p.call(float(mb.x), float(mb.z))
		var kind := int(mb.get("kind", 0)); var elite := int(mb.get("elite", 0))
		var rad := 6.0 if kind == 2 else (5.0 if elite == 3 else (3.0 if elite > 0 else 2.0))
		var col2 := "#ff2a2a" if kind == 2 else ("#ff6ad0" if elite == 3 else ("#ffb030" if elite > 0 else "#ff7a6a"))
		sh.append({"t": "circle", "x": pm.x, "y": pm.y, "r": rad, "fill": Color.html(col2)})
	for o in game.others.values():
		var po2: Vector2 = p.call(float(o.x), float(o.z))
		sh.append({"t": "circle", "x": po2.x, "y": po2.y, "r": 3.5 * k, "fill": Color.html("#77ff77")})
		if full and String(o.get("name", "")) != "": sh.append({"t": "text", "x": po2.x, "y": po2.y - 10.0, "text": String(o.name), "fill": Color.html("#77ff77"), "size": 12})

	var pin_value: Variant = game.ch.get("pin", null)
	if pin_value is Dictionary:
		var pin: Dictionary = pin_value
		if pin.get("area", "") == String(def.get("id", "")) and known.call(float(pin.get("x", 0.0)), float(pin.get("z", 0.0))):
			var pp: Vector2 = p.call(float(pin.x), float(pin.z))
			if not full:
				var delta := pp - center; var distance := delta.length(); var max_radius := viewport.x * 0.5 - 9.0
				if distance > max_radius: pp = center + delta / distance * max_radius
			sh.append({"t": "circle", "x": pp.x, "y": pp.y - 6.0 * k, "r": 5.0 * k, "fill": Color.html("#ffd84a"), "stroke": Color.BLACK, "lw": 1.5})
			sh.append({"t": "poly", "pts": PackedVector2Array([Vector2(pp.x - 3.0 * k, pp.y - 4.0 * k), Vector2(pp.x + 3.0 * k, pp.y - 4.0 * k), Vector2(pp.x, pp.y + 2.0 * k)]), "close": true, "fill": Color.html("#ffd84a")})
			if full: sh.append({"t": "text", "x": pp.x, "y": pp.y - 20.0, "text": "📍 %dm" % roundi(Vector2(float(pin.x) - float(me.x), float(pin.z) - float(me.z)).length()), "fill": Color.html("#ffd84a"), "size": 12})

	var pme: Vector2 = p.call(float(me.x), float(me.z))
	if full: sh.append({"t": "circle", "x": pme.x, "y": pme.y, "r": 11.0, "stroke": Color(1.0, 1.0, 1.0, 0.53), "lw": 2.0})
	sh.append({"t": "arrow", "x": pme.x, "y": pme.y, "a": -float(me.a) + PI, "fill": Color.WHITE})
	return {"shapes": sh, "tf": {"cx": cx, "cz": cz, "sc": sc}}


# ---------------------------------------------------------------- 描画（helpers.js CanvasView.draw）
func _inside(pts: PackedVector2Array) -> bool:
	for q in pts:
		if q.distance_to(CENTER) > 90.0: return false
	return true


func _fill_poly(pts: PackedVector2Array, color: Color) -> void:
	if pts.size() < 3: return
	if _inside(pts):
		draw_colored_polygon(pts, color)
		return
	for part in Geometry2D.intersect_polygons(pts, clip_poly):
		if part.size() >= 3 and not Geometry2D.is_polygon_clockwise(part):
			draw_colored_polygon(part, color)


func _stroke_poly(pts: PackedVector2Array, close: bool, color: Color, lw: float) -> void:
	var line := pts.duplicate()
	if close and pts.size() > 0: line.append(pts[0])
	if line.size() < 2: return
	if _inside(line):
		draw_polyline(line, color, lw, true)
		return
	for part in Geometry2D.clip_polyline_with_polygon(line, clip_poly):
		if part.size() >= 2: draw_polyline(part, color, lw, true)


func _circle_pts(x: float, y: float, r: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(24):
		var a := TAU * float(i) / 24.0
		pts.append(Vector2(x + cos(a) * r, y + sin(a) * r))
	return pts


func _draw() -> void:
	var k := (size.x - 2.0 * BORDER) / CANVAS
	var mid := size * 0.5
	var outer := size.x * 0.5
	# 外の影: box-shadow 0 0 0 2px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.4)（style.css L466）
	for i in range(7):
		var rr := outer + 2.0 + float(i) * 2.0
		draw_arc(mid + Vector2(0.0, 4.0), rr, 0.0, TAU, 72, Color(0.0, 0.0, 0.0, 0.4 * (1.0 - float(i) / 7.0) * 0.35), 2.0, true)
	draw_arc(mid, outer + 1.0, 0.0, TAU, 72, Color(0.0, 0.0, 0.0, 0.35), 2.0, true)
	draw_circle(mid, outer, Color(10.0 / 255.0, 14.0 / 255.0, 24.0 / 255.0, 0.5))
	draw_set_transform(mid - CENTER * k, 0.0, Vector2(k, k))
	for s in shapes:
		match String(s.t):
			"bg":
				draw_circle(CENTER, 90.0, s.fill)
			"rect":
				var rp := PackedVector2Array([Vector2(s.x, s.y), Vector2(s.x + s.w, s.y), Vector2(s.x + s.w, s.y + s.h), Vector2(s.x, s.y + s.h)])
				if _inside(rp): draw_rect(Rect2(s.x, s.y, s.w, s.h), s.fill)
				else: _fill_poly(rp, s.fill)
			"circle":
				var circle_center := Vector2(s.x, s.y)
				if circle_center.distance_to(CENTER) + float(s.r) <= 90.0:
					if s.has("fill"): draw_circle(circle_center, s.r, s.fill)
					if s.has("stroke"): draw_arc(circle_center, s.r, 0.0, TAU, 48, s.stroke, float(s.get("lw", 1.0)), true)
				elif circle_center.distance_to(CENTER) - float(s.r) < 90.0:
					if s.has("fill"): _fill_poly(_circle_pts(s.x, s.y, s.r), s.fill)
			"poly":
				if s.has("fill"): _fill_poly(s.pts, s.fill)
				if s.has("stroke"): _stroke_poly(s.pts, bool(s.get("close", false)), s.stroke, float(s.get("lw", 1.0)))
			"arrow":
				var ang := float(s.a)
				var tri := PackedVector2Array()
				for v in [Vector2(0.0, -6.0), Vector2(4.0, 5.0), Vector2(-4.0, 5.0)]:
					tri.append(Vector2(s.x, s.y) + Vector2(v.x * cos(ang) - v.y * sin(ang), v.x * sin(ang) + v.y * cos(ang)))
				draw_colored_polygon(tri, s.fill)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	draw_arc(mid, outer - BORDER * 0.5, 0.0, TAU, 96, Color(236.0 / 255.0, 226.0 / 255.0, 196.0 / 255.0, 0.75), BORDER, true)
