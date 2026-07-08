"""Authentication & authorization helpers: password hashing, JWT, and the
tree-based permission model."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session

from database import User, SessionLocal

# In production set SECRET_KEY via environment variable.
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-please-32-chars-min")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(pw: str) -> str:
    # bcrypt has a 72-byte limit; encode then truncate defensively
    pw_bytes = pw.encode("utf-8")[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user.id), "role": user.role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="اعتبارسنجی ناموفق بود",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise cred_exc

    user = db.get(User, user_id)
    if not user:
        raise cred_exc
    if not user.is_active:
        raise HTTPException(403, "حساب کاربری شما غیرفعال شده است")
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if user.role != "superadmin":
        raise HTTPException(403, "این عملیات فقط برای سوپر ادمین مجاز است")
    return user


# ---------- tree helpers -------------------------------------------------
def child_path(parent: User) -> str:
    """Path prefix for a new child of `parent`."""
    return f"{parent.path}{parent.id}/"


def descendant_ids(db: Session, user: User) -> list[int]:
    """IDs of the user and every account beneath them in the tree."""
    prefix = f"{user.path}{user.id}/"
    rows = (
        db.query(User.id)
        .filter((User.id == user.id) | (User.path.like(prefix + "%")))
        .all()
    )
    return [r[0] for r in rows]


def can_manage(db: Session, actor: User, target_user_id: int) -> bool:
    """True if `actor` may view/edit a zone owned by `target_user_id`.
    Superadmin manages everyone; others manage themselves and their subtree."""
    if actor.role == "superadmin":
        return True
    return target_user_id in descendant_ids(db, actor)


def ensure_superadmin(db: Session):
    """Create the platform owner on first run if none exists.
    Credentials come from env vars (with sensible defaults for local dev)."""
    existing = db.query(User).filter(User.role == "superadmin").first()
    if existing:
        return
    email = os.getenv("SUPERADMIN_EMAIL", "admin@zone.local")
    username = os.getenv("SUPERADMIN_USERNAME", "admin")
    password = os.getenv("SUPERADMIN_PASSWORD", "admin1234")
    sa = User(
        email=email, username=username, first_name="Super", last_name="Admin",
        password_hash=hash_password(password), role="superadmin",
        is_active=True, path="/", zone_quota=0,
    )
    db.add(sa)
    db.commit()
    print(f"[init] superadmin created -> username: {username}  password: {password}")


# ---------- activity logging --------------------------------------------
def log_activity(db, user, action: str, detail: str = ""):
    """Record an audit-trail row. Safe to call in any request."""
    from database import ActivityLog
    try:
        entry = ActivityLog(
            user_id=user.id if user else None,
            username=user.username if user else "",
            action=action, detail=detail[:300],
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
