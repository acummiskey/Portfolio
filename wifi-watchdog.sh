#!/bin/bash
# WiFi watchdog for Pi Zero 2 W — escalating recovery when the gateway
# becomes unreachable. Installed as a systemd timer (runs every 30s).
#
# Level 1: bounce wlan0 (ip link down/up)
# Level 2: restart NetworkManager
# Level 3: full driver reload (down link, unload brcmfmac, reload, up link,
#          force NM reassociate)
# Level 4: rfkill radio off/on — full hardware radio reset (no reboot)
#
# Every run logs to the journal (tag: wifi-watchdog) so you can see what
# the watchdog is actually doing:
#   journalctl -t wifi-watchdog -f

STATE_FILE=/tmp/wifi-watchdog-fails
FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

log() { logger -t wifi-watchdog "$1"; }

GATEWAY=$(ip route | awk '/default/ {print $3; exit}')

# Measure gateway latency on success so we can see link health over time
if [ -n "$GATEWAY" ]; then
    RTT=$(ping -c 1 -W 3 "$GATEWAY" 2>/dev/null | awk -F'time=' '/time=/{print $2; exit}')
    if [ -n "$RTT" ]; then
        # Success — reset counter and log with latency
        if [ "$FAILS" -gt 0 ]; then
            log "RECOVERED after $FAILS fails (gateway ${RTT})"
        else
            log "OK (gateway ${RTT})"
        fi
        echo 0 > "$STATE_FILE"
        exit 0
    fi
fi

# Failure path
FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"
log "FAIL #$FAILS — gateway=${GATEWAY:-none} unreachable"

case "$FAILS" in
    1)
        log "Level 1: bouncing wlan0"
        ip link set wlan0 down
        sleep 2
        ip link set wlan0 up
        ;;
    2)
        log "Level 2: restarting NetworkManager"
        systemctl restart NetworkManager
        ;;
    3)
        log "Level 3: full driver reload"
        ip link set wlan0 down 2>/dev/null || true
        sleep 1
        modprobe -r brcmfmac 2>/dev/null || log "  modprobe -r failed (module in use?)"
        sleep 2
        modprobe brcmfmac
        sleep 3
        ip link set wlan0 up 2>/dev/null || true
        # Force NM to reassociate the preconfigured connection
        nmcli connection up preconfigured 2>&1 | logger -t wifi-watchdog
        ;;
    *)
        # Level 4 and beyond: full radio reset via rfkill (no reboot)
        log "Level 4: rfkill radio reset (attempt $((FAILS - 3)))"
        rfkill block wifi
        sleep 3
        rfkill unblock wifi
        sleep 2
        nmcli connection up preconfigured 2>&1 | logger -t wifi-watchdog
        ;;
esac
