from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.models import User
from app.api.admin import require_admin
from app.email_trigger_service import (
    TRIGGER_LABELS,
    trigger_config,
    trigger_preview,
    trigger_send_now,
    trigger_executions,
    triggers_overview,
    save_daily_config,
    save_deadline_config,
)
from app.prime_reminder_service import prime_reminder_save_config, rh_reminder_save_config

router = APIRouter(dependencies=[Depends(require_admin)])


class DailyConfigUpdate(BaseModel):
    enabled: bool = False
    hour: int = Field(8, ge=0, le=23)
    minute: int = Field(30, ge=0, le=59)


class DeadlineConfigUpdate(BaseModel):
    enabled: bool = False
    deadline_day: int = Field(20, ge=1, le=28)
    days: List[int] = Field(..., description="Jours du mois des rappels")
    hours: List[int] = Field(..., description="Heures d'envoi (0-23)")


class DGConfigUpdate(BaseModel):
    enabled: bool = False
    days: List[int]
    hours: List[int]
    recipient: Optional[str] = ""


class RHConfigUpdate(BaseModel):
    enabled: bool = False
    days: List[int]
    hours: List[int]
    recipient: Optional[str] = ""


@router.get("/email-triggers/overview")
async def get_overview(_admin: User = Depends(require_admin)):
    """Vue d'ensemble des 3 déclencheurs email (cartes de la page admin)."""
    return {"triggers": await triggers_overview()}


@router.get("/email-triggers/{trigger}/config")
async def get_config(trigger: str, _admin: User = Depends(require_admin)):
    """Configuration détaillée d'un déclencheur."""
    if trigger not in TRIGGER_LABELS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Déclencheur inconnu")
    return await trigger_config(trigger)


@router.put("/email-triggers/daily/config")
async def put_daily_config(body: DailyConfigUpdate, _admin: User = Depends(require_admin)):
    return await save_daily_config(body.enabled, body.hour, body.minute)


@router.put("/email-triggers/deadline/config")
async def put_deadline_config(body: DeadlineConfigUpdate, _admin: User = Depends(require_admin)):
    return await save_deadline_config(body.enabled, body.deadline_day, body.days, body.hours)


@router.put("/email-triggers/dg/config")
async def put_dg_config(body: DGConfigUpdate, _admin: User = Depends(require_admin)):
    return await prime_reminder_save_config(
        enabled=body.enabled, days=body.days, hours=body.hours, recipient=body.recipient,
    )


@router.put("/email-triggers/rh/config")
async def put_rh_config(body: RHConfigUpdate, _admin: User = Depends(require_admin)):
    return await rh_reminder_save_config(
        enabled=body.enabled, days=body.days, hours=body.hours, recipient=body.recipient,
    )


@router.post("/email-triggers/{trigger}/send")
async def post_send(trigger: str, user: User = Depends(require_admin)):
    """Déclenchement manuel immédiat (journalisé MANUAL)."""
    if trigger not in TRIGGER_LABELS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Déclencheur inconnu")
    return await trigger_send_now(trigger, user)


@router.get("/email-triggers/{trigger}/preview")
async def get_preview(trigger: str, _admin: User = Depends(require_admin)):
    """Aperçu du template réel (aucun email envoyé)."""
    if trigger not in TRIGGER_LABELS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Déclencheur inconnu")
    return await trigger_preview(trigger)


@router.get("/email-triggers/{trigger}/executions")
async def get_executions(
    trigger: str,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: User = Depends(require_admin),
):
    """Historique paginé des exécutions d'un déclencheur."""
    if trigger not in TRIGGER_LABELS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Déclencheur inconnu")
    return await trigger_executions(trigger, status=status, page=page, size=size)
