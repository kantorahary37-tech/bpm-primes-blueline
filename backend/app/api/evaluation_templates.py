from fastapi import APIRouter, Depends, HTTPException
from app.models import User, Employee, EvaluationTemplate, ServiceGroup
from app.auth import get_current_user
from app.permissions import employee_scope, apply_employee_scope, employee_in_scope
from app.schemas import (
    EvaluationTemplateSaveRequest,
    EvaluationTemplateResponse,
    EvaluationTemplateItem,
    ServiceGroupEvaluationRequest,
)
from typing import List

router = APIRouter(dependencies=[Depends(get_current_user)])

DEFAULT_QUANTI = [
    {"criteria_name": "Planification du travail", "description": "", "coeff": 2.0, "sort_order": 0},
    {"criteria_name": "Respect des deadlines", "description": "", "coeff": 1.0, "sort_order": 1},
    {"criteria_name": "Capacite d'analyse", "description": "", "coeff": 1.0, "sort_order": 2},
    {"criteria_name": "Execution des taches periodiques", "description": "", "coeff": 2.0, "sort_order": 3},
]

DEFAULT_QUALI = [
    {"criteria_name": "Qualite du travail", "description": "", "coeff": 2.0, "sort_order": 0},
    {"criteria_name": "Initiative", "description": "", "coeff": 1.0, "sort_order": 1},
    {"criteria_name": "Travail d'equipe", "description": "", "coeff": 1.0, "sort_order": 2},
]


def _build_response(emp, quanti_items, quali_items):
    return EvaluationTemplateResponse(
        employee_id=emp.id,
        employee_name=emp.name,
        matricule=emp.matricule,
        department=emp.department,
        quantitative=quanti_items,
        qualitative=quali_items,
    )


def _default_quanti():
    return [EvaluationTemplateItem(**d) for d in DEFAULT_QUANTI]


def _default_quali():
    return [EvaluationTemplateItem(**d) for d in DEFAULT_QUALI]


def _scoped_director(user: User) -> bool:
    """Directeur limité aux employés de son département (non admin / dg / drh)."""
    return bool(user.is_directeur) and not (user.is_admin or user.is_dg or user.is_drh)


def _is_broad(user: User) -> bool:
    """Rôle à portée globale : voit tous les employés/services."""
    return user.is_admin or user.is_dg or user.is_drh


def _can_view_evaluation(user: User) -> bool:
    """Rôles autorisés à consulter la page Évaluation."""
    return _is_broad(user) or user.is_directeur or user.is_validator_n1 or user.is_validator_n2


async def _can_edit_employee_evaluation(user: User, emp: Employee) -> bool:
    """Périmètre d'édition d'un employé : comme la consultation des primes.
    - admin/DG/DRH : tous ;
    - directeur : son département ;
    - N+1/N+2 : les employés de leurs services affectés dans leur département,
      ou uniquement leur propre fiche employé s'ils n'ont aucun service affecté."""
    if _is_broad(user):
        return True
    if user.is_directeur:
        return emp.department == user.department
    if user.is_validator_n1 or user.is_validator_n2:
        if emp.department != user.department:
            return False
        return await employee_in_scope(user, emp)
    return False


@router.get("/evaluation-templates", response_model=EvaluationTemplateResponse)
async def get_evaluation_templates(employee_id: int, user: User = Depends(get_current_user)):
    emp = await Employee.filter(id=employee_id).first()
    if not emp:
        raise HTTPException(404, "Employe introuvable")

    # Même périmètre que l'édition : un N+1/N+2 sans service affecté ne voit
    # que sa propre fiche.
    if not _can_view_evaluation(user) or not await _can_edit_employee_evaluation(user, emp):
        raise HTTPException(404, "Employe introuvable")

    rows = await EvaluationTemplate.filter(employee_id=emp.id).order_by("sort_order")

    quanti = [
        EvaluationTemplateItem(
            criteria_name=r.criteria_name,
            description=r.description or "",
            coeff=float(r.coeff),
            sort_order=r.sort_order,
        )
        for r in rows if r.section == "quantitative"
    ]
    quali = [
        EvaluationTemplateItem(
            criteria_name=r.criteria_name,
            description=r.description or "",
            coeff=float(r.coeff),
            sort_order=r.sort_order,
        )
        for r in rows if r.section == "qualitative"
    ]

    return _build_response(emp, quanti or _default_quanti(), quali or _default_quali())


@router.post("/evaluation-templates", response_model=EvaluationTemplateResponse)
async def save_evaluation_templates(
    data: EvaluationTemplateSaveRequest,
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur):
        raise HTTPException(403, "Vous n'avez pas le droit de modifier les modeles d'evaluation")

    emp = await Employee.filter(id=data.employee_id).first()
    if not emp:
        raise HTTPException(404, "Employe introuvable")

    if not await _can_edit_employee_evaluation(user, emp):
        raise HTTPException(403, "Vous ne pouvez modifier que les evaluations de votre périmètre (département/service)")

    await EvaluationTemplate.filter(employee_id=emp.id).delete()

    to_create = []
    for i, item in enumerate(data.quantitative):
        to_create.append(EvaluationTemplate(
            employee_id=emp.id,
            section="quantitative",
            criteria_name=item.criteria_name,
            description=item.description or "",
            coeff=item.coeff,
            sort_order=i,
        ))
    for i, item in enumerate(data.qualitative):
        to_create.append(EvaluationTemplate(
            employee_id=emp.id,
            section="qualitative",
            criteria_name=item.criteria_name,
            description=item.description or "",
            coeff=item.coeff,
            sort_order=i,
        ))

    if to_create:
        await EvaluationTemplate.bulk_create(to_create)

    return _build_response(emp, data.quantitative, data.qualitative)


@router.post("/evaluation-templates/service-group", response_model=dict)
async def apply_service_group_evaluation(
    data: ServiceGroupEvaluationRequest,
    user: User = Depends(get_current_user),
):
    if not _can_view_evaluation(user):
        raise HTTPException(403, "Acces reserve aux administrateurs et validateurs")

    if data.service_group_id is None:
        # « Sans service » : réservé aux rôles globaux et directeurs (périmètre département)
        if not (_is_broad(user) or user.is_directeur):
            raise HTTPException(403, "Acces non autorise pour ce role")
        query = Employee.filter(is_active=True, service_group_id__isnull=True)
        if _scoped_director(user):
            query = query.filter(dept_str=user.dept_str)
        employees = await query
        group_name = "Sans service"
    else:
        group = await ServiceGroup.filter(id=data.service_group_id).prefetch_related("department").first()
        if not group:
            raise HTTPException(404, "Service introuvable")

        # Périmètre : N+1/N+2 limités à leurs services affectés (sans
        # affectation, aucun service n'est accessible), directeur à son département
        if (user.is_validator_n1 or user.is_validator_n2) and not _is_broad(user):
            sg_ids, _ = await employee_scope(user)
            if not sg_ids or group.id not in sg_ids:
                raise HTTPException(403, "Vous ne pouvez évaluer que vos services affectés")
        elif _scoped_director(user) and group.department.name != user.department:
            raise HTTPException(403, "Ce directeur ne peut gérer que les évaluations des services de son département")

        employees = await Employee.filter(is_active=True, service_group=group)
        group_name = group.name

    if not employees:
        raise HTTPException(400, f"Aucun employe actif ({group_name})")

    await EvaluationTemplate.filter(employee_id__in=[e.id for e in employees]).delete()

    to_create = []
    for emp in employees:
        for i, item in enumerate(data.quantitative):
            to_create.append(EvaluationTemplate(
                employee_id=emp.id,
                section="quantitative",
                criteria_name=item.criteria_name,
                description=item.description or "",
                coeff=item.coeff,
                sort_order=i,
            ))
        for i, item in enumerate(data.qualitative):
            to_create.append(EvaluationTemplate(
                employee_id=emp.id,
                section="qualitative",
                criteria_name=item.criteria_name,
                description=item.description or "",
                coeff=item.coeff,
                sort_order=i,
            ))

    if to_create:
        await EvaluationTemplate.bulk_create(to_create)

    return {
        "message": f"Evaluation appliquee a {len(employees)} employe(s) ({group_name})",
        "count": len(employees),
    }


@router.get("/evaluation-templates/all")
async def get_all_templates(user: User = Depends(get_current_user)):
    if not _can_view_evaluation(user):
        raise HTTPException(403, "Acces reserve aux administrateurs et validateurs")

    if _is_broad(user):
        employees = await Employee.filter(is_active=True).prefetch_related("service_group").order_by("name")
    elif user.is_directeur:
        employees = await Employee.filter(is_active=True, dept_str=user.dept_str).prefetch_related("service_group").order_by("name")
    else:
        # N+1/N+2 : leurs services affectés ; sans affectation → uniquement
        # leur propre fiche employé
        query = Employee.filter(is_active=True, dept_str=user.dept_str)
        query = apply_employee_scope(query, await employee_scope(user))
        employees = await query.prefetch_related("service_group").order_by("name")
    result = []

    # Cache service_group_id → nom pour éviter une requête par employé
    all_sg_ids = {e.service_group_id for e in employees if e.service_group_id}
    sg_names = {
        sg.id: sg.name
        for sg in await ServiceGroup.filter(id__in=list(all_sg_ids))
    } if all_sg_ids else {}

    for emp in employees:
        rows = await EvaluationTemplate.filter(employee_id=emp.id).order_by("sort_order")
        quanti = [
            {"criteria_name": r.criteria_name, "description": r.description or "", "coeff": float(r.coeff), "sort_order": r.sort_order, "id": r.id}
            for r in rows if r.section == "quantitative"
        ]
        quali = [
            {"criteria_name": r.criteria_name, "description": r.description or "", "coeff": float(r.coeff), "sort_order": r.sort_order, "id": r.id}
            for r in rows if r.section == "qualitative"
        ]
        result.append({
            "employee_id": emp.id,
            "employee_name": emp.name,
            "matricule": emp.matricule,
            "department": emp.department or "",
            "service_group": sg_names.get(emp.service_group_id, ""),
            "service_group_id": emp.service_group_id,
            "quantitative": quanti if quanti else [DEFAULT_QUANTI[i] | {"id": None} for i in range(len(DEFAULT_QUANTI))],
            "qualitative": quali if quali else [DEFAULT_QUALI[i] | {"id": None} for i in range(len(DEFAULT_QUALI))],
            "is_default": not rows,
        })

    return result


@router.delete("/evaluation-templates/{template_id}")
async def delete_template(template_id: int, user: User = Depends(get_current_user)):
    if not _can_view_evaluation(user):
        raise HTTPException(403, "Acces reserve aux administrateurs et validateurs")

    tpl = await EvaluationTemplate.filter(id=template_id).first()
    if not tpl:
        raise HTTPException(404, "Critere introuvable")

    emp = await Employee.filter(id=tpl.employee_id).first()
    if not await _can_edit_employee_evaluation(user, emp):
        raise HTTPException(403, "Vous ne pouvez modifier que les evaluations de votre périmètre (département/service)")

    await tpl.delete()
    return {"message": "Critere supprime"}


@router.delete("/evaluation-templates/employee/{employee_id}")
async def delete_all_employee_templates(employee_id: int, user: User = Depends(get_current_user)):
    if not _can_view_evaluation(user):
        raise HTTPException(403, "Acces reserve aux administrateurs et validateurs")

    emp = await Employee.filter(id=employee_id).first()
    if not emp:
        raise HTTPException(404, "Employe introuvable")

    if not await _can_edit_employee_evaluation(user, emp):
        raise HTTPException(403, "Vous ne pouvez modifier que les evaluations de votre périmètre (département/service)")

    count = await EvaluationTemplate.filter(employee_id=emp.id).delete()
    return {"message": f"{count} critere(s) supprime(s)"}
