"""Helpers de permissions partagées entre les routers API."""

from app.models import User, UserServiceAssignment, Employee

# Rôles avec une portée plus large que celle d'un N+1 : ils ne sont jamais
# restreints aux services affectés d'un N+1.
BROAD_ROLES = ('is_admin', 'is_dg', 'is_drh', 'is_directeur')


def is_broad_role(user: User) -> bool:
    """True si l'utilisateur a un rôle à portée département/globale."""
    return any(getattr(user, r) for r in BROAD_ROLES)


# Note : il n'existe volontairement aucune permission de création manuelle
# d'employé — les employés sont créés uniquement via LDAP (admin seul).


async def n1_service_group_ids(user: User):
    """IDs des services affectés à un N+1 / N+2.

    Deux sources sont unionnées :
      - ``user_service_assignment`` (assignations créées depuis la page Utilisateurs),
      - ``user_servicegroup`` (services gérés depuis la page Services).

    Retourne:
      - ``None`` si l'utilisateur n'est pas restreint : rôle plus large
        (admin/DG/DRH/Directeur) ou utilisateur sans rôle de validateur →
        accès au département entier (comportement existant).
      - la liste (possible vide) des IDs de services pour un N+1/N+2 → accès
        strictement limité à ces services ; un N+1/N+2 sans aucun service
        affecté ne voit ni employé ni prime.
    """
    if is_broad_role(user):
        return None
    if not (user.is_validator_n1 or user.is_validator_n2):
        return None
    assignments = await UserServiceAssignment.filter(user_id=user.id).all()
    sids = {a.service_group_id for a in assignments}
    managed = await user.service_groups.all()
    sids.update(g.id for g in managed)
    return sorted(sids)


async def own_employee(user: User):
    """Employé correspondant à l'utilisateur lui-même.

    Correspondance (nom, département) exactement comme ``users.employee_lookup``,
    limité aux employés actifs. Retourne ``None`` si aucun employé ne correspond.
    """
    name_key = (user.name or '').strip().lower()
    if not name_key:
        return None
    dept_key = user.department or ''
    employees = await Employee.filter(dept_str=dept_key, is_active=True).only('id', 'name').order_by('id')
    for emp in employees:
        if ((emp.name or '').strip().lower()) == name_key:
            return emp
    return None


async def employee_scope(user: User):
    """Périmètre d'employés d'un utilisateur : ``(service_group_ids, own_employee_id)``.

    - ``(None, None)`` : pas de restriction (rôle large ou non validateur).
    - ``([ids], None)`` : restreint aux employés des services affectés.
    - ``([], id | None)`` : aucun service affecté → uniquement son propre
      employé (il ne peut créer une prime que pour lui-même) ; ``None`` si
      aucun employé ne correspond à l'utilisateur → rien du tout.
    """
    sids = await n1_service_group_ids(user)
    if sids is None:
        return None, None
    if sids:
        return sids, None
    emp = await own_employee(user)
    return [], (emp.id if emp else None)


def apply_employee_scope(query, scope, rel=""):
    """Applique un périmètre à une queryset.

    ``rel=''`` pour filtrer une queryset d'employés, ``rel='employee__'``
    pour une queryset de primes. Sans effet si l'utilisateur n'est pas restreint.
    """
    sids, own_id = scope
    if sids is None:
        return query
    if sids:
        return query.filter(**{f"{rel}service_group_id__in": sids})
    # Aucun service affecté → uniquement son propre employé
    return query.filter(**{f"{rel}id": own_id}) if own_id else query.filter(**{f"{rel}id__in": []})


async def employee_in_scope(user: User, employee) -> bool:
    """True si l'employé appartient au périmètre du user.

    - Rôles larges / non validateurs : toujours vrai (le filtre département
      est appliqué par les endpoints concernés).
    - N+1/N+2 avec des services affectés : uniquement les employés de ces
      services.
    - N+1/N+2 sans aucun service affecté : uniquement son propre employé.
    """
    sids, own_id = await employee_scope(user)
    if sids is None:
        return True
    if sids:
        return bool(employee.service_group_id) and employee.service_group_id in sids
    return own_id is not None and employee.id == own_id