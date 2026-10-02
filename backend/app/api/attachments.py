"""Pièces jointes déposées par les validateurs (N+1 / N+2) lors d'une validation.

Un N+1 (ou N+2) peut joindre un fichier facultatif au moment où il valide une
prime : le Directeur du département de l'employé concerné le retrouve dans la
page « Pièces jointes ». Le téléchargement passe par cette route (et non par
``GET /uploads/{filename}``) afin que l'accès au fichier soit filtré comme le
reste : un Directeur ne voit que les pièces de son département.
"""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from tortoise.expressions import Q

from app.api.upload import MEDIA_TYPES, UPLOAD_DIR
from app.auth import get_current_user
from app.models import ServiceGroup, User, ValidationAttachment
from app.schemas import ValidationAttachmentResponse

router = APIRouter(dependencies=[Depends(get_current_user)])

# Rôles qui consultent les pièces jointes sans restriction de département
BROAD_ROLES = ('is_admin', 'is_dg', 'is_drh')


def _is_broad(user: User) -> bool:
    return any(getattr(user, r) for r in BROAD_ROLES)


def _can_access(user: User, dept_str: str | None) -> bool:
    """Admin/DG/DRH : tout. Directeur : son département uniquement."""
    if _is_broad(user):
        return True
    return bool(user.is_directeur and user.department and dept_str == user.department)


async def _sender_services(user: User | None) -> str:
    """Service(s) du déposant : services gérés (page Services) + services affectés
    (page Utilisateurs), comme le périmètre de validation d'un N+1."""
    if not user:
        return ''
    return ', '.join(sorted(await _services_of_senders([user.id])))


def _attachment_url(att: ValidationAttachment) -> str:
    return f"/api/v1/validation-attachments/{att.id}/download"


async def _senders_of_service(service: str) -> list[int]:
    """Utilisateurs rattachés à un service, toutes sources confondues :
    services gérés (page Services) et services affectés (page Utilisateurs)."""
    group_ids = list(await ServiceGroup.filter(name=service).values_list('id', flat=True))
    if not group_ids:
        return []
    senders = User.filter(
        Q(service_groups__id__in=group_ids)
        | Q(service_assignments__service_group_id__in=group_ids)
    )
    # distinct() : l'OR sur les deux tables de liaison peut doubler un user
    return list(await senders.distinct().values_list('id', flat=True))


async def _services_of_senders(sender_ids) -> set[str]:
    """Services des utilisateurs donnés (les deux sources), sans doublon."""
    if hasattr(sender_ids, "__await__") or hasattr(sender_ids, "all"):
        sender_ids = list(await sender_ids)
    sender_ids = list(sender_ids)
    if not sender_ids:
        return set()
    managed = await ServiceGroup.filter(managers__id__in=sender_ids).values_list('name', flat=True)
    assigned = await ServiceGroup.filter(
        user_assignments__user_id__in=sender_ids
    ).values_list('name', flat=True)
    return set(managed) | set(assigned)


async def _serialize(att: ValidationAttachment, validation, bonus, employee) -> dict:
    return {
        "id": att.id,
        "bonus_id": att.bonus_id,
        "validation_id": att.validation_id,
        "original_name": att.original_name,
        "size": att.size or 0,
        "url": _attachment_url(att),
        "step": validation.step if validation else None,
        "action": validation.action if validation else None,
        "uploaded_by_id": att.uploaded_by_id,
        "uploaded_by_name": att.uploaded_by.name if att.uploaded_by else None,
        "uploaded_by_service": await _sender_services(att.uploaded_by),
        "employee_id": employee.id if employee else None,
        "employee_name": employee.name if employee else None,
        "employee_matricule": employee.matricule if employee else None,
        "department": att.dept_str,
        "bonus_type": bonus.bonus_type.value if bonus else None,
        "bonus_status": bonus.status.value if bonus else None,
        "total_amount": float(bonus.total_amount) if bonus else None,
        "currency": bonus.currency if bonus else None,
        "created_at": att.created_at,
    }


@router.get("/validation-attachments/services", response_model=list[str])
async def list_validation_attachment_services(user: User = Depends(get_current_user)):
    """Services des déposants, pour alimenter le filtre de la page.

    Même périmètre que la liste : un Directeur ne voit que les services de son
    département (les déposants de ses équipes).
    """
    if not _is_broad(user) and not user.is_directeur:
        raise HTTPException(status_code=403, detail="Réservé aux Directeurs, DG, DRH et administrateurs")

    query = ValidationAttachment.all()
    if not _is_broad(user):
        query = query.filter(dept_str=user.department)

    # Les pièces sans service (déposant sans affectation) sont ignorées.
    return sorted(await _services_of_senders(query.values_list('uploaded_by_id', flat=True)))


@router.get("/validation-attachments/", response_model=list[ValidationAttachmentResponse])
async def list_validation_attachments(
    department: str | None = None,
    service: str | None = None,
    month: int | None = None,
    year: int | None = None,
    search: str | None = None,
    bonus_id: int | None = None,
    user: User = Depends(get_current_user),
):
    """Pièces jointes visibles par l'utilisateur.

    Un Directeur est limité à son département ; admin/DG/DRH voient tout et
    peuvent filtrer par département, service du déposant, mois/année de dépôt,
    ou rechercher sur le nom, le matricule de l'employé ou le nom du fichier.
    """
    if not _is_broad(user) and not user.is_directeur:
        raise HTTPException(status_code=403, detail="Réservé aux Directeurs, DG, DRH et administrateurs")

    query = ValidationAttachment.all().prefetch_related(
        'uploaded_by', 'validation', 'bonus', 'bonus__employee',
    ).order_by('-created_at')

    if _is_broad(user):
        if department:
            query = query.filter(dept_str=department)
    else:
        query = query.filter(dept_str=user.department)

    if service:
        query = query.filter(uploaded_by_id__in=await _senders_of_service(service))

    if year and month:
        # Intervalle du mois demandé plutôt que EXTRACT() : portable et indexable
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
        query = query.filter(
            created_at__gte=start,
            created_at__lt=datetime(next_year, next_month, 1, tzinfo=timezone.utc),
        )
    elif year:
        query = query.filter(
            created_at__gte=datetime(year, 1, 1, tzinfo=timezone.utc),
            created_at__lt=datetime(year + 1, 1, 1, tzinfo=timezone.utc),
        )

    if bonus_id is not None:
        query = query.filter(bonus_id=bonus_id)

    if search:
        q = search.strip()
        if q:
            query = query.filter(
                Q(original_name__icontains=q)
                | Q(bonus__employee__name__icontains=q)
                | Q(bonus__employee__matricule__icontains=q)
            )

    attachments = await query
    return [
        await _serialize(att, att.validation, att.bonus, att.bonus.employee if att.bonus else None)
        for att in attachments
    ]


@router.delete("/validation-attachments/{attachment_id}")
async def delete_validation_attachment(attachment_id: int, user: User = Depends(get_current_user)):
    """Supprime une pièce jointe (ligne + fichier), après vérification du périmètre."""
    if not _is_broad(user) and not user.is_directeur:
        raise HTTPException(status_code=403, detail="Réservé aux Directeurs, DG, DRH et administrateurs")

    att = await ValidationAttachment.get_or_none(id=attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable")
    if not _can_access(user, att.dept_str):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer cette pièce jointe")

    stored_name = att.stored_name
    await att.delete()

    # Le fichier peut être partagé par plusieurs primes (pièce jointe de lot) :
    # on ne le retire du disque que s'il n'est plus référencé.
    still_used = await ValidationAttachment.filter(stored_name=stored_name).exists()
    if not still_used:
        filepath = os.path.join(UPLOAD_DIR, os.path.basename(stored_name))
        if os.path.abspath(os.path.dirname(filepath)) == os.path.abspath(UPLOAD_DIR) \
                and os.path.isfile(filepath):
            os.remove(filepath)

    return {"message": "Pièce jointe supprimée", "id": attachment_id}


@router.get("/validation-attachments/{attachment_id}/download")
async def download_validation_attachment(attachment_id: int, user: User = Depends(get_current_user)):
    """Télécharge une pièce jointe, après vérification du périmètre de l'utilisateur."""
    att = await ValidationAttachment.get_or_none(id=attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable")
    if not _can_access(user, att.dept_str):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas accéder à cette pièce jointe")

    filename = os.path.basename(att.stored_name)
    filepath = os.path.join(UPLOAD_DIR, filename)
    if os.path.abspath(os.path.dirname(filepath)) != os.path.abspath(UPLOAD_DIR) \
            or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    ext = os.path.splitext(filename)[1].lower()
    return FileResponse(
        filepath,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        filename=att.original_name or filename,
    )