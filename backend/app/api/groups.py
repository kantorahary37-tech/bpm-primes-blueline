"""
API pour les groupes (sous-départements) et les assignations directeur ↔ groupe.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from tortoise.expressions import Q
from app.models import Group, Department, User, Employee, DirectorGroupAssignment
from app.schemas import (
    GroupCreate, GroupUpdate, GroupResponse,
    DirectorGroupAssignRequest, DirectorGroupUnassignRequest,
    DirectorGroupAssignmentResponse,
    EmployeeGroupAssignRequest, BulkEmployeeGroupAssignRequest,
    DirectorValidationScope,
)
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


def dept_to_str(v):
    if hasattr(v, 'name'):
        return v.name
    return v


# ---------------------------------------------------------------------------
# Groupes CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[GroupResponse])
async def list_groups(
    department: Optional[str] = None,
    active_only: bool = True,
    user: User = Depends(get_current_user),
):
    """Liste les groupes, optionnellement filtrés par département.

    Les directeurs et N+1 ne voient que les groupes de leur propre département.
    """
    is_scoped = (user.is_directeur or user.is_validator_n1) and not user.is_admin and not user.is_dg and not user.is_drh
    query = Group.all().prefetch_related('department')
    if is_scoped:
        query = query.filter(department__name=user.dept_str)
    elif department:
        query = query.filter(department__name=department)
    if active_only:
        query = query.filter(active=True)

    groups = await query.order_by('department__name', 'name')
    result = []
    for g in groups:
        emp_count = await Employee.filter(group_id=g.id, is_active=True).count()
        dir_count = await DirectorGroupAssignment.filter(group_id=g.id).count()
        result.append(GroupResponse(
            id=g.id,
            name=g.name,
            department=g.department.name if g.department else '',
            active=g.active,
            created_at=g.created_at,
            employee_count=emp_count,
            director_count=dir_count,
        ))
    return result


@router.get("/all", response_model=List[GroupResponse])
async def list_all_groups(department: Optional[str] = None, user: User = Depends(get_current_user)):
    """Inclut les groupes inactifs (pour l'admin)."""
    return await list_groups(department=department, active_only=False, user=user)


@router.post("/", response_model=GroupResponse, status_code=201)
async def create_group(data: GroupCreate, user: User = Depends(get_current_user)):
    if not user.is_admin and not user.is_directeur and not user.is_validator_n1:
        raise HTTPException(403, "Non autorisé")
    dept = await Department.get_or_none(name=data.department)
    if not dept:
        raise HTTPException(400, f"Département '{data.department}' introuvable")
    if not user.is_admin and data.department != user.dept_str:
        raise HTTPException(403, "Vous ne pouvez créer des équipes que dans votre département")
    existing = await Group.get_or_none(name=data.name, department=dept)
    if existing:
        raise HTTPException(409, f"L'équipe '{data.name}' existe déjà dans '{data.department}'")
    g = await Group.create(name=data.name, department=dept, active=data.active)
    return GroupResponse(
        id=g.id, name=g.name, department=dept.name,
        active=g.active, created_at=g.created_at,
        employee_count=0, director_count=0,
    )


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(group_id: int, data: GroupUpdate, user: User = Depends(get_current_user)):
    if not user.is_admin and not user.is_directeur and not user.is_validator_n1:
        raise HTTPException(403, "Non autorisé")
    g = await Group.get_or_none(id=group_id)
    if not g:
        raise HTTPException(404, "Équipe introuvable")
    if not user.is_admin:
        await g.fetch_related('department')
        if g.department.name != user.dept_str:
            raise HTTPException(403, "Vous ne pouvez modifier que des équipes de votre département")
    if data.name is not None:
        g.name = data.name
    if data.active is not None:
        g.active = data.active
    await g.save()
    await g.fetch_related('department')
    emp_count = await Employee.filter(group_id=g.id, is_active=True).count()
    dir_count = await DirectorGroupAssignment.filter(group_id=g.id).count()
    return GroupResponse(
        id=g.id, name=g.name, department=g.department.name if g.department else '',
        active=g.active, created_at=g.created_at,
        employee_count=emp_count, director_count=dir_count,
    )


@router.delete("/{group_id}")
async def delete_group(group_id: int, user: User = Depends(get_current_user)):
    if not user.is_admin and not user.is_directeur and not user.is_validator_n1:
        raise HTTPException(403, "Non autorisé")
    g = await Group.get_or_none(id=group_id)
    if not g:
        raise HTTPException(404, "Équipe introuvable")
    if not user.is_admin:
        await g.fetch_related('department')
        if g.department.name != user.dept_str:
            raise HTTPException(403, "Vous ne pouvez supprimer que des équipes de votre département")
    # Déassigner les employés avant suppression
    employees_in_group = await Employee.filter(group_id=g.id)
    for emp in employees_in_group:
        emp.group = None
        await emp.save()
    await DirectorGroupAssignment.filter(group_id=g.id).delete()
    await g.delete()
    return {"message": "Équipe supprimée"}


# ---------------------------------------------------------------------------
# Assignation Directeur ↔ Groupe
# ---------------------------------------------------------------------------

@router.get("/directors/assignments", response_model=List[DirectorGroupAssignmentResponse])
async def list_director_assignments(department: Optional[str] = None):
    """Liste toutes les assignations directeur ↔ groupe."""
    query = DirectorGroupAssignment.all().prefetch_related('director', 'group', 'group__department')
    if department:
        query = query.filter(group__department__name=department)
    assignments = await query.order_by('director__name', 'group__name')
    return [
        DirectorGroupAssignmentResponse(
            id=a.id,
            director_id=a.director_id,
            director_name=a.director.name if a.director else None,
            group_id=a.group_id,
            group_name=a.group.name if a.group else None,
            department=a.group.department.name if a.group and a.group.department else None,
            created_at=a.created_at,
        )
        for a in assignments
    ]


@router.post("/directors/assign")
async def assign_director_to_group(
    data: DirectorGroupAssignRequest,
    user: User = Depends(get_current_user),
):
    """Assigne un directeur à un groupe."""
    if not user.is_admin and not user.is_directeur:
        raise HTTPException(403, "Non autorisé")
    director = await User.get_or_none(id=data.director_id)
    if not director or not director.is_directeur:
        raise HTTPException(400, "L'utilisateur n'est pas un directeur")
    group = await Group.get_or_none(id=data.group_id)
    if not group:
        raise HTTPException(404, "Équipe introuvable")
    if not user.is_admin:
        await group.fetch_related('department')
        if group.department.name != user.dept_str:
            raise HTTPException(403, "Vous ne pouvez assigner que des équipes de votre département")
    existing = await DirectorGroupAssignment.get_or_none(
        director_id=data.director_id, group_id=data.group_id
    )
    if existing:
        raise HTTPException(409, "Ce directeur est déjà assigné à cette équipe")
    await DirectorGroupAssignment.create(director_id=data.director_id, group_id=data.group_id)
    return {"message": "Directeur assigné à l'équipe"}


@router.post("/directors/unassign")
async def unassign_director_from_group(
    data: DirectorGroupUnassignRequest,
    user: User = Depends(get_current_user),
):
    """Retire un directeur d'un groupe."""
    if not user.is_admin and not user.is_directeur:
        raise HTTPException(403, "Non autorisé")
    assignment = await DirectorGroupAssignment.get_or_none(
        director_id=data.director_id, group_id=data.group_id
    )
    if not assignment:
        raise HTTPException(404, "Assignation introuvable")
    if not user.is_admin:
        group = await Group.get_or_none(id=data.group_id)
        if group:
            await group.fetch_related('department')
            if group.department.name != user.dept_str:
                raise HTTPException(403, "Vous ne pouvez modifier que des équipes de votre département")
    await assignment.delete()
    return {"message": "Assignation supprimée"}


@router.get("/directors/{director_id}/scope", response_model=DirectorValidationScope)
async def get_director_validation_scope(director_id: int):
    """Retourne le périmètre de validation d'un directeur (groupes + employés)."""
    director = await User.get_or_none(id=director_id)
    if not director or not director.is_directeur:
        raise HTTPException(404, "Directeur introuvable")

    assignments = await DirectorGroupAssignment.filter(
        director_id=director_id
    ).prefetch_related('group', 'group__department')

    groups_info = []
    total_employees = 0
    for a in assignments:
        g = a.group
        emp_count = await Employee.filter(group_id=g.id, is_active=True).count()
        total_employees += emp_count
        groups_info.append({
            "group_id": g.id,
            "group_name": g.name,
            "department": g.department.name if g.department else '',
            "employee_count": emp_count,
        })

    return DirectorValidationScope(
        director_id=director.id,
        director_name=director.name,
        groups=groups_info,
        total_employees=total_employees,
    )


@router.get("/directors/all-scopes", response_model=List[DirectorValidationScope])
async def get_all_director_scopes():
    """Vue complète de tous les directeurs et leur périmètre de validation (pour admin)."""
    directors = await User.filter(is_directeur=True, is_admin=False)
    result = []
    for d in directors:
        assignments = await DirectorGroupAssignment.filter(
            director_id=d.id
        ).prefetch_related('group', 'group__department')
        groups_info = []
        total_employees = 0
        for a in assignments:
            g = a.group
            emp_count = await Employee.filter(group_id=g.id, is_active=True).count()
            total_employees += emp_count
            groups_info.append({
                "group_id": g.id,
                "group_name": g.name,
                "department": g.department.name if g.department else '',
                "employee_count": emp_count,
            })
        result.append(DirectorValidationScope(
            director_id=d.id,
            director_name=d.name,
            groups=groups_info,
            total_employees=total_employees,
        ))
    return result


# ---------------------------------------------------------------------------
# Assignation Employé ↔ Groupe
# ---------------------------------------------------------------------------

@router.post("/employees/assign")
async def assign_employee_to_group(
    data: EmployeeGroupAssignRequest,
    user: User = Depends(get_current_user),
):
    """Assigne un employé à un groupe (ou le désassigne si group_id=None)."""
    if not user.is_admin and not user.is_directeur and not user.is_validator_n1:
        raise HTTPException(403, "Non autorisé")
    employee = await Employee.get_or_none(id=data.employee_id)
    if not employee:
        raise HTTPException(404, "Employé introuvable")
    if not user.is_admin:
        await employee.fetch_related('department')
        if employee.department.name != user.dept_str:
            raise HTTPException(403, "Vous ne pouvez assigner que des employés de votre département")
    if data.group_id is not None:
        group = await Group.get_or_none(id=data.group_id)
        if not group:
            raise HTTPException(404, "Équipe introuvable")
        if not user.is_admin:
            await group.fetch_related('department')
            if group.department.name != user.dept_str:
                raise HTTPException(403, "Vous ne pouvez assigner que des équipes de votre département")
        # Vérifier que le groupe est dans le même département que l'employé
        if group.department_id != employee.dept_id:
            raise HTTPException(400, "L'équipe doit être dans le même département que l'employé")
        employee.group_id = data.group_id
    else:
        employee.group_id = None
    await employee.save()
    return {"message": "Employé assigné à l'équipe" if data.group_id else "Assignation retirée"}


@router.post("/employees/bulk-assign")
async def bulk_assign_employees_to_group(
    data: BulkEmployeeGroupAssignRequest,
    user: User = Depends(get_current_user),
):
    """Assigne plusieurs employés à un groupe en une seule opération."""
    if not user.is_admin and not user.is_directeur and not user.is_validator_n1:
        raise HTTPException(403, "Non autorisé")
    group = await Group.get_or_none(id=data.group_id)
    if not group:
        raise HTTPException(404, "Équipe introuvable")
    if not user.is_admin:
        await group.fetch_related('department')
        if group.department.name != user.dept_str:
            raise HTTPException(403, "Vous ne pouvez assigner que des équipes de votre département")
    employees = await Employee.filter(id__in=data.employee_ids, is_active=True)
    assigned = 0
    for emp in employees:
        if not user.is_admin:
            await emp.fetch_related('department')
            if emp.department.name != user.dept_str:
                continue
        if emp.dept_id == group.department_id:
            emp.group_id = data.group_id
            await emp.save()
            assigned += 1
    return {"message": f"{assigned} employé(s) assigné(s) à l'équipe", "count": assigned}


# --- Changement de département employé ---
@router.post("/employees/change-department")
async def change_employee_department(
    employee_id: int,
    department: str,
    user: User = Depends(get_current_user),
):
    """Change le département d'un employé (admin only)."""
    if not user.is_admin:
        raise HTTPException(403, "Réservé aux administrateurs")
    employee = await Employee.get_or_none(id=employee_id)
    if not employee:
        raise HTTPException(404, "Employé introuvable")
    dept = await Department.get_or_none(name=department)
    if not dept:
        raise HTTPException(400, f"Département '{department}' introuvable")
    old_dept = employee.dept_str
    employee.dept_str = department
    employee.dept = dept
    # Si le groupe actuel n'est pas dans le nouveau département, le retirer
    if employee.group_id:
        group = await Group.get_or_none(id=employee.group_id)
        if group and group.department_id != dept.id:
            employee.group_id = None
    await employee.save()
    return {"message": f"Département changé de '{old_dept}' vers '{department}'"}


# --- Chaîne de validation par département/groupe ---
@router.get("/validation-chain")
async def get_validation_chain(
    department: Optional[str] = None,
    group_id: Optional[int] = None,
):
    """
    Retourne la chaîne de validation complète pour un département ou un groupe :
    - Les validateurs N+1 du département
    - Les directeurs assignés au groupe
    - Le DG (global)
    - Le DRH (global)
    - Le nombre d'employés concernés
    """
    # Filtrer par département ou groupe
    if group_id:
        group = await Group.get_or_none(id=group_id).prefetch_related('department')
        if not group:
            raise HTTPException(404, "Équipe introuvable")
        dept_name = group.department.name
        emp_count = await Employee.filter(group_id=group_id, is_active=True).count()
    elif department:
        dept_name = department
        group = None
        emp_count = await Employee.filter(dept_str=department, is_active=True).count()
    else:
        # Retourner toutes les chaînes
        depts = await Department.all()
        result = []
        for d in depts:
            chain = await _build_chain(d.name, None)
            result.append(chain)
        # Ajouter le DG et DRH globaux
        dg = await User.filter(is_dg=True, is_admin=False).first()
        drh = await User.filter(is_drh=True, is_admin=False).first()
        return {
            "chains": result,
            "global": {
                "dg": {"id": dg.id, "name": dg.name, "email": dg.email} if dg else None,
                "drh": {"id": drh.id, "name": drh.name, "email": drh.email} if drh else None,
            },
        }

    return await _build_chain(dept_name, group_id)


async def _build_chain(dept_name: str, group_id: Optional[int] = None):
    """Construit la chaîne de validation pour un département/groupe donné."""
    # N+1 validators dans ce département
    n1_validators = await User.filter(
        is_validator_n1=True, is_admin=False, dept_str=dept_name
    )
    n1_list = [{"id": u.id, "name": u.name, "email": u.email, "poste": u.poste or ''} for u in n1_validators]

    # Directeurs dans ce département
    dept_directors = await User.filter(
        is_directeur=True, is_admin=False, dept_str=dept_name
    )
    dir_list = [{"id": u.id, "name": u.name, "email": u.email, "poste": u.poste or ''} for u in dept_directors]

    # Si un groupe spécifique, les directeurs assignés à ce groupe
    if group_id:
        group_director_ids = await DirectorGroupAssignment.filter(
            group_id=group_id
        ).values_list('director_id', flat=True)
        if group_director_ids:
            assigned_directors = [d for d in dir_list if d['id'] in group_director_ids]
        else:
            assigned_directors = dir_list  # fallback: tous les directeurs du dept
    else:
        assigned_directors = dir_list

    # DG global
    dg = await User.filter(is_dg=True, is_admin=False).first()
    dg_info = {"id": dg.id, "name": dg.name, "email": dg.email, "poste": dg.poste or ''} if dg else None

    # DRH global
    drh = await User.filter(is_drh=True, is_admin=False).first()
    drh_info = {"id": drh.id, "name": drh.name, "email": drh.email, "poste": drh.poste or ''} if drh else None

    # Nombre d'employés
    if group_id:
        emp_count = await Employee.filter(group_id=group_id, is_active=True).count()
    else:
        emp_count = await Employee.filter(dept_str=dept_name, is_active=True).count()

    return {
        "department": dept_name,
        "group_id": group_id,
        "employee_count": emp_count,
        "chain": [
            {
                "step": "N+1",
                "label": "Validateur N+1",
                "color": "orange",
                "users": n1_list,
            },
            {
                "step": "DIRECTEUR",
                "label": "Directeur",
                "color": "purple",
                "users": assigned_directors,
            },
            {
                "step": "DG",
                "label": "Directeur Général",
                "color": "pink",
                "users": [dg_info] if dg_info else [],
            },
            {
                "step": "DRH",
                "label": "DRH (Traitement)",
                "color": "green",
                "users": [drh_info] if drh_info else [],
            },
        ],
    }


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(group_id: int):
    g = await Group.get_or_none(id=group_id).prefetch_related('department')
    if not g:
        raise HTTPException(404, "Équipe introuvable")
    emp_count = await Employee.filter(group_id=g.id, is_active=True).count()
    dir_count = await DirectorGroupAssignment.filter(group_id=g.id).count()
    return GroupResponse(
        id=g.id,
        name=g.name,
        department=g.department.name if g.department else '',
        active=g.active,
        created_at=g.created_at,
        employee_count=emp_count,
        director_count=dir_count,
    )
