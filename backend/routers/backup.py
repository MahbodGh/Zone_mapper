"""Database backup & restore — superadmin only.

Three pieces:
  GET  /api/backup/download   -> download a consistent snapshot of the DB
  GET  /api/backup/list       -> list automatic backups kept on the server
  POST /api/backup/restore    -> replace all data from an uploaded backup file

Plus an automatic daily backup thread (started from main.py) that keeps the
last AUTO_KEEP snapshots in backend/backups/.

Only meaningful with the default SQLite storage (zones.db). Snapshots use the
sqlite3 backup API, so they are consistent even while the app is writing.
Restore also goes through the backup API (page-by-page copy into the live
file) instead of replacing the file on disk — this is safe on Windows too,
where a swap of an open file would fail.
"""
import os
import re
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from database import DATABASE_URL, SessionLocal, engine, init_db
from auth import require_superadmin, log_activity

router = APIRouter(prefix="/api/backup", tags=["backup"])

AUTO_KEEP = 7                      # how many automatic snapshots to keep
AUTO_INTERVAL_HOURS = 24           # one automatic snapshot per day
REQUIRED_TABLES = {"users", "zones"}


# ---------------------------------------------------------------- helpers
def _sqlite_path() -> Path:
    """Path of the live SQLite file, or 400 if another backend is configured."""
    if not DATABASE_URL.startswith("sqlite"):
        raise HTTPException(
            400,
            "پشتیبان‌گیری داخلی فقط برای SQLite فعال است؛ "
            "برای PostgreSQL از pg_dump استفاده کنید",
        )
    raw = DATABASE_URL.split("///", 1)[-1]
    return Path(raw).resolve()


def _backup_dir() -> Path:
    d = _sqlite_path().parent / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _snapshot(dest: Path) -> None:
    """Write a consistent copy of the live DB to `dest` (sqlite backup API)."""
    src = sqlite3.connect(str(_sqlite_path()))
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _validate_backup_file(path: Path) -> None:
    """Raise 400 unless `path` is a healthy Zone-Mapper SQLite database."""
    con = sqlite3.connect(str(path))
    try:
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED_TABLES <= tables:
            raise HTTPException(
                400, "این فایل، پشتیبان معتبر «نقشه‌کش زون‌ها» نیست "
                     "(جدول‌های موردنیاز پیدا نشد)")
        ok = con.execute("PRAGMA integrity_check").fetchone()
        if not ok or ok[0] != "ok":
            raise HTTPException(400, "فایل پشتیبان خراب است (integrity check ناموفق)")
    except sqlite3.DatabaseError:
        raise HTTPException(400, "فایل معتبر پایگاه‌داده SQLite نیست")
    finally:
        con.close()


def _prune_auto_backups() -> None:
    autos = sorted(_backup_dir().glob("auto_*.db"))
    for old in autos[:-AUTO_KEEP]:
        try:
            old.unlink()
        except OSError:
            pass


# ---------------------------------------------------------------- endpoints
@router.get("/download")
def download_backup(admin=Depends(require_superadmin)):
    """Stream a fresh, consistent snapshot of the whole database."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = f"zone_mapper_backup_{stamp}.db"
    dest = _backup_dir() / f"manual_{stamp}.db"
    _snapshot(dest)

    db = SessionLocal()
    try:
        log_activity(db, admin, "backup_download", name)
    finally:
        db.close()

    return FileResponse(dest, filename=name, media_type="application/octet-stream")


@router.get("/list")
def list_backups(admin=Depends(require_superadmin)):
    """Automatic + manual snapshots currently kept on the server."""
    items = []
    for p in sorted(_backup_dir().glob("*.db"), reverse=True):
        st = p.stat()
        items.append({
            "name": p.name,
            "kind": "auto" if p.name.startswith("auto_") else "manual",
            "size": st.st_size,
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return items[:20]


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...),
                         admin=Depends(require_superadmin)):
    """Replace ALL current data with the contents of an uploaded backup.

    A safety snapshot of the current data is written to backups/ first, so a
    bad restore can always be undone.
    """
    data = await file.read()
    if len(data) < 100 or not data.startswith(b"SQLite format 3\x00"):
        raise HTTPException(400, "فایل معتبر پایگاه‌داده SQLite نیست")

    bdir = _backup_dir()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp = bdir / f".upload_{stamp}.db"
    tmp.write_bytes(data)
    try:
        _validate_backup_file(tmp)

        # safety copy of the data we are about to overwrite
        _snapshot(bdir / f"pre_restore_{stamp}.db")

        # return pooled connections so nothing holds a write lock
        engine.dispose()

        # page-by-page copy of the uploaded DB INTO the live file
        src = sqlite3.connect(str(tmp))
        try:
            dst = sqlite3.connect(str(_sqlite_path()))
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass

    # re-apply lightweight migrations in case the backup predates new columns
    init_db()

    db = SessionLocal()
    try:
        log_activity(db, admin, "backup_restore",
                     re.sub(r"[^\w.\-]", "_", file.filename or "upload.db")[:120])
    finally:
        db.close()

    return {"restored": True, "safety_copy": f"pre_restore_{stamp}.db"}


# ---------------------------------------------------------------- auto backup
def _auto_backup_loop():
    while True:
        try:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            _snapshot(_backup_dir() / f"auto_{stamp}.db")
            _prune_auto_backups()
        except Exception:
            pass  # never let the backup thread die
        time.sleep(AUTO_INTERVAL_HOURS * 3600)


def start_auto_backup():
    """Kick off the daily snapshot thread (no-op for non-SQLite backends)."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    def _run():
        # if a snapshot was already taken today (e.g. service restart), wait
        today = datetime.now().strftime("%Y%m%d")
        if any(_backup_dir().glob(f"auto_{today}_*.db")):
            time.sleep(AUTO_INTERVAL_HOURS * 3600)
        _auto_backup_loop()

    threading.Thread(target=_run, daemon=True).start()
