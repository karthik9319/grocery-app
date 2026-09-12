import csv
import io
import zipfile
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse, Response

import inventory
from api_common import (
    CATEGORIES,
    detect_import_kind,
    favorites_to_csv_text,
    import_favorites_rows,
    import_meal_plan_rows,
    import_rows,
    import_shopping_list_rows,
    items_to_csv_text,
    meal_plan_to_csv_text,
    shopping_list_to_csv_text,
)

router = APIRouter()


# --- Export ---
@router.get("/api/export/csv", response_class=PlainTextResponse)
def export_csv():
    inventory.backfill_missing_uuids()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    return items_to_csv_text(all_items)


@router.get("/api/export/favorites/csv", response_class=PlainTextResponse)
def export_favorites_csv():
    return favorites_to_csv_text(inventory.get_favorites())


@router.get("/api/export/shopping-list/csv", response_class=PlainTextResponse)
def export_shopping_list_csv():
    return shopping_list_to_csv_text(inventory.get_shopping_list())


@router.get("/api/export/meal-plan/csv", response_class=PlainTextResponse)
def export_meal_plan_csv():
    return meal_plan_to_csv_text(inventory.get_all_meal_plan_entries())


@router.get("/api/export/all")
def export_all():
    """Bundle every list (inventory, favorites, shopping list, meal plan) into one ZIP
    download - the single "Export CSV" button previously only covered inventory."""
    inventory.backfill_missing_uuids()
    all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("inventory.csv", items_to_csv_text(all_items))
        zf.writestr("favorites.csv", favorites_to_csv_text(inventory.get_favorites()))
        zf.writestr("shopping-list.csv", shopping_list_to_csv_text(inventory.get_shopping_list()))
        zf.writestr("meal-plan.csv", meal_plan_to_csv_text(inventory.get_all_meal_plan_entries()))
    buffer.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="pantry-pilot-export-{timestamp}.zip"'},
    )


# --- Import ---
@router.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...), mode: str = Form("merge")):
    """Bulk-import items from a previously exported CSV (uuid,title,category,quantity,unit,
    notes,expiration_date,created_at - only title/category/quantity are required, extra/
    missing columns are tolerated). Each row's `uuid` (if present and already in the
    database - i.e. this row was exported from here before) is ALWAYS skipped, regardless
    of `mode` - this is what makes re-importing the same backup idempotent. Rows with no
    uuid, or a uuid not seen before, fall back to matching by case-insensitive
    title+category (same rule used by the regular add-item form): on a match, `mode`
    controls what happens - "merge" (default) adds the CSV quantity onto the existing
    quantity, "overwrite" replaces the existing quantity with the CSV's value instead.
    Items with no match are always inserted as new rows (keeping the CSV's uuid, if any,
    so a later re-import of the same file will then correctly skip them).
    """
    if mode not in ("merge", "overwrite"):
        raise HTTPException(400, "mode must be 'merge' or 'overwrite'.")

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "Could not read that file as UTF-8 text/CSV.")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "title" not in reader.fieldnames:
        raise HTTPException(400, "CSV must have at least a 'title' column.")

    import_kind = detect_import_kind(reader.fieldnames)
    if import_kind == "meal_plan":
        result = import_meal_plan_rows(reader)
    elif import_kind == "favorites":
        result = import_favorites_rows(reader)
    elif import_kind == "shopping_list":
        result = import_shopping_list_rows(reader)
    else:
        result = import_rows(reader, mode)

    result["kind"] = import_kind
    return result


@router.post("/api/import/all")
async def import_all(file: UploadFile = File(...), mode: str = Form("merge")):
    """Restore a full ZIP export (see /api/export/all) - inventory.csv, favorites.csv,
    shopping-list.csv, meal-plan.csv. Any subset of those files may be present (missing
    files are simply skipped); each list uses the same matching rules its own dedicated
    import already uses, so re-running this on the same zip is safe."""
    raw_bytes = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Could not read that file as a zip archive.")

    result: dict = {}

    if "inventory.csv" in zf.namelist():
        text = zf.read("inventory.csv").decode("utf-8-sig")
        result["inventory"] = import_rows(csv.DictReader(io.StringIO(text)), mode)

    if "favorites.csv" in zf.namelist():
        text = zf.read("favorites.csv").decode("utf-8-sig")
        result["favorites"] = import_favorites_rows(csv.DictReader(io.StringIO(text)))

    if "shopping-list.csv" in zf.namelist():
        text = zf.read("shopping-list.csv").decode("utf-8-sig")
        result["shopping_list"] = import_shopping_list_rows(csv.DictReader(io.StringIO(text)))

    if "meal-plan.csv" in zf.namelist():
        text = zf.read("meal-plan.csv").decode("utf-8-sig")
        result["meal_plan"] = import_meal_plan_rows(csv.DictReader(io.StringIO(text)))

    if not result:
        raise HTTPException(400, "Zip didn't contain any recognized export files.")
    return result
