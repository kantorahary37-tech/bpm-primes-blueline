# Imports FastAPI pour les routes et les erreurs
from fastapi import APIRouter, Depends, HTTPException
# Imports de typage
from typing import List, Optional
# Imports des modèles
from app.models import User, Employee, Bonus, Validation, PrimeMax
# Import de l'auth
from app.auth import get_current_user
# Imports des schémas
from app.schemas import *
# Imports FastAPI pour les erreurs
from fastapi import HTTPException

# Création du routeur API
router = APIRouter(dependencies=[Depends(get_current_user)])


# Route POST pour créer une prime
@router.post("/bonuses/", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, user: User = Depends(get_current_user)):
    # Vérification : pas de chevauchement de période pour le même employé + même type
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
    # Création de la prime avec le créateur (depuis le token JWT)
    obj = await Bonus.create(**bonus.dict(), created_by_id=user.id)
    # Récupération avec les relations préchargées
    return await Bonus.get(id=obj.id).prefetch_related('employee')

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
        bonus.status = ValidationStatus.REJETE
    
    # Sauvegarde de la prime
    await bonus.save()
    return {"message": "OK", "status": bonus.status}
