import json
from fastapi import APIRouter, Depends, HTTPException
from tortoise.exceptions import DoesNotExist
from pydantic import BaseModel
from typing import List, Optional

from app.auth import get_current_user
from app.models import User, SystemConfig
from app.config import get_config, set_config

router = APIRouter(dependencies=[Depends(get_current_user)])

CONFIG_KEY = "other_primes_types"
SEED_VERSION_KEY = "other_primes_types_seed_version"
SEED_VERSION = 2

# Types ajoutés après la version 1 (première installation) — version → ids
# v2 : ajout de la « Prime intérimaire » (montant libre) pour les installations existantes
NEW_DEFAULTS_BY_VERSION = {2: [13]}

DEFAULT_OTHER_PRIMES = [
    {"id": 1, "libelle": "Prime d'installation", "category": "wireless", "amount": 10000, "active": True},
    {"id": 2, "libelle": "Prime d'installation", "category": "vsat 1.2 m", "amount": 20000, "active": True},
    {"id": 3, "libelle": "Prime d'installation", "category": "vsat > 2.4 m", "amount": 40000, "active": True},
    {"id": 4, "libelle": "Prime d'intervention chez le client", "category": "wireless/vsat", "amount": 5000, "active": True},
    {"id": 5, "libelle": "Prime de désinstallation", "category": "wireless", "amount": 5000, "active": True},
    {"id": 6, "libelle": "Prime d'éloignement", "category": "jour ouvrable", "amount": 5000, "active": True},
    {"id": 7, "libelle": "Prime d'éloignement", "category": "jour férié et week end", "amount": 7500, "active": True},
    {"id": 8, "libelle": "Prime commission entreprise", "category": "commission grand compte", "amount": 0, "active": True},
    {"id": 9, "libelle": "Prime de rendement", "category": "général", "amount": 0, "active": True},
    {"id": 10, "libelle": "Prime de transport", "category": "transport", "amount": 0, "active": True},
    {"id": 11, "libelle": "Prime de repas", "category": "alimentation", "amount": 0, "active": True},
    {"id": 12, "libelle": "Prime de risque", "category": "sécurité", "amount": 0, "active": True},
    {"id": 13, "libelle": "Prime intérimaire", "category": "intérim", "amount": 0, "active": True, "free_amount": True},
]


async def _save_seed_version():
    """Persiste la version de seed dans SystemConfig (cache + DB)."""
    value = str(SEED_VERSION)
    set_config(SEED_VERSION_KEY, value)
    try:
        row = await SystemConfig.get_or_none(key=SEED_VERSION_KEY)
        if row:
            row.value = value
            await row.save()
        else:
            await SystemConfig.create(
                key=SEED_VERSION_KEY,
                value=value,
                category="primes",
                description="Version de seed des types d'autres primes",
            )
    except Exception:
        pass


async def _ensure_new_defaults(types: list) -> list:
    """Ajoute une seule fois (et PERSISTE) les nouveaux types par défaut
    introduits après la première installation (ex : Prime intérimaire).
    Une suppression manuelle ultérieure par l'admin reste définitive
    (version de seed mémorisée en DB)."""
    try:
        version = int(get_config(SEED_VERSION_KEY) or 1)
    except (TypeError, ValueError):
        version = 1
    if version >= SEED_VERSION:
        return types
    existing_ids = {t.get("id") for t in types}
    # On n'ajoute que les types introduits par les versions supérieures à la
    # version courante, pour ne pas ressusciter d'anciens types supprimés.
    new_ids = {tid for v, ids in NEW_DEFAULTS_BY_VERSION.items() if v > version for tid in ids}
    to_add = [t for t in DEFAULT_OTHER_PRIMES if t["id"] in new_ids and t["id"] not in existing_ids]
    if to_add:
        types = types + to_add
        await _save_types(types)  # persistance immédiate
    await _save_seed_version()
    return types


async def _load_types() -> list:
    """Load other primes types from SystemConfig."""
    raw = get_config(CONFIG_KEY)
    if raw:
        try:
            return await _ensure_new_defaults(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            pass
    return []


async def _save_types(types: list):
    """Save other primes types to SystemConfig (cache + DB)."""
    value = json.dumps(types, ensure_ascii=False)
    set_config(CONFIG_KEY, value)
    try:
        row = await SystemConfig.get_or_none(key=CONFIG_KEY)
        if row:
            row.value = value
            await row.save()
        else:
            await SystemConfig.create(
                key=CONFIG_KEY,
                value=value,
                category="primes",
                description="Types d'autres primes avec montants fixes",
            )
    except Exception:
        pass





class OtherPrimeTypeCreate(BaseModel):
    libelle: str
    category: str
    amount: float
    active: bool = True
    # Montant libre : le montant n'est pas défini en config, l'utilisateur saisit
    # librement la valeur dans le formulaire mensuel.
    free_amount: bool = False


class OtherPrimeTypeUpdate(BaseModel):
    libelle: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    active: Optional[bool] = None
    free_amount: Optional[bool] = None


def _require_admin(user: User):
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(403, "Réservé aux administrateurs, DG ou DRH.")


@router.get("/other-primes-types")
async def get_other_primes_types(user: User = Depends(get_current_user)):
    """Get all other primes types (active only for non-admin users)."""
    types = await _load_types()
    if not types:
        # Seed defaults if empty
        types = DEFAULT_OTHER_PRIMES.copy()
        await _save_types(types)
    if not (user.is_admin or user.is_dg or user.is_drh):
        types = [t for t in types if t.get("active", True)]
    return types


@router.get("/other-primes-types/all")
async def get_all_other_primes_types(user: User = Depends(get_current_user)):
    """Get all other primes types including inactive ones (admin only)."""
    _require_admin(user)
    types = await _load_types()
    if not types:
        types = DEFAULT_OTHER_PRIMES.copy()
        await _save_types(types)
    return types


@router.post("/other-primes-types")
async def create_other_prime_type(data: OtherPrimeTypeCreate, user: User = Depends(get_current_user)):
    """Create a new other primes type (admin only)."""
    _require_admin(user)
    types = await _load_types()
    if not types:
        types = DEFAULT_OTHER_PRIMES.copy()

    # Generate new ID
    max_id = max((t.get("id", 0) for t in types), default=0)
    new_type = {
        "id": max_id + 1,
        "libelle": data.libelle.strip(),
        "category": data.category.strip(),
        "amount": data.amount,
        "active": data.active,
        "free_amount": data.free_amount,
    }
    types.append(new_type)
    await _save_types(types)
    return new_type


@router.put("/other-primes-types/{type_id}")
async def update_other_prime_type(type_id: int, data: OtherPrimeTypeUpdate, user: User = Depends(get_current_user)):
    """Update an other primes type (admin only)."""
    _require_admin(user)
    types = await _load_types()
    if not types:
        raise HTTPException(404, "Aucun type configuré.")

    found = False
    for t in types:
        if t.get("id") == type_id:
            if data.libelle is not None:
                t["libelle"] = data.libelle.strip()
            if data.category is not None:
                t["category"] = data.category.strip()
            if data.amount is not None:
                t["amount"] = data.amount
            if data.active is not None:
                t["active"] = data.active
            if data.free_amount is not None:
                t["free_amount"] = data.free_amount
            found = True
            break

    if not found:
        raise HTTPException(404, f"Type d'prime #{type_id} introuvable.")

    await _save_types(types)
    return next(t for t in types if t.get("id") == type_id)


@router.delete("/other-primes-types/{type_id}")
async def delete_other_prime_type(type_id: int, user: User = Depends(get_current_user)):
    """Delete an other primes type (admin only)."""
    _require_admin(user)
    types = await _load_types()
    if not types:
        raise HTTPException(404, "Aucun type configuré.")

    new_types = [t for t in types if t.get("id") != type_id]
    if len(new_types) == len(types):
        raise HTTPException(404, f"Type d'prime #{type_id} introuvable.")

    await _save_types(new_types)
    return {"message": "Type supprimé", "id": type_id}
