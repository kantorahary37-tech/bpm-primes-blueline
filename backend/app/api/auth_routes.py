import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Request
from fastapi import Depends
from app.models import User, Department, Validation, Bonus
from app.schemas import LoginRequest, SignUpRequest, SignUpResponse, Token, ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user
from app.email_service import send_reset_email
from app.rate_limit import check_rate_limit, record_failed_attempt, reset_attempts

router = APIRouter()

@router.post("/signup", response_model=SignUpResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignUpRequest):
    existing = await User.get_or_none(email=data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    dept_obj = None
    if data.department:
        dept_obj = await Department.get_or_none(name=data.department)
    user = await User.create(
        email=data.email,
        name=data.name,
        password_hash=get_password_hash(data.password),
        poste=data.poste,
        dept_str=data.department,
        department=dept_obj,
    )
    
    return {
        'message': 'User created successfully',
        'user': user
    }

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    user = await User.get_or_none(email=data.email)
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(minutes=15)
        await user.save()
        reset_link = f"http://localhost:3000/reset-password?token={token}"
        send_reset_email(data.email, reset_link)
    return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé."}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    user = await User.get_or_none(reset_token=data.token)
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token invalide ou expiré.")
    user.password_hash = get_password_hash(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await user.save()
    return {"message": "Mot de passe réinitialisé avec succès."}

@router.post("/login", response_model=Token)
async def login(data: LoginRequest, request: Request):
    client_ip = request.client.host
    allowed, message = check_rate_limit(client_ip)
    if not allowed:
        raise HTTPException(status_code=429, detail=message)
    
    user = await User.get_or_none(email=data.email)
    if not user or not verify_password(data.password, user.password_hash):
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    reset_attempts(client_ip)
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "poste": user.poste,
        "department": user.department,
        "is_validator_n1": user.is_validator_n1,
        "is_directeur": user.is_directeur,
        "is_drh": user.is_drh,
        "is_dg": user.is_dg,
    }

@router.get("/me/validation-stats")
async def get_validation_stats(user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Validations ce mois (action = VALIDER, step correspondant au rôle)
    step = "N1" if user.is_validator_n1 else "DIRECTEUR" if user.is_directeur else "DG" if user.is_dg else None
    
    validated_this_month = 0
    rejected_total = 0
    
    if step:
        validated_this_month = await Validation.filter(
            validator_id=user.id,
            step=step,
            action="VALIDER",
            validated_at__gte=month_start,
        ).count()
        
        rejected_total = await Validation.filter(
            validator_id=user.id,
            step=step,
            action="REJETER",
        ).count()

    total_validated = await Bonus.filter(status="Prime validée", paid_at__isnull=True).count()

    return {
        "validated_this_month": validated_this_month,
        "rejected_total": rejected_total,
        "total_validated": total_validated,
    }

@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, user: User = Depends(get_current_user)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    user.password_hash = get_password_hash(data.new_password)
    await user.save()
    return {"message": "Mot de passe modifié avec succès"}
