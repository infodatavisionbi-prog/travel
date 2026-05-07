from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response as RawResponse, StreamingResponse
import httpx
import io
import os
import secrets
from sqlalchemy.orm import Session
from database import get_db
from models import User, WhatsAppAccount
from dependencies import get_current_user
from services.auth_service import decode_token

router = APIRouter(prefix="/wa-qr", tags=["wa-qr"])

_BRIDGE = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")
_TIMEOUT = 25.0
_OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")


async def _call(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        resp = await getattr(c, method)(f"{_BRIDGE}{path}", **kwargs)
        return resp.json()


@router.post("/start")
async def start(current_user: User = Depends(get_current_user)):
    try:
        return await _call("post", f"/session/{current_user.id}/start")
    except Exception as e:
        raise HTTPException(503, f"WA Bridge no disponible — {e}")


@router.get("/qr")
async def get_qr(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/qr")
    except Exception:
        return {"status": "not_started", "qr": None, "phone": None}


@router.get("/status")
async def get_status(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/status")
    except Exception:
        return {"status": "not_started", "phone": None}


@router.post("/send")
async def send_msg(data: dict, current_user: User = Depends(get_current_user)):
    try:
        result = await _call("post", f"/session/{current_user.id}/send", json=data)
        if not result.get("ok"):
            raise HTTPException(400, result.get("error", "Error al enviar"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, str(e))


@router.get("/profile")
async def get_profile(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/profile")
    except Exception:
        return {"ok": False, "profile": None}


@router.get("/chats")
async def get_chats(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/chats")
    except Exception:
        return {"ok": False, "chats": []}


@router.get("/messages")
async def get_messages(jid: str, current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/messages", params={"jid": jid})
    except Exception:
        return {"ok": False, "messages": [], "name": ""}


@router.get("/debug")
async def debug_store(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/debug")
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/contacts")
async def get_contacts(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/contacts")
    except Exception:
        return {"ok": False, "contacts": []}


@router.get("/receipts")
async def get_receipts(current_user: User = Depends(get_current_user)):
    try:
        return await _call("get", f"/session/{current_user.id}/receipts")
    except Exception:
        return {"ok": False, "receipts": []}


@router.post("/fetch-history")
async def fetch_history(data: dict, current_user: User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.post(f"{_BRIDGE}/session/{current_user.id}/fetch-history", json=data)
            return resp.json()
    except Exception as e:
        raise HTTPException(503, str(e))


@router.post("/sync-account")
async def sync_account(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update the QR WhatsAppAccount record after a successful connection."""
    phone = data.get("phone", "")
    name = data.get("name") or (f"WhatsApp QR {phone}" if phone else "WhatsApp QR")

    acc = (
        db.query(WhatsAppAccount)
        .filter(
            WhatsAppAccount.user_id == current_user.id,
            WhatsAppAccount.account_type == "qr",
        )
        .first()
    )
    if acc:
        acc.phone_number = phone
        if data.get("name"):
            acc.name = name
    else:
        acc = WhatsAppAccount(
            user_id=current_user.id,
            account_type="qr",
            name=name,
            phone_number=phone,
            phone_number_id="qr",
            access_token="",
            webhook_verify_token=secrets.token_hex(16),
        )
        db.add(acc)
    db.commit()
    db.refresh(acc)
    return {
        "ok": True,
        "account": {
            "id": acc.id,
            "name": acc.name,
            "phone_number": acc.phone_number,
            "account_type": "qr",
        },
    }


@router.get("/events")
async def sse_events(token: str = Query(...), db: Session = Depends(get_db)):
    """SSE stream proxied from the WA bridge — authenticated via ?token= query param."""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=None) as c:
                async with c.stream("GET", f"{_BRIDGE}/session/{user.id}/events") as r:
                    async for chunk in r.aiter_bytes(1024):
                        yield chunk
        except Exception:
            pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/transcribe")
async def transcribe_audio(data: dict, current_user: User = Depends(get_current_user)):
    """Download a WhatsApp audio message from the bridge and transcribe via OpenAI Whisper."""
    if not _OPENAI_KEY:
        raise HTTPException(503, "OPENAI_API_KEY no configurado en el servidor")

    jid    = data.get("jid", "")
    msg_id = data.get("msg_id", "")
    if not jid or not msg_id:
        raise HTTPException(400, "jid y msg_id requeridos")

    # 1. Download audio binary from bridge
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            resp = await c.get(
                f"{_BRIDGE}/session/{current_user.id}/media",
                params={"jid": jid, "msgId": msg_id},
            )
            if not resp.is_success:
                raise HTTPException(404, "Audio no disponible en el bridge")
            audio_bytes = resp.content
            content_type = resp.headers.get("content-type", "audio/ogg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Error descargando audio: {e}")

    # 2. Detect extension from content-type
    ext_map = {
        "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
        "audio/wav": "wav", "audio/webm": "webm", "audio/aac": "aac",
    }
    mime_base = content_type.split(";")[0].strip()
    ext = ext_map.get(mime_base, "ogg")
    filename = f"audio.{ext}"

    # 3. Transcribe with OpenAI Whisper
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=_OPENAI_KEY)
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, io.BytesIO(audio_bytes), mime_base),
            response_format="text",
        )
        return {"ok": True, "text": str(transcript).strip()}
    except Exception as e:
        raise HTTPException(500, f"Error en transcripción: {e}")


@router.get("/media")
async def get_media(jid: str, msg_id: str, current_user: User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            resp = await c.get(
                f"{_BRIDGE}/session/{current_user.id}/media",
                params={"jid": jid, "msgId": msg_id},
            )
            if not resp.is_success:
                raise HTTPException(404, "Media no disponible")
            return RawResponse(
                content=resp.content,
                media_type=resp.headers.get("content-type", "application/octet-stream"),
                headers={"Cache-Control": "public, max-age=3600"},
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, str(e))


@router.post("/send-media")
async def send_media(data: dict, current_user: User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            resp = await c.post(f"{_BRIDGE}/session/{current_user.id}/send-media", json=data)
            result = resp.json()
        if not result.get("ok"):
            raise HTTPException(400, result.get("error", "Error al enviar media"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, str(e))


@router.delete("/disconnect")
async def disconnect(current_user: User = Depends(get_current_user)):
    try:
        return await _call("delete", f"/session/{current_user.id}")
    except Exception as e:
        raise HTTPException(503, str(e))
