from fastapi import APIRouter, Depends
from typing import List
from datetime import datetime, timedelta, timezone
from app.models import User, Notification
from app.schemas import *
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

RETENTION_DAYS = 30
_last_cleanup = None


async def cleanup_old_notifications():
    global _last_cleanup
    now = datetime.now(timezone.utc)
    if _last_cleanup and (now - _last_cleanup).total_seconds() < 3600:
        return
    cutoff = now - timedelta(days=RETENTION_DAYS)
    deleted = await Notification.filter(created_at__lt=cutoff).delete()
    _last_cleanup = now
    if deleted:
        print(f"Cleanup: {deleted} old notification(s) deleted")


@router.get("/notifications", response_model=List[NotificationResponse])
async def list_notifications(user: User = Depends(get_current_user)):
    await cleanup_old_notifications()
    since = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    logs = await Notification.filter(user=user, created_at__gte=since).prefetch_related('sender', 'bonus').order_by('-created_at')
    result = []
    for n in logs:
        result.append(NotificationResponse(
            id=n.id,
            user_id=n.user_id,
            bonus_id=n.bonus_id,
            sender_id=n.sender_id,
            sender_name=n.sender.name if n.sender else None,
            type=n.type,
            message=n.message,
            is_read=n.is_read,
            created_at=n.created_at,
        ))
    return result


@router.get("/notifications/unread-count", response_model=UnreadCountResponse)
async def unread_count(user: User = Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    count = await Notification.filter(user=user, is_read=False, created_at__gte=since).count()
    return UnreadCountResponse(count=count)


@router.put("/notifications/{notif_id}/read", response_model=NotificationResponse)
async def mark_as_read(notif_id: int, user: User = Depends(get_current_user)):
    n = await Notification.get(id=notif_id, user=user).prefetch_related('sender')
    n.is_read = True
    await n.save()
    return NotificationResponse(
        id=n.id,
        user_id=n.user_id,
        bonus_id=n.bonus_id,
        sender_id=n.sender_id,
        sender_name=n.sender.name if n.sender else None,
        type=n.type,
        message=n.message,
        is_read=n.is_read,
        created_at=n.created_at,
    )


@router.put("/notifications/read-all")
async def mark_all_read(user: User = Depends(get_current_user)):
    await Notification.filter(user=user, is_read=False).update(is_read=True)
    return {"message": "Toutes les notifications ont été marquées comme lues"}
