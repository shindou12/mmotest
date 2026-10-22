#!/bin/sh
# export_music.mjs が書いた WAV を OGG Vorbis（品質 5）に変え、索引の拡張子を直す（127 MiB → 約 10 MiB）。
#   sh tools/worldart/godot/wav_to_ogg.sh        要るもの: ffmpeg（Windows は winget install Gyan.FFmpeg）
FF=${FFMPEG:-$(command -v ffmpeg || find "$LOCALAPPDATA/Microsoft/WinGet/Packages" -name ffmpeg.exe 2>/dev/null | head -1)}
cd "$(dirname "$0")/../../../godot/worldart/assets" || exit 1
for d in music ambient; do
  for f in $d/*.wav; do [ -f "$f" ] || continue; "$FF" -loglevel error -y -i "$f" -c:a libvorbis -q:a 5 "${f%.wav}.ogg" && rm "$f"; done
  sed -i 's/\.wav"/.ogg"/g' $d/index.json
done
echo "OGG: $(ls music/*.ogg ambient/*.ogg | wc -l) files"
