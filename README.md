# Retro TV Video Looper

Turns a Raspberry Pi Zero 2 W into a mini Simpsons TV that plays videos on loop.
Built around the [Simpsons TV build guide](https://withrow.io/simpsons-tv-build-guide-waveshare) with a Waveshare 2.8" DPI display, mono speaker, and power button.

## Hardware

- Raspberry Pi Zero 2 W (with headers)
- Waveshare 2.8" 480x640 DPI IPS Display
- Adafruit PAM8302 Mono 2.5W Audio Amplifier
- 4ohm 3W Speaker
- 1K Trim Potentiometer (volume control)
- Tactile Push Button (screen on/off)
- Micro USB Breakout Board + Male Connector (power)
- MicroSD card (16GB+) with **Raspberry Pi OS Lite (Bookworm)**

## Quick Start

### 1. Encode your videos (on your PC)

Videos must be H.264, 480px height for smooth playback. Use the included script:

```bash
# Install ffmpeg on your PC if you haven't already
python encode.py /path/to/your/videos
```

Encoded files go to an `encoded/` subfolder. Copy these to a USB drive.

### 2. Set up the Pi

```bash
# Flash Raspberry Pi OS Lite (Bookworm) to SD card
# Boot the Pi, connect via SSH
# Clone or copy this repo to the Pi

sudo bash setup.sh
```

The setup script will:
- Install ffmpeg, gpiozero, and raspi-gpio
- Download and install the Waveshare display overlays
- Configure the DPI display, PWM audio, and GPIO pins
- Install the video looper, button handler, and GPIO init services
- Hide boot text for a clean startup
- Disable unnecessary services to free RAM

### 3. Copy videos to the Pi

```bash
# Via SCP from your PC
scp encoded/*.mp4 <user>@<pi-ip>:~/videos/

# Or via USB drive (after setup enables auto-mount)
sudo cp /media/usb/encoded/*.mp4 ~/videos/
```

### 4. Reboot

```bash
sudo reboot
```

Videos play automatically on the Waveshare display.

## How It Works

- **gpio-init.service** configures GPIO 18 (backlight) and GPIO 19 (PWM audio) at boot
- **video-looper.service** finds all videos, shuffles them, plays each fullscreen via ffmpeg fbdev, then reshuffles and loops
- **buttons.service** listens for the power button on GPIO 26 and toggles the screen on/off
- Videos keep playing even when the screen is off — turn it on and you're mid-episode, just like real TV

## Controls

- **Power button**: Press to toggle screen on/off
- **Volume knob**: Turn the trim potentiometer to adjust volume (hardware control)
- **Web control panel**: `http://<pi-ip>:8080` from any phone or laptop on the same network

### Web Control Panel

A small Flask app on port 8080 provides remote control from a phone browser:

- **Next** — skip the currently playing video
- **Display** — toggle backlight (stays in sync with the physical button)
- **Audio** — software mute via ALSA (PCM to 0%, unmute restores to 100%)
- **Reshuffle** — reshuffle and restart the rotation
- **Reboot / Shutdown** — self-explanatory, with confirmation prompt
- **Archive** — list of videos in the playback folder, each with a delete button
- **Upload** — send a new video from your phone directly to the Pi (streamed to disk, 2 GB limit per file)

For off-network access, install [Tailscale](https://tailscale.com) on the Pi and open `http://<tailscale-hostname>:8080`.

## Supported Formats

mp4, mkv, avi, mov, wmv, flv, webm — anything ffmpeg can decode.

For best performance, pre-encode with the included `encode.py` script (H.264 Baseline, 480px height, mono audio).

## Managing Services

```bash
sudo systemctl status video-looper     # video player status
sudo systemctl status buttons          # button handler status
sudo systemctl status gpio-init        # GPIO init status
sudo systemctl status control          # web control panel status

sudo systemctl stop video-looper       # stop playback
sudo systemctl restart video-looper    # restart playback

journalctl -u video-looper -f          # live video player logs
journalctl -u buttons -f               # live button handler logs
journalctl -u control -f               # live web control panel logs
```

## Troubleshooting

| Problem | Solution |
|---|---|
| No video playing | Check logs: `journalctl -u video-looper` |
| Display not working | Verify overlays: `ls /boot/firmware/overlays/waveshare*` |
| Display shows boot text | Check cmdline.txt has `console=tty3 logo.nologo quiet splash` |
| No audio | Verify `dtoverlay=audremap` in config.txt, check amp SD pin is tied to Vin, check gain knob |
| Video stutters | Re-encode to H.264 480p: `python encode.py /path/to/videos` |
| Button not working | Check `sudo systemctl status buttons`, verify wiring on GPIO 26 |
| Screen won't turn off | Check `sudo systemctl status gpio-init` ran successfully |
| USB drive not mounting | Verify `PrivateMounts=no` in `/lib/systemd/system/systemd-udevd.service` |

## Hardware Notes

- The Pi Zero 2 W has **hardware H.264 decode only**
- H.265/VP9 will use software decoding and will stutter — always encode to H.264
- The display is 480x640 native (portrait), rotated to 640x480 (landscape) via `display_rotate=1`
- GPIO 18 controls the display backlight (output high = on, output low = off)
- GPIO 19 carries PWM audio to the amp (alt5 mode) — connect PAM8302 A+ to physical pin 35
- The `dtoverlay=dpi24` overlay is **not used** — on Bookworm it claims GPIO 0-27 via pinctrl, blocking audio on pins 18/19. The firmware-level `gpio=` directives handle DPI pin setup instead
- PAM8302 **SD pin must be tied to Vin** — generic boards lack the pullup resistor, so leaving SD floating keeps the amp in shutdown (silent)
- KMS (`vc4-kms-v3d`) is disabled because DPI displays use the legacy framebuffer path
