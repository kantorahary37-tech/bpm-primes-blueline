"""Tests d'autorisation : synchronisation LDAP (Admin seul).

La création manuelle d'employé est supprimée : les employés sont créés
uniquement via LDAP (POST /admin/ldap-employees, Admin seul)."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.models import User, Department
from app.api.admin import router as admin_router
from app.api.employees import router as employees_router


async def make_user(email, is_admin=False, is_directeur=False, **kwargs):
    return await User.create(
        email=email, name=email.split("@")[0], password_hash="x",
        is_admin=is_admin, is_directeur=is_directeur, **kwargs
    )


async def _client(db, current_user):
    from tortoise.exceptions import IntegrityError
    from fastapi.responses import JSONResponse

    app = FastAPI()
    app.include_router(admin_router, prefix="/admin")
    app.include_router(employees_router, prefix="/employees")

    # Même gestionnaire que main.py : violation d'unicité → 409
    @app.exception_handler(IntegrityError)
    async def integrity_handler(request, exc):
        return JSONResponse(status_code=409, content={"detail": "Conflit : cet enregistrement existe déjà."})

    app.dependency_overrides[__import__("app.auth", fromlist=["get_current_user"]).get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def admin_client(db, monkeypatch):
    # Ne jamais toucher au vrai LDAP pendant les tests
    async def fake_fetch():
        return []
    monkeypatch.setattr("app.ldap_sync_service.fetch_all_ldap_users", fake_fetch)
    admin = await make_user("admin@test.mg", is_admin=True)
    async for c in _client(db, admin):
        yield c


@pytest.fixture
async def directeur_client(db, monkeypatch):
    async def fake_fetch():
        return []
    monkeypatch.setattr("app.ldap_sync_service.fetch_all_ldap_users", fake_fetch)
    user = await make_user("dir@test.mg", is_directeur=True)
    async for c in _client(db, user):
        yield c


@pytest.fixture
async def normal_client(db):
    user = await make_user("normal@test.mg")
    async for c in _client(db, user):
        yield c


# ── Synchronisation LDAP : ADMIN seul ─────────────────────────────────────

async def test_ldap_sync_admin_allowed(admin_client):
    resp = await admin_client.post("/admin/ldap-sync")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["ldap_found"] == 0


async def test_ldap_sync_directeur_forbidden(directeur_client):
    resp = await directeur_client.post("/admin/ldap-sync")
    assert resp.status_code == 403


async def test_ldap_sync_normal_forbidden(normal_client):
    resp = await normal_client.post("/admin/ldap-sync")
    assert resp.status_code == 403


async def test_ldap_sync_employees_directeur_forbidden(directeur_client):
    resp = await directeur_client.post("/admin/ldap-sync-employees")
    assert resp.status_code == 403


# ── Ajout manuel d'employé : supprimé (création via LDAP uniquement) ─────

async def test_manual_employee_creation_removed(admin_client, directeur_client, normal_client):
    """POST /employees n'existe plus : les employés sont créés uniquement
    depuis LDAP (POST /admin/ldap-employees, réservé aux administrateurs)."""
    for client in (admin_client, directeur_client, normal_client):
        resp = await client.post("/employees/", json={
            "matricule": "20999", "name": "X", "department": "IT", "manager_id": 1,
        })
        # Aucune route POST / → 405, quel que soit le rôle
        assert resp.status_code == 405
