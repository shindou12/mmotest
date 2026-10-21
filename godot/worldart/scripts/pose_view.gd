extends Node3D
## 人物の姿勢を並べて撮るための場面（G2-2）。ブラウザ版（tools/worldart/godot/pose_shots.mjs）と同じ条件で撮り、pose_sheet.py で並べて比べる。
##   godot --path . --resolution 960x720 scenes/pose_view.tscn -- --weapon=greatsword:3:4 --state='{"swing":0.5,"combo":1}' --out=/abs/a.png
##   godot --path . --resolution 960x720 scenes/pose_view.tscn -- --list=/abs/poses.json          # 一覧（pose_shots.mjs が書く）
## 引数: --weapon=<武器>:<形>:<飾りの段階>  --state=<animatePlayer に渡す状態の JSON（モーションは {"motion":"heavy","motionT":0.4}）>
##       --armor=<防具の見た目 0〜6>  --color=<プレイヤーの色 #rrggbb>  --out=<png>  --list=<一覧の JSON>  --outline=<輪郭線の太さの倍率（確かめ用）>
## 一覧: { camera: {fov,pos,target}, light: {...}, bg: "#rrggbb", jobs: [{id, weapon, armor, color, state, out}] }
## 描画: unshaded のトゥーン（shaders/toon.gdshader）が three.js の MeshToonMaterial の式と ACES を自分で計算する。Godot の光・環境光・トーンマップは使わない
## （背景は sRGB のままの色。Godot の Environment は線形・露出 1 のまま）。

const BASE_STATE := {"t": 1.0, "moving": false, "walkT": 0.0, "combo": 0, "swing": -1.0, "spin": -1.0, "sweep": -1.0, "dodge": 0.0, "down": 0.0, "hurt": 0.0}
## 既定のカメラ: ゲームのカメラの向き（game/loop.js: 俯角 pitch、注視点は人物の 1.2m 上）で、人物が画面に大きく入る距離に寄せたもの
const DEFAULT_CAM := {"fov": 50.0, "pos": [0.0, 4.21, 3.61], "target": [0.0, 1.05, 0.0]}
const DEFAULT_BG := "#7d8a95"

var _model: PlayerModel = null


func _args() -> Dictionary:
	var a := {}
	for s in OS.get_cmdline_user_args():
		if s.begins_with("--") and s.contains("="):
			var k := s.get_slice("=", 0).substr(2)
			a[k] = s.substr(s.find("=") + 1)
	return a


func _ready() -> void:
	var args := _args()
	var cfg := {"camera": DEFAULT_CAM, "bg": DEFAULT_BG, "light": {}, "jobs": []}
	if args.has("list"):
		var j = JSON.parse_string(FileAccess.get_file_as_string(args["list"]))
		if j == null:
			push_error("一覧が読めない: " + String(args["list"]))
			get_tree().quit(1)
			return
		for k in j: cfg[k] = j[k]
	else:
		var st = JSON.parse_string(args.get("state", "{}"))
		cfg["jobs"] = [{"id": "single", "weapon": args.get("weapon", "sword:0:0"), "armor": int(args.get("armor", "0")),
			"color": args.get("color", "#448a9b"), "state": st if st != null else {}, "out": args.get("out", "")}]
	_setup_view(cfg)
	# 確かめ用: 値を変えて画素が変わることを見る（--outline=輪郭線の倍率 --sun_i= --hemi_i= --exposure= --aces=0|1）
	if args.has("outline"): cfg["light"]["outline_scale"] = float(args["outline"])
	for k in ["sun_i", "hemi_i", "exposure"]:
		if args.has(k): cfg["light"][k] = float(args[k])
	if args.has("aces"): cfg["light"]["aces"] = args["aces"] != "0"
	_apply_light(cfg["light"])
	get_viewport().msaa_3d = Viewport.MSAA_4X
	await get_tree().process_frame
	var failed := 0
	for job in cfg["jobs"]:
		if not await _shoot(job): failed += 1
	print("pose_view: %d 枚 撮影（失敗 %d）" % [cfg["jobs"].size() - failed, failed])
	get_tree().quit(1 if failed > 0 else 0)


func _setup_view(cfg: Dictionary) -> void:
	var c: Dictionary = cfg["camera"]
	var cam: Camera3D = $Camera
	cam.fov = float(c["fov"])
	cam.near = 0.1
	cam.far = 900.0
	var p: Array = c["pos"]
	var t: Array = c["target"]
	cam.look_at_from_position(Vector3(p[0], p[1], p[2]), Vector3(t[0], t[1], t[2]), Vector3.UP)
	cam.current = true
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(String(cfg["bg"]))   # sRGB の色（Godot が出力で変換する）
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	$Env.environment = env


func _apply_light(l: Dictionary) -> void:
	var d := {}
	if l.has("sun_dir"): d["sun_dir"] = Vector3(l["sun_dir"][0], l["sun_dir"][1], l["sun_dir"][2])
	for k in ["sun_color", "sky", "ground"]:
		if l.has(k): d[k] = Color(String(l[k]))
	for k in ["sun_i", "hemi_i", "exposure"]:
		if l.has(k): d[k] = float(l[k])
	if l.has("aces"): d["aces"] = bool(l["aces"])
	if l.has("outline_scale"): d["outline_scale"] = float(l["outline_scale"])
	ToonLook.set_light(d)


func _shoot(job: Dictionary) -> bool:
	if _model != null and _model.root != null: _model.root.free()
	var w: PackedStringArray = String(job["weapon"]).split(":")
	_model = PlayerModel.new()
	_model.build({"kind": w[0], "form": int(w[1]) if w.size() > 1 else 0, "tier": int(w[2]) if w.size() > 2 else 0,
		"armor": int(job.get("armor", 0)), "no_weapon": bool(job.get("hide_weapon", false)), "color": Color(String(job.get("color", "#448a9b")))})
	add_child(_model.root)
	var s := BASE_STATE.duplicate()
	s["kind"] = w[0]
	var given: Dictionary = job.get("state", {})
	for k in given: s[k] = given[k]
	_model.animate(s)
	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var out := String(job.get("out", ""))
	if out == "": return true
	DirAccess.make_dir_recursive_absolute(out.get_base_dir())
	var err := img.save_png(out)
	if err != OK:
		push_error("保存できない: " + out)
		return false
	print("撮影 %s %s -> %s" % [job.get("id", ""), job["weapon"], out])
	return true
