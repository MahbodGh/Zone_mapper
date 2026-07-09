"""Zone CRUD, scoped to the current user's subtree. Full agricultural fields
plus server-side geodesic area calculation."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import User, Zone
from auth import get_db, get_current_user, descendant_ids, can_manage, log_activity
from geo_utils import polygon_area_m2
from geocode import reverse_geocode

router = APIRouter(prefix="/api/zones", tags=["zones"])


class ZoneIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)   # نام زمین
    province: str = ""      # استان
    county: str = ""        # شهرستان
    district: str = ""      # دهستان
    village: str = ""       # روستا
    owner_name: str = ""    # نام مالک
    father_name: str = ""   # نام پدر مالک
    cultivation: str = ""   # "irrigated" (آبی) | "rainfed" (دیم)
    crop: str = ""          # محصول
    owner_mobile: str = ""  # موبایل مالک
    color: str = "#2e7d32"
    geometry: dict


class ZoneOut(ZoneIn):
    id: int
    user_id: int
    area_m2: float = 0.0
    owner_username: str = ""
    owner_fullname: str = ""
    created_at: str | None = None


def zone_out(z: Zone) -> dict:
    u = z.user
    full = f"{u.first_name} {u.last_name}".strip() if u else ""
    return {
        "id": z.id, "name": z.name,
        "province": z.province, "county": z.county, "district": z.district,
        "village": z.village, "owner_name": z.owner_name, "father_name": z.father_name,
        "cultivation": z.cultivation, "crop": z.crop, "owner_mobile": z.owner_mobile or "",
        "area_m2": z.area_m2 or 0.0,
        "color": z.color, "geometry": json.loads(z.geometry),
        "user_id": z.user_id,
        "owner_username": u.username if u else "",
        "owner_fullname": full,
        "created_at": z.created_at.isoformat() if z.created_at else None,
    }


def apply_fields(z: Zone, p: ZoneIn):
    z.name = p.name
    z.province = p.province
    z.county = p.county
    z.district = p.district
    z.village = p.village
    z.owner_name = p.owner_name
    z.father_name = p.father_name
    z.cultivation = p.cultivation
    z.crop = p.crop
    z.owner_mobile = p.owner_mobile
    z.color = p.color
    z.geometry = json.dumps(p.geometry)
    z.area_m2 = polygon_area_m2(p.geometry)   # always recompute server-side


@router.get("", response_model=list[ZoneOut])
def list_zones(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "superadmin":
        zones = db.query(Zone).order_by(Zone.id).all()
    else:
        ids = descendant_ids(db, user)
        zones = db.query(Zone).filter(Zone.user_id.in_(ids)).order_by(Zone.id).all()
    return [zone_out(z) for z in zones]


@router.post("", status_code=201, response_model=ZoneOut)
def create_zone(payload: ZoneIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    if payload.geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(400, "هندسه باید Polygon یا MultiPolygon باشد")

    if user.zone_quota and user.zone_quota > 0:
        used = db.query(Zone).filter(Zone.user_id == user.id).count()
        if used >= user.zone_quota:
            raise HTTPException(403, f"به سقف مجاز زون‌ها ({user.zone_quota}) رسیده‌اید")

    z = Zone(user_id=user.id, geometry="{}")
    apply_fields(z, payload)
    db.add(z)
    db.commit()
    db.refresh(z)
    log_activity(db, user, "zone_create", f"زون «{z.name}» (#{z.id})")
    return zone_out(z)


@router.put("/{zone_id}", response_model=ZoneOut)
def update_zone(zone_id: int, payload: ZoneIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    z = db.get(Zone, zone_id)
    if not z:
        raise HTTPException(404, "زون یافت نشد")
    if not can_manage(db, user, z.user_id):
        raise HTTPException(403, "دسترسی مجاز نیست")
    apply_fields(z, payload)
    db.commit()
    db.refresh(z)
    log_activity(db, user, "zone_update", f"زون «{z.name}» (#{z.id})")
    return zone_out(z)


@router.delete("/{zone_id}", status_code=204)
def delete_zone(zone_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    z = db.get(Zone, zone_id)
    if not z:
        raise HTTPException(404, "زون یافت نشد")
    if not can_manage(db, user, z.user_id):
        raise HTTPException(403, "دسترسی مجاز نیست")
    name = z.name
    db.delete(z)
    db.commit()
    log_activity(db, user, "zone_delete", f"زون «{name}» (#{zone_id})")


# ---------- reverse geocode a point to admin divisions ------------------
from pydantic import BaseModel as _BM


class PointIn(_BM):
    lon: float
    lat: float


@router.post("/reverse-geocode")
def rev_geo(p: PointIn, user: User = Depends(get_current_user)):
    """Given a point (e.g. the centroid of a freshly drawn zone), return the
    province/county/district/village from offline boundary data. All fields are
    editable by the user afterwards, so an empty result is fine."""
    return reverse_geocode(p.lon, p.lat)
