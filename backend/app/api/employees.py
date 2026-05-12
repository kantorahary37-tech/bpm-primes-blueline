from fastapi import APIRouter, Depends, HTTPException
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
        pass
    elif user.is_directeur:
        if not user.department:
            raise HTTPException(400, "Aucun département associé à votre profil.")
        query = query.filter(department=user.department)
    else:
        if user.department:
            query = query.filter(department=user.department)
        else:
            query = query.filter(manager_id=user.id)

    if department:
        query = query.filter(department=department)

    return await query


@router.get("/{emp_id}", response_model=EmployeeResponse)
async def get_employee(emp_id: int):
    return await Employee.get(id=emp_id)
