"""
Sync employees and departments from LDAP into BPM database.
Usage:  python -m scripts.sync_ldap

Fetches all users from the company LDAP directory and:
  1. Creates/updates Department records
  2. Creates/updates User records (managers, directors, …)
  3. Creates/updates Employee records with manager relationships
  4. Resolves the LDAP ``manager`` DN attribute to BPM User FK

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

from ldap3 import ALL, Connection, Server
from ldap3.core.exceptions import LDAPException

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import User, Employee, Department
from app.auth import get_password_hash

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LDAP configuration (from environment / .env)
# ---------------------------------------------------------------------------
LDAP_SERVER_URI = os.getenv('LDAP_SERVER_URI', 'ldap://ldap.blueline.mg:389')
LDAP_BIND_DN = os.getenv('LDAP_BIND_DN', 'cn=admin,dc=blueline,dc=mg')
LDAP_BIND_PASSWORD = os.getenv('LDAP_BIND_PASSWORD', 'blueline2488')
LDAP_USER_SEARCH_BASE = os.getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg')

# When True, use the LDAP userPassword attribute for BPM auth.
# When False (default), use a fixed test password (testprime).
USE_LDAP_PASSWORD = os.getenv('USE_LDAP_PASSWORD', 'false').lower() in ('1', 'true', 'yes')

LDAP_PASSWORD_ATTR = 'userPassword' if USE_LDAP_PASSWORD else None

LDAP_ATTRS = [
    'uid', 'mail', 'givenName', 'sn', 'cn',
    'employeeNumber', 'departmentNumber', 'ou',
    'title', 'employeeType', 'manager',
]
if LDAP_PASSWORD_ATTR:
    LDAP_ATTRS.append(LDAP_PASSWORD_ATTR)

# ---------------------------------------------------------------------------
# Known directors / special roles
# Emails listed here get their corresponding BPM User flags regardless of
# what LDAP says.  Add or remove entries as needed.
# ---------------------------------------------------------------------------
DIRECTORS: dict[str, dict] = {
    # 'rivo@gulfsat.mg': {
    #     'name': 'Nantenaina Ulrich', 'poste': 'DSI', 'is_directeur': True,
    # },
    # 'dg@blueline.mg': {
    #     'name': 'Directeur Général', 'poste': 'DG', 'is_dg': True,
    # },
    # 'johary.drh@blueline.mg': {
    #     'name': 'Johary', 'poste': 'DRH', 'is_drh': True,
    # }
}

# Users explicitly marked as N+1 validators (regardless of LDAP manager status)
VALIDATORS_N1: list[str] = [
    'vonjy.rakotoniaina@staff.blueline.mg',
]

# ---------------------------------------------------------------------------
# LDAP helpers
# ---------------------------------------------------------------------------

def _connect() -> Connection:
    server = Server(LDAP_SERVER_URI, get_info=ALL, connect_timeout=5)
    return Connection(
        server,
        user=LDAP_BIND_DN,
        password=LDAP_BIND_PASSWORD,
        auto_bind=True,
        receive_timeout=5,
    )


def _first(entry, attr):
    if attr not in entry:
        return None
    value = entry[attr].value
    return value[0] if isinstance(value, list) and value else value


def fetch_all_ldap_users() -> list[dict]:
    """Return a list of attribute-dicts for every LDAP entry with ``mail``."""
    conn = _connect()
    results: list[dict] = []
    try:
        conn.search(
            search_base=LDAP_USER_SEARCH_BASE,
            search_filter='(mail=*)',
            attributes=LDAP_ATTRS,
            paged_size=500,
        )
        for entry in conn.entries:
            record = {attr: _first(entry, attr) for attr in LDAP_ATTRS}
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
# Extraction helpers
# ---------------------------------------------------------------------------

def _dept_name(rec: dict) -> str:
    return rec.get('departmentNumber') or rec.get('ou') or 'Inconnu'


def _full_name(rec: dict) -> str:
    given = rec.get('givenName') or ''
    sn = rec.get('sn') or ''
    if given and sn:
        return f'{given} {sn}'
    return rec.get('cn') or given or sn or rec.get('uid', 'Inconnu')


def _matricule(rec: dict, email: str) -> str:
    raw = rec.get('employeeNumber')
    if raw and str(raw).strip().isdigit():
        return str(int(raw)).zfill(5)
    return rec.get('uid') or email.split('@')[0]


# ---------------------------------------------------------------------------
# Main sync
# ---------------------------------------------------------------------------

async def sync():
    await Tortoise.init(config=TORTOISE_ORM)

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
    all_dept_names = {_dept_name(u) for u in ldap_users}
    log.info('=== Départements (%d) ===', len(all_dept_names))
    dept_cache: dict[str, Department] = {}
    for name in sorted(all_dept_names):
        dept, created = await Department.get_or_create(name=name)
        dept_cache[name] = dept
        log.info('  %s %s', '✓ Créé' if created else '~ Exist', name)

    # ------------------------------------------------------------------
    # 2. Determine who is a manager (referenced by ``manager`` in LDAP)
    # ------------------------------------------------------------------
    manager_dns: set[str] = set()
    for u in ldap_users:
        m = u.get('manager')
        if m:
            manager_dns.add(m)

    manager_emails: set[str] = set()
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
    users_to_create: set[str] = (
        manager_emails
        | set(DIRECTORS.keys())
        | set(VALIDATORS_N1)
        | set(existing_users.keys())
    )

    log.info('=== Utilisateurs BPM ===')
    users_created = 0
    users_updated = 0
    user_by_email: dict[str, User] = {}

    to_create: list[User] = []
    for email in sorted(users_to_create):
        ldap_rec = email_index.get(email)

        is_n1 = email in manager_emails or email in VALIDATORS_N1
        is_dir = bool(DIRECTORS.get(email, {}).get('is_directeur'))
        is_drh = bool(DIRECTORS.get(email, {}).get('is_drh'))
        is_dg = bool(DIRECTORS.get(email, {}).get('is_dg'))

        if ldap_rec:
            name = _full_name(ldap_rec)
            poste = ldap_rec.get('title') or ldap_rec.get('employeeType') or ''
            dept_name = _dept_name(ldap_rec)
        elif email in DIRECTORS:
            d = DIRECTORS[email]
            name = d.get('name', email)
            poste = d.get('poste', '')
            dept_name = d.get('department', '')
        else:
            continue

        dept_obj = dept_cache.get(dept_name)

        existing = existing_users.get(email)
        if existing:
            existing.name = name
            existing.poste = poste
            existing.dept_str = dept_name
            existing.dept = dept_obj
            existing.is_validator_n1 = is_n1 or existing.is_validator_n1
            if email in DIRECTORS:
                existing.is_directeur = is_dir
                existing.is_drh = is_drh
                existing.is_dg = is_dg
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
                dept_str=dept_name,
                dept=dept_obj,
                is_validator_n1=is_n1,
                is_directeur=is_dir,
                is_drh=is_drh,
                is_dg=is_dg,
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

    # ------------------------------------------------------------------
    # 4. Employees (all LDAP users)
    # ------------------------------------------------------------------
    log.info('=== Employés ===')

    # Default manager per department (reuse all_bpm_users from above)
    dept_head: dict[str, User | None] = {}
    for user in all_bpm_users:
        if user.dept_str and user.dept_str not in dept_head:
            dept_head[user.dept_str] = user
    dg_user = next((u for u in all_bpm_users if u.is_dg), None)

    # Pre-fetch existing employees indexed by matricule
    existing_employees = {e.matricule: e async for e in Employee.all()}

    employees_created = 0
    employees_updated = 0
    manager_resolved = 0
    manager_fallback = 0

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
            dept_name = _dept_name(u)
            mgr_user = dept_head.get(dept_name) or dg_user

        emp_manager_map[email] = (mgr_user, resolved_dn)

    # Process employees in bulk
    to_create: list[Employee] = []
    to_update: list[Employee] = []
    for u in ldap_users:
        email = u['email']
        matricule = _matricule(u, email)
        name = _full_name(u)
        dept_name = _dept_name(u)
        dept_obj = dept_cache.get(dept_name)
        manager_user, mgr_dn = emp_manager_map[email]

        if manager_user and mgr_dn:
            manager_resolved += 1
        elif manager_user and not mgr_dn:
            manager_fallback += 1

        if not manager_user:
            log.warning('  ⚠ Aucun manager pour %s (%s) — ignoré', name, matricule)
            continue

        emp_data = dict(
            name=name,
            dept_str=dept_name,
            dept=dept_obj,
            manager=manager_user,
            is_active=True,
        )

        existing = existing_employees.get(matricule)
        if existing:
            for attr, val in emp_data.items():
                setattr(existing, attr, val)
            to_update.append(existing)
            employees_updated += 1
        else:
            to_create.append(Employee(matricule=matricule, **emp_data))
            employees_created += 1

    if to_create:
        await Employee.bulk_create(to_create)
        for emp in to_create:
            log.info('  ✓ Créé  %s (%s) [%s]', emp.name, emp.matricule, emp.dept_str)

    for emp in to_update:
        await emp.save()

    if employees_updated:
        log.info('  ~ Mis à jour %d employé(s)', employees_updated)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    log.info('')
    log.info('=' * 52)
    log.info('  Synchronisation terminée')
    log.info('  Départements : %d', len(all_dept_names))
    log.info('  Employés     : %d créés, %d mis à jour',
             employees_created, employees_updated)
    log.info('  Utilisateurs : %d créés, %d mis à jour',
             users_created, users_updated)
    log.info('  Managers     : %d résolus LDAP, %d par défaut',
             manager_resolved, manager_fallback)
    log.info('=' * 52)

    await Tortoise.close_connections()


if __name__ == '__main__':
    run_async(sync())
