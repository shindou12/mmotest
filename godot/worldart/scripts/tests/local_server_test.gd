extends SceneTree
## GameLocalServer が server.js を起動し、ノード終了時に止めることを確かめる。

const LocalServer = preload("res://scripts/game/local_server.gd")
const SERVER_HOST := "127.0.0.1"
const SERVER_PORT := 8080


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var local_server = LocalServer.new()
	root.add_child(local_server)
	if await _probe_port(0.3):
		var existing_result: int = await local_server.start_if_missing("ws://127.0.0.1:8080/ws")
		var untouched: bool = local_server.process_id <= 0
		var still_open := await _probe_port(0.3)
		root.remove_child(local_server)
		local_server.free()
		var existing_ok: bool = existing_result == LocalServer.StartResult.ALREADY_AVAILABLE and untouched and still_open
		print("%s  GameLocalServer existing=true preserved=%s" % ["OK" if existing_ok else "NG", str(untouched and still_open)])
		quit(0 if existing_ok else 1)
		return
	var result: int = await local_server.start_if_missing("ws://127.0.0.1:8080/ws")
	var opened := result == LocalServer.StartResult.STARTED
	if opened:
		opened = await _probe_port(0.3)
	root.remove_child(local_server)
	local_server.free()
	var stopped := await _wait_until_stopped()
	var passed := opened and stopped
	print("%s  GameLocalServer started=%s port_open=%s stopped=%s" % ["OK" if passed else "NG", str(result == LocalServer.StartResult.STARTED), str(opened), str(stopped)])
	quit(0 if passed else 1)


func _probe_port(timeout_seconds: float) -> bool:
	var peer := StreamPeerTCP.new()
	if peer.connect_to_host(SERVER_HOST, SERVER_PORT) != OK:
		return false
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		peer.poll()
		var status := peer.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			peer.disconnect_from_host()
			return true
		if status != StreamPeerTCP.STATUS_CONNECTING:
			return false
		await create_timer(0.02).timeout
	peer.disconnect_from_host()
	return false


func _wait_until_stopped() -> bool:
	var deadline := Time.get_ticks_msec() + 3000
	while Time.get_ticks_msec() < deadline:
		if not await _probe_port(0.1):
			return true
		await create_timer(0.1).timeout
	return false
