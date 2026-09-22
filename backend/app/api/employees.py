import csv, io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from tortoise.expressions import Q
from app.models import Employee, User, Department
from app.schemas import *
from app.auth import get_current_user
from app.permissions import employee_in_scope, employee_scope, apply_employee_scope

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/", response_model=EmployeeResponse)
async def create_employee(emp: EmployeeCreate):
    obj = await Employee.create(**emp.dict())
    return await Employee.get(id=obj.id)


@router.get("/", response_model=List[EmployeeResponse])
async def list_employees(
    department: Optional[str] = None,
    search: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = Employee.all().filter(is_active=True).prefetch_related('service_group')

    # Restriction par département : les non-admin ne voient que leur département,
    # et un N+1/N+2 avec des services affectés uniquement les employés de ceux-ci.
    if user.is_admin or user.is_dg or user.is_drh:
        if department:
            query = query.filter(dept_str=department)
    else:
        query = query.filter(dept_str=user.department)
        # N+1/N+2 : ses services affectés ; sans affectation → uniquement sa propre fiche
        query = apply_employee_scope(query, await employee_scope(user))

    if search:
        q = search.strip()
        if q:
            query = query.filter(Q(matricule__icontains=q) | Q(name__icontains=q))

    return await query


@router.get("/export")
async def export_employees(
    department: Optional[str] = None,
    columns: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = Employee.all().filter(is_active=True).prefetch_related('manager')

    # Même périmètre que la liste des employés : un N+1/N+2 ne peut exporter
    # que les employés de son département et de ses services affectés.
    if user.is_admin or user.is_dg or user.is_drh:
        if department:
            query = query.filter(dept_str=department)
    else:
        query = query.filter(dept_str=user.department)
        # N+1/N+2 : ses services affectés ; sans affectation → uniquement sa propre fiche
        query = apply_employee_scope(query, await employee_scope(user))
    employees = await query

    all_columns = ["Matricule", "Nom", "Departement", "Manager", "Devise", "DateCreation"]
    if columns:
        selected = [c.strip() for c in columns.split(',') if c.strip() in all_columns]
    else:
        selected = all_columns[:]

    extractors = {
        "Matricule": lambda e: e.matricule,
        "Nom": lambda e: e.name,
        "Departement": lambda e: e.department,
        "Manager": lambda e: e.manager.name if e.manager else '',
        "Devise": lambda e: e.currency.value if hasattr(e.currency, 'value') else (e.currency or 'Ar'),
        "DateCreation": lambda e: e.created_at.isoformat() if e.created_at else '',
    }

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(selected)
    for e in employees:
        writer.writerow([extractors[col](e) for col in selected])

    output.seek(0)
    return StreamingResponse(
        iter(['\ufeff' + output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=export_employes_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/{emp_id}", response_model=EmployeeResponse)
async def get_employee(emp_id: int, user: User = Depends(get_current_user)):
    emp = await Employee.get_or_none(id=emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    # Un N+1/N+2 restreint ne peut consulter qu'un employé de ses services
    if not await employee_in_scope(user, emp):
        raise HTTPException(status_code=404, detail="Employé introuvable")
    return emp


@router.put("/{emp_id}", response_model=EmployeeResponse)
async def update_employee(emp_id: int, data: EmployeeUpdate, user: User = Depends(get_current_user)):
    emp = await Employee.get_or_none(id=emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    # Un N+1/N+2 restreint ne peut modifier qu'un employé de ses services
    if not await employee_in_scope(user, emp):
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que les employés de vos services affectés")
    update_data = data.dict(exclude_unset=True)
    if update_data:
        await emp.update_from_dict(update_data)
        await emp.save()
    return await Employee.get(id=emp_id)


class MoveDepartmentRequest(BaseModel):
    employee_ids: List[int]
    target_department: str


async def _department_manager(dept_name: str) -> Optional[User]:
    """Manager d'un département : le Directeur, sinon un N+1, sinon un autre
    utilisateur du département, sinon le DG (mêmes replis que la résolution LDAP).
    """
    mgr = await User.filter(dept_str=dept_name, is_directeur=True, is_admin=False).first()
    if mgr:
        return mgr
    mgr = await User.filter(dept_str=dept_name, is_validator_n1=True, is_admin=False).first()
    if mgr:
        return mgr
    mgr = await User.filter(dept_str=dept_name, is_admin=False).first()
    if mgr:
        return mgr
    return await User.filter(is_dg=True).first()


@router.post("/move-department")
async def move_employees_department(
    data: MoveDepartmentRequest,
    user: User = Depends(get_current_user),
):
    """Déplace un ou plusieurs employés vers un département cible.

    L'employé déplacé reprend le manager du département cible (Directeur, sinon
    N+1, sinon DG) et perd son affectation de service antérieure, qui appartient
    au département d'origine.
    """
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Réservé aux admin / DG / DRH")
    if not data.employee_ids:
        raise HTTPException(status_code=400, detail="Aucun employé sélectionné")

    target = data.target_department.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Département cible invalide")

    dept_obj, _ = await Department.get_or_create(name=target)
    employees = await Employee.filter(id__in=data.employee_ids, is_active=True)
    new_manager = await _department_manager(target)

    moved = 0
    for emp in employees:
        changing_dept = emp.dept_str != target
        if changing_dept:
            # L'ancien service appartient au département d'origine
            emp.service_group = None
        if new_manager:
            emp.manager = new_manager
        emp.dept_str = target
        emp.dept = dept_obj
        await emp.save()
        moved += 1

    return {
        "moved": moved,
        "target_department": target,
        "manager": new_manager.name if new_manager else None,
    }
