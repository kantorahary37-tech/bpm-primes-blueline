"""
Remet le mot de passe par défaut du compte de secours hors LDAP.

Usage :
    python -m scripts.reset_admin_password
    python -m scripts.reset_admin_password --email admin@gulfsat.mg
    python -m scripts.reset_admin_password --check     # n'écrit rien

Pourquoi ce script existe
-------------------------
``admin@gulfsat.mg`` est le compte de secours : il s'authentifie avec son mot
de passe **local** même quand ``USE_LDAP_PASSWORD`` est activé (voir
``app.auth.can_use_local_password`` et le paramètre ``LDAP_LOCAL_ADMIN_EMAILS``).
C'est le filet de sécurité quand l'annuaire LDAP est injoignable — or le mot de
passe LDAP ne peut pas être changé depuis BPM. Sans une valeur de repli écrite
en dur quelque part, une perte de ce mot de passe rendrait l'application
inaccessible à tout le monde.

Ce script est donc la source de vérité du mot de passe par défaut :
``DEFAULT_LOCAL_ADMIN_PASSWORD`` (reprise par ``app.auth``). Il est
idempotent et peut être rejoué à chaque déploiement ou après une restauration
de sauvegarde, sans rien casser.

Le même mot de passe est réinjecté en base dans deux autres endroits :
- « Rétablir le mot de passe par défaut » dans l'écran Utilisateurs
  (endpoint ``/admin/users/{id}/reset-default-password``) ;
- la clé de configuration ``LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD``, qui permet de
  changer la valeur par défaut sans redéployer (elle prime alors sur la
  constante ci-dessus).

Le mot de passe n'est jamais journalisé : seul son hash bcrypt est écrit.
"""

import argparse
import asyncio
import os
import sys

sys.path.append('.')

# Load .env file manually (evoids a dotenv dependency)
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

from tortoise import Tortoise

from app.auth import (
    DEFAULT_LOCAL_ADMIN_PASSWORD,
    get_password_hash,
    verify_password,
)
from app.config import get_config
from app.db_config import TORTOISE_ORM
from app.models import User

DEFAULT_EMAIL = 'admin@gulfsat.mg'


def target_password() -> str:
    """Valeur réellement appliquée : la configuration si elle est renseignée,
    sinon la constante de ce script."""
    return get_config('LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD') or DEFAULT_LOCAL_ADMIN_PASSWORD


async def apply(email: str, check_only: bool) -> int:
    """Applique (ou vérifie) le mot de passe par défaut.

    N'ouvre ni ne ferme la connexion : la gestion du cycle de vie est laissée à
    l'appelant, ce qui permet de réutiliser cette logique dans les tests sur une
    base déjà ouverte.
    """
    user = await User.get_or_none(email=email)
    password = target_password()

    if user is None:
        if check_only:
            print(f"[ABSENT] {email} : aucun compte, rien à vérifier")
            return 1
        await User.create(
            email=email,
            name='Administrateur BPM',
            is_admin=True,
            password_hash=get_password_hash(password),
        )
        print(f"[CREE]   {email} : compte de secours créé (is_admin), mot de passe par défaut appliqué")
        return 0

    if not user.is_admin:
        print(f"[ALERTE] {email} : le compte existe mais n'est PAS administrateur.")
        print("         Il ne pourra pas se connecter hors LDAP (LDAP_LOCAL_ADMIN_EMAILS exige is_admin).")
        print("         Corriger le rôle « Administrateur » dans l'écran Utilisateurs.")

    if check_only:
        if user.password_hash and verify_password(password, user.password_hash):
            print(f"[CONFORME] {email} : le mot de passe par défaut est déjà appliqué.")
            return 0
        print(f"[DIFFERENT] {email} : le mot de passe en base n'est pas la valeur par défaut.")
        print("              Relancer sans --check pour le rétablir.")
        return 2

    user.password_hash = get_password_hash(password)
    await user.save()
    # Longueur seulement : le mot de passe ne doit jamais être journalisé.
    print(f"[OK]     {email} : mot de passe par défaut appliqué (longueur {len(password)})")
    return 0


async def reset(email: str, check_only: bool) -> int:
    """Point d'entrée autonome : ouvre la connexion, applique, referme."""
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        return await apply(email, check_only)
    finally:
        await Tortoise.close_connections()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description="Rétablit le mot de passe par défaut du compte de secours hors LDAP",
    )
    parser.add_argument(
        '--email',
        default=DEFAULT_EMAIL,
        help=f'Compte à réinitialiser (défaut : {DEFAULT_EMAIL})',
    )
    parser.add_argument(
        '--check',
        action='store_true',
        help='Vérifie sans écrire (code de sortie 2 si le mot de passe diffère)',
    )
    args = parser.parse_args()

    # Le code de sortie est toujours propagé : en --check, 2 signale un mot de
    # passe divergent, exploitable tel quel par un test de supervision.
    sys.exit(asyncio.run(reset(args.email, args.check)))