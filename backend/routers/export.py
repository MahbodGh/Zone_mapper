"""Export endpoint — permission-scoped, multi-format, zip packaging."""
import io
import json
import re
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import User, Zone
from auth import get_db, get_current_user, can_manage

from exporters.kml_kmz import export_kml, export_kmz
from exporters.gpx import export_gpx
from exporters.dxf import export_dxf
from exporters.pdf import export_pdf
from exporters.gdb import export_gdb

router = APIRouter(prefix="/api", tags=["export"])

EXPORTERS = {"kml": export_kml, "kmz": export_kmz, "gpx": export_gpx,
             "dxf": export_dxf, "pdf": export_pdf, "gdb": export_gdb}
EXT = {"kml": "kml", "kmz": "kmz", "pdf": "pdf", "dxf": "dxf",
       "gpx": "gpx", "gdb": "gdb"}


class ExportRequest(BaseModel):
    zone_ids: list[int]
    formats: list[str]
    mode: str = "separate"   # "separate" = one file per zone | "merged" = one file per format


# characters that break filenames on Windows/zip — replaced with underscore
_BAD = re.compile(r'[\\/:*?"<>|\r\n\t]+')


def _clean(part: str) -> str:
    return _BAD.sub("_", (part or "").strip()).strip("_ ")


_CULT = {"irrigated": "آبی", "rainfed": "دیم"}


def zone_filename_base(zd: dict) -> str:
    """Build the export base name from, in order:
    name _ owner _ father _ village _ crop _ cultivation.
    Empty parts are skipped so we never get dangling underscores."""
    cult = _CULT.get(zd.get("cultivation") or "", "")
    parts = [
        zd.get("name"), zd.get("owner_name"), zd.get("father_name"),
        zd.get("village"), zd.get("crop"), cult,
    ]
    cleaned = [_clean(p) for p in parts if p and str(p).strip()]
    base = "_".join(cleaned) if cleaned else "zone"
    return base[:160] or "zone"


def to_dict(z: Zone) -> dict:
    return {
        "id": z.id, "name": z.name,
        "province": z.province, "county": z.county, "district": z.district,
        "village": z.village, "owner_name": z.owner_name, "father_name": z.father_name,
        "cultivation": z.cultivation, "crop": z.crop, "owner_mobile": z.owner_mobile or "",
        "area_m2": z.area_m2 or 0.0,
        "color": z.color, "geometry": json.loads(z.geometry),
    }


@router.post("/export")
def export_zones(req: ExportRequest, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    formats = [f.lower() for f in req.formats]
    if not formats or any(f not in EXPORTERS for f in formats):
        raise HTTPException(400, f"فرمت‌ها باید از {sorted(EXPORTERS)} باشند")
    if not req.zone_ids:
        raise HTTPException(400, "هیچ زونی انتخاب نشده است")

    rows = db.query(Zone).filter(Zone.id.in_(req.zone_ids)).order_by(Zone.id).all()
    # only allow zones the user is permitted to see/manage
    zones = [z for z in rows if can_manage(db, user, z.user_id)]
    if not zones:
        raise HTTPException(404, "زون مجازی برای خروجی پیدا نشد")

    zone_dicts = [to_dict(z) for z in zones]

    files = []  # (filename, bytes, mimetype)
    try:
        if req.mode == "merged":
            for fmt in formats:
                data, _, mt = EXPORTERS[fmt](zone_dicts)
                files.append((f"zones.{EXT[fmt]}", data, mt))
        else:
            used = set()
            for fmt in formats:
                for zd in zone_dicts:
                    data, _, mt = EXPORTERS[fmt]([zd])
                    base = zone_filename_base(zd)
                    fname = f"{base}.{EXT[fmt]}"
                    if fname in used:
                        fname = f"{base}-{zd['id']}.{EXT[fmt]}"
                    used.add(fname)
                    files.append((fname, data, mt))
    except Exception as exc:
        raise HTTPException(500, f"خطا در ساخت خروجی: {exc}")

    if len(files) == 1:
        fname, data, mt = files[0]
    else:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fn, data_i, _ in files:
                zf.writestr(fn, data_i)
        fname, data, mt = "zones_export.zip", buf.getvalue(), "application/zip"

    ascii_fallback = re.sub(r"[^A-Za-z0-9._-]", "_", fname) or "export.bin"
    headers = {
        "Content-Disposition":
            f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(fname)}"
    }
    return StreamingResponse(io.BytesIO(data), media_type=mt, headers=headers)
