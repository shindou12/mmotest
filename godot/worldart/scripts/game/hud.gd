extends RefCounted
## Browser HUD の表示と状態反映。寸法・色は public/style.css と public/js/ui/panels/hud.js を参照。

const MiniMap = preload("res://scripts/game/minimap.gd")
const GameWTree = preload("res://scripts/game/skills/wtree.gd")
const GameMapPanel = preload("res://scripts/game/map_panel.gd")
const GameSettingsPanel = preload("res://scripts/game/settings_panel.gd")


class TopButton extends Control:
	## #topbar .slot: public/style.css L479-482。直径 42px の丸、背景 rgba(10,14,24,.45)、枠 1px rgba(255,255,255,.3)、ホバーで #6ad0ff。
	signal pressed
	var hover := false
	var badge: Label

	func _init() -> void:
		custom_minimum_size = Vector2(42.0, 42.0)
		size = custom_minimum_size
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		mouse_entered.connect(func(): hover = true; queue_redraw())
		mouse_exited.connect(func(): hover = false; queue_redraw())

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			pressed.emit()
			accept_event()

	func _draw() -> void:
		var c := size * 0.5
		draw_circle(c, 21.0, Color(10.0 / 255.0, 14.0 / 255.0, 24.0 / 255.0, 0.45))
		draw_arc(c, 20.5, 0.0, TAU, 48, Color.html("#6ad0ff") if hover else Color(1.0, 1.0, 1.0, 0.3), 1.0, true)


class HudBar extends Control:
	var ratio: float = 0.0
	var low: bool = false
	var maxed: bool = false
	var opacity: float = 1.0
	var normal_texture: Texture2D
	var low_texture: Texture2D
	var max_texture: Texture2D
	var track := StyleBoxFlat.new()
	var outline := StyleBoxFlat.new()
	var radius: int = 5

	static func make_gradient(start: Color, finish: Color) -> GradientTexture2D:
		var gradient := Gradient.new()
		gradient.colors = PackedColorArray([start, finish])
		var texture := GradientTexture2D.new()
		texture.gradient = gradient
		texture.width = 256
		texture.height = 16
		texture.fill = GradientTexture2D.FILL_LINEAR
		texture.fill_from = Vector2(0.0, 0.5)
		texture.fill_to = Vector2(1.0, 0.5)
		return texture

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		track.bg_color = Color(0.0, 0.0, 0.0, 0.5)
		track.border_color = Color(0.0, 0.0, 0.0, 0.6)
		track.set_border_width_all(1)
		outline.bg_color = Color(0.0, 0.0, 0.0, 0.0)
		outline.border_color = Color(0.0, 0.0, 0.0, 0.6)
		outline.set_border_width_all(1)

	func configure(start: Color, finish: Color, low_start: Color = Color.TRANSPARENT, low_finish: Color = Color.TRANSPARENT, roundness: int = 5) -> void:
		radius = roundness
		track.set_corner_radius_all(radius)
		outline.set_corner_radius_all(radius)
		normal_texture = make_gradient(start, finish)
		low_texture = make_gradient(low_start, low_finish) if low_start.a > 0.0 else normal_texture
		max_texture = make_gradient(Color.html("#ffd84a"), Color.html("#ffd84a"))

	func set_value(value: float, is_low: bool = false, is_maxed: bool = false) -> void:
		ratio = clampf(value, 0.0, 1.0)
		low = is_low
		maxed = is_maxed
		queue_redraw()

	func _draw() -> void:
		var rect := Rect2(Vector2.ZERO, size)
		draw_style_box(track, rect)
		var tex: Texture2D = max_texture if maxed else (low_texture if low else normal_texture)
		var inner_w := maxf(0.0, size.x - 2.0) * ratio
		var inner_h := maxf(0.0, size.y - 2.0)
		if tex != null and inner_w > 0.0 and inner_h > 0.0:
			var src := Rect2(Vector2.ZERO, Vector2(tex.get_width() * ratio, tex.get_height()))
			draw_texture_rect_region(tex, Rect2(Vector2(1.0, 1.0), Vector2(inner_w, inner_h)), src, Color(1.0, 1.0, 1.0, opacity))
		draw_style_box(outline, rect)


class CooldownShade extends Control:
	var amount: float = 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_amount(value: float) -> void:
		amount = clampf(value, 0.0, 1.0)
		queue_redraw()

	func _draw() -> void:
		if amount <= 0.0:
			return
		var center := size * 0.5
		var radius := minf(size.x, size.y) * 0.5
		var segments := maxi(2, ceili(64.0 * amount))
		var points := PackedVector2Array([center])
		for i in range(segments + 1):
			var angle := -PI * 0.5 + TAU * amount * float(i) / float(segments)
			points.append(center + Vector2(cos(angle), sin(angle)) * radius)
		draw_colored_polygon(points, Color(0.0, 0.0, 0.0, 0.62))


class HotbarSlot extends Control:
	var circle_size: float = 48.0
	var circle_y: float = 12.0
	var is_ready: bool = false
	var off: bool = false
	var plate := StyleBoxFlat.new()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_refresh_plate()

	func configure(width: float, size_px: float, top: float, icon_px: float) -> void:
		custom_minimum_size = Vector2(width, 60.0)
		size = custom_minimum_size
		circle_size = size_px
		circle_y = top
		_refresh_plate()

	func set_state(is_ready: bool, is_off: bool) -> void:
		self.is_ready = is_ready
		off = is_off
		_refresh_plate()
		modulate.a = 0.45 if off else 1.0
		queue_redraw()

	func _refresh_plate() -> void:
		plate.bg_color = Color(10.0 / 255.0, 14.0 / 255.0, 24.0 / 255.0, 0.45)
		plate.set_border_width_all(2)
		plate.set_corner_radius_all(int(circle_size * 0.5))
		plate.border_color = Color(1.0, 1.0, 1.0, 0.32)
		plate.shadow_size = 10 if is_ready else 0
		plate.shadow_color = Color(1.0, 220.0 / 255.0, 120.0 / 255.0, 0.35) if is_ready else Color.TRANSPARENT

	func _draw() -> void:
		if off:
			plate.border_color = Color(1.0, 1.0, 1.0, 0.32)
		elif is_ready:
			plate.border_color = Color(1.0, 236.0 / 255.0, 170.0 / 255.0, 0.75)
		draw_style_box(plate, Rect2(Vector2(0.0, circle_y), Vector2(circle_size, circle_size)))


class GoldToken extends Control:
	func _init() -> void:
		custom_minimum_size = Vector2(18.0, 18.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		# #gold i: public/style.css のラジアル金色。円とハイライトで近似。
		draw_circle(size * 0.5, 9.0, Color.html("#b07a10"))
		draw_circle(size * 0.5, 8.0, Color.html("#ffc83a"))
		draw_circle(Vector2(6.3, 5.7), 2.5, Color.html("#fff4b0"))
		draw_arc(size * 0.5, 8.0, 0.0, TAU, 48, Color.html("#8a5a00"), 1.0, true)


class StaminaRing extends Control:
	var fraction: float = 1.0
	var guard: bool = false
	var full: bool = false

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var center := size * 0.5
		var radius := size.x * 0.4
		var width := size.x * 0.125
		draw_arc(center, radius, 0.0, TAU, 64, Color(0.0, 0.0, 0.0, 0.4), width, true)
		var color := Color.html("#ffd86a")
		if full:
			color = Color.html("#fff4c4")
		elif guard:
			color = Color.html("#9ad8ff") if fraction > 0.6 else (Color.html("#ffd84a") if fraction > 0.3 else Color.html("#ff4a3a"))
		if fraction > 0.0:
			draw_arc(center, radius, -PI * 0.5, -PI * 0.5 + TAU * fraction, 64, Color(color.r, color.g, color.b, 0.22), width + 2.0, true)
			draw_arc(center, radius, -PI * 0.5, -PI * 0.5 + TAU * fraction, 64, color, width, true)


var game
var content: Control
var icon_index: Dictionary = {}
var icon_cache: Dictionary = {}
var bars := {}
var labels := {}
var slots := {}
var slot_data := {}
var buff_rows := []
var buff_signature: String = ""
var last_gold: int = -1
var stamina_seen: float = -9.0
var banner_tween: Tween
var help_panel: PanelContainer
var vitals: VBoxContainer
var buffs: HFlowContainer
var gold_panel: PanelContainer
var toast_stack: VBoxContainer
var banner_top: Label
var banner_main: Label
var death_overlay: Control
var prompt_panel: PanelContainer
var charge_box: Control
var charge_fill: HudBar
var stamina_ring: Control
var minimap
var minimap_t: float = 0.0
var floor_label: Label
var quests_box: VBoxContainer
var topbar: HBoxContainer
var top_buttons := {}
var map_panel
var settings_panel
var quests_signature: String = ""
var quests_list: Array = []   # [{name, desc, p, n, done}]。game 側の受注中クエスト。


func build(parent: Control, owner) -> void:
	game = owner
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://assets/icons/index.json"))
	icon_index = parsed if parsed is Dictionary else {}
	content = Control.new()
	content.name = "HUDContent"
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.visible = false
	parent.add_child(content)
	_build_vitals()
	_build_hotbar()
	_build_gold()
	_build_charge()
	_build_prompt()
	_build_messages()
	_build_help()
	_build_death()
	_build_nav()
	_build_topbar()
	_build_panels()


func _build_vitals() -> void:
	# #vitals: public/style.css 488-497. 下 20px、幅 min(380px, 30vw)、HP 9px、XP 3px、行 12/11px。
	vitals = VBoxContainer.new()
	vitals.name = "Vitals"
	vitals.custom_minimum_size.x = 380.0
	vitals.add_theme_constant_override("separation", 3)
	content.add_child(vitals)

	var buff_margin := MarginContainer.new()
	buff_margin.add_theme_constant_override("margin_bottom", 4)
	vitals.add_child(buff_margin)
	buffs = HFlowContainer.new()
	buffs.name = "Buffs"
	buffs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buffs.alignment = FlowContainer.ALIGNMENT_CENTER
	buffs.add_theme_constant_override("h_separation", 8)
	buffs.add_theme_constant_override("v_separation", 4)
	buff_margin.add_child(buffs)

	var row := HBoxContainer.new()
	row.name = "VitalsRow"
	row.add_theme_constant_override("separation", 6)
	vitals.add_child(row)
	labels.lv = _label("Lv 1", 12, Color.html("#f2ead2"))
	labels.lv.add_theme_font_size_override("font_size", 12)
	row.add_child(labels.lv)
	labels.name = _label("", 12, Color.html("#dfe6f2"))
	labels.name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(labels.name)
	labels.hp = _label("100 / 100", 11, Color.html("#e8eef8"))
	labels.hp.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	labels.hp.custom_minimum_size.x = 62.0
	row.add_child(labels.hp)

	bars.hp = HudBar.new()
	bars.hp.name = "HPBar"
	bars.hp.custom_minimum_size = Vector2(380.0, 9.0)
	bars.hp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bars.hp.configure(Color.html("#2ecc71"), Color.html("#7dff9a"), Color.html("#e74c3c"), Color.html("#ff8a5a"), 5)
	vitals.add_child(bars.hp)
	bars.xp = HudBar.new()
	bars.xp.name = "XPBar"
	bars.xp.custom_minimum_size = Vector2(380.0, 3.0)
	bars.xp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bars.xp.opacity = 0.8
	bars.xp.configure(Color.html("#6a5aff"), Color.html("#b98aff"), Color.TRANSPARENT, Color.TRANSPARENT, 2)
	vitals.add_child(bars.xp)


func _build_hotbar() -> void:
	# #hotbar: public/style.css 500-509。右 22px・下 36px、通常円 48px、武器技 60px、間隔 10px。
	var order := [
		["guard", 48.0, 48.0, "左長押し", "溜め中ガード", "tag_shield"],
		["pot", 48.0, 48.0, "R", "回復", "tag_blood"],
		["dodge", 48.0, 48.0, "Space", "回避", "tag_dodge"],
		["t1", 48.0, 48.0, "Q", "未設定", "tag_light"],
		["t2", 48.0, 48.0, "E", "未設定", "tag_light"],
		["skill", 60.0, 60.0, "右クリック", "武器スキル", "tag_light"],
	]
	for spec in order:
		var key: String = spec[0]
		var width_px: float = spec[1]
		var circle_px: float = spec[2]
		var circle_top := 60.0 - circle_px
		var entry := _make_slot(key, width_px, circle_px, circle_top, String(spec[3]), String(spec[4]), String(spec[5]))
		content.add_child(entry.root)
		slots[key] = entry.root
		slot_data[key] = entry

	stamina_ring = Control.new()
	# SVG #stamina: public/style.css 643-649 と hud.js 82-86。
	stamina_ring = StaminaRing.new()
	content.add_child(stamina_ring)


func _make_slot(key: String, width_px: float, circle_px: float, circle_top: float, hotkey: String, title: String, icon_key: String) -> Dictionary:
	var root := HotbarSlot.new()
	root.name = "Slot_" + key
	# 絵のアイコン（G7-1、自分の丸い枠を持つ）は丸の 9 割に。ブラウザ版の記号の文字の大きさ（20px・27px）のままでは小さすぎた
	var icon_px := circle_px * 0.9
	root.configure(width_px, circle_px, circle_top, icon_px)
	var icon := TextureRect.new()
	icon.name = "Icon"
	icon.position = Vector2((width_px - icon_px) * 0.5, circle_top + (circle_px - icon_px) * 0.5)
	icon.size = Vector2(icon_px, icon_px)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture = _icon(icon_key)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(icon)

	var shade := CooldownShade.new()
	shade.name = "Cooldown"
	shade.position = Vector2(0.0, circle_top)
	shade.size = Vector2(circle_px, circle_px)
	root.add_child(shade)
	var seconds := _label("", 8, Color.WHITE)
	seconds.name = "CooldownSeconds"
	seconds.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	seconds.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	seconds.position = Vector2(0.0, circle_top + circle_px - 15.0)
	seconds.size = Vector2(circle_px, 12.0)
	seconds.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 1.0))
	seconds.add_theme_constant_override("shadow_offset_x", 1)
	seconds.add_theme_constant_override("shadow_offset_y", 1)
	seconds.visible = false
	root.add_child(seconds)

	var count: Label = null
	if key == "pot":
		var count_panel := PanelContainer.new()
		count_panel.name = "CountBadge"
		count_panel.position = Vector2(circle_px - 19.0, circle_top - 3.0)
		count_panel.size = Vector2(18.0, 18.0)
		count_panel.custom_minimum_size = count_panel.size
		count_panel.z_index = 2
		var badge := StyleBoxFlat.new()
		badge.bg_color = Color.html("#2e9a54")
		badge.set_corner_radius_all(9)
		badge.content_margin_left = 0.0
		badge.content_margin_right = 0.0
		badge.content_margin_top = 0.0
		badge.content_margin_bottom = 0.0
		count_panel.add_theme_stylebox_override("panel", badge)
		count = _label("3", 11, Color.WHITE)
		count.name = "Count"
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		count_panel.add_child(count)
		root.add_child(count_panel)

	var key_panel := PanelContainer.new()
	key_panel.name = "Key"
	var key_style := StyleBoxFlat.new()
	key_style.bg_color = Color(0.0, 0.0, 0.0, 0.55)
	key_style.set_corner_radius_all(4)
	key_style.content_margin_left = 4.0
	key_style.content_margin_right = 4.0
	key_style.content_margin_top = 0.0
	key_style.content_margin_bottom = 0.0
	key_panel.add_theme_stylebox_override("panel", key_style)
	var key_label := _label(hotkey, 9, Color.html("#e6e9f0"))
	key_label.name = "Text"
	key_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	key_panel.add_child(key_label)
	root.add_child(key_panel)
	key_panel.reset_size()
	key_panel.position = Vector2((width_px - key_panel.size.x) * 0.5, 64.0)

	var name_label := _label(title, 9, Color.html("#c8cfdc"))
	name_label.name = "Name"
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.clip_text = true
	name_label.position = Vector2((width_px - 54.0) * 0.5, 81.0)
	name_label.size = Vector2(54.0, 12.0)
	root.add_child(name_label)

	var icon_tint := Color.WHITE
	if key == "t1" or key == "t2": icon_tint = Color.html("#b9a0ff")
	if key == "skill": icon_tint = Color.html("#8fd8ff")
	icon.modulate = icon_tint
	return {"root": root, "icon": icon, "shade": shade, "seconds": seconds, "count": count, "key": key_label, "name": name_label, "width": width_px, "circle": circle_px, "circle_top": circle_top}


func _build_gold() -> void:
	# #gold: public/style.css 636-638。top 24px、right 232px、金色枠、13px。
	gold_panel = PanelContainer.new()
	gold_panel.name = "Gold"
	var style := StyleBoxFlat.new()
	style.bg_color = Color(10.0 / 255.0, 14.0 / 255.0, 24.0 / 255.0, 0.5)
	style.border_color = Color(1.0, 216.0 / 255.0, 106.0 / 255.0, 0.35)
	style.set_border_width_all(1)
	style.set_corner_radius_all(14)
	style.content_margin_left = 4.0
	style.content_margin_right = 12.0
	style.content_margin_top = 3.0
	style.content_margin_bottom = 3.0
	gold_panel.add_theme_stylebox_override("panel", style)
	content.add_child(gold_panel)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	gold_panel.add_child(row)
	var coin := GoldToken.new()
	row.add_child(coin)
	labels.gold = _label("0", 13, Color.html("#ffe7a0"))
	labels.gold.name = "GoldAmount"
	labels.gold.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 1.0))
	labels.gold.add_theme_constant_override("shadow_offset_x", 0)
	labels.gold.add_theme_constant_override("shadow_offset_y", 1)
	row.add_child(labels.gold)


func _build_charge() -> void:
	# #charge: public/style.css 149-151, 651-653。対象の上に 110x6px、最大時は黄色。
	charge_box = Control.new()
	charge_box.name = "Charge"
	charge_box.custom_minimum_size = Vector2(110.0, 24.0)
	content.add_child(charge_box)
	charge_fill = HudBar.new()
	charge_fill.custom_minimum_size = Vector2(110.0, 6.0)
	charge_fill.configure(Color.html("#6ad0ff"), Color.html("#b9a0ff"), Color.TRANSPARENT, Color.TRANSPARENT, 3)
	charge_fill.track.bg_color = Color(0.0, 0.0, 0.0, 0.55)
	charge_fill.track.border_color = Color(1.0, 1.0, 1.0, 0.25)
	charge_fill.outline.border_color = Color(1.0, 1.0, 1.0, 0.25)
	charge_box.add_child(charge_fill)
	labels.charge = _label("溜め斬り", 10, Color.html("#f2ead2"))
	labels.charge.name = "AttackName"
	labels.charge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	labels.charge.position = Vector2(-20.0, 8.0)
	labels.charge.size = Vector2(150.0, 14.0)
	charge_box.add_child(labels.charge)
	charge_box.visible = false


func _build_prompt() -> void:
	# #prompt: public/style.css L658-659 の最終指定。1532×869で left 60% / top 54%、背景 rgba(10,14,24,.7)、角丸 20px、余白上下6/左8/右16px。
	prompt_panel = PanelContainer.new()
	prompt_panel.name = "Prompt"
	var style := _panel_style(Color.TRANSPARENT, 0, 20, 8.0, 6.0, 16.0, 6.0)
	style.bg_color = Color(10.0 / 255.0, 14.0 / 255.0, 24.0 / 255.0, 0.7)
	prompt_panel.add_theme_stylebox_override("panel", style)
	content.add_child(prompt_panel)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	prompt_panel.add_child(row)
	var key_panel := PanelContainer.new()
	key_panel.name = "Key"
	var key_style := StyleBoxFlat.new()
	key_style.bg_color = Color.html("#f2ead2")
	key_style.set_corner_radius_all(4)
	key_style.content_margin_left = 5.0
	key_style.content_margin_right = 5.0
	key_style.content_margin_top = 1.0
	key_style.content_margin_bottom = 1.0
	key_panel.add_theme_stylebox_override("panel", key_style)
	var key := _label("F", 10, Color.html("#1a1d26"))
	key_panel.add_child(key)
	row.add_child(key_panel)
	labels.prompt = _label("調べる", 13, Color.html("#e8eef8"))
	labels.prompt.name = "Text"
	row.add_child(labels.prompt)
	prompt_panel.visible = false


func _build_messages() -> void:
	# #toasts / #banner: public/style.css L660 / L99-103、toasts top 96px・5件・6秒、banner top 30%・5秒。
	toast_stack = VBoxContainer.new()
	toast_stack.name = "Toasts"
	toast_stack.set_anchors_preset(Control.PRESET_TOP_WIDE)
	toast_stack.offset_left = 250.0
	toast_stack.offset_right = -250.0
	toast_stack.offset_top = 96.0
	toast_stack.add_theme_constant_override("separation", 6)
	toast_stack.alignment = BoxContainer.ALIGNMENT_BEGIN
	content.add_child(toast_stack)

	var banner := Control.new()
	banner.name = "Banner"
	banner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(banner)
	banner_top = _label("", 16, Color.html("#bfe6ff"))
	banner_top.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_top.position = Vector2(0.0, 0.30 * _screen_size().y)
	banner_top.size = Vector2(_screen_size().x, 24.0)
	banner.add_child(banner_top)
	banner_main = _label("", 56, Color.html("#bfe6ff"))
	banner_main.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_main.position = Vector2(0.0, 0.30 * _screen_size().y + 22.0)
	banner_main.size = Vector2(_screen_size().x, 70.0)
	banner_main.pivot_offset = banner_main.size * 0.5
	banner.add_child(banner_main)
	banner.visible = false
	labels.banner = banner


func _build_help() -> void:
	# #help: public/style.css L662の top 300px / left 16px / width 280px。
	help_panel = PanelContainer.new()
	help_panel.name = "Help"
	help_panel.position = Vector2(16.0, 300.0)
	help_panel.custom_minimum_size = Vector2(280.0, 0.0)
	help_panel.add_theme_stylebox_override("panel", _panel_style(Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25), 1, 10, 12.0, 10.0, 12.0, 10.0, Color(0.0, 0.0, 0.0, 0.35), 6))
	content.add_child(help_panel)
	var text := _label("操作\nWASD 移動 / マウス 狙い\n左クリック 通常攻撃（3段コンボ）\n左クリック長押し→離す 強攻撃（溜めるほど強い）\n右クリック 武器スキル\nQ / E スキルツリーで覚えたスキル\nSpace 回避 / R 回復薬 / F 調べる / I 持ち物\nホイール カメラ距離", 12, Color.html("#e8eef8"))
	text.name = "HelpText"
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.add_theme_constant_override("line_spacing", 8)
	help_panel.add_child(text)


func _build_death() -> void:
	# #death: public/index.html L221 と public/style.css L327-328。文言は同じ。ブラウザ側にもボタンはなく、時間後に新規キャラへ戻る。
	death_overlay = Control.new()
	death_overlay.name = "Death"
	death_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	death_overlay.z_index = 100
	death_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(death_overlay)
	var bg := TextureRect.new()
	bg.name = "RadialBackground"
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_SCALE
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([Color(80.0 / 255.0, 0.0, 0.0, 0.3), Color(0.0, 0.0, 0.0, 0.8)])
	var radial := GradientTexture2D.new()
	radial.gradient = gradient
	radial.width = 512
	radial.height = 512
	radial.fill = GradientTexture2D.FILL_RADIAL
	radial.fill_from = Vector2(0.5, 0.5)
	radial.fill_to = Vector2(0.5, 0.0)
	bg.texture = radial
	death_overlay.add_child(bg)
	var center := VBoxContainer.new()
	center.name = "Message"
	center.set_anchors_preset(Control.PRESET_CENTER)
	center.offset_left = -500.0
	center.offset_right = 500.0
	center.offset_top = -42.0
	center.offset_bottom = 42.0
	center.add_theme_constant_override("separation", 10)
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	death_overlay.add_child(center)
	labels.death = _label("HP が尽きた…", 36, Color.html("#ff8888"))
	labels.death.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	labels.death.custom_minimum_size = Vector2(1000.0, 46.0)
	labels.death.add_theme_constant_override("font_spacing", 11) # CSS letter-spacing: .3em at 36px.
	center.add_child(labels.death)
	labels.death_t = _label("", 14, Color.html("#cccccc"))
	labels.death_t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	labels.death_t.custom_minimum_size = Vector2(1000.0, 20.0)
	labels.death_t.add_theme_constant_override("font_spacing", 1) # CSS letter-spacing: .1em at 14px.
	center.add_child(labels.death_t)
	death_overlay.visible = false


func _bold_label(text: String, font_size: int, color: Color) -> Label:
	var label := _label(text, font_size, color)
	var font := FontVariation.new()
	font.base_font = ThemeDB.fallback_font
	font.variation_embolden = 0.7
	label.label_settings.font = font
	return label


func _build_nav() -> void:
	# #nav: public/style.css L465-469。左 16・上 16、幅 172、縦並び・中央、隙間 4px。
	# ミニマップ 164px（#nav #minimap）、現在地 12px #f2ead2（#nav #me-floor）、クエスト欄は幅 220px・左寄せ（#nav #quests）。
	minimap = MiniMap.new()
	minimap.name = "Minimap"
	minimap.position = Vector2(16.0 + 4.0, 16.0)
	content.add_child(minimap)
	floor_label = _label("", 12, Color.html("#f2ead2"))
	floor_label.name = "MeFloor"
	floor_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	floor_label.position = Vector2(16.0, 16.0 + 164.0 + 4.0)
	floor_label.size = Vector2(172.0, 18.0)
	floor_label.label_settings.shadow_size = 3
	floor_label.label_settings.shadow_offset = Vector2(0.0, 1.0)
	content.add_child(floor_label)
	# #nav #quests（style.css L465-469）が #quests の汎用配置を上書きする。ミニマップ・現在地の下、左端 16px。
	quests_box = VBoxContainer.new()
	quests_box.name = "Quests"
	quests_box.position = Vector2(16.0, floor_label.position.y + floor_label.size.y + 4.0)
	quests_box.custom_minimum_size = Vector2(220.0, 0.0)
	quests_box.add_theme_constant_override("separation", 6)
	quests_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	quests_box.visible = false
	content.add_child(quests_box)


func set_quests(list: Array) -> void:
	## list: [{name, desc, p, n, done}]（受注中で報告前のもの）。screen.renderQuests にあたる。
	quests_list = list
	_render_quests()


func _render_quests() -> void:
	var parts: PackedStringArray = []
	for q in quests_list:
		parts.append("%s|%s|%s|%s|%s" % [q.get("name", ""), q.get("desc", ""), q.get("p", 0), q.get("n", 0), q.get("done", false)])
	var signature := "\n".join(parts)
	if signature == quests_signature:
		return
	quests_signature = signature
	for child in quests_box.get_children():
		quests_box.remove_child(child)
		child.queue_free()
	quests_box.visible = quests_list.size() > 0
	if quests_list.is_empty():
		return
	quests_box.add_child(_label("クエスト", 12, Color.html("#8fa0b8")))   # .dim: style.css L12
	for q in quests_list:
		var done := bool(q.get("done", false))
		var row := VBoxContainer.new()
		row.add_theme_constant_override("separation", 0)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var top := HBoxContainer.new()
		top.add_theme_constant_override("separation", 6)
		top.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var mark := _label("◆", 9, Color.html("#ffd27a"))   # #nav #quests .qi b::before
		top.add_child(mark)
		var title := _bold_label(String(q.get("name", "")), 12, Color.html("#ffd84a") if done else Color.html("#e8eef8"))
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.clip_text = true
		top.add_child(title)
		var prog := _label("達成！報告しよう" if done else "%d / %d" % [int(q.get("p", 0)), int(q.get("n", 0))], 12, Color.html("#ffd84a") if done else Color.html("#6ad0ff"))
		top.add_child(prog)
		row.add_child(top)
		var desc := _label(String(q.get("desc", "")), 10, Color.html("#8fa0b8"))
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.custom_minimum_size.x = 220.0
		row.add_child(desc)
		quests_box.add_child(row)


func _build_topbar() -> void:
	# #topbar: public/style.css L478-482、index.html L57-62。右 16・上 16、丸 42px、隙間 10px、記号 19px、キー表示 9px（下 -15px）。
	topbar = HBoxContainer.new()
	topbar.name = "Topbar"
	topbar.add_theme_constant_override("separation", 10)
	topbar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(topbar)
	for spec in [["inv", "🎒", "I", "装備（I）"], ["tree", "✧", "K", "スキルツリー（K）"], ["map", "🗺", "M", "エリアマップ（M）"], ["set", "⚙", "Esc", "設定（Esc）"]]:
		var btn := TopButton.new()
		btn.name = "Top_" + String(spec[0])
		btn.tooltip_text = String(spec[3])
		var glyph := _label(String(spec[1]), 19, Color.html("#e8eef8"))
		glyph.label_settings.shadow_color = Color.TRANSPARENT
		glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		glyph.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		glyph.position = Vector2.ZERO
		glyph.size = Vector2(42.0, 42.0)
		btn.add_child(glyph)
		var kbd := PanelContainer.new()
		kbd.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var kstyle := StyleBoxFlat.new()
		kstyle.bg_color = Color(0.0, 0.0, 0.0, 0.5)
		kstyle.set_corner_radius_all(4)
		kstyle.content_margin_left = 4.0
		kstyle.content_margin_right = 4.0
		kstyle.content_margin_top = 0.0
		kstyle.content_margin_bottom = 0.0
		kbd.add_theme_stylebox_override("panel", kstyle)
		var klabel := _label(String(spec[2]), 9, Color.html("#8fa0b8"))
		klabel.label_settings.shadow_color = Color.TRANSPARENT
		kbd.add_child(klabel)
		btn.add_child(kbd)
		kbd.reset_size()
		kbd.position = Vector2((42.0 - kbd.size.x) * 0.5, 42.0 + 15.0 - kbd.size.y)
		# #sp-badge: public/style.css L483。右上 -4px、最小幅・高さ16px、背景 #ff5a4a。
		if String(spec[0]) == "tree":
			var badge := PanelContainer.new()
			badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var bstyle := StyleBoxFlat.new()
			bstyle.bg_color = Color.html("#ff5a4a")
			bstyle.set_corner_radius_all(8)
			bstyle.content_margin_left = 4.0
			bstyle.content_margin_right = 4.0
			bstyle.content_margin_top = 0.0
			bstyle.content_margin_bottom = 0.0
			badge.add_theme_stylebox_override("panel", bstyle)
			badge.custom_minimum_size = Vector2(16.0, 16.0)
			var blabel := _label("", 10, Color.WHITE)
			blabel.label_settings.shadow_color = Color.TRANSPARENT
			blabel.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			badge.add_child(blabel)
			badge.position = Vector2(42.0 + 4.0 - 16.0, -4.0)
			badge.visible = false
			btn.add_child(badge)
			btn.badge = blabel
		btn.pressed.connect(_on_top_button.bind(String(spec[0])))
		topbar.add_child(btn)
		top_buttons[String(spec[0])] = btn


func _build_panels() -> void:
	map_panel = GameMapPanel.new()
	map_panel.name = "MapPanelHost"
	content.add_child(map_panel)
	map_panel.build(game)
	map_panel.warp_requested.connect(game._map_warp)
	map_panel.pin_requested.connect(game._map_pin)
	settings_panel = GameSettingsPanel.new()
	settings_panel.name = "SettingsPanelHost"
	content.add_child(settings_panel)
	settings_panel.build(game)
	settings_panel.setting_changed.connect(game._set_setting)


## 上のボタン。持ち物は inventory_panel.gd を開閉し、ほかの画面は準備中と知らせる。
func _on_top_button(which: String) -> void:
	print("HUD top button ", which)
	if which == "inv" and game.items != null:
		game._toggle_inventory()
		return
	if which == "tree":
		game._toggle_tree()
		return
	if which == "map":
		game._toggle_map()
		return
	if which == "set":
		game._toggle_settings()


func update() -> void:
	if game == null or game.me.is_empty() or game.S.is_empty():
		return
	content.visible = bool(game.started)
	if not game.started or game.area.is_empty():
		return
	if map_panel != null: map_panel.tick()
	var me: Dictionary = game.me
	var stats: Dictionary = game.S
	var character: Dictionary = game.ch
	var screen: Vector2 = _screen_size()
	_update_tree_badge(character, stats)

	labels.lv.text = "Lv %d" % int(character.get("lv", 1))
	labels.name.text = String(character.get("name", ""))
	labels.hp.text = "%d / %d%s" % [ceili(float(me.get("hp", 0.0))), int(stats.get("mhp", 1)), "（這いずり中）" if bool(me.get("crawl", false)) else ""]
	var hp_ratio := clampf(float(me.get("hp", 0.0)) / maxf(1.0, float(stats.get("mhp", 1))), 0.0, 1.0)
	bars.hp.set_value(hp_ratio, hp_ratio < 0.3)
	var max_level: int = GameRules.data()["levels"].size()
	var xp_ratio := 1.0
	if int(character.get("lv", 1)) < max_level:
		xp_ratio = clampf(float(character.get("xp", 0)) / maxf(1.0, float(GameRules.xp_to_next(int(character.get("lv", 1))))), 0.0, 1.0)
	bars.xp.set_value(xp_ratio)
	_update_buffs(me, stats)
	_update_hotbar(me, stats, character)
	_update_gold(character, screen)
	_update_charge(me, stats)
	_update_prompt()
	_update_stamina(me, stats, screen)
	_update_death(me)
	_layout_vitals(screen)
	_update_nav(screen)


func _update_nav(screen: Vector2) -> void:
	# hud.js L55: 名前が「第」で始まらなければ「第N層 名前」
	var area_name := String(game.area.get("name", ""))
	floor_label.text = area_name if area_name.begins_with("第") else "第%d層 %s" % [int(game.area.get("floor", 1)), area_name]
	minimap.tick_explore(game)
	var now_s := Time.get_ticks_msec() / 1000.0
	if now_s - minimap_t >= 1.0 / 15.0:
		minimap_t = now_s
		minimap.build_shapes(game)
	_render_quests()
	var tb_size := topbar.get_combined_minimum_size()
	topbar.size = tb_size
	topbar.position = Vector2(screen.x - 16.0 - tb_size.x, 16.0)


func _update_hotbar(me: Dictionary, stats: Dictionary, character: Dictionary) -> void:
	var active: Dictionary = stats.get("actives", {})
	var items: Array = character.get("slots", [null, null])
	var visible_entries: Array = []
	var guard_enabled := bool(stats.get("guard", false))
	var guard_slot: Dictionary = slot_data.guard
	guard_slot.root.visible = guard_enabled
	if guard_enabled:
		guard_slot.name.text = "溜め中ガード"
		guard_slot.icon.texture = _icon("tag_shield")
		_set_slot(guard_slot, 0.0, 1.0, false, bool(me.get("guarding", false)))
		visible_entries.append(guard_slot)

	var potion: Dictionary = slot_data.pot
	potion.count.text = str(int(me.get("potions", 0)))
	potion.count.visible = true
	var pot_left := float(me.get("potCd", 0.0)) if int(me.get("potions", 0)) > 0 else 1.0
	_set_slot(potion, pot_left, 1.0, int(me.get("potions", 0)) > 0, false)
	visible_entries.append(potion)

	var dodge: Dictionary = slot_data.dodge
	dodge.name.text = "回避・" + String(stats.get("wc", {}).get("name", "普通"))
	dodge.name.label_settings.font_color = Color.from_string(String(stats.get("wc", {}).get("color", "#c8cfdc")), Color.html("#c8cfdc"))
	var dodge_max := maxf(0.001, float(stats.get("dodgeCd", 1.0)))
	_set_slot(dodge, float(me.get("dodgeCd", 0.0)), dodge_max, true, false)
	visible_entries.append(dodge)

	for i in range(2):
		var key := "t%d" % (i + 1)
		var entry: Dictionary = slot_data[key]
		var id = items[i] if i < items.size() else null
		var skill_id := String(id) if id != null else ""
		var is_usable := skill_id != "" and active.has(skill_id)
		var skill: Dictionary = GameRules.data()["skills"]["tree"].get(skill_id, {})
		entry.name.text = String(skill.get("name", "未設定")) if skill_id != "" else "未設定"
		entry.icon.texture = _icon(_skill_icon(skill_id))
		var cooldown := float(me.get("tcd", {}).get(skill_id, 0.0)) if is_usable else 1.0
		var cooldown_max: float = float(game.combat.skill_cd(skill_id)) if is_usable else 1.0
		_set_slot(entry, cooldown, cooldown_max, is_usable, false)
		visible_entries.append(entry)

	var skill_slot: Dictionary = slot_data.skill
	skill_slot.name.text = String(stats.get("ws", {}).get("name", "武器スキル"))
	skill_slot.icon.texture = _icon(_weapon_icon(String(stats.get("wk", "sword")), String(stats.get("skill", ""))))
	var skill_max := maxf(0.001, float(stats.get("ws", {}).get("cd", 1.0)) * (1.0 - float(stats.get("cdr", 0.0)) / 100.0))
	_set_slot(skill_slot, float(me.get("wsCd", 0.0)), skill_max, true, false)
	visible_entries.append(skill_slot)

	var total := 0.0
	for entry in visible_entries:
		total += float(entry.width)
	if visible_entries.size() > 1:
		total += 10.0 * float(visible_entries.size() - 1)
	var cursor: float = _screen_size().x - 22.0 - total
	for entry in visible_entries:
		entry.root.position = Vector2(cursor, _screen_size().y - 36.0 - 60.0)
		cursor += float(entry.width) + 10.0


func _set_slot(entry: Dictionary, left: float, max_time: float, is_usable: bool, active_now: bool) -> void:
	var remaining := maxf(0.0, left)
	var ratio := clampf(remaining / maxf(0.001, max_time), 0.0, 1.0)
	entry.root.set_state(remaining <= 0.0 and is_usable, not is_usable)
	entry.shade.set_amount(ratio)
	entry.seconds.visible = remaining > 0.0 and is_usable
	entry.seconds.text = "%.1f" % remaining if remaining > 0.0 else ""
	if active_now:
		entry.root.plate.border_color = Color.html("#9ad8ff")
		entry.root.queue_redraw()


func _update_gold(character: Dictionary, screen: Vector2) -> void:
	var amount := int(character.get("gold", 0))
	labels.gold.text = _format_gold(amount)
	gold_panel.reset_size()
	var size := gold_panel.get_combined_minimum_size()
	gold_panel.size = size
	gold_panel.pivot_offset = size * 0.5
	gold_panel.position = Vector2(screen.x - 232.0 - size.x, 24.0)
	if amount > last_gold and last_gold >= 0:
		var tween := gold_panel.create_tween()
		tween.tween_property(gold_panel, "scale", Vector2(1.15, 1.15), 0.06)
		tween.tween_property(gold_panel, "scale", Vector2.ONE, 0.10)
	last_gold = amount


func _update_charge(me: Dictionary, stats: Dictionary) -> void:
	var charging := bool(me.get("charging", false)) and float(me.get("chargeT", 0.0)) >= GameCombat.charge_min()
	charge_box.visible = charging and not bool(me.get("dead", false))
	if not charging:
		return
	var maximum := maxf(GameCombat.charge_min() + 0.001, float(stats.get("chargeMax", 1.0)))
	var fraction := clampf((float(me.get("chargeT", 0.0)) - GameCombat.charge_min()) / (maximum - GameCombat.charge_min()), 0.0, 1.0)
	charge_fill.set_value(fraction, false, int(me.get("chargeLv", 0)) == 2)
	var heavy: Dictionary = GameRules.data()["skills"]["heavy"].get(String(stats.get("wk", "sword")), {})
	labels.charge.text = String(heavy.get("name", "溜め攻撃"))
	var point: Vector2 = game.cam.unproject_position(Vector3(float(me.get("x", 0.0)), game.world.ground_y(float(me.get("x", 0.0)), float(me.get("z", 0.0))) + 1.4, float(me.get("z", 0.0))))
	charge_box.position = Vector2(point.x - 55.0, point.y + 34.0)
	charge_box.size = Vector2(110.0, 24.0)


func _update_prompt() -> void:
	var me: Dictionary = game.me
	if bool(me.get("dead", false)) or bool(game._modal_panel_open()):
		prompt_panel.visible = false
		return
	var interaction: Variant = game._nearest_interact()
	var message := String(interaction.get("label", "")) if interaction is Dictionary else ""
	prompt_panel.visible = message != ""
	if message != "":
		labels.prompt.text = message
		prompt_panel.reset_size()
		var size := prompt_panel.get_combined_minimum_size()
		prompt_panel.size = size
		prompt_panel.position = Vector2(_screen_size().x * 0.60, _screen_size().y * 0.54)


func _update_stamina(me: Dictionary, stats: Dictionary, screen: Vector2) -> void:
	var guarding := bool(stats.get("guard", false)) and (bool(me.get("guarding", false)) or float(me.get("gg", 100.0)) < 100.0)
	var maximum := maxf(0.001, float(stats.get("dodgeCd", 0.0)))
	var fraction := clampf(float(me.get("gg", 100.0)) / 100.0, 0.0, 1.0) if guarding else (1.0 - clampf(float(me.get("dodgeCd", 0.0)) / maximum, 0.0, 1.0) if float(stats.get("dodgeCd", 0.0)) > 0.0 else 1.0)
	if fraction < 1.0 or guarding:
		stamina_seen = float(game.t_now)
	var visible := float(game.t_now) - stamina_seen < 0.6 and not bool(me.get("dead", false))
	stamina_ring.visible = visible
	if not visible:
		return
	var ring_size := 40.0 if guarding else 34.0
	stamina_ring.size = Vector2(ring_size, ring_size)
	var world_pos := Vector3(float(me.get("x", 0.0)), game.world.ground_y(float(me.get("x", 0.0)), float(me.get("z", 0.0))) + 1.4, float(me.get("z", 0.0)))
	var point: Vector2 = game.cam.unproject_position(world_pos)
	if game.cam.is_position_behind(world_pos):
		stamina_ring.visible = false
		return
	stamina_ring.position = Vector2(point.x + 44.0 - ring_size * 0.5, point.y - 52.0 - ring_size * 0.5)
	stamina_ring.set("fraction", fraction)
	stamina_ring.set("guard", guarding)
	stamina_ring.set("full", fraction >= 1.0 and not guarding)
	stamina_ring.queue_redraw()


func _update_death(me: Dictionary) -> void:
	var dead := bool(me.get("dead", false))
	death_overlay.visible = dead
	if dead:
		labels.death_t.text = "キャラクターデータ消失。%.1f 秒後に新規キャラ作成へ" % maxf(0.0, float(me.get("deathAt", 0.0)) - float(game.t_now))


func _update_buffs(me: Dictionary, stats: Dictionary) -> void:
	var values: Array[Dictionary] = []
	for buff in me.get("buffs", []):
		var data: Dictionary = buff
		values.append({"id": String(data.get("id", "")), "label": String(data.get("label", "")), "time": float(data.get("t", 0.0)), "color": _color_from_int(data.get("color", 0xffffff)), "icon": _buff_icon(String(data.get("id", "")), data.get("mods", {}))})
	if int(me.get("dStack", 0)) > 0:
		values.append({"id": "dStack", "label": "連撃 攻速+%d%%" % (int(me.get("dStack", 0)) * int(stats.get("dStackPer", 0))), "time": 0.0, "color": Color.html("#99ffee"), "icon": "tag_move"})
	if bool(me.get("crawl", false)):
		values.append({"id": "crawl", "label": "這いずり中", "time": 0.0, "color": Color.html("#ff9a8a"), "icon": "tag_hurt"})
	if bool(me.get("guarding", false)) and bool(me.get("counter", false)):
		values.append({"id": "counter", "label": "カウンター準備", "time": 0.0, "color": Color.html("#bfe0ff"), "icon": "tag_shield"})
	var parts: PackedStringArray = []
	for value in values:
		parts.append("%s|%s|%s" % [value.id, value.label, value.color.to_html()])
	var signature := "\n".join(parts)
	if signature != buff_signature:
		for child in buffs.get_children():
			buffs.remove_child(child)
			child.queue_free()
		buff_rows.clear()
		buff_signature = signature
		for value in values:
			var row := _make_buff_row(value)
			buff_rows.append(row)
			buffs.add_child(row.root)
	for i in range(mini(values.size(), buff_rows.size())):
		var value: Dictionary = values[i]
		var row: Dictionary = buff_rows[i]
		row.timer.text = "%.1fs" % float(value.time) if float(value.time) <= 1000000.0 and float(value.time) > 0.0 else ""


func _update_tree_badge(character: Dictionary, stats: Dictionary) -> void:
	var button: TopButton = top_buttons.get("tree")
	if button == null or button.badge == null:
		return
	var wk := String(stats.get("wk", "sword"))
	var legacy_left := maxi(0, int(character.get("lv", 1)) - 1 - int(game._tree_spent_total()))
	var weapon_left := maxi(0, int(GameWTree.wt_left(character, wk))) if GameWTree.has_wtree(wk) else 0
	var left := legacy_left + weapon_left # public/js/ui/panels/hud.js: spTotal - spSpent + wtLeft
	button.badge.text = str(left)
	var badge_box := button.badge.get_parent() as PanelContainer
	badge_box.reset_size()
	badge_box.visible = left > 0
	badge_box.position = Vector2(46.0 - badge_box.size.x, -4.0)


func _make_buff_row(value: Dictionary) -> Dictionary:
	# #buffs: public/style.css 497。中央揃え、gap 4px 8px、文字 11px。
	var root := HBoxContainer.new()
	root.add_theme_constant_override("separation", 3)
	root.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(16.0, 16.0)
	icon.size = icon.custom_minimum_size
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture = _icon(String(value.icon))
	root.add_child(icon)
	var title := _label(String(value.label), 11, value.color)
	root.add_child(title)
	var timer := _label("", 11, value.color)
	root.add_child(timer)
	return {"root": root, "icon": icon, "title": title, "timer": timer}


func _buff_icon(id: String, mods) -> String:
	if icon_index.has(id):
		return id
	if id.contains("poison"): return "tag_poison"
	if id.contains("dodge"): return "tag_dodge"
	if id.contains("guard") or id.contains("fort") or mods.has("dr"): return "tag_shield"
	if id.contains("blood"): return "tag_blood"
	if mods.has("chargeRate"): return "tag_charge"
	if mods.has("move"): return "tag_move"
	if mods.has("crit") or mods.has("atkp"): return "tag_crit"
	return "tag_light"


## スロットの技 id → アイコンの鍵。アイコンは武器ツリーのノード id（ax_stomp など）で作ってあるので、旧ツリーの id（warstomp など）は
## ① 同じ名前の技 ② 接頭辞の読み替え（axe_→ax_ …）③ 対応する印、の順で探す。見つからないときだけ tag_light。
const SKILL_PREFIX := {"axe_": "ax_", "bow_": "bw_", "dagger_": "dk_", "spear_": "sp_", "gs_": "gt_", "sword_": "sw_"}
const SKILL_FALLBACK := {  # 絵の無い旧ツリーの技: 効果に近い印
	"focus": "tag_charge", "slant": "tag_thrust", "brave": "tag_recv", "fortress": "tag_shield", "javelin": "tag_throw", "whirl": "tag_zone",
	"afterimage": "tag_dodge", "warcry": "tag_cd", "berserk": "tag_blood", "spear_press": "sp_bash", "dagger_quicken": "tag_move",
}
var skill_icon_cache := {}


func _skill_icon(id: String) -> String:
	if id == "":
		return "tag_light"
	if skill_icon_cache.has(id):
		return skill_icon_cache[id]
	var found := ""
	if icon_index.has(id):
		found = id
	else:
		var tree: Dictionary = GameRules.data()["skills"]["tree"]
		var nm := String(tree.get(id, {}).get("name", ""))
		for key in tree.keys():
			if key != id and icon_index.has(key) and String(tree[key].get("name", "")) == nm and nm != "":
				found = key
				break
		if found == "":
			for prefix in SKILL_PREFIX.keys():
				if id.begins_with(prefix) and icon_index.has(SKILL_PREFIX[prefix] + id.substr(prefix.length())):
					found = SKILL_PREFIX[prefix] + id.substr(prefix.length())
					break
		if found == "":
			var fb := String(SKILL_FALLBACK.get(id, "tag_light"))
			found = fb if icon_index.has(fb) else "tag_light"
	skill_icon_cache[id] = found
	return found


func _weapon_icon(kind: String, skill_id: String) -> String:
	if icon_index.has(skill_id):
		return skill_id
	var icons := {"sword": "sw_aircut", "greatsword": "gt_rising", "dagger": "dk_step", "spear": "sp_spear", "axe": "ax_hook", "bow": "bw_double"}
	return String(icons.get(kind, "tag_light"))


func _icon(key: String) -> Texture2D:
	if icon_cache.has(key):
		return icon_cache[key]
	var texture: Texture2D = null
	var entry = icon_index.get(key)
	if entry is Dictionary and entry.has("file"):
		texture = load("res://assets/icons/" + String(entry.file)) as Texture2D
	icon_cache[key] = texture
	return texture


func _color_from_int(value) -> Color:
	var hex := "%06x" % (int(value) & 0xffffff)
	return Color.html("#" + hex)


func _layout_vitals(screen: Vector2) -> void:
	var width := minf(380.0, screen.x * 0.30)
	vitals.custom_minimum_size.x = width
	vitals.size = Vector2(width, 160.0)
	var height := vitals.get_combined_minimum_size().y
	vitals.size = Vector2(width, height)
	vitals.position = Vector2((screen.x - width) * 0.5, screen.y - 20.0 - height)


func _format_gold(amount: int) -> String:
	var value := str(maxi(0, amount))
	var grouped := ""
	while value.length() > 3:
		grouped = "," + value.right(3) + grouped
		value = value.left(value.length() - 3)
	return value + grouped


func _label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := LabelSettings.new()
	style.font_size = font_size
	style.font_color = color
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.85)
	style.shadow_size = 2
	style.shadow_offset = Vector2(0.0, 2.0)
	label.label_settings = style
	return label


func add_panel_backdrop(host: Control) -> ColorRect:
	# public/style.css .panel の rgba 背景と backdrop-filter: blur(6px) を再現する。
	var backdrop := ColorRect.new()
	backdrop.name = "PanelBackdrop"
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := Shader.new()
	shader.code = """
shader_type canvas_item;
uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;
uniform vec2 panel_size = vec2(760.0, 586.0);
uniform vec4 panel_tint : source_color = vec4(0.0470588, 0.0705882, 0.1254902, 0.72);
uniform float blur_lod : hint_range(0.0, 4.0, 0.1) = 2.6;
void fragment() {
	vec2 half_size = panel_size * 0.5;
	vec2 q = abs(UV * panel_size - half_size) - (half_size - vec2(9.0));
	float corner = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 9.0;
	if (corner > 0.0) discard;
	vec3 scene = textureLod(screen_texture, SCREEN_UV, blur_lod).rgb;
	COLOR = vec4(mix(scene, panel_tint.rgb, panel_tint.a), 1.0);
}
"""
	var material := ShaderMaterial.new()
	material.shader = shader
	if game != null and game.args.has("blur-lod"):
		material.set_shader_parameter("blur_lod", clampf(float(game.args["blur-lod"]), 0.0, 4.0))
	backdrop.material = material
	backdrop.visible = false
	host.add_child(backdrop)
	return backdrop


func _panel_style(border: Color, border_width: int, radius: int, left: float, top: float, right: float, bottom: float, shadow: Color = Color.TRANSPARENT, shadow_size: int = 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72)
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = left
	style.content_margin_top = top
	style.content_margin_right = right
	style.content_margin_bottom = bottom
	style.shadow_color = shadow
	style.shadow_size = shadow_size
	return style


func toast(text: String, color: Color = Color.WHITE, big: bool = false) -> void:
	if toast_stack == null:
		return
	var panel := PanelContainer.new()
	panel.name = "Toast"
	var style := _panel_style(color, 3 if not big else 5, 6, 16.0 if not big else 24.0, 6.0 if not big else 10.0, 16.0 if not big else 24.0, 6.0 if not big else 10.0, Color(color.r, color.g, color.b, 0.5) if big else Color.TRANSPARENT, 30 if big else 0)
	style.border_width_left = 3 if not big else 5
	style.border_width_top = 0
	style.border_width_right = 0
	style.border_width_bottom = 0
	style.bg_color = Color(0.0, 0.0, 0.0, 0.6)
	panel.add_theme_stylebox_override("panel", style)
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var label := _label(text, 14 if not big else 20, color)
	panel.add_child(label)
	toast_stack.add_child(panel)
	while toast_stack.get_child_count() > 5:
		var first := toast_stack.get_child(0)
		toast_stack.remove_child(first)
		first.queue_free()
	panel.modulate.a = 0.0
	var tween := panel.create_tween()
	tween.tween_property(panel, "modulate:a", 1.0, 0.48)
	tween.tween_interval(4.62)
	tween.tween_property(panel, "modulate:a", 0.0, 0.9)
	tween.tween_callback(panel.queue_free)


func banner(text: String, color: Color = Color.html("#bfe6ff")) -> void:
	if banner_main == null:
		return
	if text.is_empty():
		if banner_tween != null and banner_tween.is_running():
			banner_tween.kill()
		banner_top.text = ""
		banner_main.text = ""
		labels.banner.visible = false
		return
	var top := ""
	var main := text
	var parts := text.split("  ", false, 1)
	if parts.size() == 2:
		top = parts[0].strip_edges()
		main = parts[1].strip_edges()
	else:
		parts = text.split("　", false, 1)
		if parts.size() == 2:
			top = parts[0].strip_edges()
			main = parts[1].strip_edges()
	banner_top.text = top
	banner_top.visible = top != ""
	banner_main.text = main
	banner_main.label_settings.font_color = color
	if banner_tween != null and banner_tween.is_running():
		banner_tween.kill()
	var screen: Vector2 = _screen_size()
	banner_top.position = Vector2(0.0, screen.y * 0.30)
	banner_top.size = Vector2(screen.x, 24.0)
	banner_main.position = Vector2(0.0, screen.y * 0.30 + (22.0 if top != "" else 0.0))
	banner_main.size = Vector2(screen.x, 70.0)
	banner_main.pivot_offset = banner_main.size * 0.5
	labels.banner.visible = true
	labels.banner.scale = Vector2(1.15, 1.15)
	banner_main.modulate.a = 0.0
	banner_top.modulate.a = 0.0
	banner_tween = labels.banner.create_tween()
	banner_tween.tween_property(banner_main, "modulate:a", 1.0, 0.6)
	banner_tween.parallel().tween_property(banner_top, "modulate:a", 1.0, 0.6)
	banner_tween.parallel().tween_property(labels.banner, "scale", Vector2.ONE, 0.6)
	banner_tween.tween_interval(3.4)
	banner_tween.tween_property(banner_main, "modulate:a", 0.0, 1.0)
	banner_tween.parallel().tween_property(banner_top, "modulate:a", 0.0, 1.0)
	banner_tween.tween_callback(func(): labels.banner.visible = false)


func _screen_size() -> Vector2:
	return content.get_viewport_rect().size if content != null else Vector2(1532.0, 869.0)
