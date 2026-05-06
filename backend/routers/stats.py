from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from database import get_db
from models import Lead, Sequence, SequenceLog, SequenceContact, SequenceStep, User
from dependencies import get_current_user

router = APIRouter(prefix="/stats", tags=["stats"])


def _user_seq_ids(user_id: int, db: Session):
    return [s.id for s in db.query(Sequence.id).filter(Sequence.user_id == user_id).all()]


@router.get("")
def get_stats(seq_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_leads = db.query(Lead).filter(Lead.user_id == current_user.id).count()
    total_campaigns = db.query(Sequence).filter(Sequence.user_id == current_user.id).count()

    base_q = db.query(SequenceLog)
    if seq_id:
        base_q = base_q.filter(SequenceLog.sequence_id == seq_id)
    else:
        ids = _user_seq_ids(current_user.id, db)
        base_q = base_q.filter(SequenceLog.sequence_id.in_(ids))

    total_sent = base_q.filter(SequenceLog.sent_at.isnot(None), SequenceLog.status != "failed").count()
    total_opened = base_q.filter(SequenceLog.opened_at.isnot(None)).count()
    total_clicked = base_q.filter(SequenceLog.clicked_at.isnot(None)).count()
    open_rate = round((total_opened / total_sent * 100) if total_sent > 0 else 0, 1)
    click_rate = round((total_clicked / total_sent * 100) if total_sent > 0 else 0, 1)

    return {
        "total_leads": total_leads, "total_campaigns": total_campaigns,
        "total_sent": total_sent, "total_opened": total_opened, "total_clicked": total_clicked,
        "open_rate": open_rate, "click_rate": click_rate,
    }


@router.get("/monitoring")
def get_monitoring(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seqs = db.query(Sequence).filter(Sequence.user_id == current_user.id).order_by(Sequence.created_at.desc()).all()
    ids = [s.id for s in seqs]
    if not ids:
        return {
            "active_sequences": 0, "total_enrolled": 0,
            "seq_sent": 0, "open_rate": 0, "click_rate": 0,
            "sequences": [],
        }

    active_sequences = sum(1 for s in seqs if s.status == "active")
    contact_counts = {
        seq_id: {
            "total_contacts": total or 0,
            "active_contacts": active or 0,
            "completed_contacts": completed or 0,
        }
        for seq_id, total, active, completed in (
            db.query(
                SequenceContact.sequence_id,
                func.count(SequenceContact.id),
                func.sum(case((SequenceContact.status == "active", 1), else_=0)),
                func.sum(case((SequenceContact.status == "completed", 1), else_=0)),
            )
            .filter(SequenceContact.sequence_id.in_(ids))
            .group_by(SequenceContact.sequence_id)
            .all()
        )
    }
    step_counts = {
        seq_id: count or 0
        for seq_id, count in (
            db.query(SequenceStep.sequence_id, func.count(SequenceStep.id))
            .filter(SequenceStep.sequence_id.in_(ids))
            .group_by(SequenceStep.sequence_id)
            .all()
        )
    }
    log_counts = {
        seq_id: {
            "sent": sent or 0,
            "opened": opened or 0,
            "clicked": clicked or 0,
        }
        for seq_id, sent, opened, clicked in (
            db.query(
                SequenceLog.sequence_id,
                func.sum(case((SequenceLog.sent_at.isnot(None), 1), else_=0)),
                func.sum(case((SequenceLog.opened_at.isnot(None), 1), else_=0)),
                func.sum(case((SequenceLog.clicked_at.isnot(None), 1), else_=0)),
            )
            .filter(SequenceLog.sequence_id.in_(ids))
            .group_by(SequenceLog.sequence_id)
            .all()
        )
    }

    total_enrolled = sum(c["total_contacts"] for c in contact_counts.values())
    seq_sent = sum(c["sent"] for c in log_counts.values())
    seq_opened = sum(c["opened"] for c in log_counts.values())
    seq_clicked = sum(c["clicked"] for c in log_counts.values())
    open_rate = round(seq_opened / seq_sent * 100, 1) if seq_sent > 0 else 0
    click_rate = round(seq_clicked / seq_sent * 100, 1) if seq_sent > 0 else 0

    seq_rows = []
    for s in seqs:
        contact_count = contact_counts.get(s.id, {})
        log_count = log_counts.get(s.id, {})
        steps = contact_count.get("total_contacts", 0)
        active = contact_count.get("active_contacts", 0)
        completed = contact_count.get("completed_contacts", 0)
        sent = log_count.get("sent", 0)
        opened = log_count.get("opened", 0)
        clicked = log_count.get("clicked", 0)
        step_count = step_counts.get(s.id, 0)
        seq_rows.append({
            "id": s.id, "name": s.name, "status": s.status,
            "step_count": step_count, "total_contacts": steps,
            "active_contacts": active, "completed_contacts": completed,
            "sent": sent, "opened": opened, "clicked": clicked,
            "open_rate": round(opened / sent * 100, 1) if sent > 0 else 0,
            "click_rate": round(clicked / sent * 100, 1) if sent > 0 else 0,
        })

    return {
        "active_sequences": active_sequences, "total_enrolled": total_enrolled,
        "seq_sent": seq_sent, "open_rate": open_rate, "click_rate": click_rate,
        "sequences": seq_rows,
    }


@router.get("/timeseries")
def get_timeseries(days: int = 28, seq_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ids = [seq_id] if seq_id else _user_seq_ids(current_user.id, db)
    end = datetime.utcnow()
    result = []
    for i in range(days - 1, -1, -1):
        day = (end - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_next = day + timedelta(days=1)
        q = db.query(SequenceLog).filter(SequenceLog.sequence_id.in_(ids))
        sent = q.filter(SequenceLog.sent_at >= day, SequenceLog.sent_at < day_next).count()
        opened = q.filter(SequenceLog.opened_at >= day, SequenceLog.opened_at < day_next).count()
        clicked = q.filter(SequenceLog.clicked_at >= day, SequenceLog.clicked_at < day_next).count()
        result.append({"date": day.strftime("%Y-%m-%d"), "sent": sent, "opened": opened, "clicked": clicked})
    return result


@router.get("/activity")
def get_recent_activity(limit: int = 20, seq_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ids = [seq_id] if seq_id else _user_seq_ids(current_user.id, db)
    q = db.query(SequenceLog).filter(SequenceLog.sequence_id.in_(ids), SequenceLog.sent_at.isnot(None))
    logs = q.order_by(SequenceLog.sent_at.desc()).limit(limit).all()
    seqs = {s.id: s for s in db.query(Sequence).filter(Sequence.user_id == current_user.id).all()}
    result = []
    for log in logs:
        seq = seqs.get(log.sequence_id)
        result.append({
            "id": log.id, "to_email": log.to_email, "subject": log.subject,
            "status": log.status, "campaign_name": seq.name if seq else "",
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "opened_at": log.opened_at.isoformat() if log.opened_at else None,
        })
    return result
