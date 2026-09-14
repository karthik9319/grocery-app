"""Best-effort barcode -> product-name lookup for the "scan a barcode to add" flow.

Uses the free, keyless Open Food Facts API (https://world.openfoodfacts.org) - same
local-first, no-API-key philosophy as image_search.py. Never raises: any failure
(offline, unknown barcode, bad response) just returns None so a failed lookup never
blocks the user from adding the item manually.
"""
from typing import Optional

import requests

OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
REQUEST_TIMEOUT = 5  # seconds - keep it snappy, it's a convenience, not critical path


def lookup_product_name(code: str) -> Optional[str]:
    """Return a human-readable product name for a barcode, or None if not found/failed."""
    code = (code or "").strip()
    if not code.isdigit():
        return None
    try:
        resp = requests.get(
            OFF_PRODUCT_URL.format(code=code),
            params={"fields": "product_name,product_name_en,brands,abbreviated_product_name"},
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "PantryPilot/1.0 (personal inventory app)"},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != 1:
            return None
        product = data.get("product") or {}
        name = (
            product.get("product_name_en")
            or product.get("product_name")
            or product.get("abbreviated_product_name")
            or ""
        ).strip()
        return name or None
    except Exception:
        return None
