import pytest
from datetime import datetime, timedelta, timezone

from app.models import User, Department, Employee, Bonus, ServiceGroup
from app.models import BonusType, ValidationStatus, PrimeReminderExecution
from app.config import set_config
from app.email_trigger_service import (
    log_trigger_execution,
    trigger_config,
    save_daily_config,
    save_deadline_config,
    trigger_executions,
    triggers_overview,
    trigger_preview,
)
import app.email_trigger_service as service_module
import app.scheduler as scheduler_module
import app.prime_reminder_service as prime_service


def _make_rh_bonus(employee, user):
    """Prime VALIDÉE non payée (traitement RH restant)."""
    return Bonus.create(
        employee=employee,
        start_date=datetime(2026, 1, 1).date(),
        end_date=datetime(2026, 1, 31).date(),
        bonus_type=BonusType.ASTREINTE,
        total_amount=1000,
        status=ValidationStatus("Prime validée"),
        created_by=user,
    )


def tz3():
    return timezone(timedelta(hours=3))


async def make_user(email, name="Test User", **kwargs):
    return await User.create(email=email, name=name, **kwargs)


async def make_employee(manager, dept_str="Direction Test", matricule="M1"):
    dept = await Department.create(name=dept_str)
    return await Employee.create(
        matricule=matricule,
        name="Employe Test",
        dept_str=dept_str,
        dept=dept,
        manager=manager,
    )


async def make_bonus(employee, user, bonus_type=BonusType.ASTREINTE, status="Initialisé"):
    return await Bonus.create(
        employee=employee,
        start_date=datetime(2026, 1, 1).date(),
        end_date=datetime(2026, 1, 31).date(),
        bonus_type=bonus_type,
        total_amount=1000,
        status=ValidationStatus(status),
        created_by=user,
    )


async def _seed_ongoing(manager):
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    await make_bonus(employee, manager, BonusType.MENSUEL, "En attente DG")


# ── Journalisation ────────────────────────────────────────────────────────

async def test_log_trigger_execution_persists(db, reminder_config):
    row = await log_trigger_execution(
        "daily", trigger_type="CRON", status="SENT",
        recipient="2 email(s)", summary={"emails_sent": 2, "emails_failed": 0},
        total_count=2,
    )
    assert row.notification_type == "daily_reminder"
    assert row.trigger_type == "CRON"
    assert row.status == "SENT"
    assert row.scheduled_for is not None
    fetched = await PrimeReminderExecution.get(id=row.id)
    assert fetched.total_count == 2


# ── Configuration ─────────────────────────────────────────────────────────

async def test_trigger_config_daily(db, reminder_config):
    set_config("REMINDER_ENABLED", "true")
    set_config("REMINDER_HOUR", "9")
    set_config("REMINDER_MINUTE", "15")
    cfg = await trigger_config("daily")
    assert cfg["enabled"] is True
    assert cfg["hour"] == 9
    assert cfg["minute"] == 15
    assert cfg["next_run"] is not None


async def test_trigger_config_deadline(db, reminder_config):
    set_config("REMINDER_DEADLINE_ENABLED", "true")
    set_config("REMINDER_DEADLINE_DAY", "18")
    set_config("REMINDER_DEADLINE_DAYS", "3,7,11")
    set_config("REMINDER_DEADLINE_HOURS", "6,18")
    cfg = await trigger_config("deadline")
    assert cfg["enabled"] is True
    assert cfg["deadline_day"] == 18
    assert cfg["days"] == [3, 7, 11]
    assert cfg["hours"] == [6, 18]


async def test_trigger_config_dg_delegates(db, reminder_config):
    cfg = await trigger_config("dg")
    assert cfg["enabled"] is True
    assert cfg["days"] == [15, 20]
    assert cfg["hours"] == [8, 17]


async def test_save_daily_config(db, reminder_config):
    cfg = await save_daily_config(enabled=True, hour=7, minute=45)
    assert cfg["enabled"] is True
    assert cfg["hour"] == 7
    assert cfg["minute"] == 45


async def test_save_deadline_config(db, reminder_config):
    cfg = await save_deadline_config(enabled=True, deadline_day=22, days=[2, 4], hours=[9])
    assert cfg["enabled"] is True
    assert cfg["deadline_day"] == 22
    assert cfg["days"] == [2, 4]
    assert cfg["hours"] == [9]


# ── Envoi manuel journalisé ───────────────────────────────────────────────

async def test_send_daily_manual_logs_execution(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("dir@test.mg", name="Directeur", is_directeur=True, dept_str="Direction Test")
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente Directeur")

    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(scheduler_module, "send_validation_reminder_email", fake_send)

    admin = await make_user("admin@test.mg", is_admin=True)
    result = await service_module.trigger_send_now("daily", admin)
    assert result["status"] == "sent"
    assert result["stats"]["emails_sent"] == 1
    rows = await PrimeReminderExecution.filter(notification_type="daily_reminder", trigger_type="MANUAL")
    assert len(rows) == 1
    assert rows[0].created_by_id == admin.id


async def test_send_deadline_manual_logs_execution(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("dir@test.mg", name="Directeur", is_directeur=True, dept_str="Direction Test")
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.MENSUEL, "En attente Directeur")

    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(scheduler_module, "send_deadline_reminder_email", fake_send)

    admin = await make_user("admin@test.mg", is_admin=True)
    result = await service_module.trigger_send_now("deadline", admin)
    assert result["status"] == "sent"
    rows = await PrimeReminderExecution.filter(notification_type="deadline_reminder", trigger_type="MANUAL")
    assert len(rows) == 1
    assert rows[0].summary.get("wave")


async def test_send_dg_manual_delegates_to_prime_service(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)

    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(prime_service, "send_prime_reminder_email", fake_send)

    admin = await make_user("admin@test.mg", is_admin=True)
    result = await service_module.trigger_send_now("dg", admin)
    assert result["status"] == "sent"


async def test_send_rh_manual_delegates_to_prime_service(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("rh@test.mg", is_drh=True, is_admin=False)
    employee = await make_employee(manager)
    await _make_rh_bonus(employee, manager)

    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(prime_service, "send_rh_reminder_email", fake_send)

    admin = await make_user("admin@test.mg", is_admin=True)
    result = await service_module.trigger_send_now("rh", admin)
    assert result["status"] == "sent"
    rows = await PrimeReminderExecution.filter(notification_type="prime_reminder_rh", trigger_type="MANUAL")
    assert len(rows) == 1


async def test_send_unknown_trigger_raises(db, reminder_config):
    import pytest
    with pytest.raises(ValueError):
        await service_module.trigger_send_now("nope")


# ── Aperçu ────────────────────────────────────────────────────────────────

async def test_preview_daily_never_sends(db, reminder_config, monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("L'aperçu ne doit pas envoyer d'email")
    monkeypatch.setattr(scheduler_module, "send_validation_reminder_email", boom)

    data = await trigger_preview("daily")
    assert "<html" in data["html"]
    assert data["subject"]
    assert data["using_real_data"] is False  # pas de primes en cours dans ce test


async def test_preview_daily_uses_real_data(db, reminder_config):
    manager = await make_user("manager@test.mg")
    await make_user("dir@test.mg", name="Directeur", is_directeur=True, dept_str="Direction Test")
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente Directeur")
    data = await trigger_preview("daily")
    assert data["using_real_data"] is True
    assert data["stats"]["primes"] >= 1


async def test_collect_and_preview_employee_with_service_group(db, reminder_config):
    """Employé rattaché à un service : la génération des rappels ne doit pas
    planter (AttributeError sur service_group_name) ni omettre le service."""
    manager = await make_user("sg-manager@test.mg")
    await make_user("sg-dir@test.mg", name="Directeur", is_directeur=True, dept_str="Direction Test")
    employee = await make_employee(manager)
    dept = await Department.get(name="Direction Test")
    group = await ServiceGroup.create(name="Réseau", department=dept)
    employee.service_group = group
    await employee.save()
    await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente Directeur")

    actors = await scheduler_module.collect_pending_by_actor()
    items = [i for entry in actors.values() for i in entry["items"]]
    assert any(i["service"] == "Réseau" for i in items)

    daily = await trigger_preview("daily")
    assert daily["using_real_data"] is True
    assert "Réseau" in daily["html"]

    deadline_actors = await scheduler_module.collect_deadline_pending_by_actor()
    deadline_items = [i for entry in deadline_actors.values() for i in entry["items"]]
    assert any(i["service"] == "Réseau" for i in deadline_items)

    deadline = await trigger_preview("deadline")
    assert "<html" in deadline["html"]


async def test_preview_deadline(db, reminder_config, monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("L'aperçu ne doit pas envoyer d'email")
    monkeypatch.setattr(scheduler_module, "send_deadline_reminder_email", boom)
    data = await trigger_preview("deadline")
    assert "<html" in data["html"]
    assert data["subject"]


async def test_preview_dg(db, reminder_config, monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("L'aperçu ne doit pas envoyer d'email")
    monkeypatch.setattr(prime_service, "send_prime_reminder_email", boom)
    data = await trigger_preview("dg")
    assert "<html" in data["html"]
    assert data["subject"]


async def test_preview_rh(db, reminder_config, monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("L'aperçu ne doit pas envoyer d'email")
    monkeypatch.setattr(prime_service, "send_rh_reminder_email", boom)
    data = await trigger_preview("rh")
    assert "<html" in data["html"]
    assert data["subject"]


# ── Historique ────────────────────────────────────────────────────────────

async def test_trigger_executions_filters_by_notification_type(db, reminder_config):
    await log_trigger_execution("daily", status="SENT", total_count=3)
    await log_trigger_execution("deadline", status="SENT", total_count=5)
    await log_trigger_execution("dg", status="MANUAL", total_count=1)
    await log_trigger_execution("rh", status="MANUAL", total_count=2)

    daily = await trigger_executions("daily")
    assert daily["total"] == 1
    assert daily["items"][0]["notification_type"] == "daily_reminder"

    deadline = await trigger_executions("deadline")
    assert deadline["total"] == 1
    assert deadline["items"][0]["notification_type"] == "deadline_reminder"

    dg = await trigger_executions("dg")
    assert dg["total"] == 1
    assert dg["items"][0]["notification_type"] == "prime_reminder_dg"

    rh = await trigger_executions("rh")
    assert rh["total"] == 1
    assert rh["items"][0]["notification_type"] == "prime_reminder_rh"


async def test_trigger_executions_pagination_and_status(db, reminder_config):
    for _ in range(3):
        await log_trigger_execution("daily", status="SENT")
    await log_trigger_execution("daily", status="FAILED")

    page1 = await trigger_executions("daily", page=1, size=2)
    assert page1["total"] == 4
    assert len(page1["items"]) == 2

    failed = await trigger_executions("daily", status="failed")
    assert failed["total"] == 1
    assert failed["items"][0]["status"] == "FAILED"


# ── Vue d'ensemble ────────────────────────────────────────────────────────

async def test_triggers_overview_shape(db, reminder_config):
    set_config("REMINDER_ENABLED", "true")
    set_config("REMINDER_DEADLINE_ENABLED", "false")
    overview = await triggers_overview()
    keys = [t["key"] for t in overview]
    assert keys == ["daily", "deadline", "dg", "rh"]
    for t in overview:
        assert "enabled" in t and "schedule" in t and "next_run" in t
        assert "last_execution" in t and "details" in t
    daily = next(t for t in overview if t["key"] == "daily")
    assert daily["enabled"] is True
    deadline = next(t for t in overview if t["key"] == "deadline")
    assert deadline["enabled"] is False


# ── Route API ─────────────────────────────────────────────────────────────

import pytest_asyncio as _pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from app.auth import get_current_user
from app.api.email_triggers import router


@_pytest_asyncio.fixture
async def api_client(db, reminder_config, monkeypatch):
    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(scheduler_module, "send_validation_reminder_email", fake_send)
    monkeypatch.setattr(scheduler_module, "send_deadline_reminder_email", fake_send)
    monkeypatch.setattr(prime_service, "send_prime_reminder_email", fake_send)

    admin = await make_user("admin@test.mg", name="Admin", is_admin=True)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: admin
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_api_overview(api_client):
    resp = await api_client.get("/email-triggers/overview")
    assert resp.status_code == 200
    triggers = resp.json()["triggers"]
    assert [t["key"] for t in triggers] == ["daily", "deadline", "dg", "rh"]


async def test_api_get_config(api_client):
    resp = await api_client.get("/email-triggers/daily/config")
    assert resp.status_code == 200
    assert "enabled" in resp.json()

    resp = await api_client.get("/email-triggers/unknown/config")
    assert resp.status_code == 404


async def test_api_put_daily_config(api_client):
    resp = await api_client.put("/email-triggers/daily/config", json={
        "enabled": True, "hour": 6, "minute": 45,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["hour"] == 6


async def test_api_put_deadline_config(api_client):
    resp = await api_client.put("/email-triggers/deadline/config", json={
        "enabled": True, "deadline_day": 18, "days": [2, 9], "hours": [7, 19],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["days"] == [2, 9]


async def test_api_put_dg_config(api_client):
    resp = await api_client.put("/email-triggers/dg/config", json={
        "enabled": True, "days": [11, 21], "hours": [10], "recipient": "x@y.mg",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["days"] == [11, 21]
    assert data["recipient_override"] == "x@y.mg"


async def test_api_put_rh_config(api_client):
    resp = await api_client.put("/email-triggers/rh/config", json={
        "enabled": True, "days": [12, 22], "hours": [9], "recipient": "rh@y.mg",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["days"] == [12, 22]
    assert data["recipient_override"] == "rh@y.mg"


async def test_api_send_now(api_client):
    resp = await api_client.post("/email-triggers/daily/send")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "sent"


async def test_api_preview(api_client):
    resp = await api_client.get("/email-triggers/deadline/preview")
    assert resp.status_code == 200
    assert "<html" in resp.json()["html"]


async def test_api_executions(api_client):
    resp = await api_client.post("/email-triggers/dg/send")
    assert resp.status_code == 200
    resp = await api_client.get("/email-triggers/dg/executions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert data["items"][0]["notification_type"] == "prime_reminder_dg"

    resp = await api_client.post("/email-triggers/rh/send")
    assert resp.status_code == 200
    resp = await api_client.get("/email-triggers/rh/executions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert data["items"][0]["notification_type"] == "prime_reminder_rh"


async def test_api_unknown_trigger_404(api_client):
    resp = await api_client.post("/email-triggers/nope/send")
    assert resp.status_code == 404
    resp = await api_client.get("/email-triggers/nope/executions")
    assert resp.status_code == 404
