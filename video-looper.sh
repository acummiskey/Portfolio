#!/usr/bin/env bash
set -euo pipefail

VIDEO_DIR="${VIDEO_DIR:-/home/pi/videos}"
SUPPORTED_EXTENSIONS="mp4|mkv|avi|mov|wmv|flv|webm"
LOG_TAG="video-looper"
PLAYER_PID=""

log() {
    logger -t "$LOG_TAG" "$1"
}

cleanup() {
    log "Shutting down gracefully"
    if [[ -n "$PLAYER_PID" ]]; then
        kill "$PLAYER_PID" 2>/dev/null || true
        wait "$PLAYER_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGTERM SIGINT

collect_videos() {
    videos=()
    while IFS= read -r -d '' file; do
        videos+=("$file")
    done < <(find "$VIDEO_DIR" -maxdepth 1 -type f -regextype posix-extended \
        -iregex ".*\\.($SUPPORTED_EXTENSIONS)$" -print0)
}

shuffle_videos() {
    local shuffled=()
    while IFS= read -r -d '' file; do
        shuffled+=("$file")
    done < <(printf '%s\0' "${videos[@]}" | shuf -z)
    videos=("${shuffled[@]}")
}

play_video() {
    local file="$1"
    log "Playing: $file"
    printf '%s' "$file" > /tmp/now-playing 2>/dev/null || true

    local cmd=(ffmpeg -hide_banner -loglevel error -re -i "$file"
        -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2"
        -pix_fmt bgra -f fbdev /dev/fb0)

    if aplay -l 2>/dev/null | grep -q "^card"; then
        cmd+=(-f alsa default)
    else
        cmd+=(-an)
    fi

    "${cmd[@]}" &
    PLAYER_PID=$!
    wait "$PLAYER_PID" || {
        local exit_code=$?
        log "ffmpeg exited with code $exit_code for: $file"
    }
    PLAYER_PID=""
}

# Wait for video directory to exist
elapsed=0
while [[ ! -d "$VIDEO_DIR" ]]; do
    if (( elapsed >= 60 )); then
        log "ERROR: Video directory $VIDEO_DIR not found after 60 seconds"
        exit 1
    fi
    log "Waiting for video directory: $VIDEO_DIR"
    sleep 5
    (( elapsed += 5 ))
done

log "Starting video looper from $VIDEO_DIR"

# Force audio output to analog/PWM (not HDMI)
amixer cset numid=3 1 2>/dev/null || true

while true; do
    collect_videos

    if (( ${#videos[@]} == 0 )); then
        log "No video files found in $VIDEO_DIR, retrying in 30 seconds"
        sleep 30
        continue
    fi

    log "Found ${#videos[@]} video(s), shuffling"
    shuffle_videos

    i=0
    while (( i < ${#videos[@]} )); do
        # On-demand override: if /tmp/play-next has a filename, play that
        # file instead of the next shuffled one, then resume the shuffle in
        # place. We truncate (not rm) because /tmp has the sticky bit and
        # control.py runs as root — only the file owner could rm it.
        if [[ -s /tmp/play-next ]]; then
            override="$(cat /tmp/play-next 2>/dev/null || true)"
            : > /tmp/play-next 2>/dev/null || true
            if [[ -n "$override" && -f "$VIDEO_DIR/$override" ]]; then
                log "On-demand request: $override"
                play_video "$VIDEO_DIR/$override"
                continue  # don't advance shuffle position
            else
                log "On-demand request invalid: $override"
            fi
        fi
        play_video "${videos[$i]}"
        (( i++ ))
    done

    log "Completed full pass, rescanning and reshuffling"
done
