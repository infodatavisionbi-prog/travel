from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import json
from database import get_db
from models import Notification, TeamMember, Team, User
from dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()

    return [{"id": n.id, "type": n.type, "title": n.title, "body": n.body,
             "data": json.loads(n.data) if n.data else {}, "read": n.read,
             "created_at": n.created_at} for n in notifs]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).count()
    return {"count": count}


@router.post("/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if n:
        n.read = True
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).update({"read": True})
    db.commit()
    return {"ok": True}


@router.post("/{notif_id}/accept")
def accept_invite(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id,
        Notification.type == "team_invite"
    ).first()
    if not n:
        raise HTTPException(404, "Notificación no encontrada")

    data = json.loads(n.data) if n.data else {}
    member_id = data.get("member_id")

    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.user_id == current_user.id,
        TeamMember.status == "pending"
    ).first()
    if not member:
        raise HTTPException(400, "Invitación no válida o ya procesada")

    # Check user not already in another team
    existing = db.query(TeamMember).filter(
        TeamMember.user_id == current_user.id,
        TeamMember.status == "accepted",
        TeamMember.id != member_id
    ).first()
    if existing:
        raise HTTPException(400, "Ya pertenecés a otro equipo")

    member.status = "accepted"
    member.accepted_at = datetime.utcnow()
    n.read = True
    db.commit()

    # Notify team admin
    team = db.query(Team).filter(Team.id == member.team_id).first()
    admin_m = db.query(TeamMember).filter(
        TeamMember.team_id == member.team_id,
        TeamMember.role == "admin"
    ).first()
    if admin_m and team:
        db.add(Notification(
            user_id=admin_m.user_id,
            type="team_accepted",
            title=f"{current_user.name or current_user.email} aceptó unirse",
            body=f"Ahora forma parte del equipo {team.name}",
            data=json.dumps({"team_id": team.id})
        ))
        db.commit()

    return {"ok": True}


@router.post("/{notif_id}/reject")
def reject_invite(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id,
        Notification.type == "team_invite"
    ).first()
    if not n:
        raise HTTPException(404, "Notificación no encontrada")

    data = json.loads(n.data) if n.data else {}
    member_id = data.get("member_id")

    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.user_id == current_user.id,
        TeamMember.status == "pending"
    ).first()
    if member:
        db.delete(member)

    n.read = True
    db.commit()
    return {"ok": True}
