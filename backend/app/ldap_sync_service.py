"""
Service de synchronisation LDAP → BPM (CRÉATION UNIQUEMENT).

Règle métier : la synchronisation LDAP ne fait que détecter les employés
présents dans l'annuaire mais absents de l'application, puis les créer.

    LDAP employee existe dans BPM  →  SKIP (aucune modification)
    LDAP employee absent de BPM    →  CREATE

Un employé existant n'est JAMAIS modifié (nom, poste, département, manager,
statut actif, devise…) par la synchronisation LDAP. Les différences constatées
sont uniquement journalisées à titre informatif.

Clé de correspondance (par ordre de priorité, cf. app.ldap_helpers.matricule) :
    1. LDAP employeeNumber (matricule, normalisé sur 5 chiffres)
    2. LDAP uid
    3. partie locale de l'email

Chaque exécution est journalisée dans la table ``ldapyncexecution``
(déclencheur, compteurs, statut, durée) pour audit.
"""

import asyncio
import logging
import time
from datetime import datetime

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from app.ldap_helpers import connect, first, full_name, matricule, dept_name, LDAP_ATTRS

log = logging.getLogger(__name__)

# Attributs LDAP récupérés pendant la synchronisation (+ DN pour les managers)
SYNC_ATTRS = list(LDAP_ATTRS)


class LdapSyncError(Exception):
    """Erreur bloquante de synchronisation (connexion LDAP, etc.)."""


def fetch_all_ldap_users() -> list[dict]:
    """Liste des enregistrements LDAP (dict d'attributs) avec un email.

    Lève LdapSyncError en cas d'échec de connexion / recherche LDAP.
    """
    try:
        conn = connect()
    except Exception as e:
        raise LdapSyncError(f"Connexion LDAP impossible : {e}") from e
    results: list[dict] = []
    try:
        try:
            conn.search(
                search_base=__import__('os').getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg'),
                search_filter='(mail=*)',
                attributes=SYNC_ATTRS,
                paged_size=500,
            )
        except Exception as e:
            raise LdapSyncError(f"Recherche LDAP impossible : {e}") from e
        for entry in conn.entries:
            record = {attr: first(entry, attr) for attr in SYNC_ATTRS}
            record['dn'] = entry.entry_dn
            email = (record.get('mail') or '').strip().lower()
            if not email:
                # Enregistrement sans email : non exploitable, compté comme ignoré
                record['email'] = None
            else:
                record['email'] = email
            results.append(record)
    finally:
        try:
            conn.unbind()
        except Exception:
            pass
    return results


def _resolve_manager(rec: dict, dn_to_email: dict[str, str], user_by_email: dict,
                     user_by_local_part: dict | None = None):
    """Résout le manager d'un enregistrement LDAP.

    Ordre de résolution (mêmes règles que le flux « Ajouter depuis LDAP ») :
      1. DN LDAP du manager → email → utilisateur BPM (correspondance exacte
         puis par tokens cn/uid du DN),
      2. repli : premier utilisateur du département,
      3. repli : le DG.

    Retourne (user | None, dn_résolu | None). Ne lève jamais.
    """
    raw_dn = rec.get('manager')
    if raw_dn:
        # Correspondance exacte via l'index DN → email
        if raw_dn in dn_to_email:
            user = user_by_email.get(dn_to_email[raw_dn])
            if user:
                return user, raw_dn
        # Correspondance partielle : tokens cn/uid du DN du manager
        for part in raw_dn.split(','):
            kv = part.split('=', 1)
            if len(kv) == 2 and kv[0].strip().lower() in ('cn', 'uid'):
                token = kv[1].strip().lower()
                if '@' in token and token in user_by_email:
                    return user_by_email[token], raw_dn
                if user_by_local_part and token in user_by_local_part:
                    return user_by_local_part[token], raw_dn
                for word in token.replace('.', ' ').replace('_', ' ').split():
                    if word in dn_to_email:
                        user = user_by_email.get(dn_to_email[word])
                        if user:
                            return user, raw_dn
    # Repli département puis DG (résolus par l'appelant via des caches)
    return None, None


async def run_department_sync(trigger_type: str = 'MANUAL', created_by=None) -> dict:
    """Crée uniquement les départements manquants à partir de l'annuaire LDAP.

    Aucune mise à jour : un département existant garde son nom. Aucun employé
    n'est touché. Journalisée dans ``ldapyncexecution`` (scope='departments').
    """
    from app.models import Department, LdapSyncExecution

    started_at = datetime.now()
    result = {
        "status": "COMPLETED",
        "trigger_type": trigger_type,
        "scope": "departments",
        "started_at": started_at,
        "finished_at": None,
        "duration_seconds": None,
        "ldap_found": 0,
        "created": 0,
        "already_existing": 0,
        "skipped": 0,
        "errors": 0,
        "created_list": [],
        "skipped_list": [],
        "error_list": [],
    }

    execution = await LdapSyncExecution.create(
        trigger_type=trigger_type,
        status='RUNNING',
        created_by=created_by,
        started_at=started_at,
    )

    try:
        fetched = fetch_all_ldap_users()
        if asyncio.iscoroutine(fetched):
            fetched = await fetched
    except LdapSyncError as e:
        result["status"] = "FAILED"
        result["error_list"].append({"identifier": None, "error": str(e)})
        result["errors"] = 1
        return await _finalize(result, execution)

    dept_names = sorted({d for u in fetched if (d := dept_name(u))})
    result["ldap_found"] = len(dept_names)

    for name in dept_names:
        dept, created = await Department.get_or_create(name=name)
        if created:
            result["created"] += 1
            result["created_list"].append({"identifier": name, "name": name})
        else:
            result["already_existing"] += 1

    return await _finalize(result, execution)


async def run_ldap_sync(trigger_type: str = 'MANUAL', created_by=None, scope: str = 'employees') -> dict:
    """Synchronisation LDAP create-only.

    - trigger_type : 'MANUAL' (API/UI) ou 'CRON' (script planifié)
    - created_by   : utilisateur à l'origine du déclenchement (audit)
    - scope        : 'employees' (seul périmètre géré par ce service)

    Retourne un résumé :
    {
      status, trigger_type, scope, started_at, finished_at, duration_seconds,
      ldap_found, created, already_existing, skipped, errors,
      created_list, skipped_list, error_list
    }
    """
    from app.models import User, Employee, Department, LdapSyncExecution

    started_at = datetime.now()

    result = {
        "status": "COMPLETED",
        "trigger_type": trigger_type,
        "scope": scope,
        "started_at": started_at,
        "finished_at": None,
        "duration_seconds": None,
        "ldap_found": 0,
        "created": 0,
        "already_existing": 0,
        "skipped": 0,
        "errors": 0,
        "created_list": [],
        "skipped_list": [],
        "error_list": [],
    }

    execution = await LdapSyncExecution.create(
        trigger_type=trigger_type,
        status='RUNNING',
        created_by=created_by,
        started_at=started_at,
    )

    try:
        ldap_users = fetch_all_ldap_users()
        # Supporte un fetcher asynchrone (tests / futurs backends asynchrones)
        if asyncio.iscoroutine(ldap_users):
            ldap_users = await ldap_users
    except LdapSyncError as e:
        result["status"] = "FAILED"
        result["error_list"].append({"identifier": None, "error": str(e)})
        result["errors"] = 1
        return await _finalize(result, execution)

    # Employés sans email : ignorés (identifiant instable)
    for rec in ldap_users:
        if not rec.get('email'):
            result["skipped"] += 1
            result["skipped_list"].append({
                "identifier": rec.get('uid') or None,
                "reason": "aucun email dans l'annuaire LDAP",
            })

    result["ldap_found"] = len(ldap_users)

    # Caches de résolution
    all_users = await User.all()
    user_by_email = {u.email: u for u in all_users}
    user_by_local_part = {}
    for u in all_users:
        local = u.email.split('@')[0].strip().lower()
        if local and local not in user_by_local_part:
            user_by_local_part[local] = u
    dn_index = {u['dn']: u for u in ldap_users if u.get('dn') and u.get('email')}
    dn_to_email: dict[str, str] = {}
    for dn, rec in dn_index.items():
        dn_to_email[dn] = rec['email']
        for token in dn.replace('=', ' ').replace(',', ' ').split():
            dn_to_email.setdefault(token.lower(), rec['email'])

    dept_cache = {d.name: d for d in await Department.all()}
    dg_user = next((u for u in all_users if u.is_dg), None)
    dept_first_user: dict[str, object] = {}
    for u in all_users:
        if u.dept_str and u.dept_str not in dept_first_user:
            dept_first_user[u.dept_str] = u

    for rec in ldap_users:
        email = rec.get('email')
        if not email:
            continue
        identifier = matricule(rec, email)
        name = full_name(rec)

        # ── Employé déjà présent ? → SKIP (aucune modification) ──
        existing = await Employee.get_or_none(matricule=identifier)
        if existing:
            result["already_existing"] += 1
            result["skipped_list"].append({
                "identifier": identifier,
                "reason": "l'employé existe déjà dans BPM et n'est pas modifié par la synchronisation LDAP",
            })
            log.info("[LDAP_SYNC] Employé déjà existant : matricule=%s Action=SKIPPed "
                     "Raison=un employé existant n'est pas modifié par la synchronisation LDAP", identifier)
            # Différences informatives (journal uniquement, aucune écriture)
            ldap_dept = dept_name(rec)
            if ldap_dept and existing.dept_str != ldap_dept:
                log.info("[LDAP_SYNC] Différence (informatif) : matricule=%s département app=%s / ldap=%s — non modifié",
                         identifier, existing.dept_str, ldap_dept)
            continue

        # ── Validation minimale du nouvel enregistrement ──
        emp_dept = dept_name(rec)
        if not emp_dept:
            result["skipped"] += 1
            result["skipped_list"].append({
                "identifier": identifier,
                "reason": "aucun département dans l'annuaire LDAP",
            })
            log.warning("[LDAP_SYNC] %s (%s) sans département LDAP — ignoré", name, identifier)
            continue

        # ── Résolution du manager (règles de repli existantes) ──
        # DN LDAP → utilisateur du département → DG. Si aucun manager ne peut
        # être résolu, l'employé est ignoré : la colonne manager est NOT NULL
        # et on ne crée jamais de fiche partiellement initialisée.
        mgr_user, mgr_dn = _resolve_manager(rec, dn_to_email, user_by_email, user_by_local_part)
        if not mgr_user:
            mgr_user = dept_first_user.get(emp_dept) or dg_user
        if not mgr_user:
            result["skipped"] += 1
            result["skipped_list"].append({
                "identifier": identifier,
                "reason": "manager introuvable dans BPM (ni DN LDAP, ni département, ni DG)",
            })
            log.warning("[LDAP_SYNC] %s (%s) : manager introuvable — ignoré", name, identifier)
            continue

        dept_obj = dept_cache.get(emp_dept)
        if dept_obj is None:
            # Département inconnu : créé dans la même transaction que l'employé
            try:
                async with in_transaction():
                    dept_obj, _created = await Department.get_or_create(name=emp_dept)
            except IntegrityError:
                dept_obj = await Department.get_or_none(name=emp_dept)
            if dept_obj is None:
                result["errors"] += 1
                result["error_list"].append({
                    "identifier": identifier,
                    "error": f"impossible de créer le département « {emp_dept} »",
                })
                continue
            dept_cache[emp_dept] = dept_obj

        # ── Création transactionnelle (anti-doublon via contrainte unique) ──
        try:
            async with in_transaction():
                await Employee.create(
                    matricule=identifier,
                    name=name,
                    poste=rec.get('title') or rec.get('employeeType') or None,
                    dept_str=emp_dept,
                    dept=dept_obj,
                    manager=mgr_user,
                    currency='Ar',
                    is_active=True,
                )
        except IntegrityError:
            # Course concurrente : un autre process vient de créer ce matricule
            result["already_existing"] += 1
            result["skipped_list"].append({
                "identifier": identifier,
                "reason": "créé entre-temps par une autre synchronisation (doublon évité)",
            })
            continue
        except Exception as e:
            result["errors"] += 1
            result["error_list"].append({"identifier": identifier, "error": str(e)})
            log.error("[LDAP_SYNC] Erreur création %s (%s) : %s", name, identifier, e)
            continue

        result["created"] += 1
        result["created_list"].append({"identifier": identifier, "name": name})
        log.info("[LDAP_SYNC] Créé : %s (%s)", name, identifier)

    return await _finalize(result, execution)


async def _finalize(result: dict, execution) -> dict:
    """Persiste le journal d'exécution et complète le résumé."""
    from app.models import LdapSyncExecution

    finished_at = datetime.now()
    try:
        started_ts = execution.started_at.timestamp() if execution.started_at else finished_at.timestamp()
    except (AttributeError, OSError):
        started_ts = finished_at.timestamp()
    duration = round(max(0.0, finished_at.timestamp() - started_ts), 3)
    result["finished_at"] = finished_at
    result["duration_seconds"] = duration

    # Recharge l'exécution pour récupérer started_at côté DB
    exec_db = await LdapSyncExecution.get(id=execution.id)
    exec_db.status = result["status"]
    exec_db.ldap_found = result["ldap_found"]
    exec_db.created_count = result["created"]
    exec_db.already_existing_count = result["already_existing"]
    exec_db.skipped_count = result["skipped"]
    exec_db.errors_count = result["errors"]
    exec_db.result_details = {
        "created_list": result["created_list"],
        "skipped_list": result["skipped_list"][:200],
        "error_list": result["error_list"][:200],
    }
    exec_db.duration_seconds = duration
    exec_db.finished_at = finished_at
    await exec_db.save()
    return result
