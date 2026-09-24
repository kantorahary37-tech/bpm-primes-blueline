"""Tests de la synchronisation LDAP create-only et des permissions associées.

Règle vérifiée : la synchronisation LDAP ne fait que CRÉER les employés
absents de BPM. Un employé existant n'est JAMAIS modifié.
"""

import pytest

from app.models import User, Department, Employee, LdapSyncExecution
from app.ldap_sync_service import run_ldap_sync, run_department_sync
import app.ldap_sync_service as service_module


def ldap_record(email, matricule=None, name=("Jean", "Dupont"), dept="IT",
                title="Dev", manager=None, uid=None):
    """Enregistrement LDAP factice (même forme que fetch_all_ldap_users)."""
    given, sn = name
    return {
        "uid": uid or email.split("@")[0],
        "mail": email,
        "email": email.lower(),
        "givenName": given,
        "sn": sn,
        "cn": f"{given} {sn}".strip(),
        "employeeNumber": matricule,
        "departmentNumber": dept,
        "ou": None,
        "title": title,
        "employeeType": None,
        "manager": manager,
        "dn": f"uid={uid or email.split('@')[0]},dc=blueline,dc=mg",
    }


@pytest.fixture
def fake_ldap(monkeypatch):
    """Remplace fetch_all_ldap_users par un jeu de données contrôlable."""
    holder = {"records": []}

    def _set(records):
        holder["records"] = records

    async def _fake_fetch():
        return holder["records"]

    monkeypatch.setattr(service_module, "fetch_all_ldap_users", _fake_fetch)
    return _set


async def make_manager(email="manager@test.mg", is_dg=False):
    return await User.create(email=email, name="Manager Test", is_dg=is_dg)


# ── Création des nouveaux employés ────────────────────────────────────────

async def test_new_ldap_employee_is_created(db, fake_ldap):
    await make_manager("dg@test.mg", is_dg=True)  # repli manager par défaut
    await Department.create(name="IT")
    fake_ldap([
        ldap_record("new.emp@blueline.mg", matricule="11111"),
        ldap_record("other.emp@blueline.mg", matricule="22222", name=("Aline", "Martin")),
    ])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["status"] == "COMPLETED"
    assert result["created"] == 2
    assert result["already_existing"] == 0
    emp = await Employee.get_or_none(matricule="11111")
    assert emp is not None
    assert emp.name == "Jean Dupont"
    assert emp.dept_str == "IT"
    assert emp.is_active is True


async def test_created_employee_gets_dg_fallback_manager(db, fake_ldap):
    """Manager LDAP non résolu → repli département, puis DG (règle existante)."""
    dg = await make_manager("dg@test.mg", is_dg=True)
    await Department.create(name="IT")
    fake_ldap([
        ldap_record("sub@blueline.mg", matricule="33333",
                    manager="cn=Inconnu LDAP,dc=blueline,dc=mg"),
    ])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["created"] == 1
    emp = await Employee.get(matricule="33333")
    assert emp.manager_id == dg.id


async def test_employee_without_any_resolvable_manager_is_skipped(db, fake_ldap):
    """Aucun manager résoluble (pas de DG) → employé ignoré, pas de fiche partielle.

    La colonne manager est NOT NULL dans le schéma existant : on ne crée pas
    d'employé sans manager (même comportement que l'ancien flux).
    """
    await Department.create(name="IT")
    fake_ldap([
        ldap_record("solo@blueline.mg", matricule="44444",
                    manager="cn=Inconnu Total,dc=blueline,dc=mg"),
    ])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["created"] == 0
    assert result["skipped"] == 1
    assert await Employee.filter(matricule="44444").count() == 0


async def test_created_employee_gets_manager_from_ldap_dn(db, fake_ldap):
    """Manager résolu via le DN LDAP (tokens cn/uid → partie locale email)."""
    mgr = await make_manager("chef@blueline.mg")
    # cn=chef → partie locale « chef » de chef@blueline.mg
    fake_ldap([
        ldap_record("sub@blueline.mg", matricule="33334",
                    manager="cn=chef,dc=blueline,dc=mg"),
    ])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["created"] == 1
    emp = await Employee.get(matricule="33334")
    assert emp.manager_id == mgr.id


# ── Employé existant : JAMAIS modifié ─────────────────────────────────────

async def test_existing_employee_not_modified(db, fake_ldap):
    """Employé applicatif + LDAP divergent → aucune écriture."""
    mgr = await make_manager()
    dept = await Department.create(name="Finance")
    emp = await Employee.create(
        matricule="12345",
        name="John Doe",
        poste="Ancien poste",
        dept_str="Finance",
        dept=dept,
        manager=mgr,
        currency="Ar",
        is_active=True,
    )

    fake_ldap([
        # LDAP dit autre chose (nom, poste, département IT)
        ldap_record("john.doe@blueline.mg", matricule="12345",
                    name=("John", "Doe LDAP"), dept="IT", title="Poste LDAP"),
    ])

    result = await run_ldap_sync(trigger_type="MANUAL")

    assert result["created"] == 0
    assert result["already_existing"] == 1

    refreshed = await Employee.get(id=emp.id)
    assert refreshed.name == "John Doe"
    assert refreshed.poste == "Ancien poste"
    assert refreshed.dept_str == "Finance"
    assert refreshed.dept_id == dept.id
    assert refreshed.currency == "Ar"
    assert refreshed.is_active is True
    # Un seul employé, pas de doublon
    assert await Employee.filter(matricule="12345").count() == 1


async def test_ldap_changes_do_not_touch_existing_department_or_manager(db, fake_ldap):
    mgr = await make_manager()
    dept = await Department.create(name="Finance")
    emp = await Employee.create(
        matricule="55555", name="Jane Roe", dept_str="Finance",
        dept=dept, manager=mgr,
    )

    fake_ldap([ldap_record("jane.roe@blueline.mg", matricule="55555", dept="IT")])

    await run_ldap_sync(trigger_type="CRON")

    refreshed = await Employee.get(id=emp.id)
    assert refreshed.dept_str == "Finance"
    assert refreshed.manager_id == mgr.id


# ── Doublons / idempotence ────────────────────────────────────────────────

async def test_second_sync_creates_no_duplicates(db, fake_ldap):
    await make_manager("dg@test.mg", is_dg=True)
    await Department.create(name="IT")
    fake_ldap([ldap_record("john.doe@blueline.mg", matricule="99999")])

    first = await run_ldap_sync(trigger_type="CRON")
    second = await run_ldap_sync(trigger_type="CRON")

    assert first["created"] == 1
    assert second["created"] == 0
    assert second["already_existing"] == 1
    assert await Employee.filter(matricule="99999").count() == 1


# ── Enregistrements invalides / erreurs ───────────────────────────────────

async def test_record_without_email_is_skipped(db, fake_ldap):
    rec = ldap_record("no.mail@blueline.mg", matricule="77777")
    rec["email"] = None  # comme fetch_all_ldap_users pour une entrée sans mail
    fake_ldap([rec])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["created"] == 0
    assert result["skipped"] == 1
    assert await Employee.filter(matricule="77777").count() == 0


async def test_record_without_department_is_skipped(db, fake_ldap):
    fake_ldap([ldap_record("nodept@blueline.mg", matricule="88888", dept=None)])

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["created"] == 0
    assert result["skipped"] == 1
    assert await Employee.filter(matricule="88888").count() == 0


async def test_ldap_connection_failure_marks_execution_failed(db, fake_ldap, monkeypatch):
    async def boom():
        raise service_module.LdapSyncError("Connexion LDAP impossible")

    monkeypatch.setattr(service_module, "fetch_all_ldap_users", boom)

    result = await run_ldap_sync(trigger_type="CRON")

    assert result["status"] == "FAILED"
    assert result["errors"] == 1
    execution = await LdapSyncExecution.filter(status="FAILED").first()
    assert execution is not None


async def test_identifier_priority_employee_number_then_uid_then_email(db, fake_ldap):
    """Clé de correspondance : employeeNumber → uid → partie locale email."""
    await make_manager("dg@test.mg", is_dg=True)
    await Department.create(name="IT")

    # Sans employeeNumber → fallback uid
    rec_uid = ldap_record("by.uid@blueline.mg", matricule=None, uid="99999")
    fake_ldap([rec_uid])
    await run_ldap_sync(trigger_type="CRON")
    assert await Employee.filter(matricule="99999").exists()

    # Sans employeeNumber ni uid → fallback préfixe email
    fake_ldap([ldap_record("fallback.name@blueline.mg", matricule=None, uid=None)])
    await run_ldap_sync(trigger_type="CRON")
    assert await Employee.filter(matricule="fallback.name").exists()


# ── Journal d'audit ───────────────────────────────────────────────────────

async def test_execution_is_audited_with_counts(db, fake_ldap):
    admin = await User.create(email="admin@test.mg", name="Admin", is_admin=True)
    await make_manager("dg@test.mg", is_dg=True)
    await Department.create(name="IT")
    fake_ldap([
        ldap_record("a@blueline.mg", matricule="10001"),
        ldap_record("b@blueline.mg", matricule="10002"),
    ])

    result = await run_ldap_sync(trigger_type="MANUAL", created_by=admin)

    execution = await LdapSyncExecution.filter(trigger_type="MANUAL").first()
    assert execution is not None
    assert execution.status == "COMPLETED"
    assert execution.ldap_found == 2
    assert execution.created_count == 2
    assert execution.created_by_id == admin.id
    assert execution.duration_seconds is not None
    assert result["duration_seconds"] is not None


# ── Synchronisation départements (create-only) ────────────────────────────

async def test_department_sync_creates_missing_only(db, fake_ldap):
    await Department.create(name="IT")
    fake_ldap([
        ldap_record("a@blueline.mg", dept="IT"),
        ldap_record("b@blueline.mg", dept="RH"),
    ])

    result = await run_department_sync(trigger_type="CRON")

    assert result["created"] == 1
    assert result["already_existing"] == 1
    assert await Department.filter(name="RH").exists()
    assert await Department.filter(name="IT").count() == 1
