from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class LeadBase(BaseModel):
    name: str
    company: str = ""
    role: str = ""
    email: str
    email2: str = ""
    phone: str = ""
    notes: str = ""
    tags: str = ""
    group_name: str = ""
    custom_fields: str = ""
    status: str = "active"


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    email2: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    group_name: Optional[str] = None
    custom_fields: Optional[str] = None
    status: Optional[str] = None


class LeadOut(LeadBase):
    id: int
    created_at: datetime
    updated_at: datetime
    campaign_status: Optional[str] = None
    campaign_count: int = 0

    class Config:
        from_attributes = True


class LeadCampaignParticipation(BaseModel):
    sequence_id: int
    sequence_name: str
    sequence_status: str
    contact_status: str
    current_step: int
    follow_up_stage: str = ""
    enrolled_at: Optional[datetime]
    next_send_at: Optional[datetime]
    completed_at: Optional[datetime]


class LeadCampaignDetailsOut(BaseModel):
    lead: LeadOut
    campaigns: List[LeadCampaignParticipation]


class CampaignBase(BaseModel):
    name: str
    description: str = ""
    subject_template: str
    body_template: str
    from_name: str
    from_email: str
    provider: str = "gmail"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    use_ai: bool = True
    ai_instructions: str = ""


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    provider: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    use_ai: Optional[bool] = None
    ai_instructions: Optional[str] = None
    status: Optional[str] = None


class CampaignOut(CampaignBase):
    id: int
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmailLogOut(BaseModel):
    id: int
    lead_id: Optional[int]
    campaign_id: Optional[int]
    to_email: str
    subject: str
    body: str
    status: str
    open_count: int
    click_count: int
    sent_at: Optional[datetime]
    opened_at: Optional[datetime]
    clicked_at: Optional[datetime]
    error_message: str
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateEmailRequest(BaseModel):
    lead_id: int
    campaign_id: int


class GenerateEmailResponse(BaseModel):
    subject: str
    body: str


class SendCampaignRequest(BaseModel):
    campaign_id: int
    lead_ids: Optional[List[int]] = None


class StatsResponse(BaseModel):
    total_leads: int
    total_campaigns: int
    total_sent: int
    total_opened: int
    total_clicked: int
    total_replied: int
    open_rate: float
    click_rate: float


class SettingOut(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    value: str
