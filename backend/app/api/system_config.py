from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from tortoise.exceptions import DoesNotExist

from app.auth import get_current_user
from app.models import User, SystemConfig
from app.config import get_config, set_config, invalidate_cache, CATEGORY_LABELS, CONFIG_DEFINITIONS
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
        # N'exposer que les paramètres définis dans CONFIG_DEFINITIONS.
        # Les clés internes de stockage (ex: other_primes_types, géré par
        # l'onglet « Autres primes ») ne doivent pas apparaître comme menu
        # dans les Paramètres système.
        if row.key not in CONFIG_DEFINITIONS:
            continue
        cat = row.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(SystemConfigItem(
            key=row.key,
            value=get_config(row.key),
            category=cat,
            description=row.description,
            type=CONFIG_DEFINITIONS[row.key].get("type", "string"),
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
        # Refuser les clés internes non définies (ex: other_primes_types)
        if key not in CONFIG_DEFINITIONS:
            continue
        try:
            row = await SystemConfig.get(key=key)
        except DoesNotExist:
            continue
        row.value = value
        await row.save()
        set_config(key, value)
        updated.append(key)
    return {"ok": True, "updated": updated}


LDAP_TESTABLE_KEYS = (
    'LDAP_SERVER_URI',
    'LDAP_BIND_DN',
    'LDAP_BIND_PASSWORD',
    'LDAP_USER_SEARCH_BASE',
)


class LdapTestRequest(BaseModel):
    """Test de la configuration LDAP depuis le menu Configuration.

    ``settings`` permet de tester des valeurs non encore enregistrées
    (le test est sans effet de bord : la configuration est restaurée ensuite).
    ``login`` / ``password`` testent en plus la validation d'un mot de passe
    utilisateur — c'est exactement ce que fait la connexion quand
    ``USE_LDAP_PASSWORD`` est activé.
    """
    settings: Optional[dict] = None
    login: Optional[str] = None
    password: Optional[str] = None


@router.post("/system-config/ldap-test")
async def ldap_test(body: LdapTestRequest, user: User = Depends(get_current_user)):
    _require_admin(user)
    from app.ldap_helpers import LdapUnavailable, connect, temporary_settings, verify_credentials

    overrides = {k: v for k, v in (body.settings or {}).items() if k in LDAP_TESTABLE_KEYS}
    try:
        with temporary_settings(overrides):
            if not body.login or not body.password:
                with connect():
                    pass
                return {
                    "ok": True,
                    "user_checked": False,
                    "message": "Connexion au compte de service LDAP réussie.",
                }
            if not verify_credentials(body.login, body.password):
                raise HTTPException(
                    status_code=400,
                    detail="Identifiant inconnu dans l'annuaire ou mot de passe LDAP refusé.",
                )
            return {
                "ok": True,
                "user_checked": True,
                "message": f"Connexion réussie et mot de passe LDAP valide pour « {body.login} ».",
            }
    except LdapUnavailable as e:
        raise HTTPException(status_code=502, detail=str(e))
