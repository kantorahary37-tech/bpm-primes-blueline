from fastapi import APIRouter, Depends, HTTPException
from app.models import User, Department, EvaluationTemplate
from app.auth import get_current_user
from app.schemas import (
    EvaluationTemplateSaveRequest,
    EvaluationTemplateResponse,
    EvaluationTemplateItem,
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


@router.get("/evaluation-templates", response_model=EvaluationTemplateResponse)
async def get_evaluation_templates(department: str, user: User = Depends(get_current_user)):
    dept = await Department.filter(name=department).first()
    if not dept:
        raise HTTPException(404, "Departement introuvable")

    rows = await EvaluationTemplate.filter(department_id=dept.id).order_by("sort_order")

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

    if not quanti:
        quanti = [EvaluationTemplateItem(**d) for d in DEFAULT_QUANTI]
    if not quali:
        quali = [EvaluationTemplateItem(**d) for d in DEFAULT_QUALI]

    return EvaluationTemplateResponse(
        department=department,
        quantitative=quanti,
        qualitative=quali,
    )


@router.post("/evaluation-templates", response_model=EvaluationTemplateResponse)
async def save_evaluation_templates(
    data: EvaluationTemplateSaveRequest,
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur):
        raise HTTPException(403, "Vous n'avez pas le droit de modifier les modèles d'évaluation")

    dept = await Department.filter(name=data.department).first()
    if not dept:
        raise HTTPException(404, "Département introuvable")

    if not (user.is_admin or user.is_dg or user.is_drh):
        if user.department and user.department != data.department:
            raise HTTPException(403, "Vous ne pouvez modifier que les modèles de votre département")

    await EvaluationTemplate.filter(department_id=dept.id).delete()

    to_create = []
    for i, item in enumerate(data.quantitative):
        to_create.append(EvaluationTemplate(
            department_id=dept.id,
            section="quantitative",
            criteria_name=item.criteria_name,
            description=item.description or "",
            coeff=item.coeff,
            sort_order=i,
        ))
    for i, item in enumerate(data.qualitative):
        to_create.append(EvaluationTemplate(
            department_id=dept.id,
            section="qualitative",
            criteria_name=item.criteria_name,
            description=item.description or "",
            coeff=item.coeff,
            sort_order=i,
        ))

    if to_create:
        await EvaluationTemplate.bulk_create(to_create)

    return EvaluationTemplateResponse(
        department=data.department,
        quantitative=data.quantitative,
        qualitative=data.qualitative,
    )


@router.get("/evaluation-templates/all")
async def get_all_templates(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Acces reserve aux administrateurs")

    departments = await Department.all()
    result = []

    for dept in departments:
        rows = await EvaluationTemplate.filter(department_id=dept.id).order_by("sort_order")
        quanti = [
            {"criteria_name": r.criteria_name, "description": r.description or "", "coeff": float(r.coeff), "sort_order": r.sort_order, "id": r.id}
            for r in rows if r.section == "quantitative"
        ]
        quali = [
            {"criteria_name": r.criteria_name, "description": r.description or "", "coeff": float(r.coeff), "sort_order": r.sort_order, "id": r.id}
            for r in rows if r.section == "qualitative"
        ]
        result.append({
            "department": dept.name,
            "quantitative": quanti if quanti else [DEFAULT_QUANTI[i] | {"id": None} for i in range(len(DEFAULT_QUANTI))],
            "qualitative": quali if quali else [DEFAULT_QUALI[i] | {"id": None} for i in range(len(DEFAULT_QUALI))],
            "is_default": not rows,
        })

    return result


@router.delete("/evaluation-templates/{template_id}")
async def delete_template(template_id: int, user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Acces reserve aux administrateurs")

    tpl = await EvaluationTemplate.filter(id=template_id).first()
    if not tpl:
        raise HTTPException(404, "Critere introuvable")

    await tpl.delete()
    return {"message": "Critere supprime"}


@router.delete("/evaluation-templates/department/{department}")
async def delete_all_department_templates(department: str, user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Acces reserve aux administrateurs")

    dept = await Department.filter(name=department).first()
    if not dept:
        raise HTTPException(404, "Departement introuvable")

    count = await EvaluationTemplate.filter(department_id=dept.id).delete()
    return {"message": f"{count} critere(s) supprime(s)"}
