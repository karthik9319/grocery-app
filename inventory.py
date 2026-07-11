"""SQLite-backed storage for grocery/vegetable inventory items."""
import sqlite3
import uuid as uuid_lib
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "data" / "inventory.db"


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                image_path TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                default_quantity REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE(title, category)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS shopping_list (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT,
                checked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                count_threshold REAL NOT NULL DEFAULT 2,
                weight_threshold REAL NOT NULL DEFAULT 200
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meal_plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                meal_slot TEXT NOT NULL,
                title TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, count_threshold, weight_threshold) "
            "VALUES (1, 2, 200)"
        )
        conn.commit()
        _migrate_legacy_category_check(conn)
        _migrate_add_notes_column(conn)
        _migrate_add_custom_threshold_column(conn)
        _migrate_add_expiration_column(conn)
        _migrate_add_uuid_column(conn)


def _migrate_legacy_category_check(conn: sqlite3.Connection) -> None:
    """Older DBs had CHECK(category IN ('Groceries', 'Vegetables')), which blocks adding
    new categories (e.g. Household). Rebuild the table without that constraint, preserving
    existing rows, if the old schema is detected."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
    ).fetchone()
    if row and row["sql"] and "CHECK" in row["sql"]:
        conn.execute("ALTER TABLE items RENAME TO items_legacy")
        conn.execute(
            """
            CREATE TABLE items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                image_path TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT INTO items (id, title, category, quantity, image_path, created_at) "
            "SELECT id, title, category, quantity, image_path, created_at FROM items_legacy"
        )
        conn.execute("DROP TABLE items_legacy")
        conn.commit()


def _migrate_add_notes_column(conn: sqlite3.Connection) -> None:
    """Older DBs don't have a notes column - add it if missing."""
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "notes" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN notes TEXT")
        conn.commit()


def _migrate_add_custom_threshold_column(conn: sqlite3.Connection) -> None:
    """Older DBs don't have a per-item custom low-stock threshold column - add if missing."""
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "custom_threshold" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN custom_threshold REAL")
        conn.commit()


def _migrate_add_expiration_column(conn: sqlite3.Connection) -> None:
    """Older DBs don't have an expiration_date column - add if missing."""
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "expiration_date" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN expiration_date TEXT")
        conn.commit()

def _migrate_add_uuid_column(conn: sqlite3.Connection) -> None:
    """Older DBs don't have a stable uuid per item - add it, backfill existing rows with
    a random unique value (so pre-existing items get a permanent identity too), then
    enforce uniqueness so CSV re-imports can reliably dedupe by uuid."""
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "uuid" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN uuid TEXT")
        conn.execute(
            """
            UPDATE items SET uuid = (
                lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' ||
                hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))
            ) WHERE uuid IS NULL
            """
        )
        conn.commit()
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid)")
    conn.commit()

@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def add_item(
    title: str,
    category: str,
    quantity: int,
    image_path: Optional[str],
    notes: Optional[str] = None,
    custom_threshold: Optional[float] = None,
    expiration_date: Optional[str] = None,
    item_uuid: Optional[str] = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO items (title, category, quantity, image_path, notes, "
            "custom_threshold, expiration_date, uuid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                title.strip(),
                category,
                quantity,
                image_path,
                notes,
                custom_threshold,
                expiration_date,
                item_uuid or str(uuid_lib.uuid4()),
                datetime.now().isoformat(),
            ),
        )
        conn.commit()


def find_item_by_title(title: str, category: str):
    """Return an existing item with the same title (case-insensitive) and category, if any."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM items WHERE lower(title) = lower(?) AND category = ? LIMIT 1",
            (title.strip(), category),
        ).fetchone()
        return dict(row) if row else None


def find_item_by_uuid(item_uuid: str):
    """Return an existing item with this uuid, if any - used by CSV import to skip rows
    that were already imported/exported before, rather than merging/overwriting by title."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM items WHERE uuid = ? LIMIT 1", (item_uuid,)).fetchone()
        return dict(row) if row else None


def backfill_missing_uuids() -> int:
    """Defensive safety net: ensure every item has a uuid, in case any row ever slips
    through without one (the startup migration already backfills old rows once, but this
    can be called again any time - e.g. right before a CSV export - to guarantee nothing
    exports with a blank uuid). Returns how many rows were backfilled."""
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE items SET uuid = (
                lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' ||
                hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))
            ) WHERE uuid IS NULL OR uuid = ''
            """
        )
        conn.commit()
        return cur.rowcount


def get_items_by_category(category: str):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM items WHERE category = ? ORDER BY created_at DESC", (category,)
        ).fetchall()
        return [dict(row) for row in rows]


def update_quantity(item_id: int, new_quantity: int) -> None:
    with get_connection() as conn:
        if new_quantity <= 0:
            conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        else:
            conn.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_quantity, item_id))
        conn.commit()


def update_item(
    item_id: int,
    title: str,
    category: str,
    quantity: int,
    notes: Optional[str],
    image_path: Optional[str] = None,
    custom_threshold: Optional[float] = None,
    expiration_date: Optional[str] = None,
) -> None:
    """Update an item's fields. image_path is only changed when a new one is provided."""
    with get_connection() as conn:
        if image_path is not None:
            conn.execute(
                "UPDATE items SET title = ?, category = ?, quantity = ?, notes = ?, "
                "custom_threshold = ?, expiration_date = ?, image_path = ? WHERE id = ?",
                (
                    title.strip(),
                    category,
                    quantity,
                    notes,
                    custom_threshold,
                    expiration_date,
                    image_path,
                    item_id,
                ),
            )
        else:
            conn.execute(
                "UPDATE items SET title = ?, category = ?, quantity = ?, notes = ?, "
                "custom_threshold = ?, expiration_date = ? WHERE id = ?",
                (title.strip(), category, quantity, notes, custom_threshold, expiration_date, item_id),
            )
        conn.commit()


def delete_item(item_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        conn.commit()


def clear_items(category: Optional[str] = None):
    """Delete ALL items, or all items in one category if given. Returns the deleted rows
    (not just a count) so the caller can clean up their image files on disk."""
    with get_connection() as conn:
        if category:
            rows = conn.execute("SELECT * FROM items WHERE category = ?", (category,)).fetchall()
            conn.execute("DELETE FROM items WHERE category = ?", (category,))
        else:
            rows = conn.execute("SELECT * FROM items").fetchall()
            conn.execute("DELETE FROM items")
        conn.commit()
        return [dict(row) for row in rows]


def get_total_count() -> int:
    with get_connection() as conn:
        row = conn.execute("SELECT COALESCE(SUM(quantity), 0) AS total FROM items").fetchone()
        return row["total"]


def get_category_total(category: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(quantity), 0) AS total FROM items WHERE category = ?",
            (category,),
        ).fetchone()
        return row["total"]


def get_title_breakdown():
    """Return rows of {title, category, total_quantity} grouped by title+category."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT title, category, SUM(quantity) AS total_quantity
            FROM items
            GROUP BY title, category
            ORDER BY total_quantity DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def get_settings():
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        return dict(row) if row else {"count_threshold": 2, "weight_threshold": 200}


def update_settings(count_threshold: float, weight_threshold: float) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE settings SET count_threshold = ?, weight_threshold = ? WHERE id = 1",
            (count_threshold, weight_threshold),
        )
        conn.commit()


def get_low_stock_items(threshold: int):
    """Return items with quantity at or below the given threshold."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM items WHERE quantity <= ? ORDER BY quantity ASC", (threshold,)
        ).fetchall()
        return [dict(row) for row in rows]


def get_items_added_by_date():
    """Return rows of {date, total_quantity} for items added, grouped by day."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT DATE(created_at) AS date, SUM(quantity) AS total_quantity
            FROM items
            GROUP BY DATE(created_at)
            ORDER BY date ASC
            """
        ).fetchall()
        return [dict(row) for row in rows]


# --- Favorites (for quick re-add without a photo) ---


def add_favorite(title: str, category: str, default_quantity: float) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO favorites (title, category, default_quantity, created_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(title, category) DO UPDATE SET "
            "default_quantity = excluded.default_quantity",
            (title.strip(), category, default_quantity, datetime.now().isoformat()),
        )
        conn.commit()


def remove_favorite(title: str, category: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM favorites WHERE lower(title) = lower(?) AND category = ?",
            (title.strip(), category),
        )
        conn.commit()


def get_favorites():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM favorites ORDER BY title ASC").fetchall()
        return [dict(row) for row in rows]


def is_favorited(title: str, category: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM favorites WHERE lower(title) = lower(?) AND category = ?",
            (title.strip(), category),
        ).fetchone()
        return row is not None


# --- Shopping list ---


def add_shopping_list_item(title: str, category: Optional[str] = None) -> None:
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM shopping_list WHERE lower(title) = lower(?) AND category IS ? "
            "AND checked = 0",
            (title.strip(), category),
        ).fetchone()
        if existing:
            return
        conn.execute(
            "INSERT INTO shopping_list (title, category, checked, created_at) "
            "VALUES (?, ?, 0, ?)",
            (title.strip(), category, datetime.now().isoformat()),
        )
        conn.commit()


def get_shopping_list():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM shopping_list ORDER BY checked ASC, created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def set_shopping_item_checked(item_id: int, checked: bool) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE shopping_list SET checked = ? WHERE id = ?", (1 if checked else 0, item_id)
        )
        conn.commit()


def delete_shopping_item(item_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM shopping_list WHERE id = ?", (item_id,))
        conn.commit()


def clear_checked_shopping_items() -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM shopping_list WHERE checked = 1")
        conn.commit()
