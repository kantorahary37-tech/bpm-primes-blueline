from fastapi import APIRouter, Depends, HTTPException
from tortoise.exceptions import DoesNotExist

from app.auth import get_current_user
from app.models import User, SystemConfig
from app.config import get_config, set_config, invalidate_cache, CATEGORY_LABELS
from app.schemas import SystemConfigResponse, SystemConfigItem, SystemConfigUpdate, SystemConfigBulkUpdate

router = APIRouter(dependencies=[Depends(get_current_user)])


def _require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(403, "Réservé aux administrateurs.")


@router.get("/system-config", response_model=SystemConfigResponse)
async def get_system_config(user: User = Depends(get_current_user)):
    _require_admin(user)
    rows = await SystemConfig.all()
    categories: dict[str, list[SystemConfigItem]] = {}
    for row in rows:
        cat = row.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(SystemConfigItem(
            key=row.key,
            value=get_config(row.key),
            category=cat,
            description=row.description,
        ))
    return SystemConfigResponse(categories=categories)


@router.put("/system-config/{key}")
async def update_system_config(key: str, body: SystemConfigUpdate, user: User = Depends(get_current_user)):
    _require_admin(user)
    try:
        row = await SystemConfig.get(key=key)
    except DoesNotExist:
        raise HTTPException(404, f"Configuration '{key}' introuvable.")
    row.value = body.value
    await row.save()
    set_config(key, body.value)
    return {"ok": True, "key": key, "value": body.value}


@router.post("/system-config/bulk")
async def bulk_update_system_config(body: SystemConfigBulkUpdate, user: User = Depends(get_current_user)):
    _require_admin(user)
    updated = []
    for key, value in body.settings.items():
        try:
            row = await SystemConfig.get(key=key)
        except DoesNotExist:
            continue
        row.value = value
        await row.save()
        set_config(key, value)
        updated.append(key)
    return {"ok": True, "updated": updated}
