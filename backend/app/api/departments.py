from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from tortoise.functions import Count

from app.models import Department, Employee, User, PrimeMax, ServiceGroup
from app.schemas import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentManagerAssign,
    DepartmentManagerResponse,
)
from app.auth import get_current_user
from app.api.admin import require_admin

router = APIRouter(dependencies=[Depends(get_current_user)])

# Département technique utilisé comme valeur de repli : masqué dans les listes
# et protégé contre la modification/suppression.
RESERVED_NAME = 'Inconnu'
MAX_NAME_LENGTH = 50


def _director_payload(director: Optional[User]) -> Optional[dict]:
    if not director:
        return None
    return {
        "id": director.id,
        "name": director.name,
        "email": director.email,
        "poste": director.poste,
    }


async def _department_payload(dept: Department, employee_count: int = None) -> dict:
    """Charge le directeur du département.

    Le « directeur » est l'utilisateur du département portant le rôle
    `is_directeur` : c'est déjà la convention utilisée par `_department_manager()`
    (employees.py) et par le planificateur de rappels pour trouver le valideur
    de l'étape Directeur. Aucune notion parallèle n'est introduite ici.
    """
    if employee_count is None:
        employee_count = await Employee.filter(dept=dept).count()
    director = await User.filter(dept_str=dept.name, is_directeur=True).first()
    return {
        "id": dept.id,
        "name": dept.name,
        "employee_count": employee_count,
        "director": _director_payload(director),
    }


@router.get("/", response_model=List[DepartmentResponse])
async def list_departments():
    depts = await Department.all().exclude(name=RESERVED_NAME).annotate(
        employee_count=Count('employees')
    ).order_by('name')
    return [
        await _department_payload(d, getattr(d, 'employee_count', 0) or 0)
        for d in depts
    ]


async def _validate_name(name: str, exclude_id: int = None) -> str:
    name = (name or '').strip()
    if not name:
        raise HTTPException(400, "Le nom du département est obligatoire")
    if len(name) > MAX_NAME_LENGTH:
        raise HTTPException(400, f"Le nom ne doit pas dépasser {MAX_NAME_LENGTH} caractères")
    if name.casefold() == RESERVED_NAME.casefold():
        raise HTTPException(400, f"« {RESERVED_NAME} » est un département réservé")
    query = Department.filter(name__iexact=name)
    if exclude_id is not None:
        query = query.exclude(id=exclude_id)
    if await query.exists():
        raise HTTPException(409, f"Le département « {name} » existe déjà")
    return name


@router.post("/", response_model=DepartmentResponse, status_code=201)
async def create_department(data: DepartmentCreate, _admin: User = Depends(require_admin)):
    name = await _validate_name(data.name)
    dept = await Department.create(name=name)
    return await _department_payload(dept, 0)


@router.put("/{department_id}", response_model=DepartmentResponse)
async def rename_department(
    department_id: int,
    data: DepartmentUpdate,
    _admin: User = Depends(require_admin),
):
    """Renomme un département.

    `Employee.dept_str`, `User.dept_str` et `PrimeMax.dept_str` sont des copies
    dénormalisées du nom : sans cette synchronisation, les employés, les
    utilisateurs et les plafonds disparaîtraient du département renommé.
    """
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")
    if dept.name == RESERVED_NAME:
        raise HTTPException(400, f"Le département « {RESERVED_NAME} » ne peut pas être renommé")

    name = await _validate_name(data.name, exclude_id=dept.id)
    if name == dept.name:
        return await _department_payload(dept)

    old_name = dept.name
    await Employee.filter(dept=dept).update(dept_str=name)
    await User.filter(dept_str=old_name).update(dept_str=name)
    await PrimeMax.filter(dept_str=old_name).update(dept_str=name)
    dept.name = name
    await dept.save()

    return await _department_payload(dept)


@router.delete("/{department_id}")
async def delete_department(department_id: int, _admin: User = Depends(require_admin)):
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")
    if dept.name == RESERVED_NAME:
        raise HTTPException(400, f"Le département « {RESERVED_NAME} » ne peut pas être supprimé")

    blockers = []
    employees = await Employee.filter(dept=dept).count()
    if employees:
        blockers.append(f"{employees} employé(s)")
    users = await User.filter(dept=dept).count()
    if users:
        blockers.append(f"{users} utilisateur(s)")
    services = await ServiceGroup.filter(department=dept).count()
    if services:
        blockers.append(f"{services} service(s)")
    primemax = await PrimeMax.filter(dept=dept).count()
    if primemax:
        blockers.append(f"{primemax} plafond(s)")

    if blockers:
        raise HTTPException(
            400,
            f"« {dept.name} » est encore rattaché à {' et '.join(blockers)}. "
            "Transférez-les vers un autre département avant de le supprimer.",
        )

    await dept.delete()
    return {"message": f"Département « {dept.name} » supprimé"}


# --- Directeur du département ---
# Le « directeur » est l'utilisateur du département qui porte le rôle
# `is_directeur`. C'est la convention déjà utilisée par `_department_manager()`
# et par le planificateur pour l'étape de validation Directeur : ce module ne
# crée pas de notion parallèle, il expose simplement ce rôle depuis l'écran
# d'administration des départements.

@router.get("/{department_id}/manager", response_model=DepartmentManagerResponse)
async def get_department_manager(
    department_id: int, _admin: User = Depends(require_admin)
):
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")
    director = await User.filter(dept_str=dept.name, is_directeur=True).first()
    if not director:
        raise HTTPException(404, f"Aucun directeur défini pour « {dept.name} »")
    return director


@router.get("/{department_id}/manager-candidates", response_model=List[DepartmentManagerResponse])
async def list_manager_candidates(
    department_id: int, _admin: User = Depends(require_admin)
):
    """Utilisateurs du département, triés directeur en premier.

    Limité aux comptes « actifs » : on exclut l'admin global (qui n'est pas
    directeur d'un département) et le DG (qui intervient à un autre niveau).
    """
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")
    users = await User.filter(dept_str=dept.name, is_admin=False, is_dg=False).order_by("name")
    return users


@router.put("/{department_id}/manager", response_model=DepartmentResponse)
async def assign_department_manager(
    department_id: int,
    data: DepartmentManagerAssign,
    _admin: User = Depends(require_admin),
):
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")

    candidate = await User.get_or_none(id=data.user_id)
    if not candidate:
        raise HTTPException(404, "Utilisateur introuvable")
    if candidate.dept_str != dept.name:
        raise HTTPException(
            400,
            f"« {candidate.name} » n'appartient pas au département « {dept.name} ».",
        )
    if candidate.is_admin or candidate.is_dg:
        raise HTTPException(
            400, "Un compte administrateur ou DG ne peut pas être directeur de département."
        )

    # Un seul directeur par département : on retire le rôle des précédents.
    await User.filter(dept_str=dept.name, is_directeur=True).exclude(id=candidate.id).update(
        is_directeur=False
    )
    if not candidate.is_directeur:
        candidate.is_directeur = True
        await candidate.save()

    return await _department_payload(dept)


@router.delete("/{department_id}/manager", response_model=DepartmentResponse)
async def clear_department_manager(
    department_id: int, _admin: User = Depends(require_admin)
):
    dept = await Department.get_or_none(id=department_id)
    if not dept:
        raise HTTPException(404, "Département introuvable")
    director = await User.filter(dept_str=dept.name, is_directeur=True).first()
    if not director:
        raise HTTPException(404, f"Aucun directeur défini pour « {dept.name} »")
    director.is_directeur = False
    await director.save()
    return await _department_payload(dept)