from fastapi import APIRouter, Depends, HTTPException
from typing import List
from tortoise.functions import Count

from app.models import Department, Employee, User, PrimeMax, ServiceGroup
from app.schemas import DepartmentCreate, DepartmentUpdate, DepartmentResponse
from app.auth import get_current_user
from app.api.admin import require_admin

router = APIRouter(dependencies=[Depends(get_current_user)])

# Département technique utilisé comme valeur de repli : masqué dans les listes
# et protégé contre la modification/suppression.
RESERVED_NAME = 'Inconnu'
MAX_NAME_LENGTH = 50


@router.get("/", response_model=List[DepartmentResponse])
async def list_departments():
    depts = await Department.all().exclude(name=RESERVED_NAME).annotate(
        employee_count=Count('employees')
    ).order_by('name')
    return [
        {"id": d.id, "name": d.name, "employee_count": getattr(d, 'employee_count', 0) or 0}
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
    return {"id": dept.id, "name": dept.name, "employee_count": 0}


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
        return {
            "id": dept.id,
            "name": dept.name,
            "employee_count": await Employee.filter(dept=dept).count(),
        }

    old_name = dept.name
    await Employee.filter(dept=dept).update(dept_str=name)
    await User.filter(dept_str=old_name).update(dept_str=name)
    await PrimeMax.filter(dept_str=old_name).update(dept_str=name)
    dept.name = name
    await dept.save()

    return {
        "id": dept.id,
        "name": dept.name,
        "employee_count": await Employee.filter(dept=dept).count(),
    }


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