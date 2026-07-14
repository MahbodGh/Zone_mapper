"""Zone Mapper backend — FastAPI + JWT auth + user tree.

Run:  uvicorn main:app --reload --port 8000

On first run a superadmin account is created (see console output).
Configure via env vars: DATABASE_URL, SECRET_KEY, SUPERADMIN_USERNAME/PASSWORD/EMAIL.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, SessionLocal
from auth import ensure_superadmin
from routers import auth_users, zones, export, alerts_logs, backup

app = FastAPI(title="Zone Mapper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

# create the platform owner on first launch
_db = SessionLocal()
try:
    ensure_superadmin(_db)
finally:
    _db.close()

app.include_router(auth_users.router)
app.include_router(zones.router)
app.include_router(export.router)
app.include_router(alerts_logs.router)
app.include_router(backup.router)

# daily automatic DB snapshots (kept in backend/backups/, last 7)
backup.start_auto_backup()


@app.get("/api/health")
def health():
    return {"status": "ok"}
