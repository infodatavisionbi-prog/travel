from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from database import get_db
from models import Lead, User, Team, TeamMember, Sequence, SequenceContact
from schemas import LeadCreate, LeadUpdate, LeadOut, LeadCampaignDetailsOut
from services.file_service import parse_file
from dependencies import get_current_user

router = APIRouter(prefix="/leads", tags=["leads"])

# Helper: base filter for personal (non-pool) leads
def _personal(q, user_id):
    return q.filter(Lead.user_id == user_id, Lead.is_pool == False)


def _pick_campaign_status(statuses: List[str]) -> Optional[str]:
    normalized = [s.strip().lower() for s in statuses if s]
    if not normalized:
        return None
    for preferred in ("active", "paused", "completed", "inactive"):
        if preferred in normalized:
            return preferred
    return normalized[0]


@router.get("/groups")
def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = _personal(
        db.query(Lead.group_name).filter(Lead.group_name != None, Lead.group_name != ""),
        current_user.id
    ).distinct().all()
    groups = sorted({r[0] for r in rows if r[0]})
    counts = {g: _personal(db.query(Lead), current_user.id).filter(Lead.group_name == g).count() for g in groups}
    return {"groups": [{"name": g, "count": counts[g]} for g in groups]}


@router.get("", response_model=List[LeadOut])
def list_leads(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    status: Optional[str] = None,
    group: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _personal(db.query(Lead), current_user.id)
    if search:
        like = f"%{search}%"
        q = q.filter(Lead.name.ilike(like) | Lead.email.ilike(like) | Lead.company.ilike(like))
    if status:
        q = q.filter(Lead.status == status)
    if group:
        q = q.filter(Lead.group_name == group)
    leads = q.order_by(Lead.created_at.desc()).offset(skip).limit(limit).all()
    if not leads:
        return []

    lead_ids = [l.id for l in leads]
    contact_rows = (
        db.query(SequenceContact.lead_id, SequenceContact.sequence_id, SequenceContact.status)
        .join(Sequence, Sequence.id == SequenceContact.sequence_id)
        .filter(
            Sequence.user_id == current_user.id,
            SequenceContact.lead_id.in_(lead_ids),
        )
        .all()
    )

    campaign_summary = {lead_id: {"statuses": [], "sequence_ids": set()} for lead_id in lead_ids}
    for lead_id, sequence_id, contact_status in contact_rows:
        info = campaign_summary.setdefault(lead_id, {"statuses": [], "sequence_ids": set()})
        info["statuses"].append(contact_status or "")
        if sequence_id:
            info["sequence_ids"].add(sequence_id)

    result = []
    for lead in leads:
        summary = campaign_summary.get(lead.id, {"statuses": [], "sequence_ids": set()})
        result.append({
            "id": lead.id,
            "name": lead.name,
            "company": lead.company or "",
            "role": lead.role or "",
            "email": lead.email,
            "email2": lead.email2 or "",
            "phone": lead.phone or "",
            "notes": lead.notes or "",
            "tags": lead.tags or "",
            "group_name": lead.group_name or "",
            "custom_fields": lead.custom_fields or "",
            "status": lead.status or "active",
            "created_at": lead.created_at,
            "updated_at": lead.updated_at,
            "campaign_status": _pick_campaign_status(summary["statuses"]),
            "campaign_count": len(summary["sequence_ids"]),
        })
    return result


@router.get("/{lead_id}/campaigns", response_model=LeadCampaignDetailsOut)
def lead_campaign_participation(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = _personal(db.query(Lead), current_user.id).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    rows = (
        db.query(SequenceContact, Sequence)
        .join(Sequence, Sequence.id == SequenceContact.sequence_id)
        .filter(
            Sequence.user_id == current_user.id,
            SequenceContact.lead_id == lead_id,
        )
        .order_by(SequenceContact.enrolled_at.desc())
        .all()
    )

    campaigns = []
    for contact, sequence in rows:
        campaigns.append({
            "sequence_id": sequence.id,
            "sequence_name": sequence.name,
            "sequence_status": sequence.status or "active",
            "contact_status": contact.status or "active",
            "current_step": contact.current_step or 0,
            "follow_up_stage": getattr(contact, "follow_up_stage", "") or "",
            "enrolled_at": contact.enrolled_at,
            "next_send_at": contact.next_send_at,
            "completed_at": contact.completed_at,
        })

    return {
        "lead": {
            "id": lead.id,
            "name": lead.name,
            "company": lead.company or "",
            "role": lead.role or "",
            "email": lead.email,
            "email2": lead.email2 or "",
            "phone": lead.phone or "",
            "notes": lead.notes or "",
            "tags": lead.tags or "",
            "group_name": lead.group_name or "",
            "custom_fields": lead.custom_fields or "",
            "status": lead.status or "active",
            "created_at": lead.created_at,
            "updated_at": lead.updated_at,
            "campaign_status": _pick_campaign_status([c["contact_status"] for c in campaigns]),
            "campaign_count": len(campaigns),
        },
        "campaigns": campaigns,
    }


@router.get("/count")
def count_leads(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"total": _personal(db.query(Lead), current_user.id).count()}


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(lead: LeadCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    email = lead.email.lower()
    existing = db.query(Lead).filter(Lead.email == email, Lead.user_id == current_user.id, Lead.is_pool == False).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"El email {email} ya existe")
    db_lead = Lead(**lead.dict(), user_id=current_user.id, is_pool=False)
    db_lead.email = email
    db.add(db_lead)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"El email {email} ya existe")
    db.refresh(db_lead)
    return db_lead


@router.put("/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: int, update: LeadUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.user_id == current_user.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    for field, value in update.dict(exclude_none=True).items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.user_id == current_user.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    db.delete(lead)
    db.commit()
    return {"ok": True}


@router.post("/upload")
async def upload_leads(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No se recibió archivo")
    content = await file.read()
    try:
        leads_data = parse_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    created = skipped = 0
    errors = []
    for data in leads_data:
        try:
            email = data.get("email", "").lower()
            existing = db.query(Lead).filter(Lead.email == email, Lead.user_id == current_user.id, Lead.is_pool == False).first()
            if existing:
                skipped += 1
                continue
            lead = Lead(**data, user_id=current_user.id, is_pool=False)
            lead.email = email
            db.add(lead)
            db.commit()
            created += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
        except Exception as e:
            db.rollback()
            errors.append(str(e))

    return {"total_in_file": len(leads_data), "created": created, "skipped": skipped, "errors": errors[:10]}


@router.delete("")
def bulk_delete_leads(lead_ids: List[int], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    deleted = db.query(Lead).filter(Lead.id.in_(lead_ids), Lead.user_id == current_user.id).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.post("/assign")
def assign_leads(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lead_ids = payload.get("lead_ids", [])
    target_user_id = payload.get("user_id")
    group_name_by_lead = payload.get("group_name_by_lead") or {}
    if not lead_ids or not target_user_id:
        raise HTTPException(400, "lead_ids y user_id son requeridos")
    if not isinstance(group_name_by_lead, dict):
        raise HTTPException(400, "group_name_by_lead debe ser un objeto")

    my_membership = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.role == "admin",
        TeamMember.status == "accepted"
    ).first()
    if not my_membership:
        raise HTTPException(403, "Solo el administrador del equipo puede asignar leads")

    target_membership = db.query(TeamMember).filter(
        TeamMember.user_id == target_user_id,
        TeamMember.team_id == my_membership.team_id,
        TeamMember.status == "accepted"
    ).first()
    if not target_membership:
        raise HTTPException(400, "El usuario no pertenece a tu equipo")

    if target_user_id == current_user.id:
        raise HTTPException(400, "No podés asignarte leads a vos mismo")

    # Reassign — works for both personal leads and pool leads
    normalized_group_map = {}
    for key, value in group_name_by_lead.items():
        try:
            lead_id = int(key)
        except (TypeError, ValueError):
            continue
        group_name = (value or "").strip()
        if group_name:
            normalized_group_map[lead_id] = group_name

    if normalized_group_map:
        allowed_group_rows = db.query(Lead.group_name).filter(
            Lead.team_id == my_membership.team_id,
            Lead.is_pool == True,
            Lead.group_name != None,
            Lead.group_name != "",
        ).distinct().all()
        allowed_groups = {(r[0] or "").strip() for r in allowed_group_rows if (r[0] or "").strip()}
        invalid_groups = sorted({g for g in normalized_group_map.values() if g not in allowed_groups})
        if invalid_groups:
            raise HTTPException(400, f"Grupo(s) invalido(s): {', '.join(invalid_groups)}")

    leads = db.query(Lead).filter(
        Lead.id.in_(lead_ids),
        Lead.user_id == current_user.id
    ).all()
    for lead in leads:
        lead.user_id = target_user_id
        lead.is_pool = False
        if lead.id in normalized_group_map:
            lead.group_name = normalized_group_map[lead.id]

    db.commit()
    return {"assigned": len(leads)}
