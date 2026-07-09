"""
Migrate old hardcoded department names → new LDAP department names.

Run once after the initial LDAP sync to consolidate department names
across the entire database.  Afterwards, only run ``sync_ldap.py`` for
ongoing synchronisation.

Usage:  python -m scripts.migrate_departments
"""
import sys
import logging
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import Department, User, Employee, PrimeMax

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mapping: old department name → new LDAP department name
# ---------------------------------------------------------------------------
DEPT_MAP = {
    'Achat': 'Direction Achat',
    'ADV': 'Direction Clientele',
    'Auditeur interne': 'Direction Administrative et Financiere',
    'BBS': 'Direction BBS',
    'Blueline': 'Blueline',
    'Clientèle': 'Direction Clientele',
    'Commerciale': 'Direction Commerciale',
    'Communication & Mktg': 'Direction Communication et Marketing',
    'CTB': 'Direction Administrative et Financiere',
    'DAF CDG': 'Direction Administrative et Financiere',
    'DAF Contrôleur': 'Direction Administrative et Financiere',
    'DG': 'Direction Generale',
    'DO': 'Direction des Operations',
    'DSI': 'Direction des Systemes d\'Informations',
    'DT': 'Direction Technique',
    'Fidélisation': 'Direction Clientele',
    'Inconnu': 'Inconnu',
    'Logistique': 'Direction Logistique',
    'RH': 'Direction Administrative et Financiere',
}

# Bonus-type → allowed departments (using new names)
BONUS_TYPE_DEPARTMENTS = {
    'mensuel': [
        'Direction Achat', 'Direction Administrative et Financiere',
        'Direction BBS', 'Direction Clientele', 'Direction Commerciale',
        'Direction Communication et Marketing', 'Direction des Operations',
        'Direction des Services Generaux', 'Direction des Systemes d\'Informations',
        'Direction Generale', 'Direction Logistique', 'Direction Technique',
        'Blueline', 'Inconnu',
    ],
    'astreinte': ['Direction BBS', 'Direction des Operations',
                  'Direction des Systemes d\'Informations', 'Direction Technique'],
    'commission': ['Direction Commerciale'],
}


async def migrate():
    await Tortoise.init(config=TORTOISE_ORM)

    # --- 1. Ensure target departments exist ---
    target_names = set(DEPT_MAP.values())
    log.info('=== S\'assurer que les départements cibles existent ===')
    for name in sorted(target_names):
        await Department.get_or_create(name=name)
        log.info('  ✓ %s', name)

    # --- 2. Update dept_str in all tables ---
    log.info('\n=== Mise à jour des colonnes department ===')

    tables = [
        ('user', User, 'dept_str'),
        ('employee', Employee, 'dept_str'),
        ('primemax', PrimeMax, 'dept_str'),
    ]
    total_updated = 0
    for label, model, field in tables:
        for old_name, new_name in DEPT_MAP.items():
            if old_name == new_name:
                continue
            count = await model.filter(**{field: old_name}).update(**{field: new_name})
            if count:
                log.info('  %s: %d ligne(s) %s → %s', label, count, old_name, new_name)
                total_updated += count

    log.info('  Total: %d ligne(s) mises à jour', total_updated)

    # --- 3. Update department_id FK to point to correct Department row ---
    log.info('\n=== Mise à jour des foreign keys department_id ===')

    dept_cache = {}
    for name in target_names:
        dept_cache[name] = await Department.get(name=name)

    for label, model, field in tables:
        updated = 0
        async for obj in model.all():
            new_name = obj.dept_str
            target_dept = dept_cache.get(new_name)
            if target_dept and obj.dept_id != target_dept.id:
                obj.dept_id = target_dept.id
                await obj.save(update_fields=['dept_id'])
                updated += 1
        if updated:
            log.info('  %s: %d FK(s) corrigée(s)', label, updated)

    # --- 4. Remove orphan Department entries ---
    log.info('\n=== Nettoyage des départements orphelins ===')

    used_names = set()
    for label, model, field in tables:
        async for obj in model.all():
            if obj.dept_str:
                used_names.add(obj.dept_str)

    all_depts = await Department.all()
    removed = 0
    for dept in all_depts:
        if dept.name not in used_names:
            # Check if any FK still points to it
            still_used = False
            for label, model, field in tables:
                if await model.filter(dept_id=dept.id).exists():
                    still_used = True
                    break
            if not still_used:
                await dept.delete()
                log.info('  ✗ Supprimé: %s', dept.name)
                removed += 1

    log.info('  %d département(s) supprimé(s)', removed)

    # --- 5. Show remaining departments ---
    log.info('\n=== Départements restants ===')
    for dept in await Department.all().order_by('name'):
        log.info('  • %s (id=%s)', dept.name, dept.id)

    await Tortoise.close_connections()
    log.info('\n✅ Migration terminée')


if __name__ == '__main__':
    run_async(migrate())
