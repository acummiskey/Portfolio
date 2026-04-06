# Pi Video Looper

Turns a Raspberry Pi Zero 2 W into a dedicated video looper appliance.
Plays all videos from a folder in shuffled order, fullscreen, on repeat — no desktop environment needed.

## What You Need

- Raspberry Pi Zero 2 W
- MicroSD card (8GB+) with **Raspberry Pi OS Lite (Bookworm)**
- HDMI display
- Video files (mp4, mkv, avi, mov, webm)

## Quick Start

1. Flash **Raspberry Pi OS Lite** to your SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Boot the Pi and connect via SSH
3. Clone or copy this repo to the Pi
4. Run the setup script:
   ```bash
   sudo bash setup.sh
   ```
5. Copy your video files to `~/videos/`
6. Reboot:
   ```bash
   sudo reboot
   ```

Videos will start playing automatically on boot.

## How It Works

- A systemd service starts `video-looper.sh` on boot
- The script finds all video files in `~/videos/`
- Shuffles them into a random order and plays each one fullscreen using **ffplay**
- After all videos have played, it rescans the folder, reshuffles, and loops again
- New videos added to the folder are picked up on the next cycle

## Supported Formats

mp4, mkv, avi, mov, wmv, flv, webm — anything mpv/ffmpeg can decode.

For best performance, use **H.264-encoded MP4 files at 1080p or lower** (hardware-accelerated decoding).

## Managing the Service

```bash
sudo systemctl status video-looper     # check status
sudo systemctl stop video-looper       # stop playback
sudo systemctl start video-looper      # start playback
sudo systemctl restart video-looper    # restart playback
journalctl -u video-looper -f          # live logs
```

## Troubleshooting

| Problem | Solution |
|---|---|
| No video playing | Check logs: `journalctl -u video-looper` |
| Black screen | Ensure `gpu_mem=128` is in `/boot/firmware/config.txt` |
| No audio over HDMI | Run `amixer` or `alsamixer` and select HDMI output |
| Video stutters | Re-encode to H.264 — see hardware notes below |
| New videos not appearing | They are picked up after the current cycle finishes |

## Hardware Notes

- The Pi Zero 2 W has **hardware H.264 decode only**
- H.265 (HEVC) and VP9 will use software decoding and may stutter
- For smooth playback, use H.264-encoded files at **1080p or lower**
- 4K content will **not** play smoothly on this hardware
- To re-encode a video to H.264:
  ```bash
  ffmpeg -i input.mkv -c:v libx264 -preset slow -crf 22 -c:a aac output.mp4
  ```
