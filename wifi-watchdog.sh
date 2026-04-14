#!/bin/bash
# WiFi watchdog for Pi Zero 2 W — escalating recovery when the gateway
# becomes unreachable. Installed as a systemd timer (runs every minute).
#
# Level 1: link bounce (ip link down/up)
# Level 2: restart NetworkManager
# Level 3: reload brcmfmac kernel module (nuclear)

STATE_FILE=/tmp/wifi-watchdog-fails
FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

GATEWAY=$(ip route | awk '/default/ {print $3; exit}')
if [ -n "$GATEWAY" ] && ping -c 1 -W 3 "$GATEWAY" > /dev/null 2>&1; then
    echo 0 > "$STATE_FILE"
    exit 0
fi

FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"
logger -t wifi-watchdog "Dropout detected (consecutive fails: $FAILS)"

if [ "$FAILS" -eq 1 ]; then
    logger -t wifi-watchdog "Level 1: kicking wlan0"
    ip link set wlan0 down
    sleep 2
    ip link set wlan0 up
elif [ "$FAILS" -eq 2 ]; then
    logger -t wifi-watchdog "Level 2: restarting NetworkManager"
    systemctl restart NetworkManager
elif [ "$FAILS" -ge 3 ]; then
    logger -t wifi-watchdog "Level 3: reloading brcmfmac module"
    modprobe -r brcmfmac || true
    sleep 2
    modprobe brcmfmac
    echo 0 > "$STATE_FILE"
fi
