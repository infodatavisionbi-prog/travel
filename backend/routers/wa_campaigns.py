import re
import os
import time
import random
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session
import httpx
from database import get_db, SessionLocal
from models import WaCampaign, WaCampaignRecipient, WhatsAppAccount, Lead, User
from dependencies import get_current_user
from services.whatsapp_service import send_template_message

_BRIDGE = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")


def _send_via_bridge(user_id: int, phone: str, text: str):
    try:
        resp = httpx.post(
            f"{_BRIDGE}/session/{user_id}/send",
            json={"to": phone, "message": text},
            timeout=30,
        )
        data = resp.json()
        return data.get("ok", False), data.get("wamid", ""), data.get("error", "Error")
    except Exception as e:
        return False, "", str(e)

router = APIRouter(prefix="/wa-campaigns", tags=["wa-campaigns"])


def _norm(phone: str) -> str:
    return re.sub(r"[^\d]", "", phone or "")


def _campaign_out(c: WaCampaign) -> dict:
    total = c.total or 0
    sent = c.sent_count or 0
    return {
        "id": c.id,
        "name": c.name,
        "account_id": c.account_id,
        "template_name": c.template_name,
        "template_language": c.template_language,
        "message_body": c.message_body,
        "status": c.status,
        "total": total,
        "sent_count": sent,
        "delivered_count": c.delivered_count or 0,
        "read_count": c.read_count or 0,
        "error_count": c.error_count or 0,
        "created_at": c.created_at.isoformat() if c.created_at else "",
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "progress_pct": round(sent / total * 100) if total else 0,
        "read_pct": round((c.read_count or 0) / total * 100) if total else 0,
        "delivered_pct": round((c.delivered_count or 0) / total * 100) if total else 0,
        "delay_min": c.delay_min or 3,
        "delay_max": c.delay_max or 8,
    }


def _recipient_out(r: WaCampaignRecipient) -> dict:
    return {
        "id": r.id,
        "campaign_id": r.campaign_id,
        "lead_id": r.lead_id,
        "phone": r.phone,
        "name": r.name,
        "grupo": r.grupo,
        "colegio": r.colegio,
        "status": r.status,
        "wamid": r.wamid,
        "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        "delivered_at": r.delivered_at.isoformat() if r.delivered_at else None,
        "read_at": r.read_at.isoformat() if r.read_at else None,
        "error_msg": r.error_msg,
    }


@router.get("")
def list_campaigns(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    camps = db.query(WaCampaign).filter(
        WaCampaign.user_id == current_user.id
    ).order_by(WaCampaign.created_at.desc()).all()
    return [_campaign_out(c) for c in camps]


@router.post("")
def create_campaign(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not data.get("name") or not data.get("account_id"):
        raise HTTPException(400, "name y account_id son requeridos")
    acc = db.query(WhatsAppAccount).filter(
        WhatsAppAccount.id == data["account_id"],
        WhatsAppAccount.user_id == current_user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Cuenta de WhatsApp no encontrada")
    c = WaCampaign(
        user_id=current_user.id,
        account_id=data["account_id"],
        name=data["name"],
        template_name=data.get("template_name", ""),
        template_language=data.get("template_language", "es_AR"),
        message_body=data.get("message_body", ""),
        delay_min=max(1, int(data.get("delay_min") or 3)),
        delay_max=max(1, int(data.get("delay_max") or 8)),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _campaign_out(c)


@router.put("/{campaign_id}")
def update_campaign(campaign_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    for k in ["name", "template_name", "template_language", "message_body"]:
        if k in data:
            setattr(c, k, data[k])
    if "delay_min" in data:
        c.delay_min = max(1, int(data["delay_min"] or 3))
    if "delay_max" in data:
        c.delay_max = max(1, int(data["delay_max"] or 8))
    db.commit()
    db.refresh(c)
    return _campaign_out(c)


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    db.query(WaCampaignRecipient).filter(WaCampaignRecipient.campaign_id == campaign_id).delete()
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    recipients = db.query(WaCampaignRecipient).filter(
        WaCampaignRecipient.campaign_id == campaign_id
    ).order_by(WaCampaignRecipient.id).all()
    result = _campaign_out(c)
    result["recipients"] = [_recipient_out(r) for r in recipients]
    return result


@router.post("/{campaign_id}/recipients")
def add_recipients(campaign_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    added = 0
    for r in data.get("recipients", []):
        phone = _norm(r.get("phone", ""))
        if not phone:
            continue
        db.add(WaCampaignRecipient(
            campaign_id=campaign_id,
            lead_id=r.get("lead_id"),
            phone=phone,
            name=r.get("name", ""),
            grupo=r.get("grupo", ""),
            colegio=r.get("colegio", ""),
        ))
        added += 1
    if added:
        c.total = db.query(func.count(WaCampaignRecipient.id)).filter(
            WaCampaignRecipient.campaign_id == campaign_id
        ).scalar() + added
        db.commit()
    return {"added": added, "total": c.total}


@router.post("/{campaign_id}/recipients/from-leads")
def add_from_leads(campaign_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    lead_ids = data.get("lead_ids") or []
    grupo_override = data.get("grupo", "")
    colegio_override = data.get("colegio", "")

    q = db.query(Lead).filter(Lead.user_id == current_user.id, Lead.phone != "")
    if lead_ids:
        q = q.filter(Lead.id.in_(lead_ids))

    added = 0
    for lead in q.all():
        phone = _norm(lead.phone)
        if not phone:
            continue
        db.add(WaCampaignRecipient(
            campaign_id=campaign_id,
            lead_id=lead.id,
            phone=phone,
            name=lead.name,
            grupo=grupo_override or lead.group_name or "",
            colegio=colegio_override or lead.company or "",
        ))
        added += 1
    if added:
        current = db.query(func.count(WaCampaignRecipient.id)).filter(
            WaCampaignRecipient.campaign_id == campaign_id
        ).scalar()
        c.total = current + added
        db.commit()
    return {"added": added, "total": c.total}


@router.delete("/{campaign_id}/recipients/{recipient_id}")
def delete_recipient(campaign_id: int, recipient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")
    r = db.query(WaCampaignRecipient).filter(
        WaCampaignRecipient.id == recipient_id,
        WaCampaignRecipient.campaign_id == campaign_id,
    ).first()
    if not r:
        raise HTTPException(404, "Destinatario no encontrado")
    db.delete(r)
    c.total = max(0, (c.total or 1) - 1)
    db.commit()
    return {"ok": True}


def _do_send_campaign(campaign_id: int, user_id: int):
    """Background task: sends messages with random delay between each one."""
    db = SessionLocal()
    try:
        c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id).first()
        if not c or c.status != "sending":
            return

        acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == c.account_id).first()
        if not acc:
            c.status = "error"
            db.commit()
            return

        is_qr = getattr(acc, "account_type", "api") == "qr"
        d_min = max(1, c.delay_min or 3)
        d_max = max(d_min, c.delay_max or 8)

        pending = db.query(WaCampaignRecipient).filter(
            WaCampaignRecipient.campaign_id == campaign_id,
            WaCampaignRecipient.status == "pending",
        ).all()

        for i, r in enumerate(pending):
            if is_qr:
                body = (c.message_body or "")
                body = body.replace("{{name}}", r.name or "").replace("{{grupo}}", r.grupo or "").replace("{{colegio}}", r.colegio or "")
                ok, wamid, err = _send_via_bridge(user_id, r.phone, body)
            else:
                ok, result = send_template_message(
                    acc.phone_number_id, acc.access_token,
                    r.phone, c.template_name, c.template_language,
                    [r.grupo or "", r.colegio or ""],
                )
                wamid, err = (result, "") if ok else ("", result)

            if ok:
                r.status = "sent"
                r.wamid = wamid
                r.sent_at = datetime.utcnow()
                c.sent_count = (c.sent_count or 0) + 1
            else:
                r.status = "error"
                r.error_msg = (err or "")[:500]
                c.error_count = (c.error_count or 0) + 1

            db.commit()

            # Random delay before next message
            if i < len(pending) - 1:
                time.sleep(random.uniform(d_min, d_max))

        c.status = "done" if (c.error_count or 0) == 0 else ("error" if (c.sent_count or 0) == 0 else "done")
        db.commit()
    except Exception:
        try:
            c2 = db.query(WaCampaign).filter(WaCampaign.id == campaign_id).first()
            if c2:
                c2.status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/{campaign_id}/send")
def send_campaign(campaign_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")

    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == c.account_id).first()
    if not acc:
        raise HTTPException(404, "Cuenta de WhatsApp no encontrada")

    is_qr = getattr(acc, "account_type", "api") == "qr"
    if not is_qr and not c.template_name:
        raise HTTPException(400, "La campaña necesita un nombre de template de WhatsApp")
    if is_qr and not c.message_body:
        raise HTTPException(400, "La campaña necesita un mensaje para enviar")

    pending_count = db.query(func.count(WaCampaignRecipient.id)).filter(
        WaCampaignRecipient.campaign_id == campaign_id,
        WaCampaignRecipient.status == "pending",
    ).scalar() or 0
    if not pending_count:
        raise HTTPException(400, "No hay destinatarios pendientes de envío")

    c.status = "sending"
    if not c.sent_at:
        c.sent_at = datetime.utcnow()
    db.commit()

    background_tasks.add_task(_do_send_campaign, campaign_id, current_user.id)

    d_min = c.delay_min or 3
    d_max = c.delay_max or 8
    avg_delay = (d_min + d_max) / 2
    est_sec = round(pending_count * avg_delay)
    return {
        "ok": True,
        "status": "sending",
        "pending": pending_count,
        "delay_min": d_min,
        "delay_max": d_max,
        "estimated_seconds": est_sec,
    }


@router.get("/{campaign_id}/refresh")
def refresh_status(campaign_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(WaCampaign).filter(WaCampaign.id == campaign_id, WaCampaign.user_id == current_user.id).first()
    if not c:
        raise HTTPException(404, "Campaña no encontrada")

    counts = db.query(WaCampaignRecipient.status, func.count()).filter(
        WaCampaignRecipient.campaign_id == campaign_id
    ).group_by(WaCampaignRecipient.status).all()
    d = {s: n for s, n in counts}

    c.read_count = d.get("read", 0)
    c.delivered_count = d.get("delivered", 0) + c.read_count
    c.sent_count = d.get("sent", 0) + c.delivered_count
    c.error_count = d.get("error", 0)
    c.total = sum(d.values())
    db.commit()

    recipients = db.query(WaCampaignRecipient).filter(
        WaCampaignRecipient.campaign_id == campaign_id
    ).order_by(WaCampaignRecipient.id).all()
    result = _campaign_out(c)
    result["recipients"] = [_recipient_out(r) for r in recipients]
    return result
