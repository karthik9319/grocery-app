import re
import subprocess
import threading
from typing import Optional

from fastapi import APIRouter, HTTPException

from api_common import FRONTEND_DIST

router = APIRouter()


# --- Remote access toggle: start/stop a Cloudflare quick tunnel pointed at THIS
# process, from the UI, instead of a separate terminal script. Off by default - the
# app just runs locally until a user explicitly enables it from Settings.
TUNNEL_PORT = 8000  # matches the port convention used by launch.sh/launch-tunnel.sh
TUNNEL_URL_RE = re.compile(r"https://[a-zA-Z0-9.-]+\.trycloudflare\.com")

_tunnel_lock = threading.Lock()
_tunnel_process: Optional[subprocess.Popen] = None
_tunnel_url: Optional[str] = None
_tunnel_error: Optional[str] = None


def _read_tunnel_output(proc: subprocess.Popen):
    global _tunnel_url, _tunnel_error
    if proc.stdout is None:
        return
    for line in proc.stdout:
        match = TUNNEL_URL_RE.search(line)
        if match:
            with _tunnel_lock:
                _tunnel_url = match.group(0)
    proc.wait()
    with _tunnel_lock:
        if _tunnel_process is proc and _tunnel_url is None:
            _tunnel_error = (
                "cloudflared exited before a URL was found. Make sure cloudflared is "
                "installed (brew install cloudflared)."
            )


@router.get("/api/tunnel/status")
def tunnel_status():
    with _tunnel_lock:
        running = _tunnel_process is not None and _tunnel_process.poll() is None
        return {"running": running, "url": _tunnel_url if running else None, "error": _tunnel_error}


@router.post("/api/tunnel/start")
def tunnel_start():
    global _tunnel_process, _tunnel_url, _tunnel_error
    with _tunnel_lock:
        if _tunnel_process is not None and _tunnel_process.poll() is None:
            return {"running": True, "url": _tunnel_url, "error": None}
        if not (FRONTEND_DIST / "index.html").exists():
            raise HTTPException(
                400,
                "Frontend build not found. Run `cd frontend && npm run build` once, then try again.",
            )
        _tunnel_url = None
        _tunnel_error = None
        try:
            _tunnel_process = subprocess.Popen(
                ["cloudflared", "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{TUNNEL_PORT}"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            raise HTTPException(400, "cloudflared is not installed. Run: brew install cloudflared")
        threading.Thread(target=_read_tunnel_output, args=(_tunnel_process,), daemon=True).start()
    return {"running": True, "url": None, "error": None}


@router.post("/api/tunnel/stop")
def tunnel_stop():
    global _tunnel_process, _tunnel_url, _tunnel_error
    with _tunnel_lock:
        proc = _tunnel_process
        _tunnel_process = None
        _tunnel_url = None
        _tunnel_error = None
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    return {"running": False, "url": None, "error": None}
