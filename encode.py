#!/usr/bin/env python3
"""Encode videos for the Retro TV.

Encodes all video files in the current directory to H.264 Baseline at 480px
height with mono AAC audio. Output goes to an 'encoded' subdirectory.

Run this on your PC (not the Pi — it's far too slow for encoding).

Usage:
    python encode.py                  # encode all videos in current directory
    python encode.py /path/to/videos  # encode all videos in specified directory
"""

import os
import subprocess
import sys

SUPPORTED_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm"}


def encode_video(input_path, output_path):
    """Encode a single video to H.264 Baseline, 480px height, mono audio."""
    cmd = [
        "ffmpeg", "-i", input_path,
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level", "3.0",
        "-preset", "fast",
        "-crf", "23",
        "-vf", "scale=-2:480",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "1",
        "-y",
        output_path,
    ]
    print(f"Encoding: {os.path.basename(input_path)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr.splitlines()[-1] if result.stderr else 'Unknown error'}")
        return False
    print(f"  Done: {os.path.basename(output_path)}")
    return True


def main():
    video_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    video_dir = os.path.abspath(video_dir)

    if not os.path.isdir(video_dir):
        print(f"Error: {video_dir} is not a directory")
        sys.exit(1)

    output_dir = os.path.join(video_dir, "encoded")
    os.makedirs(output_dir, exist_ok=True)

    videos = [
        f for f in os.listdir(video_dir)
        if os.path.isfile(os.path.join(video_dir, f))
        and os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS
    ]

    if not videos:
        print(f"No video files found in {video_dir}")
        sys.exit(1)

    print(f"Found {len(videos)} video(s) to encode\n")

    success = 0
    for video in sorted(videos):
        input_path = os.path.join(video_dir, video)
        name = os.path.splitext(video)[0]
        output_path = os.path.join(output_dir, f"{name}.mp4")

        if os.path.exists(output_path):
            print(f"Skipping (already encoded): {video}")
            success += 1
            continue

        if encode_video(input_path, output_path):
            success += 1

    print(f"\nEncoded {success}/{len(videos)} videos to {output_dir}")


if __name__ == "__main__":
    main()
