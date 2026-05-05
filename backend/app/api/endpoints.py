# Imports FastAPI pour les routes et les erreurs
from fastapi import APIRouter, Depends, HTTPException
# Imports de typage
from typing import List, Optional
# Imports des modèles
from app.models import User, Employee, Bonus, Validation, PrimeMax
# Imports des schémas
from app.schemas import *
# Imports FastAPI pour les erreurs
from fastapi import HTTPException

# Création du routeur API
router = APIRouter()

# Route POST pour créer un utilisateur
@router.post("/users/", response_model=UserResponse)
async def create_user(user: UserCreate):
    # Création de l'utilisateur en base
    obj = await User.create(**user.dict())
    # Récupération de l'utilisateur avec son ID
    return await User.get(id=obj.id)

# Route GET pour lister les utilisateurs
@router.get("/users/", response_model=List[UserResponse])
async def list_users():
    # Retourne tous les utilisateurs
    return await User.all()

# Route POST pour créer un employé
@router.post("/employees/", response_model=EmployeeResponse)
async def create_employee(emp: EmployeeCreate):
    # Création de l'employé
    obj = await Employee.create(**emp.dict())
    return await Employee.get(id=obj.id)

# Route GET pour lister les employés (filtre par département optionnel)
@router.get("/employees/", response_model=List[EmployeeResponse])
async def list_employees(department: Optional[str] = None):
    query = Employee.all()
    if department: query = query.filter(department=department)
    return await query

# Route POST pour créer une prime
@router.post("/bonuses/", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, user_id: int):
    # Création de la prime avec le créateur
    obj = await Bonus.create(**bonus.dict(), created_by_id=user_id)
    # Récupération avec les relations préchargées
    return await Bonus.get(id=obj.id).prefetch_related('employee')

# Route GET pour lister les primes (filtres optionnels)
@router.get("/bonuses/", response_model=List[BonusResponse])
async def list_bonuses(status: Optional[str] = None, employee_id: Optional[int] = None):
    query = Bonus.all().prefetch_related('employee')
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    return await query

# Route POST pour valider une prime
@router.post("/bonuses/{bonus_id}/validate")
async def validate_bonus(bonus_id: int, validation: ValidationCreate, step: str):
    # Récupération de la prime ou erreur 404
    bonus = await Bonus.get_or_none(id=bonus_id)
    if not bonus: raise HTTPException(404, "Bonus not found")
    # Création de l'enregistrement de validation
    await Validation.create(**validation.dict())
    # Mise à jour du statut selon l'étape et l'action
    if validation.action == "VALIDER":
        bonus.status = {"N1": ValidationStatus.EN_ATTENTE_DIRECTEUR, "DIRECTEUR": ValidationStatus.EN_ATTENTE_DG, "DG": ValidationStatus.VALIDE}[step]
    elif validation.action == "REJETER":
        bonus.status = ValidationStatus.REJETE
    # Sauvegarde de la prime
    await bonus.save()
    return {"message": "OK", "status": bonus.status}
