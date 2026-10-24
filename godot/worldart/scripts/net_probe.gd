extends SceneTree
## Godot から今のゲームのサーバー（server.js、WebSocket /ws）につなげるかの確認（L27）。画面は使わない。
##   godot --headless --path godot/worldart -s res://scripts/net_probe.gd -- --url=ws://127.0.0.1:8080/ws
## 手順: hello（名前）→ welcome → wp（ひだまりの草原へ）→ warped → snap（敵の一覧）→ いちばん近い敵の横へ st で移動 →
##       hit（攻撃のダメージ）を敵が倒れるまで送る → die / xp が届くか。ダメージの計算はブラウザ側（combat.js）の役目なので、ここでは固定値

var ws := WebSocketPeer.new()
var step := "connect"
var me_id := 0
var target_id := 0
var log_t := 0.0
var t := 0.0
var got := {}


func _init() -> void:
	var url := "ws://127.0.0.1:8080/ws"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--url="): url = a.substr(6)
	print("connect ", url)
	ws.connect_to_url(url)


func send(m: Dictionary) -> void:
	ws.send_text(JSON.stringify(m))


func _process(dt: float) -> bool:
	t += dt
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN and step == "connect":
		print("OPEN")
		send({"t": "hello", "name": "Godot", "color": "#44aa88", "lv": 1})
		step = "hello"
	while ws.get_available_packet_count() > 0:
		var m: Dictionary = JSON.parse_string(ws.get_packet().get_string_from_utf8())
		got[m.t] = got.get(m.t, 0) + 1
		match m.t:
			"welcome":
				me_id = int(m.id)
				print("WELCOME id=", me_id, " area=", m.area, " pos=", m.x, ",", m.z)
				send({"t": "wp", "to": "f1_field"})
			"warped":
				print("WARPED area=", m.area, " pos=", m.x, ",", m.z)
				step = "field"
			"snap":
				if step == "field" and m.ar == "f1_field" and m.m.size() > 0:
					# 敵の一覧: [id, 種類, x, z, 向き, hp, 最大hp, lv, 状態, ...]
					var best = null
					for mob in m.m:
						if best == null or Vector2(mob[2], mob[3]).length() < Vector2(best[2], best[3]).length(): best = mob
					target_id = int(best[0])
					print("SNAP mobs=", m.m.size(), " target=", best[1], " id=", target_id, " hp=", best[5], "/", best[6], " at ", best[2], ",", best[3])
					send({"t": "st", "x": float(best[2]) + 1.2, "z": float(best[3]), "a": 0.0, "hp": 100, "mhp": 100, "lv": 1, "dead": false, "wk": "sword"})
					step = "fight"
				elif step == "fight":
					for mob in m.m:
						if int(mob[0]) == target_id and t - log_t > 0.5:
							log_t = t
							print("  target hp=", mob[5])
			"die":
				print("DIE ", m)
				step = "done"
			"xp":
				print("XP ", m)
	if step == "fight" and fmod(t, 0.3) < dt:
		send({"t": "hit", "id": target_id, "dmg": 15})
	if step == "done" and t > 0.0:
		step = "quit"
		print("RECEIVED ", got)
		ws.close()
		return true
	if t > 30.0:
		print("TIMEOUT step=", step, " received=", got)
		return true
	return false
