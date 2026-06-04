# Imports FastAPI pour les routes et les erreurs
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from app.models import User, Employee, Bonus, Validation, PrimeMax
from app.auth import get_current_user
from app.schemas import *
from fastapi import HTTPException
import io
import csv
from datetime import datetime

# Création du routeur API
router = APIRouter(dependencies=[Depends(get_current_user)])


# Route POST pour créer une prime
@router.post("/bonuses/", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, user: User = Depends(get_current_user)):
    employee = await Employee.get(id=bonus.employee_id)

    if bonus.bonus_type != BonusType.ASTREINTE:
        primemax = await PrimeMax.filter(
            department=employee.department,
            bonus_type=bonus.bonus_type
        ).first()
        if primemax and bonus.total_amount > primemax.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Le montant ({bonus.total_amount} Ar) dépasse le plafond "
                       f"autorisé ({primemax.amount} Ar) pour "
                       f"'{bonus.bonus_type.value}' dans le département '{employee.department.value}'."
            )

    existing = await Bonus.filter(
        employee_id=bonus.employee_id,
        bonus_type=bonus.bonus_type,
        start_date__lte=bonus.end_date,
        end_date__gte=bonus.start_date,
    ).exists()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Une prime de type '{bonus.bonus_type.value}' existe déjà sur cette période pour cet employé."
        )
    initial_status = ValidationStatus.EN_ATTENTE_DIRECTEUR if user.is_directeur else ValidationStatus.INITIALISE
    obj = await Bonus.create(**bonus.dict(), created_by_id=user.id, status=initial_status)
    return await Bonus.get(id=obj.id).prefetch_related('employee')

# Route PUT pour modifier une prime (seulement si statut = Initialisé)
@router.put("/bonuses/{bonus_id}", response_model=BonusResponse)
async def update_bonus(bonus_id: int, data: BonusCreate, user: User = Depends(get_current_user)):
    bonus = await Bonus.get_or_none(id=bonus_id).prefetch_related('employee')
    if not bonus: raise HTTPException(404, "Bonus not found")
    if bonus.status not in (ValidationStatus.INITIALISE, ValidationStatus.EN_ATTENTE_DIRECTEUR):
        raise HTTPException(400, "Impossible de modifier une prime dont le statut n'est pas 'Initialisé' ou 'En attente Directeur'")

    update_data = data.dict(exclude_unset=True)
    if 'total_amount' in update_data and data.bonus_type != BonusType.ASTREINTE:
        employee = await Employee.get(id=bonus.employee_id)
        primemax = await PrimeMax.filter(department=employee.department, bonus_type=bonus.bonus_type).first()
        if primemax and update_data['total_amount'] > primemax.amount:
            raise HTTPException(400, f"Le montant dépasse le plafond autorisé ({primemax.amount} Ar)")
    if 'employee_id' in update_data:
        del update_data['employee_id']

    await bonus.update_from_dict(update_data)
    await bonus.save()
    return await Bonus.get(id=bonus.id).prefetch_related('employee')

# Route GET pour lister les primes (filtres optionnels)
@router.get("/bonuses/", response_model=List[BonusResponse])
async def list_bonuses(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    bonus_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    query = Bonus.all().prefetch_related('employee')
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    if bonus_type: query = query.filter(bonus_type=bonus_type)
    if start_date: query = query.filter(start_date__gte=start_date)
    if end_date: query = query.filter(end_date__lte=end_date)
    return await query

# Route GET pour une prime spécifique
@router.get("/bonuses/{bonus_id}", response_model=BonusResponse)
async def get_bonus(bonus_id: int):
    bonus = await Bonus.get_or_none(id=bonus_id).prefetch_related('employee')
    if not bonus: raise HTTPException(404, "Bonus not found")
    return bonus

# Route GET pour l'historique des validations d'une prime
@router.get("/bonuses/{bonus_id}/validations", response_model=List[ValidationResponse])
async def get_bonus_validations(bonus_id: int):
    bonus = await Bonus.get_or_none(id=bonus_id)
    if not bonus: raise HTTPException(404, "Bonus not found")
    validations = await Validation.filter(bonus_id=bonus_id).prefetch_related('validator')
    result = []
    for v in validations:
        result.append({
            "id": v.id,
            "bonus_id": v.bonus_id,
            "validator_id": v.validator_id,
            "validator_name": v.validator.name if v.validator else None,
            "step": v.step,
            "action": v.action,
            "note": v.note,
            "motif_rejet": v.motif_rejet,
            "validated_at": v.validated_at,
        })
    return result

# Route POST pour valider une prime
@router.post("/bonuses/{bonus_id}/validate")
async def validate_bonus(
    bonus_id: int,
    validation: ValidationCreate,
    step: str,
    user: User = Depends(get_current_user)
):
    # Récupération de la prime ou erreur 404
    bonus = await Bonus.get_or_none(id=bonus_id)
    if not bonus: raise HTTPException(404, "Bonus not found")
    
    # Vérification : si déjà validé, ON BLOQUE
    if bonus.status == ValidationStatus.VALIDE:
        raise HTTPException(status_code=400, detail="Bonus déjà validé - aucune action possible")
    
    # Validation du workflow : chaque étape n'est possible que si le statut actuel correspond
    expected_status = {
        "N1": ValidationStatus.INITIALISE,
        "DIRECTEUR": ValidationStatus.EN_ATTENTE_DIRECTEUR,
        "DG": ValidationStatus.EN_ATTENTE_DG,
    }.get(step)
    
    if not expected_status:
        raise HTTPException(400, "Étape de validation invalide")
    
    if bonus.status != expected_status:
        raise HTTPException(
            400,
            f"Action impossible : la prime est au statut '{bonus.status}', "
            f"attendait '{expected_status}' pour l'étape {step}."
        )
    
    # Création de l'enregistrement de validation (validator_id depuis le JWT)
    await Validation.create(
        bonus_id=bonus.id,
        validator_id=user.id,
        step=step,
        action=validation.action,
        note=validation.note,
        motif_rejet=validation.motif_rejet,
    )
    
    # Mise à jour du statut selon l'étape et l'action
    if validation.action == "VALIDER":
        bonus.status = {
            "N1": ValidationStatus.EN_ATTENTE_DIRECTEUR,
            "DIRECTEUR": ValidationStatus.EN_ATTENTE_DG,
            "DG": ValidationStatus.VALIDE
        }[step]
        
        # Clôture automatique si DG valide
        if bonus.status == ValidationStatus.VALIDE:
            await Validation.create(
                bonus_id=bonus.id,
                validator_id=user.id,
                step="CLOSED",
                action="AUTOMATIC",
                note="Prime validée par DG - Clôture automatique"
            )
    elif validation.action == "REJETER":
        bonus.status = ValidationStatus.INITIALISE
        bonus.was_rejected = True
    
    # Sauvegarde de la prime
    await bonus.save()
    return {"message": "OK", "status": bonus.status}


@router.get("/bonuses/export")
async def export_bonuses(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    bonus_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department: Optional[str] = None,
):
    query = Bonus.all().prefetch_related('employee', 'created_by')
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    if bonus_type: query = query.filter(bonus_type=bonus_type)
    if start_date: query = query.filter(start_date__gte=start_date)
    if end_date: query = query.filter(end_date__lte=end_date)
    if department: query = query.filter(employee__department=department)

    bonuses = await query.order_by('-start_date')

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "Montant", "Statut",
        "CreePar", "DateCreation"
    ])
    for b in bonuses:
        writer.writerow([
            b.employee.matricule,
            b.employee.name,
            b.employee.department.value,
            b.bonus_type.value,
            b.start_date.isoformat(),
            b.end_date.isoformat(),
            str(b.total_amount),
            b.status.value,
            b.created_by.name if b.created_by else '',
            b.created_at.isoformat() if b.created_at else '',
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=export_primes_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/bonuses/export/sage")
async def export_sage():
    bonuses = await Bonus.filter(status=ValidationStatus.VALIDE).prefetch_related('employee')

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "Montant", "Statut"
    ])
    for b in bonuses:
        writer.writerow([
            b.employee.matricule,
            b.employee.name,
            b.employee.department.value,
            b.bonus_type.value,
            b.start_date.isoformat(),
            b.end_date.isoformat(),
            str(b.total_amount),
            b.status.value
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export_sage_paie.csv"}
    )
