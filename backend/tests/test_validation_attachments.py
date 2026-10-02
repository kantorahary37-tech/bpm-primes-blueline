"""Pièces jointes de validation (N+1 / N+2 → Directeur).

Un N+1 peut joindre un fichier facultatif au moment où il valide une prime :
le Directeur du département le retrouve dans la page « Pièces jointes » et le
télécharge. Un Directeur ne voit ni ne télécharge que les pièces de son propre
département.
"""

from datetime import datetime

import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api import attachments as attachments_module
from app.api import endpoints as endpoints_module
from app.api.attachments import router as attachments_router
from app.api.endpoints import router as bonuses_router
from app.auth import get_current_user
from app.models import (
    Bonus,
    BonusType,
    Department,
    Employee,
    ServiceGroup,
    User,
    UserServiceAssignment,
    ValidationAttachment,
    ValidationStatus,
)

DEPT_A = "Direction A"
DEPT_B = "Direction B"
ATTACHMENT = {"filename": "contrat.pdf", "original_name": "Contrat de travail.pdf", "size": 15}
FILE_CONTENT = b"%PDF-1.4 fake"


async def _make_user(email, name, **kwargs):
    return await User.create(email=email, name=name, password_hash="x", **kwargs)


async def _make_employee(manager, dept_str, matricule):
    dept = await Department.get_or_none(name=dept_str)
    if dept is None:
        dept = await Department.create(name=dept_str)
    return await Employee.create(
        matricule=matricule, name=f"Employe {matricule}", dept=dept, dept_str=dept_str,
        manager=manager,
    )


async def _make_bonus(employee, creator):
    return await Bonus.create(
        employee=employee,
        start_date=datetime(2026, 1, 1).date(),
        end_date=datetime(2026, 1, 31).date(),
        bonus_type=BonusType.MENSUEL,
        total_amount=150000,
        status=ValidationStatus.INITIALISE,
        created_by=creator,
    )


@pytest_asyncio.fixture
async def api(db, tmp_path, monkeypatch):
    """Client sur /bonuses + /validation-attachments, avec un dossier d'upload temporaire."""
    async def fake_email(*args, **kwargs):
        return True

    monkeypatch.setattr(endpoints_module, "send_bonus_notification_email", fake_email)
    monkeypatch.setattr(endpoints_module, "send_bonus_batch_notification_email", fake_email)
    # Le dossier d'upload est importé directement par chaque module : il faut le
    # rediriger des deux côtés.
    monkeypatch.setattr(endpoints_module, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(attachments_module, "UPLOAD_DIR", str(tmp_path))

    app = FastAPI()
    app.include_router(bonuses_router)
    app.include_router(attachments_router)
    state = {"user": None}
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as client:
        yield client, state, tmp_path
    app.dependency_overrides.clear()


async def _setup():
    """Deux départements et leur Directeur, un N+1 en Dept A, une prime par département."""
    n1 = await _make_user("n1@test.mg", "N1 Dept A", is_validator_n1=True, dept_str=DEPT_A)
    dir_a = await _make_user("dir.a@test.mg", "Directeur A", is_directeur=True, dept_str=DEPT_A)
    dir_b = await _make_user("dir.b@test.mg", "Directeur B", is_directeur=True, dept_str=DEPT_B)

    emp_a = await _make_employee(n1, DEPT_A, "A1")
    emp_b = await _make_employee(n1, DEPT_B, "B1")
    bonus_a = await _make_bonus(emp_a, n1)
    bonus_b = await _make_bonus(emp_b, n1)
    return {"n1": n1, "dir_a": dir_a, "dir_b": dir_b,
            "emp_a": emp_a, "emp_b": emp_b, "bonus_a": bonus_a, "bonus_b": bonus_b}


async def _validate_with_attachment(client, bonus_id, tmp_path, step="N1"):
    """Simule le téléversement (POST /upload) puis la validation avec la référence."""
    (tmp_path / ATTACHMENT["filename"]).write_bytes(FILE_CONTENT)
    return await client.post(
        f"/bonuses/{bonus_id}/validate?step={step}",
        json={"action": "VALIDER", "attachment": ATTACHMENT},
    )


# ── Dépôt ──────────────────────────────────────────────────────────────────

async def test_n1_validation_records_the_attachment(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]

    resp = await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "En attente Directeur"

    att = await ValidationAttachment.get(bonus_id=ctx["bonus_a"].id)
    assert att.stored_name == "contrat.pdf"
    assert att.original_name == "Contrat de travail.pdf"
    assert att.dept_str == DEPT_A
    assert att.uploaded_by_id == ctx["n1"].id


async def test_validation_without_attachment_creates_no_row(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]

    resp = await client.post(f"/bonuses/{ctx['bonus_a'].id}/validate?step=N1", json={"action": "VALIDER"})
    assert resp.status_code == 200, resp.text
    assert await ValidationAttachment.all().count() == 0


async def test_attachment_is_ignored_for_later_steps(api):
    """Une pièce jointe n'a de sens qu'aux étapes qui aboutissent au Directeur."""
    client, state, tmp_path = api
    ctx = await _setup()
    await _make_user("dg@test.mg", "DG", is_dg=True)
    bonus = await _make_bonus(ctx["emp_a"], ctx["n1"])
    bonus.status = ValidationStatus.EN_ATTENTE_DG
    await bonus.save()

    dg = await User.get(email="dg@test.mg")
    state["user"] = dg
    resp = await _validate_with_attachment(client, bonus.id, tmp_path, step="DG")
    assert resp.status_code == 200, resp.text
    assert await ValidationAttachment.all().count() == 0


# ── Étape N+2 (comme N+1) ───────────────────────────────────────────────────

async def _n2_setup():
    """Prime « En attente N+2 » assignée à un N+2, avec son département."""
    n2 = await _make_user("n2@test.mg", "N2 Dept A", is_validator_n2=True, dept_str=DEPT_A)
    dir_a = await _make_user("dir.a2@test.mg", "Directeur A", is_directeur=True, dept_str=DEPT_A)
    emp = await _make_employee(n2, DEPT_A, "N2EMP")
    bonus = await Bonus.create(
        employee=emp,
        start_date=datetime(2026, 1, 1).date(),
        end_date=datetime(2026, 1, 31).date(),
        bonus_type=BonusType.MENSUEL,
        total_amount=120000,
        status=ValidationStatus.EN_ATTENTE_N2,
        n2_user=n2,
        created_by=n2,
    )
    return {"n2": n2, "dir_a": dir_a, "emp": emp, "bonus": bonus}


async def test_n2_validation_records_the_attachment(api):
    client, state, tmp_path = api
    ctx = await _n2_setup()
    state["user"] = ctx["n2"]

    resp = await _validate_with_attachment(client, ctx["bonus"].id, tmp_path, step="N2")
    assert resp.status_code == 200, resp.text
    # La prime part bien vers le Directeur
    assert resp.json()["status"] == "En attente Directeur"

    att = await ValidationAttachment.get(bonus_id=ctx["bonus"].id)
    assert att.stored_name == "contrat.pdf"
    assert att.dept_str == DEPT_A
    assert att.uploaded_by_id == ctx["n2"].id

    state["user"] = ctx["dir_a"]
    items = (await client.get("/validation-attachments/")).json()
    assert len(items) == 1
    assert items[0]["step"] == "N2"
    assert items[0]["uploaded_by_name"] == "N2 Dept A"


async def test_n2_batch_validation_attaches_the_file(api):
    client, state, tmp_path = api
    ctx = await _n2_setup()
    second = await Bonus.create(
        employee=ctx["emp"],
        start_date=datetime(2026, 2, 1).date(),
        end_date=datetime(2026, 2, 28).date(),
        bonus_type=BonusType.MENSUEL,
        total_amount=130000,
        status=ValidationStatus.EN_ATTENTE_N2,
        n2_user=ctx["n2"],
        created_by=ctx["n2"],
    )
    (tmp_path / ATTACHMENT["filename"]).write_bytes(FILE_CONTENT)
    state["user"] = ctx["n2"]

    resp = await client.post("/bonuses/batch/validate", json={
        "bonus_ids": [ctx["bonus"].id, second.id],
        "action": "VALIDER",
        "step": "N2",
        "attachment": ATTACHMENT,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["total_success"] == 2
    assert await ValidationAttachment.all().count() == 2


async def test_n2_cannot_validate_a_bonus_assigned_to_someone_else(api):
    """Le contrôle de périmètre N+2 reste appliqué, pièce jointe ou non."""
    client, state, tmp_path = api
    ctx = await _n2_setup()
    other = await _make_user("other.n2@test.mg", "Autre N2", is_validator_n2=True, dept_str=DEPT_A)
    state["user"] = other

    resp = await _validate_with_attachment(client, ctx["bonus"].id, tmp_path, step="N2")
    assert resp.status_code == 403
    assert await ValidationAttachment.all().count() == 0


async def test_validation_refuses_an_attachment_that_was_never_uploaded(api):
    """Référence fantôme rejetée, et rien n'est écrit : ni pièce, ni changement de statut."""
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]

    resp = await client.post(
        f"/bonuses/{ctx['bonus_a'].id}/validate?step=N1",
        json={"action": "VALIDER", "attachment": ATTACHMENT},
    )
    assert resp.status_code == 400, resp.text
    assert await ValidationAttachment.all().count() == 0
    await ctx["bonus_a"].refresh_from_db()
    assert ctx["bonus_a"].status == ValidationStatus.INITIALISE


# ── Validation par lot (un seul fichier pour toute la sélection) ────────────

async def test_batch_validation_attaches_the_file_to_every_bonus(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    (tmp_path / ATTACHMENT["filename"]).write_bytes(FILE_CONTENT)

    resp = await client.post("/bonuses/batch/validate", json={
        "bonus_ids": [ctx["bonus_a"].id, ctx["bonus_b"].id],
        "action": "VALIDER",
        "step": "N1",
        "attachment": ATTACHMENT,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["total_success"] == 2

    # Le même fichier est référencé sur chacune des deux primes, chacune dans
    # le département de son employé.
    rows = await ValidationAttachment.all().order_by("bonus_id")
    assert len(rows) == 2
    assert {r.stored_name for r in rows} == {"contrat.pdf"}
    assert {r.dept_str for r in rows} == {DEPT_A, DEPT_B}

    for bonus_id in (ctx["bonus_a"].id, ctx["bonus_b"].id):
        bonus = await Bonus.get(id=bonus_id)
        assert bonus.status == ValidationStatus.EN_ATTENTE_DIRECTEUR


async def test_batch_without_attachment_creates_no_row(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]

    resp = await client.post("/bonuses/batch/validate", json={
        "bonus_ids": [ctx["bonus_a"].id],
        "action": "VALIDER",
        "step": "N1",
    })
    assert resp.status_code == 200, resp.text
    assert await ValidationAttachment.all().count() == 0


async def test_batch_refuses_an_attachment_that_was_never_uploaded(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]

    resp = await client.post("/bonuses/batch/validate", json={
        "bonus_ids": [ctx["bonus_a"].id],
        "action": "VALIDER",
        "step": "N1",
        "attachment": ATTACHMENT,
    })
    assert resp.status_code == 400, resp.text
    assert await ValidationAttachment.all().count() == 0
    await ctx["bonus_a"].refresh_from_db()
    assert ctx["bonus_a"].status == ValidationStatus.INITIALISE


# ── Consultation par le Directeur ───────────────────────────────────────────

async def test_directeur_sees_only_attachments_of_his_department(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    assert (await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)).status_code == 200
    assert (await _validate_with_attachment(client, ctx["bonus_b"].id, tmp_path)).status_code == 200

    state["user"] = ctx["dir_a"]
    resp = await client.get("/validation-attachments/")
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 1
    assert items[0]["department"] == DEPT_A
    assert items[0]["employee_matricule"] == "A1"
    assert items[0]["original_name"] == "Contrat de travail.pdf"
    assert items[0]["uploaded_by_name"] == "N1 Dept A"
    assert items[0]["step"] == "N1"
    assert items[0]["url"] == f"/api/v1/validation-attachments/{items[0]['id']}/download"

    state["user"] = ctx["dir_b"]
    resp = await client.get("/validation-attachments/")
    assert [i["department"] for i in resp.json()] == [DEPT_B]


async def test_download_is_restricted_to_the_department(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    att = await ValidationAttachment.get(bonus_id=ctx["bonus_a"].id)

    state["user"] = ctx["dir_a"]
    resp = await client.get(f"/validation-attachments/{att.id}/download")
    assert resp.status_code == 200, resp.text
    assert resp.content == FILE_CONTENT

    state["user"] = ctx["dir_b"]
    resp = await client.get(f"/validation-attachments/{att.id}/download")
    assert resp.status_code == 403


async def test_admin_sees_every_attachment_and_validators_cannot_list_them(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    await _validate_with_attachment(client, ctx["bonus_b"].id, tmp_path)

    admin = await _make_user("admin@test.mg", "Admin", is_admin=True)
    state["user"] = admin
    resp = await client.get("/validation-attachments/")
    assert len(resp.json()) == 2

    resp = await client.get("/validation-attachments/", params={"department": DEPT_B})
    assert [i["department"] for i in resp.json()] == [DEPT_B]

    state["user"] = ctx["n1"]
    resp = await client.get("/validation-attachments/")
    assert resp.status_code == 403


async def test_search_by_employee_name_or_file(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    await _validate_with_attachment(client, ctx["bonus_b"].id, tmp_path)

    admin = await _make_user("admin2@test.mg", "Admin 2", is_admin=True)
    state["user"] = admin

    resp = await client.get("/validation-attachments/", params={"search": "B1"})
    assert [i["employee_matricule"] for i in resp.json()] == ["B1"]

    resp = await client.get("/validation-attachments/", params={"search": "Employe A"})
    assert [i["employee_matricule"] for i in resp.json()] == ["A1"]

    resp = await client.get("/validation-attachments/", params={"search": "Contrat"})
    assert len(resp.json()) == 2


# ── Service du déposant ─────────────────────────────────────────────────────

async def test_service_of_the_sender_is_reported(api):
    """Le service de l'envoyeur = services gérés + services affectés (page Utilisateurs)."""
    client, state, tmp_path = api
    ctx = await _setup()
    dept = await Department.get(name=DEPT_A)
    await ServiceGroup.create(name="Team IT", department=dept)
    await ctx["n1"].service_groups.add(await ServiceGroup.get(name="Team IT"))

    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)

    state["user"] = ctx["dir_a"]
    items = (await client.get("/validation-attachments/")).json()
    assert items[0]["uploaded_by_service"] == "Team IT"


async def test_sender_without_service_reports_none(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)

    state["user"] = ctx["dir_a"]
    items = (await client.get("/validation-attachments/")).json()
    assert items[0]["uploaded_by_service"] == ""


# ── Filtres : service et date ───────────────────────────────────────────────

async def _dept_and_directeur(dept_str):
    dept = await Department.get_or_none(name=dept_str)
    if dept is None:
        dept = await Department.create(name=dept_str)
    directeur = await _make_user(
        f"dir.{dept_str.lower().replace(' ', '.')}@test.mg", f"Directeur {dept_str}",
        is_directeur=True, dept_str=dept_str,
    )
    return dept, directeur


async def _n1_with_service(email, dept, service_name):
    """N+1 rattaché à un service qu'il gère (page Services)."""
    group = await ServiceGroup.create(name=service_name, department=dept)
    user = await _make_user(email, f"N1 {service_name}", is_validator_n1=True,
                            dept_str=dept.name)
    await user.service_groups.add(group)
    return user


async def test_filter_by_sender_service(api):
    client, state, tmp_path = api
    dept_a, dir_a = await _dept_and_directeur(DEPT_A)
    it = await _n1_with_service("it@test.mg", dept_a, "Team IT")
    compta = await _n1_with_service("compta@test.mg", dept_a, "Comptabilité")

    for index, n1 in enumerate((it, compta), start=1):
        emp = await _make_employee(n1, DEPT_A, f"F{index}")
        bonus = await _make_bonus(emp, n1)
        state["user"] = n1
        assert (await _validate_with_attachment(client, bonus.id, tmp_path)).status_code == 200

    state["user"] = dir_a
    resp = await client.get("/validation-attachments/")
    assert len(resp.json()) == 2

    resp = await client.get("/validation-attachments/", params={"service": "Team IT"})
    items = resp.json()
    assert len(items) == 1
    assert items[0]["uploaded_by_service"] == "Team IT"

    resp = await client.get("/validation-attachments/", params={"service": "Comptabilité"})
    assert [i["uploaded_by_service"] for i in resp.json()] == ["Comptabilité"]

    resp = await client.get("/validation-attachments/", params={"service": "Inconnu"})
    assert resp.json() == []


async def test_filter_by_sender_service_via_assignment(api):
    """Un service affecté depuis la page Utilisateurs compte aussi."""
    client, state, tmp_path = api
    dept_a, dir_a = await _dept_and_directeur(DEPT_A)
    group = await ServiceGroup.create(name="Support RH", department=dept_a)
    n1 = await _make_user("rh@test.mg", "N1 RH", is_validator_n1=True, dept_str=DEPT_A)
    await UserServiceAssignment.create(user=n1, service_group=group)

    emp = await _make_employee(n1, DEPT_A, "S1")
    bonus = await _make_bonus(emp, n1)
    state["user"] = n1
    assert (await _validate_with_attachment(client, bonus.id, tmp_path)).status_code == 200

    state["user"] = dir_a
    items = (await client.get("/validation-attachments/")).json()
    assert items[0]["uploaded_by_service"] == "Support RH"
    resp = await client.get("/validation-attachments/", params={"service": "Support RH"})
    assert len(resp.json()) == 1


async def test_services_endpoint_lists_sender_services(api):
    client, state, tmp_path = api
    dept_a, dir_a = await _dept_and_directeur(DEPT_A)
    n1 = await _n1_with_service("it2@test.mg", dept_a, "Team IT")
    # Service sans porteur de pièce : il ne doit pas alimenter le filtre
    await ServiceGroup.create(name="Sans porteur", department=dept_a)

    emp = await _make_employee(n1, DEPT_A, "F9")
    bonus = await _make_bonus(emp, n1)
    state["user"] = n1
    await _validate_with_attachment(client, bonus.id, tmp_path)

    state["user"] = dir_a
    resp = await client.get("/validation-attachments/services")
    assert resp.status_code == 200
    assert resp.json() == ["Team IT"]


async def test_services_endpoint_is_scoped_to_the_directeur_department(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)

    state["user"] = ctx["dir_b"]
    resp = await client.get("/validation-attachments/services")
    assert resp.status_code == 200
    assert resp.json() == []  # aucune pièce dans le département B


async def test_filter_by_month_and_year(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)

    now = datetime.now()
    state["user"] = ctx["dir_a"]

    resp = await client.get("/validation-attachments/",
                            params={"year": now.year, "month": now.month})
    assert len(resp.json()) == 1

    other_month = 1 if now.month != 1 else 2
    resp = await client.get("/validation-attachments/",
                            params={"year": now.year, "month": other_month})
    assert resp.json() == []

    resp = await client.get("/validation-attachments/", params={"year": now.year - 1})
    assert resp.json() == []


async def test_month_filter_handles_december(api):
    """Le mois de décembre bascule sur l'année suivante."""
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)

    now = datetime.now()
    state["user"] = ctx["dir_a"]
    resp = await client.get("/validation-attachments/", params={"year": now.year, "month": 12})
    if now.month == 12:
        assert len(resp.json()) == 1
    else:
        assert resp.json() == []


# ── Suppression par le Directeur ────────────────────────────────────────────

async def test_directeur_deletes_an_attachment_of_his_department(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    att = await ValidationAttachment.get(bonus_id=ctx["bonus_a"].id)

    state["user"] = ctx["dir_a"]
    resp = await client.delete(f"/validation-attachments/{att.id}")
    assert resp.status_code == 200, resp.text
    assert await ValidationAttachment.all().count() == 0
    # Le fichier n'est plus référencé : il est retiré du dossier d'upload
    assert not (tmp_path / "contrat.pdf").exists()


async def test_directeur_cannot_delete_an_attachment_of_another_department(api):
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    att = await ValidationAttachment.get(bonus_id=ctx["bonus_a"].id)

    state["user"] = ctx["dir_b"]
    resp = await client.delete(f"/validation-attachments/{att.id}")
    assert resp.status_code == 403
    assert await ValidationAttachment.all().count() == 1
    assert (tmp_path / "contrat.pdf").exists()


async def test_deleting_one_bonus_attachment_keeps_the_shared_file(api):
    """Pièce jointe de lot : le fichier reste sur le disque tant qu'une autre prime le référence."""
    client, state, tmp_path = api
    ctx = await _setup()
    state["user"] = ctx["n1"]
    await _validate_with_attachment(client, ctx["bonus_a"].id, tmp_path)
    await _validate_with_attachment(client, ctx["bonus_b"].id, tmp_path)
    assert (tmp_path / "contrat.pdf").exists()

    rows = await ValidationAttachment.filter(stored_name="contrat.pdf").order_by("bonus_id")
    assert len(rows) == 2

    state["user"] = ctx["dir_a"]
    assert (await client.delete(f"/validation-attachments/{rows[0].id}")).status_code == 200
    assert (tmp_path / "contrat.pdf").exists()

    state["user"] = ctx["dir_b"]
    assert (await client.delete(f"/validation-attachments/{rows[1].id}")).status_code == 200
    assert not (tmp_path / "contrat.pdf").exists()