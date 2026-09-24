"""
Sync LDAP → BPM (CRÉATION UNIQUEMENT).

Usage :  python -m scripts.sync_ldap [--scope employees]

Détecte les employés présents dans l'annuaire LDAP mais absents de la base
BPM, puis les crée. Les employés existants ne sont JAMAIS modifiés ni
supprimés par la synchronisation :

    LDAP employee existe dans BPM  →  SKIP (aucune écriture)
    LDAP employee absent de BPM    →  CREATE

Clé de correspondance : matricule (employeeNumber → uid → partie locale de
l'email, cf. app.ldap_helpers.matricule). La contrainte UNIQUE sur
``employee.matricule`` protège contre les doublons même en cas de
synchronisations concurrentes.

Le travail est délégué à ``app.ldap_sync_service.run_ldap_sync`` qui journalise
l'exécution (compteurs, statut, durée) dans la table ``ldapyncexecution``.

Planifiable via CRON / systemd timer.
"""

import os
import sys
import logging

sys.path.append('.')

# Load .env file manually (avoids a dotenv dependency)
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

from tortoise import Tortoise, run_async

from app.db_config import TORTOISE_ORM
from app.ldap_sync_service import run_ldap_sync

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')


async def sync(scope: str = 'employees'):
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()

    if scope != 'employees':
        logging.getLogger(__name__).warning(
            "Seul le scope 'employees' est pris en charge (synchronisation create-only)."
        )

    result = await run_ldap_sync(trigger_type='CRON')

    log = logging.getLogger(__name__)
    log.info('')
    log.info('=' * 52)
    log.info('  Synchronisation LDAP terminée (create-only)')
    log.info('  Employés LDAP trouvés : %d', result['ldap_found'])
    log.info('  Créés               : %d', result['created'])
    log.info('  Déjà existants      : %d', result['already_existing'])
    log.info('  Ignorés             : %d', result['skipped'])
    log.info('  Erreurs             : %d', result['errors'])
    log.info('  Statut              : %s', result['status'])
    log.info('=' * 52)

    await Tortoise.close_connections()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Synchronisation LDAP → BPM (create-only)')
    parser.add_argument(
        '--scope',
        choices=['employees'],
        default='employees',
        help='Périmètre à synchroniser (seul "employees" est géré)',
    )
    args = parser.parse_args()
    run_async(sync(args.scope))
