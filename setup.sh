#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOT_CONFIG="/boot/firmware/config.txt"
BOOT_CMDLINE="/boot/firmware/cmdline.txt"
OVERLAY_DIR="/boot/firmware/overlays"
OVERLAY_BASE_URL="https://raw.githubusercontent.com/buba447/simpsonstv/main"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root (sudo bash setup.sh)"
    exit 1
fi

# Detect the real user (the one who ran sudo)
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo pi)}"
REAL_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"
VIDEO_DIR="$REAL_HOME/videos"

echo "=== Retro TV Setup ==="
echo "Detected user: $REAL_USER (home: $REAL_HOME)"
echo ""

# 1. System update
echo "[1/12] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# 2. Install dependencies
echo "[2/12] Installing dependencies..."
apt-get install -y -qq ffmpeg python3-gpiozero raspi-gpio

# 3. Create video directory
echo "[3/12] Creating video directory at $VIDEO_DIR..."
mkdir -p "$VIDEO_DIR"
chown "$REAL_USER:$REAL_USER" "$VIDEO_DIR"

# 4. Download Waveshare DPI display overlay files
echo "[4/12] Downloading Waveshare display overlays..."
for overlay in waveshare-28dpi-3b-4b.dtbo waveshare-28dpi-3b.dtbo waveshare-28dpi-4b.dtbo; do
    if [[ ! -f "$OVERLAY_DIR/$overlay" ]]; then
        wget -q -O "$OVERLAY_DIR/$overlay" "$OVERLAY_BASE_URL/$overlay" || {
            echo "  WARNING: Failed to download $overlay"
        }
        echo "  Downloaded: $overlay"
    else
        echo "  Already exists: $overlay"
    fi
done

# 5. Configure display in config.txt
echo "[5/12] Configuring Waveshare DPI display..."

# Disable KMS — DPI displays require the legacy framebuffer path
if grep -q "^dtoverlay=vc4-kms-v3d" "$BOOT_CONFIG" 2>/dev/null; then
    sed -i 's/^dtoverlay=vc4-kms-v3d/#dtoverlay=vc4-kms-v3d/' "$BOOT_CONFIG"
    echo "  Disabled KMS overlay (incompatible with DPI display)"
fi
if grep -q "^dtoverlay=vc4-fkms-v3d" "$BOOT_CONFIG" 2>/dev/null; then
    sed -i 's/^dtoverlay=vc4-fkms-v3d/#dtoverlay=vc4-fkms-v3d/' "$BOOT_CONFIG"
fi

# Add DPI display config if not already present
# Note: dtoverlay=dpi24 is deliberately omitted — on Bookworm it claims
# GPIO 0-27 via pinctrl, blocking audremap from using pins 18/19 for audio.
# The gpio= lines and enable_dpi_lcd=1 handle DPI setup without the overlay.
if ! grep -q "enable_dpi_lcd=1" "$BOOT_CONFIG" 2>/dev/null; then
    cat >> "$BOOT_CONFIG" << 'DISPLAY_CONFIG'

# Waveshare 2.8" DPI Display
gpio=0-9=a2
gpio=12-17=a2
gpio=20-25=a2
enable_dpi_lcd=1
display_default_lcd=1
extra_transpose_buffer=2
dpi_group=2
dpi_mode=87
dpi_output_format=0x7F216
hdmi_timings=480 0 26 16 10 640 0 25 10 15 0 0 0 60 0 32000000 1
dtoverlay=waveshare-28dpi-3b-4b
dtoverlay=waveshare-28dpi-3b
dtoverlay=waveshare-28dpi-4b
display_rotate=1
DISPLAY_CONFIG
    echo "  Added DPI display configuration"
else
    echo "  DPI display configuration already present"
fi

# 6. Configure audio in config.txt
echo "[6/12] Configuring PWM audio output..."
if ! grep -q "dtoverlay=audremap" "$BOOT_CONFIG" 2>/dev/null; then
    cat >> "$BOOT_CONFIG" << 'AUDIO_CONFIG'

# PWM Audio via GPIO 18/19
dtoverlay=audremap,pins_18_19
AUDIO_CONFIG
    echo "  Added audio configuration"
else
    echo "  Audio configuration already present"
fi

# 7. Set GPU memory
echo "[7/12] Setting GPU memory..."
if grep -q "^gpu_mem=" "$BOOT_CONFIG" 2>/dev/null; then
    sed -i 's/^gpu_mem=.*/gpu_mem=128/' "$BOOT_CONFIG"
else
    echo "gpu_mem=128" >> "$BOOT_CONFIG"
fi

# 8. Configure cmdline.txt — hide boot text
echo "[8/12] Configuring boot display..."

# Redirect console output to tty3 (invisible)
if grep -q "console=tty1" "$BOOT_CMDLINE" 2>/dev/null; then
    sed -i 's/console=tty1/console=tty3/' "$BOOT_CMDLINE"
fi

# Remove fsck.repair=yes
sed -i 's/ fsck.repair=yes//' "$BOOT_CMDLINE"

# Add boot hiding flags
if ! grep -q "logo.nologo" "$BOOT_CMDLINE" 2>/dev/null; then
    sed -i 's/$/ logo.nologo quiet splash/' "$BOOT_CMDLINE"
fi

# Disable console blanking
if ! grep -q "consoleblank=0" "$BOOT_CMDLINE" 2>/dev/null; then
    sed -i 's/$/ consoleblank=0/' "$BOOT_CMDLINE"
fi

# 9. Install scripts
echo "[9/12] Installing scripts..."
cp "$SCRIPT_DIR/video-looper.sh" /usr/local/bin/video-looper.sh
chmod +x /usr/local/bin/video-looper.sh
cp "$SCRIPT_DIR/buttons.py" /usr/local/bin/buttons.py
chmod +x /usr/local/bin/buttons.py

# 10. Install systemd services
echo "[10/12] Installing systemd services..."

# Video looper service (template user and paths)
sed -e "s|User=pi|User=$REAL_USER|" \
    -e "s|Environment=VIDEO_DIR=/home/pi/videos|Environment=VIDEO_DIR=$VIDEO_DIR|" \
    "$SCRIPT_DIR/video-looper.service" > /etc/systemd/system/video-looper.service

# Button handler and GPIO init services
cp "$SCRIPT_DIR/buttons.service" /etc/systemd/system/buttons.service
cp "$SCRIPT_DIR/gpio-init.service" /etc/systemd/system/gpio-init.service

systemctl daemon-reload
systemctl enable video-looper.service
systemctl enable buttons.service
systemctl enable gpio-init.service

# Force audio output to analog/PWM
amixer cset numid=3 1 2>/dev/null || true
alsactl store 2>/dev/null || true

# 11. Disable unnecessary services to free RAM
echo "[11/12] Disabling unnecessary services..."
for service in bluetooth hciuart avahi-daemon triggerhappy; do
    if systemctl is-enabled "$service" &>/dev/null; then
        systemctl disable --now "$service" 2>/dev/null || true
        echo "  Disabled: $service"
    fi
done

# 12. Setup USB mount for video transfer
echo "[12/12] Installing USB mount support..."
apt-get install -y -qq usbmount || true
if [[ -f /lib/systemd/system/systemd-udevd.service ]]; then
    if grep -q "PrivateMounts=yes" /lib/systemd/system/systemd-udevd.service 2>/dev/null; then
        sed -i 's/PrivateMounts=yes/PrivateMounts=no/' /lib/systemd/system/systemd-udevd.service
        echo "  Enabled USB auto-mounting"
    fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Encode videos on your PC:  python encode.py /path/to/videos"
echo "  2. Copy encoded videos to $VIDEO_DIR"
echo "  3. Reboot: sudo reboot"
echo ""
echo "After reboot, videos will play on the Waveshare display."
echo "  Power button:  toggles screen on/off"
echo "  Volume knob:   adjust the trim potentiometer"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status video-looper"
echo "  sudo systemctl status buttons"
echo "  journalctl -u video-looper -f"
