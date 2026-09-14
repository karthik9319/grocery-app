# Grocery & Vegetable Tracker

A local, single-user grocery and household inventory tracker. Track what you have, what's
running low, what's expiring, and what you've spent — with barcode scanning, receipt OCR,
meal planning, and spending insights built in.

No cloud, no accounts, no multi-user sync — everything lives in a local SQLite database on
your machine.

## Features

- **Add items** by photo, barcode scan (via Open Food Facts), receipt OCR scan, quick-add
  text parsing, or CSV import
- **Track inventory** by category (Groceries / Vegetables / Household / Snacks), with
  count- or weight-based quantities depending on category
- **Storage location** (Fridge / Freezer / Pantry / Cabinet), expiration dates, and
  shelf-life estimation
- **Low-stock alerts** with global thresholds plus per-item overrides, and a shopping list
  that can auto-populate from what's running low
- **Usage tracking**: log consume/restock/use/return events per item, with run-out
  predictions based on consumption history
- **Meal planning** with a weekly slot-based planner and completion tracking
- **Spending**: purchase price history, last-price-paid lookups, and spending charts
- **Favorites**, duplicate-item detection/merging, bulk delete/move, automatic local
  backups, and full CSV import/export
- **Off-machine backup**: once-per-day snapshot (database + photos) copied into iCloud
  Drive automatically, if it's available on your Mac
- **PWA support** with an offline write queue, plus an optional Cloudflare tunnel for
  remote access
- Command palette and global search across items, shopping list, and meal plan

## Tech stack

- **Backend**: FastAPI (`backend/api.py` + `backend/routers/`), SQLite via a shared
  data-access layer (`backend/inventory.py`), OCR via `pytesseract`/`paddleocr`
  (`backend/receipt.py`)
- **Frontend**: React 19 + TypeScript + Vite, Tailwind v4, Radix UI primitives, TanStack
  Query, Recharts

## Getting started

Requires Python 3.13 (the newest version with `paddlepaddle` wheels available) and Node 22.

```bash
./launch.sh
```

This creates/activates a virtualenv, installs backend and frontend dependencies, and starts
both servers together:

- Backend API + docs: http://localhost:8000/docs
- Frontend UI: http://localhost:5173

Press `Ctrl+C` to stop both.

### Running components separately

```bash
# Backend only
source .venv/bin/activate && uvicorn api:app --app-dir backend --reload --port 8000

# Frontend only (in a second terminal)
cd frontend && npm run dev
```

### Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Project structure

```
grocery-app/
├── launch.sh                 # Starts both servers together
├── backend/
│   ├── inventory.py           # SQLite data-access layer (single source of truth)
│   ├── receipt.py               # Receipt OCR text extraction + parsing
│   ├── classifier.py / image_search.py / barcode.py
│   ├── api.py                  # FastAPI app setup + router registration
│   ├── api_common.py            # Shared constants/helpers used by every router
│   └── routers/                  # FastAPI routers, one module per feature area
├── tests/                     # Pytest suite (pytest.ini adds backend/ to pythonpath)
├── data/                      # SQLite db, images, backups (gitignored, untouched by
│                                 the backend/ move - still lives at repo root)
└── frontend/                  # React + Vite app
    └── src/
        ├── components/          # Tab views, dialogs, item cards, etc.
        ├── lib/                   # API client, formatting/util helpers
        └── types.ts                # TypeScript types mirroring the API's JSON shapes
```

See [`prompt.md`](prompt.md) for a deeper architectural write-up (design decisions,
gotchas, and history) intended for anyone — human or AI — picking up the project.
