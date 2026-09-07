"""
Sync employees and departments from LDAP into BPM database.
Usage:  python -m scripts.sync_ldap [--scope all|departments|users|employees]

Fetches all users from the company LDAP directory and:
  1. Creates/updates Department records          (--scope departments)
  2. Creates/updates User records (managers, directors, …)   (--scope users)
  3. Updates existing Employee records with manager relationships (--scope employees)
  4. Resolves the LDAP ``manager`` DN attribute to BPM User FK

Employees are only updated when their matricule already exists in the database:
LDAP users without a matching employee are skipped (never auto-created). Add new
employees via the BPM UI ("Ajouter depuis LDAP").

Default scope is ``all`` (everything). Scoped runs reuse the data already
present in the database for the parts they don't touch.
Departments without any LDAP information are skipped (no more "Inconnu"):
employees without a known department are deleted from the database, and the
legacy "Inconnu" department is removed once unreferenced.

Run periodically via CRON or systemd timer to keep data fresh.
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

from ldap3.core.exceptions import LDAPException

from app.db_config import TORTOISE_ORM
from app.ldap_helpers import connect, first, full_name, matricule, dept_name, LDAP_ATTRS
from tortoise import Tortoise, run_async
from app.models import User, Employee, Department, PrimeMax
from app.auth import get_password_hash

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LDAP configuration (from environment / .env — shared with app.ldap_helpers)
# ---------------------------------------------------------------------------
LDAP_USER_SEARCH_BASE = os.getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg')

# When True, use the LDAP userPassword attribute for BPM auth.
# When False (default), use a fixed test password (testprime).
USE_LDAP_PASSWORD = os.getenv('USE_LDAP_PASSWORD', 'false').lower() in ('1', 'true', 'yes')

LDAP_PASSWORD_ATTR = 'userPassword' if USE_LDAP_PASSWORD else None
SYNC_ATTRS = list(LDAP_ATTRS)
if LDAP_PASSWORD_ATTR and LDAP_PASSWORD_ATTR not in SYNC_ATTRS:
    SYNC_ATTRS.append(LDAP_PASSWORD_ATTR)

# ---------------------------------------------------------------------------
# Known directors / special roles
# Emails listed here get their corresponding BPM User flags regardless of
# what LDAP says.  Add or remove entries as needed.
# ---------------------------------------------------------------------------
DIRECTORS: dict[str, dict] = {
    'admin@gulfsat.mg': {
        'name': 'Administrateur BPM',
        'poste': 'DG',
        'is_validator_n1': True,
        'is_directeur': True,
        'is_drh': True,
        'is_dg': True,
        'is_admin': True,
    },
}

# Users explicitly marked as N+1 validators (regardless of LDAP manager status)
VALIDATORS_N1: list[str] = [
    'vonjy.rakotoniaina@staff.blueline.mg',
]

# ---------------------------------------------------------------------------
# LDAP helpers (shared with app.ldap_helpers)
# ---------------------------------------------------------------------------

def fetch_all_ldap_users() -> list[dict]:
    """Return a list of attribute-dicts for every LDAP entry with ``mail``."""
    conn = connect()
    results: list[dict] = []
    try:
        conn.search(
            search_base=LDAP_USER_SEARCH_BASE,
            search_filter='(mail=*)',
            attributes=SYNC_ATTRS,
            paged_size=500,
        )
        for entry in conn.entries:
            record = {attr: first(entry, attr) for attr in SYNC_ATTRS}
            record['dn'] = entry.entry_dn
            email = (record.get('mail') or '').strip().lower()
            if not email:
                continue
            record['email'] = email
            results.append(record)
    finally:
        conn.unbind()
    return results


# ---------------------------------------------------------------------------
# Extraction helpers (shared with app.ldap_helpers)
# ---------------------------------------------------------------------------

def _is_director_poste(poste: str | None) -> bool:
    """True si le poste correspond à un(e) Directeur/Directrice."""
    p = (poste or '').strip().lower()
    return 'directeur' in p or 'directrice' in p


# ---------------------------------------------------------------------------
# Main sync
# ---------------------------------------------------------------------------

async def sync(scope: str = 'all'):
    await Tortoise.init(config=TORTOISE_ORM)

    do_departments = scope in ('all', 'departments')
    do_users = scope in ('all', 'users')
    do_employees = scope in ('all', 'employees')

    log.info('Connexion à l\'AD…')
    try:
        ldap_users = fetch_all_ldap_users()
    except LDAPException as e:
        log.error('Erreur de connexion LDAP : %s', e)
        await Tortoise.close_connections()
        return

    log.info('%d utilisateur(s) trouvé(s) dans l\'AD.', len(ldap_users))
    if not ldap_users:
        log.warning('Aucun utilisateur – vérifiez le filtre de recherche.')
        await Tortoise.close_connections()
        return

    # Index DN → record (for manager resolution)
    dn_index = {u['dn']: u for u in ldap_users if u.get('dn')}
    # Index email → LDAP record
    email_index = {u['email']: u for u in ldap_users}
    # Pre-build fast partial DN → email lookup
    dn_to_email: dict[str, str] = {}
    for dn, rec in dn_index.items():
        dn_to_email[dn] = rec['email']
        for p in dn.replace('=', ' ').replace(',', ' ').split():
            dn_to_email[p.lower()] = rec['email']

    # Pre-fetch all existing BPM users (used by both user + employee sections)
    all_bpm_users = await User.all()
    existing_users = {u.email: u for u in all_bpm_users}

    # ------------------------------------------------------------------
    # 1. Departments
    # ------------------------------------------------------------------
    all_dept_names = {dept_name(u) for u in ldap_users}
    all_dept_names.discard(None)

    departments_created = 0
    dept_cache: dict[str, Department] = {}

    if do_departments:
        log.info('=== Départements (%d) ===', len(all_dept_names))
        for name in sorted(all_dept_names):
            dept, created = await Department.get_or_create(name=name)
            dept_cache[name] = dept
            if created:
                departments_created += 1
                log.info('  ✓ Créé %s', name)
    else:
        for d in await Department.all():
            dept_cache[d.name] = d

    # ------------------------------------------------------------------
    # 2. Determine who is a manager (referenced by ``manager`` in LDAP)
    # ------------------------------------------------------------------
    manager_emails: set[str] = set()
    user_by_email: dict[str, User] = {}

    if do_users or do_employees:
        manager_dns: set[str] = set()
        for u in ldap_users:
            m = u.get('manager')
            if m:
                manager_dns.add(m)

        for dn in manager_dns:
            if dn in dn_to_email:
                manager_emails.add(dn_to_email[dn])
            else:
                # Partial match via pre-built index
                for token in dn.replace('=', ' ').replace(',', ' ').lower().split():
                    if token in dn_to_email:
                        manager_emails.add(dn_to_email[token])
                        break

    # ------------------------------------------------------------------
    # 3. Users (BPM accounts) – must exist before Employee manager FK
    # ------------------------------------------------------------------
    users_created = 0
    users_updated = 0

    if do_users:
        users_to_create: set[str] = (
            manager_emails
            | set(DIRECTORS.keys())
            | set(VALIDATORS_N1)
            | set(existing_users.keys())
        )

        log.info('=== Utilisateurs BPM ===')

        to_create: list[User] = []
        for email in sorted(users_to_create):
            ldap_rec = email_index.get(email)

            if ldap_rec:
                name = full_name(ldap_rec)
                poste = ldap_rec.get('title') or ldap_rec.get('employeeType') or ''
                user_dept = dept_name(ldap_rec)
            elif email in DIRECTORS:
                d = DIRECTORS[email]
                name = d.get('name', email)
                poste = d.get('poste', '')
                user_dept = d.get('department', '')
            else:
                continue

            is_n1 = email in manager_emails or email in VALIDATORS_N1 or bool(DIRECTORS.get(email, {}).get('is_validator_n1'))
            is_dir = bool(DIRECTORS.get(email, {}).get('is_directeur'))
            is_drh = bool(DIRECTORS.get(email, {}).get('is_drh'))
            is_dg = bool(DIRECTORS.get(email, {}).get('is_dg'))
            is_admin = bool(DIRECTORS.get(email, {}).get('is_admin'))

            # Un poste de Directeur/Directrice ⇒ rôle Directeur,
            # et pas validateur N+1 (la validation passe au niveau Directeur)
            dir_from_poste = _is_director_poste(poste)
            if dir_from_poste:
                is_dir = True
                if email not in VALIDATORS_N1:
                    is_n1 = False

            dept_obj = dept_cache.get(user_dept) if user_dept else None

            existing = existing_users.get(email)
            if existing:
                existing.name = name
                existing.poste = poste
                existing.dept_str = user_dept
                existing.dept = dept_obj
                if dir_from_poste and email not in VALIDATORS_N1:
                    existing.is_validator_n1 = False
                else:
                    existing.is_validator_n1 = is_n1 or existing.is_validator_n1
                if email in DIRECTORS or dir_from_poste:
                    existing.is_directeur = is_dir
                if email in DIRECTORS:
                    existing.is_drh = is_drh
                    existing.is_dg = is_dg
                    existing.is_admin = is_admin
                await existing.save()
                user_by_email[email] = existing
                users_updated += 1
            else:
                if USE_LDAP_PASSWORD and ldap_rec:
                    raw = ldap_rec.get('userPassword')
                    pw = raw.decode() if isinstance(raw, bytes) else (raw or '')
                    default_password = pw
                else:
                    default_password = 'testprime'
                to_create.append(User(
                    email=email,
                    name=name,
                    poste=poste,
                    dept_str=user_dept,
                    dept=dept_obj,
                    is_validator_n1=is_n1,
                    is_directeur=is_dir,
                    is_drh=is_drh,
                    is_dg=is_dg,
                    is_admin=is_admin,
                    password_hash=get_password_hash(default_password),
                ))

        if to_create:
            await User.bulk_create(to_create)
            # bulk_create does not populate PKs — re-fetch by email
            new_emails = [u.email for u in to_create]
            for user in await User.filter(email__in=new_emails):
                user_by_email[user.email] = user
                log.info('  ✓ Créé  %s (%s)', user.name, user.email)
            users_created = len(to_create)

        if users_updated:
            log.info('  ~ Mis à jour %d utilisateur(s)', users_updated)
    else:
        # Reuse the accounts already in the database
        user_by_email = dict(existing_users)

    # ------------------------------------------------------------------
    # 4. Employees (all LDAP users)
    # ------------------------------------------------------------------
    employees_updated = 0
    employees_deleted = 0
    manager_resolved = 0
    manager_fallback = 0
    employees_skipped = 0

    if do_employees:
        log.info('=== Employés ===')

        # Default manager per department (reuse all_bpm_users from above)
        dept_head: dict[str, User | None] = {}
        for user in all_bpm_users:
            if user.dept_str and user.dept_str not in dept_head:
                dept_head[user.dept_str] = user
        dg_user = next((u for u in all_bpm_users if u.is_dg), None)

        # Pre-fetch existing employees indexed by matricule
        existing_employees = {e.matricule: e async for e in Employee.all()}

        # Pre-compute manager mapping for every LDAP user (one pass, no O(n²))
        emp_manager_map: dict[str, tuple[User | None, str | None]] = {}
        for u in ldap_users:
            email = u['email']
            raw_dn = u.get('manager')
            resolved_dn = None
            mgr_user: User | None = None

            if raw_dn:
                if raw_dn in dn_to_email:
                    resolved_dn = raw_dn
                else:
                    for token in raw_dn.replace('=', ' ').replace(',', ' ').lower().split():
                        if token in dn_to_email:
                            resolved_dn = token
                            break

            if resolved_dn:
                mgr_email = dn_to_email[resolved_dn]
                mgr_user = user_by_email.get(mgr_email)

            if not mgr_user:
                emp_dept = dept_name(u)
                mgr_user = dept_head.get(emp_dept) if emp_dept else None
                if not mgr_user:
                    mgr_user = dg_user

            emp_manager_map[email] = (mgr_user, resolved_dn)

        # Process employees (updates only — never auto-create new employees)
        to_update: list[Employee] = []
        for u in ldap_users:
            email = u['email']
            emp_matricule = matricule(u, email)
            name = full_name(u)
            emp_dept = dept_name(u)

            if not emp_dept:
                # Employé sans département dans l'AD → suppression de la base
                existing = existing_employees.get(emp_matricule)
                if existing:
                    await existing.delete()
                    employees_deleted += 1
                    log.info('  ✗ Supprimé  %s (%s) — sans département dans l\'AD', name, emp_matricule)
                else:
                    log.warning('  ⚠ %s (%s) sans département dans l\'AD — ignoré', name, emp_matricule)
                    employees_skipped += 1
                continue

            dept_obj = dept_cache.get(emp_dept)
            manager_user, mgr_dn = emp_manager_map[email]

            if manager_user and mgr_dn:
                manager_resolved += 1
            elif manager_user and not mgr_dn:
                manager_fallback += 1

            if not manager_user:
                log.warning('  ⚠ Aucun manager pour %s (%s) — ignoré', name, emp_matricule)
                employees_skipped += 1
                continue

            emp_data = dict(
                name=name,
                dept_str=emp_dept,
                dept=dept_obj,
                manager=manager_user,
                is_active=True,
                is_dg=False,
                currency='Ar',
            )
            if USE_LDAP_PASSWORD:
                if u.get('userPassword'):
                    emp_data['password'] = u['userPassword']

            existing = existing_employees.get(emp_matricule)
            if existing:
                for k, v in emp_data.items():
                    setattr(existing, k, v)
                to_update.append(existing)
            else:
                log.warning('  ⚠ %s (%s) présent dans l\'AD mais absent de la base — non ajouté', name, emp_matricule)
                employees_skipped += 1
                continue

        employees_updated = len(to_update)
        for emp in to_update:
            await emp.save()

        if employees_updated:
            log.info('  ~ Mis à jour %d employé(s)', employees_updated)

        # Supprime les employés encore rattachés au département « Inconnu »
        inconnu_dept = await Department.get_or_none(name='Inconnu')
        if inconnu_dept:
            deleted = await Employee.filter(dept_id=inconnu_dept.id).delete()
            if deleted:
                employees_deleted += deleted
                log.info('  ✗ %d employé(s) supprimé(s) du département « Inconnu »', deleted)

    # ------------------------------------------------------------------
    # 5. Remove the legacy "Inconnu" department when unreferenced
    # ------------------------------------------------------------------
    if do_departments or do_employees:
        inconnu = await Department.get_or_none(name='Inconnu')
        if inconnu:
            emp_refs = await Employee.filter(dept_id=inconnu.id).count()
            other_refs = await PrimeMax.filter(dept_id=inconnu.id).count()
            if await User.filter(dept_id=inconnu.id).exists():
                await User.filter(dept_id=inconnu.id).update(dept_id=None, dept_str=None)
            if emp_refs == 0 and other_refs == 0:
                await inconnu.delete()
                log.info('✓ Département « Inconnu » supprimé')
            elif emp_refs and not do_employees:
                log.warning(
                    '⚠ Département « Inconnu » conservé : %d employé(s) — lancez --scope employees pour les supprimer',
                    emp_refs,
                )
            else:
                log.warning(
                    '⚠ Département « Inconnu » conservé : %d référence(s) plafond/modèle',
                    other_refs,
                )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info('')
    log.info('=' * 52)
    log.info('  Synchronisation terminée (scope : %s)', scope)
    if do_departments:
        log.info('  Départements : %d connus, %d créés', len(all_dept_names), departments_created)
    if do_users:
        log.info('  Utilisateurs : %d créés, %d mis à jour',
                 users_created, users_updated)
    if do_employees:
        log.info('  Employés     : %d mis à jour, %d supprimés, %d ignorés',
                 employees_updated, employees_deleted, employees_skipped)
        log.info('  Managers     : %d résolus LDAP, %d par défaut',
                 manager_resolved, manager_fallback)
    log.info('=' * 52)

    await Tortoise.close_connections()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Synchronisation LDAP → BPM')
    parser.add_argument(
        '--scope',
        choices=['all', 'departments', 'users', 'employees'],
        default='all',
        help='Partie des données à synchroniser (défaut : all)',
    )
    args = parser.parse_args()
    run_async(sync(args.scope))
