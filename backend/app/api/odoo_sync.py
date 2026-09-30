"""
Comparaison Odoo ⇄ application : état d'archivage des employés.

- `GET  /odoo/employees/compare` : rapport (sans rien modifier) des écarts
  entre `hr.employee.active` d'Odoo et `employee.is_archived` de l'application ;
- `POST /odoo/employees/archive` : archivage (en masse) des employés signalés.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import Employee, User
from app.odoo_service import compare_with_app

router = APIRouter()


def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


@router.get("/odoo/employees/compare")
async def compare_odoo_employees(_admin: User = Depends(require_admin)):
    """Rapport de comparaison (lecture seule)."""
    return await compare_with_app()


class OdooArchiveRequest(BaseModel):
    ids: list[int]
    reason: str = ""


@router.post("/odoo/employees/archive")
async def archive_from_odoo(data: OdooArchiveRequest, admin: User = Depends(require_admin)):
    """Archive les employés sélectionnés (ceux signalés par la comparaison)."""
    if not data.ids:
        raise HTTPException(status_code=400, detail="Aucun employé sélectionné")

    reason = (data.reason or "").strip() or "Archivé dans Odoo"
    archived, skipped = [], []
    for emp in await Employee.filter(id__in=data.ids):
        if emp.is_archived:
            skipped.append({"id": emp.id, "matricule": emp.matricule, "detail": "déjà archivé"})
            continue
        emp.is_archived = True
        emp.archived_by = admin
        emp.archived_at = datetime.now()
        emp.archive_reason = reason
        await emp.save()
        archived.append({"id": emp.id, "matricule": emp.matricule, "name": emp.name})

    return {
        "count": len(archived),
        "reason": reason,
        "archived": archived,
        "skipped": skipped,
    }
