from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime
import json
from database import get_db
from models import Team, TeamMember, User, Notification, Lead, Sequence, SequenceLog
from dependencies import get_current_user
from services.auth_service import hash_password

router = APIRouter(prefix="/teams", tags=["teams"])


def _notify(db: Session, user_id: int, type: str, title: str, body: str, data: dict):
    db.add(Notification(user_id=user_id, type=type, title=title, body=body, data=json.dumps(data)))
    db.commit()


def _get_admin_membership(db: Session, user_id: int):
    return db.query(TeamMember).filter(
        TeamMember.user_id == user_id,
        TeamMember.role == "admin",
        TeamMember.status == "accepted"
    ).first()


@router.get("/my")
def get_my_team(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.status == "accepted"
    ).first()
    if not membership:
        return {"team": None, "role": None, "members": []}

    team = db.query(Team).filter(Team.id == membership.team_id).first()

    # Single query: members + users joined
    rows = (
        db.query(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .filter(TeamMember.team_id == team.id, TeamMember.status == "accepted")
        .all()
    )
    member_user_ids = [u.id for _, u in rows]

    # Single query: lead counts per user
    lead_counts_q = (
        db.query(Lead.user_id, func.count(Lead.id))
        .filter(Lead.user_id.in_(member_user_ids), Lead.is_pool == False)
        .group_by(Lead.user_id)
        .all()
    )
    lead_counts = {uid: cnt for uid, cnt in lead_counts_q}

    # Single query: pool count
    pool_count = db.query(func.count(Lead.id)).filter(
        Lead.team_id == team.id, Lead.is_pool == True
    ).scalar() or 0

    result = [
        {"id": m.id, "user_id": u.id, "name": u.name, "email": u.email,
         "role": m.role, "joined_at": m.accepted_at, "lead_count": lead_counts.get(u.id, 0)}
        for m, u in rows
    ]

    return {"team": {"id": team.id, "name": team.name}, "role": membership.role,
            "members": result, "pool_count": pool_count}


@router.post("/create")
def create_team(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "El nombre del equipo es obligatorio")

    existing = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.status == "accepted"
    ).first()
    if existing:
        raise HTTPException(400, "Ya pertenecés a un equipo")

    team = Team(name=name, created_by=current_user.id)
    db.add(team)
    db.flush()

    member = TeamMember(team_id=team.id, user_id=current_user.id, role="admin",
                        status="accepted", invited_by=current_user.id, accepted_at=datetime.utcnow())
    db.add(member)
    db.commit()
    return {"ok": True, "team_id": team.id}


@router.post("/create-member")
def create_team_member(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin creates a new user account that auto-joins the team."""
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador del equipo puede crear miembros")

    email = (payload.get("email") or "").lower().strip()
    password = payload.get("password", "")
    name = (payload.get("name") or "").strip()

    if not email or not password:
        raise HTTPException(400, "Email y contraseña requeridos")
    if len(password) < 6:
        raise HTTPException(400, "Mínimo 6 caracteres")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email ya registrado")

    user = User(email=email, name=name or email.split("@")[0], password_hash=hash_password(password))
    db.add(user)
    db.flush()

    member = TeamMember(team_id=admin_m.team_id, user_id=user.id, role="member",
                        status="accepted", invited_by=current_user.id, accepted_at=datetime.utcnow())
    db.add(member)
    db.commit()
    return {"ok": True, "user": {"id": user.id, "email": user.email, "name": user.name}}


@router.post("/invite")
def invite_member(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email requerido")

    membership = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.role == "admin",
        TeamMember.status == "accepted"
    ).first()
    if not membership:
        raise HTTPException(403, "Solo el administrador del equipo puede invitar usuarios")

    team = db.query(Team).filter(Team.id == membership.team_id).first()
    target = db.query(User).filter(User.email == email).first()
    if not target:
        return {"ok": True, "message": "Si el usuario existe, recibirá la invitación"}
    if target.id == current_user.id:
        raise HTTPException(400, "No podés invitarte a vos mismo")

    existing = db.query(TeamMember).filter(
        TeamMember.team_id == team.id, TeamMember.user_id == target.id
    ).first()
    if existing:
        return {"ok": True, "message": "Si el usuario existe, recibirá la invitación"}

    invite = TeamMember(team_id=team.id, user_id=target.id, role="member",
                        status="pending", invited_by=current_user.id)
    db.add(invite)
    db.flush()

    _notify(db, target.id, "team_invite", f"Invitación al equipo {team.name}",
            f"{current_user.name or current_user.email} te invitó a unirte al equipo",
            {"team_id": team.id, "team_name": team.name, "member_id": invite.id})

    return {"ok": True, "message": "Si el usuario existe, recibirá la invitación"}


@router.delete("/members/{member_id}")
def remove_member(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = _get_admin_membership(db, current_user.id)
    if not membership:
        raise HTTPException(403, "Solo el administrador puede remover miembros")

    target = db.query(TeamMember).filter(
        TeamMember.id == member_id, TeamMember.team_id == membership.team_id
    ).first()
    if not target or target.user_id == current_user.id:
        raise HTTPException(404, "Miembro no encontrado")

    db.delete(target)
    db.commit()
    return {"ok": True}


# ── Pool leads ────────────────────────────────────────────────────────────

@router.get("/pool")
def list_pool_leads(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede ver el pool")

    leads = db.query(Lead).filter(
        Lead.team_id == admin_m.team_id,
        Lead.is_pool == True
    ).order_by(Lead.created_at.desc()).all()

    return [{"id": l.id, "name": l.name, "email": l.email, "company": l.company or "",
             "role": l.role or "", "phone": l.phone or "", "group_name": l.group_name or "",
             "tags": l.tags or "", "created_at": l.created_at} for l in leads]


@router.get("/pool/groups")
def list_pool_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede ver grupos del pool")

    rows = db.query(Lead.group_name).filter(
        Lead.team_id == admin_m.team_id,
        Lead.is_pool == True,
        Lead.group_name != None,
        Lead.group_name != ""
    ).distinct().all()
    groups = sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()})
    return {"groups": groups}


@router.post("/pool/add")
def add_pool_lead(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede agregar leads al pool")

    email = (payload.get("email") or "").lower().strip()
    name = (payload.get("name") or "").strip()
    if not email or not name:
        raise HTTPException(400, "Email y nombre son requeridos")

    existing = db.query(Lead).filter(Lead.email == email, Lead.team_id == admin_m.team_id, Lead.is_pool == True).first()
    if existing:
        raise HTTPException(409, f"El email {email} ya está en el pool")

    lead = Lead(
        name=name, email=email,
        company=payload.get("company", ""), role=payload.get("role", ""),
        phone=payload.get("phone", ""), notes=payload.get("notes", ""),
        tags=payload.get("tags", ""), group_name=payload.get("group_name", ""),
        user_id=current_user.id, team_id=admin_m.team_id, is_pool=True
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return {"ok": True, "id": lead.id}


@router.post("/pool/import")
async def import_pool_leads(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.file_service import parse_file
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede importar leads al pool")

    content = await file.read()
    try:
        leads_data = parse_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(422, str(e))

    created = skipped = 0
    for data in leads_data:
        email = data.get("email", "").lower()
        if not email:
            skipped += 1
            continue
        existing = db.query(Lead).filter(Lead.email == email, Lead.team_id == admin_m.team_id, Lead.is_pool == True).first()
        if existing:
            skipped += 1
            continue
        try:
            lead = Lead(**data, user_id=current_user.id, team_id=admin_m.team_id, is_pool=True)
            lead.email = email
            db.add(lead)
            db.commit()
            created += 1
        except Exception:
            db.rollback()
            skipped += 1

    return {"created": created, "skipped": skipped}


@router.post("/pool/assign")
def assign_pool_leads(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede asignar leads del pool")

    lead_ids = payload.get("lead_ids", [])
    target_user_id = payload.get("user_id")
    if not lead_ids or not target_user_id:
        raise HTTPException(400, "lead_ids y user_id son requeridos")

    target_m = db.query(TeamMember).filter(
        TeamMember.user_id == target_user_id,
        TeamMember.team_id == admin_m.team_id,
        TeamMember.status == "accepted"
    ).first()
    if not target_m:
        raise HTTPException(400, "El usuario no pertenece a tu equipo")

    updated = db.query(Lead).filter(
        Lead.id.in_(lead_ids),
        Lead.team_id == admin_m.team_id,
        Lead.is_pool == True
    ).update({"user_id": target_user_id, "is_pool": False}, synchronize_session=False)
    db.commit()
    return {"assigned": updated}


@router.delete("/pool/{lead_id}")
def delete_pool_lead(lead_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede eliminar leads del pool")

    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.team_id == admin_m.team_id, Lead.is_pool == True).first()
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    db.delete(lead)
    db.commit()
    return {"ok": True}


# ── Member lead management ────────────────────────────────────────────────

@router.get("/members/{user_id}/leads")
def get_member_leads(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin fetches the personal leads of a specific team member."""
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede ver los leads de los miembros")
    target_m = db.query(TeamMember).filter(
        TeamMember.user_id == user_id,
        TeamMember.team_id == admin_m.team_id,
        TeamMember.status == "accepted"
    ).first()
    if not target_m:
        raise HTTPException(404, "Miembro no encontrado en tu equipo")
    leads = db.query(Lead).filter(Lead.user_id == user_id, Lead.is_pool == False).all()
    return [{"id": l.id, "name": l.name, "email": l.email, "company": l.company or ""} for l in leads]


@router.post("/pool/collect")
def collect_leads_to_pool(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin moves any team member's personal leads (or own leads) into the pool."""
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede mover leads al pool")
    lead_ids = payload.get("lead_ids", [])
    from_user_id = payload.get("from_user_id", current_user.id)
    if not lead_ids:
        raise HTTPException(400, "lead_ids es requerido")
    # Verify from_user belongs to same team
    if from_user_id != current_user.id:
        member_check = db.query(TeamMember).filter(
            TeamMember.user_id == from_user_id,
            TeamMember.team_id == admin_m.team_id,
            TeamMember.status == "accepted"
        ).first()
        if not member_check:
            raise HTTPException(400, "El usuario no pertenece a tu equipo")
    updated = db.query(Lead).filter(
        Lead.id.in_(lead_ids),
        Lead.user_id == from_user_id,
        Lead.is_pool == False
    ).update({"is_pool": True, "team_id": admin_m.team_id}, synchronize_session=False)
    db.commit()
    return {"moved": updated}


@router.post("/reassign")
def reassign_member_leads(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin reassigns leads directly from one member to another."""
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede reasignar leads")
    lead_ids = payload.get("lead_ids", [])
    from_user_id = payload.get("from_user_id")
    to_user_id = payload.get("to_user_id")
    if not lead_ids or not from_user_id or not to_user_id:
        raise HTTPException(400, "lead_ids, from_user_id y to_user_id son requeridos")
    team_id = admin_m.team_id
    for uid in [from_user_id, to_user_id]:
        m = db.query(TeamMember).filter(
            TeamMember.user_id == uid,
            TeamMember.team_id == team_id,
            TeamMember.status == "accepted"
        ).first()
        if not m:
            raise HTTPException(400, f"El usuario {uid} no pertenece al equipo")
    updated = db.query(Lead).filter(
        Lead.id.in_(lead_ids),
        Lead.user_id == from_user_id,
        Lead.is_pool == False
    ).update({"user_id": to_user_id}, synchronize_session=False)
    db.commit()
    return {"reassigned": updated}


# ── Overview ──────────────────────────────────────────────────────────────

@router.get("/overview")
def get_team_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin_m = _get_admin_membership(db, current_user.id)
    if not admin_m:
        raise HTTPException(403, "Solo el administrador puede ver el resumen del equipo")

    team_id = admin_m.team_id

    # 1) Members + users in one query
    rows = (
        db.query(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .filter(TeamMember.team_id == team_id, TeamMember.status == "accepted")
        .all()
    )
    user_ids = [u.id for _, u in rows]
    if not user_ids:
        return []

    # 2) Lead counts per user (one query)
    lead_counts_q = (
        db.query(Lead.user_id, func.count(Lead.id))
        .filter(Lead.user_id.in_(user_ids), Lead.is_pool == False)
        .group_by(Lead.user_id)
        .all()
    )
    lead_counts = {uid: cnt for uid, cnt in lead_counts_q}

    # 3) All sequences for all team members (one query)
    sequences = db.query(Sequence).filter(Sequence.user_id.in_(user_ids)).all()
    seq_ids = [s.id for s in sequences]

    # 4) All sequence log stats aggregated (one query)
    if seq_ids:
        log_stats_q = (
            db.query(
                SequenceLog.sequence_id,
                func.count(case((SequenceLog.status == "sent", 1))).label("sent"),
                func.count(case((SequenceLog.open_count > 0, 1))).label("opened"),
                func.count(case((SequenceLog.click_count > 0, 1))).label("clicked"),
            )
            .filter(SequenceLog.sequence_id.in_(seq_ids))
            .group_by(SequenceLog.sequence_id)
            .all()
        )
        log_stats = {r.sequence_id: r for r in log_stats_q}
    else:
        log_stats = {}

    # Group sequences by user_id
    seqs_by_user: dict[int, list] = {}
    for seq in sequences:
        seqs_by_user.setdefault(seq.user_id, []).append(seq)

    result = []
    for m, u in rows:
        user_seqs = seqs_by_user.get(u.id, [])
        seq_stats = []
        for seq in user_seqs:
            st = log_stats.get(seq.id)
            sent = st.sent if st else 0
            opened = st.opened if st else 0
            clicked = st.clicked if st else 0
            seq_stats.append({
                "id": seq.id, "name": seq.name, "status": seq.status,
                "sent": sent, "opened": opened, "clicked": clicked,
                "open_rate": round(opened / sent * 100) if sent else 0,
            })
        result.append({
            "member_id": m.id, "user_id": u.id, "name": u.name or u.email,
            "email": u.email, "role": m.role,
            "lead_count": lead_counts.get(u.id, 0), "sequences": seq_stats,
        })

    return result
