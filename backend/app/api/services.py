from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from tortoise.exceptions import DoesNotExist, IntegrityError

from app.models import ServiceGroup, Department, Employee, User
from app.schemas import ServiceGroupCreate, ServiceGroupRename, ServiceAssignRequest, ServiceManagersAssignRequest
from app.auth import get_current_user
from app.api.users import employee_lookup

router = APIRouter(dependencies=[Depends(get_current_user)])


def can_manage(user: User, department: str) -> bool:
    """Peut gérer les services d'un département donné."""
    if user.is_admin or user.is_dg or user.is_drh:
        return True
    if (user.is_directeur or user.is_validator_n1) and user.department == department:
        return True
    return False


@router.get("/", response_model=List[dict])
async def list_services(
    department: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    scoped_dept = None
    if not (user.is_admin or user.is_dg or user.is_drh):
        scoped_dept = user.department

    target = department or scoped_dept

    query = ServiceGroup.all().prefetch_related('department', 'employees_service_group')
    if target:
        try:
            dept = await Department.get(name=target)
        except DoesNotExist:
            return []
        query = query.filter(department=dept)

    groups = await query.order_by('name')
    return [
        {
            "id": g.id,
            "name": g.name,
            "department": g.department.name,
            "employee_count": len(g.employees_service_group),
        }
        for g in groups
    ]


@router.post("/", response_model=dict, status_code=201)
async def create_service(
    data: ServiceGroupCreate,
    user: User = Depends(get_current_user),
):
    if not can_manage(user, data.department):
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer les services que de votre département.")
    try:
        dept = await Department.get(name=data.department)
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Département introuvable.")
    try:
        group = await ServiceGroup.create(name=data.name.strip(), department=dept, created_by=user)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Un service avec ce nom existe déjà dans ce département.")
    return {"id": group.id, "name": group.name, "department": dept.name, "employee_count": 0}


@router.patch("/{group_id}", response_model=dict)
async def rename_service(
    group_id: int,
    data: ServiceGroupRename,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que les services de votre département.")
    group.name = data.name.strip()
    try:
        await group.save()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Un service avec ce nom existe déjà dans ce département.")
    return {"id": group.id, "name": group.name, "department": group.department.name}


@router.delete("/{group_id}", response_model=dict)
async def delete_service(
    group_id: int,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que les services de votre département.")
    # Désassigner puis supprimer
    await Employee.filter(service_group=group).update(service_group=None)
    await group.delete()
    return {"message": "Service supprimé."}


@router.post("/{group_id}/employees", response_model=dict)
async def assign_employees(
    group_id: int,
    data: ServiceAssignRequest,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez affecter des employés qu'aux services de votre département.")

    dept_name = group.department.name
    employees = await Employee.filter(id__in=data.employee_ids)
    if len(employees) != len(set(data.employee_ids)):
        raise HTTPException(status_code=404, detail="Un ou plusieurs employés sont introuvables.")
    for emp in employees:
        if emp.dept_str != dept_name:
            raise HTTPException(status_code=400, detail=f"L'employé {emp.name} n'appartient pas au département du service.")
        emp.service_group = group
        await emp.save()
    return {"message": f"{len(employees)} employé(s) affecté(s) au service {group.name}."}


@router.delete("/{group_id}/employees/{emp_id}", response_model=dict)
async def unassign_employee(
    group_id: int,
    emp_id: int,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que les services de votre département.")
    emp = await Employee.get_or_none(id=emp_id)
    if not emp or emp.service_group_id != group.id:
        raise HTTPException(status_code=404, detail="Employé introuvable dans ce service.")
    emp.service_group = None
    await emp.save()
    return {"message": "Employé retiré du service."}


# --- Affectation des N+1 (responsables) aux services ---


@router.get("/{group_id}/managers", response_model=List[dict])
async def list_managers(
    group_id: int,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez consulter que les services de votre département.")
    managers = await group.managers.all()
    emp_by_key = await employee_lookup()
    result = []
    for u in managers:
        emp = emp_by_key.get(((u.name or '').strip().lower(), u.department or ''))
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "poste": u.poste,
            "department": u.department,
            "matricule": emp.matricule if emp else None,
        })
    return result


@router.post("/{group_id}/managers", response_model=dict)
async def assign_managers(
    group_id: int,
    data: ServiceManagersAssignRequest,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que les services de votre département.")
    managers = await User.filter(id__in=data.user_ids, is_validator_n1=True)
    if len(managers) != len(set(data.user_ids)):
        raise HTTPException(status_code=404, detail="Un ou plusieurs N+1 sont introuvables.")
    dept_name = group.department.name
    for m in managers:
        if m.department != dept_name:
            raise HTTPException(status_code=400, detail=f"Le N+1 {m.name} n'appartient pas au département du service.")
        await group.managers.add(m)
    return {"message": f"{len(managers)} N+1 affecté(s) au service {group.name}."}


@router.delete("/{group_id}/managers/{user_id}", response_model=dict)
async def unassign_manager(
    group_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
):
    try:
        group = await ServiceGroup.get(id=group_id).prefetch_related('department')
    except DoesNotExist:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if not can_manage(user, group.department.name):
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que les services de votre département.")
    manager = await User.get_or_none(id=user_id)
    if not manager:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    await group.managers.remove(manager)
    return {"message": "N+1 retiré du service."}