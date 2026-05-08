from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    phone = Column(String(50), default="", nullable=False)
    name = Column(String(200), default="")
    password_hash = Column(String(500), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    is_pool = Column(Boolean, default=False)
    name = Column(String(200), nullable=False)
    company = Column(String(200), default="")
    role = Column(String(200), default="")
    email = Column(String(200), nullable=False, index=True)
    email2 = Column(String(200), default="")
    phone = Column(String(50), default="")
    notes = Column(Text, default="")
    tags = Column(String(500), default="")
    group_name = Column(String(200), default="")
    custom_fields = Column(Text, default="")
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    email_logs = relationship("EmailLog", back_populates="lead")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    description = Column(Text, default="")
    subject_template = Column(String(500), nullable=False)
    body_template = Column(Text, nullable=False)
    from_name = Column(String(200), nullable=False)
    from_email = Column(String(200), nullable=False)
    provider = Column(String(50), default="gmail")
    smtp_host = Column(String(200), default="")
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(200), default="")
    smtp_password = Column(String(500), default="")
    use_ai = Column(Boolean, default=True)
    ai_instructions = Column(Text, default="")
    status = Column(String(50), default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    email_logs = relationship("EmailLog", back_populates="campaign")


class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)
    to_email = Column(String(200), nullable=False)
    subject = Column(String(500), default="")
    body = Column(Text, default="")
    status = Column(String(50), default="pending")
    open_token = Column(String(64), unique=True, index=True)
    click_token = Column(String(64), unique=True, index=True)
    open_count = Column(Integer, default=0)
    click_count = Column(Integer, default=0)
    sent_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="email_logs")
    campaign = relationship("Campaign", back_populates="email_logs")


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    key = Column(String(100), nullable=False, index=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WhatsAppAccount(Base):
    __tablename__ = "whatsapp_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_type = Column(String(20), default="api")
    name = Column(String(100), nullable=False)
    phone_number = Column(String(30), default="")
    phone_number_id = Column(String(100), default="")
    waba_id = Column(String(100), default="")
    access_token = Column(Text, default="")
    webhook_verify_token = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    from_name = Column(String(200), default="")
    from_email = Column(String(200), nullable=False)
    provider = Column(String(50), default="hostinger")
    smtp_host = Column(String(200), default="")
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(200), nullable=False)
    smtp_password = Column(String(500), nullable=False)
    imap_host = Column(String(200), default="")
    imap_port = Column(Integer, default=993)
    imap_password = Column(String(500), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Sequence(Base):
    __tablename__ = "sequences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email_account_id = Column(Integer, ForeignKey("email_accounts.id"), nullable=True)
    wa_account_id = Column(Integer, ForeignKey("whatsapp_accounts.id"), nullable=True)
    type = Column(String(20), default="email")
    name = Column(String(300), nullable=False)
    description = Column(Text, default="")
    from_name = Column(String(200), default="")
    from_email = Column(String(200), default="")
    provider = Column(String(50), default="hostinger")
    smtp_host = Column(String(200), default="")
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(200), default="")
    smtp_password = Column(String(500), default="")
    use_ai = Column(Boolean, default=False)
    ai_instructions = Column(Text, default="")
    status = Column(String(50), default="active")
    send_mode = Column(String(20), default="automatic")
    send_hour_start = Column(Integer, default=8)
    send_hour_end = Column(Integer, default=19)
    send_days = Column(String(50), default="1,2,3,4,5")
    daily_limit = Column(Integer, default=50)
    send_timezone = Column(String(100), default="America/Buenos_Aires")
    created_at = Column(DateTime, default=datetime.utcnow)


class SequenceStep(Base):
    __tablename__ = "sequence_steps"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    subject_template = Column(String(500), default="")
    body_template = Column(Text, default="")
    delay_days = Column(Integer, default=1)
    use_ai = Column(Boolean, default=False)
    ai_instructions = Column(Text, default="")
    wa_template_name = Column(String(200), default="")
    wa_template_language = Column(String(20), default="es_AR")
    wa_var_count = Column(Integer, default=0)


class SequenceContact(Base):
    __tablename__ = "sequence_contacts"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    status = Column(String(50), default="active")
    current_step = Column(Integer, default=0)
    follow_up_stage = Column(String(50), default="")
    follow_up_note = Column(Text, default="")
    enrolled_at = Column(DateTime, default=datetime.utcnow)
    next_send_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class WaCampaign(Base):
    __tablename__ = "wa_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("whatsapp_accounts.id"), nullable=False)
    name = Column(String(200), nullable=False)
    template_name = Column(String(200), default="")
    template_language = Column(String(20), default="es_AR")
    message_body = Column(Text, default="")
    status = Column(String(20), default="draft")
    total = Column(Integer, default=0)
    sent_count = Column(Integer, default=0)
    delivered_count = Column(Integer, default=0)
    read_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    delay_min = Column(Integer, default=3)
    delay_max = Column(Integer, default=8)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)


class WaCampaignRecipient(Base):
    __tablename__ = "wa_campaign_recipients"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("wa_campaigns.id"), nullable=False, index=True)
    lead_id = Column(Integer, nullable=True)
    phone = Column(String(50), nullable=False)
    name = Column(String(200), default="")
    grupo = Column(String(200), default="")
    colegio = Column(String(200), default="")
    status = Column(String(20), default="pending")
    wamid = Column(String(200), default="")
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    error_msg = Column(String(500), default="")


class SequenceLog(Base):
    __tablename__ = "sequence_logs"

    id = Column(Integer, primary_key=True, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id"), nullable=False, index=True)
    step_id = Column(Integer, ForeignKey("sequence_steps.id"), nullable=True)
    contact_id = Column(Integer, ForeignKey("sequence_contacts.id"), nullable=True)
    lead_id = Column(Integer, nullable=True)
    to_email = Column(String(200), nullable=False)
    subject = Column(String(500), default="")
    body = Column(Text, default="")
    status = Column(String(50), default="sent")
    open_token = Column(String(64), unique=True, index=True)
    click_token = Column(String(64), unique=True, index=True)
    open_count = Column(Integer, default=0)
    click_count = Column(Integer, default=0)
    sent_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    error_message = Column(Text, default="")
    wamid = Column(String(200), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), default="member")
    status = Column(String(20), default="pending")
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    invited_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)


class RdAutomation(Base):
    __tablename__ = "rd_automations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(300), nullable=False)
    status = Column(String(20), default="paused")
    source_stage_id = Column(String(200), default="")
    source_user_id = Column(String(200), default="")
    target_stage_id = Column(String(200), default="")
    sequence_id = Column(Integer, default=0)
    wa_account_id = Column(Integer, default=0)
    wa_template_name = Column(String(200), default="")
    wa_template_language = Column(String(20), default="es_AR")
    wa_text = Column(Text, default="")
    max_deals_per_run = Column(Integer, default=25)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(String(500), default="")
    data = Column(Text, default="")
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TripGroup(Base):
    __tablename__ = "trip_groups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(300), nullable=False)
    destination = Column(String(300), default="")
    departure_date = Column(String(20), default="")
    return_date = Column(String(20), default="")
    status = Column(String(20), default="upcoming")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    itinerary = relationship("TripItineraryItem", back_populates="trip", cascade="all, delete-orphan")
    responsables = relationship("TripResponsable", back_populates="trip", cascade="all, delete-orphan")


class TripItineraryItem(Base):
    __tablename__ = "trip_itinerary_items"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trip_groups.id"), nullable=False, index=True)
    day_number = Column(Integer, default=1)
    time = Column(String(10), default="")
    activity = Column(String(300), nullable=False)
    location = Column(String(300), default="")
    message_template = Column(Text, default="")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    trip = relationship("TripGroup", back_populates="itinerary")


class TripResponsable(Base):
    __tablename__ = "trip_responsables"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trip_groups.id"), nullable=False, index=True)
    name = Column(String(200), default="")
    phone = Column(String(50), nullable=False)
    student_name = Column(String(200), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    trip = relationship("TripGroup", back_populates="responsables")


class TripSend(Base):
    __tablename__ = "trip_sends"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trip_groups.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("trip_itinerary_items.id"), nullable=True)
    responsable_id = Column(Integer, ForeignKey("trip_responsables.id"), nullable=True)
    activity = Column(String(300), default="")
    responsable_name = Column(String(200), default="")
    phone = Column(String(50), default="")
    message = Column(Text, default="")
    status = Column(String(20), default="pending")
    wamid = Column(String(200), default="")
    error_msg = Column(String(500), default="")
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
