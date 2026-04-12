#!/usr/bin/env python3
"""Web control panel for the Retro TV.

Simple Flask app that exposes buttons to skip videos, toggle the screen,
mute audio, reboot, and shut down. Intended for phone use on the local
network (or via Tailscale).
"""

import os
import subprocess
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request

app = Flask(__name__)

NOW_PLAYING_FILE = Path("/tmp/now-playing")
MUTE_STATE_FILE = Path("/tmp/retrotv-muted")

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Retro TV</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 2rem 1rem;
    font-family: system-ui, -apple-system, sans-serif;
    background: #111; color: #eee;
    max-width: 30rem; margin-inline: auto;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .now { opacity: 0.7; font-size: 0.9rem; margin-bottom: 1.5rem; word-break: break-all; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  button {
    padding: 1.25rem 0.5rem;
    font-size: 1rem;
    background: #222; color: #eee;
    border: 1px solid #333; border-radius: 0.75rem;
    cursor: pointer;
  }
  button:active { background: #333; }
  button.wide { grid-column: 1 / -1; }
  button.danger { border-color: #633; color: #faa; }
  #status { opacity: 0.6; font-size: 0.8rem; margin-top: 1rem; text-align: center; min-height: 1em; }
</style>
</head>
<body>
<h1>Retro TV</h1>
<div class="now">Now playing: <span id="now">&hellip;</span></div>
<div class="grid">
  <button onclick="act('next')">Next</button>
  <button onclick="act('screen')">Screen</button>
  <button onclick="act('mute')">Mute</button>
  <button onclick="act('restart')">Restart looper</button>
  <button class="wide danger" onclick="confirmAct('reboot', 'Reboot the Pi?')">Reboot</button>
  <button class="wide danger" onclick="confirmAct('shutdown', 'Shut down the Pi?')">Shutdown</button>
</div>
<div id="status"></div>
<script>
  async function refresh() {
    try {
      const r = await fetch('/api/status');
      const j = await r.json();
      document.getElementById('now').textContent = j.now_playing || '(nothing)';
    } catch (e) {}
  }
  async function act(name) {
    document.getElementById('status').textContent = '...';
    try {
      const r = await fetch('/api/' + name, { method: 'POST' });
      const j = await r.json();
      document.getElementById('status').textContent = j.message || j.error || '';
    } catch (e) {
      document.getElementById('status').textContent = 'error';
    }
    refresh();
  }
  function confirmAct(name, msg) { if (confirm(msg)) act(name); }
  refresh();
  setInterval(refresh, 3000);
</script>
</body>
</html>
"""


def run(cmd, check=True):
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


@app.route("/")
def index():
    return render_template_string(PAGE)


@app.route("/api/status")
def status():
    now = ""
    if NOW_PLAYING_FILE.exists():
        now = NOW_PLAYING_FILE.read_text().strip()
    return jsonify(now_playing=os.path.basename(now))


@app.route("/api/next", methods=["POST"])
def next_video():
    # Killing ffmpeg lets the video-looper loop advance to the next file
    subprocess.run(["pkill", "-TERM", "-x", "ffmpeg"])
    return jsonify(message="Skipped")


@app.route("/api/screen", methods=["POST"])
def screen():
    # Signal buttons.py so the screen_on state there stays in sync
    result = subprocess.run(["pkill", "-SIGUSR1", "-f", "buttons.py"])
    if result.returncode != 0:
        return jsonify(error="buttons.py not running"), 500
    return jsonify(message="Screen toggled")


@app.route("/api/mute", methods=["POST"])
def mute():
    muted = MUTE_STATE_FILE.exists()
    if muted:
        subprocess.run(["amixer", "-q", "sset", "PCM", "100%"])
        MUTE_STATE_FILE.unlink(missing_ok=True)
        return jsonify(message="Unmuted")
    else:
        subprocess.run(["amixer", "-q", "sset", "PCM", "0%"])
        MUTE_STATE_FILE.touch()
        return jsonify(message="Muted")


@app.route("/api/restart", methods=["POST"])
def restart_looper():
    subprocess.run(["sudo", "-n", "systemctl", "restart", "video-looper.service"])
    return jsonify(message="Looper restarted")


@app.route("/api/reboot", methods=["POST"])
def reboot():
    subprocess.Popen(["sudo", "-n", "systemctl", "reboot"])
    return jsonify(message="Rebooting...")


@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    subprocess.Popen(["sudo", "-n", "systemctl", "poweroff"])
    return jsonify(message="Shutting down...")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
