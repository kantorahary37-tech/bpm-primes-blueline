from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from app.models import User, Department, Employee
from app.auth import get_current_user, get_password_hash
from app.ldap_helpers import connect, first, full_name, matricule, dept_name, escape_ldap, LDAP_ATTRS
from app.schemas import UserResponse, EmployeeResponse

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


def _run_ldap_sync(scope: str):
    import subprocess
    result = subprocess.run(
        ["python", "-m", "scripts.sync_ldap", "--scope", scope],
        capture_output=True, text=True, timeout=60,
        cwd="/app"
    )
    return {
        "success": result.returncode == 0,
        "output": result.stdout[-2000:] if result.stdout else "",
        "errors": result.stderr[-1000:] if result.stderr else "",
    }


@router.post("/ldap-sync")
async def admin_ldap_sync(_admin: User = Depends(require_admin)):
    return _run_ldap_sync("all")


@router.post("/ldap-sync-departments")
async def admin_ldap_sync_departments(_admin: User = Depends(require_admin)):
    return _run_ldap_sync("departments")


@router.post("/ldap-sync-employees")
async def admin_ldap_sync_employees(_admin: User = Depends(require_admin)):
    return _run_ldap_sync("employees")


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


@router.get("/ldap-employee-search")
async def admin_ldap_employee_search(q: str = "", _admin: User = Depends(require_admin)):
    q = (q or '').strip()
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
            q_safe = escape_ldap(q)
            if '@' in q:
                search_filter = f'(&(mail=*)(mail={q_safe}))'
            elif q.isdigit():
                padded = str(int(q)).zfill(5)
                search_filter = f'(|(employeeNumber={padded})(employeeNumber={q_safe})(uid={q_safe}))'
            else:
                search_filter = f'(|(cn={q_safe})(uid={q_safe})(mail={q_safe}))'

            conn.search(
                search_base=LDAP_USER_SEARCH_BASE,
                search_filter=search_filter,
                attributes=['cn', 'mail', 'givenName', 'sn', 'title', 'departmentNumber', 'ou', 'uid', 'employeeNumber', 'manager'],
                paged_size=30,
            )

            employees_by_matricule = {e.matricule: e async for e in Employee.all()}
            results = []
            for entry in conn.entries:
                rec = {attr: first(entry, attr) for attr in ['cn', 'mail', 'givenName', 'sn', 'title', 'departmentNumber', 'ou', 'uid', 'employeeNumber', 'manager']}
                email = (rec.get('mail') or '').strip().lower()
                if not email:
                    continue
                m = matricule(rec, email)
                existing = employees_by_matricule.get(m)
                results.append({
                    'email': email,
                    'name': full_name(rec),
                    'matricule': m,
                    'department': dept_name(rec),
                    'title': rec.get('title') or '',
                    'exists': existing is not None,
                    'employee_id': existing.id if existing else None,
                })
            return results
        finally:
            conn.unbind()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur LDAP: {str(e)}")


class LdapEmployeeCreateRequest(BaseModel):
    email: str


async def _resolve_manager(rec: dict, dept_name_: Optional[str]) -> Optional[User]:
    """Résout le manager d'un employé : tokensus le DN LDAP du manager, sinon
    chef de département, sinon DG (mêmes règles de repli que scripts.sync_ldap)."""
    raw_dn = rec.get('manager')
    if raw_dn:
        tokens = []
        for part in raw_dn.split(','):
            kv = part.split('=', 1)
            if len(kv) == 2 and kv[0].strip().lower() in ('cn', 'uid'):
                tokens.append(kv[1].strip())
        for tok in tokens:
            if '@' in tok:
                u = await User.get_or_none(email=tok.lower())
                if u:
                    return u
        for tok in tokens:
            if len(tok) >= 3:
                u = await User.filter(name__icontains=tok).first()
                if u:
                    return u
    if dept_name_:
        u = await User.filter(dept_str=dept_name_).first()
        if u:
            return u
    return await User.filter(is_dg=True).first()


@router.post("/ldap-employees", response_model=EmployeeResponse)
async def admin_create_employee_from_ldap(req: LdapEmployeeCreateRequest, _admin: User = Depends(require_admin)):
    import os
    from ldap3 import ALL, Connection, Server

    email = (req.email or '').strip().lower()
    if not email or '@' not in email:
        raise HTTPException(status_code=400, detail="Email invalide")

    LDAP_SERVER_URI = os.getenv('LDAP_SERVER_URI', 'ldap://ldap.blueline.mg:389')
    LDAP_BIND_DN = os.getenv('LDAP_BIND_DN', 'cn=admin,dc=blueline,dc=mg')
    LDAP_BIND_PASSWORD = os.getenv('LDAP_BIND_PASSWORD', 'blueline2488')
    LDAP_USER_SEARCH_BASE = os.getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg')

    server = Server(LDAP_SERVER_URI, get_info=ALL, connect_timeout=5)
    conn = Connection(server, user=LDAP_BIND_DN, password=LDAP_BIND_PASSWORD, auto_bind=True, receive_timeout=5)
    try:
        conn.search(
            search_base=LDAP_USER_SEARCH_BASE,
            search_filter=f'(&(mail=*)(mail={escape_ldap(email)}))',
            attributes=['cn', 'mail', 'givenName', 'sn', 'title', 'employeeNumber', 'departmentNumber', 'ou', 'uid', 'manager'],
            paged_size=5,
        )
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Personne non trouvée dans l'annuaire LDAP")
        entry = conn.entries[0]
        rec = {attr: first(entry, attr) for attr in ['cn', 'mail', 'givenName', 'sn', 'title', 'employeeNumber', 'departmentNumber', 'ou', 'uid', 'manager']}

        m = matricule(rec, email)
        if await Employee.exists(matricule=m):
            raise HTTPException(status_code=409, detail=f"L'employé {m} existe déjà dans BPM")

        dept_name_ = dept_name(rec)
        if not dept_name_:
            raise HTTPException(status_code=400, detail="Cette personne n'a pas de département dans l'annuaire LDAP — impossible de l'ajouter")
        dept_obj, _ = await Department.get_or_create(name=dept_name_)

        manager_user = await _resolve_manager(rec, dept_name_)
        if not manager_user:
            raise HTTPException(status_code=400, detail="Impossible de résoudre le manager de cet employé")

        emp = await Employee.create(
            matricule=m,
            name=full_name(rec),
            dept_str=dept_name_ or '',
            dept=dept_obj,
            manager=manager_user,
            currency='Ar',
            is_active=True,
        )
        return await Employee.get(id=emp.id)
    finally:
        conn.unbind()
