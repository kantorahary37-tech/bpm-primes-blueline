"""Comparaison de l'état d'archivage Odoo ⇄ application.

Régressions couvertes :
- le rapprochement par matricule doit ignorer les zéros de tête (Odoo « 1765 »
  / application « 01765 »), sinon aucun employé n'est détecté ;
- l'état d'archivage se lit sur la colonne `is_active` de `hr.employee`, pas
  sur le drapeau `active` d'Odoo ;
- la normalisation pouvant créer des collisions (Odoo « 002012 » ≡ « 2012 »),
  un record de test archivé ne doit pas faire archiver l'employée réelle.
"""
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

import app.odoo_service as odoo_service
from app.api.odoo_sync import router as odoo_router
from app.auth import get_current_user
from app.models import Employee, User
from app.odoo_service import compare_with_app, normalize_matricule


def _odoo_row(matricule, name, active, department="Direction Test", odoo_id=1, odoo_flag=None):
    """Ligne Odoo : `active` = colonne is_active (état RH réel).

    `odoo_flag` permet de définir séparément le drapeau `active` d'Odoo.
    """
    return {
        "odoo_id": odoo_id,
        "number": str(matricule),
        "matricule": normalize_matricule(matricule),
        "name": name,
        "active": bool(active) if odoo_flag is None else bool(odoo_flag),
        "is_active": bool(active),
        "archived": not bool(active),
        "work_email": "",
        "job": "Poste",
        "department": department,
    }


async def _employee(dept, matricule, name, archived=False, manager=None):
    return await Employee.create(
        matricule=matricule, name=name, dept=dept, dept_str=dept.name,
        manager=manager, is_archived=archived,
    )


def test_normalize_matricule():
    assert normalize_matricule("01765") == "1765"
    assert normalize_matricule(" 1765 ") == "1765"
    assert normalize_matricule("98501") == "98501"
    assert normalize_matricule("00010") == "10"
    assert normalize_matricule("") == ""
    assert normalize_matricule(None) == ""
    assert normalize_matricule("M-17A") == "M-17A"


async def test_archived_state_uses_is_active_column(db, monkeypatch):
    """`active` (drapeau Odoo) et `is_active` (état RH) peuvent diverger :
    c'est `is_active` qui décide."""
    from app.models import Department
    dept = await Department.create(name="Direction Test")
    manager = await User.create(email="mgr2@odoo.test", name="Manager", password_hash="x")

    # Odoo : drapeau active=False mais is_active=True → toujours actif ici
    still_active = await _employee(dept, "02013", "Toujours actif", manager=manager)
    # Odoo : drapeau active=True mais is_active=False → à archiver ici
    to_archive = await _employee(dept, "01431", "Archivé par is_active", manager=manager)

    monkeypatch.setattr(odoo_service, "fetch_odoo_employees", lambda: [
        _odoo_row("2013", "Toujours actif", active=True, odoo_flag=False, odoo_id=10),
        _odoo_row("1431", "Archivé par is_active", active=False, odoo_flag=True, odoo_id=11),
    ])

    report = await compare_with_app()
    assert report["error"] is None
    assert [e["id"] for e in report["to_archive"]] == [to_archive.id]
    assert report["to_archive"][0]["odoo_active"] is False
    assert still_active.id not in {e["id"] for e in report["to_archive"]}
    assert report["matched"] == 2


async def test_matricule_collision_keeps_real_active_record(db, monkeypatch):
    """Odoo « 002012 » (record de test archivé) et « 2012 » (employée réelle
    active) partagent la clé normalisée : l'employée ne doit pas être
    signalée comme à archiver."""
    from app.models import Department
    dept = await Department.create(name="Direction Test")
    manager = await User.create(email="mgr3@odoo.test", name="Manager", password_hash="x")

    gaelle = await _employee(dept, "02012", "RABESON Gaëlle Lovasoa", manager=manager)

    monkeypatch.setattr(odoo_service, "fetch_odoo_employees", lambda: [
        _odoo_row("002012", "test SI migration", active=False, odoo_id=1322),
        _odoo_row("2012", "RABESON Gaëlle Lovasoa", active=True, odoo_id=1106),
    ])

    report = await compare_with_app()
    assert report["error"] is None
    assert report["matched"] == 1
    assert report["to_archive"] == []
    assert report["missing_in_odoo"] == []

    # ...et si l'employée était archivée ici, elle serait à restaurer
    await Employee.filter(id=gaelle.id).update(is_archived=True)
    report = await compare_with_app()
    assert [e["id"] for e in report["to_restore"]] == [gaelle.id]


async def test_compare_detects_archived_in_odoo(db, monkeypatch):
    from app.models import Department
    dept = await Department.create(name="Direction Test")
    manager = await User.create(email="manager@odoo.test", name="Manager", password_hash="x")

    to_archive = await _employee(dept, "01430", "Archivé Odoo", manager=manager)   # Odoo : "1430", archivé
    consistent = await _employee(dept, "01678", "Déjà archivé", archived=True, manager=manager)
    to_restore = await _employee(dept, "98501", "Actif Odoo", archived=True, manager=manager)
    missing = await _employee(dept, "01622", "Absent Odoo", manager=manager)

    odoo_rows = [
        _odoo_row("1430", "Archivé Odoo", active=False),
        _odoo_row("1678", "Déjà archivé", active=False),
        _odoo_row("98501", "Actif Odoo", active=True),
        _odoo_row("99999", "Jamais vu ici", active=True),
    ]
    monkeypatch.setattr(odoo_service, "fetch_odoo_employees", lambda: odoo_rows)

    report = await compare_with_app()
    assert report["error"] is None
    assert [e["id"] for e in report["to_archive"]] == [to_archive.id]
    assert report["to_archive"][0]["odoo_active"] is False
    assert [e["id"] for e in report["already_archived"]] == [consistent.id]
    assert [e["id"] for e in report["to_restore"]] == [to_restore.id]
    assert [e["id"] for e in report["missing_in_odoo"]] == [missing.id]
    assert report["matched"] == 3
    assert report["odoo"]["active"] == 2
    assert report["odoo"]["archived"] == 2
    assert report["app"]["total"] == 4


async def test_compare_reports_missing_configuration(db):
    report = await compare_with_app()
    assert report["odoo"]["configured"] in (True, False)
    # Sans connexion possible, le rapport reste consultable avec une erreur
    if not report["odoo"]["configured"]:
        assert report["error"]
        assert report["to_archive"] == []


async def _client(user):
    app = FastAPI()
    app.include_router(odoo_router)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_archive_endpoint_archives_and_traces(db, monkeypatch):
    from app.models import Department
    dept = await Department.create(name="Direction Test")
    admin = await User.create(email="admin@odoo.test", name="Admin",
                              password_hash="x", is_admin=True)
    emp = await _employee(dept, "01430", "Archivé Odoo", manager=admin)
    user = await User.create(email="user@odoo.test", name="User",
                             password_hash="x", is_admin=False)

    monkeypatch.setattr(odoo_service, "fetch_odoo_employees",
                        lambda: [_odoo_row("1430", "Archivé Odoo", active=False)])

    async for client in _client(admin):
        resp = await client.get("/odoo/employees/compare")
        assert resp.status_code == 200, resp.text
        report = resp.json()
        assert [e["id"] for e in report["to_archive"]] == [emp.id]

        # Employé déjà archivé → ignoré, sans double archivage
        resp = await client.post("/odoo/employees/archive", json={"ids": [emp.id]})
        assert resp.status_code == 200, resp.text
        assert resp.json()["count"] == 1

        resp = await client.post("/odoo/employees/archive", json={"ids": [emp.id]})
        assert resp.status_code == 200, resp.text
        assert resp.json()["count"] == 0
        assert resp.json()["skipped"][0]["detail"] == "déjà archivé"

        resp = await client.post("/odoo/employees/archive", json={"ids": []})
        assert resp.status_code == 400, resp.text

    refreshed = await Employee.get(id=emp.id)
    assert refreshed.is_archived is True
    assert refreshed.archive_reason == "Archivé dans Odoo"
    assert refreshed.archived_by_id is not None
    assert refreshed.archived_at is not None

    async for client in _client(user):
        resp = await client.get("/odoo/employees/compare")
        assert resp.status_code == 403, resp.text
