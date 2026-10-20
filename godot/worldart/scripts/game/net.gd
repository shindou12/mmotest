class_name GameNet
extends Node
## 今のゲームのサーバー（server.js の WebSocket /ws）とのやり取り（L27）。JSON の文字列を送り、届いたものを signal で渡す。
## メッセージの種類はブラウザ版と同じ（送る: hello・st・hit・move・wp・down・absorb、届く: welcome・warped・snap・tele・die・xp・gold・loot など）

signal message(m: Dictionary)
signal opened
signal closed

var ws := WebSocketPeer.new()
var was_open := false


func connect_to(url: String) -> void:
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 4 * 1024 * 1024
	var err := ws.connect_to_url(url)
	if err != OK:
		push_error("connect failed: %s" % err)


func send(m: Dictionary) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(m))


func _process(_dt: float) -> void:
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN and not was_open:
		was_open = true
		opened.emit()
	if st == WebSocketPeer.STATE_CLOSED and was_open:
		was_open = false
		closed.emit()
	while ws.get_available_packet_count() > 0:
		var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
		if m is Dictionary: message.emit(m)
