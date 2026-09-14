# Grocery & Vegetable Tracker — Project Context Prompt

> This document is written so that another LLM/agent (or a human) can pick up this
> project with full context, without needing to re-derive history from git log or
> conversation transcripts. It describes what the app is, how it evolved, the current
> architecture, key decisions/trade-offs, known gotchas, and how to run/verify it.

---

## 1. What this project is

A **Mac-local, single-user grocery & vegetable inventory tracker**. You take/upload a
photo of an item (or scan a receipt, or add manually), name it, categorize it
(Groceries / Vegetables / Household — extensible), and track quantity. The app helps
answer: *"What do I have? What's running low? What should I buy?"*

There is **no cloud, no auth, no multi-user support, no AI image classification**
(an earlier AI-classification approach using torch/transformers was deliberately
removed — see History below). All entry is manual (title/category/quantity typed or
picked by the user), optionally assisted by OCR receipt scanning.

Data lives in a single SQLite database at `data/inventory.db` (gitignored), and item
photos are normalized to JPEG and stored in `data/images/<uuid>.jpg` (gitignored).

---

## 2. One UI (React/FastAPI), backed by a shared business-logic core

There used to be two parallel UIs here — the original Streamlit app (`app.py`) and
the React+FastAPI rewrite (`frontend/` + `api.py`) — but the Streamlit UI has been
**removed entirely** (see History below). The **only UI now** is:

- **`frontend/` + `api.py`** — a **React + FastAPI** app, launched via `./launch.sh`.
  `frontend/` is the React SPA; `api.py` (together with the `routers/` package it
  wires together — see §3) is the FastAPI backend it talks to over HTTP.

This UI is built on top of two Python modules that contain **all the actual business
logic and data access** — the UI layer (`api.py`/`routers/`) never reimplements this
logic itself:

- **`inventory.py`** — the single source of truth for all SQLite CRUD. Owns:
  - `init_db()` — creates tables (`items`, `favorites`, `shopping_list`, `settings`)
    and runs additive migrations (`_migrate_add_notes_column`,
    `_migrate_add_custom_threshold_column`, `_migrate_legacy_category_check`, etc.)
  - Item CRUD: `add_item`, `update_item`, `update_quantity` (deletes row if qty<=0),
    `delete_item`, `find_item_by_title` (case-insensitive title+category match, used
    to merge duplicates on add instead of creating a new row)
  - Query helpers: `get_items_by_category`, `get_category_total`,
    `get_title_breakdown`, `get_items_added_by_date`, `get_total_count`,
    `get_low_stock_items` (legacy, mostly superseded by per-item/category thresholds)
  - Favorites CRUD: `add_favorite` (upserts via `ON CONFLICT ... DO UPDATE`),
    `remove_favorite`, `get_favorites`, `is_favorited`
  - Shopping list CRUD: `add_shopping_list_item` (dedupes existing unchecked entries
    via `category IS ?`, important because `IS` handles NULL correctly unlike `=`),
    `get_shopping_list`, `set_shopping_item_checked`, `delete_shopping_item`,
    `clear_checked_shopping_items`
  - Settings (single row, id=1): `get_settings()` / `update_settings()` —
    `count_threshold` (default 2) and `weight_threshold` (default 200 grams)
- **`receipt.py`** — OCR text extraction + heuristic line parsing for the receipt-scan
  feature. `ocr_receipt_image(image: PIL.Image) -> str` lazy-imports `pytesseract`
  inside the function (keeps the import cost isolated). `parse_receipt_text(raw_text)`
  strips noise lines (total/tax/visa/thank-you keywords), strips trailing
  `\d+\.\d{2}` prices via regex, strips leading quantity codes (e.g. "2x"). This is
  explicitly documented as **best-effort** — the mandatory human-review step in the
  UI before items are actually added is the real safety net, not the regex.

Because the UI imports these same two modules and operates on the same
`data/inventory.db`, this has held true across the project's history regardless of
which UI happened to be primary at the time: **the backend's data is independent of
whatever sits on top of it.**

### Shared constants/helpers live in `api_common.py`, not in `api.py` itself

The backend is split into `api.py` (app setup) + a `routers/` package (one module per
endpoint group — see §3). All of them need a small set of *pure* data constants and
helper functions: `CATEGORY_ICONS`, `CATEGORIES`, `PALETTE` (hex colors per category),
`CATEGORY_UNITS` (count vs. grams per category), `COMMON_ITEMS` (keyword → (category,
shelf-life-days) used for category guessing and expiration estimation), plus helpers
`guess_category()`, `estimate_shelf_life_days()`, `threshold_for()`,
`effective_threshold()`, `days_until_expiration()`, and a handful of other shared
helpers/paths (see §3's "Why `api_common.py` exists" note). These all live in
`api_common.py`, which every router imports from — routers must never import from
`api.py` itself, since `api.py` imports the routers (importing back from `api.py`
would create a circular import).

---

## 3. Current architecture (React/FastAPI — the one and only UI)

```
grocery-app/
├── launch.sh              # Runs BOTH servers together (see §5)
├── requirements.txt       # Python deps for the FastAPI backend
├── backend/               # All Python backend source (see "backend/ package" note below)
│   ├── inventory.py           # Shared SQLite CRUD (see §2)
│   ├── receipt.py             # Shared OCR + parsing (see §2)
│   ├── classifier.py / image_search.py / barcode.py
│   ├── api.py                 # FastAPI app setup: app creation, middleware, CORS,
│   │                           #   /images mount, inventory.init_db(), include_router(...)
│   │                           #   calls for every module in routers/ (see below)
│   ├── api_common.py           # Shared constants/paths/helpers used by api.py AND every
│   │                           #   routers/*.py module (CATEGORIES, CATEGORY_UNITS,
│   │                           #   guess_category(), BASE_DIR/IMAGES_DIR/BACKUPS_DIR, the
│   │                           #   `logger`, CSV (de)serialization helpers, etc.)
│   └── routers/                # One module per endpoint group, each with `router =
│                               #   APIRouter()` and `@router.get/post/...` handlers —
│                               #   meta, lookup, items, insights, item_media, summary,
│                               #   favorites, shopping_list, meal_plan, receipt_scan,
│                               #   charts, purchases, export_import, backups,
│                               #   duplicates, storage_locations, tunnel
├── tests/                 # Pytest suite - pytest.ini sets `pythonpath = . backend` so
│                           #   `import inventory` / `import api` resolve unchanged
├── data/
│   ├── inventory.db       # SQLite database (gitignored) - stays at repo root; BASE_DIR
│   │                       #   in api_common.py resolves two levels up from
│   │                       #   backend/api_common.py to find it, same physical path as
│   │                       #   before the backend/ package existed
│   └── images/*.jpg       # Normalized item photos (gitignored)
└── frontend/               # React app
    ├── vite.config.ts      # react() + tailwindcss() plugins, @ alias, dev proxy
    ├── tsconfig.app.json    # paths alias, strict flags (see gotchas)
    └── src/
        ├── main.tsx         # QueryClientProvider + <Toaster/> (sonner) wrapping <App/>
        ├── App.tsx           # Top-level layout: sidebar (Settings) + main (Header+Tabs)
        ├── index.css         # Tailwind v4 CSS-first theme (@theme block, no config.js)
        ├── types.ts          # TS interfaces mirroring api.py's JSON response shapes
        ├── lib/
        │   ├── api.ts        # axios instance + one method per backend endpoint
        │   └── utils.ts      # cn(), formatQuantity(), daysUntil(), imageUrl()
        └── components/
            ├── ui.tsx              # Button/Card/Badge/Input/Select/Checkbox/... primitives
            ├── Dialog.tsx          # Radix Dialog wrapper
            ├── Tabs.tsx            # Radix Tabs wrapper (pill-style active state)
            ├── Header.tsx          # Hero banner, metrics, favorites, low-stock/expiring alerts
            ├── CategoryView.tsx    # Per-category search/sort/low-stock-filter + item grid
            ├── ItemCard.tsx        # Item card: thumbnail, qty stepper, edit/delete, badges
            ├── EditItemDialog.tsx  # Full edit form: title/category/qty/notes/threshold/
            │                       #   expiration/favorite/replace-photo
            ├── AddItemsTab.tsx     # "By Photo" (multi-file batch) + "By Receipt" (OCR) sub-tabs
            ├── ShoppingListTab.tsx # Add-low-stock / manual add / check-off / clear-checked
            ├── ChartsTab.tsx       # Recharts: category counts, stock-by-item, added-over-time
            └── SettingsSidebar.tsx # count/weight threshold inputs + CSV export link
```

### Backend: `api.py` + `routers/` (FastAPI)
Runs via `uvicorn api:app --host 0.0.0.0 --port 8000 --reload`. CORS allows
`http://localhost:5173`. Mounts `/images` as a StaticFiles directory pointing at
`data/images/`. `api.py` itself is intentionally small — app creation, the request-
logging middleware, the unhandled-exception handler, CORS setup, the `/images` mount,
`inventory.init_db()`, and one `app.include_router(...)` call per module in `routers/`
— all the actual route handlers live in `routers/*.py`. Key endpoint groups (all
under `/api`):
- `GET /api/meta` — categories, icons, units, palette (drives nearly all frontend
  rendering decisions, so the frontend always fetches this first)
- `GET/PUT /api/settings` — thresholds
- `GET /api/items?category=` / `POST /api/items` (multipart, auto-merges duplicates)
  / `PUT /api/items/{id}` / `PATCH /api/items/{id}/quantity` / `DELETE /api/items/{id}`
  (returns the deleted row so the frontend can offer an "Undo" toast) /
  `POST /api/items/restore`
- `GET /api/summary` — total rows, per-category totals, low-stock items, expiring items
- `GET/POST/DELETE /api/favorites`, `POST /api/favorites/{id}/quick-add`
- `GET/POST /api/shopping-list`, `PATCH/DELETE /api/shopping-list/{id}`,
  `POST /api/shopping-list/add-low-stock`, `POST /api/shopping-list/clear-checked`
- `POST /api/receipt/scan` — returns `{candidates: [{title, category}]}` for review
- `GET /api/charts/category-counts`, `/api/charts/stock-by-item?category=`,
  `/api/charts/added-over-time?category=`
- `GET /api/export/csv` — PlainTextResponse CSV download

### Frontend: `frontend/` (Vite + React 19 + TypeScript + Tailwind v4 + Radix + TanStack Query)
- **Tailwind v4** is CSS-first: there is **no `tailwind.config.js`**. Theme tokens
  (brand green scale with `--color-brand-500: #1B7A4D` as the primary, `--color-veg-500:
  #FF8C42`, `--color-household-500: #6C63FF`, Inter font, shadow tokens, a fade-in
  keyframe) live inside an `@theme { ... }` block in `src/index.css`.
- **Path alias** `@/*` → `./src/*` is configured in BOTH `tsconfig.app.json`
  (`compilerOptions.paths`) and `vite.config.ts` (`resolve.alias`) — both are needed,
  one for the TS language service/type-checking, one for the actual bundler resolution.
- **State/data-fetching**: TanStack React Query for all server state (queries keyed
  like `["items", category]`, `["summary"]`, `["settings"]`, `["favorites"]`,
  `["shopping-list"]`, `["charts", ...]` — mutations invalidate the relevant keys on
  success). `axios` instance in `lib/api.ts` with `baseURL: "/api"`, relying on the
  Vite dev-server proxy (see below) to reach the FastAPI backend.
- **UI primitives**: hand-built (not shadcn CLI) on top of Radix UI primitives
  (`@radix-ui/react-dialog`, `-tabs`, `-checkbox`, `-select`, `-label`, `-switch`) plus
  `class-variance-authority` + `clsx` + `tailwind-merge` for variant styling, `lucide-
  react` for icons, `sonner` for toast notifications, `recharts` for charts, `date-fns`
  for date formatting.
- **Dev server proxy**: `vite.config.ts` proxies `/api/*` and `/images/*` to
  `http://localhost:8000` so the frontend code always just calls relative paths.

---

## 4. Key decisions & trade-offs (so you don't "fix" intentional choices)

- **Business logic lives in `inventory.py`/`receipt.py`, not in the UI layer.**
  If you add a new feature, prefer adding the DB/logic function there and then wiring
  it into `api.py`/`routers/` — keep the route handlers themselves thin.
- **Shared backend constants/helpers live in `api_common.py`, imported by every
  router** (categories, icons, palette, units, COMMON_ITEMS, `guess_category()`, etc.)
  — see §2. Routers must import from `api_common.py`, never from `api.py`, to avoid a
  circular import (since `api.py` imports the routers).
- **Quantity units are derived purely from category, not stored per-item.** Vegetables
  are tracked in grams, Groceries/Household as plain counts. This means quantity is a
  loosely-typed SQLite column (float for grams, int-ish for counts) — no unit column.
- **Low-stock thresholds are two-tier**: a global per-category-type threshold
  (`count_threshold`, `weight_threshold` in Settings) plus an optional per-item
  `custom_threshold` override (`effective_threshold()` picks the item's override if
  set, else falls back to the global one for that category's unit type).
- **Duplicate-merge on add**: adding an item whose title+category (case-insensitive)
  already exists increments the existing row's quantity instead of creating a new row
  (`find_item_by_title`). Applies in both UIs.
- **Delete is soft/undoable at the UI level**: `DELETE /api/items/{id}` returns the
  deleted row so the frontend can show an "Undo" toast that calls
  `POST /api/items/restore`. Note: restoring after undo does NOT currently preserve
  `custom_threshold` (a known small gap, low priority).
- **Receipt OCR is explicitly best-effort.** Don't try to make the regex parser
  perfect — the UI's mandatory human-review-before-add step is the real safety net.

---

## 5. How to run it

### Recommended: both servers together
```bash
cd /Users/vullamkarthik/Library/CloudStorage/OneDrive-TheBostonConsultingGroup,Inc/Documents/GitHub/grocery-app
./launch.sh
```
This script (repo root, executable):
1. Creates/activates `.venv`, installs `requirements.txt` if `fastapi` isn't importable.
2. Starts `uvicorn api:app --app-dir backend --host 0.0.0.0 --port 8000 --reload` in the
   background (`--app-dir backend` is required now that the backend source lives in
   `backend/` rather than the repo root - see §9 History).
3. Sources `~/.nvm/nvm.sh` and does `nvm use 22` if available (see Node gotcha below).
4. `npm install`s frontend deps if `frontend/node_modules` is missing, then starts
   `npm run dev -- --port 5173` in the background.
5. Traps EXIT/INT/TERM to kill both background processes together on Ctrl+C.
6. Prints both URLs: backend docs at `http://localhost:8000/docs`, UI at
   `http://localhost:5173`.

### Manual / component-by-component (useful for debugging)
```bash
# Backend only
source .venv/bin/activate && uvicorn api:app --app-dir backend --reload --port 8000

# Frontend only (in a second terminal)
cd frontend && npm run dev
```

---

## 6. Known gotchas (read before debugging "weird" errors)

- **Node version blocks Vite entirely, with a misleading error.** The system's default
  Node was `20.18.0`. Vite 8 (rolldown-based) requires Node `>=20.19` or `>=22.12`.
  Below that threshold, `npm run dev` fails with *"Cannot find native binding... npm
  has a bug related to optional dependencies"* — this looks like an npm optional-deps
  bug but is actually **just the Node version gate**; `rm -rf node_modules package-
  lock.json && npm install` alone does NOT fix it. Real fix: `nvm install 22 && nvm
  use 22`, THEN reinstall `node_modules` under that Node version. `launch.sh` already
  automates this (auto `nvm use 22` if `~/.nvm/nvm.sh` exists) — if you hit this error
  running things manually, do the same.
- **Tailwind v4 `@import` ordering**: any extra `@import url(...)` (e.g. the Google
  Fonts Inter import) in `src/index.css` **must come before** `@import "tailwindcss";`,
  not after — otherwise PostCSS errors `"@import must precede all other statements"`
  once Tailwind's own import expands into ~1000+ lines of generated CSS ahead of the
  font import in file order.
- **`tsconfig.app.json` should NOT set `baseUrl`** alongside `paths` on recent
  TypeScript (~6.0) with `moduleResolution: "bundler"` — `baseUrl` is deprecated there
  and errors with TS5101. `paths` alone is sufficient for the `@/*` alias to resolve.
- **Recharts per-bar coloring**: to color individual bars differently in a single
  `<BarChart>`, use `<Cell fill={...} />` children inside `<Bar>` (imported from
  `"recharts"`), not raw SVG `<rect>` elements.
- **`npm create vite@latest` ships different boilerplate than older docs/examples
  show** (current default template has hero/docs sections in `App.tsx`, uses Oxlint
  instead of ESLint). If overwriting the generated `App.tsx`, it's often faster to
  write the whole file via a terminal heredoc (`cat > file << 'EOF' ... EOF`) than to
  match its exact boilerplate text with a string-replace tool.
- **Python tool/editor interpreter mismatch (cosmetic only)**: VS Code's Python
  tooling sometimes resolves to an unrelated global Python instead of this project's
  `.venv`, causing a false "Import could not be resolved" warning for fastapi/etc. in
  the editor. Not a real bug — `.venv` has everything and the app runs fine from the
  terminal. Fix for the user: Command Palette → "Python: Select Interpreter" → choose
  `./.venv/bin/python`. Prefer `python -m py_compile <file>` or running the actual
  server over trusting the editor's error squiggles when in doubt.
- **Browser-tool checkbox clicks can be flaky** in this environment — sometimes need
  two clicks on the same element ref to actually toggle (first click only reaches
  "focused" state). When browser-based UI verification is ambiguous, prefer a direct
  `curl` against the FastAPI endpoints or a `sqlite3`/Python one-liner against
  `inventory.py` functions as more reliable ground truth than fighting UI timing.
- **Routers must import from `api_common.py`, never from `api.py`.** `api.py` imports
  every module in `routers/` to call `app.include_router(...)` on it — a router that
  tried to `import api` back would create a circular import at module-load time.

---

## 7. Verification status as of this writing

- Backend (`api.py` + `routers/`): all endpoint groups verified via `curl` against
  live data (`/api/meta`, `/api/summary`, `/api/items?category=...` confirmed
  correct); `pytest tests/` passes against the split-into-routers layout.
- Frontend: `npx tsc --noEmit -p tsconfig.app.json` passes with zero errors across all
  components. All tabs (Add Items photo/receipt sub-tabs, all category tabs with
  search/sort/low-stock filter/quantity steppers, Shopping List, Charts, Settings
  sidebar with CSV export link) were confirmed rendering and functioning correctly via
  browser-based testing against the live backend and real database contents.
- `launch.sh`: run standalone end-to-end — both servers started correctly, printed
  URLs, served live data to an already-open browser tab, and the CSS/Node fixes above
  were validated by this run.

---

## 8. Suggested next steps if continuing this project

These are **not yet done** and would be reasonable next asks from the user:
- Fix the "custom_threshold not preserved through undo-restore" gap in
  `inventory.py`'s restore path.
- Consider a production build/deploy path (`vite build` + serve static, or Docker) —
  everything so far has been dev-server-oriented (`npm run dev`, `uvicorn --reload`).
- Consider removing the now-fully-redundant `get_low_stock_items()` legacy function
  from `inventory.py` if confirmed unused.
- Expand the existing `tests/` suite (currently covers `inventory.py`'s CRUD, the
  parsers, and the API layer via `TestClient`) as new features are added.

---

## 9. History

- **An earlier AI-image-classification approach** (torch/transformers-based) was tried
  and deliberately removed — categorization is manual/keyword+lightweight-classifier
  based instead (see §1, §2).
- **The project originally had two parallel UIs**: the original Streamlit app
  (`app.py`, plus `.streamlit/config.toml`) and the React+FastAPI rewrite
  (`frontend/` + `api.py`). The Streamlit UI has since been **removed entirely**
  (`app.py` and `.streamlit/` deleted, `streamlit` dropped from `requirements.txt`) —
  `frontend/` + `api.py` is now the one and only UI. Nothing else changed: both UIs
  always shared the same `inventory.py`/`receipt.py` business logic and the same
  `data/inventory.db`, so removing the Streamlit UI did not touch data or the backend
  logic, only the now-dead `app.py` entry point and its Streamlit-only config/deps.
- **`api.py` was subsequently split into a `routers/` package.** What used to be a
  single ~1600-line `api.py` with every route handler defined inline is now: a small
  `api.py` (app setup + `include_router(...)` calls), `api_common.py` (shared
  constants/paths/helpers — see §2/§3), and `routers/*.py` (one module per endpoint
  group). This was a pure reorganization — same URL paths, methods, request/response
  shapes, and behavior throughout; nothing about how the API behaves changed, only
  where the code that implements it lives. §2, §3, §4, and §6 above describe the
  *current* (post-split) layout, not the historical monolithic one.
- **All backend Python modules were subsequently moved into a `backend/` package.**
  `api.py`, `api_common.py`, `inventory.py`, `receipt.py`, `classifier.py`,
  `image_search.py`, `barcode.py`, and `routers/` used to sit directly at the repo
  root alongside `frontend/`, `tests/`, and the project tooling; they now live under
  `backend/` (git history preserved via `git mv`). Also removed as part of this
  cleanup: `api_meal_plan.py` (a completely unimported, dead early prototype of the
  meal-plan `PATCH` endpoint - superseded long ago by `routers/meal_plan.py`) and the
  empty legacy `grocery_app.db` tracked at the repo root (data has lived in the
  gitignored `data/inventory.db` for a long time; this stray 0-byte file predated that
  convention and had been accidentally committed before `*.db` was added to
  `.gitignore`).
  - **Nothing about where data physically lives changed.** `api_common.py`'s
    `BASE_DIR` and `inventory.py`'s `DB_PATH` were updated to resolve one directory
    level further up (`.parent.parent` instead of `.parent`) so `data/inventory.db`,
    `data/images/`, `data/backups/`, and `frontend/dist/` all still resolve to the
    exact same physical paths at the repo root as before the move - verified by
    booting the relocated backend against the real (non-test) database and confirming
    pre-existing data was still visible, not orphaned.
  - `launch.sh` and `launch-tunnel.sh` now pass `uvicorn ... --app-dir backend` so
    `api:app` resolves inside the new location.
  - `pytest.ini`'s `pythonpath` is now `. backend` (was just `.`) so `tests/*.py`'s
    existing `import inventory` / `import api` / `import receipt` statements keep
    working completely unchanged - no test file needed to change.
  - This was, again, a pure reorganization (plus dead-code/cruft removal) - no
    behavior, endpoint, or schema changes.
