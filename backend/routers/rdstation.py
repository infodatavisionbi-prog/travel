from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import AppSetting, Lead, User
from dependencies import get_current_user
from services.rdstation_service import (
    test_connection, list_contacts, get_contact, create_contact, update_contact,
    get_custom_fields, get_users, get_teams, fetch_all_contacts,
    list_deals, get_deal, get_deal_contacts, fetch_all_deals, get_deal_stages, update_deal,
)
from models import RdAutomation
from services.rdstation_automation_service import (
    create_automation,
    delete_automation,
    get_automation,
    list_automations,
    reset_automation_processed,
    run_automation,
    update_automation,
)
from datetime import datetime

router = APIRouter(prefix="/rdstation", tags=["rdstation"])


def _get_token(db: Session, user_id: int) -> str:
    s = db.query(AppSetting).filter(AppSetting.key == "rdstation_token", AppSetting.user_id == user_id).first()
    return s.value if s and s.value else ""


def _extract_rd_id(tags: str) -> str:
    for tag in (tags or "").split(","):
        if tag.strip().startswith("rdstation:"):
            return tag.strip()[len("rdstation:"):]
    return ""


def _set_rd_tag(existing_tags: str, rd_id: str) -> str:
    tags = [t.strip() for t in (existing_tags or "").split(",") if t.strip() and not t.strip().startswith("rdstation:")]
    if rd_id:
        tags.append(f"rdstation:{rd_id}")
    return ",".join(tags)


def _enrich_local(contacts: list, db: Session, user_id: int):
    """Attach _local_lead_id to each contact dict."""
    for c in contacts:
        c_email = (c.get("email") or "").strip().lower()
        rd_id = c.get("_id", "")
        local = None
        if c_email:
            local = db.query(Lead).filter(Lead.email == c_email, Lead.user_id == user_id).first()
        if not local and rd_id:
            local = db.query(Lead).filter(
                Lead.tags.like(f"%rdstation:{rd_id}%"), Lead.user_id == user_id
            ).first()
        c["_local_lead_id"] = local.id if local else None


# ── Connection ──────────────────────────────────────────────────────────────

@router.get("/test")
def test_rdstation(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado. Guardá tu token en Configuración.")
    ok, msg = test_connection(token)
    return {"ok": ok, "message": msg}


# ── Contacts ────────────────────────────────────────────────────────────────

@router.get("/contacts")
def get_rdstation_contacts(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    q: str = Query(None),
    email: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        data = list_contacts(token, page=page, limit=limit, q=q, email=email)
        contacts = data.get("contacts", [])
        _enrich_local(contacts, db, current_user.id)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error al conectar con RD Station: {e}")


@router.get("/contacts/{contact_id}")
def get_rdstation_contact(
    contact_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        data = get_contact(token, contact_id)
        # The API may return the contact directly or wrapped
        contact = data.get("contact", data) if isinstance(data, dict) else data
        _enrich_local([contact], db, current_user.id)
        return {"contact": contact}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error al obtener contacto: {e}")


@router.post("/contacts/search")
def search_contacts(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search contacts with custom field filters.
    body: { q, user_id, filters: [{field_id, operator, value}] }
    """
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")

    q = body.get("q", "").strip() or None
    user_id_filter = body.get("user_id", "").strip() or None
    filters = body.get("filters", [])

    try:
        contacts = fetch_all_contacts(token, q=q)
    except Exception as e:
        raise HTTPException(502, f"Error al obtener contactos: {e}")

    result = []
    for c in contacts:
        cf_map = {cf.get("custom_field_id", ""): str(cf.get("value") or "") for cf in (c.get("custom_fields") or [])}

        match = True
        for f in filters:
            fid = f.get("field_id", "")
            op = f.get("operator", "contains")
            fval = str(f.get("value") or "").strip()
            if not fval:
                continue
            cf_val = cf_map.get(fid, "")
            if op == "contains":
                if fval.lower() not in cf_val.lower():
                    match = False; break
            elif op == "equals":
                if cf_val.lower() != fval.lower():
                    match = False; break
            elif op == "starts_with":
                if not cf_val.lower().startswith(fval.lower()):
                    match = False; break
            elif op == "not_empty":
                if not cf_val.strip():
                    match = False; break

        if match and user_id_filter:
            c_user = c.get("user") or {}
            c_uid = str(c_user.get("id", c_user.get("_id", ""))) if isinstance(c_user, dict) else str(c_user)
            if c_uid != user_id_filter:
                match = False

        if match:
            result.append(c)

    _enrich_local(result, db, current_user.id)
    return {"contacts": result, "total": len(result), "fetched": len(contacts)}


@router.post("/contacts/import")
def import_contact(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rd_id = data.get("rd_id", "")
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    company = (data.get("company") or "").strip()
    role = (data.get("role") or "").strip()
    custom_fields = (data.get("custom_fields") or "").strip()

    if not name:
        raise HTTPException(400, "El nombre es obligatorio")

    existing = None
    if email:
        existing = db.query(Lead).filter(Lead.email == email, Lead.user_id == current_user.id).first()
    if not existing and rd_id:
        existing = db.query(Lead).filter(
            Lead.tags.like(f"%rdstation:{rd_id}%"), Lead.user_id == current_user.id
        ).first()

    if existing:
        if phone and not existing.phone:
            existing.phone = phone
        if company and not existing.company:
            existing.company = company
        if role and not existing.role:
            existing.role = role
        existing.tags = _set_rd_tag(existing.tags, rd_id)
        if custom_fields:
            existing.custom_fields = custom_fields
        db.commit()
        return {"ok": True, "action": "updated", "lead_id": existing.id}
    else:
        lead = Lead(
            user_id=current_user.id,
            name=name,
            email=email or f"rd-{rd_id}@imported",
            phone=phone,
            company=company,
            role=role,
            tags=f"rdstation:{rd_id}" if rd_id else "rdstation",
            custom_fields=custom_fields,
            status="active",
            created_at=datetime.utcnow(),
        )
        db.add(lead)
        db.commit()
        db.refresh(lead)
        return {"ok": True, "action": "created", "lead_id": lead.id}


@router.post("/contacts/import-bulk")
def import_bulk(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contacts = data.get("contacts", [])
    to_pool = data.get("to_pool", False)
    created = updated = skipped = 0

    team_id = None
    if to_pool:
        from models import TeamMember
        admin_m = db.query(TeamMember).filter(
            TeamMember.user_id == current_user.id,
            TeamMember.role == "admin",
            TeamMember.status == "accepted"
        ).first()
        if not admin_m:
            raise HTTPException(403, "Solo el administrador del equipo puede importar al pool")
        team_id = admin_m.team_id

    for c in contacts:
        try:
            rd_id = c.get("_id", "")
            name = (c.get("name") or "").strip()
            email = (c.get("email") or "").strip().lower()
            phone = _extract_phone(c)
            company = _extract_company(c)
            role = (c.get("title") or "").strip()
            if not name:
                skipped += 1
                continue
            existing = None
            if email:
                existing = db.query(Lead).filter(Lead.email == email, Lead.user_id == current_user.id).first()
            if not existing and rd_id:
                existing = db.query(Lead).filter(
                    Lead.tags.like(f"%rdstation:{rd_id}%"), Lead.user_id == current_user.id
                ).first()
            if existing and not to_pool:
                existing.tags = _set_rd_tag(existing.tags, rd_id)
                db.commit()
                updated += 1
            else:
                lead = Lead(
                    user_id=current_user.id,
                    name=name,
                    email=email or f"rd-{rd_id}@imported",
                    phone=phone,
                    company=company,
                    role=role,
                    tags=f"rdstation:{rd_id}" if rd_id else "rdstation",
                    status="active",
                    is_pool=to_pool,
                    team_id=team_id,
                    created_at=datetime.utcnow(),
                )
                db.add(lead)
                db.commit()
                created += 1
        except Exception:
            skipped += 1
    return {"ok": True, "created": created, "updated": updated, "skipped": skipped}


# ── Deals ────────────────────────────────────────────────────────────────────

@router.get("/deals")
def get_rdstation_deals(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    q: str = Query(None),
    stage_id: str = Query(None),
    user_id: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        return list_deals(token, page=page, limit=limit, q=q, stage_id=stage_id, user_id=user_id)
    except Exception as e:
        raise HTTPException(502, f"Error al obtener negocios: {e}")


@router.get("/deals/search")
def search_deals(
    q: str = Query(None),
    stage_id: str = Query(None),
    user_id: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all deals with optional filters (fetches all pages)."""
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        deals = fetch_all_deals(token, q=q or None, stage_id=stage_id or None, user_id=user_id or None)
        return {"deals": deals, "total": len(deals)}
    except Exception as e:
        raise HTTPException(502, f"Error al obtener negocios: {e}")


@router.post("/deals/search")
def search_deals_post(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all deals with custom field filters applied server-side."""
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")

    q = (body.get("q") or "").strip() or None
    stage_id = (body.get("stage_id") or "").strip() or None
    user_id_filter = (body.get("user_id") or "").strip() or None
    cf_filters = body.get("cf_filters", [])

    try:
        deals = fetch_all_deals(token, q=q, stage_id=stage_id, user_id=user_id_filter)
    except Exception as e:
        raise HTTPException(502, f"Error al obtener negocios: {e}")

    result = []
    for d in deals:
        cf_map = {
            cf.get("custom_field_id", ""): str(cf.get("value") or "")
            for cf in (d.get("deal_custom_fields") or [])
        }
        match = True
        for f in cf_filters:
            fid = f.get("field_id", "")
            op = f.get("operator", "contains")
            fval = str(f.get("value") or "").strip()
            if not fval and op != "not_empty":
                continue
            cf_val = cf_map.get(fid, "")
            if op == "contains":
                if fval.lower() not in cf_val.lower():
                    match = False; break
            elif op == "equals":
                if cf_val.lower() != fval.lower():
                    match = False; break
            elif op == "starts_with":
                if not cf_val.lower().startswith(fval.lower()):
                    match = False; break
            elif op == "not_empty":
                if not cf_val.strip():
                    match = False; break
        if match:
            result.append(d)

    return {"deals": result, "total": len(result), "fetched": len(deals)}


@router.get("/deals/stages")
def rd_deal_stages(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        return {"deal_stages": get_deal_stages(token)}
    except Exception as e:
        raise HTTPException(502, str(e))


@router.get("/teams")
def rd_teams(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        return {"teams": get_teams(token)}
    except Exception as e:
        raise HTTPException(502, str(e))


@router.get("/automations")
def rd_list_automations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return list_automations(db, current_user.id)


@router.post("/automations")
def rd_create_automation(body: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return create_automation(db, current_user.id, body)


@router.get("/automations/{automation_id}")
def rd_get_automation(automation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_automation(db, current_user.id, automation_id)


@router.put("/automations/{automation_id}")
def rd_update_automation(automation_id: int, body: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return update_automation(db, current_user.id, automation_id, body)


@router.delete("/automations/{automation_id}")
def rd_delete_automation(automation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return delete_automation(db, current_user.id, automation_id)


@router.post("/automations/{automation_id}/run")
def rd_run_automation(
    automation_id: int,
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    auto = db.query(RdAutomation).filter(
        RdAutomation.id == automation_id, RdAutomation.user_id == current_user.id
    ).first()
    if not auto:
        raise HTTPException(404, "Automatización no encontrada")
    payload = body or {}
    dry_run = str(payload.get("dry_run", False)).strip().lower() in {"1", "true", "yes", "on", "si", "s"}
    try:
        return run_automation(db, auto, dry_run=dry_run, max_deals_override=payload.get("max_deals"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error ejecutando automatizacion: {e}")


@router.post("/automations/{automation_id}/reset")
def rd_reset_automation(
    automation_id: int,
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = body or {}
    return reset_automation_processed(db, current_user.id, automation_id, payload.get("deal_ids"))


@router.put("/deals/bulk-update")
def bulk_update_rdstation_deals(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")

    deal_ids = body.get("deal_ids") or []
    if not isinstance(deal_ids, list):
        raise HTTPException(400, "deal_ids debe ser una lista")
    deal_ids = [str(x).strip() for x in deal_ids if str(x).strip()]
    if not deal_ids:
        raise HTTPException(400, "Seleccioná al menos un negocio")

    deal_stage_id = (body.get("deal_stage_id") or "").strip() or None
    user_id = (body.get("user_id") or "").strip() or None
    if not deal_stage_id and not user_id:
        raise HTTPException(400, "Indicá deal_stage_id y/o user_id")

    ok = 0
    failed = 0
    errors = []
    for did in deal_ids:
        try:
            update_deal(token, did, deal_stage_id=deal_stage_id, user_id=user_id)
            ok += 1
        except Exception as e:
            failed += 1
            errors.append({"deal_id": did, "error": str(e)})

    return {"ok": ok, "failed": failed, "total": len(deal_ids), "errors": errors[:10]}


@router.get("/deals/{deal_id}")
def get_rdstation_deal(
    deal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        data = get_deal(token, deal_id)
        deal = data.get("deal", data) if isinstance(data, dict) else data
        return {"deal": deal}
    except Exception as e:
        raise HTTPException(502, f"Error al obtener negocio: {e}")


@router.get("/deals/{deal_id}/contacts")
def get_rdstation_deal_contacts(
    deal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        data = get_deal_contacts(token, deal_id)
        contacts = data.get("contacts", data) if isinstance(data, dict) else data
        if isinstance(contacts, list):
            _enrich_local(contacts, db, current_user.id)
        return {"contacts": contacts}
    except Exception as e:
        raise HTTPException(502, f"Error al obtener contactos del negocio: {e}")


@router.put("/deals/{deal_id}")
def update_rdstation_deal(
    deal_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")

    deal_stage_id = (body.get("deal_stage_id") or "").strip() or None
    user_id = (body.get("user_id") or "").strip() or None
    if not deal_stage_id and not user_id:
        raise HTTPException(400, "Indicá deal_stage_id y/o user_id")

    try:
        data = update_deal(token, deal_id, deal_stage_id=deal_stage_id, user_id=user_id)
        return {"ok": True, "deal": data.get("deal", data)}
    except Exception as e:
        raise HTTPException(502, f"Error al actualizar negocio: {e}")


@router.post("/deals/import-bulk")
def import_deals_bulk(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    deals = data.get("deals", [])
    group_name = (data.get("group_name") or "").strip()
    created = updated = skipped = 0
    for d in deals:
        try:
            rd_id = d.get("rd_id", "")
            name = (d.get("name") or "").strip()
            company = (d.get("company") or "").strip()
            custom_fields = (d.get("custom_fields") or "").strip()
            if not name:
                skipped += 1
                continue
            existing = None
            if rd_id:
                existing = db.query(Lead).filter(
                    Lead.tags.like(f"%rdstation:{rd_id}%"), Lead.user_id == current_user.id
                ).first()
            if existing:
                if group_name:
                    existing.group_name = group_name
                if company and not existing.company:
                    existing.company = company
                existing.tags = _set_rd_tag(existing.tags, rd_id)
                if custom_fields:
                    existing.custom_fields = custom_fields
                db.commit()
                updated += 1
            else:
                lead = Lead(
                    user_id=current_user.id,
                    name=name,
                    email=f"rd-{rd_id}@imported" if rd_id else f"deal-{name.lower().replace(' ','-')}@imported",
                    company=company,
                    group_name=group_name,
                    tags=f"rdstation:{rd_id}" if rd_id else "rdstation",
                    custom_fields=custom_fields,
                    status="active",
                    created_at=datetime.utcnow(),
                )
                db.add(lead)
                db.commit()
                created += 1
        except Exception:
            skipped += 1
    return {"ok": True, "created": created, "updated": updated, "skipped": skipped}


# ── Push / Sync ──────────────────────────────────────────────────────────────

@router.post("/leads/{lead_id}/push")
def push_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token de RD Station no configurado")

    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.user_id == current_user.id).first()
    if not lead:
        raise HTTPException(404, "Lead no encontrado")

    existing_rd_id = _extract_rd_id(lead.tags or "")
    try:
        if existing_rd_id:
            update_contact(token, existing_rd_id, name=lead.name, email=lead.email, phone=lead.phone or None)
            return {"ok": True, "action": "updated", "rd_id": existing_rd_id}
        else:
            result = create_contact(token, lead.name, email=lead.email or None, phone=lead.phone or None)
            rd_id = result.get("_id", "")
            lead.tags = _set_rd_tag(lead.tags, rd_id)
            db.commit()
            return {"ok": True, "action": "created", "rd_id": rd_id}
    except Exception as e:
        raise HTTPException(502, f"Error al enviar a RD Station: {e}")


# ── Meta ────────────────────────────────────────────────────────────────────

@router.get("/custom-fields")
def rd_custom_fields(
    entity: str = Query("contact"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        return {"custom_fields": get_custom_fields(token, entity)}
    except Exception as e:
        raise HTTPException(502, str(e))


@router.get("/users")
def rd_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token = _get_token(db, current_user.id)
    if not token:
        raise HTTPException(400, "Token no configurado")
    try:
        return {"users": get_users(token)}
    except Exception as e:
        raise HTTPException(502, str(e))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_phone(c: dict) -> str:
    phones = c.get("phones") or []
    if phones and isinstance(phones, list):
        return phones[0].get("phone", "") if isinstance(phones[0], dict) else str(phones[0])
    return c.get("phone", "")


def _extract_company(c: dict) -> str:
    org = c.get("organization") or {}
    if isinstance(org, dict):
        return org.get("name", "")
    return str(org) if org else ""
