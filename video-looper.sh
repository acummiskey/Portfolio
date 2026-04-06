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
    ffplay -fs -autoexit -loglevel quiet "$file" &
    PLAYER_PID=$!
    wait "$PLAYER_PID" || {
        local exit_code=$?
        log "ffplay exited with code $exit_code for: $file"
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

while true; do
    collect_videos

    if (( ${#videos[@]} == 0 )); then
        log "No video files found in $VIDEO_DIR, retrying in 30 seconds"
        sleep 30
        continue
    fi

    log "Found ${#videos[@]} video(s), shuffling"
    shuffle_videos

    for video in "${videos[@]}"; do
        play_video "$video"
    done

    log "Completed full pass, rescanning and reshuffling"
done
