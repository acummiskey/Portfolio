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
<title>LUMON :: MDR CONSOLE</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem 3rem;
    font-family: "Courier New", ui-monospace, monospace;
    background: #011627; color: #8ed0e9;
    max-width: 32rem; margin-inline: auto;
    letter-spacing: 0.05em;
  }
  .logo {
    text-align: center;
    font-weight: bold;
    font-size: 1.75rem;
    letter-spacing: 0.4em;
    padding: 0.75rem 0;
    border: 2px solid #8ed0e9;
    border-radius: 999px;
    margin-bottom: 0.5rem;
  }
  .tagline {
    text-align: center;
    font-size: 0.75rem;
    opacity: 0.7;
    letter-spacing: 0.3em;
    margin-bottom: 1.5rem;
  }
  .panel {
    border: 1px solid #8ed0e9;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .label {
    font-size: 0.7rem;
    opacity: 0.6;
    letter-spacing: 0.3em;
    margin-bottom: 0.25rem;
  }
  .now-playing {
    font-size: 0.85rem;
    word-break: break-all;
    min-height: 1.25em;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  button {
    padding: 1.1rem 0.5rem;
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 0.2em;
    background: transparent; color: #8ed0e9;
    border: 1px solid #8ed0e9; border-radius: 0;
    cursor: pointer;
    text-transform: uppercase;
    transition: background 0.1s;
  }
  button:hover, button:active { background: #8ed0e9; color: #011627; }
  button.wide { grid-column: 1 / -1; }
  button.danger { border-color: #c96767; color: #c96767; }
  button.danger:hover, button.danger:active { background: #c96767; color: #011627; }
  #status {
    text-align: center;
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    min-height: 1em;
    opacity: 0.8;
    margin-top: 1rem;
  }
  .footer {
    text-align: center;
    font-size: 0.65rem;
    opacity: 0.4;
    letter-spacing: 0.3em;
    margin-top: 2rem;
  }
</style>
</head>
<body>
<div class="logo">LUMON</div>
<div class="tagline">&mdash; MACRODATA REFINEMENT &mdash;</div>

<div class="panel">
  <div class="label">NOW REFINING</div>
  <div class="now-playing" id="now">&hellip;</div>
</div>

<div class="grid">
  <button onclick="act('next')">NEXT FILE</button>
  <button onclick="act('screen')">DISPLAY</button>
  <button onclick="act('mute')">AUDIO</button>
  <button onclick="act('restart')">RESHUFFLE</button>
  <button class="wide danger" onclick="confirmAct('reboot', 'REBOOT THE REFINEMENT UNIT?')">REBOOT</button>
  <button class="wide danger" onclick="confirmAct('shutdown', 'POWER DOWN THE REFINEMENT UNIT?')">SHUT DOWN</button>
</div>

<div id="status"></div>

<div class="footer">
  PLEASE ENJOY EACH VIDEO EQUALLY<br>
  &copy; LUMON INDUSTRIES &mdash; THE WORK IS MYSTERIOUS AND IMPORTANT
</div>

<script>
  async function refresh() {
    try {
      const r = await fetch('/api/status');
      const j = await r.json();
      document.getElementById('now').textContent = (j.now_playing || '(IDLE)').toUpperCase();
    } catch (e) {}
  }
  async function act(name) {
    document.getElementById('status').textContent = 'PROCESSING...';
    try {
      const r = await fetch('/api/' + name, { method: 'POST' });
      const j = await r.json();
      document.getElementById('status').textContent = (j.message || j.error || '').toUpperCase();
    } catch (e) {
      document.getElementById('status').textContent = 'ERROR';
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
