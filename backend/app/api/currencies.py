from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models import Currency, User
from app.schemas import CurrencyCreate, CurrencyUpdate, CurrencyResponse
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


def can_manage(user: User):
    return user.is_admin or user.is_dg or user.is_drh


@router.get("/", response_model=List[CurrencyResponse])
async def list_currencies(active_only: bool = True):
    query = Currency.all()
    if active_only:
        query = query.filter(active=True)
    return await query.order_by('code')


@router.post("/", response_model=CurrencyResponse)
async def create_currency(data: CurrencyCreate, user: User = Depends(get_current_user)):
    if not can_manage(user):
        raise HTTPException(403, "Seuls l'administrateur, le DG et la DRH peuvent ajouter une devise")
    code = (data.code or '').strip().upper()
    if not code:
        raise HTTPException(400, "Le code de la devise est obligatoire")
    if await Currency.get_or_none(code=code):
        raise HTTPException(409, f"La devise '{code}' existe déjà")
    obj = await Currency.create(code=code, symbol=data.symbol or code, label=data.label or '', active=data.active)
    return obj


@router.put("/{code}", response_model=CurrencyResponse)
async def update_currency(code: str, data: CurrencyUpdate, user: User = Depends(get_current_user)):
    if not can_manage(user):
        raise HTTPException(403, "Seuls l'administrateur, le DG et la DRH peuvent modifier une devise")
    obj = await Currency.get_or_none(code=code)
    if not obj:
        raise HTTPException(404, "Devise introuvable")
    update_data = data.dict(exclude_unset=True)
    if obj.is_system and 'active' in update_data and update_data['active'] is False:
        raise HTTPException(400, "Les devises système (Ar, EUR) ne peuvent pas être désactivées")
    if update_data:
        await obj.update_from_dict(update_data)
        await obj.save()
    return obj


@router.delete("/{code}")
async def delete_currency(code: str, user: User = Depends(get_current_user)):
    if not can_manage(user):
        raise HTTPException(403, "Seuls l'administrateur, le DG et la DRH peuvent supprimer une devise")
    obj = await Currency.get_or_none(code=code)
    if not obj:
        raise HTTPException(404, "Devise introuvable")
    if obj.is_system:
        raise HTTPException(400, "Les devises système (Ar, EUR) ne peuvent pas être supprimées")
    await obj.delete()
    return {"message": f"Devise '{code}' supprimée"}