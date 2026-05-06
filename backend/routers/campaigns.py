from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Campaign, Lead, EmailLog
from schemas import CampaignCreate, CampaignUpdate, CampaignOut, GenerateEmailRequest, GenerateEmailResponse
from services.ai_service import generate_personalized_email, simple_personalize
import secrets

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=List[CampaignOut])
def list_campaigns(db: Session = Depends(get_db)):
    return db.query(Campaign).order_by(Campaign.created_at.desc()).all()


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    return c


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_db)):
    db_campaign = Campaign(**campaign.dict())
    db.add(db_campaign)
    db.commit()
    db.refresh(db_campaign)
    return db_campaign


@router.put("/{campaign_id}", response_model=CampaignOut)
def update_campaign(campaign_id: int, update: CampaignUpdate, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    for field, value in update.dict(exclude_none=True).items():
        setattr(campaign, field, value)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    db.delete(campaign)
    db.commit()
    return {"ok": True}


@router.post("/{campaign_id}/preview", response_model=GenerateEmailResponse)
def preview_email(campaign_id: int, lead_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    if campaign.use_ai:
        try:
            result = generate_personalized_email(
                campaign.subject_template,
                campaign.body_template,
                lead.name,
                lead.company,
                lead.role,
                campaign.ai_instructions or None,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error de IA: {str(e)}")
    else:
        result = simple_personalize(
            campaign.subject_template,
            campaign.body_template,
            lead.name,
            lead.company,
            lead.role,
        )

    return result


@router.post("/{campaign_id}/generate")
def generate_emails_for_campaign(
    campaign_id: int,
    lead_ids: Optional[List[int]] = None,
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")

    query = db.query(Lead).filter(Lead.status == "active")
    if lead_ids:
        query = query.filter(Lead.id.in_(lead_ids))
    leads = query.all()

    if not leads:
        raise HTTPException(status_code=400, detail="No hay leads para generar emails")

    existing_emails = {
        log.lead_id
        for log in db.query(EmailLog)
        .filter(EmailLog.campaign_id == campaign_id)
        .all()
    }

    generated = 0
    errors = []

    for lead in leads:
        if lead.id in existing_emails:
            continue

        try:
            if campaign.use_ai:
                result = generate_personalized_email(
                    campaign.subject_template,
                    campaign.body_template,
                    lead.name,
                    lead.company,
                    lead.role,
                    campaign.ai_instructions or None,
                )
            else:
                result = simple_personalize(
                    campaign.subject_template,
                    campaign.body_template,
                    lead.name,
                    lead.company,
                    lead.role,
                )

            log = EmailLog(
                lead_id=lead.id,
                campaign_id=campaign_id,
                to_email=lead.email,
                subject=result["subject"],
                body=result["body"],
                status="draft",
                open_token=secrets.token_hex(32),
                click_token=secrets.token_hex(32),
            )
            db.add(log)
            db.commit()
            generated += 1

        except Exception as e:
            errors.append({"lead": lead.email, "error": str(e)})

    return {"generated": generated, "errors": errors[:10]}


@router.get("/{campaign_id}/emails")
def get_campaign_emails(campaign_id: int, db: Session = Depends(get_db)):
    logs = (
        db.query(EmailLog)
        .filter(EmailLog.campaign_id == campaign_id)
        .all()
    )
    result = []
    for log in logs:
        lead = db.query(Lead).filter(Lead.id == log.lead_id).first()
        result.append({
            "id": log.id,
            "lead_id": log.lead_id,
            "lead_name": lead.name if lead else "",
            "lead_company": lead.company if lead else "",
            "to_email": log.to_email,
            "subject": log.subject,
            "body": log.body,
            "status": log.status,
            "open_count": log.open_count,
            "click_count": log.click_count,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "opened_at": log.opened_at.isoformat() if log.opened_at else None,
            "clicked_at": log.clicked_at.isoformat() if log.clicked_at else None,
            "error_message": log.error_message,
        })
    return result
