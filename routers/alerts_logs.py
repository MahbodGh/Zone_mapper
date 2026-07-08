"""Weather-alert workflow + activity logs."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import User, Zone, WeatherAlert, ActivityLog
from auth import get_db, get_current_user, descendant_ids, can_manage, log_activity
import weather

router = APIRouter(prefix="/api", tags=["alerts", "logs"])


# ============ weather alerts ============
class AlertOut(BaseModel):
    id: int
    zone_id: int
    zone_name: str = ""
    owner_name: str = ""
    alert_type: str
    message: str
    status: str
    severity: str
    forecast_value: float
    sms_to: str
    sms_sent: bool
    created_at: str | None = None


def alert_out(a: WeatherAlert) -> dict:
    z = a.zone
    return {
        "id": a.id, "zone_id": a.zone_id,
        "zone_name": z.name if z else "", "owner_name": z.owner_name if z else "",
        "alert_type": a.alert_type, "message": a.message, "status": a.status,
        "severity": a.severity, "forecast_value": a.forecast_value or 0.0,
        "sms_to": a.sms_to or "", "sms_sent": bool(a.sms_sent),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _visible_zone_ids(db: Session, user: User) -> list[int]:
    if user.role == "superadmin":
        return [z.id for z in db.query(Zone.id).all()]
    ids = descendant_ids(db, user)
    return [z.id for (z,) in db.query(Zone.id).filter(Zone.user_id.in_(ids)).all()]


@router.post("/alerts/scan")
def scan_weather(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run the forecast+rule engine over all zones the user can see, creating
    `pending` alerts. This is the manual trigger; a scheduler can call the same
    logic (see main.py startup note)."""
    zone_ids = _visible_zone_ids(db, user)
    zones = db.query(Zone).filter(Zone.id.in_(zone_ids)).all()
    created = 0
    for z in zones:
        for a in weather.analyze_zone(z):
            # avoid duplicate open alerts of the same type for the same zone
            dup = (
                db.query(WeatherAlert)
                .filter(WeatherAlert.zone_id == z.id,
                        WeatherAlert.alert_type == a["alert_type"],
                        WeatherAlert.status.in_(["pending", "approved"]))
                .first()
            )
            if dup:
                continue
            db.add(WeatherAlert(
                zone_id=z.id, alert_type=a["alert_type"], message=a["message"],
                severity=a["severity"], forecast_value=a["forecast_value"],
                status="pending", sms_to=z.owner_mobile or "",
            ))
            created += 1
    db.commit()
    log_activity(db, user, "weather_scan", f"{created} هشدار جدید")
    return {"created": created, "scanned_zones": len(zones)}


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(status: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    zone_ids = _visible_zone_ids(db, user)
    q = db.query(WeatherAlert).filter(WeatherAlert.zone_id.in_(zone_ids))
    if status:
        q = q.filter(WeatherAlert.status == status)
    alerts = q.order_by(WeatherAlert.created_at.desc()).limit(500).all()
    return [alert_out(a) for a in alerts]


class AlertDecision(BaseModel):
    status: str  # approved | rejected


@router.post("/alerts/{alert_id}/decide")
def decide_alert(alert_id: int, decision: AlertDecision,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Approve or reject an alert. On approval, an SMS is sent to the zone
    owner's mobile via the (pluggable) gateway."""
    if decision.status not in ("approved", "rejected"):
        raise HTTPException(400, "وضعیت نامعتبر")
    a = db.get(WeatherAlert, alert_id)
    if not a:
        raise HTTPException(404, "هشدار یافت نشد")
    z = db.get(Zone, a.zone_id)
    if not z or not can_manage(db, user, z.user_id):
        raise HTTPException(403, "دسترسی مجاز نیست")

    a.status = decision.status
    a.decided_at = datetime.now(timezone.utc)

    sms_result = None
    if decision.status == "approved":
        to = a.sms_to or z.owner_mobile
        if to:
            ok = weather.send_sms(to, a.message)
            a.sms_sent = ok
            if ok:
                a.status = "sent"
            sms_result = "sent" if ok else "failed"
        else:
            sms_result = "no_mobile"
    db.commit()
    log_activity(db, user, f"alert_{decision.status}", f"زون {z.name} / {a.alert_type}")
    return {"status": a.status, "sms": sms_result}


# ============ activity logs ============
class LogOut(BaseModel):
    id: int
    username: str
    action: str
    detail: str
    created_at: str | None = None


@router.get("/logs", response_model=list[LogOut])
def list_logs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Superadmin sees all logs; a normal user sees logs for their subtree."""
    q = db.query(ActivityLog)
    if user.role != "superadmin":
        ids = descendant_ids(db, user)
        q = q.filter(ActivityLog.user_id.in_(ids))
    logs = q.order_by(ActivityLog.created_at.desc()).limit(500).all()
    return [
        {"id": l.id, "username": l.username, "action": l.action,
         "detail": l.detail, "created_at": l.created_at.isoformat() if l.created_at else None}
        for l in logs
    ]
