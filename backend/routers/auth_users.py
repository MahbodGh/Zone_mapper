"""Auth (register/login/me) + user management (tree + superadmin)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from database import User, Zone
from datetime import datetime, timezone

from auth import (
    get_db, hash_password, verify_password, create_token, get_current_user,
    require_superadmin, child_path, descendant_ids, can_manage, ensure_superadmin,
    log_activity,
)

router = APIRouter(prefix="/api", tags=["auth", "users"])


# ---------- schemas ------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=150)
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    password: str = Field(..., min_length=6, max_length=128)


class SubUserIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=6, max_length=128)
    email: EmailStr | None = None
    first_name: str = ""
    last_name: str = ""
    zone_quota: int = 0
    phone: str = ""


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None
    zone_quota: int | None = None
    phone: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    parent_id: int | None
    zone_quota: int
    phone: str = ""
    last_login: str | None = None
    zone_count: int = 0
    children_count: int = 0


def user_out(db: Session, u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "username": u.username,
        "first_name": u.first_name, "last_name": u.last_name,
        "role": u.role, "is_active": u.is_active, "parent_id": u.parent_id,
        "zone_quota": u.zone_quota,
        "phone": u.phone or "",
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "zone_count": db.query(Zone).filter(Zone.user_id == u.id).count(),
        "children_count": db.query(User).filter(User.parent_id == u.id).count(),
    }


# ---------- registration & login ----------------------------------------
@router.post("/auth/register", status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "این ایمیل قبلاً ثبت شده است")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "این نام کاربری قبلاً گرفته شده است")

    u = User(
        email=payload.email, username=payload.username,
        first_name=payload.first_name, last_name=payload.last_name,
        password_hash=hash_password(payload.password), phone=payload.phone,
        role="user", is_active=True, parent_id=None, path="/", zone_quota=0,
    )
    db.add(u)
    db.commit()
    return {"message": "ثبت‌نام شما تکمیل شد"}


@router.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # allow login by username OR email in the same field
    ident = form.username.strip()
    u = (
        db.query(User)
        .filter((User.username == ident) | (User.email == ident))
        .first()
    )
    if not u or not verify_password(form.password, u.password_hash):
        raise HTTPException(401, "نام کاربری یا کلمه عبور اشتباه است")
    if not u.is_active:
        raise HTTPException(403, "حساب کاربری شما غیرفعال شده است")

    u.last_login = datetime.now(timezone.utc)
    db.commit()
    log_activity(db, u, "login", f"ورود از حساب @{u.username}")
    return {"access_token": create_token(u), "token_type": "bearer",
            "user": user_out(db, u)}


@router.get("/auth/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return user_out(db, user)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/auth/change-password")
def change_password(payload: PasswordChange, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """A user changes their own password (must supply the current one)."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "کلمه عبور فعلی اشتباه است")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    log_activity(db, user, "password_change", "تغییر کلمه عبور")
    return {"message": "کلمه عبور با موفقیت تغییر کرد"}


# ---------- managing sub-users (tree) -----------------------------------
@router.post("/users", status_code=201, response_model=UserOut)
def create_subuser(payload: SubUserIn, db: Session = Depends(get_db),
                   actor: User = Depends(get_current_user)):
    """Any logged-in user can create sub-accounts beneath themselves."""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "این نام کاربری قبلاً گرفته شده است")
    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "این ایمیل قبلاً ثبت شده است")

    # placeholder email if none given (kept unique)
    email = payload.email or f"{payload.username}@sub.local"

    child = User(
        email=email, username=payload.username,
        first_name=payload.first_name, last_name=payload.last_name,
        password_hash=hash_password(payload.password),
        role="user", is_active=True, phone=payload.phone,
        parent_id=actor.id, path=child_path(actor),
        zone_quota=payload.zone_quota,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return user_out(db, child)


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    """Superadmin sees everyone; a normal user sees their whole subtree."""
    if actor.role == "superadmin":
        users = db.query(User).order_by(User.id).all()
    else:
        ids = descendant_ids(db, actor)
        users = db.query(User).filter(User.id.in_(ids)).order_by(User.id).all()
    return [user_out(db, u) for u in users]


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "کاربر یافت نشد")
    # you can manage yourself, your subtree, or (as superadmin) anyone
    if not can_manage(db, actor, user_id) and actor.id != user_id:
        raise HTTPException(403, "دسترسی مجاز نیست")

    data = payload.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        target.password_hash = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    # only superadmin may toggle is_active on someone who isn't their descendant
    for field, value in data.items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    return user_out(db, target)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "کاربر یافت نشد")
    if target.id == actor.id:
        raise HTTPException(400, "نمی‌توانید حساب خودتان را حذف کنید")
    if not can_manage(db, actor, user_id):
        raise HTTPException(403, "دسترسی مجاز نیست")
    if target.role == "superadmin":
        raise HTTPException(400, "سوپر ادمین قابل حذف نیست")

    # delete the whole subtree + their zones
    ids = descendant_ids(db, target)
    db.query(Zone).filter(Zone.user_id.in_(ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
