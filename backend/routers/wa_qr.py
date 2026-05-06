from fastapi import APIRouter, Depends, HTTPException
import httpx
import os
import secrets
from sqlalchemy.orm import Session
from database import get_db
from models import User, WhatsAppAccount
from dependencies import get_current_user

router = APIRouter(prefix="/wa-qr", tags=["wa-qr"])

_BRIDGE = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")
_TIMEOUT = 25.0


async def _call(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        resp = await getattr(c, method)(f"{_BRIDGE}{path}", **kwargs)
        return resp.json()


@router.post("/start")
async def start(current_user: User = Depends(get_current_user)):
    try:
        return await _call("post", f"/session/{current_user.id}/start")
    except Exception as e:
        raise HTTPException(503, f"WA Bridge no disponible — {e}")


@router.get("/qr")
async def get_qr(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/qr")
    except Exception:
        return {"status": "not_started", "qr": None, "phone": None}


@router.get("/status")
async def get_status(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/status")
    except Exception:
        return {"status": "not_started", "phone": None}


@router.post("/send")
async def send_msg(data: dict, current_user: User = Depends(get_current_user)):
    try:
        result = await _call("post", f"/session/{current_user.id}/send", json=data)
        if not result.get("ok"):
            raise HTTPException(400, result.get("error", "Error al enviar"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, str(e))


@router.get("/chats")
async def get_chats(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/chats")
    except Exception:
        return {"ok": False, "chats": []}


@router.get("/messages")
async def get_messages(jid: str, current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/messages", params={"jid": jid})
    except Exception:
        return {"ok": False, "messages": [], "name": ""}


@router.get("/debug")
async def debug_store(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/debug")
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/contacts")
async def get_contacts(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/contacts")
    except Exception:
        return {"ok": False, "contacts": []}


@router.get("/receipts")
async def get_receipts(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/receipts")
    except Exception:
        return {"ok": False, "receipts": []}


@router.post("/fetch-history")
async def fetch_history(data: dict, current_user: User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.post(f"{_BRIDGE}/session/{current_user.id}/fetch-history", json=data)
            return resp.json()
    except Exception as e:
        raise HTTPException(503, str(e))


@router.post("/sync-account")
async def sync_account(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update the QR WhatsAppAccount record after a successful connection."""
    phone = data.get("phone", "")
    name = data.get("name") or (f"WhatsApp QR {phone}" if phone else "WhatsApp QR")

    acc = (
        db.query(WhatsAppAccount)
        .filter(
            WhatsAppAccount.user_id == current_user.id,
            WhatsAppAccount.account_type == "qr",
        )
        .first()
    )
    if acc:
        acc.phone_number = phone
        if data.get("name"):
            acc.name = name
    else:
        acc = WhatsAppAccount(
            user_id=current_user.id,
            account_type="qr",
            name=name,
            phone_number=phone,
            phone_number_id="qr",
            access_token="",
            webhook_verify_token=secrets.token_hex(16),
        )
        db.add(acc)
    db.commit()
    db.refresh(acc)
    return {
        "ok": True,
        "account": {
            "id": acc.id,
            "name": acc.name,
            "phone_number": acc.phone_number,
            "account_type": "qr",
        },
    }


@router.delete("/disconnect")
async def disconnect(current_user: User = Depends(get_current_user)):
    try:
        return await _call("delete", f"/session/{current_user.id}")
    except Exception as e:
        raise HTTPException(503, str(e))
