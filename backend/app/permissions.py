"""Helpers de permissions partagées entre les routers API."""

from app.models import User, UserServiceAssignment

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


async def employee_scope(user: User):
    """Périmètre d'employés d'un utilisateur : ``(service_group_ids, own_employee_id)``.

    - ``(None, None)`` : pas de restriction — rôle large, non valideur, ou
      N+1/N+2 sans service affecté (il voit son département entier, le filtre
      département étant appliqué par les endpoints).
    - ``([ids], None)`` : N+1/N+2 restreint aux employés de ses services affectés.
    """
    sids = await n1_service_group_ids(user)
    # None (pas restreint) ou liste vide (N+1/N+2 sans affectation) → département entier
    if not sids:
        return None, None
    return sids, None


def apply_employee_scope(query, scope, rel=""):
    """Applique un périmètre à une queryset.

    ``rel=''`` pour filtrer une queryset d'employés, ``rel='employee__'``
    pour une queryset de primes. Sans effet si l'utilisateur n'est pas restreint.
    """
    sids, _own_id = scope
    if not sids:
        return query
    return query.filter(**{f"{rel}service_group_id__in": sids})


async def employee_in_scope(user: User, employee) -> bool:
    """True si l'employé appartient au périmètre du user.

    - Rôles larges / non validateurs / N+1-N+2 sans affectation : toujours
      vrai (le filtre département est appliqué par les endpoints concernés).
    - N+1/N+2 avec des services affectés : uniquement les employés de ces
      services.
    """
    sids, own_id = await employee_scope(user)
    if sids is None:
        return True
    if sids:
        return bool(employee.service_group_id) and employee.service_group_id in sids
    return own_id is not None and employee.id == own_id