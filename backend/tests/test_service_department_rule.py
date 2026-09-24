"""Tests de la règle service ↔ département :

Un employé affecté à un service appartient au département de ce service :
  - impossible de le déplacer vers un autre département tant qu'il est dans
    le service (il est conservé dans son service, jamais détaché) ;
  - s'il était incohérent (dept ≠ département du service), le déplacement le
    rattache au département de son service (réparation automatique).
"""

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


async def make_employee(matricule, dept_str, dept, manager, name="Employé", **kwargs):
    return await Employee.create(
        matricule=matricule, name=name, dept_str=dept_str, dept=dept,
        manager=manager, **kwargs,
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


async def test_employee_without_service_moves_normally(admin_client, db):
    admin = await make_user("admin2@test.mg", is_admin=True)
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr@test.mg")
    emp = await make_employee("30001", "IT", dept_it, mgr)

    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [emp.id], "target_department": "RH",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["moved"] == 1
    assert data["kept_in_service"] == 0
    refreshed = await Employee.get(id=emp.id)
    assert refreshed.dept_str == "RH"


async def test_employee_in_target_service_moves_and_keeps_service(admin_client, db):
    """Service du département cible → déplacement OK, service conservé."""
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr2@test.mg")
    sg_it = await ServiceGroup.create(name="Dev IT", department=dept_it)
    sg_rh = await ServiceGroup.create(name="Support RH", department=dept_rh)
    emp = await make_employee("30002", "IT", dept_it, mgr, service_group=sg_it)

    # Déplacer vers RH ? Non : le service est dans IT. Déplacer vers IT : no-op OK.
    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [emp.id], "target_department": "IT",
    })
    assert resp.status_code == 200
    refreshed = await Employee.get(id=emp.id)
    assert refreshed.service_group_id == sg_it.id

    # Cas « déplacement » réel : l'employé rejoint le service du département cible
    emp2 = await make_employee("30003", "IT", dept_it, mgr, service_group=sg_rh)
    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [emp2.id], "target_department": "RH",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["moved"] == 1
    assert data["kept_in_service"] == 0
    refreshed = await Employee.get(id=emp2.id)
    assert refreshed.dept_str == "RH"
    assert refreshed.service_group_id == sg_rh.id  # service conservé


async def test_employee_in_other_department_service_is_kept_not_moved(admin_client, db):
    """Service d'un autre département → PAS de déplacement, employé conservé
    dans son service et rattaché au département de ce service."""
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr3@test.mg")
    sg_it = await ServiceGroup.create(name="Dev IT", department=dept_it)
    emp = await make_employee("30004", "IT", dept_it, mgr, service_group=sg_it)

    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [emp.id], "target_department": "RH",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["moved"] == 0
    assert data["kept_in_service"] == 1
    assert data["kept_details"][0]["service"] == "Dev IT"
    assert data["kept_details"][0]["service_department"] == "IT"

    refreshed = await Employee.get(id=emp.id)
    # Pas de changement de département
    assert refreshed.dept_str == "IT"
    # Service conservé (jamais détaché)
    assert refreshed.service_group_id == sg_it.id
    # Manager inchangé (pas de réparation nécessaire, données cohérentes)
    assert refreshed.manager_id == mgr.id


async def test_inconsistent_employee_snapped_back_to_service_department(admin_client, db):
    """Employé incohérent (dept=RH alors que son service est dans IT) :
    le déplacement le rattache au département de son service."""
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr4@test.mg")
    sg_it = await ServiceGroup.create(name="Dev IT", department=dept_it)
    emp = await make_employee("30005", "RH", dept_rh, mgr, service_group=sg_it)  # incohérent

    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [emp.id], "target_department": "RH",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["moved"] == 0
    assert data["kept_in_service"] == 1

    refreshed = await Employee.get(id=emp.id)
    # Rattaché au département de son service (réparation)
    assert refreshed.dept_str == "IT"
    assert refreshed.dept_id == dept_it.id
    # Service conservé
    assert refreshed.service_group_id == sg_it.id


async def test_batch_move_mixed_outcome(admin_client, db):
    """Déplacement en lot : les employés sans service bougent, ceux avec un
    service d'un autre département restent en place."""
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr5@test.mg")
    sg_it = await ServiceGroup.create(name="Dev IT", department=dept_it)

    free_emp = await make_employee("30006", "IT", dept_it, mgr, name="Libre")
    pinned_emp = await make_employee("30007", "IT", dept_it, mgr, name="Pinned", service_group=sg_it)

    resp = await admin_client.post("/employees/move-department", json={
        "employee_ids": [free_emp.id, pinned_emp.id], "target_department": "RH",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["moved"] == 1
    assert data["kept_in_service"] == 1

    free = await Employee.get(id=free_emp.id)
    assert free.dept_str == "RH"
    pinned = await Employee.get(id=pinned_emp.id)
    assert pinned.dept_str == "IT"
    assert pinned.service_group_id == sg_it.id


async def test_move_department_requires_privileged_role(db):
    dept_it = await Department.create(name="IT")
    dept_rh = await Department.create(name="RH")
    mgr = await make_user("mgr6@test.mg")
    emp = await make_employee("30008", "IT", dept_it, mgr)

    normal = await make_user("normal@test.mg")
    async for client in _client(db, normal):
        resp = await client.post("/employees/move-department", json={
            "employee_ids": [emp.id], "target_department": "RH",
        })
        assert resp.status_code == 403
