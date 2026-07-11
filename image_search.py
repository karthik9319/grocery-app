"""Best-effort automatic image lookup for items added without a photo.

Uses the free, keyless Openverse API (search over openly-licensed images -
https://openverse.org) - this is a "simple" image search on purpose (no API key/
account/cloud vendor lock-in needed), matching the app's local-first philosophy.
Never raises: any failure (offline, no results, bad response, corrupt image) just
returns None so a missing photo never blocks adding an item.
"""
from typing import Optional

import requests

OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/images/"
REQUEST_TIMEOUT = 4  # seconds - keep this snappy, it's a nice-to-have, not critical path


def find_image_bytes(query: str) -> Optional[bytes]:
    """Search for `query` and return the raw bytes of the first result's thumbnail, or
    None if nothing was found or any step failed."""
    query = query.strip()
    if not query:
        return None
    try:
        search_resp = requests.get(
            OPENVERSE_SEARCH_URL,
            params={"q": query, "page_size": 1, "mature": "false"},
            timeout=REQUEST_TIMEOUT,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get("results") or []
        if not results:
            return None
        image_url = results[0].get("thumbnail") or results[0].get("url")
        if not image_url:
            return None
        image_resp = requests.get(image_url, timeout=REQUEST_TIMEOUT)
        image_resp.raise_for_status()
        return image_resp.content
    except Exception:
        return None
