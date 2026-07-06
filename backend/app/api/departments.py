from fastapi import APIRouter, Depends
from typing import List
from app.models import Department
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/")
async def list_departments():
    depts = await Department.all().order_by('id')
    return [{"id": d.id, "name": d.name} for d in depts]
