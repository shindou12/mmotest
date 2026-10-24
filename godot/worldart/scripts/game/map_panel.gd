class_name GameMapPanel
extends Control
## ブラウザ版 #map の構成。位置・色・文字は public/index.html、public/style.css、public/js/ui/panels/map.js と minimap.js を参照。

signal warp_requested(area_id: String)
signal pin_requested(world_pos: Vector2)

const MapRules = preload("res://scripts/game/rules.gd")
const AREA_CANVAS_SIZE := Vector2(734.0, 419.0) # #map-area の 736×420 を padding 内へ縮小
const FLOOR_VIEWBOX := Vector2(680.0, 420.0) # #map-svg viewBox="-40 -10 680 420"

# MAP_META は public/shared/areas.js から export-map-meta.mjs が生成する。
# GENERATED_MAP_META_START
const AREA_TYPES: Dictionary = {"town":{"name":"町","icon":"⌂","color":"#ffd27a"},"camp":{"name":"野営地","icon":"⛺","color":"#ffd27a"},"field":{"name":"フィールド","icon":"✿","color":"#8fe08a"},"hunt":{"name":"狩場","icon":"⚔","color":"#ff9a6a"},"secret":{"name":"秘境","icon":"✧","color":"#7fffd4"},"dungeon":{"name":"ダンジョン","icon":"◈","color":"#b98aff"},"labyrinth":{"name":"迷宮区","icon":"♜","color":"#ff6a8a"}}
const WEATHERS: Dictionary = {"rain":{"name":"雨","icon":"🌧"},"fog":{"name":"霧","icon":"🌫"},"sandstorm":{"name":"砂嵐","icon":"🌪"}}
const HAZARDS: Dictionary = {"poison":{"name":"毒沼"},"sand":{"name":"流砂"}}
const MAP_META: Dictionary = {"f1_town":{"mapPos":[50,82],"type":"town","gate":true,"gateData":{"x":0,"z":0},"weather":"","hazard":"","unique":"","named":"","box":true,"boxData":{"x":-10,"z":9},"npcCount":4,"npcs":[{"x":-9,"z":-6,"name":"衛兵隊長 ガレス"},{"x":10,"z":-4,"name":"狩人 ミラ"},{"x":6,"z":10,"name":"賢者 オルド"},{"x":12,"z":6,"name":"鍛冶屋 グラム"}],"kinds":[],"bias":[],"town":{"square":{"x0":-17,"x1":17,"z0":-13,"z1":14,"r":4},"streets":[{"pts":[[0,-11.700000000000001],[-2.5,-25.500000000000007],[0,-43.000000000000014]],"w":5.2,"to":"f1_field"},{"pts":[[-15.3,4.099622644196175],[-31.103814325808177,10.922432381153088],[-51.331353008574304,13.754194585044356]],"w":5.2,"to":"f1_lake"},{"pts":[[15.3,0],[30.3,1.5],[45.3,0]],"w":4.4,"end":true,"dir":[1,0]},{"pts":[[0,12.6],[-1.5,24.6],[0,36.6]],"w":4.4,"end":true,"dir":[0,1]},{"pts":[[0,-26.88000000000001],[8.731301454933096,-26.87218274596193],[19.22633144973932,-26.46277500440753],[29.728679930075497,-21.599150270659287],[32.198178691105966,-10.461822439566989],[32.25600000000001,-1.9751103576648516e-15],[32.19817869110596,10.461822439566983],[29.728679930075497,21.599150270659283],[19.226331449739323,26.462775004407526],[8.7313014549331,26.87218274596193],[3.2918505961080864e-15,26.88000000000001],[-8.731301454933105,26.87218274596193],[-19.226331449739316,26.46277500440753],[-29.72867993007549,21.59915027065929],[-32.198178691105966,10.461822439566992],[-32.25600000000001,5.925331072994555e-15],[-32.19817869110596,-10.46182243956698],[-29.7286799300755,-21.599150270659276],[-19.226331449739327,-26.462775004407526],[-8.731301454933103,-26.87218274596193],[-6.583701192216173e-15,-26.88000000000001]],"w":3.8,"ring":true}]}},"f1_field":{"mapPos":[50,52],"type":"field","gate":false,"gateData":null,"weather":"","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["sword","bow"],"bias":["atkp","hpp","sv_holy"],"town":{}},"f1_hunt":{"mapPos":[84,34],"type":"hunt","gate":false,"gateData":null,"weather":"rain","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["axe","greatsword"],"bias":["aspd","move","sv_heavy"],"town":{}},"f1_lake":{"mapPos":[14,86],"type":"secret","gate":false,"gateData":null,"weather":"rain","hazard":"","unique":"","named":"ヌシ・ギガスライム","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["dagger"],"bias":["vamp","sv_drain"],"town":{}},"f1_dun":{"mapPos":[14,46],"type":"dungeon","gate":false,"gateData":null,"weather":"","hazard":"","unique":"古井戸の守り刀","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["dagger","sword"],"bias":["crit","critd"],"town":{}},"f1_lab":{"mapPos":[50,14],"type":"labyrinth","gate":false,"gateData":null,"weather":"","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["spear","greatsword"],"bias":["def","sv_quake"],"town":{}},"f2_camp":{"mapPos":[50,90],"type":"camp","gate":true,"gateData":{"x":0,"z":2},"weather":"","hazard":"","unique":"","named":"","box":true,"boxData":{"x":-8,"z":6},"npcCount":2,"npcs":[{"x":7,"z":-5,"name":"森番 セイル"},{"x":-7,"z":-5,"name":"旅の鍛冶屋 ボルグ"}],"kinds":[],"bias":[],"town":{}},"f2_field":{"mapPos":[50,64],"type":"field","gate":false,"gateData":null,"weather":"fog","hazard":"poison","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["bow","spear"],"bias":["cdr","hpp","sv_frost"],"town":{}},"f2_dun":{"mapPos":[16,64],"type":"dungeon","gate":false,"gateData":null,"weather":"","hazard":"","unique":"樹霊の外套","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["bow"],"bias":["def","sv_blink"],"town":{}},"f2_hunt":{"mapPos":[50,36],"type":"hunt","gate":false,"gateData":null,"weather":"fog","hazard":"poison","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["dagger","axe"],"bias":["aspd","crit","sv_rapid"],"town":{}},"f2_lab":{"mapPos":[50,10],"type":"labyrinth","gate":false,"gateData":null,"weather":"","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["sword","greatsword"],"bias":["critd","sv_twin"],"town":{}},"f3_camp":{"mapPos":[50,52],"type":"camp","gate":true,"gateData":{"x":0,"z":6},"weather":"","hazard":"","unique":"","named":"","box":true,"boxData":{"x":-9,"z":10},"npcCount":2,"npcs":[{"x":-7,"z":2,"name":"行商人 ハサン"},{"x":10,"z":11,"name":"砂漠の鍛冶屋 ナディア"}],"kinds":[],"bias":[],"town":{}},"f3_field":{"mapPos":[50,22],"type":"field","gate":false,"gateData":null,"weather":"","hazard":"sand","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["axe","spear"],"bias":["atkp","def"],"town":{}},"f3_dun":{"mapPos":[22,6],"type":"dungeon","gate":false,"gateData":null,"weather":"","hazard":"","unique":"砂王の盾槍","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["spear"],"bias":["cdr","sv_storm"],"town":{}},"f3_hunt":{"mapPos":[86,52],"type":"hunt","gate":false,"gateData":null,"weather":"sandstorm","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["dagger","bow"],"bias":["move","critd","sv_gale"],"town":{}},"f3_canyon":{"mapPos":[16,52],"type":"secret","gate":false,"gateData":null,"weather":"sandstorm","hazard":"sand","unique":"","named":"砂鮫ギルガ","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["greatsword","axe"],"bias":["crit","sv_giant"],"town":{}},"f3_lab":{"mapPos":[16,20],"type":"labyrinth","gate":false,"gateData":null,"weather":"","hazard":"","unique":"","named":"","box":false,"boxData":null,"npcCount":0,"npcs":[],"kinds":["sword","axe"],"bias":["atkp","sv_blaze"],"town":{}}}
const CLEAR_KILLS := 15
# GENERATED_MAP_META_END


class AreaCanvas extends Control:
	signal pin_requested(world_pos: Vector2)
	var shapes: Array = []
	var tf: Dictionary = {}
	var base := StyleBoxFlat.new()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_CROSS
		clip_contents = true
		base.bg_color = Color.html("#06080e")
		base.set_corner_radius_all(8)

	func set_map(result: Dictionary) -> void:
		shapes = result.get("shapes", [])
		tf = result.get("tf", {})
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			if float(tf.get("sc", 0.0)) > 0.0:
				var center := size * 0.5
				var x: float = (event.position.x - center.x) / float(tf.sc) + float(tf.cx)
				var z: float = (event.position.y - center.y) / float(tf.sc) + float(tf.cz)
				pin_requested.emit(Vector2(x, z))
			accept_event()

	func _draw() -> void:
		draw_style_box(base, Rect2(Vector2.ZERO, size))
		for s in shapes:
			match String(s.get("t", "")):
				"bg": draw_rect(Rect2(Vector2.ZERO, size), s.fill)
				"rect": draw_rect(Rect2(float(s.x), float(s.y), float(s.w), float(s.h)), s.fill)
				"circle":
					var c := Vector2(float(s.x), float(s.y))
					if s.has("fill"): draw_circle(c, float(s.r), s.fill)
					if s.has("stroke"): draw_arc(c, float(s.r), 0.0, TAU, 48, s.stroke, float(s.get("lw", 1.0)), true)
				"poly":
					if s.has("fill") and s.pts.size() >= 3: draw_colored_polygon(s.pts, s.fill)
					if s.has("stroke"):
						var line: PackedVector2Array = s.pts.duplicate()
						if bool(s.get("close", false)) and line.size() > 0: line.append(line[0])
						if line.size() >= 2: draw_polyline(line, s.stroke, float(s.get("lw", 1.0)), true)
				"arrow":
					var a := float(s.a)
					var tri := PackedVector2Array()
					for v in [Vector2(0.0, -6.0), Vector2(4.0, 5.0), Vector2(-4.0, 5.0)]:
						tri.append(Vector2(s.x, s.y) + Vector2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)))
					draw_colored_polygon(tri, s.fill)
				"text":
					_draw_text(Vector2(float(s.x), float(s.y)), String(s.get("text", "")), int(s.get("size", 12)), s.get("fill", Color.WHITE), false)

	func _draw_text(pos: Vector2, value: String, font_size: int, color: Color, outline: bool) -> void:
		var font := get_theme_default_font()
		if outline: draw_string_outline(font, pos, value, HORIZONTAL_ALIGNMENT_CENTER, -1.0, font_size, 3, Color.BLACK)
		draw_string(font, pos, value, HORIZONTAL_ALIGNMENT_CENTER, -1.0, font_size, color)


class FloorCanvas extends Control:
	signal warp_requested(area_id: String)
	var owner_panel: GameMapPanel
	var game
	var floor_number := 1
	var hover_area := ""
	var font: Font
	var warp_points: Dictionary = {}
	var radius := 30.0
	var scale_factor := 1.0
	var bg := GradientTexture2D.new()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_ARROW
		clip_contents = true
		font = ThemeDB.fallback_font
		var gradient := Gradient.new()
		gradient.colors = PackedColorArray([Color(60.0 / 255.0, 90.0 / 255.0, 140.0 / 255.0, 0.25), Color(0.0, 0.0, 0.0, 0.2)])
		bg.gradient = gradient
		bg.fill = GradientTexture2D.FILL_RADIAL
		bg.fill_from = Vector2(0.5, 0.5)
		bg.fill_to = Vector2(1.0, 0.5)
		bg.width = 704
		bg.height = 435

	func set_floor(value: int) -> void:
		floor_number = value
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			var found := _area_at(event.position)
			if found != hover_area:
				hover_area = found
				mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if not hover_area.is_empty() else Control.CURSOR_ARROW
				queue_redraw()
		elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			var found := _area_at(event.position)
			if not found.is_empty(): warp_requested.emit(found)
			accept_event()

	func _area_at(pos: Vector2) -> String:
		for id in warp_points:
			if pos.distance_to(warp_points[id]) <= radius + 4.0: return String(id)
		return ""

	func _node_position(area_id: String, meta: Dictionary) -> Vector2:
		var mp: Array = meta.get("mapPos", [0, 0])
		return Vector2((float(mp[0]) * 6.0 + 40.0) * scale_factor, (float(mp[1]) * 4.0 + 10.0) * scale_factor)

	func _text(pos: Vector2, value: String, font_size: int, color: Color, alignment: int = HORIZONTAL_ALIGNMENT_CENTER, outline: int = 0) -> void:
		if outline > 0: draw_string_outline(font, pos, value, alignment, -1.0, font_size, outline, Color.BLACK)
		draw_string(font, pos, value, alignment, -1.0, font_size, color)

	func _draw_dashed(a: Vector2, b: Vector2, color: Color) -> void:
		var delta := b - a
		var length := delta.length()
		if length <= 0.0: return
		var direction := delta / length
		var offset := 0.0
		while offset < length:
			var finish := minf(length, offset + 8.0 * scale_factor)
			draw_line(a + direction * offset, a + direction * finish, color, 4.0 * scale_factor, true)
			offset += 14.0 * scale_factor

	func _draw() -> void:
		if game == null or owner_panel == null: return
		var area_data: Dictionary = MapRules.data().get("areas", {})
		var floor_data: Array = MapRules.data().get("floors", [])
		if floor_number < 1 or floor_number > floor_data.size(): return
		scale_factor = minf(size.x / FLOOR_VIEWBOX.x, size.y / FLOOR_VIEWBOX.y)
		if bg.width != int(size.x) or bg.height != int(size.y):
			bg.width = maxi(1, int(size.x)); bg.height = maxi(1, int(size.y))
		draw_texture_rect(bg, Rect2(Vector2.ZERO, size), false)
		var nodes: Array[Dictionary] = []
		var visible_ids := {}
		for id in area_data:
			var ar: Dictionary = area_data[id]
			if int(ar.get("floor", 1)) != floor_number: continue
			var meta: Dictionary = owner_panel.MAP_META.get(String(id), {})
			if meta.is_empty(): continue
			nodes.append({"id": String(id), "area": ar, "meta": meta})
			visible_ids[String(id)] = true
		warp_points.clear()
		var edge_color := Color(190.0 / 255.0, 220.0 / 255.0, 1.0, 0.35)
		var edges := {}
		for node in nodes:
			var ar: Dictionary = node.area
			for exit_data in ar.get("exits", []):
				var to := String(exit_data.get("to", ""))
				if not visible_ids.has(to): continue
				var left := String(node.id); var right := to
				if right < left:
					var temp := left
					left = right
					right = temp
				var key := left + "-" + right
				if edges.has(key): continue
				edges[key] = true
				var other_meta: Dictionary = owner_panel.MAP_META.get(to, {})
				_draw_dashed(_node_position(String(node.id), node.meta), _node_position(to, other_meta), edge_color)
		for node in nodes:
			var id := String(node.id)
			var ar: Dictionary = node.area
			var meta: Dictionary = node.meta
			var type: Dictionary = owner_panel.AREA_TYPES.get(String(meta.get("type", "")), {"name": "", "icon": "", "color": "#8fa0b8"})
			var color := Color.html(String(type.get("color", "#8fa0b8")))
			var pos := _node_position(id, meta)
			var current := id == String(game.area_id)
			var waypoint_ok := bool(meta.get("gate", false)) or bool(game.ch.get("waypoints", {}).get(id, false))
			var warp := waypoint_ok and int(ar.get("floor", 1)) <= int(game.unlocked) and not current and not bool(game.me.get("dead", false)) and not bool(game.me.get("crawl", false))
			if warp: warp_points[id] = pos
			var done := bool(game.ch.get("areas", {}).get(id, {}).get("done", false))
			var hovered := hover_area == id and warp
			var fill := Color(10.0 / 255.0, 16.0 / 255.0, 30.0 / 255.0, 0.85)
			if current: fill = Color(60.0 / 255.0, 110.0 / 255.0, 180.0 / 255.0, 0.6)
			elif hovered: fill = Color(60.0 / 255.0, 140.0 / 255.0, 200.0 / 255.0, 0.55)
			draw_circle(pos, radius, fill)
			draw_arc(pos, radius, 0.0, TAU, 64, color, 5.0 if current or hovered else 3.0, true)
			_text(pos + Vector2(0.0, 8.0 * scale_factor), String(type.get("icon", "")), 26, color)
			_text(pos + Vector2(-30.0 * scale_factor, -22.0 * scale_factor), "⛩" if bool(meta.get("gate", false)) else "◇", 16, Color.html("#6ad8ff" if waypoint_ok else "#4a5464"))
			var weather: Dictionary = owner_panel.WEATHERS.get(String(meta.get("weather", "")), {})
			if not weather.is_empty(): _text(pos + Vector2(30.0 * scale_factor, -22.0 * scale_factor), String(weather.get("icon", "")), 16, Color.WHITE)
			if done: _text(pos + Vector2(28.0 * scale_factor, 26.0 * scale_factor), "✔", 15, Color.html("#4ae09a"))
			var name_color := Color.html("#9ae8ff") if hovered else Color.html("#e8eef8")
			_text(pos + Vector2(0.0, 50.0 * scale_factor), String(ar.get("name", id)), 15, name_color, HORIZONTAL_ALIGNMENT_CENTER, 3)
			var secondary := String(type.get("name", ""))
			var hazard := String(meta.get("hazard", ""))
			if not hazard.is_empty(): secondary += "・" + String(owner_panel.HAZARDS.get(hazard, {}).get("name", hazard))
			_text(pos + Vector2(0.0, 66.0 * scale_factor), secondary, 12, Color.html("#9fb0c8"))
			var extra := ""
			if not String(meta.get("unique", "")).is_empty(): extra = "宝：" + String(meta.unique)
			elif not String(meta.get("named", "")).is_empty(): extra = "ネームド：" + String(meta.named)
			elif String(meta.get("type", "")) == "hunt": extra = "経験値 1.6倍"
			elif String(meta.get("type", "")) == "labyrinth": extra = "ボス：" + String(floor_data[floor_number - 1].get("boss", {}).get("name", ""))
			elif bool(meta.get("box", false)): extra = "共有ボックス・NPC %d人" % int(meta.get("npcCount", 0))
			if not extra.is_empty(): _text(pos + Vector2(0.0, 81.0 * scale_factor), extra, 11, Color.html("#ffd27a"))
			if current: _text(pos + Vector2(38.0 * scale_factor, -6.0 * scale_factor), "◀ 現在地", 13, Color.html("#6ad0ff"), HORIZONTAL_ALIGNMENT_LEFT)


var game
var panel: PanelContainer
var body: VBoxContainer
var map_title: Label
var map_sub: Label
var area_tab: Button
var floor_tab: Button
var area_wrap: VBoxContainer
var floor_wrap: VBoxContainer
var area_canvas: AreaCanvas
var floor_canvas: FloorCanvas
var backdrop: ColorRect
var floor_tabs: HBoxContainer
var floor_info: GridContainer
var selected_tab := "area"
var selected_floor := 1
var last_area_refresh := 0


func build(owner) -> void:
	game = owner
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel = PanelContainer.new()
	panel.name = "MapPanel"
	panel.custom_minimum_size.x = 760.0
	panel.add_theme_stylebox_override("panel", _panel_style(12.0))
	backdrop = game.hud_ui.add_panel_backdrop(self)
	add_child(panel)
	body = VBoxContainer.new()
	body.add_theme_constant_override("separation", 8)
	panel.add_child(body)
	_build_header()
	_build_tabs()
	_build_area()
	_build_floor()
	selected_floor = maxi(1, int(game.area.get("floor", 1)))
	_fit_panel()
	panel.visible = false


func _build_header() -> void:
	var header_margin := MarginContainer.new()
	header_margin.add_theme_constant_override("margin_bottom", 10)
	body.add_child(header_margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	header_margin.add_child(row)
	map_title = _label("エリアマップ", 16, Color.html("#e8eef8"))
	map_title.add_theme_font_size_override("font_size", 16)
	row.add_child(map_title)
	map_sub = _label("", 12, Color.html("#8fa0b8"))
	map_sub.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	row.add_child(map_sub)
	var close := _button("×", 16)
	close.custom_minimum_size = Vector2(28.0, 28.0)
	row.add_child(close)
	close.pressed.connect(close_panel)


func _build_tabs() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	body.add_child(row)
	area_tab = _button("▣ エリア", 13)
	floor_tab = _button("☍ 階層", 13)
	area_tab.custom_minimum_size.y = 35.0
	floor_tab.custom_minimum_size.y = 35.0
	row.add_child(area_tab)
	row.add_child(floor_tab)
	area_tab.pressed.connect(func(): show_tab("area"))
	floor_tab.pressed.connect(func(): show_tab("floor"))


func _build_area() -> void:
	area_wrap = VBoxContainer.new()
	area_wrap.add_theme_constant_override("separation", 8)
	body.add_child(area_wrap)
	area_canvas = AreaCanvas.new()
	area_canvas.name = "AreaMap"
	area_canvas.custom_minimum_size = AREA_CANVAS_SIZE
	area_canvas.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	area_canvas.pin_requested.connect(func(world_pos: Vector2): pin_requested.emit(world_pos))
	area_wrap.add_child(area_canvas)
	var flow := VBoxContainer.new()
	flow.add_theme_constant_override("separation", 6)
	flow.custom_minimum_size.y = 40.0
	flow.add_theme_font_size_override("font_size", 12)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	flow.add_child(row)
	var entry_index := 0
	for item in [["▲", "自分", "#ffffff"], ["●", "仲間", "#7f7"], ["▲", "出口", "#bfe6ff"], ["●", "転移門", "#6ad0ff"], ["●", "NPC（クエスト）", "#ffd84a"], ["■", "宝箱", "#ffd27a"], ["●", "敵", "#ff7a6a"], ["●", "ネームド", "#ff6ad0"], ["●", "毒沼", "#8a3ab0"], ["●", "流砂", "#e0c890"], ["◆", "ワープポイント", "#6ad8ff"], ["📍", "ピン（地図をクリックで立てる・もう一度で外す）", "#ffd84a"]]:
		var entry := HBoxContainer.new()
		entry.add_theme_constant_override("separation", 3)
		var icon := _label(String(item[0]), 12, Color.html(String(item[2])))
		var label := _label(String(item[1]), 12, Color.html("#8fa0b8"))
		entry.add_child(icon)
		entry.add_child(label)
		if entry_index == 10:
			row = HBoxContainer.new()
			row.add_theme_constant_override("separation", 16)
			flow.add_child(row)
		row.add_child(entry)
		entry_index += 1
	area_wrap.add_child(flow)


func _build_floor() -> void:
	floor_wrap = VBoxContainer.new()
	floor_wrap.add_theme_constant_override("separation", 8)
	body.add_child(floor_wrap)
	floor_tabs = HBoxContainer.new()
	floor_tabs.add_theme_constant_override("separation", 6)
	floor_wrap.add_child(floor_tabs)
	floor_canvas = FloorCanvas.new()
	floor_canvas.name = "FloorMap"
	floor_canvas.owner_panel = self
	floor_canvas.game = game
	floor_canvas.custom_minimum_size = Vector2(704.0, 435.0)
	floor_canvas.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	floor_canvas.warp_requested.connect(func(id: String): warp_requested.emit(id))
	var floor_bg := StyleBoxFlat.new()
	floor_bg.bg_color = Color(0.0, 0.0, 0.0, 0.2)
	floor_bg.set_corner_radius_all(8)
	floor_canvas.add_theme_stylebox_override("panel", floor_bg)
	floor_wrap.add_child(floor_canvas)
	var scroll := ScrollContainer.new()
	scroll.name = "MapInfoScroll"
	scroll.custom_minimum_size = Vector2(0.0, _viewport_size().y * 0.176)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	floor_wrap.add_child(scroll)
	floor_info = GridContainer.new()
	floor_info.name = "MapInfo"
	floor_info.columns = 2
	floor_info.add_theme_constant_override("h_separation", 12)
	floor_info.add_theme_constant_override("v_separation", 4)
	floor_info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(floor_info)
	var legend := VBoxContainer.new()
	legend.add_theme_constant_override("separation", 6)
	for row_values in [["⌂ 町・野営地：転移門とNPC", "✿ フィールド", "⚔ 狩場：経験値1.6倍", "◈ ダンジョン：最奥にユニーク装備"], ["♜ 迷宮区：ギミックと階層ボス"]]:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		for value in row_values: row.add_child(_label(String(value), 12, Color.html("#8fa0b8")))
		legend.add_child(row)
	floor_wrap.add_child(legend)


func _fit_panel() -> void:
	if panel == null: return
	var viewport := _viewport_size()
	var desired := panel.get_combined_minimum_size()
	var w := minf(760.0, viewport.x * 0.96)
	var h := minf(maxf(desired.y, 120.0), viewport.y * 0.96)
	panel.size = Vector2(w, h)
	panel.position = (viewport - panel.size) * 0.5
	if backdrop != null:
		backdrop.position = panel.position + Vector2.ONE
		backdrop.size = panel.size - Vector2(2.0, 2.0)
		(backdrop.material as ShaderMaterial).set_shader_parameter("panel_size", backdrop.size)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		call_deferred("_fit_panel")


func is_open() -> bool:
	return panel != null and panel.visible


func open() -> void:
	panel.visible = true
	backdrop.visible = true
	selected_floor = maxi(1, int(game.area.get("floor", 1)))
	_refresh()
	_fit_panel()


func close_panel() -> void:
	if panel != null: panel.visible = false
	if backdrop != null: backdrop.visible = false


func show_tab(value: String) -> void:
	selected_tab = "floor" if value == "floor" else "area"
	if selected_tab == "floor": selected_floor = maxi(1, int(game.area.get("floor", 1)))
	_refresh()


func tick() -> void:
	if not is_open(): return
	var now := Time.get_ticks_msec()
	if selected_tab == "area" and now - last_area_refresh >= 250:
		last_area_refresh = now
		_refresh_area()


func refresh_now() -> void:
	if is_open(): _refresh()


func _refresh() -> void:
	area_tab.add_theme_stylebox_override("normal", _tab_style(selected_tab == "area"))
	area_tab.add_theme_stylebox_override("hover", _tab_style(selected_tab == "area"))
	area_tab.add_theme_stylebox_override("pressed", _tab_style(selected_tab == "area"))
	floor_tab.add_theme_stylebox_override("normal", _tab_style(selected_tab == "floor"))
	floor_tab.add_theme_stylebox_override("hover", _tab_style(selected_tab == "floor"))
	floor_tab.add_theme_stylebox_override("pressed", _tab_style(selected_tab == "floor"))
	area_wrap.visible = selected_tab == "area"
	floor_wrap.visible = selected_tab == "floor"
	if selected_tab == "area": _refresh_area()
	else: _refresh_floor()
	_fit_panel()


func _refresh_area() -> void:
	if game.area.is_empty(): return
	var id := String(game.area_id)
	var meta: Dictionary = MAP_META.get(id, {})
	var type: Dictionary = AREA_TYPES.get(String(meta.get("type", "")), {"name": "", "icon": ""})
	var weather: Dictionary = WEATHERS.get(String(meta.get("weather", "")), {})
	var status: Dictionary = game.ch.get("areas", {}).get(id, {})
	map_title.text = "%s %s" % [String(type.get("icon", "")), String(game.area.get("name", id))]
	var sub := "第%d層 %s" % [int(game.area.get("floor", 1)), String(type.get("name", ""))]
	if not weather.is_empty(): sub += "　%s %s" % [String(weather.get("icon", "")), String(weather.get("name", ""))]
	if bool(status.get("done", false)): sub += "　✔ 踏破"
	if String(game.area.get("shape", "")) == "grid":
		var grid_rows: Array = game.area.get("rows", [])
		var seen: PackedByteArray = game.hud_ui.minimap.explored.get(id, PackedByteArray())
		var total := 0; var found := 0
		for r in range(grid_rows.size()):
			for c in range(String(grid_rows[r]).length()):
				if String(grid_rows[r])[c] == "#": continue
				total += 1
				var index := r * int(game.area.get("W", 0)) + c
				if index < seen.size() and seen[index] != 0: found += 1
		if total > 0: sub += "　探索率 %d%%（歩いた場所が地図に記されます）" % roundi(float(found) / total * 100.0)
	map_sub.text = sub
	if game.hud_ui != null and game.hud_ui.minimap != null:
		area_canvas.set_map(game.hud_ui.minimap.build_area_shapes(game, area_canvas.size, MAP_META))


func _refresh_floor() -> void:
	var data: Dictionary = MapRules.data()
	var floors: Array = data.get("floors", [])
	if selected_floor < 1 or selected_floor > floors.size(): return
	map_title.text = "第%d層 %s" % [selected_floor, String(floors[selected_floor - 1].get("name", ""))]
	map_sub.text = "◇ 解放したワープポイント・転移門のあるエリアをクリックすると、そこへワープします"
	_build_floor_tabs()
	floor_canvas.set_floor(selected_floor)
	_build_floor_info()


func _build_floor_tabs() -> void:
	for child in floor_tabs.get_children():
		floor_tabs.remove_child(child)
		child.queue_free()
	var unlocked := clampi(int(game.get("unlocked")), 1, 3)
	for i in range(1, unlocked + 1):
		var button := _button("第%d層" % i, 13)
		button.custom_minimum_size.y = 35.0
		button.add_theme_stylebox_override("normal", _tab_style(i == selected_floor))
		button.add_theme_stylebox_override("hover", _tab_style(i == selected_floor))
		button.add_theme_stylebox_override("pressed", _tab_style(i == selected_floor))
		floor_tabs.add_child(button)
		button.pressed.connect(func(): selected_floor = i; _refresh_floor(); _fit_panel())


func _build_floor_info() -> void:
	for child in floor_info.get_children():
		floor_info.remove_child(child)
		child.queue_free()
	var data: Dictionary = MapRules.data()
	var areas: Dictionary = data.get("areas", {})
	for id in areas:
		var ar: Dictionary = areas[id]
		if int(ar.get("floor", 1)) != selected_floor: continue
		var meta: Dictionary = MAP_META.get(String(id), {})
		if meta.get("bias", []).is_empty() and meta.get("kinds", []).is_empty(): continue
		var status: Dictionary = game.ch.get("areas", {}).get(String(id), {"k": 0})
		var type: Dictionary = AREA_TYPES.get(String(meta.get("type", "")), {"color": "#8fa0b8", "icon": ""})
		var card := PanelContainer.new()
		var style := StyleBoxFlat.new()
		style.bg_color = Color(120.0 / 255.0, 1.0, 200.0 / 255.0, 0.07) if bool(status.get("done", false)) else Color(0.0, 0.0, 0.0, 0.25)
		style.set_corner_radius_all(6)
		style.content_margin_left = 8.0; style.content_margin_right = 8.0
		style.content_margin_top = 4.0; style.content_margin_bottom = 4.0
		card.add_theme_stylebox_override("panel", style)
		floor_info.add_child(card)
		var contents := VBoxContainer.new()
		contents.add_theme_constant_override("separation", 2)
		card.add_child(contents)
		var title := "%s %s" % [String(type.get("icon", "")), String(ar.get("name", id))]
		if bool(status.get("done", false)): title += "　踏破"
		contents.add_child(_label(title, 12, Color.html(String(type.get("color", "#8fa0b8")))))
		if bool(status.get("done", false)):
			var rules: Dictionary = MapRules.data()
			var weapon_names: Array[String] = []
			for kind in meta.get("kinds", []): weapon_names.append(String(rules.get("weapons", {}).get(String(kind), {}).get("name", String(kind))))
			if not weapon_names.is_empty(): contents.add_child(_label("出やすい：" + "・".join(weapon_names), 11, Color.html("#f2ead2")))
			var affix_names: Array[String] = []
			for key in meta.get("bias", []):
				var variant: Dictionary = rules.get("skillVariants", {}).get(String(key), {})
				var affix: Dictionary = rules.get("affixes", {}).get(String(key), {})
				if not variant.is_empty(): affix_names.append(String(variant.get("icon", "")) + String(variant.get("name", key)))
				elif not affix.is_empty(): affix_names.append(String(affix.get("name", key)))
			if not affix_names.is_empty(): contents.add_child(_label("付きやすい：" + "・".join(affix_names), 11, Color.html("#cfe6ff")))
		else:
			var how := "ボスを倒すと判明" if String(meta.get("type", "")) == "labyrinth" else ("ネームドを倒すと判明" if String(meta.get("type", "")) == "secret" else "敵を%d体倒すと判明（%d/%d）" % [CLEAR_KILLS, mini(int(status.get("k", 0)), CLEAR_KILLS), CLEAR_KILLS])
			contents.add_child(_label("？？？　" + how, 11, Color.html("#8fa0b8")))


func _panel_style(padding: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0, 0.0)
	style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 24
	style.content_margin_left = padding; style.content_margin_right = padding
	style.content_margin_top = padding; style.content_margin_bottom = padding
	return style


func _tab_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(255.0 / 255.0, 216.0 / 255.0, 106.0 / 255.0, 0.2) if active else Color(1.0, 1.0, 1.0, 0.04)
	style.border_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.55) if active else Color(1.0, 1.0, 1.0, 0.08)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 16.0; style.content_margin_right = 16.0
	style.content_margin_top = 6.0; style.content_margin_bottom = 6.0
	return style


func _button(value: String, font_size: int) -> Button:
	var button := Button.new()
	button.text = value
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", Color.html("#e8eef8"))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
	normal.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	normal.set_border_width_all(1); normal.set_corner_radius_all(6)
	normal.content_margin_left = 10.0; normal.content_margin_right = 10.0
	normal.content_margin_top = 6.0; normal.content_margin_bottom = 6.0
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.4)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	return button


func _label(value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _viewport_size() -> Vector2:
	return get_viewport_rect().size if is_inside_tree() else Vector2(1532.0, 869.0)
