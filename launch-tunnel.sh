#!/usr/bin/env bash
#
# Grocery & Vegetable Tracker - remote access via Cloudflare Tunnel
#
# Unlike launch.sh (which runs the Vite dev server + FastAPI on two separate ports,
# for local development), this script:
#   1. Builds the frontend into a static bundle (frontend/dist)
#   2. Starts FastAPI ALONE, serving both the API and the built frontend on one port
#      (api.py mounts frontend/dist and falls back to index.html for client routing)
#   3. Opens a free Cloudflare "quick tunnel" (cloudflared) pointed at that one port,
#      giving you a public https://<random>.trycloudflare.com URL reachable from
#      anywhere (5G, other Wi-Fi, etc.) with no port forwarding and no exposed home IP.
#
# NOTE: the quick-tunnel URL is randomly generated and changes every time this script
# is run. If you want a stable/permanent URL, you'd need to own a domain added to a
# Cloudflare account and set up a named tunnel instead - ask if you want that later.
#
# There is currently NO login/auth in front of this URL - anyone with the link can use
# the app, including destructive actions like clearing the inventory. Only share the
# link with people you trust, and re-run this script (new random URL) if you want to
# revoke access.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=8000

echo "============================================================"
echo " Grocery & Vegetable Tracker - Cloudflare Tunnel mode"
echo "============================================================"

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "ERROR: cloudflared is not installed. Install it with: brew install cloudflared"
    exit 1
fi

if [ ! -d "$ROOT_DIR/.venv" ]; then
    echo "ERROR: .venv not found. Run ./launch.sh once first to set up the backend environment."
    exit 1
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
fi

###############################################################################
# Build frontend
###############################################################################

echo "==> Building frontend (frontend/dist)..."
cd "$ROOT_DIR/frontend"
if [ ! -d node_modules ]; then
    npm install
fi
npm run build
cd "$ROOT_DIR"

###############################################################################
# Start backend (serves API + built frontend on one port)
###############################################################################

echo "==> Starting FastAPI on port $BACKEND_PORT (serving API + built frontend)..."
uvicorn api:app --host 127.0.0.1 --port "$BACKEND_PORT" &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "==> Stopping..."
    kill "$BACKEND_PID" "$TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" "$TUNNEL_PID" 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM

# Give uvicorn a moment to come up before the tunnel connects to it.
sleep 2

###############################################################################
# Start Cloudflare quick tunnel
###############################################################################

echo "==> Starting Cloudflare Tunnel..."
echo ""

# --protocol http2: some networks (corporate/sandboxed Wi-Fi, some routers) block the
# outbound UDP/QUIC traffic cloudflared prefers by default (port 7844), which otherwise
# causes it to loop retrying forever and never actually connect. HTTP/2 only needs
# outbound TCP 443, which is essentially always allowed.
cloudflared tunnel --protocol http2 --url "http://127.0.0.1:$BACKEND_PORT" 2>&1 | tee /tmp/cloudflared.log &
TUNNEL_PID=$!

# Poll the log for the generated public URL and print it clearly once found.
for _ in $(seq 1 30); do
    URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -n1 || true)
    if [ -n "${URL:-}" ]; then
        echo ""
        echo "============================================================"
        echo " Your app is available at: $URL"
        echo " (this URL changes every time you restart this script)"
        echo "============================================================"
        echo "$URL" > "$ROOT_DIR/data/tunnel_url.txt"
        break
    fi
    sleep 1
done

echo ""
echo "Press Ctrl+C to stop the tunnel and backend."
wait
