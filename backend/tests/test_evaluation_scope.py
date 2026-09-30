"""Périmètre d'édition des critères d'évaluation (page Évaluation).

Régression : un N+1/N+2 avec services affectés doit pouvoir supprimer et
modifier les critères des employés de ses services (y compris lorsqu'un ID
d'employé géré coincide avec un ID d'utilisateur), et la liste de
/evaluation-templates/all ne doit contenir que son périmètre réel — chaque
employé affiché doit être éditable.
"""

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.models import (
    Department,
    Employee,
    EvaluationTemplate,
    ServiceGroup,
    User,
    UserServiceAssignment,
)
from app.api.evaluation_templates import router as evaluation_router
from app.auth import get_current_user
from app.permissions import apply_employee_scope, employee_scope


async def _client(db, current_user):
    app = FastAPI()
    app.include_router(evaluation_router)
    app.dependency_overrides[get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _make_user(email, **kwargs):
    return await User.create(email=email, name=email.split("@")[0], password_hash="x", **kwargs)


async def _make_employee(matricule, dept, manager, **kwargs):
    return await Employee.create(
        matricule=matricule, name=matricule, dept=dept, dept_str=dept.name,
        manager=manager, **kwargs,
    )


async def _n1_with_service(dept, group, n1_dept_str):
    """N+1 affecté à ``group``.

    - ``in_group`` : employé du service affecté, géré par un tiers ;
    - ``managed``  : employé géré par le N+1 (sans service) ;
    - ``decoy``    : employé géré par un AUTRE utilisateur dont l'ID est
      identique à celui de ``managed`` (les IDs des tables ``employee`` et
      ``user`` se recoupent : c'est la collision qui faisait remonter de faux
      employés, non éditables, dans la liste du N+1).
    """
    other_manager = await _make_user("other.manager@test.mg")
    n1 = await _make_user("n1@test.mg", is_validator_n1=True, dept_str=n1_dept_str)

    # Employé géré créé en premier : son ID vaut 1, tout comme celui de
    # ``other_manager``.
    managed = await _make_employee("N1M", dept, n1)
    assert managed.id == other_manager.id

    in_group = await _make_employee("N1G", dept, other_manager, service_group=group)
    decoy = await _make_employee("N1D", dept, other_manager)

    await UserServiceAssignment.create(user=n1, service_group=group)
    return {"n1": n1, "other": other_manager, "managed": managed,
            "in_group": in_group, "decoy": decoy}


async def test_scope_lists_only_managed_and_service_group(db):
    dept = await Department.create(name="Operations")
    group = await ServiceGroup.create(name="Tech", department=dept)

    ctx = await _n1_with_service(dept, group, "Operations")
    n1, managed, in_group, decoy = ctx["n1"], ctx["managed"], ctx["in_group"], ctx["decoy"]

    sids, _, managed_ids = await employee_scope(n1)
    assert sids == [group.id]
    assert managed_ids == {managed.id}

    listed = await apply_employee_scope(
        Employee.filter(is_active=True, is_archived=False), (sids, None, managed_ids)
    )
    assert {e.id for e in listed} == {managed.id, in_group.id}
    assert decoy.id not in {e.id for e in listed}


async def test_n1_can_edit_criteria_of_his_service_group(db):
    dept = await Department.create(name="Operations")
    group = await ServiceGroup.create(name="Tech", department=dept)

    ctx = await _n1_with_service(dept, group, "Operations")
    n1, managed, in_group, other = ctx["n1"], ctx["managed"], ctx["in_group"], ctx["other"]

    tpl = await EvaluationTemplate.create(
        employee=in_group, section="quantitative", criteria_name="Qualite", coeff=2, sort_order=0
    )
    managed_tpl = await EvaluationTemplate.create(
        employee=managed, section="quantitative", criteria_name="Delai", coeff=2, sort_order=0
    )

    async for client in _client(db, n1):
        # La liste ne contient que le périmètre réel du N+1
        resp = await client.get("/evaluation-templates/all")
        assert resp.status_code == 200, resp.text
        assert {e["employee_id"] for e in resp.json()} == {managed.id, in_group.id}

        # Suppression d'un critère d'un employé du service
        resp = await client.delete(f"/evaluation-templates/{tpl.id}")
        assert resp.status_code == 200, resp.text

        # Sauvegarde (mise à jour) pour un employé du service
        resp = await client.post("/evaluation-templates", json={
            "employee_id": in_group.id,
            "quantitative": [{"criteria_name": "Qualite", "coeff": 4, "sort_order": 0}],
            "qualitative": [{"criteria_name": "Assiduite", "coeff": 6, "sort_order": 0}],
        })
        assert resp.status_code == 200, resp.text

        # Suppression pour un employé géré
        resp = await client.delete(f"/evaluation-templates/{managed_tpl.id}")
        assert resp.status_code == 200, resp.text

        # Un employé hors périmètre reste refusé
        outsider = await _make_employee("N1X", dept, other)
        resp = await client.post("/evaluation-templates", json={
            "employee_id": outsider.id,
            "quantitative": [{"criteria_name": "Qualite", "coeff": 10, "sort_order": 0}],
            "qualitative": [],
        })
        assert resp.status_code == 403, resp.text


async def test_n1_can_edit_criteria_across_department(db):
    """Un service affecté peut relever d'une autre direction : le périmètre
    d'édition suit le service, comme la liste et l'application par service."""
    dept_ops = await Department.create(name="Operations")
    dept_com = await Department.create(name="Commercial")
    group_com = await ServiceGroup.create(name="Ventes", department=dept_com)

    n1 = await _make_user("n1.cross@test.mg", is_validator_n1=True, dept_str="Operations")
    other = await _make_user("other2@test.mg")
    in_group = await _make_employee("N1C", dept_com, other, service_group=group_com)
    await UserServiceAssignment.create(user=n1, service_group=group_com)

    tpl = await EvaluationTemplate.create(
        employee=in_group, section="qualitative", criteria_name="Initiative", coeff=2, sort_order=0
    )

    async for client in _client(db, n1):
        resp = await client.get("/evaluation-templates/all")
        assert resp.status_code == 200, resp.text
        assert [e["employee_id"] for e in resp.json()] == [in_group.id]

        resp = await client.delete(f"/evaluation-templates/{tpl.id}")
        assert resp.status_code == 200, resp.text
