from datetime import datetime, timedelta
import secrets
import os
from sqlalchemy.orm import Session
from models import Sequence, SequenceStep, SequenceContact, SequenceLog, Lead, AppSetting, EmailAccount
from services.ai_service import generate_personalized_email, simple_personalize
from services.smtp_service import send_email, get_smtp_settings, is_api_transport_enabled


def _get_setting(db, key: str, default: str, user_id: int = None) -> str:
    if user_id:
        s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == user_id).first()
        if s and s.value:
            return s.value
    s = db.query(AppSetting).filter(AppSetting.key == key).first()
    return s.value if s and s.value else default


def _seq_within_window(seq) -> bool:
    tz_str = seq.send_timezone or "America/Buenos_Aires"
    hour_start = seq.send_hour_start if seq.send_hour_start is not None else 8
    hour_end = seq.send_hour_end if seq.send_hour_end is not None else 19
    send_days = [int(d) for d in (seq.send_days or "1,2,3,4,5").split(",") if d.strip()]
    try:
        from pytz import timezone as pytz_tz
        now_local = datetime.now(pytz_tz(tz_str))
        if not (hour_start <= now_local.hour < hour_end):
            return False
        # weekday(): Mon=0..Sun=6 → ISO Mon=1..Sun=7
        if (now_local.weekday() + 1) not in send_days:
            return False
        return True
    except Exception:
        return True


def _daily_sent_for_seq(sequence_id: int, db, tz_str: str = "UTC") -> int:
    try:
        from pytz import timezone as pytz_tz
        tz = pytz_tz(tz_str)
        now_local = datetime.now(tz)
        today_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_local.astimezone(pytz_tz("UTC")).replace(tzinfo=None)
    except Exception:
        today_start_utc = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(SequenceLog).filter(
        SequenceLog.sequence_id == sequence_id,
        SequenceLog.sent_at >= today_start_utc,
        SequenceLog.status == "sent",
    ).count()


def process_all_sequences(db: Session) -> int:
    sequences = db.query(Sequence).filter(Sequence.status == "active").all()
    total = 0
    for seq in sequences:
        if getattr(seq, "send_mode", "automatic") == "manual":
            continue
        if not _seq_within_window(seq):
            continue
        limit = seq.daily_limit or 50
        sent_today = _daily_sent_for_seq(seq.id, db, seq.send_timezone or "UTC")
        remaining = limit - sent_today
        if remaining <= 0:
            continue
        total += process_sequence(seq.id, db, max_send=remaining)
    return total


def process_sequence(sequence_id: int, db: Session, max_send: int = 9999) -> int:
    now = datetime.utcnow()

    sequence = db.query(Sequence).filter(Sequence.id == sequence_id).first()
    if not sequence:
        return 0

    uid = getattr(sequence, "user_id", None)
    api_key = _get_setting(db, "anthropic_api_key", "", uid)
    if api_key:
        os.environ["ANTHROPIC_API_KEY"] = api_key

    contacts = (
        db.query(SequenceContact)
        .filter(
            SequenceContact.sequence_id == sequence_id,
            SequenceContact.status == "active",
            SequenceContact.next_send_at <= now,
        )
        .all()
    )

    seq_type = getattr(sequence, "type", "email") or "email"

    # ── WhatsApp sequences ────────────────────────────────────────────────
    if seq_type == "whatsapp":
        from models import WhatsAppAccount
        from services.whatsapp_service import send_template_message

        wa_acc = None
        if getattr(sequence, "wa_account_id", None):
            wa_acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == sequence.wa_account_id).first()
        if not wa_acc:
            return 0

        processed = 0
        for contact in contacts:
            if processed >= max_send:
                break

            next_step_number = contact.current_step + 1
            step = db.query(SequenceStep).filter(
                SequenceStep.sequence_id == sequence_id,
                SequenceStep.step_number == next_step_number,
            ).first()

            if not step:
                contact.status = "completed"
                contact.completed_at = now
                db.commit()
                continue

            lead = db.query(Lead).filter(Lead.id == contact.lead_id).first()
            if not lead or not lead.phone:
                contact.status = "completed"
                db.commit()
                continue

            template_name = step.wa_template_name or ""
            if not template_name:
                continue

            var_count = getattr(step, "wa_var_count", 0) or 0
            all_vars = [lead.name or "", lead.company or "", lead.role or ""]
            variables = all_vars[:var_count] if var_count > 0 else []

            import re as _re
            digits = _re.sub(r"[^\d]", "", lead.phone or "")
            # Brazil: 8-digit local mobile → insert leading 9
            if digits.startswith("55") and len(digits) == 12 and digits[4] in "6789":
                digits = digits[:4] + "9" + digits[4:]
            ok, result_msg = send_template_message(
                wa_acc.phone_number_id,
                wa_acc.access_token,
                digits,
                template_name,
                step.wa_template_language or "es_AR",
                variables,
            )

            log = SequenceLog(
                sequence_id=sequence_id,
                step_id=step.id,
                contact_id=contact.id,
                lead_id=contact.lead_id,
                to_email=f"whatsapp:{digits}",
                subject=f"[WA] {template_name}",
                body=f"Template: {template_name} | Vars: {variables}",
                status="sent" if ok else "failed",
                open_token=secrets.token_hex(32),
                click_token=secrets.token_hex(32),
                sent_at=now if ok else None,
                error_message="" if ok else result_msg,
                wamid=result_msg if ok else "",
            )
            db.add(log)

            if ok:
                contact.current_step = next_step_number
                next_step = db.query(SequenceStep).filter(
                    SequenceStep.sequence_id == sequence_id,
                    SequenceStep.step_number == next_step_number + 1,
                ).first()
                if next_step:
                    contact.next_send_at = now + timedelta(days=next_step.delay_days)
                else:
                    contact.status = "completed"
                    contact.completed_at = now

            db.commit()
            processed += 1

        return processed

    # ── Email sequences ───────────────────────────────────────────────────
    base_url = _get_setting(db, "base_url", os.getenv("BASE_URL", "http://localhost:8000"), uid)

    api_mode = is_api_transport_enabled()
    acc = None
    if getattr(sequence, "email_account_id", None):
        acc = db.query(EmailAccount).filter(EmailAccount.id == sequence.email_account_id).first()

    if acc:
        smtp_user = acc.smtp_user or acc.from_email or ""
        smtp_password = acc.smtp_password or ""
        from_name = acc.from_name
        from_email = acc.from_email
        provider = acc.provider
        raw_host = acc.smtp_host or ""
        raw_port = acc.smtp_port or 587
    else:
        if (not api_mode) and (not sequence.smtp_user or not sequence.smtp_password):
            return 0
        smtp_user = sequence.smtp_user or sequence.from_email or ""
        smtp_password = sequence.smtp_password or ""
        from_name = sequence.from_name
        from_email = sequence.from_email
        provider = sequence.provider
        raw_host = sequence.smtp_host or ""
        raw_port = sequence.smtp_port or 587

    smtp_host, smtp_port, use_ssl = get_smtp_settings(provider, raw_host, raw_port)

    processed = 0
    for contact in contacts:
        if processed >= max_send:
            break

        next_step_number = contact.current_step + 1
        step = (
            db.query(SequenceStep)
            .filter(
                SequenceStep.sequence_id == sequence_id,
                SequenceStep.step_number == next_step_number,
            )
            .first()
        )

        if not step:
            contact.status = "completed"
            contact.completed_at = now
            db.commit()
            continue

        lead = db.query(Lead).filter(Lead.id == contact.lead_id).first()
        if not lead:
            contact.status = "completed"
            db.commit()
            continue

        try:
            if step.use_ai and os.getenv("ANTHROPIC_API_KEY"):
                result = generate_personalized_email(
                    step.subject_template, step.body_template,
                    lead.name, lead.company, lead.role, step.ai_instructions,
                )
            else:
                result = simple_personalize(
                    step.subject_template, step.body_template,
                    lead.name, lead.company, lead.role,
                )
        except Exception:
            result = {"subject": step.subject_template, "body": step.body_template}

        open_token = secrets.token_hex(32)
        click_token = secrets.token_hex(32)
        tracking_pixel_url = f"{base_url}/track/open/{open_token}"

        ok, error_msg = send_email(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            from_name=from_name,
            from_email=from_email,
            to_email=lead.email,
            subject=result["subject"],
            html_body=result["body"],
            tracking_pixel_url=tracking_pixel_url,
            click_token=click_token,
            base_url=base_url,
            use_ssl=use_ssl,
        )

        log = SequenceLog(
            sequence_id=sequence_id,
            step_id=step.id,
            contact_id=contact.id,
            lead_id=contact.lead_id,
            to_email=lead.email,
            subject=result["subject"],
            body=result["body"],
            status="sent" if ok else "failed",
            open_token=open_token,
            click_token=click_token,
            sent_at=now if ok else None,
            error_message="" if ok else error_msg,
        )
        db.add(log)

        if ok:
            contact.current_step = next_step_number
            next_step = (
                db.query(SequenceStep)
                .filter(
                    SequenceStep.sequence_id == sequence_id,
                    SequenceStep.step_number == next_step_number + 1,
                )
                .first()
            )
            if next_step:
                contact.next_send_at = now + timedelta(days=next_step.delay_days)
            else:
                contact.status = "completed"
                contact.completed_at = now

        db.commit()
        processed += 1

    return processed
