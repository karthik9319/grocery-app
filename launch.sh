#!/usr/bin/env bash
#
# Grocery & Vegetable Tracker Launcher
#
# Features:
#   - Prefers the newest Python that still has paddlepaddle wheels (3.13 as of this
#     writing; 3.14+ has no paddlepaddle wheel yet, see the version check below)
#   - Automatically recreates .venv if using unsupported Python (>=3.14)
#   - Installs backend/frontend dependencies
#   - Starts FastAPI backend
#   - Starts React/Vite frontend
#   - Cleans up both processes on exit
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "============================================================"
echo " Grocery & Vegetable Tracker Launcher"
echo "============================================================"
echo "Project Root : $ROOT_DIR"
echo ""

###############################################################################
# Select Python
###############################################################################

for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
        PYTHON_BIN="$(command -v "$candidate")"
        break
    fi
done

if [ -z "${PYTHON_BIN:-}" ]; then
    echo "ERROR: Python is not installed."
    exit 1
fi

echo "==> Using Python: $PYTHON_BIN"

###############################################################################
# Create / Validate Virtual Environment
###############################################################################

RECREATE_VENV=false

if [ ! -d "$ROOT_DIR/.venv" ]; then
    RECREATE_VENV=true
else
    VENV_PYTHON="$ROOT_DIR/.venv/bin/python"

    if [ ! -f "$VENV_PYTHON" ]; then
        RECREATE_VENV=true
    else
        PY_VERSION=$("$VENV_PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

        echo "==> Existing virtualenv Python: $PY_VERSION"

        if [[ "$PY_VERSION" == "3.14" ]] || [[ "$PY_VERSION" > "3.14" ]]; then
            echo "==> Python $PY_VERSION is not recommended."
            echo "==> Recreating virtual environment..."
            rm -rf "$ROOT_DIR/.venv"
            RECREATE_VENV=true
        fi
    fi
fi

if [ "$RECREATE_VENV" = true ]; then
    echo "==> Creating virtual environment..."
    "$PYTHON_BIN" -m venv "$ROOT_DIR/.venv"
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

echo "==> Python Version: $(python --version)"

###############################################################################
# Upgrade pip (only needed right after creating a fresh venv - skip the PyPI
# round-trip on every ordinary launch)
###############################################################################

if [ "$RECREATE_VENV" = true ]; then
    echo "==> Upgrading pip..."
    python -m pip install --upgrade pip setuptools wheel
fi

###############################################################################
# Install Backend Dependencies (skip if requirements.txt hasn't changed since
# the last install - re-resolving ~40 packages, including paddlepaddle/
# paddleocr's large dependency tree, on every launch is what made this slow)
###############################################################################

REQ_HASH_FILE="$ROOT_DIR/.venv/.requirements.sha256"
REQ_HASH="$(shasum -a 256 "$ROOT_DIR/requirements.txt" | awk '{print $1}')"

if [ ! -f "$REQ_HASH_FILE" ] || [ "$(cat "$REQ_HASH_FILE")" != "$REQ_HASH" ] \
    || ! python -m pip check >/dev/null 2>&1 \
    || ! python -c "import fastapi, uvicorn, PIL" >/dev/null 2>&1; then
    echo "==> Installing backend dependencies (requirements.txt changed)..."
    pip install -r "$ROOT_DIR/requirements.txt"
    echo "$REQ_HASH" > "$REQ_HASH_FILE"
else
    echo "==> Backend dependencies up to date, skipping install."
fi


###############################################################################
# Node Setup
###############################################################################

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"

    nvm use 22 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
fi

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js not found."
    exit 1
fi

echo "==> Node : $(node -v)"
echo "==> npm  : $(npm -v)"

###############################################################################
# Install Frontend Dependencies (skip if package-lock.json hasn't changed)
###############################################################################

cd "$ROOT_DIR/frontend"

LOCK_HASH_FILE="node_modules/.package-lock.sha256"
LOCK_HASH="$(shasum -a 256 package-lock.json | awk '{print $1}')"

if [ ! -d node_modules ] || [ ! -f "$LOCK_HASH_FILE" ] \
    || [ "$(cat "$LOCK_HASH_FILE" 2>/dev/null)" != "$LOCK_HASH" ] \
    || ! npm ls --depth=0 >/dev/null 2>&1; then
    echo "==> Installing frontend dependencies (lockfile changed or install is incomplete)..."
    npm ci --prefer-offline
    echo "$LOCK_HASH" > "$LOCK_HASH_FILE"
else
    echo "==> Frontend dependencies up to date, skipping install."
fi

cd "$ROOT_DIR"

###############################################################################
# Cleanup (registered before either process starts so a partial launch cannot
# leave an orphaned backend or frontend behind)
###############################################################################

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "============================================================"
    echo "Stopping services..."
    echo "============================================================"

    if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" >/dev/null 2>&1 || true; fi
    if [ -n "$FRONTEND_PID" ]; then kill "$FRONTEND_PID" >/dev/null 2>&1 || true; fi
    if [ -n "$BACKEND_PID" ]; then wait "$BACKEND_PID" 2>/dev/null || true; fi
    if [ -n "$FRONTEND_PID" ]; then wait "$FRONTEND_PID" 2>/dev/null || true; fi

    echo "Done."
}

trap cleanup EXIT INT TERM

###############################################################################
# Start Backend
###############################################################################

echo ""
echo "==> Starting FastAPI..."

UVICORN_ARGS=(api:app --app-dir backend --host 0.0.0.0 --port "$BACKEND_PORT")
if [ "${GROCERY_RELOAD:-0}" = "1" ]; then
    UVICORN_ARGS+=(--reload --reload-exclude "$ROOT_DIR/.venv" --reload-exclude "$ROOT_DIR/data" \
        --reload-exclude "$ROOT_DIR/frontend" --reload-exclude "$ROOT_DIR/tests")
fi
uvicorn "${UVICORN_ARGS[@]}" &
BACKEND_PID=$!

###############################################################################
# Start Frontend
###############################################################################

cd "$ROOT_DIR/frontend"

echo "==> Starting React/Vite..."

npm run dev -- --host --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

cd "$ROOT_DIR"

###############################################################################
# Ready (do not claim success until both processes answer HTTP requests)
###############################################################################

wait_for_service() {
    local pid="$1"
    local url="$2"
    local label="$3"
    local attempt
    for attempt in {1..120}; do
        if ! kill -0 "$pid" >/dev/null 2>&1; then
            echo "ERROR: $label stopped during startup."
            return 1
        fi
        if curl --silent --fail --max-time 2 "$url" >/dev/null 2>&1; then
            echo "==> $label ready."
            return 0
        fi
        sleep 0.5
    done
    echo "ERROR: Timed out waiting for $label at $url"
    return 1
}

wait_for_service "$BACKEND_PID" "http://localhost:$BACKEND_PORT/api/health" "Backend"
wait_for_service "$FRONTEND_PID" "http://localhost:$FRONTEND_PORT" "Frontend"

echo ""
echo "============================================================"
echo "Application Started"
echo "============================================================"
echo "Backend API : http://localhost:$BACKEND_PORT/docs"
echo "Frontend UI : http://localhost:$FRONTEND_PORT"
echo ""
echo "Press Ctrl+C to stop both services."
echo "============================================================"
echo ""

wait
