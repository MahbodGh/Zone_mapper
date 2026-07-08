"""Database models. SQLAlchemy 2.0 style.

Storage backend is chosen by the DATABASE_URL environment variable.
Defaults to local SQLite; set e.g.
    DATABASE_URL=postgresql+psycopg://user:pass@host/dbname
to move to PostgreSQL with no code changes.
"""
import os

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Boolean, DateTime, Float,
    ForeignKey, func, inspect, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./zones.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(150), unique=True, index=True, nullable=False)
    first_name = Column(String(150), default="")
    last_name = Column(String(150), default="")
    password_hash = Column(String(255), nullable=False)

    # "superadmin" (platform owner) or "user" (everyone else)
    role = Column(String(20), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # --- tree of accounts (unlimited depth) -----------------------------
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # materialized path like "/1/5/12/" — makes "all descendants" queries cheap
    path = Column(String(500), default="/", index=True, nullable=False)

    # --- monetization hooks (used in later phases) ----------------------
    zone_quota = Column(Integer, default=0, nullable=False)  # 0 = unlimited
    phone = Column(String(20), default="")                  # موبایل کاربر (برای پیامک)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("User", remote_side=[id], backref="children")


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)       # نام زمین
    province = Column(String(100), default="")       # استان
    county = Column(String(100), default="")         # شهرستان
    district = Column(String(100), default="")       # دهستان
    village = Column(String(100), default="")        # روستا
    owner_name = Column(String(150), default="")     # نام مالک
    father_name = Column(String(150), default="")    # نام پدر مالک
    cultivation = Column(String(20), default="")     # "irrigated" (آبی) | "rainfed" (دیم)
    crop = Column(String(100), default="")           # محصول
    owner_mobile = Column(String(20), default="")    # موبایل مالک (برای پیامک هشدار)
    area_m2 = Column(Float, default=0.0)             # مساحت (متر مربع) — محاسبه سمت سرور
    color = Column(String(20), default="#2e7d32")
    geometry = Column(Text, nullable=False)          # GeoJSON

    # which account created this zone
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class ActivityLog(Base):
    """Audit trail: logins and zone actions (who did what, when)."""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    username = Column(String(150), default="")       # snapshot (survives user deletion)
    action = Column(String(50), nullable=False)      # login | zone_create | zone_update | zone_delete
    detail = Column(String(300), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class WeatherAlert(Base):
    """Weather-driven alerts per zone, with an admin approval workflow."""
    __tablename__ = "weather_alerts"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), index=True, nullable=False)
    alert_type = Column(String(40), nullable=False)   # frost | wind | heat | ...
    message = Column(Text, default="")
    status = Column(String(20), default="pending", index=True)  # pending|approved|rejected|sent
    severity = Column(String(20), default="warning")  # info|warning|danger
    forecast_value = Column(Float, default=0.0)       # e.g. min temp or wind speed
    sms_to = Column(String(20), default="")
    sms_sent = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    zone = relationship("Zone")


# columns added over time -> auto-migrated on startup (works on SQLite & Postgres)
_ZONE_MIGRATIONS = {
    "province": "VARCHAR(100) DEFAULT ''",
    "county": "VARCHAR(100) DEFAULT ''",
    "district": "VARCHAR(100) DEFAULT ''",
    "village": "VARCHAR(100) DEFAULT ''",
    "owner_name": "VARCHAR(150) DEFAULT ''",
    "father_name": "VARCHAR(150) DEFAULT ''",
    "cultivation": "VARCHAR(20) DEFAULT ''",
    "crop": "VARCHAR(100) DEFAULT ''",
    "owner_mobile": "VARCHAR(20) DEFAULT ''",
    "area_m2": "FLOAT DEFAULT 0",
}
_USER_MIGRATIONS = {
    "phone": "VARCHAR(20) DEFAULT ''",
    "last_login": "TIMESTAMP NULL",
}


def init_db():
    Base.metadata.create_all(bind=engine)
    # lightweight migration: add any missing columns to an existing DB
    insp = inspect(engine)
    with engine.begin() as conn:
        if "zones" in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns("zones")}
            for col, ddl in _ZONE_MIGRATIONS.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE zones ADD COLUMN {col} {ddl}"))
        if "users" in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns("users")}
            for col, ddl in _USER_MIGRATIONS.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))
