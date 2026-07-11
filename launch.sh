#!/usr/bin/env bash
#
# Grocery & Vegetable Tracker Launcher
#
# Features:
#   - Prefers Python 3.11 (best compatibility with AI/ML libraries)
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

if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3.11)"
elif command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3.12)"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
else
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
# Upgrade pip
###############################################################################

echo "==> Upgrading pip..."
python -m pip install --upgrade pip setuptools wheel

###############################################################################
# Install Backend Dependencies
###############################################################################

echo "==> Installing backend dependencies..."
pip install -r "$ROOT_DIR/requirements.txt"


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
# Install Frontend Dependencies
###############################################################################

cd "$ROOT_DIR/frontend"

echo "==> Installing frontend dependencies..."
npm install

cd "$ROOT_DIR"

###############################################################################
# Start Backend
###############################################################################

echo ""
echo "==> Starting FastAPI..."

uvicorn api:app \
    --host 0.0.0.0 \
    --port "$BACKEND_PORT" \
    --reload &
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
# Cleanup
###############################################################################

cleanup() {

    echo ""
    echo "============================================================"
    echo "Stopping services..."
    echo "============================================================"

    kill "$BACKEND_PID" "$FRONTEND_PID" >/dev/null 2>&1 || true

    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true

    echo "Done."
}

trap cleanup EXIT INT TERM

###############################################################################
# Ready
###############################################################################

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