#!/usr/bin/env bash
# Launches both the FastAPI backend and the React (Vite) frontend for the
# Grocery & Vegetable Tracker, and shuts both down together on exit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "==> Grocery & Vegetable Tracker launcher"
echo "    Project root: $ROOT_DIR"

# ---------------------------------------------------------------------------
# 1. Backend: FastAPI (uvicorn) served from the Python virtualenv
# ---------------------------------------------------------------------------
if [ ! -d "$ROOT_DIR/.venv" ]; then
  echo "==> Creating Python virtual environment (.venv)..."
  python3 -m venv "$ROOT_DIR/.venv"
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

if ! python -c "import fastapi" >/dev/null 2>&1; then
  echo "==> Installing Python dependencies..."
  pip install -q -r "$ROOT_DIR/requirements.txt"
fi

echo "==> Starting backend (FastAPI) on http://localhost:$BACKEND_PORT ..."
uvicorn api:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# ---------------------------------------------------------------------------
# 2. Frontend: React + Vite
# ---------------------------------------------------------------------------
# Vite 8 requires Node >= 20.19 / >= 22.12. Pick up nvm's Node if available
# and newer than the system one.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
fi

echo "==> Using Node $(node -v 2>/dev/null || echo 'not found')"

cd "$ROOT_DIR/frontend"
if [ ! -d node_modules ]; then
  echo "==> Installing frontend dependencies (npm install)..."
  npm install
fi

echo "==> Starting frontend (Vite) on http://localhost:$FRONTEND_PORT ..."
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# 3. Shut both down together on Ctrl+C / exit
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" >/dev/null 2>&1 || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "==> Stopped."
}
trap cleanup EXIT INT TERM

echo ""
echo "============================================================"
echo "  Backend API:  http://localhost:$BACKEND_PORT/docs"
echo "  Frontend UI:  http://localhost:$FRONTEND_PORT"
echo "  Press Ctrl+C to stop both servers."
echo "============================================================"
echo ""

wait
