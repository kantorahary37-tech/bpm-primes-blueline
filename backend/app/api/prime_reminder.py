from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User, PrimeReminderExecution
from app.api.admin import require_admin
from app.prime_reminder_service import (
    prime_reminder_config,
    prime_reminder_save_config,
    prime_reminder_send_manual,
    prime_reminder_preview,
)

router = APIRouter(dependencies=[Depends(require_admin)])


class PrimeReminderConfigUpdate(BaseModel):
    enabled: bool = True
    days: List[int]
    hours: List[int]
    recipient: Optional[str] = ""


class PrimeReminderExecutionResponse(BaseModel):
    id: int
    notification_type: str
    trigger_type: str
    scheduled_for: Optional[str] = None
    recipient: str
    status: str
    summary: Optional[list] = None
    total_count: int
    sent_at: Optional[str] = None
    error_message: Optional[str] = None


def _serialize(execution: PrimeReminderExecution) -> PrimeReminderExecutionResponse:
    return PrimeReminderExecutionResponse(
        id=execution.id,
        notification_type=execution.notification_type,
        trigger_type=execution.trigger_type,
        scheduled_for=execution.scheduled_for.isoformat() if execution.scheduled_for else None,
        recipient=execution.recipient,
        status=execution.status,
        summary=execution.summary,
        total_count=execution.total_count,
        sent_at=execution.sent_at.isoformat() if execution.sent_at else None,
        error_message=execution.error_message,
    )


@router.get("/prime-reminder/config")
async def get_prime_reminder_config(_admin: User = Depends(require_admin)):
    """Configuration actuelle du rappel DG + prochaine exécution planifiée."""
    return await prime_reminder_config()


@router.put("/prime-reminder/config")
async def update_prime_reminder_config(
    body: PrimeReminderConfigUpdate,
    _admin: User = Depends(require_admin),
):
    """Persiste la configuration du rappel DG (cron)."""
    return await prime_reminder_save_config(
        enabled=body.enabled,
        days=body.days,
        hours=body.hours,
        recipient=body.recipient,
    )


@router.post("/prime-reminder/send")
async def send_prime_reminder_manual(user: User = Depends(require_admin)):
    """Déclenchement manuel immédiat du rappel DG (même génération que le cron)."""
    return await prime_reminder_send_manual(user)


@router.get("/prime-reminder/preview")
async def preview_prime_reminder(_admin: User = Depends(require_admin)):
    """Aperçu du template du rappel DG (aucun email envoyé)."""
    return await prime_reminder_preview()


@router.get("/prime-reminder/executions")
async def list_prime_reminder_executions(
    status: Optional[str] = Query(None, description="Filtrer par statut (SENT, FAILED, MANUAL, ...)"),
    trigger: Optional[str] = Query(None, description="Filtrer par type (CRON, MANUAL)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: User = Depends(require_admin),
):
    """Historique des exécutions du rappel DG (paginated)."""
    qs = PrimeReminderExecution.filter(notification_type="prime_reminder_dg")
    if status:
        qs = qs.filter(status=status.upper())
    if trigger:
        qs = qs.filter(trigger_type=trigger.upper())
    total = await qs.count()
    rows = await qs.order_by("-created_at").offset((page - 1) * size).limit(size)
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [_serialize(r) for r in rows],
    }