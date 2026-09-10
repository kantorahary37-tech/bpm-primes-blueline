import secrets
import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request, status
from fastapi import Depends
from app.models import User, Department, Employee, UserServiceAssignment, ServiceGroup
from app.schemas import LoginRequest, SignUpRequest, SignUpResponse, Token, ForgotPasswordRequest, ResetPasswordRequest
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
        asyncio.create_task(send_reset_email(data.email, reset_link))
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
    client_ip = request.client.host if request.client else "unknown"

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
        "is_admin": user.is_admin,
    }


@router.get("/me/service-assignments")
async def get_my_service_assignments(user: User = Depends(get_current_user)):
    assignments = await UserServiceAssignment.filter(user_id=user.id).prefetch_related('service_group', 'service_group__department', 'n1')
    result = []
    for a in assignments:
        sg = await a.service_group
        dept = await sg.department if sg else None
        member_count = await Employee.filter(service_group_id=sg.id).count() if sg else 0
        n1_user = await a.n1 if a.n1_id else None
        result.append({
            "id": a.id,
            "service_group_id": a.service_group_id,
            "service_group_name": sg.name if sg else None,
            "department_name": dept.name if dept else None,
            "member_count": member_count,
            "n1_name": n1_user.name if n1_user else None,
        })
    return result
