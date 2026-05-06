from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User
from services.auth_service import hash_password, verify_password, create_token
from dependencies import get_current_user
import os
import time
from collections import defaultdict

router = APIRouter(prefix="/auth", tags=["auth"])

REGISTRATION_OPEN = os.getenv("REGISTRATION_OPEN", "false").lower() == "true"

_login_attempts: dict = defaultdict(list)
_LOGIN_WINDOW = 60
_LOGIN_MAX = 10


def _check_rate_limit(ip: str):
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= _LOGIN_MAX:
        raise HTTPException(429, f"Demasiados intentos. Esperá {_LOGIN_WINDOW} segundos.")
    _login_attempts[ip].append(now)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _normalize_username(value: str) -> str:
    return (value or "").strip().lower()


def _build_internal_email(username: str) -> str:
    return f"{username}@internal.local"


@router.post("/register")
def register(data: dict, request: Request, db: Session = Depends(get_db)):
    if not REGISTRATION_OPEN:
        raise HTTPException(403, "El registro está deshabilitado. Contactá al administrador.")

    _check_rate_limit(_client_ip(request))
    username = _normalize_username(data.get("username", ""))
    phone = (data.get("phone", "") or "").strip()
    password = data.get("password", "")
    name = (data.get("name", "") or "").strip()

    if not username or not phone or not password:
        raise HTTPException(400, "Usuario, teléfono y contraseña requeridos")
    if len(username) < 3:
        raise HTTPException(400, "El usuario debe tener al menos 3 caracteres")
    if len(password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    if len(password) > 72:
        raise HTTPException(400, "La contraseña no puede tener más de 72 caracteres")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, "Este usuario ya está registrado")

    user = User(
        username=username,
        phone=phone,
        email=_build_internal_email(username),
        name=name or username,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "token": create_token(user.id, user.username),
        "user": {
            "id": user.id,
            "username": user.username,
            "phone": user.phone,
            "name": user.name,
            "is_admin": user.is_admin,
        },
    }


@router.post("/login")
def login(data: dict, request: Request, db: Session = Depends(get_db)):
    _check_rate_limit(_client_ip(request))
    username = _normalize_username(data.get("username", ""))
    password = data.get("password", "")

    if not username or not password:
        raise HTTPException(400, "Usuario y contraseña requeridos")

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos")

    return {
        "token": create_token(user.id, user.username),
        "user": {
            "id": user.id,
            "username": user.username,
            "phone": user.phone,
            "name": user.name,
            "is_admin": user.is_admin,
        },
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "phone": current_user.phone,
        "name": current_user.name,
        "is_admin": current_user.is_admin,
    }


@router.post("/create-user")
def create_user(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Solo el administrador puede crear usuarios")

    username = _normalize_username(data.get("username", ""))
    phone = (data.get("phone", "") or "").strip()
    password = data.get("password", "")
    name = (data.get("name", "") or "").strip()

    if not username or not phone or not password:
        raise HTTPException(400, "Usuario, teléfono y contraseña requeridos")
    if len(password) < 6:
        raise HTTPException(400, "Mínimo 6 caracteres")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, "Usuario ya registrado")

    user = User(
        username=username,
        phone=phone,
        email=_build_internal_email(username),
        name=name or username,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "ok": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "phone": user.phone,
            "name": user.name,
        },
    }
