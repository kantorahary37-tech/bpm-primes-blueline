from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List
from app.models import User, Department, Employee, ServiceGroup, UserServiceAssignment, Bonus, ValidationStatus
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
    # « Autoriser à modifier les plafonds » donne un accès transverse à tous
    # les départements : réservé à l'admin / DG / DRH.
    if getattr(data, 'can_modify_plafonds', None):
        raise HTTPException(status_code=403, detail="Seuls les administrateurs, le DG ou la DRH peuvent autoriser la modification des plafonds")


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
    is_validator_n2: Optional[bool] = None
    is_directeur: Optional[bool] = None
    is_drh: Optional[bool] = None
    is_dg: Optional[bool] = None
    is_admin: Optional[bool] = None
    can_modify_plafonds: Optional[bool] = None
    bypass_director: Optional[bool] = None
    directig: Optional[bool] = None
    employees: Optional[List[int]] = None


async def _get_user_or_404(user_id: int) -> User:
    user = await User.get_or_none(id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return user


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
    if data.is_validator_n2 is not None:
        user.is_validator_n2 = data.is_validator_n2
    if data.is_directeur is not None:
        user.is_directeur = data.is_directeur
    if data.is_drh is not None:
        user.is_drh = data.is_drh
    if data.is_dg is not None:
        user.is_dg = data.is_dg
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    if data.can_modify_plafonds is not None:
        user.can_modify_plafonds = data.can_modify_plafonds
    if data.bypass_director is not None:
        user.bypass_director = data.bypass_director

    await user.save()

    if data.directig:
        # Configuration "Passer directement à DG" : on enregistre uniquement le
        # rôle (user.bypass_director) et la liste des employés concernés. Aucune
        # prime n'est créée ici : quand ce user validera une prime en N+1 pour un
        # de ces employés, elle passera directement en attente DG (sans l'étape
        # Directeur). Le montant est donc vérifié au moment de la création de la
        # prime, pas ici.
        if data.employees is not None:
            if not data.employees:
                # Liste vide : on réinitialise la config.
                user.bypass_director = False
                await user.save()
                await user.bypass_employees.clear()
            else:
                user.bypass_director = True
                await user.save()
                valid_emps = []
                for emp_id in data.employees:
                    employee = await Employee.get_or_none(id=emp_id)
                    if not employee:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Employé introuvable : {emp_id}",
                        )
                    if employee.is_archived or not employee.is_active:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"L'employé {employee.name} est archivé ou inactif : impossible de l'ajouter.",
                        )
                    # Les employés doivent appartenir au périmètre du user
                    # configuré (ceux pour lesquels il crée et valide des primes).
                    if not await employee_in_scope(user, employee):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"{employee.name} n'est pas dans le périmètre de {user.name}.",
                        )
                    valid_emps.append(employee)
                await user.bypass_employees.clear()
                if valid_emps:
                    # add() attend des instances, pas des IDs.
                    await user.bypass_employees.add(*valid_emps)
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
    is_validator_n2: Optional[bool] = False
    is_directeur: Optional[bool] = False
    is_drh: Optional[bool] = False
    is_dg: Optional[bool] = False
    is_admin: Optional[bool] = False
    can_modify_plafonds: Optional[bool] = False


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
        is_validator_n2=data.is_validator_n2,
        is_directeur=data.is_directeur,
        is_drh=data.is_drh,
        is_dg=data.is_dg,
        is_admin=data.is_admin,
        can_modify_plafonds=data.can_modify_plafonds,
    )
    return user


class UserPrimeBatchRequest(BaseModel):
    employee_ids: List[int]


@router.post("/users/{user_id}/prime-batch", response_model=List[int])
async def admin_create_user_prime_batch(
    data: UserPrimeBatchRequest,
    user_id: int,
    admin: User = Depends(require_admin_or_director),
):
    """Crée une prime EN_ATTENTE_DG pour chaque employé sélectionné.

    Les primes créées partent directement en attente de validation DG,
    sans passer par l'étape Directeur.
    """
    user = await _get_user_or_404(user_id)
    if not (admin.is_admin or admin.is_directeur):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs ou directeurs",
        )
    _check_user_scope(admin, user)

    employee_ids = data.employee_ids or []
    if not employee_ids:
        return []

    created_ids = []
    created_employees = []
    for emp_id in employee_ids:
        employee = await Employee.get_or_none(id=emp_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employé introuvable : {emp_id}",
            )
        if employee.is_archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"L'employé {employee.name} est archivé : impossible de créer une prime pour lui.",
            )
        # Vérification du périmètre : l'admin ou le directeur peut créer des
        # primes pour les employés qui sont dans son périmètre.
        if not await employee_in_scope(admin, employee):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Vous ne pouvez pas créer une prime pour {employee.name} (hors périmètre).",
            )
        created_employee = await employee
        created_employees.append(created_employee)

        emp_currency = emp_currency_code(created_employee)
        emp_symbol = await currency_symbol(emp_currency)
        primemax = await PrimeMax.filter(
            dept_str=created_employee.dept_str,
            bonus_type=BonusType.ASTREINTE,
            currency=emp_currency,
        ).first()

        # Pour le batch, on crée une prime astreinte (type par défaut) à
        # partir du taux de l'employé, ou du plafond si existant.
        amount = None
        if created_employee.astreinte_rate is not None:
            amount = Decimal(str(created_employee.astreinte_rate))
        elif primemax is not None:
            amount = primemax.amount

        if amount is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Aucun montant disponible pour créer la prime de {employee.name}.",
            )

        total_amount = amount
        bonus = await Bonus.create(
            employee_id=employee.id,
            start_date=date.today(),
            end_date=date.today(),
            bonus_type=BonusType.ASTREINTE,
            total_amount=total_amount,
            currency=emp_currency,
            created_by_id=admin.id,
            status=ValidationStatus.EN_ATTENTE_DG,
        )
        created_ids.append(bonus.id)

    return created_ids


@router.get("/users/{user_id}/bypass-employees")
async def admin_get_user_bypass_employees(user_id: int, admin: User = Depends(require_admin_or_director)):
    """Liste des IDs d'employés configurés en "Passer directement à DG"
    pour ce user : après sa validation N+1, les primes de ces employés
    passent directement en attente DG (sans l'étape Directeur).
    """
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)
    rows = await user.bypass_employees.all().values("id")
    return [r["id"] for r in rows]


@router.get("/users/{user_id}/scope-employees")
async def admin_list_user_scope_employees(user_id: int, admin: User = Depends(require_admin_or_director)):
    """Liste des employés visibles par le user ``user_id`` dans SA page Employés.

    Réutilise exactement la même logique de périmètre que GET /employees/ :
    département du user + employés dont il est le manager, restreint à ses
    services affectés pour un N+1/N+2. Utilisé par la modale "Passer
    directement à DG" pour ne proposer que les employés pour lesquels ce user
    peut réellement créer une prime.
    """
    user = await _get_user_or_404(user_id)
    _check_user_scope(admin, user)

    query = Employee.all().filter(is_active=True, is_archived=False).prefetch_related('service_group')
    if user.is_admin or user.is_dg or user.is_drh:
        pass  # portée globale
    else:
        query = apply_department_scope(query, user)
        query = apply_employee_scope(query, await employee_scope(user))

    employees = await query.order_by("name")
    return [
        {
            "id": e.id,
            "matricule": e.matricule,
            "name": e.name,
            "department": e.dept_str,
            "service_group": (e.service_group.name if e.service_group else None),
        }
        for e in employees
    ]


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


async def _run_ldap_sync(scope: str, trigger_type: str, admin: User):
    """Lance la synchronisation LDAP create-only dans le process courant.

    Ne crée que les employés absents de BPM ; les employés existants ne sont
    jamais modifiés. Retourne un résumé lisible (aucune donnée sensible).
    """
    from app.ldap_sync_service import run_ldap_sync

    try:
        result = await run_ldap_sync(
            trigger_type=trigger_type,
            created_by=admin,
            scope=scope,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de synchronisation LDAP : {e}")
    return _ldap_sync_summary(result)


def _ldap_sync_summary(result: dict) -> dict:
    """Résumé lisible pour l'administrateur (aucune donnée sensible)."""
    return {
        "success": result.get("status") == "COMPLETED",
        "status": result.get("status"),
        "ldap_found": result.get("ldap_found", 0),
        "created": result.get("created", 0),
        "already_existing": result.get("already_existing", 0),
        "skipped": result.get("skipped", 0),
        "errors": result.get("errors", 0),
        "duration_seconds": result.get("duration_seconds"),
        "created_list": result.get("created_list", []),
        "skipped_list": result.get("skipped_list", []),
        "error_list": result.get("error_list", []),
    }


@router.post("/ldap-sync")
async def admin_ldap_sync(admin: User = Depends(require_admin)):
    """Synchronisation LDAP create-only (nouveaux employés uniquement)."""
    return await _run_ldap_sync("employees", "MANUAL", admin)


@router.post("/ldap-sync-departments")
async def admin_ldap_sync_departments(admin: User = Depends(require_admin)):
    """Crée uniquement les départements LDAP manquants (aucun employé touché)."""
    from app.ldap_sync_service import run_department_sync
    try:
        result = await run_department_sync(trigger_type="MANUAL", created_by=admin)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de synchronisation LDAP : {e}")
    return _ldap_sync_summary(result)


@router.post("/ldap-sync-employees")
async def admin_ldap_sync_employees(admin: User = Depends(require_admin)):
    """Synchronisation LDAP des employés (create-only)."""
    return await _run_ldap_sync("employees", "MANUAL", admin)


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

            employees_by_matricule = {e.matricule: e async for e in Employee.all() if not e.is_archived}
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
                    'exists': existing is not None or (await Employee.filter(matricule=m, is_archived=True).exists()),
                    'employee_id': existing.id if existing else None,
                    'is_archived': existing is None and (await Employee.filter(matricule=m, is_archived=True).exists()),
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
        existing = await Employee.get_or_none(matricule=m)
        if existing and existing.is_archived:
            raise HTTPException(status_code=409, detail=f"L'employé {m} est archivé dans BPM — restaurez-le d'abord depuis la page Archive (admin)")
        if existing:
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


# ------------------------------------------------------------------
# Config Snapshots (sauvegarde des affectations)
# ------------------------------------------------------------------
from app.models import ConfigSnapshot
from datetime import datetime
import os, json, re
from fastapi.responses import FileResponse
from app.auth import get_current_user, get_password_hash
from app.ldap_helpers import connect, first, full_name, matricule, dept_name, escape_ldap, LDAP_ATTRS
from app.schemas import UserResponse, EmployeeResponse, UserServiceAssignmentResponse, UserServiceAssignmentCreate, UserServiceAssignmentUpdate
from app.models import User, Department, Employee, ServiceGroup, UserServiceAssignment, Bonus, ValidationStatus, BonusType, PrimeMax
from app.permissions import (
    employee_in_scope,
    employee_scope,
    apply_employee_scope,
    apply_department_scope,
    managed_employee_ids,
)
from app.currency_format import employee_currency_code as emp_currency_code, currency_symbol
from decimal import Decimal
from datetime import date

SNAPSHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "snapshots")


def _sanitize_filename(name: str) -> str:
    """Convertit un nom en nom de fichier sûr."""
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'\s+', '_', name.strip())
    return name[:80] or 'snapshot'


def _generate_sql_file(snapshot_data: list, label: str, created_by_name: str, created_at) -> str:
    """Génère un fichier SQL de sauvegarde. Retourne le chemin du fichier."""
    ts = created_at.strftime('%Y%m%d_%H%M%S') if hasattr(created_at, 'strftime') else datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_label = _sanitize_filename(label)
    filename = f"{ts}_{safe_label}.sql"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)

    lines = []
    lines.append(f"-- =============================================")
    lines.append(f"-- Sauvegarde des affectations employés")
    lines.append(f"-- Label       : {label}")
    lines.append(f"-- Créé par    : {created_by_name}")
    lines.append(f"-- Date        : {created_at}")
    lines.append(f"-- Employés    : {len(snapshot_data)}")
    lines.append(f"-- =============================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # 1) S'assurer que les départements existent
    dept_names = sorted({e.get('department', '') for e in snapshot_data if e.get('department')})
    if dept_names:
        lines.append("-- === Départements ===")
        for d in dept_names:
            d_escaped = d.replace("'", "''")
            lines.append(f"INSERT INTO \"department\" (\"name\") VALUES ('{d_escaped}') ON CONFLICT (\"name\") DO NOTHING;")
        lines.append("")

    # 2) S'assurer que les services existent
    services_seen = {}
    for e in snapshot_data:
        sg_id = e.get('service_group_id')
        sg_name = e.get('service_group_name')
        dept = e.get('department', '')
        if sg_id and sg_name and dept:
            services_seen[sg_id] = (sg_name, dept)
    if services_seen:
        lines.append("-- === Services ===")
        for sg_id, (sg_name, dept) in services_seen.items():
            sg_name_escaped = sg_name.replace("'", "''")
            dept_escaped = dept.replace("'", "''")
            lines.append(
                f"INSERT INTO \"servicegroup\" (\"id\", \"name\", \"department_id\") "
                f"VALUES ({sg_id}, '{sg_name_escaped}', (SELECT \"id\" FROM \"department\" WHERE \"name\" = '{dept_escaped}')) "
                f"ON CONFLICT (\"id\") DO NOTHING;"
            )
        lines.append("")

    # 3) Mettre à jour les employés
    lines.append("-- === Affectations employés (département + service) ===")
    for e in snapshot_data:
        emp_id = e.get('employee_id')
        dept = e.get('department', '')
        sg_id = e.get('service_group_id')
        if not emp_id:
            continue
        dept_escaped = dept.replace("'", "''")
        sg_val = str(sg_id) if sg_id else 'NULL'
        lines.append(
            f"UPDATE \"employee\" SET "
            f"\"department\" = '{dept_escaped}', "
            f"\"department_id\" = (SELECT \"id\" FROM \"department\" WHERE \"name\" = '{dept_escaped}'), "
            f"\"service_group_id\" = {sg_val} "
            f"WHERE \"id\" = {emp_id};"
        )
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")
    lines.append(f"-- Fin de la sauvegarde")

    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    return filepath


class ConfigSnapshotCreate(BaseModel):
    label: str


@router.post("/config-snapshots", status_code=status.HTTP_201_CREATED)
async def create_config_snapshot(data: ConfigSnapshotCreate, admin: User = Depends(require_admin)):
    """Crée une sauvegarde DB + fichier SQL de l'état actuel des affectations."""
    employees = await Employee.filter(is_active=True, is_archived=False).prefetch_related('service_group')
    snapshot_data = []
    for emp in employees:
        sg = emp.service_group
        snapshot_data.append({
            "employee_id": emp.id,
            "matricule": emp.matricule,
            "name": emp.name,
            "department": emp.dept_str or '',
            "service_group_id": sg.id if sg else None,
            "service_group_name": sg.name if sg else None,
        })

    now = datetime.now()

    # 1) Sauvegarde en base
    snapshot = await ConfigSnapshot.create(
        label=data.label.strip(),
        created_by=admin,
        snapshot_data=snapshot_data,
        employee_count=len(snapshot_data),
    )

    # 2) Sauvegarde fichier SQL
    sql_path = _generate_sql_file(snapshot_data, data.label.strip(), admin.name, now)
    sql_filename = os.path.basename(sql_path)

    return {
        "id": snapshot.id,
        "label": snapshot.label,
        "employee_count": snapshot.employee_count,
        "created_at": snapshot.created_at,
        "sql_file": sql_filename,
    }


@router.get("/config-snapshots")
async def list_config_snapshots(admin: User = Depends(require_admin)):
    """Liste toutes les sauvegardes (DB + fichiers sur disque)."""
    # Snapshots en base
    snapshots = await ConfigSnapshot.all().prefetch_related('created_by').order_by('-created_at')
    db_list = [
        {
            "id": s.id,
            "label": s.label,
            "employee_count": s.employee_count,
            "created_by_name": s.created_by.name if s.created_by else None,
            "created_at": s.created_at,
            "source": "database",
        }
        for s in snapshots
    ]

    # Fichiers SQL sur disque
    file_list = []
    if os.path.isdir(SNAPSHOTS_DIR):
        for fname in sorted(os.listdir(SNAPSHOTS_DIR), reverse=True):
            if fname.endswith('.sql'):
                fpath = os.path.join(SNAPSHOTS_DIR, fname)
                fsize = os.path.getsize(fpath)
                file_list.append({
                    "filename": fname,
                    "size_bytes": fsize,
                    "size_display": f"{fsize / 1024:.1f} Ko" if fsize >= 1024 else f"{fsize} o",
                    "source": "file",
                })

    return {"snapshots": db_list, "files": file_list}


@router.get("/config-snapshots/{snapshot_id}")
async def get_config_snapshot(snapshot_id: int, admin: User = Depends(require_admin)):
    """Détail d'une sauvegarde (données complètes)."""
    snapshot = await ConfigSnapshot.get_or_none(id=snapshot_id).prefetch_related('created_by')
    if not snapshot:
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")
    return {
        "id": snapshot.id,
        "label": snapshot.label,
        "employee_count": snapshot.employee_count,
        "created_by_name": snapshot.created_by.name if snapshot.created_by else None,
        "created_at": snapshot.created_at,
        "snapshot_data": snapshot.snapshot_data,
    }


@router.get("/config-snapshots/files/{filename}")
async def download_snapshot_file(filename: str, admin: User = Depends(require_admin)):
    """Télécharge un fichier SQL de sauvegarde."""
    # Sécurité : pas de ../ dans le nom
    safe = os.path.basename(filename)
    filepath = os.path.join(SNAPSHOTS_DIR, safe)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(
        filepath,
        media_type='text/plain',
        filename=safe,
    )


@router.post("/config-snapshots/files/{filename}/restore")
async def restore_from_sql_file(filename: str, admin: User = Depends(require_admin)):
    """Restaure les affectations en exécutant un fichier SQL de sauvegarde."""
    safe = os.path.basename(filename)
    filepath = os.path.join(SNAPSHOTS_DIR, safe)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Fichier SQL introuvable")

    try:
        from tortoise import connections
        conn = connections.get('default')
        with open(filepath, 'r', encoding='utf-8') as f:
            sql = f.read()
        # Exécuter le SQL brut (BEGIN/COMMIT gérés dans le fichier)
        await conn.execute_script(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'exécution SQL : {str(e)}")

    # Compter les employés affectés dans le fichier
    import re
    update_count = len(re.findall(r'UPDATE "employee"', sql))

    return {
        "message": f"Fichier {safe} exécuté avec succès",
        "employees_affected": update_count,
        "filename": safe,
    }


@router.post("/config-snapshots/{snapshot_id}/restore")
async def restore_config_snapshot(snapshot_id: int, admin: User = Depends(require_admin)):
    """Restaure les affectations depuis une sauvegarde."""
    snapshot = await ConfigSnapshot.get_or_none(id=snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")

    data = snapshot.snapshot_data
    restored = 0
    skipped = 0
    errors = []

    for entry in data:
        emp_id = entry.get("employee_id")
        emp = await Employee.get_or_none(id=emp_id)
        if not emp:
            skipped += 1
            continue
        try:
            dept_name_str = entry.get("department", "")
            if dept_name_str:
                dept_obj, _ = await Department.get_or_create(name=dept_name_str)
                emp.dept_str = dept_name_str
                emp.dept = dept_obj
            sg_id = entry.get("service_group_id")
            if sg_id:
                sg = await ServiceGroup.get_or_none(id=sg_id)
                emp.service_group = sg
            else:
                emp.service_group = None
            await emp.save()
            restored += 1
        except Exception as e:
            errors.append({"employee_id": emp_id, "error": str(e)})

    return {
        "restored": restored,
        "skipped": skipped,
        "errors": errors,
        "snapshot_label": snapshot.label,
    }


@router.delete("/config-snapshots/{snapshot_id}")
async def delete_config_snapshot(snapshot_id: int, admin: User = Depends(require_admin)):
    """Supprime une sauvegarde de configuration (DB + fichier)."""
    snapshot = await ConfigSnapshot.get_or_none(id=snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")
    # Supprimer le fichier SQL correspondant si présent
    if os.path.isdir(SNAPSHOTS_DIR):
        label_safe = _sanitize_filename(snapshot.label)
        for fname in os.listdir(SNAPSHOTS_DIR):
            if fname.endswith('.sql') and label_safe in fname:
                try:
                    os.remove(os.path.join(SNAPSHOTS_DIR, fname))
                except OSError:
                    pass
    await snapshot.delete()
    return {"message": "Sauvegarde supprimée"}
