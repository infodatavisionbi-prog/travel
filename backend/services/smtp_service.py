import smtplib
import ssl
import re
import socket
import uuid
import os
import html
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from typing import Optional
from urllib.parse import quote
import requests


def _resolve_ipv4(host: str, port: int) -> str:
    """Return an IPv4 address for host to avoid broken IPv6 routes on some hosts."""
    try:
        results = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        if results:
            return results[0][4][0]
    except Exception:
        pass
    return host


PROVIDER_SETTINGS = {
    "gmail": {"host": "smtp.gmail.com", "port": 587, "ssl": False},
    "outlook": {"host": "smtp-mail.outlook.com", "port": 587, "ssl": False},
    "hotmail": {"host": "smtp-mail.outlook.com", "port": 587, "ssl": False},
    "hostinger": {"host": "smtp.hostinger.com", "port": 587, "ssl": False},
}


def _get_transport_mode(transport_mode: str = "auto") -> str:
    mode = (transport_mode or "auto").strip().lower()
    if mode in ("smtp", "api"):
        return mode
    env_mode = os.getenv("EMAIL_TRANSPORT_MODE", "smtp").strip().lower()
    return "api" if env_mode == "api" else "smtp"


def get_email_transport_mode() -> str:
    return _get_transport_mode("auto")


def is_api_transport_enabled() -> bool:
    return get_email_transport_mode() == "api"


def _send_via_email_api(
    from_name: str,
    from_email: str,
    to_email: str,
    subject: str,
    plain_body: str,
    html_body: str,
) -> tuple[bool, str]:
    provider = os.getenv("EMAIL_API_PROVIDER", "resend").strip().lower()
    if provider != "resend":
        return False, f"Proveedor API no soportado: {provider}"

    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        return False, "RESEND_API_KEY no configurada."

    sender = os.getenv("RESEND_FROM", "").strip() or f"{from_name} <{from_email}>"
    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": plain_body,
    }
    if from_email:
        payload["reply_to"] = from_email

    try:
        timeout_s = int(os.getenv("EMAIL_API_TIMEOUT_SECONDS", "20"))
    except ValueError:
        timeout_s = 20

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout_s,
        )
    except requests.RequestException as e:
        return False, f"No se pudo enviar por API: {str(e)}"

    if response.status_code >= 400:
        detail = response.text.strip()
        if len(detail) > 400:
            detail = detail[:400] + "..."
        return False, f"Error API ({response.status_code}): {detail}"

    return True, ""


def wrap_tracking_links(text: str, click_token: str, base_url: str) -> str:
    base = base_url.rstrip('/')
    tracking_prefix = f"{base}/track/"

    def replace_url(m):
        original = m.group(0)
        if 'localhost' in original or original.startswith(tracking_prefix):
            return original
        encoded = quote(original, safe='')
        return f'{base}/track/click/{click_token}?url={encoded}'
    # Match plain-text URLs (http:// and https://)
    return re.sub(r'https?://[^\s\)\]\>\"\']+', replace_url, text)


def _tracking_url(original: str, click_token: Optional[str], base_url: str) -> str:
    if not click_token or not base_url or 'localhost' in base_url or 'localhost' in original:
        return original
    base = base_url.rstrip('/')
    tracking_prefix = f"{base}/track/"
    if original.startswith(tracking_prefix):
        return original
    encoded = quote(original, safe='')
    return f'{base}/track/click/{click_token}?url={encoded}'


def _linkify_plain_urls_preserving_anchors(text: str, click_token: Optional[str] = None, base_url: str = "") -> str:
    anchor_re = re.compile(r'(<a\b[^>]*>.*?</a>)', flags=re.IGNORECASE | re.DOTALL)
    url_re = re.compile(r'(https?://[^\s\)<>\"\'\&]+)')
    parts = anchor_re.split(text)
    out = []
    for part in parts:
        if not part:
            continue
        if anchor_re.fullmatch(part):
            out.append(part)
        else:
            out.append(url_re.sub(
                lambda m: (
                    f'<a href="{html.escape(_tracking_url(html.unescape(m.group(1)), click_token, base_url), quote=True)}" '
                    f'style="color:#0b57d0;text-decoration:underline">{m.group(1)}</a>'
                ),
                part,
            ))
    return "".join(out)


def build_plain_email(
    body: str,
    tracking_pixel_url: Optional[str] = None,
    click_token: Optional[str] = None,
    base_url: str = "",
) -> str:
    """Build a minimal plain-text-looking HTML email (no tables, no CSS styling)."""
    safe = body.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    safe = safe.replace('\n', '<br>\n')
    # Convert markdown-style links [text](url) to <a> tags (before plain URL pass)
    safe = re.sub(
        r'\[([^\]]+)\]\((https?://[^\s\)]+)\)',
        lambda m: (
            f'<a href="{html.escape(_tracking_url(html.unescape(m.group(2)), click_token, base_url), quote=True)}" '
            f'style="color:#0b57d0;text-decoration:underline">{m.group(1)}</a>'
        ),
        safe,
    )
    # Convert remaining plain-text URLs to clickable <a> tags
    safe = _linkify_plain_urls_preserving_anchors(safe, click_token, base_url)

    pixel = ""
    if tracking_pixel_url:
        pixel = (
            f'<img src="{tracking_pixel_url}" width="1" height="1" '
            f'border="0" alt="" style="height:1px!important;width:1px!important;'
            f'border-width:0!important;margin:0!important;padding:0!important;">'
        )

    return (
        '<html><body>'
        '<div style="font-family:Arial,sans-serif;font-size:15px;'
        'color:#1a1a1a;line-height:1.6">'
        f'{safe}'
        f'</div>{pixel}</body></html>'
    )


def send_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    from_name: str,
    from_email: str,
    to_email: str,
    subject: str,
    html_body: str,
    tracking_pixel_url: Optional[str] = None,
    click_token: Optional[str] = None,
    base_url: str = "http://localhost:8000",
    use_ssl: bool = False,
    transport_mode: str = "auto",
) -> tuple[bool, str]:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=from_email.split('@')[-1] if '@' in from_email else 'mail')
        msg["Reply-To"] = from_email

        # Plain text part: strip markdown links to just their display text
        plain_body = re.sub(r'\[([^\]]+)\]\(https?://[^\s\)]+\)', r'\1', html_body)
        msg.attach(MIMEText(plain_body, "plain", "utf-8"))
        # Minimal HTML part (no tables/CSS — avoids Promotions filter; carries tracking pixel)
        minimal_html = build_plain_email(html_body, tracking_pixel_url, click_token, base_url)
        msg.attach(MIMEText(minimal_html, "html", "utf-8"))

        mode = _get_transport_mode(transport_mode)
        if mode == "api":
            return _send_via_email_api(
                from_name=from_name,
                from_email=from_email,
                to_email=to_email,
                subject=subject,
                plain_body=plain_body,
                html_body=minimal_html,
            )

        context = ssl.create_default_context()
        # Force IPv4 to avoid broken IPv6 routes in some hosting environments
        ip = _resolve_ipv4(smtp_host, smtp_port)

        if use_ssl:
            with smtplib.SMTP_SSL(ip, smtp_port, context=context, timeout=20) as server:
                server.login(smtp_user, smtp_password)
                server.sendmail(from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP(ip, smtp_port, timeout=20) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_email, to_email, msg.as_string())

        return True, ""
    except smtplib.SMTPAuthenticationError:
        return False, "Error de autenticación SMTP. Verifica usuario y contraseña."
    except smtplib.SMTPConnectError as e:
        return False, f"No se pudo conectar al servidor SMTP: {str(e)}"
    except smtplib.SMTPRecipientsRefused:
        return False, f"El destinatario {to_email} fue rechazado."
    except Exception as e:
        return False, str(e)


def get_smtp_settings(provider: str, custom_host: str = "", custom_port: int = 587) -> tuple[str, int, bool]:
    # Custom host always wins — lets users override the provider default
    if custom_host and custom_host.strip():
        host = custom_host.strip()
        port = int(custom_port) if custom_port else 587
        use_ssl = port == 465
        return host, port, use_ssl
    if provider in PROVIDER_SETTINGS:
        cfg = PROVIDER_SETTINGS[provider]
        return cfg["host"], cfg["port"], cfg.get("ssl", False)
    return custom_host, custom_port, False
