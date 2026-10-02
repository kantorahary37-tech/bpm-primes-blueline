"""Assignation des types de primes par département.

Chaque département porte la liste des types de primes qu'il peut utiliser
(cases à cocher de l'écran Administration → Départements → Modifier). La règle
est vérifiée côté serveur à la création d'une prime, et exposée au frontend pour
qu'il n'affiche que les types disponibles.

Tant qu'un département n'est pas configuré, l'ancienne liste figée
(:data:`REGLE_HISTORIQUE`) s'applique, afin de ne rien changer à l'existant.
"""

import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api.departments import router as departments_router
from app.api.endpoints import router as bonuses_router
from app.auth import get_current_user
from app.bonus_type_access import (
    MANAGED_BONUS_TYPES,
    REGLE_HISTORIQUE,
    all_departments_bonus_types,
    department_allows,
    department_bonus_types,
)
from app.models import Bonus, BonusType, Department, Employee, User, ValidationStatus


async def _user(email, **kwargs):
    return await User.create(email=email, name=email.split("@")[0], password_hash="x", **kwargs)


async def _employee(manager, dept, matricule="M1"):
    return await Employee.create(
        matricule=matricule, name=f"Employe {matricule}",
        dept=dept, dept_str=dept.name, manager=manager,
    )


async def _prime(client, emp, creator, bonus_type=BonusType.ASTREINTE):
    from datetime import datetime
    return await client.post("/bonuses/", json={
        "employee_id": emp.id,
        "bonus_type": bonus_type.value,
        "start_date": "2026-01-01",
        "end_date": "2026-01-31",
        "total_amount": 1000,
    })


@pytest_asyncio.fixture
async def api(db):
    app = FastAPI()
    app.include_router(departments_router, prefix="/departments")
    app.include_router(bonuses_router)
    state = {"user": None}
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           follow_redirects=True) as client:
        yield client, state
    app.dependency_overrides.clear()


# ── Repli sur la règle historique ──────────────────────────────────────────

async def test_unconfigured_department_falls_back_to_the_legacy_rule(db):
    dsi = await Department.create(name="Direction des Systemes d'Informations")
    assert await department_allows(dsi.name, BonusType.MENSUEL)
    assert await department_allows(dsi.name, BonusType.ASTREINTE)
    assert not await department_allows(dsi.name, BonusType.COMMISSION)

    commerciale = await Department.create(name="Direction Commerciale")
    assert await department_allows(commerciale.name, BonusType.MENSUEL)
    assert not await department_allows(commerciale.name, BonusType.ASTREINTE)
    assert await department_allows(commerciale.name, BonusType.COMMISSION)


async def test_non_managed_types_are_always_allowed(db):
    dept = await Department.create(name="Direction BBS", bonus_types=["mensuel"])
    for bonus_type in (BonusType.EXCEPTIONNEL, BonusType.PONCTUELLE, BonusType.INTERVENTION):
        assert await department_allows(dept.name, bonus_type)


# ── Configuration explicite ────────────────────────────────────────────────

async def test_explicit_configuration_wins_over_the_legacy_rule(db):
    # DSI : historiquement mensuel + astreinte, on retire l'astreinte
    dept = await Department.create(
        name="Direction des Systemes d'Informations", bonus_types=["mensuel"],
    )
    assert await department_bonus_types(dept.name) == ["mensuel"]
    assert await department_allows(dept.name, BonusType.MENSUEL)
    assert not await department_allows(dept.name, BonusType.ASTREINTE)


async def test_department_can_enable_all_three_types(db):
    dept = await Department.create(name="Direction X", bonus_types=list(MANAGED_BONUS_TYPES))
    assert await department_bonus_types(dept.name) == list(MANAGED_BONUS_TYPES)


async def test_department_can_have_no_managed_type(db):
    dept = await Department.create(name="Direction Y", bonus_types=[])
    assert await department_bonus_types(dept.name) == []


async def test_all_departments_bonus_types_mapping(db):
    await Department.create(name="Direction des Systemes d'Informations", bonus_types=["astreinte"])
    await Department.create(name="Direction Commerciale")
    mapping = await all_departments_bonus_types()
    assert mapping["Direction des Systemes d'Informations"] == ["astreinte"]
    assert mapping["Direction Commerciale"] == ["mensuel", "commission"]


# ── API départements ───────────────────────────────────────────────────────

async def test_put_department_updates_bonus_types(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    state["user"] = admin
    dept = await Department.create(name="Direction Test")

    resp = await client.put(f"/departments/{dept.id}", json={
        "name": "Direction Test",
        "bonus_types": ["astreinte", "commission"],
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["bonus_types"] == ["astreinte", "commission"]

    await dept.refresh_from_db()
    assert dept.bonus_types == ["astreinte", "commission"]


async def test_put_department_rejects_an_unknown_type(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    state["user"] = admin
    dept = await Department.create(name="Direction Test")

    resp = await client.put(f"/departments/{dept.id}", json={
        "name": "Direction Test",
        "bonus_types": ["exceptionnel"],
    })
    assert resp.status_code == 400, resp.text
    assert "Type de prime inconnu" in resp.json()["detail"]


async def test_put_department_can_clear_all_types(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    state["user"] = admin
    dept = await Department.create(name="Direction Test", bonus_types=["mensuel"])

    resp = await client.put(f"/departments/{dept.id}", json={
        "name": "Direction Test", "bonus_types": [],
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["bonus_types"] == []


async def test_rename_keeps_the_configuration(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    state["user"] = admin
    dept = await Department.create(name="Direction Test", bonus_types=["mensuel"])
    emp = await _employee(admin, dept)

    resp = await client.put(f"/departments/{dept.id}", json={"name": "Direction Renommee"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["bonus_types"] == ["mensuel"]

    renamed = await Department.get(name="Direction Renommee")
    assert renamed.bonus_types == ["mensuel"]
    reloaded_emp = await Employee.get(id=emp.id)
    assert reloaded_emp.dept_str == "Direction Renommee"


async def test_created_department_defaults_to_the_three_managed_types(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    state["user"] = admin

    resp = await client.post("/departments/", json={"name": "Direction Neuve"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["bonus_types"] == list(MANAGED_BONUS_TYPES)


async def test_bonus_types_endpoint_is_readable_by_any_connected_user(api):
    client, state = api
    await Department.create(name="Direction Commerciale")
    state["user"] = await _user("simple@test.mg")

    resp = await client.get("/departments/bonus-types")
    assert resp.status_code == 200, resp.text
    assert resp.json()["Direction Commerciale"] == ["mensuel", "commission"]


# ── Application au moment de la création d'une prime ──────────────────────

async def test_creating_a_prime_of_a_forbidden_type_is_rejected(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    dept = await Department.create(name="Direction Commerciale", bonus_types=["mensuel"])
    emp = await _employee(admin, dept)
    state["user"] = admin

    # Astreinte retirée pour ce département → refus explicite
    resp = await _prime(client, emp, admin, BonusType.ASTREINTE)
    assert resp.status_code == 400, resp.text
    assert "n'est pas autorisé pour le département" in resp.json()["detail"]
    assert await Bonus.all().count() == 0

    # Mensuel toujours allowed
    resp = await _prime(client, emp, admin, BonusType.MENSUEL)
    assert resp.status_code == 200, resp.text
    assert await Bonus.all().count() == 1


async def test_creating_a_prime_of_an_allowed_type_still_works(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    dept = await Department.create(name="Direction BBS", bonus_types=["astreinte"])
    emp = await _employee(admin, dept)
    state["user"] = admin

    resp = await _prime(client, emp, admin, BonusType.ASTREINTE)
    assert resp.status_code == 200, resp.text


async def test_non_managed_type_is_never_blocked(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    dept = await Department.create(name="Direction BBS", bonus_types=["mensuel"])
    emp = await _employee(admin, dept)
    state["user"] = admin

    resp = await _prime(client, emp, admin, BonusType.EXCEPTIONNEL)
    assert resp.status_code == 200, resp.text


async def test_legacy_rule_still_applies_to_existing_departments(db):
    """Un département de la liste historique garde ses types sans configuration."""
    for name in REGLE_HISTORIQUE['astreinte']:
        await Department.create(name=name)
    dsi = "Direction des Systemes d'Informations"
    assert await department_allows(dsi, BonusType.ASTREINTE)
    assert not await department_allows(dsi, BonusType.COMMISSION)


async def test_the_employees_department_is_the_source_of_truth(api):
    client, state = api
    admin = await _user("admin@test.mg", is_admin=True)
    dept = await Department.create(name="Direction Commerciale", bonus_types=["mensuel"])
    emp = await _employee(admin, dept)
    assert emp.dept_str == "Direction Commerciale"
    state["user"] = admin

    # Commission retirée pour CE département : refus, et aucune prime créée
    resp = await _prime(client, emp, admin, BonusType.COMMISSION)
    assert resp.status_code == 400, resp.text
    assert await Bonus.all().count() == 0