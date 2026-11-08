#!/usr/bin/env bash
# Master the sound to -14 LUFS (two-pass loudnorm) and encode the frames into the final MP4.
# usage: tools/film_encode.sh <framesDir> <out.mp4> [fps=30]
set -euo pipefail
FRAMES=$1; OUT=$2; FPS=${3:-30}
TMP=$(mktemp -d)
python3 "$(dirname "$0")/film_audio.py" "$TMP/raw.wav"
# pass 1: measure
M=$(ffmpeg -hide_banner -nostats -i "$TMP/raw.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
# pass 2: apply with the measured values (linear mode keeps the dynamics)
ffmpeg -hide_banner -loglevel error -y -i "$TMP/raw.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" -c:a pcm_s16le "$TMP/master.wav"
mkdir -p "$(dirname "$OUT")"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$FRAMES/f%04d.png" -i "$TMP/master.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest -metadata title="Glass-Dome Octopus" "$OUT"
echo "--- final loudness"
ffmpeg -hide_banner -nostats -i "$OUT" -af loudnorm=I=-14:TP=-1.5:print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
rm -rf "$TMP"
