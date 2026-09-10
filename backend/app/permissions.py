"""Helpers de permissions partagées entre les routers API."""

from app.models import User, UserServiceAssignment

# Rôles avec une portée plus large que celle d'un N+1 : ils ne sont jamais
# restreints aux services affectés d'un N+1.
BROAD_ROLES = ('is_admin', 'is_dg', 'is_drh', 'is_directeur')


def is_broad_role(user: User) -> bool:
    """True si l'utilisateur a un rôle à portée département/globale."""
    return any(getattr(user, r) for r in BROAD_ROLES)


async def n1_service_group_ids(user: User):
    """IDs des services affectés à un N+1 via ``user_service_assignment``.

    Retourne:
      - ``None`` si l'utilisateur n'est pas un N+1 restreint : rôle plus large
        (admin/DG/DRH/Directeur) ou N+1 sans aucun service affecté → accès au
        département entier (comportement existant).
      - une liste d'IDs de services si l'utilisateur est un N+1 avec des
        services affectés → accès limité aux employés de ces services.
    """
    if not user.is_validator_n1 or is_broad_role(user):
        return None
    assignments = await UserServiceAssignment.filter(user_id=user.id).all()
    return [a.service_group_id for a in assignments] if assignments else None