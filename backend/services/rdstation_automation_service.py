from datetime import datetime, timedelta
import re
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import AppSetting, Lead, RdAutomation, Sequence, SequenceContact, SequenceStep, WhatsAppAccount
from services.rdstation_service import get_deal_contacts, list_deals, update_deal
from services.whatsapp_service import send_template_message, send_text_message

PROCESSED_KEY_PREFIX = "rdap_"  # rdap_{automation_id}:{deal_id}


def _to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on", "si", "s"}


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return default


def _get_setting(db: Session, user_id: int, key: str, default: str = "") -> str:
    row = db.query(AppSetting).filter(AppSetting.user_id == user_id, AppSetting.key == key).first()
    return (row.value or "") if (row and row.value is not None) else default


def _auto_out(auto: RdAutomation, db: Session) -> dict[str, Any]:
    rd_token = _get_setting(db, auto.user_id, "rdstation_token", "")
    return {
        "id": auto.id,
        "name": auto.name,
        "status": auto.status,
        "source_stage_id": auto.source_stage_id or "",
        "source_user_id": auto.source_user_id or "",
        "target_stage_id": auto.target_stage_id or "",
        "sequence_id": auto.sequence_id or 0,
        "wa_account_id": auto.wa_account_id or 0,
        "wa_template_name": auto.wa_template_name or "",
        "wa_template_language": auto.wa_template_language or "es_AR",
        "wa_text": auto.wa_text or "",
        "max_deals_per_run": auto.max_deals_per_run or 25,
        "created_at": auto.created_at.isoformat() if auto.created_at else None,
        "has_rd_token": bool(rd_token.strip()),
    }


# ── CRUD ──────────────────────────────────────────────────────────────────

def list_automations(db: Session, user_id: int) -> list[dict[str, Any]]:
    autos = (
        db.query(RdAutomation)
        .filter(RdAutomation.user_id == user_id)
        .order_by(RdAutomation.created_at.desc())
        .all()
    )
    return [_auto_out(a, db) for a in autos]


def get_automation(db: Session, user_id: int, automation_id: int) -> dict[str, Any]:
    auto = db.query(RdAutomation).filter(
        RdAutomation.id == automation_id, RdAutomation.user_id == user_id
    ).first()
    if not auto:
        raise HTTPException(404, "Automatización no encontrada")
    return _auto_out(auto, db)


def create_automation(db: Session, user_id: int, data: dict[str, Any]) -> dict[str, Any]:
    name = str(data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "El nombre es obligatorio")
    auto = RdAutomation(
        user_id=user_id,
        name=name,
        status="paused",
        source_stage_id=str(data.get("source_stage_id") or "").strip(),
        source_user_id=str(data.get("source_user_id") or "").strip(),
        target_stage_id=str(data.get("target_stage_id") or "").strip(),
        sequence_id=_to_int(data.get("sequence_id"), 0),
        wa_account_id=_to_int(data.get("wa_account_id"), 0),
        wa_template_name=str(data.get("wa_template_name") or "").strip(),
        wa_template_language=(str(data.get("wa_template_language") or "").strip() or "es_AR")[:20],
        wa_text=str(data.get("wa_text") or "").strip(),
        max_deals_per_run=min(max(_to_int(data.get("max_deals_per_run"), 25), 1), 500),
        created_at=datetime.utcnow(),
    )
    db.add(auto)
    db.commit()
    db.refresh(auto)
    return _auto_out(auto, db)


def update_automation(db: Session, user_id: int, automation_id: int, data: dict[str, Any]) -> dict[str, Any]:
    auto = db.query(RdAutomation).filter(
        RdAutomation.id == automation_id, RdAutomation.user_id == user_id
    ).first()
    if not auto:
        raise HTTPException(404, "Automatización no encontrada")
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(400, "El nombre es obligatorio")
        auto.name = name
    if "status" in data and data["status"] in ("active", "paused"):
        auto.status = data["status"]
    if "source_stage_id" in data:
        auto.source_stage_id = str(data["source_stage_id"] or "").strip()
    if "source_user_id" in data:
        auto.source_user_id = str(data["source_user_id"] or "").strip()
    if "target_stage_id" in data:
        auto.target_stage_id = str(data["target_stage_id"] or "").strip()
    if "sequence_id" in data:
        auto.sequence_id = _to_int(data["sequence_id"], 0)
    if "wa_account_id" in data:
        auto.wa_account_id = _to_int(data["wa_account_id"], 0)
    if "wa_template_name" in data:
        auto.wa_template_name = str(data["wa_template_name"] or "").strip()
    if "wa_template_language" in data:
        auto.wa_template_language = (str(data["wa_template_language"] or "").strip() or "es_AR")[:20]
    if "wa_text" in data:
        auto.wa_text = str(data["wa_text"] or "").strip()
    if "max_deals_per_run" in data:
        auto.max_deals_per_run = min(max(_to_int(data["max_deals_per_run"], 25), 1), 500)
    db.commit()
    db.refresh(auto)
    return _auto_out(auto, db)


def delete_automation(db: Session, user_id: int, automation_id: int) -> dict[str, Any]:
    auto = db.query(RdAutomation).filter(
        RdAutomation.id == automation_id, RdAutomation.user_id == user_id
    ).first()
    if not auto:
        raise HTTPException(404, "Automatización no encontrada")
    db.query(AppSetting).filter(
        AppSetting.user_id == user_id,
        AppSetting.key.like(f"{PROCESSED_KEY_PREFIX}{automation_id}:%"),
    ).delete(synchronize_session=False)
    db.delete(auto)
    db.commit()
    return {"ok": True}


def reset_automation_processed(
    db: Session, user_id: int, automation_id: int, deal_ids: Optional[list] = None
) -> dict[str, Any]:
    auto = db.query(RdAutomation).filter(
        RdAutomation.id == automation_id, RdAutomation.user_id == user_id
    ).first()
    if not auto:
        raise HTTPException(404, "Automatización no encontrada")
    q = db.query(AppSetting).filter(
        AppSetting.user_id == user_id,
        AppSetting.key.like(f"{PROCESSED_KEY_PREFIX}{automation_id}:%"),
    )
    if deal_ids:
        keys = [f"{PROCESSED_KEY_PREFIX}{automation_id}:{did}" for did in deal_ids]
        deleted = q.filter(AppSetting.key.in_(keys)).delete(synchronize_session=False)
    else:
        deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted}


# ── Internal helpers ───────────────────────────────────────────────────────

def _mark_processed(db: Session, user_id: int, automation_id: int, deal_id: str, status: str) -> None:
    key = f"{PROCESSED_KEY_PREFIX}{automation_id}:{deal_id}"
    row = db.query(AppSetting).filter(AppSetting.user_id == user_id, AppSetting.key == key).first()
    if row:
        row.value = status
    else:
        db.add(AppSetting(user_id=user_id, key=key, value=status))


def _processed_statuses(db: Session, user_id: int, automation_id: int, deal_ids: list[str]) -> set[str]:
    if not deal_ids:
        return set()
    keys = [f"{PROCESSED_KEY_PREFIX}{automation_id}:{deal_id}" for deal_id in deal_ids]
    rows = db.query(AppSetting.key).filter(
        AppSetting.user_id == user_id,
        AppSetting.key.in_(keys),
    ).all()
    prefix = f"{PROCESSED_KEY_PREFIX}{automation_id}:"
    return {str(row[0]).replace(prefix, "", 1) for row in rows if row and row[0]}


def _merge_tags(existing_tags: str, extra_tags: list[str]) -> str:
    tags = [t.strip() for t in (existing_tags or "").split(",") if t.strip()]
    seen = {t.lower() for t in tags}
    for t in extra_tags:
        tt = t.strip()
        if tt and tt.lower() not in seen:
            tags.append(tt)
            seen.add(tt.lower())
    return ",".join(tags)


def _extract_phone(contact: dict) -> str:
    phones = contact.get("phones") or []
    if isinstance(phones, list) and phones:
        p = phones[0]
        if isinstance(p, dict):
            return str(p.get("phone") or "").strip()
        return str(p).strip()
    return str(contact.get("phone") or contact.get("mobile_phone") or "").strip()


def _normalize_phone(raw_phone: str) -> str:
    digits = re.sub(r"[^\d]", "", raw_phone or "")
    if digits.startswith("55") and len(digits) == 12 and digits[4] in "6789":
        digits = digits[:4] + "9" + digits[4:]
    return digits


def _extract_company(contact: dict, deal: dict) -> str:
    org = contact.get("organization")
    if isinstance(org, dict) and org.get("name"):
        return str(org.get("name") or "").strip()
    if isinstance(org, str) and org.strip():
        return org.strip()
    return str(deal.get("organization_name") or deal.get("company_name") or "").strip()


def _find_lead_by_rd_tags(db: Session, user_id: int, rd_contact_id: str, rd_deal_id: str) -> Optional[Lead]:
    if rd_contact_id:
        lead = db.query(Lead).filter(
            Lead.user_id == user_id, Lead.tags.like(f"%rdstation:{rd_contact_id}%")
        ).first()
        if lead:
            return lead
    if rd_deal_id:
        lead = db.query(Lead).filter(
            Lead.user_id == user_id, Lead.tags.like(f"%rddeal:{rd_deal_id}%")
        ).first()
        if lead:
            return lead
    return None


def _upsert_lead_from_deal_contact(db: Session, user_id: int, deal: dict, contact: dict) -> Lead:
    rd_deal_id = str(deal.get("_id") or deal.get("id") or "").strip()
    rd_contact_id = str(contact.get("_id") or contact.get("id") or "").strip()
    name = str(contact.get("name") or deal.get("name") or "Lead RD").strip()
    email = str(contact.get("email") or "").strip().lower()
    phone = _extract_phone(contact)
    company = _extract_company(contact, deal)
    role = str(contact.get("title") or "").strip()
    lead = None
    if email:
        lead = db.query(Lead).filter(Lead.user_id == user_id, Lead.email == email).first()
    if not lead:
        lead = _find_lead_by_rd_tags(db, user_id, rd_contact_id, rd_deal_id)
    tags_to_add = ["rdstation"]
    if rd_contact_id:
        tags_to_add.append(f"rdstation:{rd_contact_id}")
    if rd_deal_id:
        tags_to_add.append(f"rddeal:{rd_deal_id}")
    if lead:
        if phone and not lead.phone:
            lead.phone = phone
        if company and not lead.company:
            lead.company = company
        if role and not lead.role:
            lead.role = role
        lead.tags = _merge_tags(lead.tags or "", tags_to_add)
        lead.updated_at = datetime.utcnow()
        db.commit()
        return lead
    lead = Lead(
        user_id=user_id,
        name=name or "Lead RD",
        email=email or f"rddeal-{rd_deal_id or 'unknown'}@imported",
        phone=phone, company=company, role=role,
        tags=",".join(tags_to_add), status="active", created_at=datetime.utcnow(),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def _enroll_lead_in_sequence(db: Session, user_id: int, sequence_id: int, lead_id: int) -> tuple[bool, str]:
    seq = db.query(Sequence).filter(Sequence.id == sequence_id, Sequence.user_id == user_id).first()
    if not seq:
        return False, "Secuencia no encontrada"
    first_step = db.query(SequenceStep).filter(
        SequenceStep.sequence_id == sequence_id, SequenceStep.step_number == 1
    ).first()
    if not first_step:
        return False, "La secuencia no tiene pasos"
    existing = db.query(SequenceContact).filter(
        SequenceContact.sequence_id == sequence_id, SequenceContact.lead_id == lead_id
    ).first()
    if existing:
        return True, "ya_enrollado"
    sc = SequenceContact(
        sequence_id=sequence_id, lead_id=lead_id, status="active", current_step=0,
        enrolled_at=datetime.utcnow(),
        next_send_at=datetime.utcnow() + timedelta(days=first_step.delay_days),
    )
    db.add(sc)
    db.commit()
    return True, "enrollado"


def _send_whatsapp_for_lead(
    db: Session, user_id: int, wa_account_id: int,
    wa_template_name: str, wa_template_language: str, wa_text: str, lead: Lead
) -> tuple[bool, str]:
    wa_acc = db.query(WhatsAppAccount).filter(
        WhatsAppAccount.id == wa_account_id, WhatsAppAccount.user_id == user_id
    ).first()
    if not wa_acc:
        return False, "Cuenta de WhatsApp no encontrada"
    to_phone = _normalize_phone(lead.phone or "")
    if not to_phone:
        return False, "Lead sin telefono"
    if wa_template_name:
        return send_template_message(
            wa_acc.phone_number_id, wa_acc.access_token, to_phone,
            wa_template_name, wa_template_language or "es_AR",
            [lead.name or "", lead.company or "", lead.role or ""],
        )
    if wa_text:
        personalized = wa_text.replace("{name}", lead.name or "").replace("{company}", lead.company or "")
        return send_text_message(wa_acc.phone_number_id, wa_acc.access_token, to_phone, personalized)
    return False, "No hay mensaje de WhatsApp configurado"


# ── Execution ──────────────────────────────────────────────────────────────

def run_automation(
    db: Session,
    auto: RdAutomation,
    dry_run: bool = False,
    max_deals_override: Optional[int] = None,
) -> dict[str, Any]:
    user_id = auto.user_id
    if auto.status != "active" and not dry_run:
        return {"ok": True, "status": "paused", "processed": 0, "results": []}
    rd_token = _get_setting(db, user_id, "rdstation_token", "")
    if not rd_token.strip():
        return {"ok": False, "status": "error", "error": "Token RD no configurado", "processed": 0, "results": []}
    if not (auto.source_stage_id or "").strip():
        return {"ok": False, "status": "error", "error": "Falta etapa origen", "processed": 0, "results": []}

    max_deals = max_deals_override if max_deals_override is not None else (auto.max_deals_per_run or 25)
    max_deals = min(max(_to_int(max_deals, 25), 1), 500)
    source_user_id = str(auto.source_user_id or "").strip() or None
    page_limit = max(3, min(20, (max_deals // 200) + 3))
    page_size = 200

    results: list[dict[str, Any]] = []
    processed = failed = skipped = attempted = 0
    considered = 0
    pages_scanned = 0

    for page in range(1, page_limit + 1):
        if attempted >= max_deals:
            break
        data = list_deals(
            rd_token,
            page=page,
            limit=page_size,
            stage_id=auto.source_stage_id,
            user_id=source_user_id,
        )
        page_deals = data.get("deals", []) if isinstance(data, dict) else []
        if not page_deals:
            break
        pages_scanned += 1
        considered += len(page_deals)
        deal_ids = [
            str(deal.get("_id") or deal.get("id") or "").strip()
            for deal in page_deals
            if str(deal.get("_id") or deal.get("id") or "").strip()
        ]
        processed_ids = _processed_statuses(db, user_id, auto.id, deal_ids)

        for deal in page_deals:
            if attempted >= max_deals:
                continue
            deal_id = str(deal.get("_id") or deal.get("id") or "").strip()
            deal_name = str(deal.get("name") or "").strip()
            if not deal_id:
                continue
            if deal_id in processed_ids:
                skipped += 1
                continue
            item: dict[str, Any] = {"deal_id": deal_id, "deal_name": deal_name}
            attempted += 1
            if dry_run:
                item["status"] = "candidate"
                results.append(item)
                continue
            try:
                dc = get_deal_contacts(rd_token, deal_id)
                contacts = dc.get("contacts", dc) if isinstance(dc, dict) else dc
                if not isinstance(contacts, list) or not contacts:
                    item.update({"status": "failed", "error": "Negocio sin contactos"})
                    results.append(item)
                    failed += 1
                    continue
                lead = _upsert_lead_from_deal_contact(db, user_id, deal, contacts[0])
                item["lead_id"] = lead.id
                if (auto.sequence_id or 0) > 0:
                    ok_e, e_msg = _enroll_lead_in_sequence(db, user_id, auto.sequence_id, lead.id)
                    item["sequence"] = e_msg
                    if not ok_e:
                        item.update({"status": "failed", "error": e_msg})
                        results.append(item)
                        failed += 1
                        continue
                else:
                    item["sequence"] = "omitido"
                if (auto.wa_account_id or 0) > 0:
                    ok_wa, wa_msg = _send_whatsapp_for_lead(
                        db, user_id, auto.wa_account_id,
                        auto.wa_template_name or "", auto.wa_template_language or "es_AR",
                        auto.wa_text or "", lead,
                    )
                    item["whatsapp"] = "sent" if ok_wa else f"error:{wa_msg}"
                    if not ok_wa:
                        item.update({"status": "failed", "error": wa_msg})
                        results.append(item)
                        failed += 1
                        continue
                else:
                    item["whatsapp"] = "omitido"
                if auto.target_stage_id:
                    update_deal(rd_token, deal_id, deal_stage_id=auto.target_stage_id)
                    item["stage_move"] = "ok"
                else:
                    item["stage_move"] = "omitido"
                _mark_processed(db, user_id, auto.id, deal_id, "done")
                db.commit()
                item["status"] = "ok"
                results.append(item)
                processed += 1
            except Exception as e:
                item.update({"status": "failed", "error": str(e)})
                results.append(item)
                failed += 1

        if data.get("has_more") is False:
            break

    return {
        "ok": True, "status": "ok", "dry_run": dry_run,
        "attempted": attempted, "processed": processed, "failed": failed,
        "skipped_processed": skipped, "considered_total": considered,
        "pages_scanned": pages_scanned, "page_limit": page_limit,
        "results": results,
    }


def run_automation_for_enabled_users(db: Session) -> dict[str, Any]:
    autos = db.query(RdAutomation).filter(RdAutomation.status == "active").all()
    total = processed_count = 0
    errors: list[dict] = []
    for auto in autos:
        total += 1
        try:
            out = run_automation(db, auto, dry_run=False)
            if out.get("ok"):
                processed_count += int(out.get("processed", 0) or 0)
            else:
                errors.append({"automation_id": auto.id, "error": out.get("error", "error")})
        except Exception as e:
            errors.append({"automation_id": auto.id, "error": str(e)})
    return {"ok": True, "automations_enabled": total, "total_processed": processed_count, "errors": errors}
