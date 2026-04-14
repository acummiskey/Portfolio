#!/bin/bash
# WiFi watchdog for Pi Zero 2 W — escalating recovery when connectivity
# fails. Installed as a systemd timer (runs every 30s).
#
# Level 1: bounce wlan0 (ip link down/up)
# Level 2: restart NetworkManager
# Level 3: full driver reload (down link, unload brcmfmac, reload, up link,
#          force NM reassociate)
# Level 4: rfkill radio off/on — full hardware radio reset (no reboot)
#
# Every run logs to the journal (tag: wifi-watchdog) with gateway latency,
# signal strength, tx rate, and CPU temp so you can see link health over
# time and correlate drops with thermal/signal changes:
#   journalctl -t wifi-watchdog -f

STATE_FILE=/tmp/wifi-watchdog-fails
FAILS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

log() { logger -t wifi-watchdog "$1"; }

# Gather diagnostic context on every run
get_context() {
    local sig rate temp_raw temp
    sig=$(iw dev wlan0 link 2>/dev/null | awk '/signal:/ {print $2$3}')
    rate=$(iw dev wlan0 link 2>/dev/null | awk '/tx bitrate:/ {print $3$4}')
    temp_raw=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0)
    temp=$(awk "BEGIN {printf \"%.1fC\", $temp_raw/1000}")
    echo "sig=${sig:-?} rate=${rate:-?} temp=${temp}"
}

GATEWAY=$(ip route | awk '/default/ {print $3; exit}')
CTX=$(get_context)

# Ping gateway first (local link health)
GW_RTT=""
if [ -n "$GATEWAY" ]; then
    GW_RTT=$(ping -c 1 -W 3 "$GATEWAY" 2>/dev/null | awk -F'time=' '/time=/{print $2; exit}')
fi

# Also ping external — distinguishes local vs upstream failure
EXT_OK=0
if ping -c 1 -W 3 8.8.8.8 > /dev/null 2>&1; then
    EXT_OK=1
fi

if [ -n "$GW_RTT" ] && [ "$EXT_OK" = 1 ]; then
    # Full success
    if [ "$FAILS" -gt 0 ]; then
        log "RECOVERED after $FAILS fails — gw=${GW_RTT} ext=OK $CTX"
    else
        log "OK gw=${GW_RTT} ext=OK $CTX"
    fi
    echo 0 > "$STATE_FILE"
    exit 0
elif [ -n "$GW_RTT" ] && [ "$EXT_OK" = 0 ]; then
    # Gateway reachable but external down — likely upstream/ISP issue, not the Pi
    log "PARTIAL gw=${GW_RTT} ext=FAIL $CTX — upstream issue, not escalating"
    echo 0 > "$STATE_FILE"
    exit 0
fi

# Gateway unreachable — real local failure, escalate
FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"
log "FAIL #$FAILS gw=${GATEWAY:-none}-UNREACH ext=$([ $EXT_OK = 1 ] && echo OK || echo FAIL) $CTX"

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
        # brcmfmac_wcc holds brcmfmac open — unload dependents first or
        # the brcmfmac unload fails with "Module in use".
        modprobe -r brcmfmac_wcc 2>/dev/null || log "  modprobe -r brcmfmac_wcc failed"
        modprobe -r brcmfmac 2>/dev/null || log "  modprobe -r brcmfmac failed (module in use?)"
        sleep 2
        modprobe brcmfmac
        # Wait for wlan0 to reappear before nmcli — otherwise NM tries to
        # activate the profile on 'lo' and fails.
        for _ in $(seq 1 15); do
            [ -e /sys/class/net/wlan0 ] && break
            sleep 1
        done
        ip link set wlan0 up 2>/dev/null || true
        sleep 2
        nmcli connection up preconfigured 2>&1 | logger -t wifi-watchdog
        ;;
    *)
        # Level 4 and beyond: full radio reset via rfkill (no reboot)
        log "Level 4: rfkill radio reset (attempt $((FAILS - 3)))"
        rfkill block wifi
        sleep 3
        rfkill unblock wifi
        # rfkill unblock doesn't instantly re-register the interface;
        # running nmcli too early binds 'preconfigured' to 'lo'.
        for _ in $(seq 1 15); do
            [ -e /sys/class/net/wlan0 ] && break
            sleep 1
        done
        sleep 2
        nmcli connection up preconfigured 2>&1 | logger -t wifi-watchdog
        ;;
esac
