# Import de Pydantic pour la validation des données
from pydantic import BaseModel
# Imports de typage
from typing import Optional, List
# Import de datetime pour les dates
from datetime import datetime, date
# Import des enums depuis les modèles
from app.models import DepartmentType, BonusType, ValidationStatus

# Schémas pour l'authentification
class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SignUpRequest(BaseModel):
    email: str
    name: str
    password: str
    poste: Optional[str] = None
    department: Optional[DepartmentType] = None
    
    
# Schéma de base pour les utilisateurs
class UserBase(BaseModel):
    email: str
    name: str
    poste: Optional[str] = None
    department: Optional[DepartmentType] = None
    is_validator_n1: Optional[bool] = False
    is_directeur: Optional[bool] = False
    is_drh: Optional[bool] = False
    is_dg: Optional[bool] = False

# Schéma pour la création d'utilisateur (hérite de UserBase)
class UserCreate(UserBase): pass

# Schéma de réponse utilisateur (avec champs supplémentaires)
class UserResponse(UserBase):
    id: int
    created_at: datetime
    class Config: from_attributes = True

class SignUpResponse(BaseModel):
    message: str
    user: UserResponse

# Schéma de base pour les employés
class EmployeeBase(BaseModel):
    matricule: str
    name: str
    department: DepartmentType
    manager_id: int

# Schéma de création d'employé
class EmployeeCreate(EmployeeBase): pass

# Schéma de réponse employé
class EmployeeResponse(EmployeeBase):
    id: int
    created_at: datetime
    class Config: from_attributes = True

# Schéma de base pour les primes
class BonusBase(BaseModel):
    employee_id: int
    start_date: date
    end_date: date
    bonus_type: BonusType
    performance_score: Optional[float] = None
    absences: Optional[int] = None
    retard: Optional[int] = None
    prime_mensuel_amount: Optional[float] = None
    nb_jours_astreinte: Optional[int] = None
    taux_jour: Optional[float] = None
    prime_astreinte_amount: Optional[float] = None
    ca_realise: Optional[float] = None
    ca_objectif: Optional[float] = None
    taux_commission: Optional[float] = None
    commission_amount: Optional[float] = None
    total_amount: float

# Schéma de création de prime
class BonusCreate(BonusBase): pass

# Schéma de réponse prime
class BonusResponse(BonusBase):
    id: int
    status: ValidationStatus
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    class Config: from_attributes = True

# Schéma de création de validation
class ValidationCreate(BaseModel):
    action: str
    note: Optional[str] = None
    motif_rejet: Optional[str] = None

# Schéma de réponse validation
class ValidationResponse(BaseModel):
    id: int
    bonus_id: int
    validator_id: int
    step: str
    action: str
    note: Optional[str] = None
    motif_rejet: Optional[str] = None
    validated_at: datetime
    class Config: from_attributes = True

# Schéma de base pour Prime Max
class PrimeMaxBase(BaseModel):
    department: DepartmentType
    bonus_type: BonusType
    amount: float

# Schéma de création Prime Max
class PrimeMaxCreate(PrimeMaxBase): pass

# Schéma de réponse Prime Max
class PrimeMaxResponse(PrimeMaxBase):
    id: int
    updated_at: datetime
    class Config: from_attributes = True
