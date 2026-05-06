import os
import requests

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM = os.getenv("RESEND_FROM", "DataVision <onboarding@resend.dev>")

def enviar_email(to_email: str, subject: str, html: str):
    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": subject,
            "html": html,
        },
        timeout=20,
    )

    if response.status_code >= 400:
        raise Exception(f"Error enviando email: {response.text}")

    return response.json()
