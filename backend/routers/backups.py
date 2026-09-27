import csv
import io
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api_common import (
    BACKUPS_DIR,
    LOCAL_SNAPSHOTS_DIR,
    backup_status,
    import_rows,
    list_local_snapshots,
    preview_local_snapshot,
    restore_local_snapshot,
    write_local_snapshot,
)

router = APIRouter()


# --- Full-app snapshots (inventory, lists, meals, history, settings, and photos) ---
@router.get("/api/backup-status")
def get_backup_status():
    # If the server remains running across midnight, visiting the app still creates that
    # day's automatic snapshot; startup is not the only opportunity.
    write_local_snapshot("daily", once_per_day=True)
    return backup_status()


@router.get("/api/snapshots")
def list_snapshots():
    return list_local_snapshots()


@router.post("/api/snapshots")
def create_snapshot():
    return write_local_snapshot("manual")


@router.get("/api/snapshots/{filename}/preview")
def preview_snapshot(filename: str):
    return preview_local_snapshot(filename)


@router.post("/api/snapshots/{filename}/restore")
def restore_snapshot(filename: str):
    return restore_local_snapshot(filename)


@router.get("/api/snapshots/{filename}/download")
def download_snapshot(filename: str):
    path = LOCAL_SNAPSHOTS_DIR / Path(filename).name
    if not path.exists() or path.parent != LOCAL_SNAPSHOTS_DIR or path.suffix != ".zip":
        raise HTTPException(404, "Backup not found")
    return FileResponse(path, media_type="application/zip", filename=path.name)


# --- Backups (auto-saved before any destructive delete/clear action) ---
@router.get("/api/backups")
def list_backups():
    backups = sorted(BACKUPS_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    result = []
    for path in backups:
        text = path.read_text(encoding="utf-8")
        item_count = max(0, len(text.splitlines()) - 1)
        result.append(
            {
                "filename": path.name,
                "created_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                "item_count": item_count,
            }
        )
    return result


@router.get("/api/backups/{filename}/download")
def download_backup(filename: str):
    path = BACKUPS_DIR / Path(filename).name
    if not path.exists() or path.parent != BACKUPS_DIR:
        raise HTTPException(404, "Backup not found")
    return FileResponse(path, media_type="text/csv", filename=path.name)


@router.post("/api/backups/{filename}/restore")
def restore_backup(filename: str):
    path = BACKUPS_DIR / Path(filename).name
    if not path.exists() or path.parent != BACKUPS_DIR:
        raise HTTPException(404, "Backup not found")
    text = path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return import_rows(reader, mode="merge")
