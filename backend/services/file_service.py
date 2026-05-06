import pandas as pd
import io
from typing import List


COLUMN_ALIASES = {
    "nombre": "name", "name": "name", "full_name": "name", "nombre_completo": "name",
    "empresa": "company", "company": "company", "compañia": "company", "organizacion": "company", "organization": "company",
    "cargo": "role", "role": "role", "puesto": "role", "titulo": "role", "title": "role", "position": "role",
    "email": "email", "correo": "email", "mail": "email", "e-mail": "email",
    "email2": "email2", "email_secundario": "email2", "correo2": "email2", "correo_secundario": "email2", "mail2": "email2",
    "telefono": "phone", "phone": "phone", "tel": "phone", "celular": "phone", "mobile": "phone",
    "notas": "notes", "notes": "notes", "comentarios": "notes",
    "etiquetas": "tags", "tags": "tags", "categorias": "tags",
    "grupo": "group_name", "group": "group_name", "group_name": "group_name",
}


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    rename_map = {}
    for col in df.columns:
        if col in COLUMN_ALIASES:
            rename_map[col] = COLUMN_ALIASES[col]
    return df.rename(columns=rename_map)


def parse_leads_from_dataframe(df: pd.DataFrame) -> List[dict]:
    df = normalize_columns(df)
    df = df.fillna("")

    if "email" not in df.columns:
        raise ValueError("El archivo debe contener una columna 'email' o 'correo'")

    leads = []
    for _, row in df.iterrows():
        raw_email = str(row.get("email", "")).strip()
        if not raw_email:
            continue

        # Handle pipe-separated dual emails: "a@x.com | b@x.com"
        email2_from_pipe = ""
        if "|" in raw_email:
            parts = [p.strip() for p in raw_email.split("|")]
            raw_email = parts[0]
            if len(parts) > 1 and "@" in parts[1]:
                email2_from_pipe = parts[1].lower()

        if not raw_email or "@" not in raw_email:
            continue

        email2_val = str(row.get("email2", "")).strip().lower() or email2_from_pipe

        leads.append({
            "name": str(row.get("name", "")).strip(),
            "company": str(row.get("company", "")).strip(),
            "role": str(row.get("role", "")).strip(),
            "email": raw_email.lower(),
            "email2": email2_val,
            "phone": str(row.get("phone", "")).strip(),
            "notes": str(row.get("notes", "")).strip(),
            "tags": str(row.get("tags", "")).strip(),
            "group_name": str(row.get("group_name", "")).strip(),
        })

    return leads


def parse_csv(content: bytes) -> List[dict]:
    for encoding in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(io.BytesIO(content), encoding=encoding)
            return parse_leads_from_dataframe(df)
        except UnicodeDecodeError:
            continue
    raise ValueError("No se pudo leer el archivo CSV con ninguna codificación compatible")


def parse_excel(content: bytes) -> List[dict]:
    df = pd.read_excel(io.BytesIO(content))
    return parse_leads_from_dataframe(df)


def parse_file(content: bytes, filename: str) -> List[dict]:
    fname = filename.lower()
    if fname.endswith(".csv"):
        return parse_csv(content)
    elif fname.endswith((".xlsx", ".xls")):
        return parse_excel(content)
    raise ValueError(f"Formato no soportado: {filename}. Usa CSV o Excel (.xlsx/.xls)")
