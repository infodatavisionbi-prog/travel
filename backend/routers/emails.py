from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from database import get_db
from models import Campaign, Lead, EmailLog, SequenceLog, AppSetting
from services.smtp_service import send_email, get_smtp_settings, is_api_transport_enabled
import os

router = APIRouter(tags=["emails"])


def _get_base_url(db) -> str:
    s = db.query(AppSetting).filter(AppSetting.key == "base_url").first()
    return s.value if s and s.value else os.getenv("BASE_URL", "http://localhost:8000")


PIXEL_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


@router.post("/campaigns/{campaign_id}/send")
def send_campaign(
    campaign_id: int,
    lead_ids: Optional[List[int]] = None,
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campana no encontrada")

    api_mode = is_api_transport_enabled()
    if (not api_mode) and (not campaign.smtp_user or not campaign.smtp_password):
        raise HTTPException(
            status_code=400,
            detail="La campana no tiene configuracion SMTP. Configura usuario y contrasena SMTP.",
        )

    smtp_host, smtp_port, use_ssl = get_smtp_settings(
        campaign.provider, campaign.smtp_host, campaign.smtp_port
    )
    base_url = _get_base_url(db)

    query = (
        db.query(EmailLog)
        .filter(EmailLog.campaign_id == campaign_id)
        .filter(EmailLog.status.in_(["draft", "failed"]))
    )
    if lead_ids:
        query = query.filter(EmailLog.lead_id.in_(lead_ids))

    logs = query.all()

    if not logs:
        raise HTTPException(status_code=400, detail="No hay emails pendientes para enviar")

    sent = 0
    failed = 0
    errors = []

    for log in logs:
        tracking_pixel_url = f"{base_url}/track/open/{log.open_token}"

        ok, error_msg = send_email(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=campaign.smtp_user or campaign.from_email or "",
            smtp_password=campaign.smtp_password or "",
            from_name=campaign.from_name,
            from_email=campaign.from_email,
            to_email=log.to_email,
            subject=log.subject,
            html_body=log.body,
            tracking_pixel_url=tracking_pixel_url,
            click_token=log.click_token,
            base_url=base_url,
            use_ssl=use_ssl,
        )

        if ok:
            log.status = "sent"
            log.sent_at = datetime.utcnow()
            log.error_message = ""
            sent += 1
        else:
            log.status = "failed"
            log.error_message = error_msg
            failed += 1
            errors.append({"email": log.to_email, "error": error_msg})

        db.commit()

    if sent > 0 and campaign.status == "draft":
        campaign.status = "active"
        db.commit()

    return {"sent": sent, "failed": failed, "errors": errors[:10]}


@router.get("/track/open/{token}")
def track_open(token: str, db: Session = Depends(get_db)):
    log = db.query(EmailLog).filter(EmailLog.open_token == token).first()
    if log:
        log.open_count += 1
        if not log.opened_at:
            log.opened_at = datetime.utcnow()
        if log.status == "sent":
            log.status = "opened"
        db.commit()
    else:
        slog = db.query(SequenceLog).filter(SequenceLog.open_token == token).first()
        if slog:
            slog.open_count += 1
            if not slog.opened_at:
                slog.opened_at = datetime.utcnow()
            if slog.status == "sent":
                slog.status = "opened"
            db.commit()
    return Response(content=PIXEL_GIF, media_type="image/gif")


@router.get("/track/click/{token}")
def track_click(token: str, url: str = "", db: Session = Depends(get_db)):
    log = db.query(EmailLog).filter(EmailLog.click_token == token).first()
    if log:
        log.click_count += 1
        if not log.clicked_at:
            log.clicked_at = datetime.utcnow()
        if log.status in ("sent", "opened"):
            log.status = "clicked"
        db.commit()
    else:
        slog = db.query(SequenceLog).filter(SequenceLog.click_token == token).first()
        if slog:
            slog.click_count += 1
            if not slog.clicked_at:
                slog.clicked_at = datetime.utcnow()
            if slog.status in ("sent", "opened"):
                slog.status = "clicked"
            db.commit()
    if url:
        return RedirectResponse(url=url)
    return {"ok": True}


@router.get("/emails")
def list_emails(
    campaign_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(EmailLog)
    if campaign_id:
        q = q.filter(EmailLog.campaign_id == campaign_id)
    if status:
        q = q.filter(EmailLog.status == status)
    logs = q.order_by(EmailLog.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for log in logs:
        lead = db.query(Lead).filter(Lead.id == log.lead_id).first() if log.lead_id else None
        result.append({
            "id": log.id,
            "lead_id": log.lead_id,
            "campaign_id": log.campaign_id,
            "lead_name": lead.name if lead else "",
            "to_email": log.to_email,
            "subject": log.subject,
            "status": log.status,
            "open_count": log.open_count,
            "click_count": log.click_count,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "opened_at": log.opened_at.isoformat() if log.opened_at else None,
            "clicked_at": log.clicked_at.isoformat() if log.clicked_at else None,
            "error_message": log.error_message,
        })
    return result


@router.delete("/emails/{log_id}")
def delete_email_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Email no encontrado")
    db.delete(log)
    db.commit()
    return {"ok": True}
