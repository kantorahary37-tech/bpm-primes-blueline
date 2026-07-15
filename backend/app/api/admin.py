from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from app.models import User, Department
from app.auth import get_current_user, get_password_hash
from app.schemas import UserResponse

router = APIRouter()


def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


@router.get("/users", response_model=list[UserResponse])
async def admin_list_users(_admin: User = Depends(require_admin)):
    users = await User.all()
    return users


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    poste: Optional[str] = None
    department: Optional[str] = None
    is_validator_n1: Optional[bool] = None
    is_directeur: Optional[bool] = None
    is_drh: Optional[bool] = None
    is_dg: Optional[bool] = None
    is_admin: Optional[bool] = None


@router.put("/users/{user_id}", response_model=UserResponse)
async def admin_update_user(user_id: int, data: UserUpdateRequest, _admin: User = Depends(require_admin)):
    user = await User.get_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.name is not None:
        user.name = data.name
    if data.poste is not None:
        user.poste = data.poste
    if data.department is not None:
        user.dept_str = data.department
        dept_obj = await Department.get_or_none(name=data.department)
        user.dept = dept_obj
    if data.is_validator_n1 is not None:
        user.is_validator_n1 = data.is_validator_n1
    if data.is_directeur is not None:
        user.is_directeur = data.is_directeur
    if data.is_drh is not None:
        user.is_drh = data.is_drh
    if data.is_dg is not None:
        user.is_dg = data.is_dg
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    await user.save()
    return user


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: int, _admin: User = Depends(require_admin)):
    user = await User.get_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == _admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    await user.delete()
    return {"message": "Utilisateur supprimé"}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: int, _admin: User = Depends(require_admin)):
    user = await User.get_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.password_hash = get_password_hash("testprime")
    await user.save()
    return {"message": "Mot de passe réinitialisé à 'testprime'"}


class CreateUserRequest(BaseModel):
    email: str
    name: str
    poste: Optional[str] = None
    department: Optional[str] = None
    is_validator_n1: Optional[bool] = False
    is_directeur: Optional[bool] = False
    is_drh: Optional[bool] = False
    is_dg: Optional[bool] = False
    is_admin: Optional[bool] = False


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(data: CreateUserRequest, _admin: User = Depends(require_admin)):
    existing = await User.get_or_none(email=data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    dept_obj = None
    if data.department:
        dept_obj = await Department.get_or_none(name=data.department)
    user = await User.create(
        email=data.email,
        name=data.name,
        password_hash=get_password_hash("testprime"),
        poste=data.poste,
        dept_str=data.department,
        dept=dept_obj,
        is_validator_n1=data.is_validator_n1,
        is_directeur=data.is_directeur,
        is_drh=data.is_drh,
        is_dg=data.is_dg,
        is_admin=data.is_admin,
    )
    return user


@router.post("/ldap-sync")
async def admin_ldap_sync(_admin: User = Depends(require_admin)):
    import subprocess
    result = subprocess.run(
        ["python", "-m", "scripts.sync_ldap"],
        capture_output=True, text=True, timeout=60,
        cwd="/app"
    )
    return {
        "success": result.returncode == 0,
        "output": result.stdout[-2000:] if result.stdout else "",
        "errors": result.stderr[-1000:] if result.stderr else "",
    }


@router.get("/ldap-search")
async def admin_ldap_search(q: str = "", _admin: User = Depends(require_admin)):
    if len(q) < 2:
        return []
    try:
        from ldap3 import ALL, Connection, Server
        import os

        LDAP_SERVER_URI = os.getenv('LDAP_SERVER_URI', 'ldap://ldap.blueline.mg:389')
        LDAP_BIND_DN = os.getenv('LDAP_BIND_DN', 'cn=admin,dc=blueline,dc=mg')
        LDAP_BIND_PASSWORD = os.getenv('LDAP_BIND_PASSWORD', 'blueline2488')
        LDAP_USER_SEARCH_BASE = os.getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg')

        server = Server(LDAP_SERVER_URI, get_info=ALL, connect_timeout=5)
        conn = Connection(server, user=LDAP_BIND_DN, password=LDAP_BIND_PASSWORD, auto_bind=True, receive_timeout=5)
        try:
            def _escape_ldap(s):
                return s.replace('\\', '\\5c').replace('*', '\\2a').replace('(', '\\28').replace(')', '\\29').replace('\0', '\\00')

            q_safe = _escape_ldap(q)
            if '@' in q:
                search_filter = f'(&(mail=*)(mail=*{q_safe}*))'
            else:
                search_filter = f'(|(cn=*{q_safe}*)(mail=*{q_safe}*))'

            conn.search(
                search_base=LDAP_USER_SEARCH_BASE,
                search_filter=search_filter,
                attributes=['cn', 'mail', 'givenName', 'sn', 'title', 'departmentNumber', 'ou', 'uid', 'employeeNumber'],
                paged_size=20,
            )
            results = []
            for entry in conn.entries:
                email = str(entry.mail.value).lower() if entry.mail else ''
                name = str(entry.cn.value) if entry.cn else ''
                results.append({
                    'email': email,
                    'name': name,
                    'title': str(entry.title.value) if entry.title else '',
                    'department': str(entry.departmentNumber.value or entry.ou.value) if (entry.departmentNumber or entry.ou) else '',
                    'uid': str(entry.uid.value) if entry.uid else '',
                })
            return results
        finally:
            conn.unbind()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur LDAP: {str(e)}")
