from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from contextlib import asynccontextmanager
from database import engine, Base, SessionLocal
import models
import os
import subprocess
from datetime import datetime
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from email_serviceAPI import enviar_email

load_dotenv()

_wa_bridge_proc = None

def _start_wa_bridge():
    global _wa_bridge_proc
    bridge_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "wa-bridge"))
    if not os.path.isdir(bridge_dir):
        print("WA Bridge: directorio no encontrado, omitiendo.")
        return
    try:
        _wa_bridge_proc = subprocess.Popen(
            ["node", "index.js"],
            cwd=bridge_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"WA Bridge iniciado (PID {_wa_bridge_proc.pid})")
    except FileNotFoundError:
        print("WA Bridge: Node.js no encontrado en PATH.")
    except Exception as e:
        print(f"WA Bridge: error al iniciar — {e}")

from routers import leads, campaigns, emails, stats, settings
from routers import sequences as sequences_router
from routers import auth as auth_router
from routers import email_accounts as email_accounts_router
from routers import whatsapp as whatsapp_router
from routers import rdstation as rdstation_router
from routers import wa_campaigns as wa_campaigns_router
from routers import teams as teams_router
from routers import notifications as notifications_router
from routers import wa_qr as wa_qr_router
from routers import trips as trips_router


def _run_sequences():
    from services.sequence_service import process_all_sequences
    db = SessionLocal()
    try:
        process_all_sequences(db)
    finally:
        db.close()


def _run_rdstation_automation():
    from services.rdstation_automation_service import run_automation_for_enabled_users
    db = SessionLocal()
    try:
        run_automation_for_enabled_users(db)
    finally:
        db.close()


def _poll_qr_receipts():
    """Poll WA bridge for delivery/read receipts and update campaign recipients."""
    import httpx
    from models import WaCampaignRecipient, WhatsAppAccount
    from sqlalchemy import text

    _bridge = os.getenv("WA_BRIDGE_URL", "http://localhost:3001")
    db = SessionLocal()
    try:
        # Find all users with connected QR accounts that have active campaigns
        qr_users = db.query(WhatsAppAccount.user_id).filter(
            WhatsAppAccount.account_type == "qr"
        ).distinct().all()

        for (user_id,) in qr_users:
            try:
                resp = httpx.get(f"{_bridge}/session/{user_id}/receipts", timeout=5)
                data = resp.json()
                receipts = data.get("receipts") or []
            except Exception:
                continue

            for receipt in receipts:
                wamid = receipt.get("wamid")
                status = receipt.get("status")
                ts = receipt.get("ts")
                if not wamid or not status:
                    continue

                r = db.query(WaCampaignRecipient).filter(
                    WaCampaignRecipient.wamid == wamid
                ).first()
                if not r:
                    continue

                now = datetime.utcnow()
                if status == "read" and r.status != "read":
                    r.status = "read"
                    r.read_at = now
                    if not r.delivered_at:
                        r.delivered_at = now
                elif status == "delivered" and r.status not in ("read", "delivered"):
                    r.status = "delivered"
                    r.delivered_at = now

            if receipts:
                db.commit()
    except Exception as e:
        print(f"_poll_qr_receipts error: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


scheduler = BackgroundScheduler()
scheduler.add_job(_run_sequences, "interval", minutes=5, id="seq_processor")
scheduler.add_job(_run_rdstation_automation, "interval", minutes=5, id="rd_auto_processor")
scheduler.add_job(_poll_qr_receipts, "interval", seconds=30, id="qr_receipts")


def _run_migrations():
    from sqlalchemy import text

    is_sqlite = engine.dialect.name == "sqlite"

    with engine.connect() as conn:
        # All ALTER TABLE / sqlite_master ops are SQLite-only.
        # PostgreSQL gets fresh tables via Base.metadata.create_all — no column patching needed.
        if is_sqlite:
            sqlite_cols = [
                ("sequences", "send_hour_start", "INTEGER DEFAULT 8"),
                ("sequences", "send_hour_end", "INTEGER DEFAULT 19"),
                ("sequences", "send_days", "VARCHAR(50) DEFAULT '1,2,3,4,5'"),
                ("sequences", "daily_limit", "INTEGER DEFAULT 50"),
                ("sequences", "send_timezone", "VARCHAR(100) DEFAULT 'America/Buenos_Aires'"),
                ("sequences", "user_id", "INTEGER DEFAULT 1"),
                ("sequences", "email_account_id", "INTEGER"),
                ("sequences", "send_mode", "VARCHAR(20) DEFAULT 'automatic'"),
                ("sequences", "wa_account_id", "INTEGER"),
                ("sequences", "type", "VARCHAR(20) DEFAULT 'email'"),
                ("sequence_logs", "wamid", "VARCHAR(200) DEFAULT ''"),
                ("sequence_steps", "wa_template_name", "VARCHAR(200) DEFAULT ''"),
                ("sequence_steps", "wa_template_language", "VARCHAR(20) DEFAULT 'es_AR'"),
                ("sequence_steps", "wa_var_count", "INTEGER DEFAULT 0"),
                ("sequence_contacts", "follow_up_stage", "VARCHAR(50) DEFAULT ''"),
                ("sequence_contacts", "follow_up_note", "TEXT DEFAULT ''"),
                ("leads", "user_id", "INTEGER DEFAULT 1"),
                ("leads", "group_name", "VARCHAR(200) DEFAULT ''"),
                ("leads", "email2", "VARCHAR(200) DEFAULT ''"),
                ("leads", "custom_fields", "TEXT DEFAULT ''"),
                ("app_settings", "user_id", "INTEGER DEFAULT 1"),
                ("wa_campaigns", "delay_min", "INTEGER DEFAULT 3"),
                ("wa_campaigns", "delay_max", "INTEGER DEFAULT 8"),
            ]
            for table, col, typedef in sqlite_cols:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"))
                    conn.commit()
                except Exception:
                    conn.rollback()

            # Drop unique indexes on leads.email and app_settings.key (SQLite can't ALTER COLUMN)
            for tbl in ("leads", "app_settings"):
                try:
                    idxs = conn.execute(text(
                        f"SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='{tbl}'"
                    )).fetchall()
                    for idx_name, idx_sql in idxs:
                        if idx_sql and 'UNIQUE' in idx_sql.upper():
                            conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
                            conn.commit()
                except Exception:
                    conn.rollback()

            # Fix empty tokens in sequence_logs
            try:
                import secrets as _sec
                bad_rows = conn.execute(text(
                    "SELECT id FROM sequence_logs WHERE open_token = '' OR click_token = '' OR open_token IS NULL OR click_token IS NULL"
                )).fetchall()
                for (row_id,) in bad_rows:
                    conn.execute(text(
                        "UPDATE sequence_logs SET open_token = :ot, click_token = :ct WHERE id = :id"
                    ), {"ot": _sec.token_hex(16), "ct": _sec.token_hex(16), "id": row_id})
                if bad_rows:
                    conn.commit()
            except Exception:
                conn.rollback()

        # Each ALTER TABLE runs in its own mini-transaction so a "column already
        # exists" error never poisons the connection for subsequent migrations.
        for col_sql in [
            "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN username VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN phone VARCHAR(50) DEFAULT ''",
            "ALTER TABLE leads ADD COLUMN is_pool BOOLEAN DEFAULT FALSE",
            "ALTER TABLE leads ADD COLUMN team_id INTEGER",
            "ALTER TABLE sequence_contacts ADD COLUMN follow_up_stage VARCHAR(50) DEFAULT ''",
            "ALTER TABLE sequence_contacts ADD COLUMN follow_up_note TEXT DEFAULT ''",
            "ALTER TABLE email_accounts ADD COLUMN imap_password VARCHAR(500) DEFAULT ''",
            "ALTER TABLE whatsapp_accounts ADD COLUMN account_type VARCHAR(20) DEFAULT 'api'",
            "ALTER TABLE wa_campaigns ADD COLUMN delay_min INTEGER DEFAULT 3",
            "ALTER TABLE wa_campaigns ADD COLUMN delay_max INTEGER DEFAULT 8",
        ]:
            try:
                conn.execute(text(col_sql))
                conn.commit()
            except Exception:
                conn.rollback()

        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS ix_sequence_logs_sequence_created ON sequence_logs (sequence_id, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_sequence_logs_sequence_sent ON sequence_logs (sequence_id, sent_at)",
            "CREATE INDEX IF NOT EXISTS ix_sequence_logs_sequence_opened ON sequence_logs (sequence_id, opened_at)",
            "CREATE INDEX IF NOT EXISTS ix_sequence_logs_sequence_clicked ON sequence_logs (sequence_id, clicked_at)",
            "CREATE INDEX IF NOT EXISTS ix_sequence_logs_sequence_step ON sequence_logs (sequence_id, step_id)",
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                conn.rollback()

        # Backfill username/phone and add unique index for username
        try:
            conn.execute(text("UPDATE users SET username = LOWER(SPLIT_PART(email, '@', 1)) WHERE username IS NULL OR username = ''"))
            conn.execute(text("UPDATE users SET phone = '' WHERE phone IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Ensure the configured admin email has is_admin=true
        try:
            admin_email = os.getenv("ADMIN_EMAIL", "")
            if admin_email:
                conn.execute(text("UPDATE users SET is_admin = TRUE WHERE email = :e"), {"e": admin_email})
                conn.commit()
        except Exception:
            conn.rollback()

        # Create default admin user if no users exist (runs on all databases)
        try:
            count = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()
            if count and count[0] == 0:
                admin_email = os.getenv("ADMIN_EMAIL", "admin@datavision.com")
                admin_password = os.getenv("ADMIN_PASSWORD", "")
                if not admin_password:
                    import secrets as _s
                    admin_password = _s.token_urlsafe(12)
                    print(f"⚠️  ADMIN_PASSWORD no configurado. Contraseña generada automáticamente.")
                from services.auth_service import hash_password
                hashed = hash_password(admin_password)
                admin_username = os.getenv("ADMIN_USERNAME", "admin").strip().lower() or "admin"
                admin_phone = os.getenv("ADMIN_PHONE", "")
                conn.execute(
                    text("INSERT INTO users (email, username, phone, name, password_hash, is_admin, created_at) VALUES (:e, :u, :p, :n, :h, TRUE, :d)"),
                    {"e": admin_email, "u": admin_username, "p": admin_phone, "n": "Admin", "h": hashed, "d": datetime.utcnow()},
                )
                conn.commit()
                print(f"✅ Usuario admin creado: {admin_username} / {admin_password}")
        except Exception as e:
            conn.rollback()
            print(f"admin user note: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _start_wa_bridge()
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
    if _wa_bridge_proc:
        _wa_bridge_proc.terminate()


app = FastAPI(title="DataVision Outreach API", version="2.0.0", lifespan=lifespan)

_cors_raw = os.getenv("ALLOWED_ORIGINS", "*")
_origins = ["*"] if _cors_raw.strip() == "*" else [o.strip() for o in _cors_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(leads.router)
app.include_router(campaigns.router)
app.include_router(emails.router)
app.include_router(stats.router)
app.include_router(settings.router)
app.include_router(sequences_router.router)
app.include_router(email_accounts_router.router)
app.include_router(whatsapp_router.router)
app.include_router(rdstation_router.router)
app.include_router(wa_campaigns_router.router)
app.include_router(teams_router.router)
app.include_router(notifications_router.router)
app.include_router(wa_qr_router.router)
app.include_router(trips_router.router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    _img_dir = os.path.join(FRONTEND_DIR, "images")
    os.makedirs(_img_dir, exist_ok=True)
    app.mount("/images", StaticFiles(directory=_img_dir), name="images")

    _NO_CACHE = {"Cache-Control": "no-cache, must-revalidate", "Pragma": "no-cache"}

    @app.get("/js/{filename}", include_in_schema=False)
    def serve_js(filename: str):
        path = os.path.join(FRONTEND_DIR, "js", filename)
        if not os.path.exists(path):
            return Response(status_code=404)
        return FileResponse(path, headers=_NO_CACHE)

    @app.get("/static/{filename}", include_in_schema=False)
    def serve_css(filename: str):
        path = os.path.join(FRONTEND_DIR, "css", filename)
        if not os.path.exists(path):
            return Response(status_code=404)
        return FileResponse(path, headers=_NO_CACHE)

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"), headers=_NO_CACHE)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.1.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=800, reload=True)

@app.get("/test-email")
def test_email():
    enviar_email(
        to_email="infodatavisionbi@gmail.com",  # ← TU EMAIL
        subject="Test DataVision",
        html="<h1>Funciona</h1><p>Email enviado desde Railway usando Resend.</p>"
    )
    return {"status": "ok"}
