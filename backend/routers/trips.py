from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import os, httpx, traceback

from dependencies import get_db, get_current_user
from models import TripGroup, TripItineraryItem, TripResponsable, TripSend, User

router = APIRouter(prefix="/trips", tags=["trips"])

_BRIDGE = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")


def _resolve_message(template: str, trip: TripGroup, item: TripItineraryItem, resp: TripResponsable) -> str:
    time_str = item.time[:5] if item.time else ""
    return (template
        .replace("{grupo}", trip.name)
        .replace("{actividad}", item.activity)
        .replace("{lugar}", item.location or "")
        .replace("{dia}", f"Día {item.day_number}")
        .replace("{hora}", time_str)
        .replace("{nota}", item.notes or "")
        .replace("{nombre}", resp.name or ""))


# ── Trips CRUD ────────────────────────────────────────────────

@router.get("")
def list_trips(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        trips = db.query(TripGroup).filter(TripGroup.user_id == current_user.id).order_by(TripGroup.created_at.desc()).all()
        result = []
        for t in trips:
            resp_count = db.query(TripResponsable).filter(TripResponsable.trip_id == t.id).count()
            item_count = db.query(TripItineraryItem).filter(TripItineraryItem.trip_id == t.id).count()
            result.append({
                "id": t.id,
                "name": t.name,
                "destination": t.destination,
                "departure_date": t.departure_date,
                "return_date": t.return_date,
                "status": t.status,
                "notes": t.notes,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "responsable_count": resp_count,
                "item_count": item_count,
            })
        return result
    except Exception as e:
        print(f"[TRIPS] list_trips error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error al listar grupos: {str(e)}")


@router.post("")
def create_trip(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        name = data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="El nombre es obligatorio")
        trip = TripGroup(
            user_id=current_user.id,
            name=name,
            destination=data.get("destination", ""),
            departure_date=data.get("departure_date", ""),
            return_date=data.get("return_date", ""),
            status=data.get("status", "upcoming"),
            notes=data.get("notes", ""),
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        return {"id": trip.id, "name": trip.name}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"[TRIPS] create_trip error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error al crear grupo: {str(e)}")


@router.put("/{trip_id}")
def update_trip(trip_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    for field in ("name", "destination", "departure_date", "return_date", "status", "notes"):
        if field in data:
            setattr(trip, field, data[field])
    db.commit()
    return {"ok": True}


@router.delete("/{trip_id}")
def delete_trip(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    db.delete(trip)
    db.commit()
    return {"ok": True}


# ── Itinerary ─────────────────────────────────────────────────

@router.get("/{trip_id}/itinerary")
def list_itinerary(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    items = db.query(TripItineraryItem).filter(TripItineraryItem.trip_id == trip_id).order_by(
        TripItineraryItem.day_number, TripItineraryItem.time
    ).all()
    return [
        {
            "id": i.id, "trip_id": i.trip_id, "day_number": i.day_number,
            "time": i.time, "activity": i.activity, "location": i.location,
            "message_template": i.message_template, "notes": i.notes,
        }
        for i in items
    ]


@router.post("/{trip_id}/itinerary")
def create_itinerary_item(trip_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    item = TripItineraryItem(
        trip_id=trip_id,
        day_number=data.get("day_number", 1),
        time=data.get("time", ""),
        activity=data.get("activity", "").strip(),
        location=data.get("location", ""),
        message_template=data.get("message_template", ""),
        notes=data.get("notes", ""),
    )
    if not item.activity:
        raise HTTPException(status_code=400, detail="La actividad es obligatoria")
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id}


@router.put("/{trip_id}/itinerary/{item_id}")
def update_itinerary_item(trip_id: int, item_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    item = db.query(TripItineraryItem).filter(TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    for field in ("day_number", "time", "activity", "location", "message_template", "notes"):
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    return {"ok": True}


@router.delete("/{trip_id}/itinerary/{item_id}")
def delete_itinerary_item(trip_id: int, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    item = db.query(TripItineraryItem).filter(TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── Responsables ──────────────────────────────────────────────

@router.get("/{trip_id}/responsables")
def list_responsables(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    resps = db.query(TripResponsable).filter(TripResponsable.trip_id == trip_id).all()
    return [
        {"id": r.id, "name": r.name, "phone": r.phone, "student_name": r.student_name}
        for r in resps
    ]


@router.post("/{trip_id}/responsables")
def add_responsable(trip_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    phone = data.get("phone", "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="El teléfono es obligatorio")
    resp = TripResponsable(
        trip_id=trip_id,
        name=data.get("name", ""),
        phone=phone,
        student_name=data.get("student_name", ""),
    )
    db.add(resp)
    db.commit()
    db.refresh(resp)
    return {"id": resp.id}


@router.delete("/{trip_id}/responsables/{resp_id}")
def delete_responsable(trip_id: int, resp_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    resp = db.query(TripResponsable).filter(TripResponsable.id == resp_id, TripResponsable.trip_id == trip_id).first()
    if not resp:
        raise HTTPException(status_code=404, detail="Responsable no encontrado")
    db.delete(resp)
    db.commit()
    return {"ok": True}


# ── Send history ──────────────────────────────────────────────

@router.get("/{trip_id}/sends")
def list_sends(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    sends = db.query(TripSend).filter(TripSend.trip_id == trip_id).order_by(TripSend.created_at.desc()).limit(200).all()
    return [
        {
            "id": s.id, "activity": s.activity, "responsable_name": s.responsable_name,
            "phone": s.phone, "status": s.status, "error_msg": s.error_msg,
            "sent_at": s.sent_at.isoformat() if s.sent_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sends
    ]


# ── Launch send ───────────────────────────────────────────────

@router.post("/{trip_id}/itinerary/{item_id}/send")
def send_itinerary_item(trip_id: int, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    trip = db.query(TripGroup).filter(TripGroup.id == trip_id, TripGroup.user_id == current_user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    item = db.query(TripItineraryItem).filter(TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    responsables = db.query(TripResponsable).filter(TripResponsable.trip_id == trip_id).all()
    if not responsables:
        raise HTTPException(status_code=400, detail="No hay responsables en este grupo")

    queued = 0
    for resp in responsables:
        message = _resolve_message(item.message_template or "", trip, item, resp)
        send_log = TripSend(
            trip_id=trip_id,
            item_id=item_id,
            responsable_id=resp.id,
            activity=item.activity,
            responsable_name=resp.name,
            phone=resp.phone,
            message=message,
            status="pending",
            created_at=datetime.utcnow(),
        )
        db.add(send_log)
        db.flush()

        # Fire-and-forget to WA bridge
        try:
            r = httpx.post(
                f"{_BRIDGE}/session/{current_user.id}/send",
                json={"phone": resp.phone, "message": message},
                timeout=8,
            )
            result = r.json() if r.status_code < 400 else {}
            send_log.status = "sent"
            send_log.wamid = result.get("wamid", "")
            send_log.sent_at = datetime.utcnow()
            queued += 1
        except Exception as e:
            send_log.status = "failed"
            send_log.error_msg = str(e)[:490]

    db.commit()
    return {"ok": True, "queued": queued, "total": len(responsables)}
