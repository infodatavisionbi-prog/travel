from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from database import get_db
from models import Sequence, SequenceStep, SequenceContact, SequenceLog, Lead, User
from dependencies import get_current_user
from services.smtp_service import is_api_transport_enabled

router = APIRouter(prefix="/sequences", tags=["sequences"])


def _seq_out(s, db, counts=None):
    counts = counts or {}
    step_count = counts.get("step_count")
    total_contacts = counts.get("total_contacts")
    active_contacts = counts.get("active_contacts")
    completed_contacts = counts.get("completed_contacts")
    if step_count is None:
        step_count = db.query(SequenceStep).filter(SequenceStep.sequence_id == s.id).count()
    if total_contacts is None:
        total_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == s.id).count()
    if active_contacts is None:
        active_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == s.id, SequenceContact.status == "active").count()
    if completed_contacts is None:
        completed_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == s.id, SequenceContact.status == "completed").count()
    return {
        "id": s.id, "name": s.name, "description": s.description,
        "from_name": s.from_name, "from_email": s.from_email,
        "provider": s.provider, "smtp_host": s.smtp_host, "smtp_port": s.smtp_port,
        "smtp_user": s.smtp_user, "use_ai": s.use_ai, "ai_instructions": s.ai_instructions,
        "status": s.status, "step_count": step_count,
        "total_contacts": total_contacts, "active_contacts": active_contacts,
        "completed_contacts": completed_contacts,
        "send_hour_start": s.send_hour_start or 8,
        "send_hour_end": s.send_hour_end or 19,
        "send_days": s.send_days or "1,2,3,4,5",
        "daily_limit": s.daily_limit or 50,
        "send_timezone": s.send_timezone or "America/Buenos_Aires",
        "email_account_id": getattr(s, "email_account_id", None),
        "wa_account_id": getattr(s, "wa_account_id", None),
        "type": getattr(s, "type", "email") or "email",
        "send_mode": getattr(s, "send_mode", "automatic") or "automatic",
        "created_at": s.created_at.isoformat(),
    }


@router.get("")
def list_sequences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seqs = db.query(Sequence).filter(Sequence.user_id == current_user.id).order_by(Sequence.created_at.desc()).all()
    seq_ids = [s.id for s in seqs]
    counts = {seq_id: {
        "step_count": 0,
        "total_contacts": 0,
        "active_contacts": 0,
        "completed_contacts": 0,
    } for seq_id in seq_ids}
    if seq_ids:
        for seq_id, step_count in (
            db.query(SequenceStep.sequence_id, func.count(SequenceStep.id))
            .filter(SequenceStep.sequence_id.in_(seq_ids))
            .group_by(SequenceStep.sequence_id)
            .all()
        ):
            counts[seq_id]["step_count"] = step_count
        for seq_id, total, active, completed in (
            db.query(
                SequenceContact.sequence_id,
                func.count(SequenceContact.id),
                func.sum(case((SequenceContact.status == "active", 1), else_=0)),
                func.sum(case((SequenceContact.status == "completed", 1), else_=0)),
            )
            .filter(SequenceContact.sequence_id.in_(seq_ids))
            .group_by(SequenceContact.sequence_id)
            .all()
        ):
            counts[seq_id]["total_contacts"] = total or 0
            counts[seq_id]["active_contacts"] = active or 0
            counts[seq_id]["completed_contacts"] = completed or 0
    return [_seq_out(s, db, counts.get(s.id)) for s in seqs]


@router.post("")
def create_sequence(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = Sequence(
        user_id=current_user.id,
        name=data["name"], description=data.get("description", ""),
        type=data.get("type", "email") or "email",
        email_account_id=data.get("email_account_id") or None,
        wa_account_id=data.get("wa_account_id") or None,
        from_name=data.get("from_name", ""), from_email=data.get("from_email", ""),
        provider=data.get("provider", "hostinger"),
        smtp_host=data.get("smtp_host", ""), smtp_port=data.get("smtp_port", 587),
        smtp_user=data.get("smtp_user", ""), smtp_password=data.get("smtp_password", ""),
        use_ai=data.get("use_ai", False), ai_instructions=data.get("ai_instructions", ""),
        send_hour_start=data.get("send_hour_start", 8),
        send_hour_end=data.get("send_hour_end", 19),
        send_days=data.get("send_days", "1,2,3,4,5"),
        daily_limit=data.get("daily_limit", 50),
        send_timezone=data.get("send_timezone", "America/Buenos_Aires"),
        status="active",
    )
    db.add(seq)
    db.flush()
    for i, step in enumerate(data.get("steps", []), 1):
        db.add(SequenceStep(
            sequence_id=seq.id, step_number=i,
            subject_template=step.get("subject_template", ""),
            body_template=step.get("body_template", ""),
            delay_days=step.get("delay_days", 0),
            use_ai=step.get("use_ai", False),
            ai_instructions=step.get("ai_instructions", ""),
        ))
    db.commit()
    db.refresh(seq)
    return _seq_out(seq, db)


@router.get("/{seq_id}")
def get_sequence(seq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    steps = db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id).order_by(SequenceStep.step_number).all()
    out = _seq_out(seq, db)
    out["steps"] = [
        {"id": s.id, "step_number": s.step_number, "subject_template": s.subject_template,
         "body_template": s.body_template, "delay_days": s.delay_days,
         "use_ai": s.use_ai, "ai_instructions": s.ai_instructions,
         "wa_template_name": getattr(s, "wa_template_name", "") or "",
         "wa_template_language": getattr(s, "wa_template_language", "es_AR") or "es_AR",
         "wa_var_count": getattr(s, "wa_var_count", 0) or 0}
        for s in steps
    ]
    return out


@router.put("/{seq_id}")
def update_sequence(seq_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    for field in ["name", "description", "from_name", "from_email", "provider",
                  "smtp_host", "smtp_port", "smtp_user", "smtp_password",
                  "use_ai", "ai_instructions", "status",
                  "send_hour_start", "send_hour_end", "send_days",
                  "daily_limit", "send_timezone", "email_account_id",
                  "wa_account_id", "type", "send_mode"]:
        if field in data:
            setattr(seq, field, data[field])
    db.commit()
    return {"ok": True}


@router.delete("/{seq_id}")
def delete_sequence(seq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    db.query(SequenceLog).filter(SequenceLog.sequence_id == seq_id).delete()
    db.query(SequenceContact).filter(SequenceContact.sequence_id == seq_id).delete()
    db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id).delete()
    db.delete(seq)
    db.commit()
    return {"ok": True}


# ── Steps ─────────────────────────────────────────────────────────────────

@router.post("/{seq_id}/steps")
def create_step(seq_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    count = db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id).count()
    step = SequenceStep(
        sequence_id=seq_id, step_number=count + 1,
        subject_template=data.get("subject_template", ""),
        body_template=data.get("body_template", ""),
        delay_days=data.get("delay_days", 1),
        use_ai=data.get("use_ai", False),
        ai_instructions=data.get("ai_instructions", ""),
        wa_template_name=data.get("wa_template_name", ""),
        wa_template_language=data.get("wa_template_language", "es_AR"),
        wa_var_count=data.get("wa_var_count", 0),
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return {"id": step.id, "step_number": step.step_number}


@router.put("/{seq_id}/steps/{step_id}")
def update_step(seq_id: int, step_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    step = db.query(SequenceStep).filter(SequenceStep.id == step_id, SequenceStep.sequence_id == seq_id).first()
    if not step:
        raise HTTPException(404, "Paso no encontrado")
    for field in ["subject_template", "body_template", "delay_days", "use_ai", "ai_instructions",
                  "wa_template_name", "wa_template_language", "wa_var_count"]:
        if field in data:
            setattr(step, field, data[field])
    db.commit()
    return {"ok": True}


@router.delete("/{seq_id}/steps/{step_id}")
def delete_step(seq_id: int, step_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    step = db.query(SequenceStep).filter(SequenceStep.id == step_id, SequenceStep.sequence_id == seq_id).first()
    if not step:
        raise HTTPException(404, "Paso no encontrado")
    deleted_num = step.step_number
    db.delete(step)
    db.commit()
    remaining = db.query(SequenceStep).filter(
        SequenceStep.sequence_id == seq_id,
        SequenceStep.step_number > deleted_num,
    ).order_by(SequenceStep.step_number).all()
    for s in remaining:
        s.step_number -= 1
    db.commit()
    return {"ok": True}


# ── Contacts ──────────────────────────────────────────────────────────────

@router.get("/{seq_id}/contacts")
def list_contacts(seq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    contacts = (
        db.query(SequenceContact, Lead)
        .outerjoin(Lead, SequenceContact.lead_id == Lead.id)
        .filter(SequenceContact.sequence_id == seq_id)
        .order_by(SequenceContact.enrolled_at.desc())
        .all()
    )
    result = []
    for c, lead in contacts:
        result.append({
            "id": c.id, "lead_id": c.lead_id,
            "lead_name": lead.name if lead else "",
            "lead_email": lead.email if lead else "",
            "lead_company": lead.company if lead else "",
            "group_name": lead.group_name if lead else "",
            "status": c.status, "current_step": c.current_step,
            "follow_up_stage": getattr(c, "follow_up_stage", "") or "",
            "follow_up_note": getattr(c, "follow_up_note", "") or "",
            "enrolled_at": c.enrolled_at.isoformat() if c.enrolled_at else None,
            "next_send_at": c.next_send_at.isoformat() if c.next_send_at else None,
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        })
    return result


@router.put("/{seq_id}/contacts/{contact_id}/follow-up")
def update_contact_follow_up(seq_id: int, contact_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    contact = db.query(SequenceContact).filter(SequenceContact.id == contact_id, SequenceContact.sequence_id == seq_id).first()
    if not contact:
        raise HTTPException(404, "Contacto no encontrado")
    allowed = {"", "contactar", "interesado", "reunion", "negociacion", "ganado", "perdido"}
    stage = (data.get("follow_up_stage") or "").strip().lower()
    if stage not in allowed:
        raise HTTPException(400, "Etapa de seguimiento invalida")
    contact.follow_up_stage = stage
    if "follow_up_note" in data:
        contact.follow_up_note = (data.get("follow_up_note") or "").strip()[:1000]
    db.commit()
    return {
        "ok": True,
        "follow_up_stage": contact.follow_up_stage or "",
        "follow_up_note": contact.follow_up_note or "",
    }


@router.post("/{seq_id}/enroll")
def enroll_contacts(seq_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead_ids = data.get("lead_ids", [])
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    first_step = db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id, SequenceStep.step_number == 1).first()
    if not first_step:
        raise HTTPException(400, "La secuencia no tiene pasos definidos")
    enrolled = skipped = 0
    for lead_id in lead_ids:
        existing = db.query(SequenceContact).filter(SequenceContact.sequence_id == seq_id, SequenceContact.lead_id == lead_id).first()
        if existing:
            skipped += 1
            continue
        contact = SequenceContact(
            sequence_id=seq_id, lead_id=lead_id,
            status="active", current_step=0,
            enrolled_at=datetime.utcnow(),
            next_send_at=datetime.utcnow() + timedelta(days=first_step.delay_days),
        )
        db.add(contact)
        enrolled += 1
    db.commit()
    return {"enrolled": enrolled, "skipped": skipped}


@router.delete("/{seq_id}/contacts/{contact_id}")
def unenroll_contact(seq_id: int, contact_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    contact = db.query(SequenceContact).filter(SequenceContact.id == contact_id, SequenceContact.sequence_id == seq_id).first()
    if not contact:
        raise HTTPException(404, "Contacto no encontrado")
    db.delete(contact)
    db.commit()
    return {"ok": True}


@router.post("/{seq_id}/process")
def process_now(seq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")

    # Gather diagnostics before processing
    now = datetime.utcnow()
    step_count = db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id).count()
    active_contacts = db.query(SequenceContact).filter(
        SequenceContact.sequence_id == seq_id,
        SequenceContact.status == "active",
    ).count()
    ready_contacts = db.query(SequenceContact).filter(
        SequenceContact.sequence_id == seq_id,
        SequenceContact.status == "active",
        SequenceContact.next_send_at <= now,
    ).count()

    seq_type = getattr(seq, "type", "email") or "email"
    api_mode = is_api_transport_enabled()
    has_smtp = api_mode or bool(
        getattr(seq, "email_account_id", None)
        or (getattr(seq, "smtp_user", None) and getattr(seq, "smtp_password", None))
    )

    from services.sequence_service import process_sequence
    processed = process_sequence(seq_id, db)

    last_error = None
    if processed == 0:
        last_log = db.query(SequenceLog).filter(
            SequenceLog.sequence_id == seq_id,
            SequenceLog.status == "failed"
        ).order_by(SequenceLog.id.desc()).first()
        if last_log:
            last_error = last_log.error_message

    return {
        "processed": processed,
        "type": seq_type,
        "last_error": last_error,
        "diag": {
            "step_count": step_count,
            "active_contacts": active_contacts,
            "ready_contacts": ready_contacts,
            "has_smtp": has_smtp,
            "transport_mode": "api" if api_mode else "smtp",
        },
    }


@router.post("/{seq_id}/trigger-step")
def trigger_step_manual(seq_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Force next-step for all active contacts in a manual-mode sequence."""
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    step_number = data.get("step_number")  # optional: only advance contacts at this step
    now = datetime.utcnow()
    q = db.query(SequenceContact).filter(
        SequenceContact.sequence_id == seq_id,
        SequenceContact.status == "active",
    )
    if step_number is not None:
        q = q.filter(SequenceContact.current_step == step_number - 1)
    contacts = q.all()
    for c in contacts:
        c.next_send_at = now
    db.commit()
    from services.sequence_service import process_sequence
    processed = process_sequence(seq_id, db)
    return {"triggered": len(contacts), "processed": processed}


@router.get("/{seq_id}/timeseries")
def sequence_timeseries(seq_id: int, days: int = 28, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")

    def _date_key(value):
        if not value:
            return ""
        if isinstance(value, str):
            return value[:10]
        return value.strftime("%Y-%m-%d")

    end = datetime.utcnow()
    start = (end - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    def _counts_by_day(column):
        rows = (
            db.query(func.date(column).label("day"), func.count(SequenceLog.id))
            .filter(
                SequenceLog.sequence_id == seq_id,
                column.isnot(None),
                column >= start,
            )
            .group_by(func.date(column))
            .all()
        )
        return {_date_key(day): count for day, count in rows}

    sent_by_day = _counts_by_day(SequenceLog.sent_at)
    opened_by_day = _counts_by_day(SequenceLog.opened_at)
    clicked_by_day = _counts_by_day(SequenceLog.clicked_at)

    result = []
    for i in range(days - 1, -1, -1):
        day = (end - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        key = day.strftime("%Y-%m-%d")
        result.append({
            "date": key,
            "sent": sent_by_day.get(key, 0),
            "opened": opened_by_day.get(key, 0),
            "clicked": clicked_by_day.get(key, 0),
        })
    return result


# ── Activity ──────────────────────────────────────────────────────────────

@router.get("/{seq_id}/activity")
def sequence_activity(seq_id: int, limit: int = 200, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    from_email = seq.from_email
    rows = (
        db.query(SequenceLog, SequenceStep.step_number, Lead.name, Lead.company)
        .outerjoin(SequenceStep, SequenceLog.step_id == SequenceStep.id)
        .outerjoin(Lead, SequenceLog.lead_id == Lead.id)
        .filter(SequenceLog.sequence_id == seq_id)
        .order_by(SequenceLog.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for l, step_number, lead_name, lead_company in rows:
        result.append({
            "id": l.id, "from_email": from_email, "to_email": l.to_email,
            "lead_name": lead_name,
            "lead_company": lead_company,
            "subject": l.subject, "status": l.status,
            "step_number": step_number,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
            "opened_at": l.opened_at.isoformat() if l.opened_at else None,
            "clicked_at": l.clicked_at.isoformat() if l.clicked_at else None,
            "error_message": l.error_message,
            "open_count": l.open_count, "click_count": l.click_count,
        })
    return result


@router.post("/{seq_id}/contacts/{contact_id}/send")
def manual_send_contact(seq_id: int, contact_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Manually trigger the next step for a specific contact."""
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    contact = db.query(SequenceContact).filter(SequenceContact.id == contact_id, SequenceContact.sequence_id == seq_id).first()
    if not contact:
        raise HTTPException(404, "Contacto no encontrado")
    from datetime import datetime
    contact.next_send_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    from services.sequence_service import process_sequence
    sent = process_sequence(seq_id, db, max_send=1)
    return {"ok": sent > 0, "sent": sent}


# ── Stats ─────────────────────────────────────────────────────────────────

@router.get("/{seq_id}/stats")
def sequence_stats(seq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = db.query(Sequence).filter(Sequence.id == seq_id, Sequence.user_id == current_user.id).first()
    if not seq:
        raise HTTPException(404, "Secuencia no encontrada")
    steps = db.query(SequenceStep).filter(SequenceStep.sequence_id == seq_id).order_by(SequenceStep.step_number).all()
    total_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == seq_id).count()
    active_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == seq_id, SequenceContact.status == "active").count()
    completed_contacts = db.query(SequenceContact).filter(SequenceContact.sequence_id == seq_id, SequenceContact.status == "completed").count()
    aggregates = {
        step_id: {
            "sent": sent or 0,
            "opened": opened or 0,
            "clicked": clicked or 0,
            "failed": failed or 0,
        }
        for step_id, sent, opened, clicked, failed in (
            db.query(
                SequenceLog.step_id,
                func.count(SequenceLog.sent_at),
                func.sum(case(((SequenceLog.opened_at.isnot(None)) | (SequenceLog.open_count > 0), 1), else_=0)),
                func.sum(case(((SequenceLog.clicked_at.isnot(None)) | (SequenceLog.click_count > 0), 1), else_=0)),
                func.sum(case((SequenceLog.status == "failed", 1), else_=0)),
            )
            .filter(SequenceLog.sequence_id == seq_id)
            .group_by(SequenceLog.step_id)
            .all()
        )
    }
    step_stats = []
    for s in steps:
        counts = aggregates.get(s.id, {})
        sent = counts.get("sent", 0)
        opened = counts.get("opened", 0)
        clicked = counts.get("clicked", 0)
        failed = counts.get("failed", 0)
        step_stats.append({
            "step_number": s.step_number, "subject": s.subject_template[:60],
            "delay_days": s.delay_days,
            "sent": sent, "opened": opened, "clicked": clicked, "failed": failed,
            "open_rate": round(opened / sent * 100, 1) if sent > 0 else 0,
            "click_rate": round(clicked / sent * 100, 1) if sent > 0 else 0,
        })
    return {
        "total_contacts": total_contacts,
        "active_contacts": active_contacts,
        "completed_contacts": completed_contacts,
        "steps": step_stats,
    }
