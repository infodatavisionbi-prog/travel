import re
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models import WhatsAppAccount, WaCampaign, WaCampaignRecipient, Sequence, SequenceLog, Lead, User
from dependencies import get_current_user
from services.whatsapp_service import test_connection, get_templates, send_text_message, get_business_profile, update_business_profile, upload_media, set_profile_photo, get_coexistence_status, set_coexistence_status
import secrets

_BRIDGE = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")


def _norm(phone: str) -> str:
    """Strip everything except digits from a phone number."""
    return re.sub(r"[^\d]", "", phone or "")


def _normalize_br(digits: str) -> str:
    """
    Brazil migrated mobile numbers from 8 to 9 local digits in 2015.
    Numbers stored as 5511XXXXXXXX (12 digits) must become 55119XXXXXXXX (13 digits).
    Only applies to mobile area codes (11-99) where local part is exactly 8 digits.
    """
    if not digits.startswith("55"):
        return digits
    # country(2) + area(2) + local
    rest = digits[2:]  # strip country code
    if len(rest) == 10:  # area(2) + 8-digit local
        area = rest[:2]
        local = rest[2:]
        # Mobile numbers start with 6-9; landlines with 2-5 — only fix mobile
        if local[0] in "6789":
            return "55" + area + "9" + local
    return digits

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


def _out(a: WhatsAppAccount) -> dict:
    return {
        "id": a.id,
        "account_type": getattr(a, "account_type", "api") or "api",
        "name": a.name,
        "phone_number": a.phone_number,
        "phone_number_id": a.phone_number_id,
        "waba_id": a.waba_id,
        "created_at": a.created_at.isoformat() if a.created_at else "",
    }


# ── Accounts CRUD ─────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accs = db.query(WhatsAppAccount).filter(WhatsAppAccount.user_id == current_user.id).all()
    return [_out(a) for a in accs]


@router.post("/accounts")
def create_account(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc_type = data.get("account_type", "api")
    if acc_type == "api":
        if not data.get("phone_number_id") or not data.get("access_token"):
            raise HTTPException(400, "phone_number_id y access_token son requeridos para cuentas API")
    acc = WhatsAppAccount(
        user_id=current_user.id,
        account_type=acc_type,
        name=data.get("name", "WhatsApp Business"),
        phone_number=data.get("phone_number", ""),
        phone_number_id=data.get("phone_number_id", ""),
        waba_id=data.get("waba_id", ""),
        access_token=data.get("access_token", ""),
        webhook_verify_token=data.get("webhook_verify_token") or secrets.token_hex(16),
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _out(acc)


@router.put("/accounts/{acc_id}")
def update_account(acc_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    for k in ["name", "phone_number", "phone_number_id", "waba_id", "webhook_verify_token", "account_type"]:
        if k in data:
            setattr(acc, k, data[k])
    if data.get("access_token"):
        acc.access_token = data["access_token"]
    db.commit()
    db.refresh(acc)
    return _out(acc)


@router.delete("/accounts/{acc_id}")
def delete_account(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")

    # If QR account, disconnect bridge session
    if getattr(acc, "account_type", "api") == "qr":
        try:
            httpx.delete(f"{_BRIDGE}/session/{current_user.id}", timeout=5)
        except Exception:
            pass

    # Delete related campaign recipients and campaigns
    campaign_ids = [c.id for c in db.query(WaCampaign.id).filter(WaCampaign.account_id == acc_id).all()]
    if campaign_ids:
        db.query(WaCampaignRecipient).filter(WaCampaignRecipient.campaign_id.in_(campaign_ids)).delete(synchronize_session=False)
        db.query(WaCampaign).filter(WaCampaign.account_id == acc_id).delete(synchronize_session=False)

    # Nullify FK in sequences (nullable column)
    db.query(Sequence).filter(Sequence.wa_account_id == acc_id).update({"wa_account_id": None}, synchronize_session=False)

    db.delete(acc)
    db.commit()
    return {"ok": True}


@router.post("/accounts/{acc_id}/test")
def test_account(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    ok, msg = test_connection(acc.phone_number_id, acc.access_token)
    return {"ok": ok, "message": msg}


@router.get("/accounts/{acc_id}/profile")
def get_profile(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    profile, error = get_business_profile(acc.phone_number_id, acc.access_token)
    return {"profile": profile, "error": error}


@router.post("/accounts/{acc_id}/profile")
def save_profile(acc_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    fields = {k: v for k, v in data.items() if k in ["about", "address", "description", "email", "websites", "vertical"]}
    ok, msg = update_business_profile(acc.phone_number_id, acc.access_token, fields)
    return {"ok": ok, "message": msg}


@router.post("/accounts/{acc_id}/profile/photo")
async def upload_profile_photo(
    acc_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    data = await file.read()
    mime = file.content_type or "image/jpeg"
    media_id, err = upload_media(acc.phone_number_id, acc.access_token, data, mime)
    if not media_id:
        return {"ok": False, "message": err}
    ok, msg = set_profile_photo(acc.phone_number_id, acc.access_token, media_id)
    return {"ok": ok, "message": msg}


@router.get("/accounts/{acc_id}/coexistence")
def get_coexistence(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    status, error = get_coexistence_status(acc.phone_number_id, acc.access_token)
    return {"status": status, "error": error}


@router.post("/accounts/{acc_id}/coexistence")
def update_coexistence(acc_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    enable = bool(data.get("enable", False))
    ok, message = set_coexistence_status(acc.phone_number_id, acc.access_token, enable)
    return {"ok": ok, "message": message}


@router.get("/accounts/{acc_id}/templates")
def list_templates(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == acc_id, WhatsAppAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    if not acc.waba_id:
        raise HTTPException(400, "Configurá el WABA ID para obtener los templates")
    templates, error = get_templates(acc.waba_id, acc.access_token)
    return {"templates": templates, "error": error}


# ── Webhook ───────────────────────────────────────────────────────────────

@router.get("/webhook")
def webhook_verify(request: Request, db: Session = Depends(get_db)):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    if mode == "subscribe":
        acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.webhook_verify_token == token).first()
        if acc:
            return Response(content=challenge, media_type="text/plain")
    raise HTTPException(403, "Token de verificación inválido")


@router.post("/webhook")
async def webhook_receive(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
        print(f"[WA webhook] received: {body}")
        if body.get("object") != "whatsapp_business_account":
            return {"ok": True}
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
                acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.phone_number_id == phone_number_id).first()
                for msg in value.get("messages", []):
                    try:
                        _process_incoming(db, acc, msg)
                    except Exception as e:
                        print(f"[WA webhook] _process_incoming error: {e}")
                for status in value.get("statuses", []):
                    try:
                        _process_status(db, status)
                    except Exception as e:
                        print(f"[WA webhook] _process_status error: {e}")
    except Exception as e:
        print(f"[WA webhook] outer error: {e}")
    return {"ok": True}


@router.get("/webhook/logs")
def webhook_logs(limit: int = 20, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return recent incoming WA messages for debugging."""
    logs = (
        db.query(SequenceLog)
        .filter(SequenceLog.to_email.like("whatsapp:%"), SequenceLog.status == "received")
        .order_by(SequenceLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [{"id": l.id, "from": l.to_email, "body": l.body, "wamid": l.wamid, "at": str(l.created_at)} for l in logs]


# ── Conversations ─────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return one entry per phone number with last message and unread count."""
    from sqlalchemy import func, text as sa_text

    logs = (
        db.query(SequenceLog)
        .filter(SequenceLog.to_email.like("whatsapp:%"))
        .order_by(SequenceLog.created_at.desc())
        .limit(2000)
        .all()
    )

    # Group by normalized phone (digits only — Meta sends without +, leads may have it)
    convos: dict[str, dict] = {}
    for log in logs:
        raw = log.to_email.replace("whatsapp:", "")
        phone = _norm(raw)
        if not phone:
            continue
        if phone not in convos:
            lead = db.query(Lead).filter(Lead.phone.contains(phone[-9:])).first()
            convos[phone] = {
                "phone": phone,
                "lead_name": lead.name if lead else None,
                "lead_id": lead.id if lead else None,
                "last_message": log.body,
                "last_at": log.created_at.isoformat() if log.created_at else "",
                "last_direction": "in" if log.status == "received" else "out",
                "unread": 0,
            }
        if log.status == "received":
            convos[phone]["unread"] += 1

    result = sorted(convos.values(), key=lambda x: x["last_at"], reverse=True)
    return result


@router.get("/conversations/{phone}")
def get_conversation(phone: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return full message history for a phone number (normalized digits-only key)."""
    digits = _norm(phone)
    # Match both "whatsapp:5491135..." and "whatsapp:+5491135..." in the DB
    logs = (
        db.query(SequenceLog)
        .filter(SequenceLog.to_email.like(f"whatsapp:%{digits}"))
        .order_by(SequenceLog.created_at.asc())
        .limit(200)
        .all()
    )
    lead = db.query(Lead).filter(Lead.phone.contains(digits[-9:])).first() if digits else None
    messages = [
        {
            "id": l.id,
            "body": l.body,
            "subject": l.subject,
            "status": l.status,
            "direction": "in" if l.status == "received" else "out",
            "created_at": l.created_at.isoformat() if l.created_at else "",
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
        }
        for l in logs
    ]
    return {
        "phone": phone,
        "lead": {"id": lead.id, "name": lead.name, "company": lead.company} if lead else None,
        "messages": messages,
    }


@router.post("/send")
def send_message(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Send a free-text or template message to a phone number."""
    acc_id = data.get("account_id")
    phone = data.get("phone", "").strip()
    text = data.get("text", "").strip()
    if not acc_id or not phone or not text:
        raise HTTPException(400, "account_id, phone y text son requeridos")

    acc = db.query(WhatsAppAccount).filter(
        WhatsAppAccount.id == acc_id,
        WhatsAppAccount.user_id == current_user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")

    digits = _normalize_br(_norm(phone))
    ok, result = send_text_message(acc.phone_number_id, acc.access_token, digits, text)
    if ok:
        from datetime import datetime
        import secrets as _sec
        log = SequenceLog(
            sequence_id=0,
            to_email=f"whatsapp:{digits}",
            subject="[WA manual]",
            body=text,
            status="sent",
            open_token=_sec.token_hex(16),
            click_token=_sec.token_hex(16),
            sent_at=datetime.utcnow(),
        )
        db.add(log)
        db.commit()
    return {"ok": ok, "message": result}


def _process_incoming(db, acc, msg: dict):
    """Store incoming WhatsApp message as a SequenceLog reply."""
    from_phone = msg.get("from", "")
    msg_type = msg.get("type", "")
    text = ""
    if msg_type == "text":
        text = msg.get("text", {}).get("body", "")
    elif msg_type == "button":
        text = msg.get("button", {}).get("text", "")
    elif msg_type == "interactive":
        inter = msg.get("interactive", {})
        text = inter.get("button_reply", {}).get("title") or inter.get("list_reply", {}).get("title", "")

    if not from_phone or not text:
        return

    lead = db.query(Lead).filter(Lead.phone.contains(from_phone[-9:])).first() if acc else None

    log = SequenceLog(
        sequence_id=0,
        to_email=f"whatsapp:{from_phone}",
        subject="[WA entrante]",
        body=text,
        status="received",
        open_token=secrets.token_hex(16),
        click_token=secrets.token_hex(16),
        lead_id=lead.id if lead else None,
        wamid=msg.get("id", ""),
    )
    db.add(log)
    db.commit()


def _process_status(db, status: dict):
    """Handle delivery/read receipts from Meta webhook statuses array."""
    from datetime import datetime
    from models import WaCampaignRecipient
    wamid = status.get("id", "")
    st = status.get("status", "")
    if not wamid or st not in ("delivered", "read"):
        return

    # Update sequence log
    log = db.query(SequenceLog).filter(SequenceLog.wamid == wamid).first()
    if log and st == "read" and not log.opened_at:
        log.opened_at = datetime.utcnow()
        log.open_count = (log.open_count or 0) + 1

    # Update WA campaign recipient
    cr = db.query(WaCampaignRecipient).filter(WaCampaignRecipient.wamid == wamid).first()
    if cr:
        if st == "delivered" and cr.status == "sent":
            cr.status = "delivered"
            cr.delivered_at = datetime.utcnow()
        elif st == "read" and cr.status in ("sent", "delivered"):
            cr.status = "read"
            cr.read_at = datetime.utcnow()

    if log or cr:
        db.commit()
