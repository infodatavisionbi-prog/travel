import anthropic
import os
from typing import Optional


def get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    return anthropic.Anthropic(api_key=api_key)


def generate_personalized_email(
    subject_template: str,
    body_template: str,
    lead_name: str,
    lead_company: str,
    lead_role: str,
    ai_instructions: Optional[str] = None,
) -> dict:
    client = get_client()

    system_prompt = """Eres un experto en copywriting y email marketing B2B.
Tu tarea es generar emails de outreach personalizados, profesionales y con alta tasa de conversión.
Los emails deben sonar naturales, no robóticos. Cada email debe ser único.
IMPORTANTE: Responde SOLO con JSON válido en este formato exacto:
{"subject": "...", "body": "..."}
No incluyas markdown, no incluyas texto adicional fuera del JSON."""

    user_message = f"""Crea un email de outreach personalizado basado en la siguiente información:

PLANTILLA DE ASUNTO: {subject_template}
PLANTILLA DE CUERPO: {body_template}

DATOS DEL LEAD:
- Nombre: {lead_name}
- Empresa: {lead_company}
- Cargo: {lead_role}

{f"INSTRUCCIONES ADICIONALES: {ai_instructions}" if ai_instructions else ""}

REGLAS:
1. Personaliza el email con los datos del lead de forma natural
2. El asunto debe ser atractivo y generar curiosidad
3. El cuerpo debe ser conciso (máximo 150 palabras) y tener un CTA claro
4. Usa el mismo idioma que la plantilla
5. Reemplaza {"{nombre}"} con {lead_name}, {"{empresa}"} con {lead_company}, {"{cargo}"} con {lead_role}
6. El cuerpo debe ser en formato HTML básico (párrafos con <p>, negritas con <strong>)

Genera SOLO el JSON sin ningún otro texto."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text.strip()

    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])

    import json
    data = json.loads(text)
    return {"subject": data.get("subject", subject_template), "body": data.get("body", body_template)}


def simple_personalize(subject_template: str, body_template: str, lead_name: str, lead_company: str, lead_role: str) -> dict:
    replacements = {
        "{nombre}": lead_name,
        "{empresa}": lead_company,
        "{cargo}": lead_role,
        "{name}": lead_name,
        "{company}": lead_company,
        "{role}": lead_role,
    }

    subject = subject_template
    body = body_template

    for placeholder, value in replacements.items():
        subject = subject.replace(placeholder, value)
        body = body.replace(placeholder, value)

    return {"subject": subject, "body": body}
