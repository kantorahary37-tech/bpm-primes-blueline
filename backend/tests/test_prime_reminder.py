import pytest
from datetime import datetime, timedelta, timezone

from app.models import User, Department, Employee, Bonus
from app.models import BonusType, ValidationStatus, PrimeReminderExecution
from app.config import set_config
from app.prime_reminder_service import (
    prime_reminder_days,
    prime_reminder_hours,
    prime_reminder_recipients,
    prime_reminder_summary,
    prime_reminder_next_slot,
    prime_reminder_send_scheduled,
    prime_reminder_send_manual,
    prime_reminder_preview,
)
import app.prime_reminder_service as service_module


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
    b1 = await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    b2 = await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    return employee, b1, b2


# ── Configuration ──────────────────────────────────────────────────────────

def test_next_slot_uses_configured_days_and_hours(db, reminder_config):
    now = datetime(2026, 1, 25, 10, 0, tzinfo=tz3())
    target, delay = prime_reminder_next_slot(now)
    # Prochain créneau après le 25/01 → 15/02 à 08h (18 jours après le 10)
    assert target.day == 15 and target.month == 2
    assert target.hour == 8
    assert delay > 0


# ── Regroupement / résumé ──────────────────────────────────────────────────

async def test_summary_groups_by_dept_and_type(db, reminder_config):
    manager = await make_user("manager@test.mg")
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.ASTREINTE, "Initialisé")
    await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    await make_bonus(employee, manager, BonusType.MENSUEL, "En attente Directeur")
    await make_bonus(employee, manager, BonusType.MENSUEL, "En attente DG")

    sections, total = await prime_reminder_summary()
    assert total == 2
    assert len(sections) == 2
    astreinte = next(s for s in sections if s["bonus_type"] == "astreinte")
    mensuel = next(s for s in sections if s["bonus_type"] == "mensuel")
    assert astreinte["count"] == 1
    assert mensuel["count"] == 1
    assert astreinte["bonus_type_label"] == "Astreinte"
    assert astreinte["department"] == "Direction Test"


async def test_summary_excludes_validated_rejected_and_paid(db, reminder_config):
    manager = await make_user("manager@test.mg")
    employee = await make_employee(manager)
    await make_bonus(employee, manager, BonusType.ASTREINTE, "Prime validée")
    rejected = await make_bonus(employee, manager, BonusType.ASTREINTE, "Prime rejetée")
    ongoing = await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    # Payée (même en attente DG) → exclue
    paid = await make_bonus(employee, manager, BonusType.ASTREINTE, "En attente DG")
    paid.paid_at = datetime.now()
    await paid.save()

    sections, total = await prime_reminder_summary()
    assert total == 1
    assert sections[0]["count"] == 1


# ── Destinataires ──────────────────────────────────────────────────────────

async def test_recipients_auto_dg_non_admin(db, reminder_config):
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await make_user("admin@test.mg", is_dg=True, is_admin=True)  # exclu (admin)
    await make_user("normal@test.mg")
    recipients = await prime_reminder_recipients()
    assert recipients == ["dg@test.mg"]


async def test_recipients_override(db):
    set_config("PRIME_REMINDER_RECIPIENT", "alpha@x.mg, beta@x.mg")
    recipients = await prime_reminder_recipients()
    assert recipients == ["alpha@x.mg", "beta@x.mg"]


# ── Envoi planifié (cron) ──────────────────────────────────────────────────

async def test_cron_empty_does_not_send_email(db, reminder_config, monkeypatch):
    sent = []
    async def fake_send(*args, **kwargs):
        sent.append(args)
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    target = datetime(2026, 1, 15, 8, 0)
    result = await prime_reminder_send_scheduled(target)

    assert result["status"] == "skipped"
    assert sent == []
    execution = await PrimeReminderExecution.get(
        notification_type="prime_reminder_dg", scheduled_for=target
    )
    assert execution.status == "SENT"
    assert execution.total_count == 0


async def test_cron_sends_grouped_email(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    dg = await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)

    sent = []
    async def fake_send(recipients, sections, total):
        sent.append((recipients, sections, total))
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    target = datetime(2026, 1, 15, 8, 0)
    result = await prime_reminder_send_scheduled(target)

    assert result["status"] == "sent"
    assert result["execution"]["total_count"] == 2
    execution = await PrimeReminderExecution.get(
        notification_type="prime_reminder_dg", scheduled_for=target
    )
    assert execution.status == "SENT"
    assert execution.trigger_type == "CRON"
    assert dg.email in execution.recipient
    assert len(sent) == 1
    recipients, sections, total = sent[0]
    assert recipients == ["dg@test.mg"]
    assert total == 2


async def test_cron_idempotent_same_slot(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)

    sent = []
    async def fake_send(*args, **kwargs):
        sent.append(args)
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    target = datetime(2026, 1, 15, 8, 0)
    first = await prime_reminder_send_scheduled(target)
    second = await prime_reminder_send_scheduled(target)

    assert first["status"] == "sent"
    assert second["status"] == "skipped"
    assert len(sent) == 1
    rows = await PrimeReminderExecution.filter(
        notification_type="prime_reminder_dg", scheduled_for=target
    )
    assert len(rows) == 1


async def test_cron_failure_marks_failed_and_allows_retry(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)

    calls = {"n": 0}
    async def failing_then_ok(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return False
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", failing_then_ok)

    target = datetime(2026, 1, 15, 8, 0)
    first = await prime_reminder_send_scheduled(target)
    assert first["status"] == "failed"

    exec_row = first["execution"]
    retry = await prime_reminder_send_scheduled(target)
    # Réutilise la même ligne (pas de doublon) et réessaie
    assert retry["status"] == "sent"
    assert retry["execution"]["id"] == exec_row["id"]
    rows = await PrimeReminderExecution.filter(
        notification_type="prime_reminder_dg", scheduled_for=target
    )
    assert len(rows) == 1
    assert calls["n"] == 2


async def test_cron_no_dg_recipient_fails(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    await _seed_ongoing(manager)

    sent = []
    async def fake_send(*args, **kwargs):
        sent.append(args)
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    target = datetime(2026, 1, 15, 8, 0)
    result = await prime_reminder_send_scheduled(target)
    assert result["status"] == "failed"
    assert sent == []


# ── Envoi manuel ───────────────────────────────────────────────────────────

async def test_manual_send_logs_manual_execution(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    admin = await make_user("admin@test.mg", is_admin=True)
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)

    sent = []
    async def fake_send(*args, **kwargs):
        sent.append(args)
        return True
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    result = await prime_reminder_send_manual(admin)
    assert result["status"] == "sent"
    assert result["execution"]["trigger_type"] == "MANUAL"
    assert result["execution"]["created_by"] == admin.id
    assert len(sent) == 1


# ── Aperçu ────────────────────────────────────────────────────────────────

async def test_preview_never_sends(db, reminder_config, monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("L'aperçu ne doit pas envoyer d'email")
    monkeypatch.setattr(service_module, "send_prime_reminder_email", boom)

    preview = await prime_reminder_preview()
    assert preview["subject"]
    assert "<html" in preview["html"]
    assert preview["plain"]
    assert preview["total_count"] >= 1


# ── Route API ──────────────────────────────────────────────────────────────

import pytest_asyncio as _pytest_asyncio
from fastapi import FastAPI, Depends
from httpx import AsyncClient, ASGITransport
from app.auth import get_current_user
from app.api.prime_reminder import router


async def _api_client(db, reminder_config, current_user, monkeypatch, email_ok=True):
    sent = []
    async def fake_send(*args, **kwargs):
        sent.append(args)
        return email_ok
    monkeypatch.setattr(service_module, "send_prime_reminder_email", fake_send)

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, sent
    app.dependency_overrides.clear()


@_pytest_asyncio.fixture
async def api_client(db, reminder_config, monkeypatch):
    manager = await make_user("manager@test.mg")
    admin = await make_user("admin@test.mg", name="Admin", is_admin=True)
    await make_user("dg@test.mg", is_dg=True, is_admin=False)
    await _seed_ongoing(manager)
    async for c, sent in _api_client(db, reminder_config, admin, monkeypatch, email_ok=True):
        yield c, sent


async def test_api_config_get(api_client):
    client, _ = api_client
    resp = await client.get("/prime-reminder/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["days"] == [15, 20]
    assert data["hours"] == [8, 17]
    assert "dg@test.mg" in data["recipient"]


async def test_api_config_put(api_client):
    client, _ = api_client
    resp = await client.put("/prime-reminder/config", json={
        "enabled": False,
        "days": [10, 25],
        "hours": [9],
        "recipient": "override@x.mg",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["days"] == [10, 25]
    assert data["hours"] == [9]
    assert data["recipient_override"] == "override@x.mg"


async def test_api_send_manual(api_client):
    client, sent = api_client
    resp = await client.post("/prime-reminder/send")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "sent"
    assert len(sent) == 1
    assert data["execution"]["trigger_type"] == "MANUAL"


async def test_api_preview(api_client):
    client, _ = api_client
    resp = await client.get("/prime-reminder/preview")
    assert resp.status_code == 200
    assert "<html" in resp.json()["html"]


async def test_api_executions_list(api_client):
    client, _ = api_client
    await client.post("/prime-reminder/send")
    resp = await client.get("/prime-reminder/executions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "MANUAL"


async def test_api_requires_admin(db, reminder_config, monkeypatch):
    non_admin = await make_user("normal@x.mg", name="Normal", is_admin=False)
    async for c, _ in _api_client(db, reminder_config, non_admin, monkeypatch, email_ok=True):
        resp = await c.get("/prime-reminder/config")
        assert resp.status_code == 403
        resp = await c.post("/prime-reminder/send")
        assert resp.status_code == 403