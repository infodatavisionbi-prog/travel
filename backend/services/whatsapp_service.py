import re
import requests
from typing import Optional

GRAPH_URL = "https://graph.facebook.com/v19.0"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def send_template_message(
    phone_number_id: str,
    access_token: str,
    to_phone: str,
    template_name: str,
    language_code: str = "es_AR",
    variables: list[str] = None,
) -> tuple[bool, str]:
    """Send a WhatsApp template message. Returns (ok, error_or_wamid)."""
    to = re.sub(r"[^\d]", "", to_phone)
    if not to:
        return False, "Número de teléfono inválido"

    components = []
    if variables:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in variables],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            **({"components": components} if components else {}),
        },
    }
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}/messages",
            headers=_headers(access_token),
            json=payload,
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200 and "messages" in data:
            wamid = data["messages"][0].get("id", "")
            return True, wamid
        error = data.get("error", {}).get("message", r.text)
        return False, error
    except Exception as e:
        return False, str(e)


def send_text_message(
    phone_number_id: str,
    access_token: str,
    to_phone: str,
    text: str,
) -> tuple[bool, str]:
    """Send a free-form text message (only valid within 24h session window)."""
    to = re.sub(r"[^\d]", "", to_phone)
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}/messages",
            headers=_headers(access_token),
            json=payload,
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200 and "messages" in data:
            return True, data["messages"][0].get("id", "")
        return False, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return False, str(e)


def get_templates(waba_id: str, access_token: str) -> tuple[list, str]:
    """Fetch approved message templates from Meta."""
    try:
        r = requests.get(
            f"{GRAPH_URL}/{waba_id}/message_templates",
            headers=_headers(access_token),
            params={"limit": 100},
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200:
            templates = data.get("data", [])
            result = []
            for t in templates:
                if t.get("status") == "APPROVED":
                    # Extract variable count from body component
                    var_count = 0
                    for comp in t.get("components", []):
                        if comp.get("type") == "BODY":
                            var_count = len(re.findall(r"\{\{(\d+)\}\}", comp.get("text", "")))
                    result.append({
                        "name": t["name"],
                        "language": t.get("language", "es_AR"),
                        "status": t.get("status", ""),
                        "category": t.get("category", ""),
                        "var_count": var_count,
                        "preview": next(
                            (c.get("text", "") for c in t.get("components", []) if c.get("type") == "BODY"),
                            "",
                        ),
                    })
            return result, None
        return [], data.get("error", {}).get("message", r.text)
    except Exception as e:
        return [], str(e)


def get_business_profile(phone_number_id: str, access_token: str) -> tuple[dict, str]:
    """Fetch WhatsApp Business profile fields."""
    fields = "about,address,description,email,profile_picture_url,websites,vertical"
    try:
        r = requests.get(
            f"{GRAPH_URL}/{phone_number_id}/whatsapp_business_profile",
            headers=_headers(access_token),
            params={"fields": fields},
            timeout=10,
        )
        data = r.json()
        if r.status_code == 200:
            return data.get("data", [{}])[0] if "data" in data else data, None
        return {}, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return {}, str(e)


def update_business_profile(phone_number_id: str, access_token: str, fields: dict) -> tuple[bool, str]:
    """Update WhatsApp Business profile fields."""
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}/whatsapp_business_profile",
            headers=_headers(access_token),
            json={"messaging_product": "whatsapp", **fields},
            timeout=10,
        )
        data = r.json()
        if r.status_code == 200:
            return True, "Perfil actualizado"
        return False, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return False, str(e)


def upload_media(phone_number_id: str, access_token: str, file_bytes: bytes, mime_type: str) -> tuple[str, str]:
    """Upload media to WhatsApp. Returns (media_id_or_empty, error_or_empty)."""
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}/media",
            headers={"Authorization": f"Bearer {access_token}"},
            data={"messaging_product": "whatsapp", "type": mime_type},
            files={"file": ("photo.jpg", file_bytes, mime_type)},
            timeout=30,
        )
        data = r.json()
        if r.status_code == 200 and "id" in data:
            return data["id"], ""
        return "", data.get("error", {}).get("message", r.text)
    except Exception as e:
        return "", str(e)


def set_profile_photo(phone_number_id: str, access_token: str, media_id: str) -> tuple[bool, str]:
    """Set the WhatsApp Business profile photo using a previously uploaded media ID."""
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}/whatsapp_business_profile",
            headers=_headers(access_token),
            json={"messaging_product": "whatsapp", "profile_picture_handle": media_id},
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200:
            return True, "Foto actualizada"
        return False, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return False, str(e)


def test_connection(phone_number_id: str, access_token: str) -> tuple[bool, str]:
    """Verify credentials by fetching phone number info."""
    try:
        r = requests.get(
            f"{GRAPH_URL}/{phone_number_id}",
            headers=_headers(access_token),
            params={"fields": "display_phone_number,verified_name"},
            timeout=10,
        )
        data = r.json()
        if r.status_code == 200:
            num = data.get("display_phone_number", "")
            name = data.get("verified_name", "")
            return True, f"{name} ({num})"
        return False, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return False, str(e)


def get_coexistence_status(phone_number_id: str, access_token: str) -> tuple[Optional[str], str]:
    """Get WhatsApp Coexistence status. Returns (status_or_None, error_or_empty)."""
    try:
        r = requests.get(
            f"{GRAPH_URL}/{phone_number_id}",
            headers=_headers(access_token),
            params={"fields": "coexistence_status"},
            timeout=10,
        )
        data = r.json()
        if r.status_code == 200:
            return data.get("coexistence_status"), ""
        return None, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return None, str(e)


def set_coexistence_status(phone_number_id: str, access_token: str, enable: bool) -> tuple[bool, str]:
    """Enable or disable WhatsApp Coexistence."""
    try:
        r = requests.post(
            f"{GRAPH_URL}/{phone_number_id}",
            headers=_headers(access_token),
            json={"coexistence_status": "ENABLED" if enable else "DISABLED"},
            timeout=10,
        )
        data = r.json()
        if r.status_code == 200:
            return True, "Coexistencia " + ("habilitada" if enable else "deshabilitada")
        return False, data.get("error", {}).get("message", r.text)
    except Exception as e:
        return False, str(e)
