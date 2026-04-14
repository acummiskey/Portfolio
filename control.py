#!/usr/bin/env python3
"""Web control panel for the Retro TV.

Simple Flask app that exposes buttons to skip videos, toggle the screen,
mute audio, upload/delete videos, reboot, and shut down. Intended for
phone use on the local network (or via Tailscale).
"""

import os
import shutil
import subprocess
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request
from werkzeug.utils import secure_filename

app = Flask(__name__)

VIDEO_DIR = Path(os.environ.get("VIDEO_DIR", "/home/pi/videos"))
NOW_PLAYING_FILE = Path("/tmp/now-playing")
MUTE_STATE_FILE = Path("/tmp/retrotv-muted")
PLAY_NEXT_FILE = Path("/tmp/play-next")

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
MIN_FREE_SPACE_BYTES = 200 * 1024 * 1024   # reject upload if <200MB would remain

# Let Flask accept up to 2 GB uploads
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

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
  .panel .label {
    font-size: 0.7rem;
    opacity: 0.6;
    letter-spacing: 0.3em;
    margin-bottom: 0.5rem;
  }
  .now-playing {
    font-size: 0.85rem;
    word-break: break-all;
    min-height: 1.25em;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  button, .btn {
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
    text-align: center;
    display: inline-block;
  }
  button:hover, button:active, .btn:hover { background: #8ed0e9; color: #011627; }
  button.wide { grid-column: 1 / -1; }
  button.danger { border-color: #c96767; color: #c96767; }
  button.danger:hover, button.danger:active { background: #c96767; color: #011627; }
  button.small { padding: 0.5rem 0.75rem; font-size: 0.7rem; letter-spacing: 0.15em; }
  #status {
    text-align: center;
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    min-height: 1em;
    opacity: 0.8;
    margin: 1rem 0;
  }
  ul.videos { list-style: none; margin: 0; padding: 0; font-size: 0.8rem; }
  ul.videos li {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.4rem 0; border-bottom: 1px dashed rgba(142,208,233,0.2);
    gap: 0.5rem;
  }
  ul.videos li:last-child { border-bottom: 0; }
  ul.videos .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul.videos .fsize { opacity: 0.5; font-size: 0.7rem; letter-spacing: 0.1em; }
  .muted { opacity: 0.5; font-size: 0.75rem; text-align: center; padding: 0.5rem; }
  input[type=file] {
    width: 100%;
    color: #8ed0e9; font-family: inherit; font-size: 0.75rem;
    background: transparent; border: 1px dashed #8ed0e9;
    padding: 0.75rem; margin-bottom: 0.5rem;
  }
  input[type=file]::file-selector-button {
    font-family: inherit; font-size: 0.7rem; letter-spacing: 0.2em;
    background: #8ed0e9; color: #011627; border: 0;
    padding: 0.4rem 0.75rem; margin-right: 0.75rem; cursor: pointer;
    text-transform: uppercase;
  }
  progress {
    width: 100%; height: 1.25rem;
    accent-color: #8ed0e9;
    background: transparent;
    border: 1px solid #8ed0e9;
    display: none;
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

<div class="panel">
  <div class="label">ARCHIVE <span id="disk-free"></span></div>
  <ul class="videos" id="videos"><li class="muted">LOADING...</li></ul>
</div>

<div class="panel">
  <div class="label">UPLOAD REFINEMENT MATERIAL</div>
  <input type="file" id="upload-file" accept="video/*">
  <button class="wide" onclick="upload()">TRANSMIT</button>
  <progress id="upload-progress" value="0" max="100"></progress>
</div>

<div class="footer">
  PLEASE ENJOY EACH VIDEO EQUALLY<br>
  &copy; LUMON INDUSTRIES &mdash; THE WORK IS MYSTERIOUS AND IMPORTANT
</div>

<script>
  const statusEl = document.getElementById('status');
  const progressEl = document.getElementById('upload-progress');

  function setStatus(msg) { statusEl.textContent = (msg || '').toUpperCase(); }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let v = bytes / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  async function refresh() {
    try {
      const r = await fetch('/api/status');
      const j = await r.json();
      document.getElementById('now').textContent = (j.now_playing || '(IDLE)').toUpperCase();
    } catch (e) {}
    try {
      const r = await fetch('/api/videos');
      const j = await r.json();
      const ul = document.getElementById('videos');
      document.getElementById('disk-free').textContent =
          j.free ? '(' + fmtSize(j.free) + ' FREE)' : '';
      if (!j.videos || j.videos.length === 0) {
        ul.innerHTML = '<li class="muted">ARCHIVE EMPTY</li>';
        return;
      }
      ul.innerHTML = j.videos.map(v =>
        '<li><span class="fname">' + escapeHtml(v.name) + '</span>' +
        '<span class="fsize">' + fmtSize(v.size) + '</span>' +
        '<button class="small" onclick="play(\\''+escapeJs(v.name)+'\\')">PLAY</button>' +
        '<button class="small danger" onclick="del(\\''+escapeJs(v.name)+'\\')">DEL</button></li>'
      ).join('');
    } catch (e) {}
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeJs(s) { return s.replace(/['\\\\]/g, '\\\\$&'); }

  async function act(name) {
    setStatus('PROCESSING...');
    try {
      const r = await fetch('/api/' + name, { method: 'POST' });
      const j = await r.json();
      setStatus(j.message || j.error || '');
    } catch (e) { setStatus('ERROR'); }
    refresh();
  }
  function confirmAct(name, msg) { if (confirm(msg)) act(name); }

  async function del(name) {
    if (!confirm('DELETE ' + name.toUpperCase() + '?')) return;
    setStatus('DELETING ' + name.toUpperCase());
    try {
      const r = await fetch('/api/videos/' + encodeURIComponent(name), { method: 'DELETE' });
      const j = await r.json();
      setStatus(j.message || j.error || '');
    } catch (e) { setStatus('ERROR'); }
    refresh();
  }

  async function play(name) {
    setStatus('REFINING ' + name.toUpperCase());
    try {
      const r = await fetch('/api/videos/' + encodeURIComponent(name) + '/play', { method: 'POST' });
      const j = await r.json();
      setStatus(j.message || j.error || '');
    } catch (e) { setStatus('ERROR'); }
    refresh();
  }

  function upload() {
    const input = document.getElementById('upload-file');
    const file = input.files[0];
    if (!file) { setStatus('NO FILE SELECTED'); return; }

    const xhr = new XMLHttpRequest();
    progressEl.style.display = 'block';
    progressEl.value = 0;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100);
        progressEl.value = pct;
        setStatus('UPLOADING ' + pct + '%');
      }
    };
    xhr.onload = () => {
      progressEl.style.display = 'none';
      try {
        const j = JSON.parse(xhr.responseText);
        setStatus(j.message || j.error || 'DONE');
      } catch (e) { setStatus('UPLOAD COMPLETE'); }
      input.value = '';
      refresh();
    };
    xhr.onerror = () => {
      progressEl.style.display = 'none';
      setStatus('UPLOAD FAILED');
    };
    xhr.open('POST', '/api/upload?filename=' + encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(file);
  }

  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(PAGE)


@app.route("/api/status")
def status():
    now = ""
    if NOW_PLAYING_FILE.exists():
        now = NOW_PLAYING_FILE.read_text().strip()
    return jsonify(now_playing=os.path.basename(now))


@app.route("/api/videos")
def list_videos():
    videos = []
    if VIDEO_DIR.is_dir():
        for f in sorted(VIDEO_DIR.iterdir()):
            if f.is_file() and f.suffix.lower() in VIDEO_EXTS:
                videos.append({"name": f.name, "size": f.stat().st_size})
    free = shutil.disk_usage(VIDEO_DIR).free if VIDEO_DIR.is_dir() else 0
    return jsonify(videos=videos, free=free)


@app.route("/api/videos/<path:name>", methods=["DELETE"])
def delete_video(name):
    safe = secure_filename(name)
    if not safe:
        return jsonify(error="Invalid filename"), 400
    target = VIDEO_DIR / safe
    if not target.is_file() or target.suffix.lower() not in VIDEO_EXTS:
        return jsonify(error="Not found"), 404
    target.unlink()
    return jsonify(message=f"Deleted {safe}")


@app.route("/api/videos/<path:name>/play", methods=["POST"])
def play_video(name):
    # secure_filename mangles spaces/apostrophes, so it can't be used to
    # look up an existing file. Instead, check that the requested name is
    # literally one of the files in VIDEO_DIR — that prevents traversal
    # and handles any legal filename.
    if not VIDEO_DIR.is_dir():
        return jsonify(error="Video dir missing"), 500
    existing = {f.name for f in VIDEO_DIR.iterdir()
                if f.is_file() and f.suffix.lower() in VIDEO_EXTS}
    if name not in existing:
        return jsonify(error="Not found"), 404
    # Tell video-looper.sh to play this file next. Make it world-writable
    # so the looper (running as the normal user) can truncate it —
    # /tmp has the sticky bit, so only the owner could rm it.
    PLAY_NEXT_FILE.write_text(name)
    os.chmod(PLAY_NEXT_FILE, 0o666)
    # Skip the current ffmpeg so the looper picks up the override
    subprocess.run(["pkill", "-TERM", "-x", "ffmpeg"])
    return jsonify(message=f"Playing {name}")


@app.route("/api/upload", methods=["POST"])
def upload():
    raw_name = request.args.get("filename", "")
    safe = secure_filename(raw_name)
    if not safe:
        return jsonify(error="Missing or invalid filename"), 400
    ext = Path(safe).suffix.lower()
    if ext not in VIDEO_EXTS:
        return jsonify(error=f"Unsupported type {ext}"), 400
    if not VIDEO_DIR.is_dir():
        return jsonify(error=f"Video dir {VIDEO_DIR} missing"), 500

    content_length = request.content_length or 0
    free = shutil.disk_usage(VIDEO_DIR).free
    if content_length and content_length + MIN_FREE_SPACE_BYTES > free:
        return jsonify(error="Not enough free space"), 413

    dest = VIDEO_DIR / safe
    tmp = VIDEO_DIR / f".{safe}.part"

    # Stream request body to disk — no in-memory buffering
    try:
        with open(tmp, "wb") as f:
            while True:
                chunk = request.stream.read(65536)
                if not chunk:
                    break
                f.write(chunk)
        # Chown to match the video directory owner so video-looper can read it
        dir_stat = VIDEO_DIR.stat()
        os.chown(tmp, dir_stat.st_uid, dir_stat.st_gid)
        tmp.rename(dest)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return jsonify(error=f"Upload failed: {e}"), 500

    return jsonify(message=f"Uploaded {safe}", size=dest.stat().st_size)


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
