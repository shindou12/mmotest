extends SceneTree
## ゲームの画面で、人物の姿勢（立ち・歩き・通常攻撃・溜め）を撮る（G2-3）。先にゲームのサーバーを立てておく。
##   PORT=8123 node server.js &
##   cd godot/worldart && xvfb-run -a godot --path . --resolution 960x720 -s res://scripts/tests/player_view_shots.gd -- --server=ws://127.0.0.1:8123/ws --out=/abs/dir [--weapon=greatsword:4] [--at=x,z]
## 草原に入り、自分の状態（me）を直接書いて、立ち・歩き・振り・溜めの順に <out>/<名>.png を撮る（ブラウザ版の同じ場面と並べる比較用）。
## --weapon=<武器>:<レアリティ>  --armor=<防具の見た目 0〜6 は未対応: 装備の防具は付けない>

var g
var args := {}
var out_dir := ""


func _initialize() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--") and a.contains("="): args[a.get_slice("=", 0).substr(2)] = a.substr(a.find("=") + 1)
	out_dir = String(args.get("out", "/tmp/pv_shots"))
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()


func _frames(n: int) -> void:
	for i in n:
		_safe()
		await process_frame


func _safe() -> void:   # 敵は消し、倒れないようにする（人物だけを見る）
	if g.S.has("mhp"): g.me.hp = g.S["mhp"]
	g.me.iframe = 99.0
	g.hud.visible = false
	for mb in g.mobs.values(): mb.node.visible = false; mb.label.visible = false
	for te in g.teles:
		for m in te.meshes: m.visible = false
	for f in g.floats: f.node.visible = false


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	img.save_png("%s/%s.png" % [out_dir, name])
	print("撮影 ", name)


func _run() -> void:
	var w := String(args.get("weapon", "greatsword:4")).split(":")
	g = (load("res://scenes/game.tscn") as PackedScene).instantiate()
	root.add_child(g)
	# 起動の引数は OS の引数から読まれるので、キャラクターの装備はここで差し替える
	g.ch["eq"] = {"weapon": {"slot": "weapon", "kind": w[0], "rarity": int(w[1]), "ilvl": 1, "affixes": [], "enh": 0, "atk": 20, "name": "テスト", "skill": "retreat", "weight": 9}}
	g.S = GameRules.calc_stats(g.ch)
	g._start("Shot", String(args.get("server", "ws://127.0.0.1:8080/ws")))
	var n := 0
	while g.area_id != "f1_field" and n < 600:
		await process_frame; n += 1
	print("area ok"); g.net.message.disconnect(g._on_msg);   # 以後サーバーの知らせを受けない（敵の予告・文字が出ない）
	await _frames(8)
	print("start")
	var p := String(args.get("at", "0,0")).split(",")
	g.me.x = float(p[0]); g.me.z = float(p[1]); g.me.a = PI
	_safe()
	await _frames(10)
	await _shot("stand")
	# 歩き: 入力の移動
	Input.action_press("move_right")
	await _frames(12)
	await _shot("walk")
	Input.action_release("move_right")
	await _frames(8)
	# 通常攻撃（1 段目・2 段目・3 段目の途中）
	for c in 3:
		g.me.combo = c; g.me.swingDur = 0.5; g.me.swingT = 0.14; g.me.a = PI
		await _frames(1)
		await _shot("swing%d" % c)
		g.me.swingT = 9.0
		await _frames(8)
	# 溜め
	g.me.charging = true; g.me.chargeT = 0.7
	await _frames(2)
	await _shot("charge")
	g.me.charging = false; g.me.chargeT = 0.0
	await _frames(5)
	# 回避・のけぞり・倒れる
	g.me.dodgeT = 0.2
	await _frames(1)
	await _shot("dodge")
	g.me.dodgeT = 0.0
	g.me.hurtT = 0.14
	await _frames(1)
	await _shot("hurt")
	quit(0)
