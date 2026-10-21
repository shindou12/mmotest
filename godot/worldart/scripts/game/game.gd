extends Node3D
## Godot 版のゲームの試作クライアント（L27）。今のサーバー（server.js）にそのままつなぐ。
## ブラウザ版（public/js/game/）から移したもの: 歩く・当たり判定（loop.js moveMe / areas.js collide）、通常攻撃の 3 段（actions.js doSwing・
## strikes.arc、combat.js dealDamage）、回避（tryDodge）、回復薬（usePotion）、敵の予告と被弾（hurt.js onTele・resolveTele・takeDamage）、
## 這いずり・復活・力尽きる（fall・revived・bleed）、経験値とレベル（gainXp）、出口（loop.js の出口）、敵と他の人の表示（snapshot.js onSnap）。
## CP5（combat.gd・items.gd）: 溜め斬り（強攻撃）・片手剣の武器スキル 5 種・飛ぶ斬撃・踏み込み、落とし物を拾う・持ち物・装備（能力値の計算）。
## まだないもの: ツリー・ガード・弓などの武器ごとの技・ボスの弾と演出・人物と敵の本当のモデル。屋内のエリアは仮の壁と床。
## 操作: WASD / 矢印 移動、マウス 狙い、左クリック 攻撃（長押しで溜め斬り）、右クリック 武器スキル、Space 回避、R 回復薬、F 調べる（レバー・宝箱）、I 持ち物、ホイール カメラの距離。
## G1-3b: 技は移した技（scripts/game/skills/）を本物の文脈（skills/game_ctx.gd）でつないだ。戦闘の流れは combat.gd（通常 3 段・溜め・強攻撃・武器スキル・Q/E・バフ・待ち時間・飛ぶ斬撃）。
## 操作の追加: Q / E ツリーのスキル（ch.slots）。キャラクターの保存に tree・prof・wt・slots を足した（ブラウザ版の character-store.js と同じ形）。
## 起動の引数（-- の後）: --server=ws://… --name=… --auto（名前の入力を飛ばす）--bot（自動で敵を探して戦う。確認用）
##   --goto=<エリア>（自動操作がその出口へ歩く）--shot=<フレーム数>:<出力.png>（草原に入って敵が見えてから撮って終わる）--quit=<秒> --at=x,z（草原に入ったらその位置へ）
##   --wk=<武器種>（その武器の初心者の武器を持つ。例 greatsword）--wt=<ノード,...>（武器ツリーを振る。熟練度は 20。<id>:<段階><分岐 A/B> 例 gt_wave,gt_charge:3A,gt_rising:2）
##   --slots=<Q のスキル>,<E のスキル>（例 gt_rising,gt_slam）
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
##   能力値       S.wk（武器種）・S.wr（武器のレア度）・S.chargeMax
## まとめて JavaScript の animatePlayer に渡す形にしたものが me_anim()（loop.js の animatePlayer の引数と同じキー）。
## ================================================================

const SAVE := "user://eterna_godot_char.json"
const GameWTree = preload("res://scripts/game/skills/wtree.gd")
const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")

@onready var world: Node3D = $World
var net := GameNet.new()
var cam := Camera3D.new()
var post := MeshInstance3D.new()
var hud := CanvasLayer.new()

var args := {}
var ch := {}              # キャラクター（保存する）: name・color・lv・xp・gold・wk・watk
var S := {}               # 計算済みの能力値（rules.gd calc_stats）
var me := {}              # 自分の状態（ブラウザ版の state.me にあたる）
var area_id := ""
var area := {}
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

# HUD
var ui := {}


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	world.auto_build = false
	combat = GameCombat.new(self)
	items = GameItems.new(self)
	add_child(net)
	net.message.connect(_on_msg)
	net.closed.connect(func(): _log("サーバーとの接続が切れました", Color(1, 0.4, 0.4)))
	_load_char()
	_setup_camera()
	_setup_hud()
	if args.has("auto") or args.has("bot"):
		_start(args.get("name", ch.get("name", "Godot")), args.get("server", "ws://127.0.0.1:8080/ws"))


# ---------------------------------------------------------------- キャラクター（保存は user://。ブラウザ版のセーブとは別）
func _load_char() -> void:
	if FileAccess.file_exists(SAVE):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
		ch = parsed if parsed is Dictionary else {}
	if ch.is_empty():
		ch = {"name": "Godot", "color": "#448a9b", "lv": 1, "xp": 0, "gold": 0}
	if not ch.has("eq"):   # 初心者の片手剣（ブラウザ版の新しいキャラと同じ: data.js starterWeapon）
		ch["eq"] = {"weapon": {"slot": "weapon", "kind": "sword", "rarity": 1, "ilvl": 1, "affixes": [], "enh": 0, "atk": 6, "name": "初心者の片手剣", "skill": "retreat"}}
	if not ch.has("inv"): ch["inv"] = []
	# 武器ツリー・旧ツリー・熟練度・Q/E のスロット（ブラウザ版 character-store.js と同じ形）
	if not ch.get("tree") is Dictionary: ch["tree"] = {}
	if not ch.get("prof") is Dictionary: ch["prof"] = {}
	if not ch.get("wt") is Dictionary: ch["wt"] = {}
	if not ch.get("slots") is Array: ch["slots"] = [null, null]
	_apply_test_args()
	_calc()


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
	if args.has("slots"):
		var sl := []
		for id in String(args["slots"]).split(",", true):
			sl.append(id if id != "" else null)
		while sl.size() < 2: sl.append(null)
		ch["slots"] = sl.slice(0, 2)


## 初心者の武器（data.js starterWeapon の簡略: 攻撃力 6・並・先頭の武器スキル）
func _starter_weapon(kind: String) -> Dictionary:
	var D := GameRules.data()
	return {"slot": "weapon", "kind": kind, "rarity": 1, "ilvl": 1, "affixes": [], "enh": 0, "atk": 6, "name": "初心者の" + String(D["weapons"][kind]["name"]), "skill": D["weaponSkillPool"][kind][0]}


## 能力値を計算し直す（stats.js calcStats）。戦闘の環境（combat.ctx）にも渡す
func _calc() -> void:
	S = GameRules.calc_stats(ch, me if not me.is_empty() else null, combat.ctx)
	combat.bind()


## 装備を変えたら能力値を計算し直す
func _recalc() -> void:
	_calc()
	_save_char()


func _save_char() -> void:
	if args.has("wk") or args.has("wt"): return   # 確認用に武器・ツリーを引数で入れたキャラは保存しない（本物のセーブを書き換えない）
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	f.store_string(JSON.stringify(ch))


func _reset_me() -> void:
	# ブラウザ版の state.me の初期値（data/game.json の meInit）に、Godot 側の項目を重ねる
	me = GameRules.data()["meInit"].duplicate(true)
	me.merge({"x": 0.0, "z": 0.0, "a": PI, "hp": S["mhp"], "dead": false, "crawl": false, "downs": 0, "downsAt": 0.0,
		"swingT": 9.0, "swingDur": 0.4, "combo": 0, "lastSwing": -9.0, "sw": 0, "sk": 0, "queued": 0.0,
		"dodgeT": 0.0, "dodgeCd": 0.0, "dodgeDir": Vector2.ZERO, "iframe": 0.0, "potions": S["maxPot"], "potCd": 0.0,
		"hurtT": 0.0, "transit": false, "deathAt": 0.0, "charging": false, "chargeT": 0.0, "chargeLv": 0, "wsCd": 0.0, "tcd": {}, "buffs": [],
		"skillT": -1.0, "skillDuration": 0.55, "spin": false, "motion": "", "motionT": 0.0, "heavySwing": false, "bulletT": 0.0,
		"dashT": 0.0, "dashA": 0.0, "dashSpeed": 0.0, "moving": false, "walkT": 0.0}, true)
	combat.bind()
	_calc()   # me.hp を最大 HP に切り詰める・afterStats


func _start(pname: String, url: String) -> void:
	ch["name"] = pname
	_save_char()
	_reset_me()
	ui.menu.visible = false
	started = true
	_log("接続中: " + url)
	net.connect_to(url)
	net.opened.connect(func(): net.send({"t": "hello", "name": ch["name"], "color": ch["color"], "lv": ch["lv"]}), CONNECT_ONE_SHOT)


# ---------------------------------------------------------------- サーバーからのメッセージ（net-client.js onMsg）
func _on_msg(m: Dictionary) -> void:
	match String(m.t):
		"welcome":
			my_id = int(m.id)
			_enter_area(m.area, m.x, m.z)
			if not args.has("town"): net.send({"t": "wp", "to": args.get("start", "f1_field")})   # 試作は草原から
		"warped": _enter_area(m.area, m.x, m.z)
		"snap": _on_snap(m)
		"tele": _on_tele(m)
		"die": _on_mob_die(m)
		"xp": _gain_xp(int(m.n))
		"gold":
			ch["gold"] = int(ch.get("gold", 0)) + int(m.n)
			_float(Vector3(me.x, 2.6, me.z), "+%d G" % int(m.n), Color(1, 0.85, 0.3))
			_save_char()
		"loot": items.on_loot(m)
		"chat": _log(("%s: " % m.from if m.from != "" else "") + String(m.text), Color.html(m.get("color", "#ffffff")))
		"leave": _remove_other(int(m.id))
		"revived": _revived(String(m.by))
		"bleed":
			if me.crawl: _die()
		"pdown": _log("%s が倒れた" % m.name, Color(1, 0.6, 0.5))
		"door":
			if m.get("open", false): door_open = true; world.set_door_open(true)


func _enter_area(id: String, x: float, z: float) -> void:
	area_id = id
	area = GameRules.area(id)
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
	me.x = x; me.z = z; me.a = PI; me.transit = false
	portals.clear()
	for e in area.get("exits", []):
		portals.append({"to": e["to"], "x": float(e["x"]), "z": float(e["z"]), "r": float(e["r"]), "armed": Vector2(e["x"] - x, e["z"] - z).length() > float(e["r"]) + 1.5})
	if area["type"] == "town" or area["type"] == "camp": me.potions = S["maxPot"]
	if args.has("at") and id == "f1_field":
		var p := String(args["at"]).split(","); me.x = float(p[0]); me.z = float(p[1])
	ui.area.text = "第%d層 ・ %s" % [int(area["floor"]), area["name"]]
	_banner(area["name"])


var me_node: Node3D
func _add_marker_nodes() -> void:
	me_node = GameVisuals.player(Color.html(ch["color"]))
	world.add_child(me_node)
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
	if bool(int(m.get("door", 0))) != door_open:
		door_open = bool(int(m.get("door", 0))); world.set_door_open(door_open)
	var seen_p := {}
	for p in m.p:
		var id := int(p[0])
		if id == my_id: continue
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
			mb = {"node": GameVisuals.mob(String(md["t"]), Color.html(String(md["color"])), sc, kind == 2), "label": GameVisuals.label(nm),
				"id": id, "x": float(r[2]), "z": float(r[3]), "a": float(r[4]), "rad": rad, "kind": kind, "name": nm, "localT": -9.0, "hp": float(r[5]), "elite": elite, "flash": 0.0}
			world.add_child(mb.node); world.add_child(mb.label)
			mobs[id] = mb
		mb.tx = float(r[2]); mb.tz = float(r[3]); mb.ta = float(r[4]); mb.mhp = float(r[6]); mb.lv = int(r[7]); mb.stunT = float(r[15])
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
	mobs.erase(int(m.id))
	mb.label.queue_free()
	var tw := create_tween()
	tw.tween_property(mb.node, "scale", Vector3.ONE * 0.01, 0.35)
	tw.tween_callback(mb.node.queue_free)


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
	teles.append({"meshes": meshes, "sh": m.sh, "start": t_now, "dur": float(m.d) / 1000.0, "dmg": float(m.dmg), "src": int(m.get("src", 0)), "kd": m.has("kd")})


func _update_teles() -> void:
	for i in range(teles.size() - 1, -1, -1):
		var te = teles[i]
		var k := clampf((t_now - te.start) / maxf(te.dur, 0.01), 0, 1)
		for j in te.sh.size():
			te.meshes[j * 2 + 1].mesh = GameVisuals.shape_mesh(te.sh[j], k)
		if k >= 1.0:
			_resolve_tele(te)
			for g in te.meshes: g.queue_free()
			teles.remove_at(i)


func _resolve_tele(te: Dictionary) -> void:
	if me.dead or me.crawl: return
	var hit := false
	for s in te.sh:
		if GameRules.in_shape(s, me.x, me.z): hit = true
	if not hit: return
	if me.iframe > 0:
		_float(Vector3(me.x, 2.6, me.z), "JUST回避!", Color(0.6, 1, 1))
		return
	if te.src: net.send({"t": "absorb", "id": te.src})
	var raw: float = te.dmg
	var src = mobs.get(te.src)
	if src != null:   # 敵の正面で受けると 1.3 倍、背後なら 0.7 倍
		var off := absf(GameRules.ang_diff(atan2(me.x - src.x, me.z - src.z), src.a))
		if off < deg_to_rad(60): raw *= 1.3
		elif off > deg_to_rad(120): raw *= 0.7
	_take_damage(raw)


## hurt.js takeDamage のうち、ダメージの式（受ける前の補正・被ダメージ軽減）と武器ツリーの被弾の効果。のけぞり/ダウン・ガードは未
func _take_damage(raw0: float) -> void:
	var raw: float = WFX.fx_reduce("incoming", raw0)   # 狂剣士・捨て身 など
	var back: float = WFX.fx_reduce("drLowHp", 0.0)   # 不撓B「背水」
	# 一時的な被ダメージ軽減は重ねず、いちばん大きいものだけが効く（増える側＝マイナスはすべて足す）。防御（S.def）とは別の段
	var drs := [back, Dmg.wt_dr(combat.ctx), 8.0 if combat.tf("t_relic") else 0.0, 12.0 if combat.tf("t_shell") else 0.0, -15.0 if combat.tf("t_berserk") else 0.0]
	for b in me.buffs: drs.append(float(b["mods"].get("dr", 0.0)))
	var mx := 0.0
	var neg := 0.0
	for v in drs:
		mx = maxf(mx, v)
		neg += minf(0.0, v)
	var dr := clampf(mx + neg, -100.0, 90.0)
	var dmg := maxf(1, roundf(raw * (1 - S["def"] / 100.0) * (1 - dr / 100.0) * randf_range(0.9, 1.1)))
	me.hp -= dmg
	if args.has("bot"): print("HURT %d hp=%d" % [int(dmg), int(me.hp)])
	me.hurtT = 0.25
	_float(Vector3(me.x, 2.2, me.z), str(int(dmg)), Color(1, 0.35, 0.3))
	combat.ctx.add_shake(0.3)
	if S.get("wt") != null: Dmg.wt_on_hurt(combat.ctx, false)
	if me.hp <= 0: _fall()


func _fall() -> void:
	if me.crawl or me.dead: return
	me.downs = mini(3, me.downs + 1); me.downsAt = t_now
	me.crawl = true; me.hp = 0
	net.send({"t": "down", "n": me.downs})
	_banner("倒れた… 仲間の攻撃で起こしてもらえる")


func _revived(by: String) -> void:
	if not me.crawl: return
	me.crawl = false
	me.hp = roundf(S["mhp"] * float(GameRules.data()["revive"]["hp"])); me.iframe = float(GameRules.data()["revive"]["iframe"])
	_banner("%s に起こしてもらった" % by)


func _die() -> void:
	# 協力ハード: 力尽きるとキャラクターは失われる（ブラウザ版と同じ）。5 秒後に新しいキャラで始め直す
	me.dead = true; me.crawl = false
	me.deathAt = t_now + float(GameRules.data()["balance"]["deathSeconds"])
	_banner("力尽きた… キャラクターは失われた")
	if not (args.has("wk") or args.has("wt")): DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))


# ---------------------------------------------------------------- 狙い（combat.js aimAngle）。攻撃・技・ダメージは combat.gd と skills/game_ctx.gd
func _aim_angle() -> float:
	return atan2(mouse_ground.x - me.x, mouse_ground.z - me.z)


## actions.js tryDodge
func _try_dodge(dir: Vector2) -> void:
	if S.is_empty() or me.dead or me.crawl or me.dodgeCd > 0 or me.dashT > 0 or me.staggerT > 0: return
	if dir == Vector2.ZERO: dir = Vector2(sin(me.a), cos(me.a))
	var after: bool = combat.ctx.has_buff("afterimage")
	me.dodgeDir = dir.normalized(); me.dodgeT = 0.38
	me.iframe = (0.6 if after else 0.32) + float(S["iframeBonus"])
	# 待ち時間は必ず無敵より長い（連打で無敵をつなげない）
	me.dodgeCd = maxf(float(S["dodgeCd"]) * (0.25 if after else 1.0), me.iframe + 0.15)
	me.swingT = 9.0; me.skillT = -1.0; me.motion = ""; me.charging = false; me.guarding = false
	WFX.fx_call("onDodge")   # 速射・罠師 など


## hurt.js onJustDodge
func _on_just_dodge() -> void:
	_float(Vector3(me.x, 2.6, me.z), "JUST回避!", Color(0.6, 1, 1))
	if float(S["justbuff"]) > 0: combat.ctx.add_buff("just", "見切り", 3.0, {"dmgp": S["justbuff"]}, 0x9affff)
	WFX.fx_call("justDodge")   # 後の先・残影・見切り眼 など
	if float(S["counter"]) > 0: combat.ctx.strike_circle(me.x, me.z, 5.0, float(S["counter"]) / 100.0, {"type": "proc", "noProc": true})


func _use_potion() -> void:
	if me.dead or me.crawl or me.potions <= 0 or me.potCd > 0 or me.hp >= S["mhp"]: return
	me.potions -= 1; me.potCd = float(GameRules.data()["balance"]["potionCooldown"])
	var h := minf(S["mhp"] - me.hp, S["mhp"] * float(GameRules.data()["balance"]["potionHeal"]))
	me.hp += h
	_float(Vector3(me.x, 2.2, me.z), "+%d" % int(h), Color(0.5, 1, 0.6))


## 調べる（F）: 近くのレバー・宝箱（4m 以内）。ブラウザ版の画面のボタン（main.js interact）にあたる
func _interact() -> void:
	if me.dead or me.crawl: return
	if area["shape"] == "grid" and area.get("gimmick", "") == "lever" and not door_open:
		for L in area["pts"].get("L", []):
			if Vector2(L["x"] - me.x, L["z"] - me.z).length() < 4.0:
				net.send({"t": "interact", "what": "lever"}); return
	for c in area.get("chests", []):
		if Vector2(c["x"] - me.x, c["z"] - me.z).length() < 4.0:
			net.send({"t": "interact", "what": "chest", "id": c["id"]}); return


func _gain_xp(n: int) -> void:
	ch["xp"] = int(ch["xp"]) + n
	if args.has("bot"): print("XP +%d -> %d/%d lv%d" % [n, int(ch["xp"]), GameRules.xp_to_next(int(ch["lv"])), int(ch["lv"])])
	_float(Vector3(me.x, 3.0, me.z), "+%d EXP" % n, Color(0.7, 0.9, 1))
	var leveled := false
	while int(ch["lv"]) < GameRules.data()["levels"].size() and int(ch["xp"]) >= GameRules.xp_to_next(int(ch["lv"])):
		ch["xp"] = int(ch["xp"]) - GameRules.xp_to_next(int(ch["lv"])); ch["lv"] = int(ch["lv"]) + 1; leveled = true
	if leveled:
		_calc(); me.hp = S["mhp"]
		_banner("LEVEL UP  Lv %d" % int(ch["lv"]))
	_save_char()


func _moveme(dx: float, dz: float) -> void:
	var c := GameRules.collide(area, me.x + dx, me.z + dz, 0.45, door_open)
	me.x = c.x; me.z = c.y


# ---------------------------------------------------------------- 毎フレーム（loop.js update）
func _process(dt: float) -> void:
	t_now += dt
	if args.has("quit") and t_now > float(args["quit"]):
		if args.has("bot"): print("FXTODO ", JSON.stringify(combat.ctx.todo))   # 見た目・音で呼ばれたが未実装の名前と回数（G8）
		get_tree().quit()
	if args.has("shot") and area_id == args.get("shotarea", "f1_field") and (mobs.size() > 0 or area["type"] in ["town", "camp"]):
		# 撮影（確認用）: そのエリアに入って敵が見えてから <フレーム数> 後に撮って終わる。--shot=<フレーム数>:<出力.png>
		var sp: PackedStringArray = String(args["shot"]).split(":", true, 1)
		args["_frames"] = int(args.get("_frames", 0)) + 1
		if int(args["_frames"]) == int(sp[0]):
			get_viewport().get_texture().get_image().save_png(sp[1])
			print("SHOT ", sp[1])
			get_tree().quit()
	if not started or area.is_empty(): return
	for i in range(pending.size() - 1, -1, -1):
		if pending[i].at <= t_now:
			var p = pending[i]; pending.remove_at(i)
			if not me.dead and not me.crawl: p.fn.call()
	combat.tick_timers(dt)   # loop.js: 動きの時間・待ち時間・バフの時間
	items.update(dt)
	var safe: bool = area["type"] == "town" or area["type"] == "camp"
	_update_mouse()
	if me.dead:
		if t_now > me.deathAt:
			ch = {}; _load_char(); _reset_me(); net.ws.close(); started = false
			_start(ch["name"], args.get("server", "ws://127.0.0.1:8080/ws"))
	else:
		var mv := Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down"))
		if args.has("bot"): mv = _bot(dt)
		if me.crawl:
			if mv != Vector2.ZERO: _moveme(mv.normalized().x * float(GameRules.data()["revive"]["crawl"]) * dt, mv.normalized().y * float(GameRules.data()["revive"]["crawl"]) * dt)
		elif me.dodgeT > 0:
			me.dodgeT -= dt
			var sp := 17.0 * float(S["roll"])
			_moveme(me.dodgeDir.x * sp * dt, me.dodgeDir.y * sp * dt)
		elif me.dashT > 0:   # 踏み込み・後退（actions.js dash）
			var ddt := minf(dt, me.dashT)
			me.dashT -= dt
			_moveme(sin(me.dashA) * me.dashSpeed * ddt, cos(me.dashA) * me.dashSpeed * ddt)
		elif mv != Vector2.ZERO:
			var busy: bool = me.swingT < me.swingDur or me.skillT >= 0
			var slow := 0.45 if busy else (0.4 if me.charging and me.chargeT > GameCombat.charge_min() else 1.0)
			var spd: float = 7.2 * (1 + (float(S["move"]) + combat.ctx.buff_mod("move") + (25.0 if combat.desperate() else 0.0) + combat.title_move()) / 100.0) * slow
			var n := mv.normalized()
			_moveme(n.x * spd * dt, n.y * spd * dt)
			me.moving = true
			me.walkT += dt
			if not busy and not me.charging: me.a = atan2(n.x, n.y)
		# 出口
		if not me.transit:
			for p in portals:
				var d := Vector2(p.x - me.x, p.z - me.z).length()
				if d < p.r and p.armed:
					me.transit = true; net.send({"t": "move", "to": p.to}); break
				if d > p.r + 1.5: p.armed = true
		# 溜め・通常攻撃の予約・技の時間・飛ぶ斬撃（loop.js）
		combat.tick_actions(dt, safe)
		if safe: me.hp = minf(S["mhp"], me.hp + S["mhp"] * 0.1 * dt); me.potions = S["maxPot"]
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
	if ev is InputEventMouseButton:
		if ev.button_index == MOUSE_BUTTON_LEFT:
			if ev.pressed: combat.press()
			else: combat.release()   # input.js pointerUp（溜めた長さで通常攻撃か強攻撃）
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_RIGHT:
			combat.try_weapon_skill()
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_WHEEL_UP: dist = maxf(8.0, dist * 0.9)
		elif ev.pressed and ev.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = minf(60.0, dist / 0.9)
	if ev is InputEventKey and ev.pressed and not ev.echo:
		if ev.physical_keycode == KEY_SPACE: _try_dodge(Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down")))
		elif ev.physical_keycode == KEY_R: _use_potion()
		elif ev.physical_keycode == KEY_F: _interact()
		elif ev.physical_keycode == KEY_Q: combat.try_tree_skill(0)
		elif ev.physical_keycode == KEY_E: combat.try_tree_skill(1)
		elif ev.physical_keycode == KEY_I: items.toggle()


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
	if bd < float(S["W"]["range"]) + best.rad - 0.3:
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
		fl.t += dt
		fl.node.position.y += dt * 1.2
		fl.node.modulate.a = 1.0 - fl.t
		if fl.t > 1.0: fl.node.queue_free(); floats.remove_at(i)
	# カメラ（第 3 世代: 俯角 45°・画角 18°・距離 33m。ホイールで距離）
	var tgt := Vector3(me.x, gy, me.z)
	cam.position = tgt + Vector3(0, sin(deg_to_rad(45.0)), cos(deg_to_rad(45.0))) * dist
	cam.look_at(tgt, Vector3.UP)
	RenderingServer.global_shader_parameter_set("wa_occ_cam", cam.position)   # 手前の物を点描で抜く（shaders/common.gdshaderinc）
	RenderingServer.global_shader_parameter_set("wa_occ_tgt", tgt + Vector3(0, 0.9, 0))
	RenderingServer.global_shader_parameter_set("wa_occ_r", 2.2)
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


# ---------------------------------------------------------------- HUD（最小限: HP・レベルと経験値・回復薬・お金・エリア名・通知）
func _setup_hud() -> void:
	add_child(hud)
	var root := Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(root)
	var box := VBoxContainer.new(); box.position = Vector2(16, 16)
	root.add_child(box)
	ui.area = Label.new(); box.add_child(ui.area)
	ui.hp = ProgressBar.new(); ui.hp.custom_minimum_size = Vector2(320, 22); ui.hp.show_percentage = false
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(0.85, 0.25, 0.25); ui.hp.add_theme_stylebox_override("fill", sb)
	box.add_child(ui.hp)
	ui.hpl = Label.new(); box.add_child(ui.hpl)
	ui.xp = ProgressBar.new(); ui.xp.custom_minimum_size = Vector2(320, 8); ui.xp.show_percentage = false
	box.add_child(ui.xp)
	ui.info = Label.new(); box.add_child(ui.info)
	ui.banner = Label.new(); ui.banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; ui.banner.add_theme_font_size_override("font_size", 34)
	root.add_child(ui.banner)
	ui.banner.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE); ui.banner.offset_top = 90; ui.banner.offset_bottom = 140
	ui.log = RichTextLabel.new(); ui.log.scroll_following = true; ui.log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ui.log)
	ui.log.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT); ui.log.offset_left = 16; ui.log.offset_right = 540; ui.log.offset_top = -190; ui.log.offset_bottom = -16
	ui.help = Label.new(); ui.help.text = "WASD 移動  左 攻撃（長押し 溜め斬り）  右 武器スキル\nSpace 回避  R 回復薬  F 調べる  I 持ち物  ホイール 距離"; ui.help.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	root.add_child(ui.help)
	ui.help.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT); ui.help.offset_left = -560; ui.help.offset_top = -64; ui.help.offset_right = -16; ui.help.offset_bottom = -12
	items.build_ui(root)
	if args.has("inv"): items.toggle()   # 確認用: 持ち物の画面を開いて始める
	# はじめの画面（名前とサーバー）
	ui.menu = PanelContainer.new()
	root.add_child(ui.menu)
	ui.menu.set_anchors_and_offsets_preset(Control.PRESET_CENTER); ui.menu.offset_left = -230; ui.menu.offset_right = 230; ui.menu.offset_top = -130; ui.menu.offset_bottom = 130
	var mv := VBoxContainer.new(); mv.custom_minimum_size = Vector2(440, 0); ui.menu.add_child(mv)
	var title := Label.new(); title.text = "浮遊城エテルナ（Godot 試作）"; title.add_theme_font_size_override("font_size", 26); mv.add_child(title)
	var l1 := Label.new(); l1.text = "名前"; mv.add_child(l1)
	ui.name_edit = LineEdit.new(); ui.name_edit.text = ch.get("name", "Godot") if not ch.is_empty() else "Godot"; mv.add_child(ui.name_edit)
	var l2 := Label.new(); l2.text = "サーバー（npm start で立てたゲームのサーバー）"; mv.add_child(l2)
	ui.url_edit = LineEdit.new(); ui.url_edit.text = args.get("server", "ws://127.0.0.1:8080/ws"); mv.add_child(ui.url_edit)
	var btn := Button.new(); btn.text = "はじめる"; mv.add_child(btn)
	btn.pressed.connect(func(): _start(ui.name_edit.text, ui.url_edit.text))


func _update_hud() -> void:
	ui.hp.max_value = S["mhp"]; ui.hp.value = me.hp
	ui.hpl.text = "HP %d / %d   %s" % [int(me.hp), int(S["mhp"]), "（倒れている）" if me.crawl else ""]
	ui.xp.max_value = GameRules.xp_to_next(int(ch["lv"])); ui.xp.value = int(ch["xp"])
	var wsn: String = String(S["ws"].get("name", "?")) if S.has("ws") else "?"
	ui.info.text = "%s  Lv %d   回復薬 %d   %d G\n武器スキル %s %s%s" % [ch["name"], int(ch["lv"]), int(me.potions), int(ch.get("gold", 0)), wsn,
		"（あと %.1f 秒）" % me.wsCd if me.wsCd > 0 else "（使える）", "   溜め %d%%" % int(minf(1.0, me.chargeT / S["chargeMax"]) * 100) if me.charging and me.chargeT >= GameCombat.charge_min() else ""]
	if ui.banner.has_meta("t") and t_now > float(ui.banner.get_meta("t")): ui.banner.text = ""


func _banner(text: String) -> void:
	ui.banner.text = text
	ui.banner.set_meta("t", t_now + 2.5)
	_log(text)


func _log(text: String, col := Color(1, 0.95, 0.75)) -> void:
	ui.log.push_color(col); ui.log.add_text(text + "\n"); ui.log.pop()
	print("LOG ", text)
