"""Types de primes gérés par département (« Assignation gestion des primes »).

Chaque département peut avoir ses types de primes autorisés (case à cocher dans
l'écran Administration → Départements → Modifier). Ces types sont vérifiés à la
création d'une prime, côté serveur : c'est la source de vérité.

Les types qui ne sont pas configurables (``exceptionnel``, ``ponctuelle``,
``intervention``, ``commission_gc``…) ne sont pas concernés : ils restent
autorisés partout.

Tant qu'un département n'a pas été configuré (``Department.bonus_types`` vide),
on retombe sur :REGLE_HISTORIQUE: — l'ancienne liste figée dans le code — afin
qu'un département créé ou jamais modifié garde le comportement actuel.
"""

from app.models import BonusType, Department

# Types proposed dans l'écran de configuration d'un département
MANAGED_BONUS_TYPES: tuple[str, ...] = ('mensuel', 'astreinte', 'commission')

MANAGED_BONUS_TYPE_LABELS: dict[str, str] = {
    'mensuel': 'Prime Mensuelle',
    'astreinte': 'Prime Astreinte',
    'commission': 'Commission GP',
}

# Ancienne liste figée, conservée comme valeur de repli des départements non
# configurés (et appliquée une fois par la migration au démarrage).
REGLE_HISTORIQUE: dict[str, tuple[str, ...]] = {
    'mensuel': (
        'Direction Achat', 'Direction Administrative et Financiere',
        'Direction BBS', 'Direction Clientele', 'Direction Commerciale',
        'Direction Communication et Marketing', 'Direction des Operations',
        'Direction des Services Generaux', "Direction des Systemes d'Informations",
        'Direction Generale', 'Direction Logistique', 'Direction Technique',
    ),
    'astreinte': (
        'Direction BBS', 'Direction des Operations',
        "Direction des Systemes d'Informations", 'Direction Technique',
    ),
    'commission': ('Direction Commerciale',),
}

_TOUS_LES_TYPES = tuple(t.value for t in BonusType)


def _as_list(raw) -> list[str]:
    """Normalise la colonne JSON : liste de valeurs, ordre du modèle conservé."""
    if not raw:
        return []
    if isinstance(raw, str):
        return [v.strip() for v in raw.split(',') if v.strip()]
    return [str(v) for v in raw]


def _ordered(types) -> list[str]:
    """Classe les types selon l'ordre du modèle (les 3 gérés d'abord)."""
    wanted = {str(t) for t in types}
    return [t for t in _TOUS_LES_TYPES if t in wanted]


async def department_bonus_types(dept_name: str | None) -> list[str]:
    """Types de primes autorisés pour un département.

    - configuration explicite (``Department.bonus_types`` non vide) : elle fait foi ;
    - sinon repli strict sur la règle historique, département par département
      (un département absent de :data:`REGLE_HISTORIQUE` n'a donc aucun type
      géré, comme avant) ;
    - les départements créés depuis l'écran d'administration reçoivent
      explicitement les trois types gérés, donc ce repli ne les concerne pas.

    Seuls les types gérés (:data:`MANAGED_BONUS_TYPES`) sont concernés ; les
    autres sont toujours autorisés et figurent donc dans la liste renvoyée.
    """
    if not dept_name:
        return list(_TOUS_LES_TYPES)

    dept = await Department.get_or_none(name=dept_name)
    configured = [t for t in _as_list(dept.bonus_types if dept else None) if t in MANAGED_BONUS_TYPES]
    if configured:
        return _ordered(configured)
    legacy = [t for t in MANAGED_BONUS_TYPES if dept_name in REGLE_HISTORIQUE.get(t, ())]
    return _ordered(legacy)


async def department_allows(dept_name: str | None, bonus_type) -> bool:
    """True si ce département peut porter une prime de ce type."""
    value = bonus_type.value if hasattr(bonus_type, 'value') else str(bonus_type)
    if value not in MANAGED_BONUS_TYPES:
        return True
    return value in await department_bonus_types(dept_name)


async def all_departments_bonus_types() -> dict[str, list[str]]:
    """Mapping département → types autorisés, en un seul appel pour le frontend."""
    result = {}
    for dept in await Department.all():
        managed = [t for t in _as_list(dept.bonus_types) if t in MANAGED_BONUS_TYPES]
        if managed:
            result[dept.name] = _ordered(managed)
        else:
            legacy = [t for t in MANAGED_BONUS_TYPES if dept.name in REGLE_HISTORIQUE.get(t, ())]
            result[dept.name] = _ordered(legacy)
    return result