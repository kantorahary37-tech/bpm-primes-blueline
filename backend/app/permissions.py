"""Helpers de permissions partagées entre les routers API."""

from tortoise.expressions import Q

from app.models import Employee, User, UserServiceAssignment

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
        (admin/DG/DRH/Directeur), utilisateur sans rôle de validateur, ou
        N+1/N+2 sans aucun service affecté → accès au département entier
        (le filtre département est appliqué par les endpoints).
      - la liste (non vide) des IDs de services pour un N+1/N+2 affecté →
        accès strictement limité à ces services.
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


async def managed_employee_ids(user: User):
    """IDs des employés dont l'utilisateur est le manager (Employee.manager).

    Indépendant du rôle : un manager peut être N+1, N+2, Directeur, ou même sans
    aucun rôle de validateur. Ces employés restent accessibles même s'ils
    relèvent d'un autre département (voir apply_department_scope).
    """
    return set(await Employee.filter(manager_id=user.id).values_list("id", flat=True))


async def employee_scope(user: User):
    """Périmètre d'employés d'un utilisateur.

    Retourne ``(service_group_ids, own_employee_id, managed_employee_ids)`` :

    - ``sids`` : ``None`` si l'utilisateur n'est pas restreint par son rôle
      (rôle large, non valideur, ou N+1/N+2 sans service affecté → le filtre
      département est appliqué par les endpoints) ; sinon la liste (non vide)
      des IDs de services d'un N+1/N+2 affecté.
    - ``own_id`` : la fiche de l'utilisateur lui-même, s'il est aussi employé.
    - ``managed_ids`` : les employés dont il est le manager — toujours ajoutés
      au périmètre, quel que soit son rôle et même hors de son département.
    """
    sids = await n1_service_group_ids(user)
    managed = await managed_employee_ids(user)
    # None (pas restreint) ou liste vide (N+1/N+2 sans affectation) → département entier
    if not sids:
        return None, None, managed
    return sids, None, managed


def apply_employee_scope(query, scope, rel=""):
    """Applique un périmètre à une queryset.

    ``rel=''`` pour filtrer une queryset d'employés, ``rel='employee__'``
    pour une queryset de primes. Sans effet sur le restriction de rôle si
    l'utilisateur n'est pas restreint : les employés qu'il manage sont alors
    couverts par le filtre département (apply_department_scope).
    """
    sids, _own_id, managed_ids = scope
    if not sids:
        return query
    cond = Q(**{f"{rel}service_group_id__in": sids})
    if managed_ids:
        cond = cond | Q(**{f"{rel}manager_id__in": sorted(managed_ids)})
    return query.filter(cond)


def apply_department_scope(query, user: User, rel=""):
    """Restreint la queryset au département de l'utilisateur **plus** les
    employés dont il est le manager.

    Un manager garde ainsi son périmètre habituel dans son département, et peut
    en plus voir les employés qui lui sont assignés même s'ils relèvent d'un
    autre département. Sans effet pour les rôles à portée globale (admin/DG/DRH),
    qui ne doivent pas être filtrés ici.

    ``rel=''`` pour une queryset d'employés, ``rel='employee__'`` pour une
    queryset de primes.
    """
    if user.is_admin or user.is_dg or user.is_drh:
        return query
    dept_field = f"{rel}dept_str"
    managed_field = f"{rel}manager_id"
    if user.department:
        return query.filter(Q(**{dept_field: user.department}) | Q(**{managed_field: user.id}))
    return query.filter(**{managed_field: user.id})


async def employee_in_scope(user: User, employee) -> bool:
    """True si l'employé appartient au périmètre du user.

    - Manager de l'employé : toujours vrai, quel que soit son rôle et même si
      l'employé est dans un autre département.
    - Rôles larges / non validateurs / N+1-N+2 sans affectation : toujours
      vrai (le filtre département est appliqué par les endpoints concernés).
    - N+1/N+2 avec des services affectés : les employés de ces services, plus
      ceux dont ils sont le manager.
    """
    sids, own_id, managed_ids = await employee_scope(user)
    if managed_ids and employee.id in managed_ids:
        return True
    if sids is None:
        return True
    if sids:
        return bool(employee.service_group_id) and employee.service_group_id in sids
    return own_id is not None and employee.id == own_id