from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from app.models import User, Department, Employee, ServiceGroup, UserServiceAssignment
from app.auth import get_current_user, get_password_hash
from app.ldap_helpers import connect, first, full_name, matricule, dept_name, escape_ldap, LDAP_ATTRS
from app.schemas import UserResponse, EmployeeResponse, UserServiceAssignmentResponse, UserServiceAssignmentCreate, UserServiceAssignmentUpdate

router = APIRouter()


def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


def require_admin_or_director(user: User = Depends(get_current_user)):
    if not (user.is_admin or user.is_directeur):
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs ou directeurs")
    return user


def _scoped_director(user: User) -> bool:
    """True si 'user' est un directeur avec portée limitée à son département
    (non admin / dg / drh)."""
    return bool(user.is_directeur) and not (user.is_admin or user.is_dg or user.is_drh)


def _check_user_scope(admin: User, target: User):
    """Vérifie qu'un directeur scoped ne manipule que des users de son département."""
    if _scoped_director(admin) and target.dept_str != admin.dept_str:
        raise HTTPException(status_code=403, detail="Ce directeur ne peut gérer que les utilisateurs de son département")


def _check_director_role_edit(admin: User, data):
    """Un directeur scoped ne peut pas attribuer de rôle à portée système."""
    if not _scoped_director(admin):
        return
    if data.is_admin or data.is_dg or data.is_drh:
        raise HTTPException(status_code=403, detail="Un directeur ne peut pas attribuer les rôles admin, DG ou DRH")


@router.get("/users", response_model=list[UserResponse])
async def admin_list_users(admin: User = Depends(require_admin_or_director)):
    if _scoped_director(admin):
        return await User.filter(dept_str=admin.dept_str).order_by("name")
    users = await User.all().order_by("name")
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
async def admin_update_user(user_id: int, data: UserUpdateRequest, admin: User = Depends(require_admin_or_director)):
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)
    _check_director_role_edit(admin, data)
    if _scoped_director(admin) and (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(status_code=403, detail="Un directeur ne peut pas gérer un compte admin, DG ou DRH")
    if _scoped_director(admin) and data.department is not None and data.department != admin.dept_str:
        raise HTTPException(status_code=403, detail="Un directeur ne peut pas changer le département des utilisateurs")
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
async def admin_delete_user(user_id: int, admin: User = Depends(require_admin_or_director)):
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    await user.delete()
    return {"message": "Utilisateur supprimé"}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: int, admin: User = Depends(require_admin_or_director)):
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)
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
async def admin_create_user(data: CreateUserRequest, admin: User = Depends(require_admin_or_director)):
    if _scoped_director(admin):
        _check_director_role_edit(admin, data)
        data.department = admin.dept_str
        if data.department is None:
            raise HTTPException(status_code=403, detail="Votre profil n'est associé à aucun département")
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


async def _get_user_or_404(user_id: int) -> User:
    user = await User.get_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return user


async def _assignment_to_response(assignment: UserServiceAssignment) -> dict:
    sg = await assignment.service_group
    dept = await sg.department
    data = {
        "id": assignment.id,
        "service_group_id": sg.id,
        "service_group_name": sg.name,
        "department": dept.name,
        "n1_id": None,
        "n1_name": None,
        "n1_email": None,
        "created_at": assignment.created_at,
    }
    if assignment.n1_id:
        n1 = await assignment.n1
        data["n1_id"] = n1.id
        data["n1_name"] = n1.name
        data["n1_email"] = n1.email
    return data


async def _validate_n1(user: User, service_group_id: int, n1_id: Optional[int]):
    """Valide le n+1 : doit exister, ne pas être l'utilisateur lui-même,
    et appartenir au service choisi (contrainte stricte)."""
    if n1_id is None:
        return None
    if n1_id == user.id:
        raise HTTPException(status_code=400, detail="Un utilisateur ne peut pas être son propre N+1")
    n1 = await User.get_or_none(id=n1_id)
    if not n1:
        raise HTTPException(status_code=404, detail="Utilisateur N+1 introuvable")
    same_service = await UserServiceAssignment.exists(user_id=n1_id, service_group_id=service_group_id)
    if not same_service:
        raise HTTPException(status_code=400, detail="Le N+1 doit appartenir au même service que l'utilisateur")
    return n1


@router.get("/users/{user_id}/service-assignments", response_model=list[UserServiceAssignmentResponse])
async def admin_list_user_service_assignments(user_id: int, admin: User = Depends(require_admin_or_director)):
    target = await _get_user_or_404(user_id)
    _check_user_scope(admin, target)
    assignments = await UserServiceAssignment.filter(user_id=user_id).order_by("created_at")
    return [await _assignment_to_response(a) for a in assignments]


@router.post("/users/{user_id}/service-assignments", response_model=UserServiceAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user_service_assignment(user_id: int, data: UserServiceAssignmentCreate, admin: User = Depends(require_admin_or_director)):
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)
    service_group = await ServiceGroup.get_or_none(id=data.service_group_id)
    if not service_group:
        raise HTTPException(status_code=404, detail="Service introuvable")
    if await UserServiceAssignment.exists(user_id=user_id, service_group_id=data.service_group_id):
        raise HTTPException(status_code=400, detail="Cette utilisateur est déjà assigné à ce service")
    n1 = await _validate_n1(user, data.service_group_id, data.n1_id)
    assignment = await UserServiceAssignment.create(
        user=user,
        service_group=service_group,
        n1=n1,
    )
    return await _assignment_to_response(assignment)


@router.put("/users/{user_id}/service-assignments/{assignment_id}", response_model=UserServiceAssignmentResponse)
async def admin_update_user_service_assignment(user_id: int, assignment_id: int, data: UserServiceAssignmentUpdate, admin: User = Depends(require_admin_or_director)):
    target = await _get_user_or_404(user_id)
    _check_user_scope(admin, target)
    assignment = await UserServiceAssignment.get_or_none(id=assignment_id, user_id=user_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignation introuvable")
    user = await _get_user_or_404(user_id)
    n1 = await _validate_n1(user, assignment.service_group_id, data.n1_id)
    assignment.n1 = n1
    await assignment.save()
    return await _assignment_to_response(assignment)


@router.delete("/users/{user_id}/service-assignments/{assignment_id}")
async def admin_delete_user_service_assignment(user_id: int, assignment_id: int, admin: User = Depends(require_admin_or_director)):
    target = await _get_user_or_404(user_id)
    _check_user_scope(admin, target)
    assignment = await UserServiceAssignment.get_or_none(id=assignment_id, user_id=user_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignation introuvable")
    await assignment.delete()
    return {"message": "Assignation supprimée"}


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
async def admin_ldap_search(q: str = "", _admin: User = Depends(require_admin_or_director)):
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
            attributes=['cn', 'mail', 'givenName', 'sn', 'title', 'employeeType', 'employeeNumber', 'departmentNumber', 'ou', 'uid', 'manager'],
            paged_size=5,
        )
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Personne non trouvée dans l'annuaire LDAP")
        entry = conn.entries[0]
        rec = {attr: first(entry, attr) for attr in ['cn', 'mail', 'givenName', 'sn', 'title', 'employeeType', 'employeeNumber', 'departmentNumber', 'ou', 'uid', 'manager']}

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
            poste=rec.get('title') or rec.get('employeeType') or None,
            dept_str=dept_name_ or '',
            dept=dept_obj,
            manager=manager_user,
            currency='Ar',
            is_active=True,
        )
        return await Employee.get(id=emp.id)
    finally:
        conn.unbind()
