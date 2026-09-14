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

    # Restriction par département : les non-admin ne voient que leur département.
    if user.is_admin or user.is_dg or user.is_drh:
        if department:
            query = query.filter(dept_str=department)
    else:
        query = query.filter(dept_str=user.department)

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
    if department:
        query = query.filter(dept_str=department)
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
async def get_employee(emp_id: int):
    return await Employee.get(id=emp_id)


@router.put("/{emp_id}", response_model=EmployeeResponse)
async def update_employee(emp_id: int, data: EmployeeUpdate):
    emp = await Employee.get(id=emp_id)
    update_data = data.dict(exclude_unset=True)
    if update_data:
        await emp.update_from_dict(update_data)
        await emp.save()
    return await Employee.get(id=emp_id)


class MoveDepartmentRequest(BaseModel):
    employee_ids: List[int]
    target_department: str


@router.post("/move-department")
async def move_employees_department(
    data: MoveDepartmentRequest,
    user: User = Depends(get_current_user),
):
    """Déplace un ou plusieurs employés vers un département cible."""
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Réservé aux admin / DG / DRH")
    if not data.employee_ids:
        raise HTTPException(status_code=400, detail="Aucun employé sélectionné")

    target = data.target_department.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Département cible invalide")

    dept_obj, _ = await Department.get_or_create(name=target)
    employees = await Employee.filter(id__in=data.employee_ids, is_active=True)

    moved = 0
    for emp in employees:
        emp.dept_str = target
        emp.dept = dept_obj
        await emp.save()
        moved += 1

    return {"moved": moved, "target_department": target}
