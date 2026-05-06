import imaplib
import email
import time
from email.header import decode_header as _decode_header


IMAP_PROVIDER = {
    "gmail":   {"host": "imap.gmail.com",        "port": 993},
    "outlook": {"host": "outlook.office365.com", "port": 993},
    "hotmail": {"host": "outlook.office365.com", "port": 993},
}

FOLDER_CANDIDATES = {
    "inbox":  ["INBOX"],
    "sent":   ["Sent", "Sent Items", "Sent Messages", "[Gmail]/Sent Mail", "INBOX.Sent"],
    "drafts": ["Drafts", "Draft", "[Gmail]/Drafts", "INBOX.Drafts"],
    "spam":   ["Spam", "Junk", "Junk Email", "[Gmail]/Spam", "INBOX.Spam"],
    "trash":  ["Trash", "Deleted Items", "Deleted Messages", "[Gmail]/Trash", "INBOX.Trash"],
}

# In-memory cache: key → (timestamp, data)
_CACHE: dict = {}
_CACHE_TTL = 90  # seconds


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, data):
    _CACHE[key] = (time.time(), data)
    # Evict old entries to avoid unbounded growth
    if len(_CACHE) > 200:
        cutoff = time.time() - _CACHE_TTL
        stale = [k for k, (ts, _) in _CACHE.items() if ts < cutoff]
        for k in stale:
            _CACHE.pop(k, None)


def _get_imap_host(provider: str, custom_host: str = "") -> tuple[str, int]:
    if custom_host:
        if ":" in custom_host:
            parts = custom_host.rsplit(":", 1)
            try:
                return parts[0].strip(), int(parts[1].strip())
            except ValueError:
                return parts[0].strip(), 993
        return custom_host.strip(), 993
    cfg = IMAP_PROVIDER.get(provider)
    if cfg:
        return cfg["host"], cfg["port"]
    return "", 993


def _decode(value) -> str:
    if value is None:
        return ""
    parts = _decode_header(value)
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            try:
                out.append(part.decode(charset or "utf-8", errors="replace"))
            except Exception:
                out.append(part.decode("latin-1", errors="replace"))
        else:
            out.append(str(part))
    return "".join(out)


def _body(msg) -> tuple[str, bool]:
    html_part = plain_part = None
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            if ct == "text/plain" and plain_part is None:
                plain_part = part
            elif ct == "text/html" and html_part is None:
                html_part = part
    else:
        ct = msg.get_content_type()
        if ct == "text/html":
            html_part = msg
        else:
            plain_part = msg

    target = plain_part or html_part
    is_html = target is html_part and html_part is not None
    if target is None:
        return "", False
    try:
        charset = target.get_content_charset() or "utf-8"
        raw = target.get_payload(decode=True)
        if raw is None:
            return str(target.get_payload()), is_html
        return raw.decode(charset, errors="replace"), is_html
    except Exception:
        return "", False


def _resolve_folder(mail: imaplib.IMAP4_SSL, slot: str) -> str | None:
    candidates = FOLDER_CANDIDATES.get(slot, [slot])
    for name in candidates:
        try:
            status, _ = mail.select(f'"{name}"', readonly=True)
            if status == "OK":
                return name
        except Exception:
            continue
    return None


def _connect(smtp_user: str, smtp_password: str, provider: str,
             imap_host: str, imap_port: int, imap_password: str = "") -> tuple:
    host, port = _get_imap_host(provider, imap_host)
    if not host:
        return None, f"No se encontró servidor IMAP para '{provider}'. Configurá el host manualmente."
    use_port = imap_port or port
    password = imap_password.strip() if imap_password and imap_password.strip() else smtp_password
    try:
        mail = imaplib.IMAP4_SSL(host, use_port, timeout=15)
    except Exception as e:
        return None, f"No se pudo conectar a {host}:{use_port} — {e}"
    try:
        mail.login(smtp_user, password)
        return mail, None
    except imaplib.IMAP4.error as e:
        err_str = str(e)
        is_outlook = host in ("outlook.office365.com", "imap-mail.outlook.com")
        if is_outlook and ("LOGIN failed" in err_str or "AUTHENTICATE" in err_str or "authentication" in err_str.lower()):
            return None, (
                "Autenticación fallida en Outlook. Soluciones: "
                "1) Habilitá IMAP en Outlook → Configuración → Correo → Sincronizar correo → POP e IMAP. "
                "2) Si tenés verificación en dos pasos, generá una contraseña de aplicación en account.microsoft.com/security y usala como Contraseña IMAP."
            )
        return None, f"Error de autenticación IMAP — {e}"
    except Exception as e:
        return None, f"Error de login IMAP — {e}"


def _fetch_headers_only(mail: imaplib.IMAP4_SSL, limit: int) -> list:
    """Fetch only From/To/Subject/Date/Message-ID — much faster than full RFC822."""
    _, data = mail.search(None, "ALL")
    ids = data[0].split() if data[0] else []
    recent = list(reversed(ids[-limit:]))
    if not recent:
        return []

    # Batch-fetch all headers in a single IMAP round-trip
    id_set = b",".join(recent)
    _, raw_data = mail.fetch(id_set, "(BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])")

    results = []
    for i, chunk in enumerate(raw_data):
        if not isinstance(chunk, tuple) or len(chunk) < 2:
            continue
        try:
            msg = email.message_from_bytes(chunk[1])
            uid = recent[i // 2] if i // 2 < len(recent) else recent[-1]
            results.append({
                "id": uid.decode() if isinstance(uid, bytes) else str(uid),
                "message_id": msg.get("Message-ID", ""),
                "from": _decode(msg.get("From", "")),
                "to": _decode(msg.get("To", "")),
                "subject": _decode(msg.get("Subject", "(sin asunto)")),
                "date": msg.get("Date", ""),
                "body": "",
                "is_html": False,
            })
        except Exception:
            continue
    return results


def _fetch_single_body(mail: imaplib.IMAP4_SSL, msg_id: str) -> tuple[str, bool]:
    """Fetch full body of one message by IMAP sequence number."""
    _, raw_data = mail.fetch(msg_id, "(RFC822)")
    if not raw_data or not raw_data[0]:
        return "", False
    raw = raw_data[0][1]
    msg = email.message_from_bytes(raw)
    body, is_html = _body(msg)
    return body[:8000], is_html


def fetch_folder(smtp_user: str, smtp_password: str, provider: str,
                 imap_host: str = "", imap_port: int = 993,
                 folder_slot: str = "inbox", limit: int = 50,
                 imap_password: str = "") -> tuple:
    cache_key = f"{smtp_user}:{folder_slot}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached, None

    mail, err = _connect(smtp_user, smtp_password, provider, imap_host, imap_port, imap_password)
    if err:
        return [], err
    try:
        folder_name = _resolve_folder(mail, folder_slot)
        if not folder_name:
            mail.logout()
            return [], f"No se encontró la carpeta '{folder_slot}' en este servidor."
        mail.select(f'"{folder_name}"', readonly=True)
        results = _fetch_headers_only(mail, limit)
        mail.close()
        mail.logout()
        _cache_set(cache_key, results)
        return results, None
    except Exception as e:
        return [], f"Error al leer carpeta — {e}"


def fetch_message_body(smtp_user: str, smtp_password: str, provider: str,
                       imap_host: str = "", imap_port: int = 993,
                       folder_slot: str = "inbox", msg_id: str = "",
                       imap_password: str = "") -> tuple[str, bool, str]:
    """Returns (body, is_html, error). Called when user opens a specific email."""
    mail, err = _connect(smtp_user, smtp_password, provider, imap_host, imap_port, imap_password)
    if err:
        return "", False, err
    try:
        folder_name = _resolve_folder(mail, folder_slot)
        if not folder_name:
            mail.logout()
            return "", False, f"Carpeta '{folder_slot}' no encontrada."
        mail.select(f'"{folder_name}"', readonly=True)
        body, is_html = _fetch_single_body(mail, msg_id)
        mail.close()
        mail.logout()
        return body, is_html, ""
    except Exception as e:
        return "", False, str(e)


def fetch_inbox(smtp_user: str, smtp_password: str, provider: str,
                imap_host: str = "", imap_port: int = 993, limit: int = 50,
                imap_password: str = "") -> tuple:
    return fetch_folder(smtp_user, smtp_password, provider, imap_host, imap_port, "inbox", limit, imap_password)


def test_imap(smtp_user: str, smtp_password: str, provider: str,
              imap_host: str = "", imap_port: int = 993,
              imap_password: str = "") -> tuple[bool, str]:
    mail, err = _connect(smtp_user, smtp_password, provider, imap_host, imap_port, imap_password)
    if err:
        return False, err
    mail.logout()
    return True, ""
