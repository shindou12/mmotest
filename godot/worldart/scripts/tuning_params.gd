extends RefCounted
## 調整パネルと main.gd が共有する設定一覧。

const PARAMS := [
	{"key": "sun", "label": "太陽の強さ", "group": "光", "kind": "slider", "min": 0.0, "max": 8.0, "step": 0.01, "default": 4.0, "choices": []},
	{"key": "sunEl", "label": "太陽の高さ", "group": "光", "kind": "slider", "min": 0.0, "max": 90.0, "step": 1.0, "default": 40.0, "choices": []},
	{"key": "sunAz", "label": "太陽の向き", "group": "光", "kind": "slider", "min": -180.0, "max": 180.0, "step": 1.0, "default": 70.0, "choices": []},
	{"key": "hemi", "label": "空の光", "group": "光", "kind": "slider", "min": 0.0, "max": 3.0, "step": 0.01, "default": 1.6, "choices": []},
	{"key": "exposure", "label": "露出", "group": "色", "kind": "slider", "min": 0.0, "max": 3.0, "step": 0.01, "default": 1.25, "choices": []},
	{"key": "sat", "label": "彩度", "group": "色", "kind": "slider", "min": 0.0, "max": 2.0, "step": 0.01, "default": 0.92, "choices": []},
	{"key": "contrast", "label": "コントラスト", "group": "色", "kind": "slider", "min": 0.5, "max": 1.5, "step": 0.01, "default": 1.0, "choices": []},
	{"key": "wrap", "label": "葉の回り込み", "group": "色", "kind": "slider", "min": 0.0, "max": 2.0, "step": 0.01, "default": 0.5, "choices": []},
	{"key": "lsat", "label": "葉の彩度", "group": "色", "kind": "slider", "min": 0.0, "max": 2.0, "step": 0.01, "default": 0.95, "choices": []},
	{"key": "dof", "label": "ぼかしの強さ", "group": "仕上げ", "kind": "slider", "min": 0.0, "max": 2.0, "step": 0.01, "default": 1.0, "choices": []},
	{"key": "dofTop", "label": "上側のぼかし位置", "group": "仕上げ", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.30, "choices": []},
	{"key": "dofBot", "label": "下側のぼかし位置", "group": "仕上げ", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.80, "choices": []},
	{"key": "vignette", "label": "周辺減光", "group": "仕上げ", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "topDark", "label": "上側の暗がり", "group": "仕上げ", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "vwarm", "label": "暖色", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 30.0, "step": 0.1, "default": 0.0, "choices": []},
	{"key": "vcool", "label": "寒色", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 30.0, "step": 0.1, "default": 0.0, "choices": []},
	{"key": "vdesat", "label": "色抜き", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "vlift", "label": "持ち上げ", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "diff", "label": "にじみ量", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "diffr", "label": "にじみ半径", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 0.1, "step": 0.001, "default": 0.012, "choices": []},
	{"key": "diffmask", "label": "にじみマスク", "group": "研究の切り替え", "kind": "choice", "min": 0.0, "max": 0.0, "step": 1.0, "default": "none", "choices": ["none", "depth", "edge", "lum", "veg", "soft"]},
	{"key": "diffd0", "label": "深度の始点", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "diffd1", "label": "深度の終点", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 1.0, "choices": []},
	{"key": "diffe", "label": "にじみ境界", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.001, "default": 0.08, "choices": []},
	{"key": "bake", "label": "焼き込み光", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.0, "choices": []},
	{"key": "srad", "label": "影の半径", "group": "研究の切り替え", "kind": "slider", "min": 0.0, "max": 16.0, "step": 0.1, "default": 6.0, "choices": []},
]


static func defaults() -> Dictionary:
	var values := {}
	for item in PARAMS:
		values[item.key] = item.default
	return values


static func find(key: String) -> Dictionary:
	for item in PARAMS:
		if item.key == key:
			return item
	return {}
