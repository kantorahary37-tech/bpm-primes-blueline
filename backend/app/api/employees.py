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


# La création manuelle d'employé est volontairement absente : les employés
# sont créés uniquement depuis l'annuaire LDAP (POST /admin/ldap-employees,
# réservé aux administrateurs, et synchronisation LDAP create-only).


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


@router.get("/service-department-inconsistencies")
async def list_service_department_inconsistencies(user: User = Depends(get_current_user)):
    """Liste les employés incohérents (dept ≠ département de leur service).

    Simple aperçu (aucune modification) pour afficher un compteur / bandeau
    d'avertissement avant un réalignement via POST /align-service-departments.
    """
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Réservé aux admin / DG / DRH")

    employees = await Employee.filter(service_group_id__isnull=False).prefetch_related(
        'service_group', 'service_group__department'
    )
    items = []
    for emp in employees:
        sg = emp.service_group
        sg_dept = sg.department if sg else None
        sg_dept_name = sg_dept.name if sg_dept else None
        if not sg_dept_name or emp.dept_str == sg_dept_name:
            continue
        items.append({
            "employee_id": emp.id,
            "matricule": emp.matricule,
            "name": emp.name,
            "department": emp.dept_str,
            "service": sg.name,
            "service_department": sg_dept_name,
        })
    return {"count": len(items), "items": items}


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

    Règle service : un employé affecté à un service appartient au département
    de ce service. Il ne peut pas changer de département tant qu'il n'a pas
    été retiré du service :
      - service dans le département cible → déplacement normal (le service est
        conservé),
      - service dans un autre département → l'employé n'est PAS déplacé : il
        reste rattaché au département de son service (avec réparation du
        rattachement si ses données étaient incohérentes) et il est signalé
        dans la réponse (``kept_in_service``).
    L'employé déplacé reprend le manager du département cible (Directeur,
    sinon N+1, sinon DG).
    """
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Réservé aux admin / DG / DRH")
    if not data.employee_ids:
        raise HTTPException(status_code=400, detail="Aucun employé sélectionné")

    target = data.target_department.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Département cible invalide")

    dept_obj, _ = await Department.get_or_create(name=target)
    employees = await Employee.filter(id__in=data.employee_ids, is_active=True).prefetch_related(
        'service_group', 'service_group__department'
    )
    new_manager = await _department_manager(target)

    moved = 0
    kept: list[dict] = []
    for emp in employees:
        # service_group (+ son département) déjà chargés via prefetch_related
        sg = emp.service_group
        if sg:
            sg_dept = sg.department
            sg_dept_name = sg_dept.name if sg_dept else None
            if sg_dept_name and sg_dept_name != target:
                # Employé rattaché à un service d'un autre département : il ne
                # quitte pas son service, donc il ne change pas de département.
                if emp.dept_str != sg_dept_name:
                    # Incohérence (dept != département du service) : on rattache
                    # l'employé au département de son service + manager de ce
                    # département (même règle de repli qu'un déplacement).
                    emp.dept_str = sg_dept_name
                    emp.dept = sg_dept
                    snap_manager = await _department_manager(sg_dept_name)
                    if snap_manager:
                        emp.manager = snap_manager
                    await emp.save()
                kept.append({
                    "employee_id": emp.id,
                    "name": emp.name,
                    "service": sg.name,
                    "service_department": sg_dept_name,
                    "reason": "Employé affecté à un service d'un autre département : retirez-le du service pour le déplacer.",
                })
                continue
        # Pas de service (ou service du département cible) → déplacement normal
        if new_manager:
            emp.manager = new_manager
        emp.dept_str = target
        emp.dept = dept_obj
        await emp.save()
        moved += 1

    return {
        "moved": moved,
        "kept_in_service": len(kept),
        "kept_details": kept,
        "target_department": target,
        "manager": new_manager.name if new_manager else None,
    }


@router.post("/align-service-departments")
async def align_employees_to_service_departments(user: User = Depends(get_current_user)):
    """Répare les employés incohérents (dept ≠ département de leur service).

    La règle métier est : un employé affecté à un service appartient au
    département de ce service. Cet endpoint réaligne chaque employé dont le
    département diffère de celui de son service :
      - dept_str + dept = département du service,
      - manager = manager de ce département (Directeur, sinon N+1, sinon DG).

    Les employés cohérents et ceux sans service ne sont pas touchés. Utile
    après les anciennes synchronisations LDAP qui écrasaient le département
    sans toucher au service.
    """
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Réservé aux admin / DG / DRH")

    employees = await Employee.filter(service_group_id__isnull=False).prefetch_related(
        'service_group', 'service_group__department'
    )

    aligned = 0
    details = []
    for emp in employees:
        sg = emp.service_group
        sg_dept = sg.department if sg else None
        sg_dept_name = sg_dept.name if sg_dept else None
        # Service orphelin (département supprimé) : impossible de déterminer
        # le département cible → signalé, non modifié.
        if not sg_dept_name:
            details.append({
                "employee_id": emp.id,
                "matricule": emp.matricule,
                "name": emp.name,
                "service": sg.name if sg else None,
                "old_department": emp.dept_str,
                "new_department": None,
                "status": "skipped_orphan_service",
            })
            continue
        if emp.dept_str == sg_dept_name:
            continue  # déjà cohérent

        old_dept = emp.dept_str
        emp.dept_str = sg_dept_name
        emp.dept = sg_dept
        snap_manager = await _department_manager(sg_dept_name)
        if snap_manager:
            emp.manager = snap_manager
        await emp.save()
        aligned += 1
        details.append({
            "employee_id": emp.id,
            "matricule": emp.matricule,
            "name": emp.name,
            "service": sg.name,
            "old_department": old_dept,
            "new_department": sg_dept_name,
            "manager": snap_manager.name if snap_manager else None,
            "status": "aligned",
        })

    return {
        "checked": len(employees),
        "aligned": aligned,
        "details": details,
    }
