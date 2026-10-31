#!/bin/sh
# Godot のプロジェクト（godot/worldart）を、画面のない環境で仮想の画面 + ソフトウェアの Vulkan（lavapipe）で動かす（L26）。
#   sh tools/worldart/godot/run.sh --import                                   # 初回: アセットを取り込む
#   sh tools/worldart/godot/run.sh -- --shot=F01,F02 --out=/abs/path/folder   # 地図の固定ビューを撮って終わる
# 要るもの: godot 4.3（PATH に）、xvfb-run、mesa-vulkan-drivers（lvp_icd.json）
cd "$(dirname "$0")/../../../godot/worldart"
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json timeout ${T:-1500} xvfb-run -a -s "-screen 0 1532x869x24" godot --path . --resolution 1532x869 "$@" 2>&1 | grep -viE "alsa|audio|status < 0"
