from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import AppSetting, User
from typing import Dict
from dependencies import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(AppSetting).filter(AppSetting.user_id == current_user.id).all()
    result = {}
    for s in settings:
        val = s.value
        if "key" in s.key or "password" in s.key:
            val = "***" if val else ""
        result[s.key] = val
    return result


@router.put("")
def update_settings(data: Dict[str, str], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    for key, value in data.items():
        setting = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
        if setting:
            setting.value = value
        else:
            db.add(AppSetting(key=key, value=value, user_id=current_user.id))
    db.commit()
    return {"ok": True}


_SENSITIVE = ("key", "password", "secret", "token")

@router.get("/{key}/raw")
def get_setting_raw(key: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if any(s in key.lower() for s in _SENSITIVE):
        return {"key": key, "value": ""}
    setting = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
    return {"key": key, "value": setting.value if setting else ""}
