import csv
import io
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api_common import BACKUPS_DIR, import_rows

router = APIRouter()


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
