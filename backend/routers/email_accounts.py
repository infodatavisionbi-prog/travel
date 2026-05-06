from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import EmailAccount, User
from dependencies import get_current_user
from services.smtp_service import (
    get_smtp_settings,
    send_email,
    get_email_transport_mode,
    is_api_transport_enabled,
)
from services.imap_service import fetch_inbox, fetch_folder, fetch_message_body, test_imap

router = APIRouter(prefix="/email-accounts", tags=["email-accounts"])


def _out(a: EmailAccount) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "from_name": a.from_name,
        "from_email": a.from_email,
        "provider": a.provider,
        "smtp_host": a.smtp_host,
        "smtp_port": a.smtp_port,
        "smtp_user": a.smtp_user,
        "imap_host": a.imap_host,
        "imap_port": a.imap_port,
        "created_at": a.created_at.isoformat() if a.created_at else "",
    }


@router.get("/runtime")
def runtime_mode(current_user: User = Depends(get_current_user)):
    mode = get_email_transport_mode()
    return {"mode": mode, "api_enabled": mode == "api"}


@router.get("")
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accs = db.query(EmailAccount).filter(EmailAccount.user_id == current_user.id).order_by(EmailAccount.id).all()
    return [_out(a) for a in accs]


@router.post("")
def create_account(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = (data.get("name") or "").strip()
    from_email = (data.get("from_email") or "").strip()
    smtp_user = (data.get("smtp_user") or "").strip()
    smtp_password = data.get("smtp_password") or ""
    api_mode = is_api_transport_enabled()

    if not name or not from_email:
        raise HTTPException(400, "Nombre y email remitente son requeridos")
    if not api_mode and (not smtp_user or not smtp_password):
        raise HTTPException(400, "Usuario y contrasena SMTP son requeridos")
    if api_mode and not smtp_user:
        smtp_user = from_email

    acc = EmailAccount(
        user_id=current_user.id,
        name=name,
        from_name=(data.get("from_name") or "").strip(),
        from_email=from_email,
        provider=data.get("provider", "hostinger"),
        smtp_host=data.get("smtp_host", ""),
        smtp_port=int(data.get("smtp_port", 587)),
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        imap_host=data.get("imap_host", ""),
        imap_port=int(data.get("imap_port", 993)),
        imap_password=data.get("imap_password", ""),
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _out(acc)


@router.put("/{acc_id}")
def update_account(acc_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    fields = ["name", "from_name", "from_email", "provider", "smtp_host", "smtp_port", "smtp_user", "imap_host", "imap_port"]
    for k in fields:
        if k in data:
            setattr(acc, k, data[k])
    if "smtp_password" in data and data["smtp_password"]:
        acc.smtp_password = data["smtp_password"]
    if "imap_password" in data:
        acc.imap_password = data["imap_password"] or ""
    if is_api_transport_enabled() and not (acc.smtp_user or "").strip():
        acc.smtp_user = acc.from_email or "api-user"
    db.commit()
    db.refresh(acc)
    return _out(acc)


@router.delete("/{acc_id}")
def delete_account(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    db.delete(acc)
    db.commit()
    return {"ok": True}


@router.post("/{acc_id}/test-smtp")
def test_smtp(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")

    mode = get_email_transport_mode()
    if mode == "smtp" and (not acc.smtp_user or not acc.smtp_password):
        raise HTTPException(400, "La cuenta no tiene usuario/contrasena SMTP")

    smtp_host, smtp_port, use_ssl = get_smtp_settings(acc.provider, acc.smtp_host or "", acc.smtp_port or 587)
    to_email = (acc.from_email or acc.smtp_user or "").strip()
    if not to_email:
        raise HTTPException(400, "La cuenta no tiene un email valido para prueba")

    ok, msg = send_email(
        smtp_host=smtp_host, smtp_port=smtp_port,
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        from_name=acc.from_name or acc.smtp_user or acc.from_email,
        from_email=acc.from_email or acc.smtp_user,
        to_email=to_email,
        subject=("DataVision - Test API" if mode == "api" else "DataVision - Test SMTP"),
        html_body="Conexion de envio verificada correctamente desde DataVision.",
        use_ssl=use_ssl,
        transport_mode=mode,
    )

    if mode == "api":
        return {"ok": ok, "message": msg or "Conexion API exitosa", "mode": mode}
    return {"ok": ok, "message": msg or "Conexion SMTP exitosa", "host": smtp_host, "port": smtp_port, "ssl": use_ssl, "mode": mode}


@router.post("/{acc_id}/test-imap")
def test_imap_route(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    ok, msg = test_imap(
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        provider=acc.provider, imap_host=acc.imap_host or "", imap_port=acc.imap_port or 993,
        imap_password=acc.imap_password or "",
    )
    return {"ok": ok, "message": msg or "Conexion IMAP exitosa"}


@router.get("/{acc_id}/inbox")
def get_account_inbox(acc_id: int, limit: int = 50, folder: str = "inbox",
                      db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    emails, error = fetch_folder(
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        provider=acc.provider, imap_host=acc.imap_host or "",
        imap_port=acc.imap_port or 993, folder_slot=folder, limit=limit,
        imap_password=acc.imap_password or "",
    )
    return {"account": _out(acc), "emails": emails, "error": error}


@router.get("/{acc_id}/leads-activity")
def get_leads_activity(acc_id: int, limit: int = 100,
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models import Lead
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    emails, error = fetch_folder(
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        provider=acc.provider, imap_host=acc.imap_host or "",
        imap_port=acc.imap_port or 993, folder_slot="inbox", limit=limit,
        imap_password=acc.imap_password or "",
    )
    lead_emails = {l.email.lower() for l in db.query(Lead).filter(Lead.user_id == current_user.id).all()}

    def _extract_email(addr: str) -> str:
        import re
        m = re.search(r'[\w.+-]+@[\w.-]+\.\w+', addr)
        return m.group(0).lower() if m else addr.lower()

    filtered = [e for e in emails if _extract_email(e.get("from", "")) in lead_emails]
    return {"emails": filtered, "error": error, "total": len(filtered)}


@router.get("/{acc_id}/message/{msg_id}")
def get_message_body(acc_id: int, msg_id: str, folder: str = "inbox",
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    body, is_html, error = fetch_message_body(
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        provider=acc.provider, imap_host=acc.imap_host or "",
        imap_port=acc.imap_port or 993, folder_slot=folder, msg_id=msg_id,
        imap_password=acc.imap_password or "",
    )
    return {"body": body, "is_html": is_html, "error": error}


@router.post("/{acc_id}/reply")
def reply_email(acc_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(EmailAccount).filter(EmailAccount.id == acc_id, EmailAccount.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    smtp_host, smtp_port, use_ssl = get_smtp_settings(acc.provider, acc.smtp_host or "", acc.smtp_port or 587)
    ok, msg = send_email(
        smtp_host=smtp_host, smtp_port=smtp_port,
        smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
        from_name=acc.from_name, from_email=acc.from_email,
        to_email=data.get("to", ""),
        subject=data.get("subject", ""),
        html_body=data.get("body", ""),
        use_ssl=use_ssl,
    )
    if not ok:
        raise HTTPException(500, msg)
    return {"ok": True}


@router.get("/inbox/unified")
def get_unified_inbox(limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accs = db.query(EmailAccount).filter(EmailAccount.user_id == current_user.id).all()
    if not accs:
        return {"emails": []}
    per_account = max(limit // len(accs), 20)
    all_emails = []
    errors = []
    for acc in accs:
        emails, error = fetch_inbox(
            smtp_user=acc.smtp_user, smtp_password=acc.smtp_password,
            provider=acc.provider, imap_host=acc.imap_host or "",
            imap_port=acc.imap_port or 993, limit=per_account,
            imap_password=acc.imap_password or "",
        )
        if error:
            errors.append(f"{acc.name}: {error}")
        for e in emails:
            e["account_id"] = acc.id
            e["account_name"] = acc.name
            e["account_email"] = acc.from_email
        all_emails.extend(emails)
    return {"emails": all_emails, "errors": errors}
