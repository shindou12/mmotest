class_name GameLocalServer
extends Node
## エディタかデバッグ版でローカルの既定サーバーが見つからないとき、server.js を起動して終了時に止める。

enum StartResult {
	NOT_REQUIRED,
	ALREADY_AVAILABLE,
	STARTED,
	FAILED,
	WAITED_AVAILABLE,
	WAITED_FAILED,
}

const SERVER_HOST := "127.0.0.1"
const SERVER_PORT := 8080

signal startup_finished

var process_id: int = -1
var _checking: bool = false
var _server_available: bool = false


func start_if_missing(url: String) -> int:
	if not _can_manage(url):
		return StartResult.NOT_REQUIRED
	if _server_available:
		return StartResult.ALREADY_AVAILABLE
	if _checking:
		await startup_finished
		return StartResult.WAITED_AVAILABLE if _server_available else StartResult.WAITED_FAILED

	_checking = true
	var result: int = StartResult.FAILED
	if await _probe_port(0.3):
		_server_available = true
		result = StartResult.ALREADY_AVAILABLE
	elif process_id > 0:
		if await _wait_for_port():
			_server_available = true
			result = StartResult.ALREADY_AVAILABLE
	else:
		var server_path := _repository_root().path_join("server.js")
		if FileAccess.file_exists(server_path):
			process_id = OS.create_process(_node_path(), [server_path], false)
			if process_id > 0 and await _wait_for_port():
				_server_available = true
				result = StartResult.STARTED

	_checking = false
	startup_finished.emit()
	return result


func _can_manage(url: String) -> bool:
	if not (OS.has_feature("editor") or OS.is_debug_build()):
		return false
	for argument in OS.get_cmdline_user_args():
		var option := String(argument)
		if not option.begins_with("--"):
			continue
		var option_name := option.substr(2).get_slice("=", 0)
		if option_name in ["bot", "auto", "no-local-server"]:
			return false
	return _is_default_local_url(url)


func _is_default_local_url(url: String) -> bool:
	var scheme_end := url.find("://")
	if scheme_end < 0 or url.substr(0, scheme_end).to_lower() not in ["ws", "wss"]:
		return false
	var authority_start := scheme_end + 3
	var authority_end := url.length()
	for delimiter in ["/", "?", "#"]:
		var delimiter_at := url.find(delimiter, authority_start)
		if delimiter_at >= 0:
			authority_end = mini(authority_end, delimiter_at)
	var host_port := url.substr(authority_start, authority_end - authority_start).split(":")
	if host_port.size() != 2:
		return false
	var host := String(host_port[0]).to_lower()
	return host in ["127.0.0.1", "localhost"] and String(host_port[1]) == str(SERVER_PORT)


func _repository_root() -> String:
	return ProjectSettings.globalize_path("res://").path_join("../../").simplify_path()


func _node_path() -> String:
	var configured_node := OS.get_environment("NODE_BIN")
	if not configured_node.is_empty():
		return configured_node
	var local_app_data := OS.get_environment("LOCALAPPDATA")
	if not local_app_data.is_empty():
		var local_node := local_app_data.path_join("Programs/node22/node.exe")
		if FileAccess.file_exists(local_node):
			return local_node
	return "node"


func _probe_port(timeout_seconds: float) -> bool:
	var peer := StreamPeerTCP.new()
	if peer.connect_to_host(SERVER_HOST, SERVER_PORT) != OK:
		return false
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while true:
		peer.poll()
		var status := peer.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			peer.disconnect_from_host()
			return true
		if status != StreamPeerTCP.STATUS_CONNECTING or Time.get_ticks_msec() >= deadline:
			break
		await get_tree().create_timer(0.02).timeout
		if not is_inside_tree():
			return false
	peer.disconnect_from_host()
	return false


func _wait_for_port() -> bool:
	var deadline := Time.get_ticks_msec() + 10000
	while Time.get_ticks_msec() < deadline:
		if not is_inside_tree():
			return false
		var probe_started := Time.get_ticks_msec()
		var remaining_seconds := float(deadline - probe_started) / 1000.0
		if await _probe_port(minf(0.05, remaining_seconds)):
			return true
		var remaining_msec := deadline - Time.get_ticks_msec()
		if remaining_msec <= 0:
			break
		var wait_msec := mini(remaining_msec, maxi(0, 200 - (Time.get_ticks_msec() - probe_started)))
		if wait_msec > 0:
			await get_tree().create_timer(float(wait_msec) / 1000.0).timeout
	return false


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_stop_owned_process()


func _exit_tree() -> void:
	_stop_owned_process()


func _stop_owned_process() -> void:
	if process_id <= 0:
		return
	var owned_process_id := process_id
	process_id = -1
	OS.kill(owned_process_id)
