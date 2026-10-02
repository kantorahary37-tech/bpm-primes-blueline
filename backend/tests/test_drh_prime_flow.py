"""
Flux des primes créées par un compte DRH.

Une prime créée par un DRH démarre en « En attente DRH » (et non « Initialisé ») :
    DRH · Valider  → En attente DG  →  DG · Valider  → Prime validée  → traitement DRH
Un rejet à l'étape DRH ramène la prime en « En attente DRH ».

Les primes créées par les autres rôles gardent leur flux classique
(Initialisé → N+1/N+2 → Directeur → DG → Prime validée).
"""
from datetime import datetime

import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.models import User, Department, Employee, Bonus
from app.models import BonusType, ValidationStatus
from app.auth import get_current_user
from app.api import endpoints as endpoints_module
from app.api.endpoints import router as bonuses_router
import app.scheduler as scheduler_module


async def make_user(email, name="Test User", **kwargs):
    return await User.create(email=email, name=name, **kwargs)


async def make_employee(manager, dept_str="Direction Test", matricule="M1"):
    # bonus_types explicite : le département fictif autorise les types gérés,
    # sinon la règle département/type (nouvelle) refuserait la prime.
    dept = await Department.create(
        name=dept_str, bonus_types=["mensuel", "astreinte", "commission"],
    )
    return await Employee.create(
        matricule=matricule,
        name="Employe Test",
        dept_str=dept_str,
        dept=dept,
        manager=manager,
    )


async def make_bonus(employee, user, status):
    return await Bonus.create(
        employee=employee,
        start_date=datetime(2026, 1, 1).date(),
        end_date=datetime(2026, 1, 31).date(),
        bonus_type=BonusType.ASTREINTE,
        total_amount=1000,
        status=ValidationStatus(status),
        created_by=user,
    )


NEW_BONUS_PAYLOAD = {
    "bonus_type": "astreinte",
    "start_date": "2026-01-01",
    "end_date": "2026-01-31",
    "total_amount": 1000,
}


@pytest_asyncio.fixture
async def api(db, monkeypatch):
    """Client API sur le routeur /bonuses (utilisateur courant piloté par le test)."""
    async def fake_email(*args, **kwargs):
        return True
    monkeypatch.setattr(endpoints_module, "send_bonus_notification_email", fake_email)
    monkeypatch.setattr(endpoints_module, "send_bonus_batch_notification_email", fake_email)

    app = FastAPI()
    app.include_router(bonuses_router)
    state = {"user": None}
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, state
    app.dependency_overrides.clear()


# ── Création ──────────────────────────────────────────────────────────────

async def test_creation_by_drh_starts_en_attente_drh(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    drh = await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    employee = await make_employee(manager)
    state["user"] = drh

    resp = await client.post("/bonuses/", json={**NEW_BONUS_PAYLOAD, "employee_id": employee.id})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "En attente DRH"


async def test_creation_by_other_role_keeps_initialise(api):
    """Le flux des autres créateurs ne change pas."""
    client, state = api
    manager = await make_user("manager@test.mg")
    employee = await make_employee(manager)
    state["user"] = manager

    resp = await client.post("/bonuses/", json={**NEW_BONUS_PAYLOAD, "employee_id": employee.id})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "Initialisé"


# ── Visibilité DRH ────────────────────────────────────────────────────────

async def test_drh_sees_pending_drh_and_validated_in_list(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    drh = await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    employee = await make_employee(manager)
    pending = await make_bonus(employee, manager, "En attente DRH")
    treated = await make_bonus(employee, manager, "Prime validée")
    state["user"] = drh

    resp = await client.get("/bonuses/")
    assert resp.status_code == 200, resp.text
    ids = {b["id"] for b in resp.json()}
    assert pending.id in ids
    assert treated.id in ids

    detail = await client.get(f"/bonuses/{pending.id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "En attente DRH"


# ── Validation ────────────────────────────────────────────────────────────

async def test_drh_validate_moves_prime_to_dg(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    drh = await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    await make_user("dg@test.mg", name="DG Test", is_dg=True)
    employee = await make_employee(manager)
    bonus = await make_bonus(employee, manager, "En attente DRH")
    state["user"] = drh

    resp = await client.post(f"/bonuses/{bonus.id}/validate?step=DRH", json={"action": "VALIDER"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "En attente DG"

    refreshed = await Bonus.get(id=bonus.id)
    assert refreshed.status == ValidationStatus.EN_ATTENTE_DG


async def test_dg_validation_after_drh_closes_flow(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    dg = await make_user("dg@test.mg", name="DG Test", is_dg=True)
    employee = await make_employee(manager)
    bonus = await make_bonus(employee, manager, "En attente DG")
    state["user"] = dg

    resp = await client.post(f"/bonuses/{bonus.id}/validate?step=DG", json={"action": "VALIDER"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "Prime validée"


async def test_drh_reject_keeps_prime_in_drh_lane(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    drh = await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    employee = await make_employee(manager)
    bonus = await make_bonus(employee, manager, "En attente DRH")
    state["user"] = drh

    resp = await client.post(
        f"/bonuses/{bonus.id}/validate?step=DRH",
        json={"action": "REJETER", "motif_rejet": "Montant incorrect"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "En attente DRH"

    refreshed = await Bonus.get(id=bonus.id)
    assert refreshed.status == ValidationStatus.EN_ATTENTE_DRH
    assert refreshed.was_rejected is True


async def test_non_drh_cannot_validate_drh_step(api):
    client, state = api
    manager = await make_user("manager@test.mg")
    employee = await make_employee(manager)
    bonus = await make_bonus(employee, manager, "En attente DRH")
    state["user"] = manager

    resp = await client.post(f"/bonuses/{bonus.id}/validate?step=DRH", json={"action": "VALIDER"})
    assert resp.status_code == 403
    refreshed = await Bonus.get(id=bonus.id)
    assert refreshed.status == ValidationStatus.EN_ATTENTE_DRH


async def test_standard_flow_untouched(api):
    """L'étape Directeur d'une prime Initialisé fonctionne toujours pareil."""
    client, state = api
    manager = await make_user("manager@test.mg")
    directeur = await make_user("dir@test.mg", name="Directeur", is_directeur=True, dept_str="Direction Test")
    employee = await make_employee(manager)
    bonus = await make_bonus(employee, manager, "En attente Directeur")
    state["user"] = directeur

    resp = await client.post(f"/bonuses/{bonus.id}/validate?step=DIRECTEUR", json={"action": "VALIDER"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "En attente DG"


# ── Rappels quotidiens ────────────────────────────────────────────────────

async def test_daily_reminder_lists_pending_drh_for_drh(db):
    manager = await make_user("manager@test.mg")
    drh = await make_user("drh@test.mg", name="DRH Test", is_drh=True)
    employee = await make_employee(manager)
    await make_bonus(employee, manager, "En attente DRH")

    actors = await scheduler_module.collect_pending_by_actor()
    assert drh.id in actors, "le DRH doit être rappelé pour les primes En attente DRH"
    assert all(i["status_label"] == "Validation DRH" for i in actors[drh.id]["items"])
    assert manager.id not in actors
