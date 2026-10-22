extends RefCounted
## ブラウザ版 #tree（public/js/ui/panels/tree.js、public/style.css L155-230）を表示する。

const GameWTree = preload("res://scripts/game/skills/wtree.gd")

signal action_sent(event_name: String, payload: Dictionary)

const WEAPON_TABS := ["sword", "greatsword", "axe", "spear", "dagger", "bow"] # public/js/weapon-tree.js WEAPON_TABS の順
const WEAPON_NAMES := {"sword": "片手剣", "greatsword": "大剣", "dagger": "短剣", "spear": "盾槍", "axe": "大斧", "bow": "弓"}
const KIND_NAMES := {"skill": "スキル", "passive": "パッシブ", "ks1": "クラス", "ks2": "マスター"}
const TAGS := {
	"wave": {"name": "斬撃波", "icon": "〰", "color": "#6ad0ff"},
	"cd": {"name": "クールタイム", "icon": "⟲", "color": "#b86cff"},
	"crit": {"name": "会心", "icon": "✦", "color": "#ffd84a"},
	"dodge": {"name": "回避", "icon": "➶", "color": "#62dc6a"},
	"hurt": {"name": "被弾", "icon": "⛨", "color": "#ff7a6a"},
	"charge": {"name": "溜め", "icon": "◎", "color": "#ffb84a"},
	"light": {"name": "光波", "icon": "☾", "color": "#a8e4ff"},
	"recv": {"name": "受け", "icon": "⛉", "color": "#c9b4ff"},
	"poison": {"name": "毒", "icon": "☠", "color": "#8aff5a"},
	"move": {"name": "機動", "icon": "»", "color": "#9affc8"},
	"shield": {"name": "盾", "icon": "⛉", "color": "#9ad8ff"},
	"thrust": {"name": "突き", "icon": "➹", "color": "#fff0a0"},
	"break": {"name": "崩し", "icon": "✸", "color": "#ff9a5a"},
	"blood": {"name": "血", "icon": "♥", "color": "#e8eef8"},
	"throw": {"name": "投擲", "icon": "⟳", "color": "#e8eef8"},
	"zone": {"name": "射程", "icon": "◎", "color": "#e8eef8"},
	"trap": {"name": "罠", "icon": "⌖", "color": "#e8eef8"},
}


class ProgressStrip extends Control:
	var ratio: float = 0.0
	var track := StyleBoxFlat.new()
	var fill := StyleBoxFlat.new()

	func _init() -> void:
		custom_minimum_size = Vector2(120.0, 6.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		track.bg_color = Color(1.0, 1.0, 1.0, 0.12)
		track.set_corner_radius_all(3)
		fill.bg_color = Color.html("#6ad0ff")
		fill.set_corner_radius_all(3)

	func set_ratio(value: float) -> void:
		ratio = clampf(value, 0.0, 1.0)
		queue_redraw()

	func _draw() -> void:
		draw_style_box(track, Rect2(Vector2.ZERO, size))
		if ratio > 0.0:
			draw_style_box(fill, Rect2(Vector2.ZERO, Vector2(size.x * ratio, size.y)))


class TreeCard extends PanelContainer:
	signal action_sent(event_name: String, payload: Dictionary)
	var node_id: String = ""
	var skill_id: String = ""
	var learn_event: String = "wt:learn"
	var refund_event: String = "wt:refund"
	var stripe_color := Color.TRANSPARENT
	var stripe_dotted := false

	func _draw() -> void:
		if stripe_color.a <= 0.0:
			return
		if stripe_dotted:
			var y := 2.0
			while y < size.y - 2.0:
				draw_rect(Rect2(0.0, y, 3.0, 3.0), stripe_color)
				y += 6.0
		else:
			draw_rect(Rect2(0.0, 0.0, 3.0, size.y), stripe_color)

	func _gui_input(event: InputEvent) -> void:
		if not event is InputEventMouseButton or not event.pressed:
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			var payload := {"node": node_id}
			if skill_id != "": payload["skill"] = skill_id
			action_sent.emit(learn_event, payload)
			accept_event()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			action_sent.emit(refund_event, {"node": node_id})
			accept_event()


class BranchCard extends PanelContainer:
	signal chosen(branch: String)
	var branch: String = ""
	var enabled: bool = false

	func _gui_input(event: InputEvent) -> void:
		if enabled and event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			chosen.emit(branch)
			accept_event()


var g
var root: Control
var panel: PanelContainer
var heading: HBoxContainer
var points_label: Label
var points_value_label: Label
var reset_button: Button
var tabs_box: HBoxContainer
var tab_buttons: Dictionary = {}
var body: VBoxContainer
var body_scroll: ScrollContainer
var tree_tab: String = "sword"
var tree_node_count: int = 0


func _init(owner) -> void:
	g = owner
	var equipped := String(g.S.get("wk", "sword"))
	tree_tab = String(g.args.get("tree-demo", equipped))
	if not WEAPON_TABS.has(tree_tab) and tree_tab not in ["stat", "style"]:
		tree_tab = equipped if WEAPON_TABS.has(equipped) else "sword"


func build_ui(parent: Control) -> void:
	root = parent
	panel = PanelContainer.new()
	panel.name = "TreePanel"
	panel.visible = false
	panel.z_index = 20 # public/style.css #tree z-index:20
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(12.0 / 255.0, 18.0 / 255.0, 32.0 / 255.0, 0.72)
	panel_style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(10)
	panel_style.content_margin_left = 13.0
	panel_style.content_margin_right = 13.0
	panel_style.content_margin_top = 13.0
	panel_style.content_margin_bottom = 13.0
	panel_style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	panel_style.shadow_size = 24
	panel_style.shadow_offset = Vector2(0.0, 6.0)
	panel.add_theme_stylebox_override("panel", panel_style)
	root.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	# public/style.css .inv-head: gap 12px、折り返し、下余白10px。
	var header_margin := MarginContainer.new()
	header_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_margin.add_theme_constant_override("margin_bottom", 2)
	column.add_child(header_margin)
	var header_rows := VBoxContainer.new()
	header_rows.add_theme_constant_override("separation", 12)
	header_margin.add_child(header_rows)
	heading = HBoxContainer.new()
	heading.add_theme_constant_override("separation", 12)
	header_rows.add_child(heading)
	var title := _label("スキルツリー", 16, Color.html("#e8eef8"))
	heading.add_child(title)
	var points_row := HBoxContainer.new()
	points_row.add_theme_constant_override("separation", 4)
	points_label = _label("", 12, Color.html("#8fa0b8"))
	points_row.add_child(points_label)
	points_value_label = _label("0", 18, Color.html("#ffd84a"))
	points_row.add_child(points_value_label)
	heading.add_child(points_row)
	var hint := _label("クリックで習得 ／ 右クリックで1ポイント戻す ／ ◆は使うスキル（[Q][E]でスロットに入れる）", 12, Color.html("#8fa0b8"))
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	heading.add_child(hint)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	header_rows.add_child(actions)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(spacer)
	reset_button = _button("振り直し", 12)
	reset_button.pressed.connect(_emit_reset)
	actions.add_child(reset_button)
	var close_button := _button("×", 15)
	close_button.custom_minimum_size = Vector2(32.0, 30.0)
	close_button.pressed.connect(close)
	actions.add_child(close_button)

	# #tree-tabs の下余白10pxは、列間8pxとここで2pxを足して合わせる。
	var tabs_margin := MarginContainer.new()
	tabs_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tabs_margin.add_theme_constant_override("margin_bottom", 2)
	column.add_child(tabs_margin)
	tabs_box = HBoxContainer.new()
	tabs_box.add_theme_constant_override("separation", 4)
	tabs_box.add_theme_constant_override("margin_left", 0)
	tabs_margin.add_child(tabs_box)
	for id in WEAPON_TABS:
		_add_tab(id, String(GameRules.data()["weapons"].get(id, {}).get("name", WEAPON_NAMES[id])))
	var tab_gap := Control.new()
	tab_gap.custom_minimum_size.x = 12.0
	tabs_box.add_child(tab_gap)
	_add_tab("stat", "ステータス")
	_add_tab("style", "プレイスタイル")

	body_scroll = ScrollContainer.new()
	body_scroll.name = "TreeBodyScroll"
	body_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(body_scroll)
	body = VBoxContainer.new()
	body.name = "TreeBody"
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 8) # #tree-body gap:8px
	body_scroll.add_child(body)
	if root.get_viewport() != null:
		root.get_viewport().size_changed.connect(_fit_panel)
	call_deferred("_fit_panel")
	refresh()


func _add_tab(id: String, title: String) -> void:
	var button := Button.new()
	button.name = "TreeTab_" + id
	button.custom_minimum_size = Vector2(84.0, 48.0) # public/style.css button padding 6px と2行ラベルの実寸
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var inside := VBoxContainer.new()
	inside.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	inside.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inside.alignment = BoxContainer.ALIGNMENT_CENTER
	inside.add_theme_constant_override("separation", 0)
	var name_label := _label(title, 13, Color.html("#e8eef8"))
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	inside.add_child(name_label)
	var sub := _label("", 10, Color.html("#8fa0b8"))
	sub.name = "Subtitle"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	inside.add_child(sub)
	button.add_child(inside)
	_apply_button_style(button, false)
	button.pressed.connect(_request_tab.bind(id))
	tabs_box.add_child(button)
	tab_buttons[id] = {"button": button, "subtitle": sub}


func _request_tab(id: String) -> void:
	action_sent.emit("tree:tab", {"tab": id})


func _emit_reset() -> void:
	action_sent.emit("tree:reset", {})


func _send_slot(index: int, skill_id: String) -> void:
	action_sent.emit("tree:slot", {"slot": index, "skill": skill_id})


func _forward_action(event_name: String, payload: Dictionary) -> void:
	action_sent.emit(event_name, payload)


func _choose_branch(branch: String, node_id: String) -> void:
	action_sent.emit("wt:choose", {"node": node_id, "b": branch})


func is_open() -> bool:
	return panel != null and panel.visible


func toggle() -> void:
	if is_open():
		close()
	else:
		open()


func open(tab_id: String = "") -> void:
	if panel == null:
		return
	if tab_id != "" and (WEAPON_TABS.has(tab_id) or tab_id in ["stat", "style"]):
		tree_tab = tab_id
	if g.items != null and g.items.inventory_panel != null and g.items.inventory_panel.panel.visible:
		g.items.inventory_panel.close()
	panel.visible = true
	refresh()
	g._sync_modal_ui()


func close() -> void:
	if panel == null:
		return
	panel.visible = false
	g._sync_modal_ui()


func refresh() -> void:
	if panel == null:
		return
	_update_tabs()
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	tree_node_count = 0
	if GameWTree.has_wtree(tree_tab):
		_build_weapon_tree(tree_tab)
	else:
		_build_legacy_tree(tree_tab)
	body_scroll.scroll_vertical = 0


func _update_tabs() -> void:
	var equipped := String(g.S.get("wk", "sword"))
	for id in tab_buttons:
		var entry: Dictionary = tab_buttons[id]
		var button: Button = entry["button"]
		var subtitle: Label = entry["subtitle"]
		var is_weapon := WEAPON_TABS.has(String(id))
		if is_weapon:
			var level := int(GameWTree.prof_level(g.ch, String(id)))
			subtitle.text = ("装備中・" if String(id) == equipped else "") + "熟練" + str(level)
		else:
			subtitle.text = "%dpt" % int(g._tree_spent_tab(String(id)))
		_apply_button_style(button, String(id) == tree_tab)

	var remaining := 0
	if GameWTree.has_wtree(tree_tab):
		var st: Dictionary = GameWTree.wt_of(g.ch, tree_tab)
		remaining = int(GameWTree.wt_left(g.ch, tree_tab))
		var spent := int(GameWTree.wt_spent(st))
		reset_button.text = "振り直し（%dG）" % (100 + spent * 20) if spent > 0 else "振り直し"
		points_label.text = String(GameRules.data()["wtrees"][tree_tab].get("name", "武器ツリー")) + "の残りポイント"
	else:
		remaining = maxi(0, int(g.ch.get("lv", 1)) - 1 - int(g._tree_spent_total()))
		reset_button.text = "振り直し"
		points_label.text = "残りスキルポイント"
	points_value_label.text = str(remaining)


func _build_weapon_tree(wk: String) -> void:
	var data: Dictionary = GameRules.data()
	var tree: Dictionary = data["wtrees"][wk]
	var state: Dictionary = GameWTree.wt_of(g.ch, wk)
	var proficiency: Dictionary = GameWTree.prof_of(g.ch, wk)
	var level := int(GameWTree.prof_level(g.ch, wk))
	var own_level := int(proficiency.get("lv", 1))
	var xp_ratio := 1.0
	if own_level < int(GameWTree.prof_max()) and own_level >= level:
		xp_ratio = float(proficiency.get("xp", 0)) / maxf(1.0, float(GameWTree.prof_need(own_level)))

	var head := PanelContainer.new()
	head.add_theme_stylebox_override("panel", _style(Color(0.0, 0.0, 0.0, 0.3), Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25), 1, 8, 10.0, 6.0, 10.0, 6.0))
	var head_column := VBoxContainer.new()
	head_column.add_theme_constant_override("separation", 6)
	head.add_child(head_column)
	var prof_row := HBoxContainer.new()
	prof_row.add_theme_constant_override("separation", 4)
	head_column.add_child(prof_row)
	prof_row.add_child(_label("熟練度", 13, Color.html("#8fa0b8")))
	prof_row.add_child(_label(str(level), 20, Color.html("#6ad0ff")))
	prof_row.add_child(_label("/ %d" % int(GameWTree.prof_max()), 10, Color.html("#8fa0b8")))
	var xp_bar := ProgressStrip.new()
	xp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	xp_bar.set_ratio(xp_ratio)
	prof_row.add_child(xp_bar)
	var note := _label(("ほかの武器の最大熟練度（%d）の半分から始まっています。" % int(g.ch.get("profBest", 0)) if own_level < level else "") + "この武器を装備して敵を倒すと上がる。熟練度1つで1ポイント", 12, Color.html("#8fa0b8"))
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head_column.add_child(note)
	body.add_child(head)

	if wk != String(g.S.get("wk", "sword")):
		_add_note("このツリーの効果は「%s」を装備しているときだけ有効です" % String(tree.get("name", "")))

	var row_reqs: Array = data["wtConst"]["rowReq"]
	for row_index in range(tree["rows"].size()):
		var row: Dictionary = tree["rows"][row_index]
		var required := int(row_reqs[row_index])
		var unlocked := level >= required
		var row_kind := String(row.get("kind", "skill"))
		var is_class := row_kind == "ks1" or row_kind == "ks2"
		var nodes: Array = row.get("nodes", [])
		if row_kind == "ks2" and state.get("ks1") != null:
			var filtered: Array = []
			for node in nodes:
				if node.get("from") == state.get("ks1"):
					filtered.append(node)
			nodes = filtered
		_add_weapon_row(row_index, required, row_kind, nodes, unlocked, is_class, state, tree)


func _add_weapon_row(row_index: int, required: int, kind: String, nodes: Array, unlocked: bool, is_class: bool, state: Dictionary, tree: Dictionary) -> void:
	var row_box := HBoxContainer.new()
	row_box.add_theme_constant_override("separation", 8)
	var req_col := VBoxContainer.new()
	req_col.custom_minimum_size.x = 62.0
	req_col.add_theme_constant_override("separation", 0)
	req_col.alignment = BoxContainer.ALIGNMENT_CENTER
	req_col.add_child(_label(str(required), 17, Color.html("#6ad0ff") if unlocked else Color.html("#8fa0b8")))
	var req_text := String(KIND_NAMES.get(kind, "")) + (" 🔒" if not unlocked else "")
	var req_small := _label(req_text, 10, Color.html("#8fa0b8"))
	req_small.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	req_col.add_child(req_small)
	row_box.add_child(req_col)
	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 5)
	row_box.add_child(content)
	if kind == "ks1":
		_add_exclusive(content, "― クラスをひとつ選ぶ ―", false)
	elif kind == "ks2":
		var selected_class_name := ""
		var class_id = state.get("ks1")
		if class_id != null:
			selected_class_name = String(GameWTree.wtnode().get(String(class_id), {}).get("name", ""))
		_add_exclusive(content, "― %s ―" % (selected_class_name + "を極める：どちらかひとつ" if selected_class_name != "" else "選んだクラスごとに、ふたつの道"), true)
	var grid := GridContainer.new()
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.columns = maxi(1, nodes.size()) if nodes.size() < 3 else 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if nodes.size() == 2:
		var center := CenterContainer.new()
		center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		center.add_child(grid)
		var viewport_width := float(g.get_viewport().get_visible_rect().size.x)
		grid.custom_minimum_size.x = maxf(180.0, (minf(900.0, viewport_width * 0.96) - 26.0 - 62.0 - 8.0) * 0.68)
		content.add_child(center)
	else:
		content.add_child(grid)
	for node_value in nodes:
		var node: Dictionary = node_value
		grid.add_child(_make_weapon_node(node, kind, is_class, unlocked, state, tree))
		tree_node_count += 1
	var divider := ColorRect.new()
	divider.custom_minimum_size.y = 1.0
	divider.color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.16)
	divider.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row_box.add_theme_constant_override("margin_top", 8)
	body.add_child(divider)
	body.add_child(row_box)


func _make_weapon_node(node: Dictionary, kind: String, is_class: bool, unlocked: bool, state: Dictionary, tree: Dictionary) -> TreeCard:
	var id := String(node["id"])
	var level := int(state["lv"].get(id, 0)) if not is_class else (1 if state.get(kind) == id else 0)
	var can_learn := GameWTree.wt_can_learn(g.ch, id)
	var other_selected: bool = is_class and state.get(kind) != null and String(state.get(kind)) != id
	var card := TreeCard.new()
	card.node_id = id
	card.learn_event = "wt:learn"
	card.refund_event = "wt:refund"
	card.skill_id = id if not is_class else "" # tree.js links both node and skill for non-class weapon nodes
	if kind == "skill":
		card.stripe_color = Color.html("#6ad0ff")
	elif kind == "passive":
		card.stripe_color = Color.html("#62dc6a")
		card.stripe_dotted = true
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var background := Color(0.0, 0.0, 0.0, 0.35)
	var border := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	var border_width := 1
	var class_color := Color.TRANSPARENT
	if is_class:
		class_color = Color.html("#ff3d63") if kind == "ks2" else Color.html("#ff9a2e")
		background = Color(class_color.r, class_color.g, class_color.b, 0.14 if kind == "ks1" else 0.16)
		border = Color(class_color.r, class_color.g, class_color.b, 0.45)
		border_width = 2
	if level > 0 and is_class:
		background = Color(class_color.r, class_color.g, class_color.b, 0.32)
		border = class_color
	elif level > 0:
		background = Color(98.0 / 255.0, 220.0 / 255.0, 106.0 / 255.0, 0.07)
		border = Color(98.0 / 255.0, 220.0 / 255.0, 106.0 / 255.0, 0.6)
	elif can_learn:
		border = Color.html("#ffd84a")
	if kind == "passive":
		background = Color(20.0 / 255.0, 30.0 / 255.0, 20.0 / 255.0, 0.35) # public/style.css .wt-node.passive
	var box := _style(background, border, border_width, 8, 9.0, 7.0, 9.0, 8.0)
	if can_learn and level == 0 and not is_class:
		box.shadow_color = Color(1.0, 216.0 / 255.0, 74.0 / 255.0, 0.2)
		box.shadow_size = 5 # public/style.css .wt-node.can inset glow
	if is_class and level > 0:
		box.shadow_color = Color(class_color.r, class_color.g, class_color.b, 0.32)
		box.shadow_size = 14
	card.add_theme_stylebox_override("panel", box)
	if other_selected: card.modulate.a = 0.35
	if not unlocked:
		card.modulate = Color(1.0, 1.0, 1.0, 0.4)
		card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 4)
	card.add_child(content)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 6)
	content.add_child(top)
	top.add_child(_make_node_icon(id, String(node.get("icon", "")), kind == "skill", is_class, kind))
	var node_name_color := Color.html("#e8eef8")
	if is_class: node_name_color = Color.html("#ff3d63") if kind == "ks2" else Color.html("#ff9a2e")
	var node_name := _label(String(node.get("name", "")), 13, node_name_color)
	node_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	top.add_child(node_name)
	if is_class:
		var class_kind := _kind_tag(String(KIND_NAMES.get(kind, kind)), kind)
		top.add_child(class_kind)
	else:
		top.add_child(_make_pips(level, 3, true))
	if not is_class and kind == "skill" and level > 0:
		var slot_row := HBoxContainer.new()
		slot_row.add_theme_constant_override("separation", 3)
		slot_row.custom_minimum_size.x = 48.0
		for index in range(2):
			var slot_button := _button("QE"[index], 11)
			slot_button.custom_minimum_size = Vector2(22.0, 20.0)
			slot_button.add_theme_stylebox_override("normal", _slot_style(g.ch.get("slots", [null, null])[index] == id, false))
			slot_button.add_theme_stylebox_override("hover", _slot_style(g.ch.get("slots", [null, null])[index] == id, true))
			slot_button.pressed.connect(_send_slot.bind(index, id))
			slot_row.add_child(slot_button)
		top.add_child(slot_row)
	card.action_sent.connect(_forward_action)
	if is_class:
		_add_label(content, String(node.get("desc", "")), 11, Color.html("#c8d4e4"), true)
		_add_tag_row(content, node.get("tags", []))
		return card

	var value_row := HBoxContainer.new()
	value_row.add_theme_constant_override("separation", 3)
	value_row.add_child(_kind_tag("スキル・Q/Eで使う" if kind == "skill" else "パッシブ・常に効く", kind))
	var lv_values: Array = node.get("lv", [])
	var value_index := mini(1, level - 1) if level > 0 else 0
	var shown_value := String(lv_values[value_index]) if value_index < lv_values.size() else ""
	var val_text := String(node.get("base", "")) + "　" + shown_value
	if kind == "skill":
		var skill: Dictionary = GameRules.data()["skills"]["tree"].get(id, {})
		val_text += "　CT %s秒" % _format_num(float(skill.get("cd", 0.0)))
	var value_label := _label(val_text, 11, Color.html("#c8d4e4"))
	value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	value_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	value_row.add_child(value_label)
	content.add_child(value_row)
	_add_tag_row(content, _node_tags(node, level))
	_add_branches(content, node, id, level, String(state["br"].get(id, "")))
	return card


func _build_legacy_tree(tab_id: String) -> void:
	var data: Dictionary = GameRules.data()["trees"][tab_id]
	var spent := int(g._tree_spent_tab(tab_id))
	reset_button.text = "振り直し"
	if tab_id == "style":
		var columns := HBoxContainer.new()
		columns.add_theme_constant_override("separation", 8)
		for title in ["回避（ダンサー）", "守護（ガーディアン）", "攻撃（バーサーカー）"]:
			var col := _label(title, 12, Color.html("#6ad0ff"))
			col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			col.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			columns.add_child(col)
		body.add_child(columns)
	for tier in range(4):
		var nodes: Array = []
		for node in data.get("nodes", []):
			if int(node.get("tier", -1)) == tier:
				nodes.append(node)
		_add_legacy_row(tab_id, tier, spent, nodes)


func _add_legacy_row(tab_id: String, tier: int, spent: int, nodes: Array) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var labels_box := VBoxContainer.new()
	labels_box.custom_minimum_size.x = 70.0
	labels_box.alignment = BoxContainer.ALIGNMENT_CENTER
	labels_box.add_child(_label("段階%d" % (tier + 1), 12, Color.html("#8fa0b8")))
	if tier > 0:
		labels_box.add_child(_label("%dpt〜" % (tier * 2), 10, Color.html("#8fa0b8")))
	row.add_child(labels_box)
	var grid := GridContainer.new()
	grid.columns = 3 if tab_id == "style" else 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(grid)
	for node_value in nodes:
		var node: Dictionary = node_value
		grid.add_child(_make_legacy_node(node, spent >= tier * 2))
		tree_node_count += 1
	body.add_child(row)


func _make_legacy_node(node: Dictionary, unlocked: bool) -> TreeCard:
	var id := String(node["id"])
	var tree: Dictionary = g.ch.get("tree", {})
	var level := int(tree.get(id, 0))
	var active := String(node.get("active", ""))
	var card := TreeCard.new()
	card.node_id = id
	card.skill_id = active
	card.learn_event = "tree:learn"
	card.refund_event = "tree:refund"
	card.action_sent.connect(_forward_action)
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var border := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	var background := Color(0.0, 0.0, 0.0, 0.35)
	if level > 0:
		background = Color(80.0 / 255.0, 160.0 / 255.0, 1.0, 0.18)
	if _can_learn_legacy(id):
		border = Color.html("#ffd84a")
	var box := _style(background, border, 1, 8, 10.0, 8.0, 10.0, 8.0)
	if _can_learn_legacy(id):
		box.shadow_color = Color(1.0, 216.0 / 255.0, 74.0 / 255.0, 0.25)
		box.shadow_size = 5
	card.add_theme_stylebox_override("panel", box)
	if not unlocked: card.modulate = Color(1.0, 1.0, 1.0, 0.5)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 3)
	card.add_child(content)
	var title := String(node.get("name", ""))
	if active != "": title = "◆ " + title
	var title_label := _label(title, 13, Color.html("#c9b4ff") if active != "" else Color.html("#e8eef8"))
	content.add_child(title_label)
	content.add_child(_make_pips(level, int(node.get("max", 1)), false))
	var desc := String(node.get("desc", ""))
	if active != "":
		var skill: Dictionary = GameRules.data()["skills"]["tree"].get(active, {})
		desc += "\nCT %s秒" % _format_num(float(skill.get("cd", 0.0)))
	_add_label(content, desc, 11, Color.html("#c8d4e4"), true)
	if active != "" and level > 0:
		var slots := HBoxContainer.new()
		slots.add_theme_constant_override("separation", 3)
		for index in range(2):
			var slot_button := _button("QE"[index], 11)
			slot_button.custom_minimum_size = Vector2(28.0, 22.0)
			slot_button.add_theme_stylebox_override("normal", _slot_style(g.ch.get("slots", [null, null])[index] == active, false))
			slot_button.add_theme_stylebox_override("hover", _slot_style(g.ch.get("slots", [null, null])[index] == active, true))
			slot_button.pressed.connect(_send_slot.bind(index, active))
			slots.add_child(slot_button)
		content.add_child(slots)
	return card


func _can_learn_legacy(id: String) -> bool:
	var index: Dictionary = GameRules.node_index()
	if not index.has(id):
		return false
	var node: Dictionary = index[id]
	var tree: Dictionary = g.ch.get("tree", {})
	if int(tree.get(id, 0)) >= int(node.get("max", 1)):
		return false
	if int(g._tree_spent_total()) >= maxi(0, int(g.ch.get("lv", 1)) - 1):
		return false
	return int(g._tree_spent_tab(String(node.get("tree", "")))) >= int(node.get("tier", 0)) * 2


func _add_branches(parent: Control, node: Dictionary, id: String, level: int, selected: String) -> void:
	var branch_row := HBoxContainer.new()
	branch_row.add_theme_constant_override("separation", 5)
	branch_row.add_theme_constant_override("margin_top", 2)
	parent.add_child(branch_row)
	for branch_key in ["A", "B"]:
		var key: String = String(branch_key)
		var choice: Dictionary = node.get(key, {})
		var chosen: bool = selected == key
		var can_choose: bool = level == 3 and selected == ""
		var background := Color.TRANSPARENT
		var border := Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
		if can_choose:
			border = Color.html("#ffd84a")
		elif chosen:
			background = Color(1.0, 216.0 / 255.0, 74.0 / 255.0, 0.14)
			border = Color.html("#ffd84a")
		elif selected != "":
			background = Color(1.0, 1.0, 1.0, 0.04)
		var branch_card := BranchCard.new()
		branch_card.branch = key
		branch_card.enabled = can_choose
		branch_card.mouse_filter = Control.MOUSE_FILTER_STOP
		branch_card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if can_choose else Control.CURSOR_ARROW
		branch_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		branch_card.modulate.a = 0.3 if selected != "" and not chosen else 1.0
		var style := _style(background, border, 1, 6, 6.0, 3.0, 6.0, 3.0)
		if not can_choose and not chosen: style.set_border_width_all(1)
		branch_card.add_theme_stylebox_override("panel", style)
		var branch_content := VBoxContainer.new()
		branch_content.add_theme_constant_override("separation", 1)
		branch_card.add_child(branch_content)
		branch_content.add_child(_label("%s：%s" % [key, String(choice.get("name", ""))], 11, Color.html("#e8eef8")))
		_add_label(branch_content, String(choice.get("desc", "")), 10, Color.html("#e8eef8") if can_choose or chosen else Color.html("#8fa0b8"), true)
		branch_card.chosen.connect(_choose_branch.bind(id))
		branch_row.add_child(branch_card)


func _make_node_icon(id: String, glyph: String, is_skill: bool, is_class: bool, kind: String) -> Control:
	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(24.0, 24.0)
	icon_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var icon_style := StyleBoxFlat.new()
	icon_style.bg_color = Color(1.0, 1.0, 1.0, 0.08)
	icon_style.set_corner_radius_all(12 if is_skill else 6)
	if is_skill:
		icon_style.bg_color = Color(106.0 / 255.0, 208.0 / 255.0, 1.0, 0.2) # public/style.css .wt-node.skill .wt-ic
		icon_style.shadow_color = Color(106.0 / 255.0, 208.0 / 255.0, 1.0, 0.35)
		icon_style.shadow_size = 8
	elif kind == "passive":
		icon_style.bg_color = Color(98.0 / 255.0, 220.0 / 255.0, 106.0 / 255.0, 0.16) # public/style.css .wt-node.passive .wt-ic
		icon_style.set_corner_radius_all(4)
	if is_class:
		var class_color := Color.html("#ff3d63") if kind == "ks2" else Color.html("#ff9a2e")
		icon_style.bg_color = Color(class_color.r, class_color.g, class_color.b, 0.3)
		icon_style.border_color = class_color
		icon_style.set_border_width_all(1)
		icon_style.set_corner_radius_all(3)
	icon_box.add_theme_stylebox_override("panel", icon_style)
	if is_class:
		icon_box.pivot_offset = Vector2(12.0, 12.0)
		icon_box.rotation_degrees = 45.0
	var image_index: Dictionary = g.hud_ui.icon_index
	if image_index.has(id):
		var texture: Texture2D = g.hud_ui._icon(g.hud_ui._skill_icon(id))
		if texture != null:
			var image := TextureRect.new()
			image.texture = texture
			image.custom_minimum_size = Vector2(24.0, 24.0)
			image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			image.mouse_filter = Control.MOUSE_FILTER_IGNORE
			if is_class:
				image.pivot_offset = Vector2(12.0, 12.0)
				image.rotation_degrees = -45.0
			icon_box.add_child(image)
			return icon_box
	var mark := _label(glyph, 19, Color.html("#e8eef8"))
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mark.custom_minimum_size = Vector2(24.0, 24.0)
	if is_class:
		mark.pivot_offset = Vector2(12.0, 12.0)
		mark.rotation_degrees = -45.0
	icon_box.add_child(mark)
	return icon_box


func _node_tags(node: Dictionary, level: int) -> Array:
	var result: Array = node.get("tags", []).duplicate()
	var selected := ""
	if level == 3:
		var state: Dictionary = GameWTree.wt_of(g.ch, String(node.get("wk", tree_tab)))
		selected = String(state["br"].get(String(node.get("id", "")), ""))
	if selected != "" and node.get(selected, {}) is Dictionary:
		for tag in node[selected].get("tags", []):
			if not result.has(tag): result.append(tag)
	return result


func _add_tag_row(parent: Control, tags: Array) -> void:
	if tags.is_empty():
		return
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 3)
	row.add_theme_constant_override("v_separation", 3)
	for value in tags:
		var id := String(value)
		if not TAGS.has(id): continue
		var tag: Dictionary = TAGS[id]
		var color := Color.html(String(tag["color"]))
		var pill := PanelContainer.new()
		var style := StyleBoxFlat.new()
		style.bg_color = Color.TRANSPARENT
		style.border_color = color
		style.set_border_width_all(1)
		style.set_corner_radius_all(8)
		style.content_margin_left = 6.0
		style.content_margin_right = 6.0
		style.content_margin_top = 0.0
		style.content_margin_bottom = 0.0
		pill.add_theme_stylebox_override("panel", style)
		pill.add_child(_label(String(tag["icon"]) + " " + String(tag["name"]), 10, color))
		row.add_child(pill)
	parent.add_child(row)


func _kind_tag(text: String, kind: String) -> PanelContainer:
	var badge := PanelContainer.new()
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := StyleBoxFlat.new()
	style.set_corner_radius_all(4)
	style.content_margin_left = 5.0
	style.content_margin_right = 5.0
	style.content_margin_top = 0.0
	style.content_margin_bottom = 0.0
	var font_color := Color.html("#9ee6a0")
	if kind == "skill":
		style.bg_color = Color.html("#6ad0ff")
		font_color = Color.html("#0a1424")
	elif kind == "ks1":
		style.bg_color = Color.html("#ff9a2e")
		font_color = Color.html("#1a0e00")
	elif kind == "ks2":
		style.bg_color = Color.html("#ff3d63")
		font_color = Color.WHITE
	else:
		style.bg_color = Color.TRANSPARENT
		style.border_color = Color(98.0 / 255.0, 220.0 / 255.0, 106.0 / 255.0, 0.6)
		style.set_border_width_all(1)
	badge.add_theme_stylebox_override("panel", style)
	badge.add_child(_label(text, 9, font_color))
	return badge


func _add_exclusive(parent: Control, text: String, master: bool) -> void:
	var label := _label(text, 11, Color.html("#ff3d63") if master else Color.html("#ff9a2e"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	parent.add_child(label)


func _add_note(text: String) -> void:
	var note := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 180.0 / 255.0, 60.0 / 255.0, 0.1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	note.add_theme_stylebox_override("panel", style)
	var label := _label(text, 12, Color.html("#ffcf7a"))
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_child(label)
	body.add_child(note)


func _make_pips(level: int, maximum: int, weapon_tree: bool) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	for i in range(maximum):
		var pip := ColorRect.new()
		pip.custom_minimum_size = Vector2(9.0, 9.0) if weapon_tree else Vector2(14.0, 5.0)
		pip.color = Color.html("#62dc6a") if weapon_tree and i < level else Color.html("#ffd84a") if not weapon_tree and i < level else Color(1.0, 1.0, 1.0, 0.15)
		pip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(pip)
	return row


func _button(text: String, font_size: int) -> Button:
	var button := Button.new()
	button.text = text
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", Color.html("#e8eef8"))
	button.add_theme_color_override("font_hover_color", Color.html("#e8eef8"))
	button.add_theme_color_override("font_pressed_color", Color.html("#e8eef8"))
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_apply_button_style(button, false)
	return button


func _apply_button_style(button: Button, active: bool) -> void:
	var normal := StyleBoxFlat.new()
	var hover := StyleBoxFlat.new()
	var pressed := StyleBoxFlat.new()
	for style in [normal, hover, pressed]:
		style.set_border_width_all(1)
		style.set_corner_radius_all(6)
		style.content_margin_left = 10.0
		style.content_margin_right = 10.0
		style.content_margin_top = 6.0
		style.content_margin_bottom = 6.0
	if active:
		normal.bg_color = Color(100.0 / 255.0, 190.0 / 255.0, 1.0, 0.5)
		normal.border_color = Color.html("#9ad8ff")
	else:
		normal.bg_color = Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
		normal.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	hover.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.4)
	hover.border_color = Color.html("#6ad0ff")
	pressed.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.5)
	pressed.border_color = Color.html("#9ad8ff")
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", normal)
	button.add_theme_stylebox_override("disabled", normal)


func _slot_style(active: bool, hover: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 7.0
	style.content_margin_right = 7.0
	style.content_margin_top = 1.0
	style.content_margin_bottom = 1.0
	if active:
		style.bg_color = Color.html("#8a6aff")
		style.border_color = Color.html("#c9b4ff")
	elif hover:
		style.bg_color = Color(100.0 / 255.0, 170.0 / 255.0, 1.0, 0.4)
		style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	else:
		style.bg_color = Color(80.0 / 255.0, 140.0 / 255.0, 220.0 / 255.0, 0.25)
		style.border_color = Color(160.0 / 255.0, 200.0 / 255.0, 1.0, 0.25)
	return style


func _style(background: Color, border: Color, border_width: int, radius: int, left: float, top: float, right: float, bottom: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = left
	style.content_margin_top = top
	style.content_margin_right = right
	style.content_margin_bottom = bottom
	return style


func _label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _add_label(parent: Control, text: String, font_size: int, color: Color, wrap: bool) -> Label:
	var label := _label(text, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	parent.add_child(label)
	return label


func _format_num(value: float) -> String:
	return str(int(roundf(value))) if is_equal_approx(value, roundf(value)) else "%.1f" % value


func _fit_panel() -> void:
	if panel == null or root == null:
		return
	var viewport := root.get_viewport().get_visible_rect().size
	var width := minf(900.0, viewport.x * 0.96)
	var height := viewport.y * 0.90
	panel.custom_minimum_size = Vector2(width, height)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5
	panel.offset_top = -height * 0.5
	panel.offset_bottom = height * 0.5


func log_demo_layout() -> void:
	if panel == null:
		return
	await panel.get_tree().process_frame
	var rect := panel.get_global_rect()
	var learned := 0
	var slots: Array = g.ch.get("slots", [null, null])
	if GameWTree.has_wtree(tree_tab):
		learned = int(GameWTree.wt_spent(GameWTree.wt_of(g.ch, tree_tab)))
	print("TREE_DEMO_LAYOUT_JSON=", JSON.stringify({
		"viewport": [int(g.get_viewport().get_visible_rect().size.x), int(g.get_viewport().get_visible_rect().size.y)],
		"panel": [roundi(rect.position.x), roundi(rect.position.y), roundi(rect.size.x), roundi(rect.size.y)],
		"tab": tree_tab, "nodes": tree_node_count, "learnedPoints": learned,
		"slots": slots, "toastsHidden": not g.hud_ui.toast_stack.visible,
		"tabsRect": _rect_array(tabs_box.get_global_rect()), "bodyRect": _rect_array(body_scroll.get_global_rect()),
	}))


func _rect_array(rect: Rect2) -> Array:
	return [roundi(rect.position.x), roundi(rect.position.y), roundi(rect.size.x), roundi(rect.size.y)]
