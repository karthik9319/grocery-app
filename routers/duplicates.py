import re

from fastapi import APIRouter, HTTPException

import inventory
from api_common import BASE_DIR, CATEGORIES

router = APIRouter()


# --- Duplicate / near-duplicate finder ---
def normalize_for_dupe(title: str) -> str:
    """Loose normalization for "is this probably the same item" comparisons: lowercase,
    strip punctuation, collapse whitespace, strip a trailing plural "s"/"es" - so e.g.
    "Tomato" and "Tomatoes" normalize to the same stem."""
    cleaned = re.sub(r"[^a-z0-9\s]", "", title.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned.endswith("es") and len(cleaned) > 4:
        cleaned = cleaned[:-2]
    elif cleaned.endswith("s") and len(cleaned) > 3:
        cleaned = cleaned[:-1]
    return cleaned


def levenshtein(a: str, b: str) -> int:
    """Standard edit-distance dynamic-programming implementation - no dependency needed,
    a personal inventory is always small enough (dozens of items) for this to be
    instant."""
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


@router.get("/api/duplicates")
def find_duplicates():
    """Group existing items whose titles look like the same real-world thing (plural
    variants, e.g. "Tomato"/"Tomatoes", or small typos) - even across different
    categories, since accidentally tracking one thing under two categories is also worth
    flagging - so the user can review and merge them instead of tracking the same thing
    under separate rows."""
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    seen_ids: set = set()
    groups = []
    for i, a in enumerate(all_items):
        if a["id"] in seen_ids:
            continue
        norm_a = normalize_for_dupe(a["title"])
        matches = [a]
        for b in all_items[i + 1:]:
            if b["id"] in seen_ids:
                continue
            norm_b = normalize_for_dupe(b["title"])
            if not norm_a or not norm_b:
                continue
            is_match = norm_a == norm_b or (
                min(len(norm_a), len(norm_b)) >= 4 and levenshtein(norm_a, norm_b) <= 2
            )
            if is_match:
                matches.append(b)
        if len(matches) > 1:
            for m in matches:
                seen_ids.add(m["id"])
            groups.append(matches)
    return groups


@router.post("/api/duplicates/merge")
def merge_duplicates(payload: dict):
    """Merge one or more duplicate items into a single "keep" item: quantities are
    summed onto the kept item, each merged item's original title is added as an alias of
    the kept item (so re-adding under that old name merges correctly in the future), and
    the merged items (plus their own aliases/gallery photos) are deleted."""
    keep_id = payload.get("keep_id")
    merge_ids = payload.get("merge_ids") or []
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    keep = next((i for i in all_items if i["id"] == keep_id), None)
    if not keep:
        raise HTTPException(404, "Item to keep not found")

    total_quantity = keep["quantity"]
    for merge_id in merge_ids:
        if merge_id == keep_id:
            continue
        merged_item = next((i for i in all_items if i["id"] == merge_id), None)
        if not merged_item:
            continue
        total_quantity += merged_item["quantity"]
        try:
            inventory.add_alias(keep_id, merged_item["title"])
        except ValueError:
            pass  # alias already taken elsewhere - not critical to completing the merge
        deleted_photos = inventory.delete_item(merge_id)
        if merged_item.get("image_path"):
            cover_path = BASE_DIR / merged_item["image_path"]
            if cover_path.exists():
                try:
                    cover_path.unlink()
                except OSError:
                    pass
        for photo in deleted_photos:
            path = BASE_DIR / photo["image_path"]
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass

    inventory.update_item(
        keep_id,
        keep["title"],
        keep["category"],
        total_quantity,
        keep.get("notes"),
        None,
        keep.get("custom_threshold"),
        keep.get("expiration_date"),
    )
    return {"status": "merged", "kept_id": keep_id, "quantity": total_quantity}
