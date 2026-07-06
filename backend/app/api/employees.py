import csv, io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from app.models import Employee, User
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
    user: User = Depends(get_current_user)
):
    query = Employee.all()

    if user.is_dg or user.is_drh:
        if department:
            query = query.filter(dept_str=department)
    else:
        query = query.filter(dept_str=user.department)

    return await query


@router.get("/export")
async def export_employees(
    department: Optional[str] = None,
    columns: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = Employee.all().prefetch_related('manager')
    if department:
        query = query.filter(dept_str=department)
    employees = await query

    all_columns = ["Matricule", "Nom", "Departement", "Manager", "DateCreation"]
    if columns:
        selected = [c.strip() for c in columns.split(',') if c.strip() in all_columns]
    else:
        selected = all_columns[:]

    extractors = {
        "Matricule": lambda e: e.matricule,
        "Nom": lambda e: e.name,
        "Departement": lambda e: e.department,
        "Manager": lambda e: e.manager.name if e.manager else '',
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
