"""Shared test fixtures.

CRITICAL: point every database access at a throwaway temp file BEFORE any application
module (inventory/api) is imported, so the real data/inventory.db is never touched by the
test suite. inventory.DB_PATH reads GROCERY_DB_PATH at import time, so this must run first
- which it does, because conftest.py is imported before any test module.
"""
import os
import tempfile
from pathlib import Path

import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="grocery-test-")
os.environ["GROCERY_DB_PATH"] = str(Path(_TMP_DIR) / "test.db")

_DATA_TABLES = [
    "items",
    "favorites",
    "shopping_list",
    "meal_plan",
    "item_aliases",
    "item_photos",
    "purchases",
]


@pytest.fixture(autouse=True)
def reset_db():
    """Ensure the schema exists and wipe all data tables before each test for isolation."""
    import inventory

    inventory.init_db()
    with inventory.get_connection() as conn:
        for table in _DATA_TABLES:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    import api

    return TestClient(api.app)
