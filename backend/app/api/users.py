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