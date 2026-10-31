class_name GameInventoryPanel
extends RefCounted
## ブラウザ版 #inv と #tooltip の表示・入力を移す。
## 配置と装飾の値は public/style.css L9-13, L108-142, L514-530、
## セル・説明の内容は public/js/ui/panels/inventory.js と items.js を参照。

const TEXT_COLOR := Color(232.0 / 255.0, 238.0 / 255.0, 248.0 / 255.0)
const DIM_COLOR := Color(143.0 / 255.0, 160.0 / 255.0, 184.0 / 255.0)
const LINE_COLOR := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
const TITLE_DETAILS := {
	"t_boss1": {"desc": "ボスへのダメージ +15%", "src": "第1層ボスの初討伐"},
	"t_boss2": {"desc": "毒沼・流砂の影響を受けない。継続ダメージ -50%", "src": "第2層ボスの初討伐"},
	"t_boss3": {"desc": "HPが50%以下の間、移動速度 +25%・攻撃速度 +15%", "src": "第3層ボスの初討伐"},
	"t_lake": {"desc": "ゴールド獲得 +30%。硬貨を吸い寄せる範囲が2倍", "src": "ヌシ・ギガスライムの討伐"},
	"t_shark": {"desc": "精鋭・ネームド・ボスへの会心率 +15%", "src": "砂鮫ギルガの討伐"},
	"t_wind": {"desc": "回避した後の1.5秒間、移動速度 +40%", "src": "クエスト「猪狩り」"},
	"t_blood": {"desc": "敵を倒すとHPを6%回復する", "src": "クエスト「霧の狼」", "req": "melee"},
	"t_hawk": {"desc": "最大まで引いた矢は会心率 +30%", "src": "クエスト「砂の巨人」", "req": "bow"},
	"t_guard": {"desc": "ガードカウンターを出すと4秒間 被ダメージ -40%", "src": "クエスト「スライム退治」", "req": "spear"},
	"t_phoenix": {"desc": "倒れたとき、その場でHP30%で一度だけ復活する（5分に1回）", "src": "クエスト「砂塵の王」"},
	"t_delver": {"desc": "ダンジョン・迷宮区の中で移動速度 +15%", "src": "クエスト「古井戸の調査」"},
	"t_mapper": {"desc": "迷宮・ダンジョンの自動マッピングの範囲が2倍。宝箱がミニマップに遠くから映る", "src": "クエスト「迷宮区の主」"},
	"t_traveler": {"desc": "エリアを移動・ワープした後の10秒間、移動速度 +30%", "src": "クエスト「霧の向こうへ」"},
	"t_treasure": {"desc": "宝箱を開けるとゴールドを追加で得て、HPが30%回復する", "src": "クエスト「樹洞の秘宝」"},
	"t_breaker": {"desc": "ボスのスタン値の溜まり方 +30%。スタン中のボスへのダメージ +15%", "src": "クエスト「大樹の守り手」"},
	"t_relic": {"desc": "被ダメージ -8%。ひるみにくくなる", "src": "クエスト「埋もれた神殿」"},
	"t_night": {"desc": "ダンジョン・迷宮区の中で会心率 +10%", "src": "クエスト「洞窟の羽音」"},
	"t_spore": {"desc": "ポーションの回復量 +40%", "src": "クエスト「毒キノコ採り」"},
	"t_spell": {"desc": "弾（遠距離攻撃）から受けるダメージ -35%", "src": "クエスト「まじない師の影」"},
	"t_shell": {"desc": "近接のみ。被ダメージ -12%。正面から受けたときの割り増しがなくなる", "src": "クエスト「大蠍の尾」", "req": "melee"},
	"t_lucky": {"desc": "会心率 +8%・ゴールド獲得 +15%", "src": "どの敵からも、ごくまれに落ちる"},
	"t_reaper": {"desc": "HPが30%以下の敵へのダメージ +25%", "src": "精鋭からまれに落ちる"},
	"t_berserk": {"desc": "近接のみ。与ダメージ +20%・被ダメージ +15%", "src": "ネームドからまれに落ちる", "req": "melee"},
	"t_star": {"desc": "武器スキルのクールタイム -20%。武器スキルが当たると流れ星が降る", "src": "階層ボスからまれに落ちる"},
	"t_storm": {"desc": "雨・霧・砂嵐のエリアで移動速度 +15%・攻撃速度 +10%", "src": "天候のあるエリアの敵からまれに落ちる"},
	"t_hunter": {"desc": "雑魚（精鋭でない敵）へのダメージ +15%", "src": "狩場の敵からまれに落ちる"},
}
const UNIQUE_EFFECTS := {
	"wave": "コンボ3段目が光の斬撃波となって飛ぶ",
	"thunder": "会心時、対象に落雷（周囲にダメージ）",
	"vamp": "与ダメージの4%を吸収",
	"aegis": "25%の確率で被ダメージを無効化",
	"mirror": "ジャスト回避で衝撃波＋5秒間ダメージ1.5倍",
	"star": "スキルのクールタイム-35%",
	"skillcrit": "スキルが必ず会心になる",
	"flame": "攻撃が炎上し、周囲に延焼ダメージ",
}
const ARMOR_TYPE_NAMES := {
	"cloth": "布の服", "tunic": "革の胴着", "hunter": "狩人の外套", "robe": "魔導ローブ",
	"ninja": "忍び装束", "bard": "吟遊詩人の衣", "leather": "革の鎧", "chain": "鎖帷子",
	"scale": "鱗鎧", "brigandine": "ブリガンダイン", "ranger": "遊撃兵の胸甲",
	"dragonhide": "竜革の鎧", "breast": "鉄の胸当て", "plate": "板金鎧", "knight": "騎士の甲冑",
	"oyoroi": "大鎧", "paladin": "聖騎士の鎧", "fortress": "城塞の重甲冑",
}
const TITLE_REQ_NAMES := {"melee": "近接武器のみ", "bow": "弓のみ", "spear": "盾槍のみ"}
const GLYPHS := {
	"sword": "剣", "greatsword": "大", "spear": "盾", "dagger": "短", "axe": "斧", "bow": "弓",
	"light": "衣", "medium": "鎧", "heavy": "甲", "acc": "飾", "title": "銘",
}

class WeightBar extends Control:
	var fraction := 0.0
	var fill_color := Color.WHITE
	var track_style := StyleBoxFlat.new()
	var fill_style := StyleBoxFlat.new()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		# public/style.css .wbar: 5px bar + 2px 上 + 4px 下の余白。
		custom_minimum_size.y = 11.0
		track_style.bg_color = Color(1.0, 1.0, 1.0, 0.12)
		track_style.set_corner_radius_all(3)
		fill_style.set_corner_radius_all(3)

	func set_value(value: float, color: Color) -> void:
		fraction = clampf(value, 0.0, 1.0)
		fill_color = color
		fill_style.bg_color = color
		queue_redraw()

	func _draw() -> void:
		var rect := Rect2(Vector2(0.0, 2.0), Vector2(size.x, 5.0))
		draw_style_box(track_style, rect)
		if fraction > 0.0:
			draw_style_box(fill_style, Rect2(Vector2(0.0, 2.0), Vector2(size.x * fraction, 5.0)))


class ItemCell extends PanelContainer:
	signal item_action(item: Dictionary, button_index: int, is_equipped: bool, slot: String)
	signal tip_requested(item: Dictionary, position: Vector2, compare: bool)
	signal tip_moved(position: Vector2)
	signal tip_closed

	var item: Dictionary = {}
	var is_equipped := false
	var slot := ""
	var title_slot := false
	var rarity := 0
	var junk := false
	var transcendent := false
	var pulse := 0.0

	func configure(it: Dictionary, equipped: bool, slot_key: String, icon: Texture2D, glyph: String, item_name: String, subtitle: String, tint: Color, up: bool, title_cell: bool) -> void:
		item = it
		is_equipped = equipped
		slot = slot_key
		title_slot = title_cell
		rarity = int(it.get("rarity", 0)) if not it.is_empty() else -1
		junk = rarity == 0
		transcendent = false
		for affix in it.get("affixes", []):
			if affix is Array and affix.size() >= 2 and int(affix[1]) >= 6:
				transcendent = true
				break
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		custom_minimum_size = Vector2(0.0, 54.0) if equipped else Vector2(62.0, 62.0)
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var box := StyleBoxFlat.new()
		box.bg_color = Color(0.0, 0.0, 0.0, 0.4)
		box.border_color = Color.TRANSPARENT if title_cell else tint
		box.set_border_width_all(0 if title_cell else 2)
		box.set_corner_radius_all(8)
		box.content_margin_left = 10.0 if equipped else 0.0
		box.content_margin_right = 10.0 if equipped else 0.0
		add_theme_stylebox_override("panel", box)
		if not it.is_empty():
			if rarity == 0:
				modulate.a = 0.7
			if rarity == 7:
				set_process(true)
		var content := Control.new()
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(content)
		if equipped:
			_build_equipped(content, icon, glyph, item_name, subtitle, tint, it)
		elif not it.is_empty():
			_build_inventory(content, icon, glyph, item_name, tint, up, it)
		else:
			var empty := _make_label("なし", 13, Color.html("#666666"))
			empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			empty.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			content.add_child(empty)
		gui_input.connect(_on_gui_input)
		mouse_entered.connect(func() -> void:
			if not item.is_empty():
				tip_requested.emit(item, get_global_mouse_position(), not is_equipped)
		)
		mouse_exited.connect(func() -> void:
			tip_closed.emit()
		)

	func _build_equipped(content: Control, icon: Texture2D, glyph: String, item_name: String, subtitle: String, tint: Color, it: Dictionary) -> void:
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation", 10)
		row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.add_child(row)
		var mark := _make_icon(icon, glyph, 22, tint)
		mark.custom_minimum_size = Vector2(22.0, 22.0)
		row.add_child(mark)
		var words := VBoxContainer.new()
		words.mouse_filter = Control.MOUSE_FILTER_IGNORE
		words.add_theme_constant_override("separation", 0)
		words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(words)
		var name_row := HBoxContainer.new()
		name_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		name_row.add_theme_constant_override("separation", 4)
		words.add_child(name_row)
		var name := _make_label(item_name, 13, tint)
		name.clip_text = true
		name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_row.add_child(name)
		var enh := int(it.get("enh", 0))
		if enh > 0:
			var enh_label := _make_label("+%d" % enh, 12, Color.html("#ffe08a"))
			name_row.add_child(enh_label)
		var sub := _make_label(subtitle, 12, Color.html("#8fa0b8"))
		sub.clip_text = true
		words.add_child(sub)

	func _build_inventory(content: Control, icon: Texture2D, glyph: String, item_name: String, tint: Color, up: bool, it: Dictionary) -> void:
		var center := CenterContainer.new()
		center.mouse_filter = Control.MOUSE_FILTER_IGNORE
		center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.add_child(center)
		var stack := VBoxContainer.new()
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.alignment = BoxContainer.ALIGNMENT_CENTER
		stack.add_theme_constant_override("separation", 0)
		center.add_child(stack)
		var mark := _make_icon(icon, glyph, 22, tint)
		mark.custom_minimum_size = Vector2(22.0, 22.0)
		stack.add_child(mark)
		var name := _make_label(item_name, 9, tint)
		name.custom_minimum_size.x = 58.0
		name.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name.clip_text = true
		stack.add_child(name)
		if up:
			_add_corner_label(content, "▲", 11, Color.html("#55ff55"), false)
		if _has_skill_variant(it):
			_add_corner_label(content, "✧", 11, Color.html("#d8b0ff"), false)
		if String(it.get("slot", "")) != "title":
			_add_corner_label(content, str(it.get("ilvl", 1)), 9, Color.html("#8fa0b8"), true)
		if int(it.get("enh", 0)) > 0:
			var enh := _make_label("+%d" % int(it["enh"]), 10, Color.html("#ffe08a"))
			enh.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			enh.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
			enh.offset_left = -34.0
			enh.offset_top = -15.0
			enh.offset_right = -4.0
			enh.offset_bottom = -2.0
			content.add_child(enh)

	func _add_corner_label(content: Control, value: String, font_size: int, color: Color, right: bool) -> void:
		var label := _make_label(value, font_size, color)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if right else HORIZONTAL_ALIGNMENT_LEFT
		label.set_anchors_preset(Control.PRESET_TOP_RIGHT if right else Control.PRESET_TOP_LEFT)
		if right:
			label.offset_left = -31.0
			label.offset_top = 2.0
			label.offset_right = -4.0
			label.offset_bottom = 14.0
		else:
			label.offset_left = 4.0
			label.offset_top = 1.0
			label.offset_right = 22.0
			label.offset_bottom = 15.0
		content.add_child(label)

	func _make_icon(icon: Texture2D, glyph: String, font_size: int, color: Color) -> Control:
		if icon != null:
			var image := TextureRect.new()
			image.texture = icon
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			image.mouse_filter = Control.MOUSE_FILTER_IGNORE
			return image
		var label := _make_label(glyph, font_size, color)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		return label

	func _make_label(value: String, font_size: int, color: Color) -> Label:
		var label := Label.new()
		label.text = value
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.add_theme_font_size_override("font_size", font_size)
		label.add_theme_color_override("font_color", color)
		return label

	func _has_skill_variant(it: Dictionary) -> bool:
		for affix in it.get("affixes", []):
			if GameRules.data()["skillVariants"].has(String(affix[0])):
				return true
		return false

	func _on_gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and not item.is_empty():
			if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
				item_action.emit(item, event.button_index, is_equipped, slot)
				accept_event()
		elif event is InputEventMouseMotion and not item.is_empty():
			tip_moved.emit(get_global_mouse_position())

	func _process(dt: float) -> void:
		if rarity != 7:
			return
		pulse += dt
		var bright := 1.0 + 0.4 * (0.5 + 0.5 * sin(pulse * TAU / 1.4))
		modulate = Color(bright, bright, bright, 0.7 if junk else 1.0)

	func _draw() -> void:
		if not item.is_empty():
			var glow := Color.TRANSPARENT
			match rarity:
				5: glow = Color(1.0, 216.0 / 255.0, 74.0 / 255.0, 0.6)
				6: glow = Color(1.0, 154.0 / 255.0, 46.0 / 255.0, 0.7)
				7: glow = Color(1.0, 60.0 / 255.0, 100.0 / 255.0, 0.9)
			if glow.a > 0.0:
				draw_rect(Rect2(Vector2(4.0, 4.0), size - Vector2(8.0, 8.0)), glow, false, 1.0)
			if transcendent:
				var trans_color := Color(1.0, 122.0 / 255.0, 176.0 / 255.0, 0.55)
				draw_rect(Rect2(Vector2(4.0, 4.0), size - Vector2(8.0, 8.0)), trans_color, false, 1.0)
				draw_rect(Rect2(Vector2(6.0, 6.0), size - Vector2(12.0, 12.0)), trans_color, false, 1.0)
		if title_slot:
			var tint := GameItems.rarity_color(rarity)
			var step := 12.0
			for x in range(0, int(size.x), int(step)):
				draw_line(Vector2(x, 1.0), Vector2(minf(x + 6.0, size.x), 1.0), tint, 2.0, true)
				draw_line(Vector2(x, size.y - 1.0), Vector2(minf(x + 6.0, size.x), size.y - 1.0), tint, 2.0, true)
			for y in range(0, int(size.y), int(step)):
				draw_line(Vector2(1.0, y), Vector2(1.0, minf(y + 6.0, size.y)), tint, 2.0, true)
				draw_line(Vector2(size.x - 1.0, y), Vector2(size.x - 1.0, minf(y + 6.0, size.y)), tint, 2.0, true)


var g
var root: Control
var panel: PanelContainer
var header: HBoxContainer
var body: HBoxContainer
var left_scroll: ScrollContainer
var right_scroll: ScrollContainer
var left_content: VBoxContainer
var slot_rows := {}
var slot_cells := {}
var stats_box: PanelContainer
var stats_content: VBoxContainer
var grid: GridContainer
var auto_slider: HSlider
var auto_label: Label
var batch_button: Button
var tooltip: PanelContainer
var tooltip_content: VBoxContainer
var icon_index: Dictionary = {}
var icon_cache: Dictionary = {}
var updating_controls := false


func _init(game) -> void:
	g = game


func build_ui(parent: Control) -> void:
	root = parent
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://assets/icons/index.json"))
	icon_index = parsed if parsed is Dictionary else {}
	panel = PanelContainer.new()
	panel.name = "InventoryPanel"
	panel.visible = false
	panel.z_index = 20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72)
	style.border_color = LINE_COLOR
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	# public/style.css .panel: 1px border + 12px padding。
	style.content_margin_left = 13.0
	style.content_margin_right = 13.0
	style.content_margin_top = 13.0
	style.content_margin_bottom = 13.0
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 24
	style.shadow_offset = Vector2(0.0, 6.0)
	panel.add_theme_stylebox_override("panel", style)
	root.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)
	header = HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	column.add_child(header)
	var title := _label("装備 / インベントリ", 16, TEXT_COLOR)
	header.add_child(title)
	var hint := _label("クリック:装備　右クリック:分解", 12, DIM_COLOR)
	header.add_child(hint)
	var auto_group := HBoxContainer.new()
	auto_group.add_theme_constant_override("separation", 6)
	header.add_child(auto_group)
	var auto_title := _label("自動分解", 12, DIM_COLOR)
	auto_group.add_child(auto_title)
	auto_slider = HSlider.new()
	auto_slider.min_value = -1
	auto_slider.max_value = 4
	auto_slider.step = 1
	auto_slider.custom_minimum_size = Vector2(110.0, 20.0)
	auto_slider.tooltip_text = "このレアリティ以下の落とし物を、拾う前にゴールドと強化の欠片にします。称号・★付き・伝説以上は対象外です。"
	_style_slider(auto_slider)
	auto_slider.value_changed.connect(_on_auto_changed)
	auto_group.add_child(auto_slider)
	auto_label = _label("なし", 12, DIM_COLOR)
	auto_label.custom_minimum_size.x = 90.0
	auto_group.add_child(auto_label)
	batch_button = _button("一括分解")
	batch_button.pressed.connect(func() -> void: g.items.salvage_common())
	header.add_child(batch_button)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	var close_button := _button("×")
	close_button.custom_minimum_size = Vector2(32.0, 30.0)
	close_button.add_theme_font_size_override("font_size", 15)
	close_button.pressed.connect(close)
	header.add_child(close_button)

	body = HBoxContainer.new()
	# 左列の ScrollContainer が縦スクロール幅を確保するため、その分を引いて実効 gap を CSS の 14px に合わせる。
	body.add_theme_constant_override("separation", 6)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(body)
	left_scroll = ScrollContainer.new()
	left_scroll.name = "EquipmentAndStats"
	left_scroll.custom_minimum_size.x = 260.0
	left_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(left_scroll)
	left_content = VBoxContainer.new()
	left_content.add_theme_constant_override("separation", 8)
	left_content.custom_minimum_size.x = 260.0
	left_scroll.add_child(left_content)
	_build_equipment_rows()
	var stats_holder := MarginContainer.new()
	stats_holder.add_theme_constant_override("margin_top", 2)
	stats_holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_content.add_child(stats_holder)
	stats_box = PanelContainer.new()
	stats_box.name = "Stats"
	stats_box.custom_minimum_size.x = 260.0
	stats_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var stats_style := StyleBoxFlat.new()
	stats_style.bg_color = Color(0.0, 0.0, 0.0, 0.3)
	stats_style.set_corner_radius_all(8)
	stats_style.content_margin_left = 8.0
	stats_style.content_margin_right = 8.0
	stats_style.content_margin_top = 8.0
	stats_style.content_margin_bottom = 8.0
	stats_box.add_theme_stylebox_override("panel", stats_style)
	stats_holder.add_child(stats_box)
	stats_content = VBoxContainer.new()
	# public/style.css #stats の line-height:1.8 を各行の高さへ反映する。
	stats_content.add_theme_constant_override("separation", 0)
	stats_box.add_child(stats_content)

	right_scroll = ScrollContainer.new()
	right_scroll.name = "InventoryGridScroll"
	right_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(right_scroll)
	grid = GridContainer.new()
	grid.name = "InventoryGrid"
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.add_child(grid)

	tooltip = PanelContainer.new()
	tooltip.name = "ItemTooltip"
	tooltip.visible = false
	tooltip.z_index = 40
	tooltip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tooltip.custom_minimum_size.x = 280.0
	var tip_style := StyleBoxFlat.new()
	tip_style.bg_color = Color(8.0 / 255.0, 12.0 / 255.0, 22.0 / 255.0, 0.95)
	tip_style.border_color = LINE_COLOR
	tip_style.set_border_width_all(1)
	tip_style.set_corner_radius_all(8)
	tip_style.content_margin_left = 12.0
	tip_style.content_margin_right = 12.0
	tip_style.content_margin_top = 10.0
	tip_style.content_margin_bottom = 10.0
	tooltip.add_theme_stylebox_override("panel", tip_style)
	root.add_child(tooltip)
	tooltip_content = VBoxContainer.new()
	tooltip_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# public/style.css #tooltip の line-height:1.6 を考慮して、Label 間の行送りを取る。
	tooltip_content.add_theme_constant_override("separation", 5)
	tooltip.add_child(tooltip_content)

	refresh()
	if root.get_viewport() != null:
		root.get_viewport().size_changed.connect(_fit_panel)
	call_deferred("_fit_panel")


func _build_equipment_rows() -> void:
	var names := {"weapon": "武器", "armor": "防具", "acc": "装飾", "title": "称号"}
	for slot in ["weapon", "armor", "acc", "title"]:
		var row := HBoxContainer.new()
		row.name = "Equipment_" + slot
		row.add_theme_constant_override("separation", 10)
		left_content.add_child(row)
		var slot_label := _label(names[slot], 12, DIM_COLOR)
		slot_label.custom_minimum_size.x = 34.0
		row.add_child(slot_label)
		slot_rows[slot] = row
		var cell := ItemCell.new()
		cell.configure({}, true, slot, null, GLYPHS.get(slot, ""), "なし", "", Color.html("#666666"), false, slot == "title")
		row.add_child(cell)
		slot_cells[slot] = cell
		_connect_cell(cell)


func _fit_panel() -> void:
	if panel == null or root == null:
		return
	var viewport_size := root.get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	var panel_w := minf(820.0, viewport_size.x * 0.96)
	var max_h := viewport_size.y * 0.86
	var header_h := maxf(30.0, header.get_combined_minimum_size().y)
	var inner_w := panel_w - 26.0
	var right_w := inner_w - 260.0 - 14.0
	grid.columns = maxi(1, int(floor((right_w + 6.0) / 68.0)))
	var natural_body_h := maxf(left_content.get_combined_minimum_size().y, grid.get_combined_minimum_size().y)
	var body_h := minf(natural_body_h, maxf(100.0, max_h - header_h - 36.0))
	var panel_h := minf(max_h, body_h + header_h + 36.0)
	body.custom_minimum_size.y = body_h
	panel.custom_minimum_size = Vector2(panel_w, panel_h)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -panel_w * 0.5
	panel.offset_right = panel_w * 0.5
	panel.offset_top = -panel_h * 0.5
	panel.offset_bottom = panel_h * 0.5


func _refresh_equipment() -> void:
	var eq: Dictionary = g.ch.get("eq", {})
	for slot in ["weapon", "armor", "acc", "title"]:
		var old: ItemCell = slot_cells.get(slot)
		var item: Dictionary = eq.get(slot, {}) if eq.get(slot) is Dictionary else {}
		var new_cell := _make_cell(item, true, slot)
		var row: HBoxContainer = slot_rows[slot]
		if old != null:
			row.remove_child(old)
			old.queue_free()
		row.add_child(new_cell)
		slot_cells[slot] = new_cell


func refresh() -> void:
	if panel == null:
		return
	_refresh_equipment()
	for child in grid.get_children():
		grid.remove_child(child)
		child.queue_free()
	var inv = g.ch.get("inv", [])
	if inv is Array:
		for item in inv:
			if item is Dictionary:
				grid.add_child(_make_cell(item, false, String(item.get("slot", ""))))
	if grid.get_child_count() == 0:
		var empty := _label("アイテムなし。モンスターを倒そう！", 12, DIM_COLOR)
		empty.custom_minimum_size = Vector2(260.0, 62.0)
		grid.add_child(empty)
	_refresh_stats()
	var lim := int(g.ch.get("autoSalvage", -1))
	updating_controls = true
	auto_slider.value = clampi(lim, -1, 4)
	auto_label.text = _auto_label(lim)
	auto_label.add_theme_color_override("font_color", _rarity_color(lim) if lim >= 0 else DIM_COLOR)
	batch_button.text = "一括分解" if lim < 0 else "%s以下を一括分解" % _rarity_name(lim)
	batch_button.disabled = lim < 0
	batch_button.modulate.a = 0.45 if lim < 0 else 1.0
	updating_controls = false
	call_deferred("_fit_panel")


func toggle() -> void:
	if panel == null:
		return
	panel.visible = not panel.visible
	if panel.visible:
		g._sfx("ui")
		refresh()
		if g.args.has("inv-demo"):
			call_deferred("_show_demo_tooltip")
	else:
		hide_tooltip()
	g._sync_modal_ui()


func close() -> void:
	if panel == null:
		return
	panel.visible = false
	hide_tooltip()
	g._sync_modal_ui()


func _show_demo_tooltip() -> void:
	await root.get_tree().process_frame
	if not panel.visible or grid.get_child_count() == 0:
		return
	var cell := grid.get_child(0) as ItemCell
	if cell != null and not cell.item.is_empty():
		show_item_tooltip(cell.item, cell.global_position + cell.size * 0.5, true)
		call_deferred("_log_demo_layout")


func _log_demo_layout() -> void:
	if not g.args.has("inv-demo"):
		return
	var panel_rect := panel.get_global_rect()
	var stats_rect := stats_box.get_global_rect()
	var tooltip_rect := tooltip.get_global_rect()
	var grid_rect := grid.get_global_rect()
	var first_cell: ItemCell = null
	if grid.get_child_count() > 0:
		first_cell = grid.get_child(0) as ItemCell
	var first_cell_rect := first_cell.get_global_rect() if first_cell != null else Rect2()
	var viewport := root.get_viewport_rect().size
	var equipment: Dictionary = g.ch.get("eq", {})
	var left_minimum := left_content.get_combined_minimum_size()
	var grid_minimum := grid.get_combined_minimum_size()
	var column_minimum: Vector2 = (panel.get_child(0) as VBoxContainer).get_combined_minimum_size()
	var tier_badges := []
	for badge_node in tooltip.find_children("TierBadge", "PanelContainer", true, false):
		var badge_rect := (badge_node as Control).get_global_rect()
		tier_badges.append({"rect": [roundf(badge_rect.position.x), roundf(badge_rect.position.y), roundf(badge_rect.size.x), roundf(badge_rect.size.y)]})
	print("INV_UI_LAYOUT_JSON=", JSON.stringify({
		"viewport": [roundi(viewport.x), roundi(viewport.y)],
		"panel": [roundf(panel_rect.position.x), roundf(panel_rect.position.y), roundf(panel_rect.size.x), roundf(panel_rect.size.y)],
		"stats": [roundf(stats_rect.position.x), roundf(stats_rect.position.y), roundf(stats_rect.size.x), roundf(stats_rect.size.y)],
		"tooltip": [roundf(tooltip_rect.position.x), roundf(tooltip_rect.position.y), roundf(tooltip_rect.size.x), roundf(tooltip_rect.size.y)],
		"grid": [roundf(grid_rect.position.x), roundf(grid_rect.position.y), roundf(grid_rect.size.x), roundf(grid_rect.size.y)],
		"firstCell": [roundf(first_cell_rect.position.x), roundf(first_cell_rect.position.y), roundf(first_cell_rect.size.x), roundf(first_cell_rect.size.y)],
		"headerHeight": roundf(header.get_combined_minimum_size().y), "bodyHeight": roundf(body.size.y),
		"bodyMinimum": roundf(body.custom_minimum_size.y), "columnMinimum": [roundf(column_minimum.x), roundf(column_minimum.y)],
		"leftContentMinimum": [roundf(left_minimum.x), roundf(left_minimum.y)], "gridMinimum": [roundf(grid_minimum.x), roundf(grid_minimum.y)],
		"statsContent": [roundf(stats_content.size.x), roundf(stats_content.size.y)],
		"equipment": equipment.size(), "items": grid.get_child_count(), "gridColumns": grid.columns,
		"weight": float(g.S.get("weight", 0.0)), "tooltipVisible": tooltip.visible,
		"tierBadges": tier_badges, "panelZ": panel.z_index, "tooltipZ": tooltip.z_index,
		"toastsHidden": not g.hud_ui.toast_stack.visible,
	}))


func hide_tooltip() -> void:
	if tooltip != null:
		tooltip.visible = false


func _on_cell_action(item: Dictionary, button_index: int, equipped: bool, slot: String) -> void:
	hide_tooltip()
	if equipped:
		if button_index == MOUSE_BUTTON_LEFT:
			g.items.unequip(slot)
		return
	if button_index == MOUSE_BUTTON_LEFT:
		g.items.equip_item(item)
	elif button_index == MOUSE_BUTTON_RIGHT:
		g.items.salvage_item(item)


func _on_auto_changed(value: float) -> void:
	if updating_controls:
		return
	g.items.set_auto_salvage(value)


func _make_cell(item: Dictionary, equipped: bool, slot: String) -> ItemCell:
	var key := _icon_key(item, slot)
	var icon: Texture2D = _icon_for(key)
	var glyph := String(GLYPHS.get(key, "?"))
	var label := "なし"
	var subtitle := ""
	var tint := Color.html("#666666")
	var up := false
	if not item.is_empty():
		label = g.items.display_name(item)
		var rarity := clampi(int(item.get("rarity", 0)), 0, 7)
		tint = _rarity_color(rarity)
		if String(item.get("slot", "")) == "title":
			subtitle = "称号"
		else:
			subtitle = "iLv%d・重さ%s" % [int(item.get("ilvl", 1)), _format_num(GameRules.item_weight(item), 1)]
		if not equipped and String(item.get("slot", "")) != "title":
			var eq: Dictionary = g.ch.get("eq", {})
			var current = eq.get(String(item.get("slot", "")))
			up = g.items.item_power(item) > g.items.item_power(current)
	var cell := ItemCell.new()
	cell.configure(item, equipped, slot, icon, glyph, label, subtitle, tint, up, equipped and slot == "title")
	_connect_cell(cell)
	return cell


func _connect_cell(cell: ItemCell) -> void:
	cell.item_action.connect(_on_cell_action)
	cell.tip_requested.connect(show_item_tooltip)
	cell.tip_moved.connect(_move_tooltip)
	cell.tip_closed.connect(hide_tooltip)


func _icon_key(item: Dictionary, slot: String) -> String:
	if item.is_empty():
		return slot
	match String(item.get("slot", slot)):
		"weapon": return String(item.get("kind", ""))
		"armor": return String(item.get("armor", "medium"))
		"acc": return "acc"
		"title": return "title"
	return String(item.get("kind", slot))


func _icon_for(key: String) -> Texture2D:
	var cache_key := "item_" + key
	if icon_cache.has(cache_key):
		return icon_cache[cache_key]
	var entry = icon_index.get(cache_key)
	var path := "res://assets/icons/" + cache_key + ".png"
	if entry is Dictionary and entry.has("file"):
		path = "res://assets/icons/" + String(entry["file"])
	if ResourceLoader.exists(path):
		icon_cache[cache_key] = load(path)
		return icon_cache[cache_key]
	if FileAccess.file_exists(path):
		var image := Image.new()
		if image.load(path) == OK:
			icon_cache[cache_key] = ImageTexture.create_from_image(image)
			return icon_cache[cache_key]
	icon_cache[cache_key] = null
	return null


func _refresh_stats() -> void:
	for child in stats_content.get_children():
		stats_content.remove_child(child)
		child.queue_free()
	var stats: Dictionary = g.S
	var character: Dictionary = g.ch
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	name_row.custom_minimum_size.y = 22.3
	stats_content.add_child(name_row)
	var char_label := _label("Lv%d %s" % [int(character.get("lv", 1)), String(character.get("name", ""))], 12, TEXT_COLOR)
	char_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	char_label.clip_text = true
	name_row.add_child(char_label)
	var weapon: Dictionary = stats.get("W", {}) if stats.get("W", {}) is Dictionary else {}
	var weapon_label := _label(String(weapon.get("name", "")) if weapon is Dictionary else "", 12, DIM_COLOR)
	weapon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	name_row.add_child(weapon_label)
	_add_stat_row("所持ゴールド", _grouped(int(character.get("gold", 0))), Color.html("#ffd86a"))
	var wc: Dictionary = stats.get("wc", {})
	var wc_color := Color.html(String(wc.get("color", "#cfd3da")))
	_add_stat_row("装備重量", "%s（%s）" % [_format_num(float(stats.get("weight", 0.0)), 1), String(wc.get("name", ""))], wc_color, true)
	var bar := WeightBar.new()
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_content.add_child(bar)
	bar.set_value(clampf(float(stats.get("weight", 0.0)) / 22.0, 0.0, 1.0), wc_color)
	_add_stat_row("回避のクールタイム", "%.2f秒" % float(stats.get("dodgeCd", 0.0)))
	var values := [
		["攻撃力", str(roundi(float(stats.get("atk", 0.0))))],
		["最大HP", str(int(stats.get("mhp", 0)))],
		["会心率", "%.1f%%" % float(stats.get("crit", 0.0))],
		["会心ダメージ", "%.0f%%" % float(stats.get("critd", 0.0))],
		["攻撃速度", "+%.1f%%" % float(stats.get("aspd", 0.0))],
		["移動速度", "+%.1f%%" % float(stats.get("move", 0.0))],
		["被ダメ軽減", "%.1f%%" % float(stats.get("def", 0.0))],
		["HP吸収", "%.1f%%" % float(stats.get("vamp", 0.0))],
		["スキル短縮", "%.0f%%" % float(stats.get("cdr", 0.0))],
	]
	if stats.get("W", {}).get("ranged", false):
		values.append(["射程", "%sm（最大射程 %sm）" % [_format_num(float(stats.get("bowBase", 0.0)), 1), _format_num(float(stats.get("bowMax", 0.0)), 1)]])
		values.append(["弓を引く速さ", "毎秒%sm（最大まで%.2f秒）" % [_format_num(float(stats.get("bowDraw", 0.0)), 1), float(stats.get("chargeMax", 0.0))]])
	for entry in values:
		_add_stat_row(String(entry[0]), String(entry[1]))
	var mats: Dictionary = character.get("mats", {})
	_add_stat_row("強化の欠片", str(int(mats.get("shard", 0))))
	var sv = stats.get("sv")
	if sv is Dictionary:
		_add_stats_spacer(4.0)
		_add_stats_text("スキル変化", DIM_COLOR, 11)
		_add_stats_text("%s %s（%s）" % [String(sv.get("icon", "")), String(sv.get("name", "")), _tier_label(int(sv.get("t", 1)))], Color.html("#c8a0ff"), 11)
	var title = stats.get("title")
	if title is Dictionary:
		_add_stats_spacer(4.0)
		_add_stats_text("称号", DIM_COLOR, 11)
		_add_stats_text("%s%s" % [String(title.get("name", "")), "" if bool(stats.get("titleOn", false)) else "（今の武器では無効）"], Color.html("#ffe7a0") if bool(stats.get("titleOn", false)) else Color.html("#888888"), 11)
	var effects: Dictionary = stats.get("fx", {})
	for key in effects.keys():
		if UNIQUE_EFFECTS.has(String(key)):
			_add_stats_text("✦ " + String(UNIQUE_EFFECTS[String(key)]), Color.html("#ffd27a"), 11)
	_add_stats_spacer(6.0)
	_add_stats_text("武器パッシブはスキルツリー（K）の武器タブ最上段に表示されます", DIM_COLOR, 10, 2)


func _add_stats_text(value: String, color: Color, font_size: int, min_lines: int = 1) -> void:
	var label := _label(value, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_constant_override("line_spacing", roundi(float(font_size) * 0.8))
	label.custom_minimum_size.y = float(font_size) * 1.8 * float(min_lines)
	stats_content.add_child(label)


func _add_stats_spacer(height: float) -> void:
	var spacer := Control.new()
	spacer.custom_minimum_size.y = height
	stats_content.add_child(spacer)


func _add_stat_row(label_text: String, value_text: String, value_color: Color = TEXT_COLOR, weight := false) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	# CSS line-height:1.8。Label の実測行送り差を含め、ブラウザの行高に合わせる。
	row.custom_minimum_size.y = 26.3 if weight else 22.3
	stats_content.add_child(row)
	var name := _label(label_text, 12, DIM_COLOR)
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.clip_text = true
	row.add_child(name)
	var value := _label(value_text, 12, value_color)
	# public/style.css #stats div の flex 行に合わせ、値を欠かさず右寄せできる幅を確保する。
	value.custom_minimum_size.x = 88.0
	value.size_flags_horizontal = Control.SIZE_SHRINK_END
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.clip_text = true
	row.add_child(value)


func show_item_tooltip(item: Dictionary, pointer: Vector2, compare: bool) -> void:
	if item.is_empty() or tooltip == null:
		return
	for child in tooltip_content.get_children():
		tooltip_content.remove_child(child)
		child.queue_free()
	var data: Dictionary = GameRules.data()
	var rarity := clampi(int(item.get("rarity", 0)), 0, 7)
	var rarity_color := _rarity_color(rarity)
	_add_tip_label(g.items.display_name(item) + ((" +%d" % int(item["enh"])) if int(item.get("enh", 0)) > 0 else ""), rarity_color, 15)
	if String(item.get("slot", "")) == "title":
		_add_tip_label("%s 称号（ステータスなし）" % _rarity_name(rarity), DIM_COLOR, 12)
		_add_title_info(item)
		if item.has("lore") and String(item["lore"]) != "":
			_add_tip_label(String(item["lore"]), DIM_COLOR, 12)
	else:
		var item_type := _item_type(item)
		_add_tip_label("%s %s ・ iLv%d ・ 重さ %s" % [_rarity_name(rarity), item_type, int(item.get("ilvl", 1)), _format_num(GameRules.item_weight(item), 1)], DIM_COLOR, 12)
		_add_tip_separator()
		var enhance := GameRules.enh_mult(item)
		if float(item.get("atk", 0.0)) != 0.0:
			_add_tip_label("攻撃力 +%s" % _format_num(_enhanced_value(float(item["atk"]), enhance), 1), TEXT_COLOR, 12)
		if float(item.get("hp", 0.0)) != 0.0:
			_add_tip_label("HP +%s" % _format_num(_enhanced_value(float(item["hp"]), enhance), 1), TEXT_COLOR, 12)
		if float(item.get("def", 0.0)) != 0.0:
			_add_tip_label("被ダメ軽減 +%s%%" % _format_num(_enhanced_value(float(item["def"]), enhance), 1), TEXT_COLOR, 12)
		var base = item.get("base")
		if base is Array and base.size() >= 2:
			var affix: Dictionary = data["affixes"].get(String(base[0]), {})
			if not affix.is_empty():
				_add_tip_label("基本効果：%s +%s%s" % [String(affix.get("name", "")), _format_num(float(base[1]), 1), String(affix.get("unit", ""))], Color.html("#ffe0a0"), 11)
		var affixes = item.get("affixes", [])
		if affixes is Array:
			for entry in affixes:
				if entry is Array and entry.size() >= 2:
					_add_affix_tip(entry)
		for key in item.get("fx", []):
			if UNIQUE_EFFECTS.has(String(key)):
				_add_tip_label("✦ " + String(UNIQUE_EFFECTS[String(key)]), Color.html("#ffd27a"), 12)
		if String(item.get("slot", "")) == "weapon":
			_add_weapon_skill_tip(item)
		if item.has("lore") and String(item["lore"]) != "":
			_add_tip_label(String(item["lore"]), DIM_COLOR, 12)
		if item.has("by") and String(item["by"]) != "":
			_add_tip_label("入れた人：" + String(item["by"]), DIM_COLOR, 12)
		_add_tip_label("分解すると %s G" % _grouped(g.items.salvage_value(item)), Color.html("#ffd86a"), 12)
		var eq: Dictionary = g.ch.get("eq", {})
		var current = eq.get(String(item.get("slot", "")))
		if compare and current is Dictionary and current.get("id") != item.get("id"):
			var delta: int = g.items.item_power(item) - g.items.item_power(current)
			_add_tip_spacer(4.0) # public/style.css #tooltip .cmp margin-top:4px。
			_add_tip_label("装備中と比較: 戦力 %s%d" % ["+" if delta >= 0 else "", delta], Color.html("#66ff66") if delta >= 0 else Color.html("#ff7777"), 12)
			var weight_delta := GameRules.item_weight(item) - GameRules.item_weight(current)
			if weight_delta != 0.0:
				var new_class := _weight_class(float(g.S.get("weight", 0.0)) + weight_delta)
				_add_tip_spacer(4.0)
				_add_tip_label("重さ %s%s → %s" % ["+" if weight_delta > 0.0 else "", _format_num(weight_delta, 1), String(new_class.get("name", ""))], Color.html("#fc8") if weight_delta > 0.0 else Color.html("#6f6"), 12)
	tooltip.visible = true
	tooltip.reset_size()
	_place_tooltip(pointer)


func _add_title_info(item: Dictionary) -> void:
	var id := String(item.get("title", ""))
	var info: Dictionary = TITLE_DETAILS.get(id, {})
	if not info.is_empty():
		_add_tip_label(String(info.get("desc", "")), Color.html("#ffe7a0"), 12)
	elif item.get("fx") is Array:
		for key in item["fx"]:
			if UNIQUE_EFFECTS.has(String(key)):
				_add_tip_label("✦ " + String(UNIQUE_EFFECTS[String(key)]), Color.html("#ffe7a0"), 12)
	var req := String(item.get("req", info.get("req", "")))
	if req != "":
		var req_name := String(TITLE_REQ_NAMES.get(req, req))
		var wk := String(g.S.get("wk", "sword"))
		var valid := GameRules.title_req_ok(req, wk)
		_add_tip_label(req_name + ("" if valid else "（今の武器では効かない）"), Color.html("#9fd8ff") if valid else Color.html("#ff9a8a"), 10)
	if not info.is_empty():
		_add_tip_label("入手：" + String(info.get("src", "")), DIM_COLOR, 12)
	elif item.has("from"):
		_add_tip_label(String(item["from"]) + "を伝承化したもの", DIM_COLOR, 12)


func _add_weapon_skill_tip(item: Dictionary) -> void:
	var data: Dictionary = GameRules.data()
	var kind := String(item.get("kind", "sword"))
	var id := String(item.get("skill", ""))
	var skills: Dictionary = data.get("skills", {}).get("weapon", {})
	var skill: Dictionary = skills.get(id, {})
	if skill.is_empty() or String(skill.get("kind", kind)) != kind:
		var pool: Array = data.get("weaponSkillPool", {}).get(kind, [])
		if pool.is_empty():
			return
		id = String(pool[0])
		skill = skills.get(id, {})
	if skill.is_empty():
		return
	_add_tip_label("武器スキル「%s」" % String(skill.get("name", "")), Color.html("#8fd8ff"), 12)
	_add_tip_label("%s（CT %s秒）" % [String(skill.get("desc", "")), _format_num(float(skill.get("cd", 0.0)), 1)], DIM_COLOR, 12)
	if bool(data.get("weapons", {}).get(kind, {}).get("guard", false)):
		_add_tip_label("強攻撃を溜めている間はガード（離すと強攻撃）", DIM_COLOR, 12)


func _add_affix_tip(affix: Array) -> void:
	var key := String(affix[0])
	var tier := int(affix[1])
	var badge_color := _tier_color(tier)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tooltip_content.add_child(row)
	var badge := PanelContainer.new()
	badge.name = "TierBadge"
	# public/style.css .afx .tier: min-width:30px、font-size:10px、上下padding:1px。
	# HBoxContainer の行高へ引き伸ばされないよう、高さ14pxで中央に置く。
	badge.custom_minimum_size = Vector2(30.0, 14.0)
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := StyleBoxFlat.new()
	style.bg_color = badge_color
	style.set_corner_radius_all(3)
	style.content_margin_left = 4.0
	style.content_margin_right = 4.0
	style.content_margin_top = 1.0
	style.content_margin_bottom = 1.0
	if tier >= 6:
		style.shadow_color = Color(badge_color.r, badge_color.g, badge_color.b, 0.7)
		style.shadow_size = 8
	badge.add_theme_stylebox_override("panel", style)
	row.add_child(badge)
	var tier_text := _label(_tier_label(tier), 10, Color.html("#10131c"))
	tier_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.add_child(tier_text)
	if String(affix[0]).begins_with("sv_"):
		var variant: Dictionary = GameRules.data()["skillVariants"].get(key, {})
		var words := VBoxContainer.new()
		words.add_theme_constant_override("separation", 0)
		words.custom_minimum_size.x = 214.0
		words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(words)
		words.add_child(_tip_label("%s スキル変化「%s」" % [String(variant.get("icon", "")), String(variant.get("name", ""))], Color.html("#d8b0ff"), 12, 214.0))
		words.add_child(_tip_label(_variant_description(key, tier), Color.html("#e6d4ff"), 12, 214.0))
	else:
		var desc := _label(_affix_text(affix), 12, Color.html("#cfe6ff"))
		desc.custom_minimum_size.x = 214.0
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(desc)


func _add_tip_separator() -> void:
	var line := HSeparator.new()
	line.modulate = Color(1.0, 1.0, 1.0, 0.18)
	tooltip_content.add_child(line)


func _add_tip_spacer(height: float) -> void:
	var spacer := Control.new()
	spacer.custom_minimum_size.y = height
	tooltip_content.add_child(spacer)


func _add_tip_label(value: String, color: Color, font_size: int) -> Label:
	var label := _tip_label(value, color, font_size, 254.0)
	tooltip_content.add_child(label)
	return label


func _tip_label(value: String, color: Color, font_size: int, min_width: float = 0.0) -> Label:
	var label := _label(value, font_size, color)
	label.custom_minimum_size.x = min_width
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _move_tooltip(pointer: Vector2) -> void:
	if tooltip != null and tooltip.visible:
		_place_tooltip(pointer)


func _place_tooltip(pointer: Vector2) -> void:
	var viewport_size := root.get_viewport_rect().size
	var tip_size := tooltip.get_combined_minimum_size()
	tooltip.size = tip_size
	var x := minf(pointer.x + 16.0, viewport_size.x - tip_size.x - 8.0)
	var y := minf(pointer.y + 10.0, viewport_size.y - tip_size.y - 10.0)
	tooltip.global_position = Vector2(x, y)


func _item_type(item: Dictionary) -> String:
	var data: Dictionary = GameRules.data()
	match String(item.get("slot", "")):
		"weapon":
			return String(data.get("weapons", {}).get(String(item.get("kind", "")), {}).get("name", "武器"))
		"armor":
			var armor := String(item.get("armor", "medium"))
			var armor_class := String(data.get("armorClasses", {}).get(armor, {}).get("name", "中装"))
			var atype := String(ARMOR_TYPE_NAMES.get(String(item.get("atype", "")), ""))
			return "防具（%s%s）" % [armor_class, ("・" + atype) if atype != "" else ""]
		"acc":
			return "装飾品"
	return String(item.get("slot", ""))


func _affix_text(affix: Array) -> String:
	var key := String(affix[0])
	var tier := clampi(int(affix[1]), 1, 7)
	var data: Dictionary = GameRules.data()["affixes"].get(key, {})
	if data.is_empty():
		return key
	var value = data["tiers"][tier - 1]
	return "%s +%s%s" % [String(data.get("name", key)), _format_num(float(value), 1), String(data.get("unit", ""))]


func _variant_description(key: String, tier: int) -> String:
	# public/shared/data.js SKILL_VARIANTS[].desc(t) と同じ表示値。
	var pct := func(value: float) -> int: return roundi(value * 100.0)
	match key:
		"sv_twin": return "武器スキルが少し後にもう一度発動する（2回目の威力 %d%%）" % pct.call(0.4 + tier * 0.1)
		"sv_giant": return "武器スキルの範囲・射程 +%d%%、威力 +%d%%。クールタイム +30%%" % [pct.call(1.4 + tier * 0.1 - 1.0), pct.call(1.0 + tier * 0.08 - 1.0)]
		"sv_rapid": return "武器スキルのクールタイム -%d%%。威力 -20%%" % pct.call(0.4 + tier * 0.05)
		"sv_blaze": return "炎属性になる。当たった敵を3秒間燃やす（毎秒 威力%d%%）。最初に当たった所で爆発する（威力80%%）" % pct.call(0.13 + tier * 0.05)
		"sv_storm": return "雷属性になる。当たった敵から近くの敵%d体へ雷が連鎖する（威力%d%%）" % [2 + ceili(float(tier) / 2.0), pct.call(0.4 + tier * 0.1)]
		"sv_drain": return "武器スキルで与えたダメージの%d%%を回復する" % pct.call(0.1 + tier * 0.04)
		"sv_blink": return "発動の直前に、狙った方向へ%dm瞬間移動する（無敵あり）" % (5 + tier)
		"sv_quake": return "ボスのスタン値が%.1f倍。当たった所に衝撃波が走る" % (2.5 + tier * 0.6)
		"sv_frost": return "氷属性になる。当たった敵が凍りつき、1秒後に氷が砕けて周りの敵にも威力%d%%" % pct.call(0.65 + tier * 0.12)
		"sv_gale": return "風属性になる。狙った場所に竜巻が%.1f秒残り、0.4秒ごとに威力%d%%" % [2.5 + tier * 0.25, pct.call(0.15 + tier * 0.04)]
		"sv_heavy": return "武器スキルが必ず会心になり、威力 ×%.2f。クールタイム +80%%" % (1.8 + tier * 0.12)
		"sv_holy": return "光属性になる。発動の0.6秒後、狙った場所に光の柱が落ちて威力%d%%。自分のHPを%d%%回復する" % [pct.call(0.75 + tier * 0.15), 4 + tier]
		"sv_venom": return "毒属性になる。当たった敵を5秒間 毒にする（0.5秒ごとに威力%d%%）" % pct.call(0.16 + tier * 0.04)
		"sv_meteor": return "発動すると、狙った場所の周りに流星が%dつ降る（各 威力%d%%）" % [3 + floori(float(tier) / 3.0), pct.call(0.4 + tier * 0.08)]
		"sv_haste": return "発動すると4秒間、移動速度と攻撃速度 +%d%%" % (15 + tier * 3)
		"sv_ward": return "発動すると3秒間、被ダメージ -%d%%" % (25 + tier * 4)
	return ""


static func _rarity_color(rarity: int) -> Color:
	var data: Dictionary = GameRules.data()
	var rows: Array = data["rarities"]
	return Color.html(String(rows[clampi(rarity, 0, rows.size() - 1)]["color"]))


func _rarity_name(rarity: int) -> String:
	var rows: Array = GameRules.data()["rarities"]
	return String(rows[clampi(rarity, 0, rows.size() - 1)]["name"])


func _auto_label(limit: int) -> String:
	if limit < 0:
		return "なし"
	if limit == 0:
		return "粗悪だけ"
	return _rarity_name(limit) + "以下"


func _weight_class(weight: float) -> Dictionary:
	for row in GameRules.data()["weightClasses"]:
		if weight <= float(row["max"]):
			return row
	return GameRules.data()["weightClasses"].back()


static func _tier_label(tier: int) -> String:
	if tier >= 7:
		return "超越 II"
	if tier == 6:
		return "超越 I"
	return "T%d" % tier


static func _tier_color(tier: int) -> Color:
	# public/shared/data.js tierColor の色。T6 以上は超越色。
	if tier >= 6:
		return Color.html("#ff7ab0")
	var colors := ["#9aa3b5", "#9fd8ff", "#7ab8ff", "#c8a0ff", "#ffc060"]
	return Color.html(String(colors[clampi(tier - 1, 0, colors.size() - 1)]))


func _label(value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func _button(value: String) -> Button:
	var button := Button.new()
	button.text = value
	button.custom_minimum_size.y = 30.0
	button.add_theme_font_size_override("font_size", 13)
	button.add_theme_color_override("font_color", TEXT_COLOR)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
	normal.border_color = LINE_COLOR
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(6)
	normal.content_margin_left = 10.0
	normal.content_margin_right = 10.0
	normal.content_margin_top = 6.0
	normal.content_margin_bottom = 6.0
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.4)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	button.add_theme_stylebox_override("disabled", normal)
	return button


func _style_slider(slider: HSlider) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = Color(1.0, 1.0, 1.0, 0.16)
	track.set_corner_radius_all(3)
	track.content_margin_top = 3.0
	track.content_margin_bottom = 3.0
	var highlight := StyleBoxFlat.new()
	highlight.bg_color = Color.html("#ffd84a")
	highlight.set_corner_radius_all(3)
	highlight.content_margin_top = 3.0
	highlight.content_margin_bottom = 3.0
	slider.add_theme_stylebox_override("slider", track)
	slider.add_theme_stylebox_override("grabber_area", track)
	slider.add_theme_stylebox_override("grabber_area_highlight", highlight)
	var image := Image.create(14, 14, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	for y in range(14):
		for x in range(14):
			if Vector2(x - 6.5, y - 6.5).length() <= 5.5:
				image.set_pixel(x, y, Color.html("#ffd84a"))
	var dot := ImageTexture.create_from_image(image)
	slider.add_theme_icon_override("grabber", dot)
	slider.add_theme_icon_override("grabber_highlight", dot)


static func _enhanced_value(value: float, multiplier: float) -> float:
	return float(roundi(value * multiplier * 10.0)) / 10.0


static func _format_num(value: float, decimals: int) -> String:
	var text := String.num(value, decimals)
	if text.contains("."):
		while text.ends_with("0"):
			text = text.left(text.length() - 1)
		if text.ends_with("."):
			text = text.left(text.length() - 1)
	return text


static func _grouped(value: int) -> String:
	var source := str(value)
	var result := ""
	while source.length() > 3:
		result = "," + source.right(3) + result
		source = source.left(source.length() - 3)
	return source + result
