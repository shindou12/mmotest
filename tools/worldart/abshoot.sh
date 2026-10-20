#!/bin/sh
# アイデアの入／切の撮影（L22）。地図・カメラ・地形・配置・光は固定し、URL の引数 1 つだけを変える。
#   sh tools/worldart/abshoot.sh <出力フォルダ>
#   base = 地図の既定（01 は切、02 葉の透け・04 球状の法線・05 回り込む光は入）
#   g1 = 01 を入れる（gblend=1） / t0 = 02 を切る（trans=0） / n0 = 04 を切る（fnorm=card: 板の向きの法線） / w0 = 05 を切る（wrap=0）
OUT=${1:-art/shots/ab}
for c in "base:" "g1:gblend=1" "t0:trans=0" "n0:fnorm=card" "w0:wrap=0"; do
  n=${c%%:*}; x=${c#*:}
  node tools/worldart/views.mjs mihon2 $OUT/mihon2/$n B01,B02,B03,near@B01 1532 869 "$x" | tail -1
  node tools/worldart/views.mjs south_coast $OUT/south_coast/$n cam,near 1532 869 "$x" | tail -1
done
echo ABDONE
