extends Node3D
## Godot 版のゲームの試作クライアント（L27）。今のサーバー（server.js）にそのままつなぐ。
## ブラウザ版（public/js/game/）から移したもの: 歩く・当たり判定（loop.js moveMe / areas.js collide）、通常攻撃の 3 段（actions.js doSwing・
## strikes.arc、combat.js dealDamage）、回避（tryDodge）、回復薬（usePotion）、敵の予告の板（hurt.js onTele・updateTeles）、
## 経験値とレベル（gainXp）、出口（loop.js の出口）、敵と他の人の表示（snapshot.js onSnap）。
## G4: 被弾・ガード・のけぞり／ダウン／吹き飛び・受け身・這いずり・復活・力尽きる・毒沼は combat/hurt.gd（元は hurt.js・input.js のガード・actions.js sweepTick）を
## 本物の文脈 combat.ctx で呼ぶ（このファイルに手写しはない）。スキル変化は combat.gd → combat/variants.gd。
## CP5（combat.gd・items.gd）: 溜め斬り（強攻撃）・片手剣の武器スキル 5 種・飛ぶ斬撃・踏み込み、落とし物を拾う・持ち物・装備（能力値の計算）。
## まだないもの: ボスの弾（bprojs）と演出・敵の本当のモデル・粒の見た目（G8）。屋内のエリアは仮の壁と床。
## 操作: WASD / 矢印 移動、マウス 狙い、左クリック 攻撃（長押しで溜め斬り）、右クリック 武器スキル、Space 回避、R 回復薬、F 調べる（レバー・宝箱）、I 持ち物、ホイール カメラの距離。
## G1-3b: 技は移した技（scripts/game/skills/）を本物の文脈（skills/game_ctx.gd）でつないだ。戦闘の流れは combat.gd（通常 3 段・溜め・強攻撃・武器スキル・Q/E・バフ・待ち時間・飛ぶ斬撃）。
## 操作の追加: Q / E ツリーのスキル（ch.slots）。キャラクターの保存に tree・prof・wt・slots を足した（ブラウザ版の character-store.js と同じ形）。
## 起動の引数（-- の後）: --server=ws://… --name=… --auto（名前の入力を飛ばす）--bot（自動で敵を探して戦う。確認用）
##   --goto=<エリア>（自動操作がその出口へ歩く）--shot=<フレーム数>:<出力.png>（草原に入って敵が見えてから撮って終わる）--quit=<秒> --at=x,z（草原に入ったらその位置へ）
##   --wk=<武器種>（その武器の初心者の武器を持つ。例 greatsword）--wt=<ノード,...>（武器ツリーを振る。熟練度は 20。<id>:<段階><分岐 A/B> 例 gt_wave,gt_charge:3A,gt_rising:2）
##   --slots=<Q のスキル>,<E のスキル>（例 gt_rising,gt_slam）  --sv=<スキル変化のキー>:<段階>（武器スキルに付ける。例 sv_blaze:3）  --fall=<秒>（その時に倒れる。確認用）
##
## ================================================================
## 自分の状態 me（人物の見た目・動き = 06b が読む項目。値は 0〜は秒・ラジアン。ブラウザ版の state.me と同じ名前・意味）
##   位置・向き   x・z・a（向き。北 0・東 +）           moving（歩いている）・walkT（歩いた時間の合計 = 歩きの位相）
##   通常攻撃     swingT（振りの経過）・swingDur（振りの長さ）→ 振りの進み k = swingT / swingDur（swingT < swingDur の間）
##                combo（0〜2。2 は 3 段目）・sw（振るたびに +1。他の人に振りを見せる印）・heavySwing（強攻撃の振り）
##   溜め         charging・chargeT（溜めた秒）・chargeLv（0・1・2）。溜めの割合 = min(1, chargeT / S.chargeMax)
##                溜めの見た目の振り k は「charging かつ chargeT > CHARGE_MIN(0.22) なら 0.02」（loop.js animatePlayer の swing）
##   技           skillT（技の経過。-1 = 技の間ではない）・skillDuration（技の長さ）・spin（回転系の技）・sk（技を出すたびに +1）
##                motion（動きの名前。空 = なし）・motionT（その経過）。名前は data/game.json の motionDurations のキー
##   回避・他     dodgeT（回避中。> 0）・dashT（踏み込み・後退中）・hurtT（被弾の揺れ。> 0）・crawl（這いずり）・dead
##   被弾（G4）   staggerT（ひるみ・ガードブレイクの隙。> 0 の間は動けない）・downT（ダウン。> 0）・downStart（ダウンした時刻。受け身の窓の基準）・
##                kbT・kbX・kbZ（押し戻し・吹き飛びの残り秒と速度）・noDownT（この時刻まで再ダウンしない）・brokenT（ガードブレイクの時刻。被ダメ 1.5 倍）
##                downs・downsAt（倒れた回数と時刻。起こしにくさ）・rv（倒れている間の起こすゲージの表示。-1 = 立っている）
##   ガード（G4） guarding・guardStart・gg（ガードゲージ 0〜100）・counter（カウンター準備）・counterFire（強攻撃がガードカウンターになる）・
##                guardLockT・guardEndT・ggHitT（構え直し・回復の時刻）・sweepT・sweepHit（回転なぎ払いの経過）・sweep（回った角度。なければ -1。me_fields が読む）
##   能力値      S.wk（武器種）・S.wr（武器のレア度）・S.chargeMax
## まとめて JavaScript の animatePlayer に渡す形にしたものが me_anim()（loop.js の animatePlayer の引数と同じキー）。
## ================================================================

const SAVE := "user://eterna_godot_char.json"
const GameWTree = preload("res://scripts/game/skills/wtree.gd")
const MobAnim = preload("res://scripts/game/mob_anim.gd")
const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const Hurt = preload("res://scripts/game/combat/hurt.gd")
const AudioModule = preload("res://scripts/game/audio.gd")
const GameHud = preload("res://scripts/game/hud.gd")
const GameTreePanel = preload("res://scripts/game/tree_panel.gd")
const GameSettingsPanel = preload("res://scripts/game/settings_panel.gd")
const GameMapPanel = preload("res://scripts/game/map_panel.gd")
const QuestModel = preload("res://scripts/game/quests.gd")
const GameNpcPanel = preload("res://scripts/game/npc_panel.gd")
const GameSmithPanel = preload("res://scripts/game/smith_panel.gd")
const GameBoxPanel = preload("res://scripts/game/box_panel.gd")
const GameGatePanel = preload("res://scripts/game/gate_panel.gd")
const GameLoginPanel = preload("res://scripts/game/login_panel.gd")
const GameChatPanel = preload("res://scripts/game/chat_panel.gd")
const GameDebugPanel = preload("res://scripts/game/debug_panel.gd")

const SETTINGS_KEY := "eterna_settings_v1"
const SETTINGS_PATH := "user://eterna_settings_v1.json"

@onready var world: Node3D = $World
var net := GameNet.new()
var cam := Camera3D.new()
var post := MeshInstance3D.new()
var hud := CanvasLayer.new()

var args := {}
var ch := {}              # キャラクター（保存する）: name・color・lv・xp・gold・wk・watk
var has_saved_character := false
var S := {}               # 計算済みの能力値（rules.gd calc_stats）
var me := {}              # 自分の状態（ブラウザ版の state.me にあたる）
var area_id := ""
var area := {}
var boss_fighting := false
var unlocked := 1
var settings := {}
var my_id := 0
var mobs := {}            # id → {node, label, x, z, tx, tz, a, ta, hp, mhp, lv, rad, kind, name, localT, stunT}
var others := {}          # id → {node, label, x, z, tx, tz, a, ta, name}
var teles := []           # {meshes, sh, start, dur, dmg, src, kd}
var pending := []         # {at, fn}
var floats := []          # {node, t}
var portals := []         # {to, x, z, r, armed}
var t_now := 0.0
var send_t := 0.0
var dist := 33.0
var started := false
var mouse_ground := Vector3.ZERO
var bot_t := 0.0
var door_open := false
var combat: GameCombat
var items: GameItems
var audio: GameAudio
var hud_ui
var hud_demo_applied := false
var tree_panel
var shot_panel_applied := false
var npc_panel
var smith_panel
var box_panel
var gate_panel
var login_panel
var chat_panel
var debug_panel
var preview_t := 0.0
var box_items: Array = []
var box_max := 60
var box_loaded := false
var npc_nodes: Array[Dictionary] = []
var demo_panel_applied := false

# HUD
var ui := {}


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	world.auto_build = false
	audio = AudioModule.new()
	audio.name = "GameAudio"
	add_child(audio)
	settings = _load_settings()
	if args.has("settings-defaults"): settings = _default_settings()
	if args.has("settings-sample"):
		var sample := clampf(float(args["settings-sample"]) / 100.0, 0.0, 1.0)
		for key in ["master", "music", "sfx", "amb"]: settings[key] = sample
	GameSettingsPanel.apply_volumes(audio, settings)
	combat = GameCombat.new(self)
	items = GameItems.new(self)
	add_child(net)
	net.message.connect(_on_msg)
	net.closed.connect(func(): _log("サーバーとの接続が切れました", Color(1, 0.4, 0.4)))
	_load_char()
	_setup_camera()
	if not args.has("auto") and not args.has("bot"):
		_setup_login_preview()
	_setup_hud()
	if args.has("auto") or args.has("bot"):
		_start(args.get("name", ch.get("name", "Godot")), args.get("server", "ws://127.0.0.1:8080/ws"))


func _default_settings() -> Dictionary:
	return {"master": 1.0, "music": 1.0, "sfx": 1.0, "amb": 1.0, "quality": "low" if args.has("low") else "high", "fx": "blend", "shake": true, "dmgnum": true, "occlusion": true}


func _load_settings() -> Dictionary:
	var values := _default_settings()
	if not FileAccess.file_exists(SETTINGS_PATH): return values
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
	if not parsed is Dictionary: return values
	for key in ["master", "music", "sfx", "amb"]:
		var raw: Variant = parsed.get(key, null)
		if typeof(raw) in [TYPE_INT, TYPE_FLOAT]: values[key] = clampf(float(raw), 0.0, 1.0)
	for key in ["shake", "dmgnum", "occlusion"]:
		var raw: Variant = parsed.get(key, null)
		if typeof(raw) == TYPE_BOOL: values[key] = raw
	var quality: Variant = parsed.get("quality", null)
	if quality is String and quality in ["high", "mid", "low"]: values["quality"] = quality
	var fx_style: Variant = parsed.get("fx", null)
	if fx_style is String and fx_style in ["blend", "anime", "flashy", "subtle", "classic"]: values["fx"] = fx_style
	return values


func _save_settings() -> void:
	if args.has("shot"): return
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(settings))


func _set_setting(key: String, value: Variant) -> void:
	if key in ["master", "music", "sfx", "amb"]:
		settings[key] = clampf(float(value), 0.0, 1.0)
	elif key == "quality" and value in ["high", "mid", "low"]:
		settings[key] = value
	elif key == "fx" and value in ["blend", "anime", "flashy", "subtle", "classic"]:
		settings[key] = value
	elif key in ["shake", "dmgnum", "occlusion"] and typeof(value) == TYPE_BOOL:
		settings[key] = value
	else:
		return
	GameSettingsPanel.apply_volumes(audio, settings)
	_save_settings()


## 効果音は実ゲームの文脈からだけ再生する。照合用の文脈は _op を記録するため機器に触れない。
func _sfx(name: String, opt: Dictionary = {}) -> void:
	if audio == null or not audio.sfx(name, opt): return
	if args.has("bot"): print("SFX ", name)


# ---------------------------------------------------------------- キャラクター（保存は user://。ブラウザ版のセーブとは別）
func _load_char() -> void:
	has_saved_character = false
	if args.has("demo-ui") or args.has("test-ui"):
		ch = {"name": "NpcTest", "color": "#3aa0ff", "lv": 1, "xp": 0, "gold": 0}
	elif args.has("login-new"):
		ch = _new_character("Godot", "#3aa0ff", String(args.get("wk", GameRules.data().get("defaultWeapon", "sword"))))
	elif args.has("login-existing"):
		ch = _new_character("G7-8", "#3aa0ff", String(args.get("wk", GameRules.data().get("defaultWeapon", "sword"))))
		ch["lv"] = 5
		has_saved_character = true
	elif args.has("debug"):
		ch = _new_character(String(args.get("name", "Debug")), String(args.get("color", "#3aa0ff")), String(GameRules.data().get("defaultWeapon", "sword")))
	elif FileAccess.file_exists(SAVE):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
		if parsed is Dictionary:
			ch = parsed
			has_saved_character = true
	if ch.is_empty():
		ch = _new_character("Godot", "#3aa0ff", String(GameRules.data().get("defaultWeapon", "sword")))
	_normalize_character()
	_apply_test_args()
	if args.has("map-demo"):
		ch["waypoints"] = {"f1_town": true, "f1_field": true}
		ch["areas"] = {"f1_town": {"done": true, "k": GameMapPanel.CLEAR_KILLS}, "f1_field": {"done": true, "k": GameMapPanel.CLEAR_KILLS}}
		ch["pin"] = {"area": "f1_field", "x": -21.0, "z": 20.0}
	if args.has("inv-demo"): items.apply_inventory_demo()
	if args.has("demo-ui"): _apply_g7_7_demo_character()
	_calc()


## Browser character-store.js と同じフィールド名で新しいキャラを作る。
func _new_character(pname: String, color: String, kind: String) -> Dictionary:
	var safe_kind := kind if GameRules.data()["weapons"].has(kind) else String(GameRules.data().get("defaultWeapon", "sword"))
	return {
		"name": pname, "color": color, "lv": 1, "xp": 0, "gold": 0,
		"inv": [], "eq": {"weapon": _starter_weapon(safe_kind), "armor": null, "acc": null, "title": null},
		"tree": {}, "slots": [null, null], "quests": {}, "mats": {"shard": 0, "gems": {}},
		"codex": {}, "titles": {}, "areas": {}, "waypoints": {}, "explored": {}, "chests": {}, "pin": null,
		"potBonus": 0, "autoSalvage": -1, "prof": {}, "profBest": 0, "wt": {},
	}


func _normalize_character() -> void:
	if not ch.get("eq") is Dictionary: ch["eq"] = {}
	var eq: Dictionary = ch["eq"]
	var weapon: Variant = eq.get("weapon", null)
	var default_kind := String(GameRules.data().get("defaultWeapon", "sword"))
	if weapon is Dictionary and GameRules.data()["weapons"].has(String(weapon.get("kind", ""))):
		default_kind = String(weapon["kind"])
	else:
		eq["weapon"] = _starter_weapon(default_kind)
	for slot in ["armor", "acc", "title"]:
		if not eq.has(slot): eq[slot] = null
	ch["eq"] = eq
	if not ch.get("inv") is Array: ch["inv"] = []
	for key in ["tree", "quests", "codex", "titles", "areas", "waypoints", "explored", "chests", "prof", "wt"]:
		if not ch.get(key) is Dictionary: ch[key] = {}
	if not ch.get("slots") is Array: ch["slots"] = [null, null]
	while ch["slots"].size() < 2: ch["slots"].append(null)
	ch["slots"] = ch["slots"].slice(0, 2)
	if not ch.get("mats") is Dictionary: ch["mats"] = {"shard": 0, "gems": {}}
	if not ch["mats"].get("gems") is Dictionary: ch["mats"]["gems"] = {}
	if not ch.has("pin"): ch["pin"] = null
	if not ch.has("potBonus"): ch["potBonus"] = 0
	if not ch.has("autoSalvage"): ch["autoSalvage"] = -1
	if not ch.has("profBest"): ch["profBest"] = 0
	ch["name"] = String(ch.get("name", "Godot"))
	if ch["name"].is_empty(): ch["name"] = "Godot"
	var color := Color.from_string(String(ch.get("color", "#3aa0ff")), Color.html("#3aa0ff"))
	ch["color"] = "#" + color.to_html(false)
	ch["lv"] = clampi(int(ch.get("lv", 1)), 1, GameRules.data()["levels"].size())
	ch["xp"] = maxi(0, int(ch.get("xp", 0)))
	ch["gold"] = maxi(0, int(ch.get("gold", 0)))


func _setup_login_preview() -> void:
	area_id = "f1_town"
	area = GameRules.area(area_id)
	world.load_area(area_id)
	preview_t = 0.0


func _apply_g7_7_demo_character() -> void:
	var weapon := {"id": "g77-weapon", "slot": "weapon", "kind": "sword", "rarity": 3, "ilvl": 18, "affixes": [["atkp", 3, 7], ["crit", 2, 3]], "enh": 1, "atk": 25, "bm": 1.2, "name": "紅蓮の細剣", "skill": "retreat", "v": 3}
	var armor := {"id": "g77-armor", "slot": "armor", "armor": "medium", "atype": "leather", "rarity": 2, "ilvl": 12, "affixes": [["hpp", 2, 6]], "enh": 0, "hp": 14, "def": 3, "base": ["hpp", 4], "bm": 1.05, "name": "革の鎧", "v": 3}
	ch["name"] = "NpcTest"
	ch["lv"] = 5
	ch["gold"] = 1234
	ch["eq"] = {"weapon": weapon.duplicate(true), "armor": null, "acc": null, "title": null}
	ch["inv"] = [weapon.duplicate(true), armor]
	ch["mats"] = {"shard": 23, "gems": {"atkp": 1}}
	ch["codex"] = {"atkp": 3}
	ch["titles"] = {}


## 確認用の引数 --wk・--wt・--slots をキャラクターに入れる
func _apply_test_args() -> void:
	var D := GameRules.data()
	if args.has("wk") and D["weapons"].has(String(args["wk"])):
		var wk := String(args["wk"])
		var w = ch["eq"].get("weapon")
		if not (w is Dictionary and w.get("kind") == wk): ch["eq"]["weapon"] = _starter_weapon(wk)
	var wk2: String = ch["eq"]["weapon"]["kind"] if ch["eq"].get("weapon") is Dictionary else String(D["defaultWeapon"])
	if args.has("wt"):
		ch["wt"][wk2] = {"lv": {}, "br": {}, "ks1": null, "ks2": null}
		GameWTree.prof_of(ch, wk2)["lv"] = 20
		ch["profBest"] = 20
		for spec in String(args["wt"]).split(",", false):
			var kv := spec.split(":", true, 1)
			var id := kv[0]
			var lv := 1
			var br = null
			if kv.size() > 1:
				var t := kv[1]
				if t.length() > 0 and (t.ends_with("A") or t.ends_with("B")): br = t.right(1); t = t.left(t.length() - 1)
				if t != "": lv = int(t)
			var n = D["wtnode"].get(id)
			if n == null:
				push_warning("--wt: 知らないノード " + id)
				continue
			if n.has("from"): GameWTree.wt_learn(ch, n["from"])
			for i in lv: GameWTree.wt_learn(ch, id)
			if br != null: GameWTree.wt_choose(ch, id, br)
	if args.has("sv"):   # スキル変化を武器に付ける（確認用）。--sv=<キー>:<段階 1〜8> 例 sv_blaze:3
		var kv2 := String(args["sv"]).split(":", true, 1)
		var wp: Dictionary = ch["eq"]["weapon"]
		var keep2 := []
		for a in wp.get("affixes", []):
			if not String(a[0]).begins_with("sv_"): keep2.append(a)
		keep2.append([kv2[0], int(kv2[1]) if kv2.size() > 1 else 1, 0])
		wp["affixes"] = keep2
	if args.has("slots"):
		var sl := []
		for id in String(args["slots"]).split(",", true):
			sl.append(id if id != "" else null)
		while sl.size() < 2: sl.append(null)
		ch["slots"] = sl.slice(0, 2)


## 初心者の武器（data.js starterWeapon の簡略: 攻撃力 6・並・先頭の武器スキル）
func _starter_weapon(kind: String) -> Dictionary:
	var D := GameRules.data()
	var weapon_kind := kind if D["weapons"].has(kind) else String(D.get("defaultWeapon", "sword"))
	var weapon := {"id": "starter_%s_%d" % [weapon_kind, Time.get_ticks_usec()], "slot": "weapon", "kind": weapon_kind,
		"rarity": 1, "ilvl": 1, "bm": 1.2, "affixes": [], "enh": 0, "v": 3,
		"weight": float(D["weapons"][weapon_kind].get("weight", 4)), "atk": 6,
		"name": "初心者の" + String(D["weapons"][weapon_kind]["name"]), "skill": D["weaponSkillPool"][weapon_kind][0]}
	if weapon_kind == "sword": weapon["starterSkillVersion"] = 1
	return weapon


## 能力値を計算し直す（stats.js calcStats）。戦闘の環境（combat.ctx）にも渡す
func _calc() -> void:
	S = GameRules.calc_stats(ch, me if not me.is_empty() else null, combat.ctx)
	combat.bind()


## 装備を変えたら能力値を計算し直す
func _recalc() -> void:
	_calc()
	_save_char()


func _save_char() -> void:
	if args.has("debug") or args.has("login-new") or args.has("login-existing") or args.has("wk") or args.has("wt") or args.has("sv") or args.has("fall") or args.has("inv-demo") or args.has("tree-demo") or args.has("shot") or args.has("test-ui") or args.has("demo-ui"): return   # 確認用のキャラは保存しない（本物のセーブを書き換えない）
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	if f == null:
		push_warning("キャラクターを保存できません: " + SAVE)
		return
	f.store_string(JSON.stringify(ch))
	has_saved_character = true


func _reset_me() -> void:
	# ブラウザ版の state.me の初期値（data/game.json の meInit）に、Godot 側の項目を重ねる
	me = GameRules.data()["meInit"].duplicate(true)
	me.merge({"x": 0.0, "z": 0.0, "a": PI, "hp": S["mhp"], "dead": false, "crawl": false, "downs": 0, "downsAt": 0.0,
		"swingT": 9.0, "swingDur": 0.4, "combo": 0, "lastSwing": -9.0, "sw": 0, "sk": 0, "queued": 0.0,
		"dodgeT": 0.0, "dodgeCd": 0.0, "dodgeDir": Vector2.ZERO, "iframe": 0.0, "potions": S["maxPot"], "potCd": 0.0,
		"hurtT": 0.0, "transit": false, "deathAt": 0.0, "charging": false, "chargeT": 0.0, "chargeLv": 0, "wsCd": 0.0, "tcd": {}, "buffs": [],
		"skillT": -1.0, "skillDuration": 0.55, "spin": false, "motion": "", "motionT": 0.0, "heavySwing": false, "bulletT": 0.0,
		"dashT": 0.0, "dashA": 0.0, "dashSpeed": 0.0, "moving": false, "walkT": 0.0, "stepT": 0.0,
		"gg": Hurt.GUARD()["max"], "counter": false, "counterFire": false, "guardLockT": 0.0, "guardEndT": 0.0, "ggHitT": 0.0, "brokenT": 0.0,
		"sweepT": 0.0, "sweepHit": false, "sweep": -1.0, "hazT": 0.0, "hazKind": null}, true)
	combat.bind()
	_calc()   # me.hp を最大 HP に切り詰める・afterStats


func _start(pname: String, url: String, color_hex: String = "", kind: String = "") -> void:
	var chosen_name := pname.strip_edges()
	if chosen_name.is_empty(): chosen_name = "プレイヤー"
	if not has_saved_character and not (args.has("auto") or args.has("bot")):
		var chosen_color := color_hex if not color_hex.is_empty() else String(ch.get("color", "#3aa0ff"))
		var current_kind := String(ch.get("eq", {}).get("weapon", {}).get("kind", GameRules.data().get("defaultWeapon", "sword")))
		var chosen_kind := kind if not kind.is_empty() else current_kind
		ch = _new_character(chosen_name, chosen_color, chosen_kind)
	else:
		_normalize_character()
		ch["name"] = chosen_name
		if not color_hex.is_empty():
			var parsed_color := Color.from_string(color_hex, Color.html("#3aa0ff"))
			ch["color"] = "#" + parsed_color.to_html(false)
	if ui.menu != null: ui.menu.visible = false
	_save_char()
	_reset_me()
	started = true
	if chat_panel != null: chat_panel.root.visible = true
	if debug_panel != null:
		debug_panel.set_active(args.has("debug"))
		if args.has("debug") and args.has("debug-panel"): debug_panel.panel.visible = true
	_log("接続中: " + url)
	net.connect_to(url)
	net.opened.connect(func(): net.send({"t": "hello", "name": ch["name"], "color": ch["color"], "lv": ch["lv"]}), CONNECT_ONE_SHOT)


func _prepare_fresh_character(pname: String, color: Color, kind: String) -> void:
	if FileAccess.file_exists(SAVE):
		var err := DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
		if err != OK:
			push_warning("古いキャラクターを削除できません: %s" % err)
	has_saved_character = false
	var fresh_name := pname.strip_edges() if not pname.strip_edges().is_empty() else "Godot"
	ch = _new_character(fresh_name, "#" + color.to_html(false), kind)
	_normalize_character()


func _send_chat(text: String) -> void:
	if args.get("test-ui", "") == "chat":
		args["_chat_test_text"] = text
		print("G7_8 CHAT SEND OK t=chat field=text")
	net.send({"t": "chat", "text": text})


# ---------------------------------------------------------------- サーバーからのメッセージ（net-client.js onMsg）
func _on_msg(m: Dictionary) -> void:
	match String(m.t):
		"welcome":
			my_id = int(m.id)
			unlocked = int(m.get("unlocked", 1))
			_enter_area(m.area, m.x, m.z)
			if not args.has("town"): net.send({"t": "wp", "to": args.get("start", "f1_field")})   # 試作は草原から
			if chat_panel != null:
				chat_panel.add_message("", "サーバーに接続しました。友達を誘おう！", Color.html("#99ffee"))
				chat_panel.add_message("", "町の人に話しかけると（F）サブクエストを受けられます。町の共有ボックスで仲間と装備を受け渡しできます。", Color.html("#99ffee"))
				chat_panel.add_message("", "協力ハード：3〜5人推奨。敵のHPは3人基準／回復30%・再使用8秒／戦闘不能でキャラのセーブデータを失います。", Color.html("#ffb27a"))
			if args.has("chat-demo"):
				call_deferred("_send_chat_demo")
			if args.has("test-ui") and not args.has("_ui_test_started"):
				args["_ui_test_started"] = "1"
				call_deferred("_run_ui_test")
		"warped":
			_sfx("warp") # loop.js update L191: 出口を通ったとき audio.sfx('warp')
			_enter_area(m.area, m.x, m.z)
		"roster": unlocked = int(m.get("unlocked", unlocked))
		"unlock": unlocked = int(m.get("unlocked", unlocked))
		"snap": _on_snap(m)
		"tele": _on_tele(m)
		"die": _on_mob_die(m)
		"xp":
			_gain_xp(int(m.n))
			if int(m.get("boss", 0)) > 0:
				_quest_event({"type": "boss", "floor": int(m.boss)})
			else:
				_quest_event({"type": "kill", "name": String(m.get("nm", "")), "area": String(m.get("ar", ""))})
		"gold":
			ch["gold"] = int(ch.get("gold", 0)) + int(m.n)
			_float(Vector3(me.x, 2.6, me.z), "+%d G" % int(m.n), Color(1, 0.85, 0.3))
			_save_char()
		"loot":
			if String(m.get("src", "")) == "chest":
				if not ch.get("chests") is Dictionary: ch["chests"] = {}
				ch["chests"][String(m.get("cid", m.get("ar", "")))] = Time.get_unix_time_from_system() * 1000.0
				_quest_event({"type": "chest", "area": String(m.get("ar", ""))})
				_save_char()
			items.on_loot(m)
		"box":
			box_items = m.get("items", []).duplicate(true)
			box_max = int(m.get("max", 60))
			box_loaded = true
			if box_panel != null: box_panel.refresh()
		"boxPut":
			if bool(m.get("ok", false)):
				var inv: Array = ch.get("inv", [])
				for i in range(inv.size() - 1, -1, -1):
					if String(inv[i].get("id", "")) == String(m.get("ref", "")):
						var moved: Dictionary = inv.pop_at(i)
						_log("「%s」を共有ボックスに入れた" % String(moved.get("name", "装備")), Color.html("#9ae8ff"))
						break
				ch["inv"] = inv
				_save_char()
				_sfx("equip")
				if box_panel != null: box_panel.refresh()
		"boxTake":
			var taken: Dictionary = m.get("item", {})
			var inv: Array = ch.get("inv", [])
			if inv.size() >= 60:
				_log("インベントリがいっぱいです", Color.html("#ff8888"))
				net.send({"t": "box", "op": "put", "item": taken})
			else:
				inv.push_front(taken)
				ch["inv"] = inv
				_log("「%s」を共有ボックスから取り出した" % String(taken.get("name", "装備")), GameItems.rarity_color(int(taken.get("rarity", 0))))
				_save_char()
				_sfx("pickup")
			if box_panel != null: box_panel.refresh()
		"chat":
			var chat_from := String(m.get("from", ""))
			var chat_text := String(m.get("text", ""))
			var chat_color := Color.from_string(String(m.get("color", "#ffffff")), Color.WHITE)
			if chat_panel != null: chat_panel.add_message(chat_from, chat_text, chat_color)
			var expected_chat := String(args.get("_chat_test_text", ""))
			if not expected_chat.is_empty() and chat_from == String(ch.get("name", "")) and chat_text == expected_chat:
				args["_chat_test_received"] = "1"
				print("G7_8 CHAT RECEIVE OK from=%s text=%s" % [chat_from, chat_text])
				if args.has("chat-demo"): chat_panel.call_deferred("open_input")
		"leave": _remove_other(int(m.id))
		"revived": Hurt.revived(combat.ctx, String(m.by))
		"bleed":
			if me.crawl: Hurt.die(combat.ctx)
		"pdown":
			if int(m.id) != my_id:
				_log("%s が倒れた" % m.name, Color(1, 0.6, 0.5))
				var po = others.get(int(m.id))
				if po != null: po.rv = maxf(float(po.get("rv", -1.0)), 0.01)
		"prev":   # 仲間が起き上がった
			var po2 = others.get(int(m.id))
			if po2 != null:
				po2.rv = -1.0
				_log("%s が起き上がった" % po2.get("name", ""), Color(0.6, 1, 0.8))
		"door":
			if m.get("open", false): door_open = true; world.set_door_open(true)


func _enter_area(id: String, x: float, z: float) -> void:
	var previous_area := area_id
	area_id = id
	area = GameRules.area(id)
	boss_fighting = false
	var music_name := audio.set_area(area)
	if args.has("bot") and not music_name.is_empty(): print("MUSIC ", music_name)
	for k in mobs.keys(): _remove_mob(k)
	for k in others.keys(): _remove_other(k)
	for te in teles:
		for g in te.meshes: g.queue_free()
	teles.clear()
	combat.ctx.clear_projs()
	items.clear()
	world.load_area(id)
	door_open = false
	_add_marker_nodes()
	combat.ctx.shape = String(area["shape"])   # hurt.gd のハザードの判定（屋内は無効）
	combat.ctx.hazards = area.get("hazards", [])
	me.x = x; me.z = z; me.a = PI; me.transit = false
	portals.clear()
	for e in area.get("exits", []):
		portals.append({"to": e["to"], "x": float(e["x"]), "z": float(e["z"]), "r": float(e["r"]), "armed": Vector2(e["x"] - x, e["z"] - z).length() > float(e["r"]) + 1.5})
	if area["type"] == "town" or area["type"] == "camp": me.potions = S["maxPot"]
	if args.has("at") and id == "f1_field":
		var p := String(args["at"]).split(","); me.x = float(p[0]); me.z = float(p[1])
	_banner(area["name"])
	if previous_area != id:
		_quest_event({"type": "visit", "area": id})


var me_node: Node3D
func _add_marker_nodes() -> void:
	npc_nodes.clear()
	me_node = GameVisuals.player(Color.html(ch["color"]))
	world.add_child(me_node)
	for npc in QuestModel.npcs_for(area_id):
		var person := GameVisuals.npc(Color.html(String(npc.color)))
		person.position = Vector3(float(npc.x), world.ground_y(float(npc.x), float(npc.z)), float(npc.z))
		world.add_child(person)
		var label := GameVisuals.label(String(npc.name), Color.html(String(npc.color)))
		label.position = person.position + Vector3(0, 2.1, 0)
		world.add_child(label)
		npc_nodes.append({"data": npc, "node": person, "label": label})
	for e in area.get("exits", []):   # 出口の印（光る輪）。行き先の名前
		var ring := MeshInstance3D.new()
		ring.mesh = GameVisuals.shape_mesh({"k": "ring", "r0": 2.4, "r1": 3.0}, 1.0)
		ring.material_override = GameVisuals.mat(Color(0.4, 0.85, 1.0), true, 0.7)
		ring.position = Vector3(e["x"], world.ground_y(e["x"], e["z"]) + 0.06, e["z"])
		world.add_child(ring)
		var dst: Dictionary = GameRules.area(e["to"])
		var lb := GameVisuals.label("▶ " + String(dst["name"]), Color(0.7, 0.95, 1))
		lb.position = ring.position + Vector3(0, 2.6, 0)
		world.add_child(lb)


# ---------------------------------------------------------------- スナップショット（snapshot.js onSnap）
func _on_snap(m: Dictionary) -> void:
	if m.ar != area_id: return
	var next_boss_fighting := String(m.get("bs", "idle")) == "fight"
	if next_boss_fighting != boss_fighting:
		boss_fighting = next_boss_fighting
		_update_boss_music()
	elif boss_fighting:
		_update_boss_music() # ブラウザ版と同じく、戦闘中の部屋への出入りも反映する
	if bool(int(m.get("door", 0))) != door_open:
		door_open = bool(int(m.get("door", 0))); world.set_door_open(door_open)
	var seen_p := {}
	for p in m.p:
		var id := int(p[0])
		if id == my_id:
			if me.crawl and float(p[21]) >= 0.0: me.rv = float(p[21])   # 倒れている間の起こすゲージ（snapshot.js）
			continue
		seen_p[id] = true
		var o = others.get(id)
		if o == null:
			o = {"id": id, "node": GameVisuals.player(Color.html(String(p[8]))), "label": GameVisuals.label(String(p[1])), "x": float(p[2]), "z": float(p[3]), "a": float(p[4]), "rv": -1.0, "revHitT": 0.0}
			world.add_child(o.node); world.add_child(o.label)
			others[id] = o
		o.tx = float(p[2]); o.tz = float(p[3]); o.ta = float(p[4]); o.rv = float(p[21])   # rv: 倒れている間の起こすゲージ（-1 = 立っている）
		PlayerView.on_snap_player(o, p)
		o.label.text = "%s Lv%d%s" % [p[1], int(p[7]), "（倒れている）" if int(p[21]) >= 0 else ""]
	for id in others.keys():
		if not seen_p.has(id): _remove_other(id)
	var seen_m := {}
	var fl := int(area["floor"])
	for r in m.m:
		var id := int(r[0])
		seen_m[id] = true
		var mb = mobs.get(id)
		var kind := int(r[9]); var elite := int(r[11])
		if mb == null:
			var md: Dictionary; var sc: float; var nm: String; var rad: float
			if kind == 2:
				md = GameRules.data()["floors"][fl - 1]["boss"]; sc = float(md.get("scale", 1)); nm = String(md["name"]); rad = 0.9 * sc
			else:
				md = GameRules.mob_def(fl, int(r[1]))
				var mds = md.get("scale")
				sc = float(mds) if mds != null else (0.8 if kind == 1 else (1.9 if elite == 3 else (1.3 if elite > 0 else 1.0)))
				nm = ("門番" if elite == 2 else ("精鋭 " if elite > 0 else "") + String(md["name"]))
				rad = 0.75 * sc
			var mob_node: Node3D = GameVisuals.mob(String(md["t"]), Color.html(String(md["color"])), sc, kind == 2)
			MobAnim.setup(mob_node)
			mb = {"node": mob_node, "label": GameVisuals.label(nm),
				"id": id, "x": float(r[2]), "z": float(r[3]), "a": float(r[4]), "rad": rad, "kind": kind, "name": nm, "localT": -9.0, "hp": float(r[5]), "elite": elite, "flash": 0.0}
			world.add_child(mb.node); world.add_child(mb.label)
			mobs[id] = mb
		mb.tx = float(r[2]); mb.tz = float(r[3]); mb.ta = float(r[4]); mb.mhp = float(r[6]); mb.lv = int(r[7]); mb.st = int(r[8]); mb.enraged = int(r[10]) != 0; mb.stunT = float(r[15])
		mb.guard = r.size() > 16 and int(r[16]) != 0   # 番兵の盾（正面からの攻撃は 3 割）
		if t_now - mb.localT > 0.4: mb.hp = float(r[5])
		else: mb.hp = minf(mb.hp, float(r[5]))
		mb.label.text = "%s Lv%d\n%d / %d" % [mb.name, mb.lv, int(mb.hp), int(mb.mhp)]
	for id in mobs.keys():
		if not seen_m.has(id): _remove_mob(id)


func _remove_mob(id) -> void:
	var mb = mobs.get(id)
	if mb == null: return
	mb.node.queue_free(); mb.label.queue_free()
	mobs.erase(id)


func _remove_other(id) -> void:
	var o = others.get(id)
	if o == null: return
	o.node.queue_free(); o.label.queue_free()
	others.erase(id)


func _on_mob_die(m: Dictionary) -> void:
	var mb = mobs.get(int(m.id))
	if mb == null: return
	var is_boss := bool(m.get("boss", int(mb.get("kind", 0)) == 2))
	if not is_boss: _sfx("mobdie") # snapshot.js onMobDie L182: audio.sfx('mobdie')
	mobs.erase(int(m.id))
	mb.label.queue_free()
	if is_boss and boss_fighting:
		boss_fighting = false
		_update_boss_music()
	var tw := create_tween()
	tw.tween_property(mb.node, "scale", Vector3.ONE * 0.01, 0.35)
	tw.tween_callback(mb.node.queue_free)


func _update_boss_music() -> void:
	if audio == null: return
	var music_name := audio.set_boss_state(boss_fighting, _is_in_boss_lair())
	if args.has("bot") and not music_name.is_empty(): print("MUSIC ", music_name)


# 対応元: public/shared/areas.js lairOf() / inLair(pad=20)。迷宮 B 点と細長い部屋の範囲を使う。
func _is_in_boss_lair() -> bool:
	if String(area.get("type", "")) != "labyrinth": return false
	var pts: Dictionary = area.get("pts", {})
	var boss_points: Array = pts.get("B", [])
	if boss_points.is_empty() or not boss_points[0] is Dictionary: return false
	var boss_point: Dictionary = boss_points[0]
	var center := Vector2(float(boss_point.get("x", 0.0)), float(boss_point.get("z", 0.0)))
	if not bool(area.get("longArena", false)):
		return Vector2(me.get("x", 0.0), me.get("z", 0.0)).distance_to(center) < 40.0

	var rows: Array = area.get("rows", [])
	var width := int(area.get("W", 0))
	var height := int(area.get("H", 0))
	var bc := int(boss_point.get("c", -1))
	var br := int(boss_point.get("r", -1))
	if rows.is_empty() or width <= 0 or height <= 0 or bc < 0 or br < 0: return false
	var c0 := bc; var c1 := bc; var r0 := br; var r1 := br
	while _boss_cell_open(c0 - 1, br, rows, width, height): c0 -= 1
	while _boss_cell_open(c1 + 1, br, rows, width, height): c1 += 1
	while _boss_cell_open(bc, r0 - 1, rows, width, height): r0 -= 1
	while _boss_cell_open(bc, r1 + 1, rows, width, height): r1 += 1
	var cell := float(area.get("cell", 4.0))
	var half := cell * 0.5
	var x0 := (float(c0) - float(width) * 0.5 + 0.5) * cell - half - 20.0
	var x1 := (float(c1) - float(width) * 0.5 + 0.5) * cell + half + 20.0
	var z0 := (float(r0) - float(height) * 0.5 + 0.5) * cell - half - 20.0
	var z1 := (float(r1) - float(height) * 0.5 + 0.5) * cell + half + 20.0
	return me.x > x0 and me.x < x1 and me.z > z0 and me.z < z1


func _boss_cell_open(c: int, r: int, rows: Array, width: int, height: int) -> bool:
	if r < 0 or r >= height or c < 0 or c >= width: return false
	var row := String(rows[r])
	var cell := row.substr(c, 1)
	return cell == "." or cell == "B"


# ---------------------------------------------------------------- 予告と被弾（hurt.js）
func _on_tele(m: Dictionary) -> void:
	var col := Color.html(String(m.get("c", "#ff3030")))
	var meshes := []
	for s in m.sh:
		var y: float = world.ground_y(float(s["x"]), float(s["z"])) + 0.05
		var out := MeshInstance3D.new(); out.mesh = GameVisuals.shape_mesh(s, 1.0); out.material_override = GameVisuals.mat(col, true, 0.22)
		out.position = Vector3(s["x"], y, s["z"]); world.add_child(out)
		var fill := MeshInstance3D.new(); fill.material_override = GameVisuals.mat(col, true, 0.45)
		fill.position = Vector3(s["x"], y + 0.01, s["z"]); world.add_child(fill)
		meshes.append(out); meshes.append(fill)
	teles.append({"meshes": meshes, "sh": m.sh, "start": t_now, "dur": float(m.d) / 1000.0, "dmg": float(m.dmg), "src": int(m.get("src", 0)), "kd": bool(m.get("kd", false)), "color": col})
	for s in m.sh:
		if Vector2(float(s["x"]) - me.x, float(s["z"]) - me.z).length() < 25.0:
			_sfx("telegraph") # hurt.js onTele L15: 近くの攻撃予告で audio.sfx('telegraph')
			break


func _update_teles() -> void:
	for i in range(teles.size() - 1, -1, -1):
		var te = teles[i]
		var k := clampf((t_now - te.start) / maxf(te.dur, 0.01), 0, 1)
		for j in te.sh.size():
			te.meshes[j * 2 + 1].mesh = GameVisuals.shape_mesh(te.sh[j], k)
		if k >= 1.0:
			Hurt.resolve_tele(combat.ctx, te)
			for g in te.meshes: g.queue_free()
			teles.remove_at(i)


# ---------------------------------------------------------------- 狙い（combat.js aimAngle）。攻撃・技・ダメージは combat.gd と skills/game_ctx.gd
func _aim_angle() -> float:
	return atan2(mouse_ground.x - me.x, mouse_ground.z - me.z)


## actions.js tryDodge（入力の向きは呼ぶ側が決める）。ダウン中は受け身（hurt.gd try_tech）
func _try_dodge(dir: Vector2) -> void:
	if S.is_empty(): return
	if me.downT > 0:
		Hurt.try_tech(combat.ctx)
		return
	if me.dead or me.crawl or me.dodgeCd > 0 or me.dashT > 0 or me.staggerT > 0: return
	if dir == Vector2.ZERO: dir = Vector2(sin(me.a), cos(me.a))
	var after: bool = combat.ctx.has_buff("afterimage")
	me.dodgeDir = dir.normalized(); me.dodgeT = 0.38
	me.iframe = (0.6 if after else 0.32) + float(S["iframeBonus"])
	# 待ち時間は必ず無敵より長い（連打で無敵をつなげない）
	me.dodgeCd = maxf(float(S["dodgeCd"]) * (0.25 if after else 1.0), me.iframe + 0.15)
	me.swingT = 9.0; me.skillT = -1.0; me.motion = ""; me.charging = false; me.guarding = false
	_sfx("dodge") # actions.js tryDodge L408: audio.sfx('dodge')
	WFX.fx_call("onDodge")   # 速射・罠師 など
	if combat.tf("t_wind"):
		var keep := []
		for b in me.buffs:
			if b["id"] != "wind": keep.append(b)
		me.buffs = keep
		me.buffs.append({"id": "wind", "label": "疾風", "t": 1.9, "max": 1.9, "mods": {"move": 40}, "color": 0x9affc8})


## 今の入力の向きで回避（Space。受け身は hurt.gd からここへ来る）
func _try_dodge_input() -> void:
	_try_dodge(Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down")))


## 力尽きたキャラクターのセーブを消す（hurt.gd die → ctx.character_discard）。確認用の引数のキャラは保存していないので消さない
func _discard_char() -> void:
	if not (args.has("wk") or args.has("wt") or args.has("sv") or args.has("fall")): DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))


func _use_potion() -> void:
	if me.dead or me.crawl or me.potions <= 0 or me.potCd > 0 or me.hp >= S["mhp"]: return
	me.potions -= 1; me.potCd = float(GameRules.data()["balance"]["potionCooldown"])
	var h := minf(S["mhp"] - me.hp, S["mhp"] * float(GameRules.data()["balance"]["potionHeal"]))
	me.hp += h
	_sfx("potion") # actions.js usePotion L418: audio.sfx('potion')
	_float(Vector3(me.x, 2.2, me.z), "+%d" % int(h), Color(0.5, 1, 0.6))


## 調べる（F）: 近くのレバー・宝箱（4m 以内）。ブラウザ版の画面のボタン（main.js interact）にあたる
func _interact() -> void:
	if me.dead or me.crawl: return
	var target: Variant = _nearest_interact()
	if not target is Dictionary: return
	match String(target.kind):
		"gate":
			gate_panel.open()
		"npc":
			npc_panel.open(target.npc)
		"smith":
			smith_panel.open(String(target.npc.name))
		"box":
			box_panel.open()
		"lever":
			net.send({"t": "interact", "what": "lever"})
		"chest":
			if not _chest_open(target.chest):
				net.send({"t": "interact", "what": "chest", "id": target.chest.id})


## progress.js nearestInteract と同じ優先順・距離で対象と案内文を返す。
func _nearest_interact() -> Variant:
	if me.get("dead", false): return null
	var meta: Dictionary = GameMapPanel.MAP_META.get(area_id, {})
	var gate: Variant = meta.get("gateData", null)
	if gate is Dictionary and _distance_to(gate) < 6.0:
		return {"kind": "gate", "label": "転移門を使う（ポーション補充済み）"}
	for entry in npc_nodes:
		var npc: Dictionary = entry.data
		if Vector2(float(npc.x) - float(me.x), float(npc.z) - float(me.z)).length() >= 3.2: continue
		var kind := "smith" if String(npc.get("role", "")) == "smith" else "npc"
		return {"kind": kind, "npc": npc, "label": "%s%s" % [String(npc.name), "（鍛冶屋）" if kind == "smith" else "と話す"]}
	var box: Variant = meta.get("boxData", null)
	if box is Dictionary and _distance_to(box) < 3.8:
		return {"kind": "box", "label": "共有ボックスを開く（装備の受け渡し）"}
	if area.get("shape", "") == "grid":
		var levers: Array = area.get("pts", {}).get("L", [])
		if not levers.is_empty() and not door_open and _distance_to(levers[0]) < 3.5:
			return {"kind": "lever", "label": "レバーを引く"}
	for chest in area.get("chests", []):
		if _distance_to(chest) < 3.5:
			return {"kind": "chest", "chest": chest, "label": "宝箱は空っぽだ（しばらくすると中身が戻る）" if _chest_open(chest) else "宝箱を開ける"}
	return null


func _distance_to(point: Dictionary) -> float:
	return Vector2(float(point.get("x", 0.0)) - float(me.get("x", 0.0)), float(point.get("z", 0.0)) - float(me.get("z", 0.0))).length()


func _chest_open(chest: Dictionary) -> bool:
	var chests: Dictionary = ch.get("chests", {})
	var opened := float(chests.get(String(chest.get("id", area_id)), 0.0))
	var cooldown := 300.0 if bool(chest.get("big", false)) else 600.0
	return Time.get_unix_time_from_system() * 1000.0 - opened < cooldown * 1000.0


func _quest_event(event: Dictionary) -> void:
	var changed: Array = QuestModel.progress(ch, event)
	for quest in changed:
		var state: Dictionary = QuestModel.quest_state(ch, String(quest.id))
		if bool(state.get("done", false)):
			hud_ui.toast("クエスト達成：「%s」 依頼人に報告しよう" % String(quest.name), Color.html("#ffd84a"), true)
			_sfx("clear")
		else:
			hud_ui.toast("%s %d / %d" % [String(quest.name), int(state.p), int(quest.n)], Color.html("#bfe6ff"))
	if not changed.is_empty():
		_save_char()
		_refresh_quests()


func _refresh_quests() -> void:
	if hud_ui != null: hud_ui.set_quests(QuestModel.hud_entries(ch))
	if npc_panel != null and npc_panel.panel.visible: npc_panel.refresh()


func _accept_quest(quest_id: String) -> void:
	var was_active: bool = QuestModel.quest_state(ch, quest_id) != null
	var changed: Array = QuestModel.accept(ch, quest_id, area_id)
	var q: Dictionary = QuestModel.index().get(quest_id, {})
	if q.is_empty(): return
	if not was_active and QuestModel.quest_state(ch, quest_id) is Dictionary:
		_sfx("equip")
		_save_char()
		_refresh_quests()
	if not changed.is_empty(): _refresh_quests()
	if npc_panel != null: npc_panel.refresh()


func _claim_quest(quest_id: String) -> void:
	var quest: Dictionary = QuestModel.index().get(quest_id, {})
	var state: Variant = QuestModel.quest_state(ch, quest_id)
	if quest.is_empty() or not state is Dictionary or not bool(state.get("done", false)) or bool(state.get("claimed", false)): return
	state["claimed"] = true
	var reward: Dictionary = QuestModel.reward(quest)
	if reward.has("rarity"):
		var floor_n := int(area.get("floor", 1))
		var item := items.make_quest_reward(quest, floor_n, randf())
		items.spawn_quest_reward(item, float(me.x) + randf_range(-1.0, 1.0), float(me.z) + randf_range(1.0, 2.0))
	if reward.has("title"):
		var title_id := String(reward.title)
		if not ch.get("titles", {}).get(title_id, false):
			if not ch.get("titles") is Dictionary: ch["titles"] = {}
			ch["titles"][title_id] = true
			ch["inv"].push_front(QuestModel.make_title_item(title_id))
			var title: Dictionary = QuestModel.TITLES.get(title_id, {})
			hud_ui.banner("称号を獲得", "「%s」" % String(title.get("name", title_id)), GameItems.rarity_color(int(title.get("rarity", 3))), 3.0)
			hud_ui.toast("称号「%s」：%s" % [String(title.get("name", title_id)), String(title.get("desc", ""))], GameItems.rarity_color(int(title.get("rarity", 3))), true)
	if reward.has("potion"):
		ch["potBonus"] = int(ch.get("potBonus", 0)) + int(reward.potion)
		_calc()
		me["potions"] = int(S["maxPot"])
		hud_ui.toast("ポーションの所持数が %d になった" % int(S["maxPot"]), Color.html("#6aff8a"))
	hud_ui.banner("クエスト完了", String(quest.name), Color.html("#ffd84a"), 2.0)
	_sfx("levelup")
	_gain_xp(int(reward.xp))
	_save_char()
	_refresh_quests()
	if npc_panel != null: npc_panel.refresh()


func _box_open() -> void:
	net.send({"t": "box", "op": "open"})


func _box_close() -> void:
	net.send({"t": "box", "op": "close"})


func _box_put(item: Dictionary) -> void:
	if not ch.get("inv", []).has(item): return
	if not item.has("id") or String(item.id) == "":
		GameItems.item_seq += 1
		item["id"] = "box_%d_%d" % [Time.get_ticks_usec(), GameItems.item_seq]
	_save_char()
	net.send({"t": "box", "op": "put", "item": item, "ref": item.id})


func _box_take(item: Dictionary) -> void:
	net.send({"t": "box", "op": "take", "uid": item.get("uid", -1)})


func _warp_floor(floor_n: int) -> void:
	if floor_n < 1 or floor_n > unlocked or me.dead or me.crawl: return
	net.send({"t": "warp", "floor": floor_n})
	gate_panel.close()


func _run_ui_test() -> void:
	await get_tree().create_timer(0.25).timeout
	var check := String(args.get("test-ui", ""))
	match check:
		"npc":
			var npc: Dictionary = QuestModel.npcs_for("f1_town")[0]
			me.x = float(npc.x); me.z = float(npc.z)
			_interact()
			var accept_button := _find_button(npc_panel.panel, "受ける")
			if npc_panel.panel.visible and accept_button != null:
				accept_button.emit_signal("pressed")
				if QuestModel.quest_state(ch, "q_slime") is Dictionary:
					print("G7_7 NPC ACCEPT OK")
				else:
					print("G7_7 NPC ACCEPT NG")
			else:
				print("G7_7 NPC ACCEPT NG")
		"smith":
			var npc: Dictionary = QuestModel.npcs_for("f1_town")[3]
			me.x = float(npc.x); me.z = float(npc.z)
			_interact()
			print("G7_7 SMITH OPEN %s" % ("OK" if smith_panel.panel.visible else "NG"))
		"box":
			var box: Dictionary = GameMapPanel.MAP_META["f1_town"].boxData
			me.x = float(box.x); me.z = float(box.z)
			await get_tree().create_timer(0.15).timeout
			_interact()
			await get_tree().create_timer(0.5).timeout
			print("G7_7 BOX OPEN %s" % ("OK" if box_panel.panel.visible and box_loaded else "NG"))
		"chat":
			var message := "G7-8 chat roundtrip"
			chat_panel.open_input()
			chat_panel.input.text = message
			chat_panel.input.emit_signal("text_submitted", message)
			await get_tree().create_timer(0.6).timeout
			print("G7_8 CHAT ROUNDTRIP %s" % ("OK" if args.get("_chat_test_received", "") == "1" else "NG"))
		_:
			print("G7_7 UI TEST NG unknown=%s" % check)
	await get_tree().create_timer(0.2).timeout
	get_tree().quit()


func _send_chat_demo() -> void:
	if chat_panel == null: return
	chat_panel.open_input()
	var message := "G7-8 chat preview"
	chat_panel.input.text = message
	chat_panel.input.emit_signal("text_submitted", message)


func _find_button(root: Node, text: String) -> Button:
	if root is Button and root.text == text:
		return root
	for child in root.get_children():
		var found := _find_button(child, text)
		if found != null: return found
	return null


func _gain_xp(n: int) -> void:
	ch["xp"] = int(ch["xp"]) + n
	if args.has("bot"): print("XP +%d -> %d/%d lv%d" % [n, int(ch["xp"]), GameRules.xp_to_next(int(ch["lv"])), int(ch["lv"])])
	_float(Vector3(me.x, 3.0, me.z), "+%d EXP" % n, Color(0.7, 0.9, 1))
	var leveled := false
	while int(ch["lv"]) < GameRules.data()["levels"].size() and int(ch["xp"]) >= GameRules.xp_to_next(int(ch["lv"])):
		ch["xp"] = int(ch["xp"]) - GameRules.xp_to_next(int(ch["lv"])); ch["lv"] = int(ch["lv"]) + 1; leveled = true
	if leveled:
		_calc(); me.hp = S["mhp"]
		_sfx("levelup") # actions.js gainXp L441: audio.sfx('levelup')
		_banner("LEVEL UP  Lv %d" % int(ch["lv"]))
	_save_char()


func _moveme(dx: float, dz: float) -> void:
	var c := GameRules.collide(area, me.x + dx, me.z + dz, 0.45, door_open)
	me.x = c.x; me.z = c.y


# ---------------------------------------------------------------- 毎フレーム（loop.js update）
func _process(real_dt: float) -> void:
	var dt := real_dt
	if args.has("panel"):
		dt = 0.0
	else:
		t_now += real_dt
	if combat.ctx.hit_stop > 0.0:   # ヒットストップ: 被弾の瞬間だけ動きをほぼ止めて、手応えを出す（loop.js loop。時刻は止めない）
		combat.ctx.hit_stop -= real_dt
		dt *= 0.1
	if args.has("quit") and t_now > float(args["quit"]):
		if args.has("bot"): print("FXTODO ", JSON.stringify(combat.ctx.todo))   # 見た目・音で呼ばれたが未実装の名前と回数（G8）
		get_tree().quit()
	if not started and area_id == "f1_town":
		preview_t += real_dt * 0.05
		cam.position = Vector3(sin(preview_t) * 40.0, 16.0, cos(preview_t) * 40.0)
		cam.look_at(Vector3(0.0, 2.0, 0.0), Vector3.UP)
	if args.has("shot") and area_id == args.get("shotarea", "f1_field") and (args.has("panel") or mobs.size() > 0 or area["type"] in ["town", "camp"]):
		# 撮影（確認用）: そのエリアに入って敵が見えてから <フレーム数> 後に撮って終わる。--shot=<フレーム数>:<出力.png>
		var sp: PackedStringArray = String(args["shot"]).split(":", true, 1)
		args["_frames"] = int(args.get("_frames", 0)) + 1
		if int(args["_frames"]) == int(sp[0]):
			get_viewport().get_texture().get_image().save_png(sp[1])
			print("SHOT ", sp[1])
			get_tree().quit()
	if not started or area.is_empty(): return
	_apply_requested_panel()
	_tick_waypoint()
	if args.has("fall") and not args.has("_fell") and t_now > float(args["fall"]) and not me.dead and not me.crawl:
		# 確認用: その秒に倒れる（這いずり → 一人なら力尽きる → 始め直す、の流れを確かめる）。--fall=<秒>
		args["_fell"] = "1"; me.hp = 0.0; Hurt.fall(combat.ctx)
	for i in range(pending.size() - 1, -1, -1):
		if pending[i].at <= t_now:
			var p = pending[i]; pending.remove_at(i)
			if not me.dead and not me.crawl: p.fn.call()
	combat.tick_timers(dt)   # loop.js: 動きの時間・待ち時間・バフの時間
	# しばらく倒れずにいると、起こしにくさが 1 段階戻る
	if me.downs > 0 and not me.crawl and t_now - me.downsAt > float(Hurt.REVIVE()["decay"]): me.downs -= 1; me.downsAt = t_now
	items.update(dt)
	var safe: bool = area["type"] == "town" or area["type"] == "camp"
	_update_mouse()
	if me.dead:
		if t_now > me.deathAt:
			ch = {}; _load_char(); _reset_me(); net.ws.close(); started = false
			_start(ch["name"], args.get("server", "ws://127.0.0.1:8080/ws"))
	else:
		var mv := Vector2.ZERO if _modal_panel_open() else Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down"))
		if args.has("bot"): mv = _bot(dt)
		if me.crawl:
			Hurt.crawl_tick(combat.ctx, dt, mv.x, mv.y)   # 這いずり: ゆっくり動けるだけ
		else:
			me.moving = false
			# 押し戻し・吹き飛び（ほかの動きと重ねて流される）
			if me.kbT > 0:
				var kk := minf(dt, me.kbT)
				me.kbT -= dt
				_moveme(me.kbX * kk, me.kbZ * kk)
			if me.downT > 0:
				# ダウン中は動けない（回避で受け身）
				me.downT -= dt
				if me.downT <= 0: Hurt.get_up(combat.ctx)
			elif me.sweepT > 0:
				pass   # ガードカウンターの回転なぎ払い中は、その場から動かない
			elif me.dodgeT > 0:
				me.dodgeT -= dt
				var sp := 17.0 * float(S["wc"]["roll"]) * float(S["dodgeDist"])
				_moveme(me.dodgeDir.x * sp * dt, me.dodgeDir.y * sp * dt)
			elif me.dashT > 0:   # 踏み込み・後退（actions.js dash）
				var ddt := minf(dt, me.dashT)
				me.dashT -= dt
				_moveme(sin(me.dashA) * me.dashSpeed * ddt, cos(me.dashA) * me.dashSpeed * ddt)
			elif me.staggerT > 0:
				pass   # ひるみ中は動けない
			elif mv != Vector2.ZERO:
				var busy: bool = me.swingT < me.swingDur or me.skillT >= 0
				var slow := 0.45 if (me.guarding or busy) else (0.4 if me.charging and me.chargeT > GameCombat.charge_min() else 1.0)
				var hz = Hurt.hazard_at(combat.ctx, me.x, me.z)
				var spd: float = 7.2 * (1 + (float(S["move"]) + combat.ctx.buff_mod("move") + (25.0 if combat.desperate() else 0.0) + combat.title_move()) / 100.0) * slow * (0.5 if hz != null and hz["kind"] == "sand" else 1.0)
				var n := mv.normalized()
				_moveme(n.x * spd * dt, n.y * spd * dt)
				me.moving = true
				me.walkT += dt
				me.stepT -= dt
				if me.stepT <= 0.0:
					me.stepT = 0.32
					_sfx("step") # loop.js update L179: audio.sfx('step')
				if not busy and not me.charging and not me.guarding: me.a = atan2(n.x, n.y)
			# 盾槍: 強攻撃を溜めている間はガードを構える
			if me.charging and me.chargeT >= GameCombat.charge_min() and Hurt.can_guard(combat.ctx):
				me.guarding = true; me.guardStart = t_now; me.counter = false
				_sfx("equip") # loop.js update L182: auto-guard starts and audio.sfx('equip')
			if me.guarding: me.a = _aim_angle()
		if not me.crawl:
			# 出口
			if not me.transit:
				for p in portals:
					var d := Vector2(p.x - me.x, p.z - me.z).length()
					if d < p.r and p.armed:
						me.transit = true; net.send({"t": "move", "to": p.to}); break
					if d > p.r + 1.5: p.armed = true
			# 溜め・通常攻撃の予約・技の時間・飛ぶ斬撃（loop.js）
			combat.tick_actions(dt, safe)
			Hurt.hazard_tick(combat.ctx, dt)   # 毒沼は踏んでいる間ダメージ
			if safe: me.hp = minf(S["mhp"], me.hp + S["mhp"] * 0.1 * dt); me.potions = S["maxPot"]
	Hurt.guard_regen(combat.ctx, dt)
	Hurt.sweep_tick(combat.ctx, dt)
	me.sweep = Hurt.sweep_angle(me.sweepT) if me.sweepT > 0 else -1.0   # 回転なぎ払いの回った角度（player_view が読む）
	combat.ctx.shake_v = maxf(0.0, combat.ctx.shake_v - dt * 2.5)
	_update_teles()
	_sync_nodes(dt)
	send_t -= dt
	if send_t <= 0:
		send_t = 0.066
		net.send({"t": "st", "x": snappedf(me.x, 0.01), "z": snappedf(me.z, 0.01), "a": snappedf(me.a, 0.01), "hp": int(round(me.hp)), "mhp": S["mhp"], "lv": ch["lv"],
			"dead": me.dead, "wk": S["wk"], "wr": S["wr"], "sw": me.sw, "sk": me.sk, "dg": 1 if me.dodgeT > 0 else 0, "gd": 1 if me.guarding else 0, "wst": PlayerView.weapon_style(ch["eq"].get("weapon")), "arm": PlayerView.armor_look(ch["eq"].get("armor")),
			"pm": me.motion, "pt": snappedf(float(me.motionT), 0.001), "rc": 2 if me.downT > 0 else (1 if me.hurtT > 0 else 0), "cl": 1 if WFX.fx_some("shieldBack") else 0})
	_update_hud()


func _unhandled_input(ev: InputEvent) -> void:
	if not started: return
	if ev is InputEventKey and ev.pressed and not ev.echo:
		if ev.keycode == KEY_F2 and args.has("debug"):
			debug_panel.toggle()
			get_viewport().set_input_as_handled()
			return
		if ev.keycode in [KEY_ENTER, KEY_KP_ENTER]:
			if _modal_panel_open(): return
			chat_panel.open_input()
			get_viewport().set_input_as_handled()
			return
		if ev.physical_keycode == KEY_M:
			if _modal_panel_open(): return
			_toggle_map()
			get_viewport().set_input_as_handled()
			return
		if ev.keycode == KEY_ESCAPE:
			if chat_panel != null and chat_panel.is_editing():
				chat_panel.close_input()
			elif _modal_panel_open():
				_close_top_panel()
			else:
				_toggle_settings()
			get_viewport().set_input_as_handled()
			return
		if ev.physical_keycode == KEY_K:
			if _modal_panel_open(): return
			_toggle_tree()
			get_viewport().set_input_as_handled()
			return
		if ev.physical_keycode == KEY_I:
			if _modal_panel_open(): return
			_toggle_inventory()
			get_viewport().set_input_as_handled()
			return
		if _modal_panel_open(): return
	if _modal_panel_open(): return
	if ev is InputEventMouseButton:
		if ev.button_index == MOUSE_BUTTON_LEFT:
			if ev.pressed: combat.press()
			else: combat.release()   # input.js pointerUp（溜めた長さで通常攻撃か強攻撃）
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_RIGHT:
			combat.try_weapon_skill()
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_WHEEL_UP: dist = maxf(8.0, dist * 0.9)
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = minf(60.0, dist / 0.9)
	if ev is InputEventKey and ev.pressed and not ev.echo:
		if ev.physical_keycode == KEY_SPACE: _try_dodge_input()
		elif ev.physical_keycode == KEY_R: _use_potion()
		elif ev.physical_keycode == KEY_F: _interact()
		elif ev.physical_keycode == KEY_Q: combat.try_tree_skill(0)
		elif ev.physical_keycode == KEY_E: combat.try_tree_skill(1)


func _modal_panel_open() -> bool:
	var inventory_open: bool = items != null and items.inventory_panel != null and items.inventory_panel.panel.visible
	var tree_open: bool = tree_panel != null and tree_panel.is_open()
	var map_open: bool = hud_ui != null and hud_ui.map_panel != null and hud_ui.map_panel.is_open()
	var settings_open: bool = hud_ui != null and hud_ui.settings_panel != null and hud_ui.settings_panel.is_open()
	var chat_editing: bool = chat_panel != null and chat_panel.is_editing()
	var debug_open: bool = debug_panel != null and debug_panel.is_open()
	return inventory_open or tree_open or map_open or settings_open or chat_editing or debug_open or (npc_panel != null and npc_panel.panel.visible) or (smith_panel != null and smith_panel.panel.visible) or (box_panel != null and box_panel.panel.visible) or (gate_panel != null and gate_panel.panel.visible)


func _close_top_panel() -> void:
	if debug_panel != null and debug_panel.is_open(): debug_panel.close()
	elif chat_panel != null and chat_panel.is_editing(): chat_panel.close_input()
	elif npc_panel != null and npc_panel.panel.visible: npc_panel.close()
	elif smith_panel != null and smith_panel.panel.visible: smith_panel.close()
	elif box_panel != null and box_panel.panel.visible: box_panel.close()
	elif gate_panel != null and gate_panel.panel.visible: gate_panel.close()
	elif items != null and items.inventory_panel != null and items.inventory_panel.panel.visible: items.toggle()
	elif tree_panel != null and tree_panel.is_open(): tree_panel.close()
	elif hud_ui.map_panel != null and hud_ui.map_panel.is_open(): hud_ui.map_panel.close_panel()
	elif hud_ui.settings_panel != null and hud_ui.settings_panel.is_open(): hud_ui.settings_panel.close_panel()
	_sync_modal_ui()


func _toggle_inventory() -> void:
	if items == null:
		return
	_close_map_settings()
	if tree_panel != null and tree_panel.is_open():
		tree_panel.close()
	items.toggle()


func _toggle_tree() -> void:
	_close_map_settings()
	if items != null and items.inventory_panel != null and items.inventory_panel.panel.visible: items.toggle()
	if tree_panel != null:
		tree_panel.toggle()
	_sync_modal_ui()


func _toggle_map() -> void:
	if hud_ui == null or hud_ui.map_panel == null: return
	if hud_ui.map_panel.is_open():
		hud_ui.map_panel.close_panel()
	else:
		_open_map("area")
	_sync_modal_ui()


func _open_map(tab: String) -> void:
	if hud_ui == null or hud_ui.map_panel == null: return
	_close_inventory_tree_map()
	hud_ui.map_panel.show_tab(tab)
	hud_ui.map_panel.open()
	_sync_modal_ui()


func _toggle_settings() -> void:
	if hud_ui == null or hud_ui.settings_panel == null: return
	if hud_ui.settings_panel.is_open():
		hud_ui.settings_panel.close_panel()
	else:
		_open_settings()
	_sync_modal_ui()


func _open_settings() -> void:
	if hud_ui == null or hud_ui.settings_panel == null: return
	_close_inventory_tree_map()
	hud_ui.settings_panel.open()
	_sync_modal_ui()


func _close_map_settings() -> void:
	if hud_ui == null: return
	if hud_ui.map_panel != null: hud_ui.map_panel.close_panel()
	if hud_ui.settings_panel != null: hud_ui.settings_panel.close_panel()


func _close_inventory_tree_map() -> void:
	_close_map_settings()
	if items != null and items.inventory_panel != null and items.inventory_panel.panel.visible: items.toggle()
	if tree_panel != null and tree_panel.is_open(): tree_panel.close()


func _map_pin(world_pos: Vector2) -> void:
	if hud_ui == null or hud_ui.map_panel == null: return
	var scale := float(hud_ui.map_panel.area_canvas.tf.get("sc", 0.0))
	if scale <= 0.0: return
	var old: Variant = ch.get("pin", null)
	var remove := old is Dictionary and String(old.get("area", "")) == area_id and Vector2(float(old.get("x", 0.0)) - world_pos.x, float(old.get("z", 0.0)) - world_pos.y).length() < 14.0 / scale
	if remove:
		ch["pin"] = null
	else:
		ch["pin"] = {"area": area_id, "x": snappedf(world_pos.x, 0.1), "z": snappedf(world_pos.y, 0.1)}
		var area_name := String(area.get("name", area_id))
		hud_ui.toast("📍 ピンを立てた（%s）" % area_name, Color.html("#ffd84a"))
	_save_char()
	_sfx("ui")
	hud_ui.map_panel.refresh_now()


func _map_warp(destination: String) -> void:
	if not GameRules.data().get("areas", {}).has(destination): return
	var target: Dictionary = GameRules.area(destination)
	var meta: Dictionary = GameMapPanel.MAP_META.get(destination, {})
	var waypoint_ok := bool(meta.get("gate", false)) or bool(ch.get("waypoints", {}).get(destination, false))
	if not waypoint_ok or int(target.get("floor", 1)) > unlocked or destination == area_id or bool(me.get("dead", false)) or bool(me.get("crawl", false)):
		return
	net.send({"t": "wp", "to": destination})
	if hud_ui != null and hud_ui.map_panel != null: hud_ui.map_panel.close_panel()
	_sync_modal_ui()


func _apply_requested_panel() -> void:
	if area_id != String(args.get("shotarea", "f1_field")): return
	if args.has("demo-ui") and not demo_panel_applied:
		demo_panel_applied = true
		match String(args["demo-ui"]):
			"dialog":
				var npc: Dictionary = QuestModel.npcs_for(area_id)[0]
				me.x = float(npc.x); me.z = float(npc.z)
				me.a = 0.0
				npc_panel.open(npc)
			"quests":
				var captain_for_quest: Dictionary = QuestModel.npcs_for(area_id)[0]
				me.x = float(captain_for_quest.x); me.z = float(captain_for_quest.z); me.a = 0.0
				ch["quests"] = {"q_slime": {"p": 0}}
				_refresh_quests()
			"smith":
				var smith: Dictionary = QuestModel.npcs_for(area_id)[3]
				me.x = float(smith.x); me.z = float(smith.z)
				me.a = 0.0
				smith_panel.open(String(smith.name))
			"box":
				var box: Dictionary = GameMapPanel.MAP_META[area_id].boxData
				me.x = float(box.x); me.z = float(box.z)
				me.a = 0.0
				call_deferred("_open_box_demo")
			"gate":
				var gate: Dictionary = GameMapPanel.MAP_META[area_id].gateData
				me.x = float(gate.x); me.z = float(gate.z)
				me.a = 0.0
				gate_panel.open()
			_: pass
		if hud_ui != null:
			hud_ui.help_panel.visible = false
			hud_ui.banner("")
			for toast in hud_ui.toast_stack.get_children():
				hud_ui.toast_stack.remove_child(toast)
				toast.queue_free()
	if shot_panel_applied or not args.has("panel"): return
	match String(args["panel"]):
		"map-area": _open_map("area")
		"map-floor": _open_map("floor")
		"settings": _open_settings()
		_: return
	# 比較撮影ではエリア移動時の一時バナーを消し、ブラウザ capture-browser.mjs と同じ状態にする。
	if hud_ui != null: hud_ui.banner("")
	if hud_ui != null: hud_ui.help_panel.visible = false
	shot_panel_applied = true


func _open_box_demo() -> void:
	await get_tree().create_timer(0.15).timeout
	box_panel.open()
	await get_tree().create_timer(0.5).timeout
	if box_loaded and not ch.get("inv", []).is_empty():
		_box_put(ch["inv"][0])
		await get_tree().create_timer(0.5).timeout


func _tick_waypoint() -> void:
	var waypoint: Variant = area.get("waypoint", null)
	if not waypoint is Dictionary or bool(ch.get("waypoints", {}).get(area_id, false)): return
	var distance := Vector2(float(waypoint.x) - float(me.x), float(waypoint.z) - float(me.z)).length()
	if distance > 3.0: return
	if not ch.get("waypoints") is Dictionary: ch["waypoints"] = {}
	ch["waypoints"][area_id] = true
	_save_char()
	_sfx("levelup")
	if hud_ui != null:
		hud_ui.toast("◇ ワープポイントを解放した（%s）" % String(area.get("name", area_id)), Color.html("#9ae8ff"))
		if hud_ui.map_panel != null: hud_ui.map_panel.refresh_now()


func _sync_modal_ui() -> void:
	if hud_ui == null or hud_ui.toast_stack == null:
		return
	# CSS の z-index:20 の画面を HUD の通知より手前に置き、透過面から文字が見えないようにする。
	hud_ui.toast_stack.visible = not _modal_panel_open()


func _tree_spent_total() -> float:
	var total := 0.0
	for value in ch.get("tree", {}).values():
		total += float(value)
	return total


func _tree_spent_tab(tab_id: String) -> float:
	var trees: Dictionary = GameRules.data().get("trees", {})
	if not trees.has(tab_id):
		return 0.0
	var total := 0.0
	var levels: Dictionary = ch.get("tree", {})
	for node in trees[tab_id].get("nodes", []):
		total += float(levels.get(String(node.get("id", "")), 0))
	return total


func _on_tree_action(event_name: String, payload: Dictionary) -> void:
	match event_name:
		"tree:tab":
			tree_panel.tree_tab = String(payload.get("tab", tree_panel.tree_tab))
			_sfx("ui")
		"tree:learn": _learn_legacy_node(String(payload.get("node", "")))
		"tree:refund": _refund_legacy_node(String(payload.get("node", "")))
		"tree:slot": _set_tree_slot(int(payload.get("slot", -1)), String(payload.get("skill", "")))
		"tree:reset":
			if GameWTree.has_wtree(tree_panel.tree_tab): _reset_weapon_tree(tree_panel.tree_tab)
			else: _reset_legacy_tree()
		"wt:learn": _learn_weapon_node(String(payload.get("node", "")))
		"wt:refund": _refund_weapon_node(String(payload.get("node", "")))
		"wt:choose": _choose_weapon_branch(String(payload.get("node", "")), String(payload.get("b", "")))
	_tree_panel_refresh()


func _tree_panel_refresh() -> void:
	if tree_panel != null and tree_panel.is_open():
		tree_panel.refresh()
	if hud_ui != null:
		hud_ui.update()


func _can_learn_legacy_node(id: String) -> bool:
	var index: Dictionary = GameRules.node_index()
	if not index.has(id):
		return false
	var node: Dictionary = index[id]
	var levels: Dictionary = ch.get("tree", {})
	if int(levels.get(id, 0)) >= int(node.get("max", 1)):
		return false
	if _tree_spent_total() >= maxf(0.0, float(ch.get("lv", 1)) - 1.0):
		return false
	return _tree_spent_tab(String(node.get("tree", ""))) >= float(node.get("tier", 0)) * 2.0


func _learn_legacy_node(id: String) -> void:
	if not _can_learn_legacy_node(id):
		_sfx("ui")
		return
	if not ch.get("tree") is Dictionary: ch["tree"] = {}
	ch["tree"][id] = int(ch["tree"].get(id, 0)) + 1
	var node: Dictionary = GameRules.node_index()[id]
	var active := String(node.get("active", ""))
	if active != "":
		var slots: Array = ch.get("slots", [null, null])
		if not slots.has(active):
			var empty := slots.find(null)
			if empty >= 0: slots[empty] = active
		ch["slots"] = slots
	_sfx("levelup")
	_calc()
	_save_char()


func _refund_legacy_node(id: String) -> void:
	var index: Dictionary = GameRules.node_index()
	var levels: Dictionary = ch.get("tree", {})
	if not index.has(id) or int(levels.get(id, 0)) <= 0:
		_sfx("ui")
		return
	var node: Dictionary = index[id]
	var after: Dictionary = levels.duplicate()
	after[id] = int(after[id]) - 1
	var learned: Array = []
	for key in after.keys():
		if int(after[key]) > 0 and index.get(String(key), {}).get("tree") == node.get("tree"):
			learned.append(String(key))
	for key in learned:
		var tier := int(index[key].get("tier", 0))
		if tier <= 0:
			continue
		var below := 0
		for lower_id in learned:
			if int(index[lower_id].get("tier", 0)) < tier:
				below += int(after[lower_id])
		if below < tier * 2:
			hud_ui.toast("上の段のノードの前提になっているため戻せません", Color.html("#f88"))
			_sfx("ui")
			return
	if int(after[id]) <= 0:
		after.erase(id)
		var active := String(node.get("active", ""))
		if active != "":
			var slots: Array = ch.get("slots", [null, null])
			for i in range(slots.size()):
				if slots[i] == active: slots[i] = null
			ch["slots"] = slots
	ch["tree"] = after
	_sfx("ui")
	_calc()
	_save_char()
	hud_ui.toast("%sを1ポイント戻しました" % String(node.get("name", id)), Color.html("#9fe"))


func _reset_legacy_tree() -> void:
	ch["tree"] = {}
	ch["slots"] = [null, null]
	_sfx("ui")
	_calc()
	_save_char()
	hud_ui.toast("スキルポイントを振り直しました", Color.html("#9fe"))


func _set_tree_slot(slot_index: int, skill_id: String) -> void:
	if slot_index < 0 or slot_index > 1 or skill_id == "":
		return
	var learned := false
	for state_value in ch.get("wt", {}).values():
		if state_value is Dictionary and state_value.get("lv", {}) is Dictionary and int(state_value["lv"].get(skill_id, 0)) > 0:
			learned = true
			break
	if not learned:
		var index: Dictionary = GameRules.node_index()
		for id in ch.get("tree", {}):
			if int(ch["tree"][id]) > 0 and String(index.get(String(id), {}).get("active", "")) == skill_id:
				learned = true
				break
	if not learned:
		return
	var slots: Array = ch.get("slots", [null, null])
	while slots.size() < 2: slots.append(null)
	var other := slots.find(skill_id)
	if other >= 0: slots[other] = null
	slots[slot_index] = skill_id
	ch["slots"] = slots
	_sfx("equip")
	_save_char()


func _learn_weapon_node(id: String) -> void:
	if not GameWTree.wt_learn(ch, id):
		_sfx("ui")
		return
	var node: Dictionary = GameWTree.wtnode()[id]
	var state: Dictionary = GameWTree.wt_of(ch, String(node["wk"]))
	var level := int(state["lv"].get(id, 0))
	if node.get("kind") == "skill" and level == 1:
		var slots: Array = ch.get("slots", [null, null])
		if not slots.has(id):
			var empty := slots.find(null)
			if empty >= 0: slots[empty] = id
		ch["slots"] = slots
	if level == 3:
		hud_ui.toast("%s：形を A・B から選べます" % String(node.get("name", id)), Color.html("#ffd84a"))
	_sfx("levelup")
	_calc()
	_save_char()


func _choose_weapon_branch(id: String, branch: String) -> void:
	if not GameWTree.wt_choose(ch, id, branch):
		_sfx("ui")
		return
	var node: Dictionary = GameWTree.wtnode()[id]
	_sfx("perfect")
	hud_ui.toast("%sが「%s」に変化" % [String(node.get("name", id)), String(node.get(branch, {}).get("name", ""))], Color.html("#ffd84a"))
	_calc()
	_save_char()


func _refund_weapon_node(id: String) -> void:
	var index: Dictionary = GameWTree.wtnode()
	if not index.has(id):
		_sfx("ui")
		return
	var node: Dictionary = index[id]
	var wk := String(node["wk"])
	var state: Dictionary = GameWTree.wt_of(ch, wk)
	var kind := String(node.get("kind", ""))
	var can_refund := false
	if kind == "ks1": can_refund = state.get("ks1") == id and state.get("ks2") == null
	elif kind == "ks2": can_refund = state.get("ks2") == id
	else: can_refund = int(state["lv"].get(id, 0)) > 0
	if not can_refund:
		_sfx("ui")
		return
	var spent := int(GameWTree.wt_spent(state))
	var cost := 30 + spent * 5 # weapon-tree.js WT_REFUND_COST: 30 + spent * 5
	if int(ch.get("gold", 0)) < cost:
		hud_ui.toast("1ポイント戻すには %dG 必要です" % cost, Color.html("#f88"))
		_sfx("ui")
		return
	ch["gold"] = int(ch.get("gold", 0)) - cost
	if kind == "ks1" or kind == "ks2":
		state[kind] = null
	else:
		if int(state["lv"].get(id, 0)) == 3: state["br"].erase(id)
		state["lv"][id] = int(state["lv"][id]) - 1
		if int(state["lv"][id]) <= 0:
			state["lv"].erase(id)
			var slots: Array = ch.get("slots", [null, null])
			for i in range(slots.size()):
				if slots[i] == id: slots[i] = null
			ch["slots"] = slots
	_sfx("ui")
	hud_ui.toast("%sを1ポイント戻しました（-%dG）" % [String(node.get("name", id)), cost], Color.html("#9fe"))
	_calc()
	_save_char()


func _reset_weapon_tree(wk: String) -> void:
	var state: Dictionary = GameWTree.wt_of(ch, wk)
	var spent := int(GameWTree.wt_spent(state))
	if spent <= 0:
		return
	var cost := 100 + spent * 20 # weapon-tree.js WT_RESET_COST: 100 + spent * 20
	if int(ch.get("gold", 0)) < cost:
		hud_ui.toast("振り直しには %dG 必要です" % cost, Color.html("#f88"))
		_sfx("ui")
		return
	ch["gold"] = int(ch.get("gold", 0)) - cost
	var own := {}
	for id in state["lv"].keys(): own[String(id)] = true
	ch["wt"][wk] = {"lv": {}, "br": {}, "ks1": null, "ks2": null}
	var slots: Array = ch.get("slots", [null, null])
	for i in range(slots.size()):
		if slots[i] != null and own.has(String(slots[i])): slots[i] = null
	ch["slots"] = slots
	WFX.fx_call("treeReset")
	_sfx("ui")
	hud_ui.toast("%sのツリーを振り直しました（-%dG）" % [String(GameRules.data()["weapons"][wk]["name"]), cost], Color.html("#9fe"))
	_calc()
	_save_char()


func _update_mouse() -> void:
	var mp := get_viewport().get_mouse_position()
	var o := cam.project_ray_origin(mp); var d := cam.project_ray_normal(mp)
	var y: float = world.ground_y(me.x, me.z)
	if absf(d.y) > 1e-4:
		mouse_ground = o + d * ((y - o.y) / d.y)


## 確認用の自動操作: いちばん近い敵へ歩き、射程に入ったら向いて攻撃。HP が 4 割を切ったら回復薬
func _bot(_dt: float) -> Vector2:
	if args.has("goto"):
		for e in area.get("exits", []):
			if e["to"] == args["goto"]:
				var dv := Vector2(float(e["x"]) - me.x, float(e["z"]) - me.z)
				return dv.normalized() if dv.length() > 0.5 else Vector2.ZERO
		if area_id == args["goto"]: return Vector2.ZERO
	var best = null; var bd := 1e9
	for id in mobs:
		var mb = mobs[id]
		var d := Vector2(mb.x - me.x, mb.z - me.z).length()
		if d < bd: bd = d; best = mb
	if me.hp < S["mhp"] * 0.4: _use_potion()
	# 落とし物: 近くに敵がいなければ拾いに行く。拾った武器・防具・装飾は、攻撃力・HP が上がるなら装備する（確認用）
	var dr = items.nearest()
	if dr != null and (best == null or bd > 6.0) and Vector2(dr.x - me.x, dr.z - me.z).length() < 25.0:
		return Vector2(dr.x - me.x, dr.z - me.z).normalized()
	_bot_equip()
	if best == null: return Vector2.ZERO
	var dir := Vector2(best.x - me.x, best.z - me.z)
	me.a = atan2(dir.x, dir.y)
	mouse_ground = Vector3(best.x, 0, best.z)
	var engage: float = float(S["W"]["baseRange"]) if S["W"].get("ranged", false) else float(S["W"]["range"])   # 弓は引かずに撃つ矢の届く所まで寄る
	if bd < engage + best.rad - 0.3:
		# 溜めている間は離すまで待つ（溜めきるか 1.5 秒で離して強攻撃）
		if me.charging:
			if me.chargeT >= float(S["chargeMax"]) or t_now - bot_t > 1.5: combat.release()
			return Vector2.ZERO
		if combat.can_act():
			if me.wsCd <= 0: combat.try_weapon_skill()   # 武器スキル（右クリック）
			else:
				for i in 2:   # Q / E のツリースキル（スロットに入れてあれば。待ち時間と武器の合わなさは try_tree_skill が見る）
					var id = ch["slots"][i] if i < ch["slots"].size() else null
					if id != null and S["actives"].has(String(id)) and float(me.tcd.get(String(id), 0.0)) <= 0:
						combat.try_tree_skill(i); return Vector2.ZERO
				if me.swingT >= me.swingDur and t_now - bot_t > 3.0:   # 3 秒に 1 回は溜めて強攻撃（左長押し）
					bot_t = t_now; combat.press()
				else: me.queued = t_now + 0.25   # 短押し（通常攻撃）
		else: me.queued = t_now + 0.25
		return Vector2.ZERO
	return dir.normalized()


func _bot_equip() -> void:
	var inv: Array = ch.get("inv", [])
	for i in inv.size():
		var it: Dictionary = inv[i]
		var slot := String(it.get("slot", ""))
		if not slot in ["weapon", "armor", "acc"]: continue
		if slot == "weapon" and args.has("wk"): continue   # --wk で武器を決めた確認では、拾った武器に替えない
		if slot == "weapon" and not GameRules.data()["weapons"].get(it.get("kind", ""), {}).get("melee", false): continue
		var before := S.duplicate()
		var trial := ch.duplicate(true); trial["eq"][slot] = it
		var after := GameRules.calc_stats(trial)
		if float(after.atk) + float(after.mhp) * 0.1 > float(before.atk) + float(before.mhp) * 0.1:
			items.equip(i)
			print("EQUIP %s atk %d->%d hp %d->%d" % [it.get("name"), int(before.atk), int(S.atk), int(before.mhp), int(S.mhp)])
			return


# ---------------------------------------------------------------- 表示
func _sync_nodes(dt: float) -> void:
	var gy: float = world.ground_y(me.x, me.z)
	me_node.position = Vector3(me.x, gy, me.z)
	me_node.rotation.y = me.a
	me_node.visible = not me.dead
	me_node.scale = Vector3(1, 0.35, 1) if me.crawl else Vector3.ONE
	# 動き（仮）: 歩くと上下に弾み、振りの間は体をひねる（ゲームの部品ごとの動きは未）
	var k := clampf(me.swingT / maxf(me.swingDur, 0.05), 0, 1)
	var sword: Node3D = me_node.get_node_or_null("Sword")
	if sword != null: sword.rotation.y = lerp(1.2, -1.2, k) if k < 1 else 0.0
	else: me_node.rotation.y = me.a + (sin(k * PI) * 0.6 if k < 1 else 0.0)
	if not me.crawl: me_node.position.y += absf(sin(t_now * 9.0)) * 0.08 if Input.get_vector("move_left", "move_right", "move_up", "move_down") != Vector2.ZERO else 0.0
	for id in mobs:
		var mb = mobs[id]
		var f := minf(1.0, dt * 10.0)
		mb.x = lerp(float(mb.x), float(mb.tx), f); mb.z = lerp(float(mb.z), float(mb.tz), f)
		mb.a = mb.a + GameRules.ang_diff(mb.ta, mb.a) * f
		var y: float = world.ground_y(mb.x, mb.z)
		mb.node.position = Vector3(mb.x, y, mb.z); mb.node.rotation.y = mb.a
		var since_hit := t_now - float(mb.get("localT", -9.0))
		var hit_flash := maxf(0.0, 1.0 - maxf(0.0, since_hit) * 6.0)
		MobAnim.animate(mb.node, {"t": t_now + float(mb.id), "st": int(mb.get("st", 0)), "stun": float(mb.get("stunT", 0.0)) > 0.0,
			"flash": maxf(float(mb.get("flash", 0.0)), hit_flash), "enraged": bool(mb.get("enraged", false))})
		mb.label.position = Vector3(mb.x, y + 2.4 * mb.node.scale.y + 0.4, mb.z)
	for id in others:
		var o = others[id]
		var f := minf(1.0, dt * 10.0)
		o.x = lerp(float(o.x), float(o.tx), f); o.z = lerp(float(o.z), float(o.tz), f); o.a = o.a + GameRules.ang_diff(o.ta, o.a) * f
		var y: float = world.ground_y(o.x, o.z)
		o.node.position = Vector3(o.x, y, o.z); o.node.rotation.y = o.a
		o.label.position = Vector3(o.x, y + 2.3, o.z)
	for i in range(floats.size() - 1, -1, -1):
		var fl = floats[i]
		if not is_instance_valid(fl.node):   # エリアを移ると world の子ごと消える
			floats.remove_at(i)
			continue
		fl.t += dt
		fl.node.position.y += dt * 1.2
		fl.node.modulate.a = 1.0 - fl.t
		if fl.t > 1.0: fl.node.queue_free(); floats.remove_at(i)
	# カメラ（第 3 世代: 俯角 45°・画角 18°・距離 33m。ホイールで距離）
	var tgt := Vector3(me.x, gy, me.z)
	cam.position = tgt + Vector3(0, sin(deg_to_rad(45.0)), cos(deg_to_rad(45.0))) * dist
	if combat.ctx.shake_v > 0.0 and bool(settings.get("shake", true)): cam.position += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * combat.ctx.shake_v * 0.35   # 画面の揺れ（被弾・ガードブレイクなど）
	cam.look_at(tgt, Vector3.UP)
	RenderingServer.global_shader_parameter_set("wa_occ_cam", cam.position)   # 手前の物を点描で抜く（shaders/common.gdshaderinc）
	RenderingServer.global_shader_parameter_set("wa_occ_tgt", tgt + Vector3(0, 0.9, 0))
	RenderingServer.global_shader_parameter_set("wa_occ_r", 2.2 if bool(settings.get("occlusion", true)) else 0.0)
	PlayerView.update_all(self, dt)   # 人物（自分と他の人）の部品ごとの動き（player_view.gd）


func _slash_fx(a: float, rng: float, arc: float) -> void:
	var m := MeshInstance3D.new()
	m.mesh = GameVisuals.shape_mesh({"k": "cone", "len": rng, "arc": arc, "a": a}, 1.0)
	m.material_override = GameVisuals.mat(Color(0.85, 0.95, 1.0), true, 0.5)
	m.position = Vector3(me.x, world.ground_y(me.x, me.z) + 0.9, me.z)
	world.add_child(m)
	var tw := create_tween()
	tw.tween_interval(0.12)
	tw.tween_callback(m.queue_free)


func _float(pos: Vector3, text: String, col: Color) -> void:
	if not bool(settings.get("dmgnum", true)):
		var is_hidden_class := col == Color.WHITE or col == Color(0.6, 1.0, 0.45) or (col == Color(1.0, 0.85, 0.3) and not text.ends_with(" G"))
		if is_hidden_class: return
	var l := GameVisuals.label(text, col)
	l.font_size = 64
	l.position = pos + Vector3(0, world.ground_y(pos.x, pos.z), 0)
	world.add_child(l)
	floats.append({"node": l, "t": 0.0})


func _setup_camera() -> void:
	cam.fov = 18.0; cam.near = 0.3; cam.far = 600.0
	add_child(cam)
	var mp: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/f1_field/map.json")).get("post", {})
	var pm := ShaderMaterial.new()
	pm.shader = preload("res://shaders/post.gdshader")
	pm.set_shader_parameter("exposure", float(mp.get("exposure", 1.0)))
	pm.set_shader_parameter("sat", float(mp.get("sat", 1.0)))
	pm.set_shader_parameter("dof_amt", float(mp.get("dof", 1.0)))
	pm.render_priority = 100
	var q := QuadMesh.new(); q.size = Vector2(2, 2)
	post.mesh = q; post.material_override = pm; post.extra_cull_margin = 16384
	post.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cam.add_child(post)


# ---------------------------------------------------------------- HUD（browser 版の配置・状態表示は scripts/game/hud.gd）
func _setup_hud() -> void:
	add_child(hud)
	var root := Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(root)
	hud_ui = GameHud.new()
	hud_ui.build(root, self)
	items.build_ui(root)
	tree_panel = GameTreePanel.new(self)
	tree_panel.action_sent.connect(_on_tree_action)
	tree_panel.build_ui(root)
	npc_panel = GameNpcPanel.new(self)
	npc_panel.build_ui(root)
	smith_panel = GameSmithPanel.new(self)
	smith_panel.build_ui(root)
	box_panel = GameBoxPanel.new(self)
	box_panel.build_ui(root)
	gate_panel = GameGatePanel.new(self)
	gate_panel.build_ui(root)
	chat_panel = GameChatPanel.new()
	chat_panel.build(root)
	chat_panel.send_requested.connect(_send_chat)
	debug_panel = GameDebugPanel.new()
	debug_panel.build(root, self)
	login_panel = GameLoginPanel.new()
	var fresh_kind := String(ch.get("eq", {}).get("weapon", {}).get("kind", GameRules.data().get("defaultWeapon", "sword")))
	var fresh_color := Color.from_string(String(args.get("color", "#3aa0ff")), Color.html("#3aa0ff"))
	ui.menu = login_panel.build(root, ch, has_saved_character, fresh_kind, fresh_color)
	login_panel.start_requested.connect(func(pname: String, picked_color: Color, kind: String):
		_start(pname, String(args.get("server", "ws://127.0.0.1:8080/ws")), "#" + picked_color.to_html(false), kind)
	)
	login_panel.fresh_requested.connect(_prepare_fresh_character)
	if args.has("inv") or (args.has("inv-demo") and not args.has("demo-ui")): items.toggle()   # 確認用: --inv-demo はサンプルの持ち物と説明も開く
	if args.has("tree-demo"):
		tree_panel.open(tree_panel.tree_tab)
		print("TREE_DEMO_STATE_JSON=", JSON.stringify(ch))
		tree_panel.call_deferred("log_demo_layout")


func _update_hud() -> void:
	if args.has("hud-demo") and not hud_demo_applied and started and area_id == String(args.get("shotarea", "f1_field")):
		hud_demo_applied = true
		_apply_hud_demo()
	hud_ui.set_quests(QuestModel.hud_entries(ch))
	hud_ui.update()
	if debug_panel != null: debug_panel.update()
	if args.has("demo-ui"):
		hud_ui.help_panel.visible = false
		hud_ui.banner("")
		for toast in hud_ui.toast_stack.get_children():
			hud_ui.toast_stack.remove_child(toast)
			toast.queue_free()


## --hud-demo の撮影用に HUD の状態だけを一時設定する。セーブはしない。
func _apply_hud_demo() -> void:
	ch["lv"] = 5
	ch["xp"] = 130
	ch["gold"] = 1234
	ch["slots"] = ["focus", "warstomp"]
	_calc()
	S["actives"] = {"focus": true, "warstomp": true}
	me["hp"] = float(S["mhp"]) * 0.68
	me["potions"] = 2
	me["potCd"] = 0.62
	me["dodgeCd"] = float(S["dodgeCd"]) * 0.55
	me["wsCd"] = float(S["ws"]["cd"]) * 0.4
	me["tcd"] = {"focus": 5.8, "warstomp": 2.1}
	me["buffs"] = [{"id": "focus", "label": "集中", "t": 6.4, "max": 8.0, "mods": {"chargeRate": 100}, "color": 0x9ae8ff}]
	me["charging"] = true
	me["chargeT"] = GameCombat.charge_min() + (float(S["chargeMax"]) - GameCombat.charge_min()) * 0.68
	me["chargeLv"] = 1
	var death_demo := String(args["hud-demo"]) == "death"
	if death_demo:
		me["hp"] = 0.0
		me["dead"] = true
		me["deathAt"] = t_now + 12.3
	hud_ui.help_panel.visible = false
	# 比較撮影はクエスト正本の q_slime 状態を使う。通常時の欄も同じ ch.quests から描く。
	if String(args.get("demo-ui", "")) == "quests":
		ch["quests"] = {"q_slime": {"p": 0}}
		_refresh_quests()
	for toast in hud_ui.toast_stack.get_children():
		hud_ui.toast_stack.remove_child(toast)
		toast.queue_free()
	if death_demo:
		hud_ui.banner("")
	else:
		hud_ui.banner("G7-2  HUD 比較")
		hud_ui.toast("HUD 表示比較", Color.html("#9affc8"))


func _banner(text: String) -> void:
	hud_ui.banner(text)
	_log(text)


func _log(text: String, col := Color(1, 0.95, 0.75)) -> void:
	hud_ui.toast(text, col)
	print("LOG ", text)
