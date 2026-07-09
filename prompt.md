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

## 2. Two parallel UIs, one shared backend core

This is the most important architectural fact about the repo: **there are TWO
complete user interfaces that both read/write the same SQLite database**, built at
different points in the project's history:

1. **`app.py`** — the original, full-featured **Streamlit** UI (~1000+ lines, pure
   Python, single process). This was the primary UI for most of the project's life
   and is **fully functional and left completely untouched** during the React
   rewrite described below. Still runs fine and can be used interchangeably with the
   new UI (same data).
2. **`frontend/` + `api.py`** — a **React + FastAPI rewrite** of the UI, added later
   at the user's request for "a rich, cutting-edge, modern web UI." This is now the
   primary/recommended way to run the app, launched via `./launch.sh`.

Both UIs share two Python modules that contain **all the actual business logic and
data access** — neither UI reimplements this logic independently:

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

Because both UIs import these same two modules and operate on the same
`data/inventory.db`, **items added via one UI are immediately visible in the other.**

### Why `api.py` duplicates a few constants instead of importing `app.py`

`api.py` (FastAPI) does **not** `import app`, because `app.py` has Streamlit-specific
top-level code (`st.set_page_config(...)` etc.) that would execute and error/misbehave
outside a Streamlit runtime. Instead, `api.py` duplicates the small set of *pure* data
constants and helper functions that both UIs need:
`CATEGORY_ICONS`, `CATEGORIES`, `PALETTE` (hex colors per category), `CATEGORY_UNITS`
(count vs. grams per category), `COMMON_ITEMS` (keyword → (category, shelf-life-days)
used for category guessing and expiration estimation), plus helpers
`guess_category()`, `estimate_shelf_life_days()`, `threshold_for()`,
`effective_threshold()`, `days_until_expiration()`. These values are kept in sync by
hand across `app.py` and `api.py` — if you change the category list, icons, palette,
or units, **update both files.**

---

## 3. Current architecture (v2.0 — React/FastAPI, the recommended way to run this app)

```
grocery-app/
├── launch.sh              # Runs BOTH servers together (see §5)
├── requirements.txt       # Python deps for the FastAPI backend (+ legacy Streamlit)
├── inventory.py           # Shared SQLite CRUD (see §2)
├── receipt.py             # Shared OCR + parsing (see §2)
├── api.py                 # FastAPI backend — NEW, powers the React UI
├── app.py                 # Streamlit UI — LEGACY, still fully functional, untouched
├── .streamlit/config.toml # Streamlit theme config (legacy UI only)
├── data/
│   ├── inventory.db       # SQLite database (gitignored)
│   └── images/*.jpg       # Normalized item photos (gitignored)
└── frontend/               # NEW React app
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

### Backend: `api.py` (FastAPI)
Runs via `uvicorn api:app --host 0.0.0.0 --port 8000 --reload`. CORS allows
`http://localhost:5173`. Mounts `/images` as a StaticFiles directory pointing at
`data/images/`. Key endpoint groups (all under `/api`):
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

- **Two live UIs on purpose.** `app.py` was NOT deleted or deprecated in code — it was
  deliberately preserved as a working fallback / legacy UI. Don't delete it unless the
  user explicitly asks.
- **Business logic lives in `inventory.py`/`receipt.py`, not in either UI layer.**
  If you add a new feature, prefer adding the DB/logic function there and then wiring
  it into *both* `app.py` and `api.py` if the user wants feature parity — otherwise the
  two UIs will drift.
- **Constants are intentionally duplicated between `app.py` and `api.py`** (categories,
  icons, palette, units, COMMON_ITEMS) rather than shared via import, to avoid
  Streamlit's top-level side effects leaking into the FastAPI process. Keep them in
  sync manually.
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
  `POST /api/items/restore`. The Streamlit UI has its own analogous undo-via-
  session_state mechanism. Note: restoring after undo does NOT currently preserve
  `custom_threshold` (a known small gap, low priority).
- **Receipt OCR is explicitly best-effort.** Don't try to make the regex parser
  perfect — the UI's mandatory human-review-before-add step is the real safety net.

---

## 5. How to run it

### Recommended: both servers together
```bash
cd /Users/pvullam/Documents/Github/grocery-app
./launch.sh
```
This script (repo root, executable):
1. Creates/activates `.venv`, installs `requirements.txt` if `fastapi` isn't importable.
2. Starts `uvicorn api:app --host 0.0.0.0 --port 8000 --reload` in the background.
3. Sources `~/.nvm/nvm.sh` and does `nvm use 22` if available (see Node gotcha below).
4. `npm install`s frontend deps if `frontend/node_modules` is missing, then starts
   `npm run dev -- --port 5173` in the background.
5. Traps EXIT/INT/TERM to kill both background processes together on Ctrl+C.
6. Prints both URLs: backend docs at `http://localhost:8000/docs`, UI at
   `http://localhost:5173`.

### Legacy Streamlit UI (still works, standalone)
```bash
cd /Users/pvullam/Documents/Github/grocery-app
source .venv/bin/activate
streamlit run app.py
```
Runs on `http://localhost:8501` (port may shift if already in use — check terminal
output / `lsof -i :8501`).

### Manual / component-by-component (useful for debugging)
```bash
# Backend only
source .venv/bin/activate && uvicorn api:app --reload --port 8000

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
  `.venv`, causing a false "Import could not be resolved" warning for
  streamlit/fastapi/etc. in the editor. Not a real bug — `.venv` has everything and
  the app runs fine from the terminal. Fix for the user: Command Palette → "Python:
  Select Interpreter" → choose `./.venv/bin/python`. Prefer `python -m py_compile
  <file>` or running the actual server over trusting the editor's error squiggles when
  in doubt.
- **Browser-tool checkbox clicks can be flaky** in this environment — sometimes need
  two clicks on the same element ref to actually toggle (first click only reaches
  "focused" state). When browser-based UI verification is ambiguous, prefer a direct
  `curl` against the FastAPI endpoints or a `sqlite3`/Python one-liner against
  `inventory.py` functions as more reliable ground truth than fighting UI timing.
- **Streamlit `config.toml` changes require a full server restart** (unlike `app.py`
  itself, which hot-reloads) — `pkill -f "streamlit run app.py"` then relaunch.

---

## 7. Verification status as of this writing

- Backend (`api.py`): all endpoint groups verified via `curl` against live data
  (`/api/meta`, `/api/summary`, `/api/items?category=...` confirmed correct).
- Frontend: `npx tsc --noEmit -p tsconfig.app.json` passes with zero errors across all
  components. All tabs (Add Items photo/receipt sub-tabs, all category tabs with
  search/sort/low-stock filter/quantity steppers, Shopping List, Charts, Settings
  sidebar with CSV export link) were confirmed rendering and functioning correctly via
  browser-based testing against the live backend and real database contents.
- `launch.sh`: run standalone end-to-end — both servers started correctly, printed
  URLs, served live data to an already-open browser tab, and the CSS/Node fixes above
  were validated by this run.
- Legacy Streamlit UI (`app.py`): last verified fully functional with its complete
  6-tab structure, custom theming, dark-mode-aware CSS, and all v1.x-era features
  (favorites, expiration tracking, custom thresholds, receipt scan, CSV export).

---

## 8. Suggested next steps if continuing this project

These are **not yet done** and would be reasonable next asks from the user:
- Fix the "custom_threshold not preserved through undo-restore" gap in
  `inventory.py`'s restore path (either UI).
- Consider a production build/deploy path (`vite build` + serve static, or Docker) —
  everything so far has been dev-server-oriented (`npm run dev`, `uvicorn --reload`).
- Consider removing the now-fully-redundant `get_low_stock_items()` legacy function
  from `inventory.py` if confirmed unused by both UIs.
- No automated tests exist for either UI or `inventory.py`/`receipt.py` — all
  verification so far has been manual (curl, browser tools, direct SQL/Python
  one-liners). Adding a pytest suite around `inventory.py`'s CRUD functions would be
  low-risk, high-value if the user wants more confidence for future changes.
