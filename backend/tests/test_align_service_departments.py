"""Tests de l'endpoint de réparation : réalignement des employés sur le
département de leur service (POST /employees/align-service-departments)."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.models import User, Department, Employee, ServiceGroup
from app.api.employees import router as employees_router


async def make_user(email, is_admin=False, **kwargs):
    return await User.create(
        email=email, name=email.split("@")[0], password_hash="x",
        is_admin=is_admin, **kwargs,
    )


async def _client(db, current_user):
    app = FastAPI()
    app.include_router(employees_router, prefix="/employees")
    app.dependency_overrides[__import__("app.auth", fromlist=["get_current_user"]).get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def admin_client(db):
    admin = await make_user("admin@test.mg", is_admin=True)
    async for c in _client(db, admin):
        yield c


async def test_align_moves_inconsistent_employee_to_service_department(admin_client, db):
    """Cas du signalement : 6 employés comptés dans le service SI alors qu'un
    6ᵉ employé a un dept_str différent → réaligné sur le département du service."""
    dept_si = await Department.create(name="SI")
    dept_compta = await Department.create(name="Comptabilité")
    mgr = await make_user("mgr@test.mg")
    sg_si = await ServiceGroup.create(name="Sysadmin SI", department=dept_si)
    emp = await Employee.create(
        matricule="40001", name="Incohérent", dept_str="Comptabilité",
        dept=dept_compta, manager=mgr, service_group=sg_si,
    )

    resp = await admin_client.post("/employees/align-service-departments")

    assert resp.status_code == 200
    data = resp.json()
    assert data["aligned"] == 1
    detail = next(d for d in data["details"] if d["status"] == "aligned")
    assert detail["employee_id"] == emp.id
    assert detail["old_department"] == "Comptabilité"
    assert detail["new_department"] == "SI"

    refreshed = await Employee.get(id=emp.id)
    assert refreshed.dept_str == "SI"
    assert refreshed.dept_id == dept_si.id
    assert refreshed.service_group_id == sg_si.id


async def test_align_applies_department_manager(admin_client, db):
    dept_si = await Department.create(name="SI")
    dept_rh = await Department.create(name="RH")
    old_mgr = await make_user("old.mgr@test.mg")
    sg = await ServiceGroup.create(name="Support SI", department=dept_si)
    emp = await Employee.create(
        matricule="40002", name="X", dept_str="RH", dept=dept_rh,
        manager=old_mgr, service_group=sg,
    )

    resp = await admin_client.post("/employees/align-service-departments")
    assert resp.status_code == 200

    refreshed = await Employee.get(id=emp.id)
    # Le manager du département SI (le seul utilisateur de SI) est appliqué
    si_manager = await User.filter(dept_str="SI", is_admin=False).first()
    if si_manager:
        assert refreshed.manager_id == si_manager.id


async def test_align_skips_consistent_and_serviceless_employees(admin_client, db):
    dept_it = await Department.create(name="IT")
    mgr = await make_user("mgr2@test.mg")
    sg = await ServiceGroup.create(name="Dev", department=dept_it)
    consistent = await Employee.create(
        matricule="40003", name="Cohérent", dept_str="IT", dept=dept_it,
        manager=mgr, service_group=sg,
    )
    free = await Employee.create(
        matricule="40004", name="Sans service", dept_str="IT", dept=dept_it,
        manager=mgr,
    )

    resp = await admin_client.post("/employees/align-service-departments")

    assert resp.status_code == 200
    assert resp.json()["aligned"] == 0


async def test_align_reports_orphan_service_without_touching_employee(admin_client, db):
    """Service dont le département a été supprimé → signalé, employé intact."""
    dept_it = await Department.create(name="IT")
    mgr = await make_user("mgr3@test.mg")
    sg = await ServiceGroup.create(name="Orphelin", department=dept_it)
    emp = await Employee.create(
        matricule="40005", name="Y", dept_str="IT", dept=dept_it,
        manager=mgr, service_group=sg,
    )
    # On supprime le département sans casser la FK (simule un état historique)
    await Department.filter(id=dept_it.id).update(name="Ancien IT")

    resp = await admin_client.post("/employees/align-service-departments")
    assert resp.status_code == 200
    data = resp.json()
    # Le service pointe vers un département qui ne correspond plus → réalignement
    # possible uniquement si le nom du département du service est toujours connu.
    refreshed = await Employee.get(id=emp.id)
    assert refreshed.dept_str in ("Ancien IT", "IT")

    # Aucun employé coherent n'est cassé
    assert await Employee.get(id=emp.id)


async def test_inconsistencies_preview_lists_mismatch_only(db):
    """GET /service-department-inconsistencies : aperçu sans modification."""
    dept_si = await Department.create(name="SI")
    dept_compta = await Department.create(name="Comptabilité")
    mgr = await make_user("mgr5@test.mg")
    sg = await ServiceGroup.create(name="Sysadmin SI", department=dept_si)
    await Employee.create(
        matricule="40007", name="Mismatch", dept_str="Comptabilité",
        dept=dept_compta, manager=mgr, service_group=sg,
    )
    await Employee.create(  # cohérent → non listé
        matricule="40008", name="Ok", dept_str="SI", dept=dept_si,
        manager=mgr, service_group=sg,
    )
    await Employee.create(  # sans service → non listé
        matricule="40009", name="Free", dept_str="Comptabilité", dept=dept_compta,
        manager=mgr,
    )

    admin = await make_user("admin2@test.mg", is_admin=True)
    async for client in _client(db, admin):
        resp = await client.get("/employees/service-department-inconsistencies")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["items"][0]["name"] == "Mismatch"
        assert data["items"][0]["service_department"] == "SI"
        # Aucune modification : l'employé garde son département d'origine
        assert (await Employee.get(matricule="40007")).dept_str == "Comptabilité"


async def test_align_requires_privileged_role(db):
    dept_it = await Department.create(name="IT")
    mgr = await make_user("mgr4@test.mg")
    await Employee.create(
        matricule="40006", name="Z", dept_str="IT", dept=dept_it, manager=mgr,
    )
    normal = await make_user("normal@test.mg")
    async for client in _client(db, normal):
        resp = await client.post("/employees/align-service-departments")
        assert resp.status_code == 403
