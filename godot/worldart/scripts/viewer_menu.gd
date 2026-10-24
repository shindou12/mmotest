extends CanvasLayer
## 地図とビューを選ぶ板（右上）。親は main.gd。M キーで表示・非表示。

var _map_opt: OptionButton
var _view_opt: OptionButton
var _status: Label
var _busy := false       # 作り直しの間は選び直しの signal を無視する
var _maps := PackedStringArray()
var _views := PackedStringArray()


func _ready() -> void:
	layer = 50
	var panel := PanelContainer.new()
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.offset_left = -270
	panel.offset_right = -10
	panel.offset_top = 10
	add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	box.add_child(_label("地図"))
	_map_opt = OptionButton.new()
	_map_opt.item_selected.connect(_on_map_selected)
	box.add_child(_map_opt)
	box.add_child(_label("ビュー"))
	_view_opt = OptionButton.new()
	_view_opt.item_selected.connect(_on_view_selected)
	box.add_child(_view_opt)
	_status = _label("")
	box.add_child(_status)
	var help := _label("WASD 移動 / Q・E 向き / ホイール 距離 / M で隠す")
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.custom_minimum_size = Vector2(240, 0)
	box.add_child(help)
	refresh()


func _label(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 13)
	return l


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_M:
		visible = not visible


## 地図とビューの一覧を作り直し、今の地図・ビューを選んだ状態にする
func refresh() -> void:
	var p := get_parent()
	if p == null or _map_opt == null: return
	_busy = true
	_maps = p.maps()
	_views = p.views()
	var cur_map: String = p.world.map_name
	var cur_view: String = p.view_name
	_map_opt.clear()
	for m in _maps: _map_opt.add_item(m)
	_map_opt.select(_maps.find(cur_map))
	_view_opt.clear()
	for v in _views: _view_opt.add_item(v)
	_view_opt.select(_views.find(cur_view))
	_status.text = ""
	_busy = false


func _on_map_selected(i: int) -> void:
	if _busy or i < 0 or i >= _maps.size(): return
	_busy = true
	_status.text = "読み込み中…"
	await get_parent().load_map(_maps[i])
	_busy = false
	refresh()


func _on_view_selected(i: int) -> void:
	if _busy or i < 0 or i >= _views.size(): return
	get_parent().set_view(_views[i])
