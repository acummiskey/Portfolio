#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOT_CONFIG="/boot/firmware/config.txt"
BOOT_CMDLINE="/boot/firmware/cmdline.txt"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root (sudo bash setup.sh)"
    exit 1
fi

# Detect the real user (the one who ran sudo)
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo pi)}"
REAL_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"
VIDEO_DIR="$REAL_HOME/videos"

echo "Detected user: $REAL_USER (home: $REAL_HOME)"

echo "=== Pi Video Looper Setup ==="
echo ""

# 1. System update
echo "[1/7] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# 2. Install mpv
echo "[2/7] Installing mpv..."
apt-get install -y -qq mpv

# 3. Create video directory
echo "[3/7] Creating video directory at $VIDEO_DIR..."
mkdir -p "$VIDEO_DIR"
chown "$REAL_USER:$REAL_USER" "$VIDEO_DIR"

# 4. Install looper script
echo "[4/7] Installing video-looper.sh to /usr/local/bin/..."
cp "$SCRIPT_DIR/video-looper.sh" /usr/local/bin/video-looper.sh
chmod +x /usr/local/bin/video-looper.sh

# 5. Install and enable systemd service
echo "[5/7] Installing systemd service..."
sed -e "s|User=pi|User=$REAL_USER|" \
    -e "s|ReadWritePaths=/home/pi/videos|ReadWritePaths=$VIDEO_DIR|" \
    -e "s|Environment=VIDEO_DIR=/home/pi/videos|Environment=VIDEO_DIR=$VIDEO_DIR|" \
    "$SCRIPT_DIR/video-looper.service" > /etc/systemd/system/video-looper.service
systemctl daemon-reload
systemctl enable video-looper.service

# 6. Configure boot settings
echo "[6/7] Configuring boot settings..."

# Set GPU memory to 128MB for video decoding
if grep -q "^gpu_mem=" "$BOOT_CONFIG" 2>/dev/null; then
    sed -i 's/^gpu_mem=.*/gpu_mem=128/' "$BOOT_CONFIG"
else
    echo "gpu_mem=128" >> "$BOOT_CONFIG"
fi

# Ensure KMS overlay is enabled
if ! grep -q "^dtoverlay=vc4-kms-v3d" "$BOOT_CONFIG" 2>/dev/null; then
    echo "dtoverlay=vc4-kms-v3d" >> "$BOOT_CONFIG"
fi

# Disable console blanking
if ! grep -q "consoleblank=0" "$BOOT_CMDLINE" 2>/dev/null; then
    sed -i 's/$/ consoleblank=0/' "$BOOT_CMDLINE"
fi

# 7. Disable unnecessary services to free RAM
echo "[7/7] Disabling unnecessary services..."
for service in bluetooth hciuart avahi-daemon triggerhappy; do
    if systemctl is-enabled "$service" &>/dev/null; then
        systemctl disable --now "$service" 2>/dev/null || true
        echo "  Disabled: $service"
    fi
done

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy video files (mp4/mkv/avi) to $VIDEO_DIR"
echo "  2. Reboot: sudo reboot"
echo ""
echo "After reboot, videos will play automatically."
echo "Check status: sudo systemctl status video-looper"
echo "View logs:    journalctl -u video-looper -f"
