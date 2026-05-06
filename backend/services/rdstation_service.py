import requests

BASE_URL = "https://crm.rdstation.com/api/v1/"
HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}


def _req(method, endpoint, token, **kwargs):
    params = kwargs.pop("params", {})
    params["token"] = token
    r = requests.request(method, BASE_URL + endpoint, headers=HEADERS, params=params, timeout=20, **kwargs)
    r.raise_for_status()
    return r.json()


def test_connection(token: str) -> tuple:
    try:
        r = requests.get(BASE_URL + "contacts", headers=HEADERS, params={"token": token, "limit": 1}, timeout=10)
        if r.status_code == 200:
            return True, "Conexión exitosa"
        elif r.status_code == 401:
            return False, "Token inválido"
        else:
            return False, f"Error HTTP {r.status_code}"
    except Exception as e:
        return False, str(e)


def list_contacts(token: str, page: int = 1, limit: int = 50, q: str = None, email: str = None) -> dict:
    params = {"page": page, "limit": limit}
    if q:
        params["q"] = q
    if email:
        params["email"] = email
    return _req("GET", "contacts", token, params=params)


def get_contact(token: str, contact_id: str) -> dict:
    return _req("GET", f"contacts/{contact_id}", token)


def get_custom_fields(token: str, entity: str = "contact") -> list:
    data = _req("GET", "custom_fields", token, params={"for": entity})
    if isinstance(data, dict):
        return data.get("custom_fields", [])
    return data if isinstance(data, list) else []


def get_users(token: str) -> list:
    data = _req("GET", "users", token)
    if isinstance(data, dict):
        return data.get("users", [])
    return data if isinstance(data, list) else []


def get_teams(token: str) -> list:
    data = _req("GET", "teams", token)
    if isinstance(data, dict):
        return data.get("teams", [])
    return data if isinstance(data, list) else []


def fetch_all_contacts(token: str, q: str = None, max_pages: int = 100) -> list:
    """Fetch all contacts across pages. Stops only when an empty page is returned."""
    all_contacts = []
    for page in range(1, max_pages + 1):
        params = {"page": page, "limit": 200}
        if q:
            params["q"] = q
        data = _req("GET", "contacts", token, params=params)
        contacts = data.get("contacts", [])
        if not contacts:
            break
        all_contacts.extend(contacts)
        # If API signals no more pages explicitly, respect it
        if data.get("has_more") is False:
            break
    return all_contacts


# ── Deals ─────────────────────────────────────────────────────────────────────

def list_deals(token: str, page: int = 1, limit: int = 50, q: str = None,
               stage_id: str = None, user_id: str = None, win: bool = None) -> dict:
    params = {"page": page, "limit": limit}
    if q:
        params["q"] = q
    if stage_id:
        params["deal_stage_id"] = stage_id
    if user_id:
        params["user_id"] = user_id
    if win is not None:
        params["win"] = str(win).lower()
    return _req("GET", "deals", token, params=params)


def get_deal(token: str, deal_id: str) -> dict:
    return _req("GET", f"deals/{deal_id}", token)


def get_deal_contacts(token: str, deal_id: str) -> dict:
    return _req("GET", f"deals/{deal_id}/contacts", token)


def fetch_all_deals(token: str, q: str = None, stage_id: str = None,
                    user_id: str = None, max_pages: int = 100) -> list:
    """Fetch all deals across pages."""
    all_deals = []
    for page in range(1, max_pages + 1):
        params = {"page": page, "limit": 200}
        if q:
            params["q"] = q
        if stage_id:
            params["deal_stage_id"] = stage_id
        if user_id:
            params["user_id"] = user_id
        data = _req("GET", "deals", token, params=params)
        deals = data.get("deals", [])
        if not deals:
            break
        all_deals.extend(deals)
        if data.get("has_more") is False:
            break
    return all_deals


def get_deal_stages(token: str) -> list:
    data = _req("GET", "deal_stages", token)
    if isinstance(data, dict):
        return data.get("deal_stages", [])
    return data if isinstance(data, list) else []


def update_deal(token: str, deal_id: str, deal_stage_id: str = None, user_id: str = None) -> dict:
    payload = {}
    if deal_stage_id:
        # According to RD changelog, this must be top-level in v1.
        payload["deal_stage_id"] = deal_stage_id
    if user_id:
        # Owner assignment is handled in the deal object.
        payload["deal"] = {"user_id": user_id}
    if not payload:
        return {}
    return _req("PUT", f"deals/{deal_id}", token, json=payload)


# ── Write operations ───────────────────────────────────────────────────────────

def create_contact(token: str, name: str, email: str = None, phone: str = None) -> dict:
    contact = {"name": name}
    if email:
        contact["email"] = email
    if phone:
        contact["phones"] = [{"phone": phone, "type": "cellphone"}]
    return _req("POST", "contacts", token, json={"contact": contact})


def update_contact(token: str, contact_id: str, name: str = None, email: str = None, phone: str = None) -> dict:
    contact = {}
    if name:
        contact["name"] = name
    if email:
        contact["email"] = email
    if phone:
        contact["phones"] = [{"phone": phone, "type": "cellphone"}]
    return _req("PUT", f"contacts/{contact_id}", token, json={"contact": contact})
