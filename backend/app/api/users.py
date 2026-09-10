from fastapi import APIRouter, Depends
from typing import List
from app.models import User, Employee
from app.schemas import UserResponse
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


async def employee_lookup():
    """Index des employés par (nom, département) — sert à retrouver le matricule d'un utilisateur."""
    employees = await Employee.all().only('name', 'dept_str', 'matricule')
    return {
        ((e.name or '').strip().lower(), e.dept_str or ''): e
        for e in employees
    }


@router.get("/", response_model=List[UserResponse])
async def list_users():
    users = await User.all()
    emp_by_key = await employee_lookup()
    data = []
    for u in users:
        item = UserResponse.model_validate(u).model_dump()
        emp = emp_by_key.get(((u.name or '').strip().lower(), u.department or ''))
        item['matricule'] = emp.matricule if emp else None
        data.append(item)
    return data
