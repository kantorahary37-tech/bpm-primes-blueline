# Import de Pydantic pour la validation des données
from pydantic import BaseModel, field_validator
# Imports de typage
from typing import Optional, List, Dict, Any
# Import de datetime pour les dates
from datetime import datetime, date
# Import des enums depuis les modèles
from app.models import BonusType, ValidationStatus


def dept_to_str(v):
    if hasattr(v, 'name'):
        return v.name
    return v

# Schémas pour l'authentification
class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class SignUpRequest(BaseModel):
    email: str
    name: str
    password: str
    poste: Optional[str] = None
    department: Optional[str] = None

    _dept = field_validator('department', mode='before')(dept_to_str)
    
    
# Schéma de base pour les utilisateurs
class UserBase(BaseModel):
    email: str
    name: str
    poste: Optional[str] = None
    department: Optional[str] = None
    is_validator_n1: Optional[bool] = False
    is_directeur: Optional[bool] = False
    is_drh: Optional[bool] = False
    is_dg: Optional[bool] = False

    _dept = field_validator('department', mode='before')(dept_to_str)

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
    department: str
    manager_id: int
    astreinte_rate: Optional[int] = None
    mensuel_rate: Optional[int] = None

    _dept = field_validator('department', mode='before')(dept_to_str)

# Schéma de création d'employé
class EmployeeCreate(EmployeeBase): pass

# Schéma de mise à jour d'employé (champs optionnels)
class EmployeeUpdate(BaseModel):
    astreinte_rate: Optional[int] = None
    mensuel_rate: Optional[int] = None

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
    details: Optional[Dict[str, Any]] = None
    was_rejected: Optional[bool] = False
    total_amount: float

# Schéma de création de prime
class BonusCreate(BonusBase): pass

# Schéma de réponse prime
class BonusResponse(BonusBase):
    id: int
    status: ValidationStatus
    paid_at: Optional[datetime] = None
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    employee: Optional[EmployeeResponse] = None
    class Config: from_attributes = True

# Schéma de création de validation
class ValidationCreate(BaseModel):
    action: str
    note: Optional[str] = None
    motif_rejet: Optional[str] = None

# Schéma pour validation par lot
class BatchValidateRequest(BaseModel):
    bonus_ids: List[int]
    action: str
    step: str
    note: Optional[str] = None
    motif_rejet: Optional[str] = None

class BatchValidateResult(BaseModel):
    bonus_id: int
    success: bool
    error: Optional[str] = None

class BatchValidateResponse(BaseModel):
    results: List[BatchValidateResult]
    total_success: int
    total_errors: int

# Schéma pour marquer comme payé
class MarkPaidRequest(BaseModel):
    bonus_ids: Optional[List[int]] = None
    month: Optional[str] = None  # format MM
    year: Optional[str] = None   # format YYYY

# Schéma de réponse validation
class ValidationResponse(BaseModel):
    id: int
    bonus_id: int
    validator_id: int
    validator_name: Optional[str] = None
    step: str
    action: str
    note: Optional[str] = None
    motif_rejet: Optional[str] = None
    validated_at: datetime
    class Config: from_attributes = True

# Schéma de base pour Prime Max
class PrimeMaxBase(BaseModel):
    department: str
    bonus_type: BonusType
    amount: float

    _dept = field_validator('department', mode='before')(dept_to_str)

# Schéma de création Prime Max
class PrimeMaxCreate(PrimeMaxBase): pass

# Schéma de réponse Prime Max
class PrimeMaxResponse(PrimeMaxBase):
    id: int
    updated_at: datetime
    class Config: from_attributes = True

class AuditLogResponse(BaseModel):
    id: int
    bonus_id: int
    user_id: int
    user_name: Optional[str] = None
    action: str
    description: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime
    class Config: from_attributes = True
