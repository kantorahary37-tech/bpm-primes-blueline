"""
Administration des départements : création, renommage, suppression.

Ces tests verrouillent surtout les garde-fous d'intégrité : le nom d'un
département est recopié dans `Employee.dept_str`, `User.dept_str` et
`PrimeMax.dept_str`. Un renommage qui ne les synchronise pas ferait
disparaître les employés, les utilisateurs et les plafonds du département.
"""
import pytest

from app.models import Department, Employee, User, PrimeMax, ServiceGroup
from app.schemas import DepartmentCreate, DepartmentUpdate
from app.api.departments import (
    list_departments,
    create_department,
    rename_department,
    delete_department,
    RESERVED_NAME,
)
from app.api.admin import require_admin


async def make_admin(email="admin@test.mg"):
    return await User.create(email=email, name="Admin", is_admin=True)


async def make_employee(dept, dept_str=None, matricule="M1"):
    mgr = await User.create(email=f"mgr_{matricule.lower()}@test.mg", name="Mgr")
    return await Employee.create(
        matricule=matricule,
        name="Employe",
        dept_str=dept_str if dept_str is not None else dept.name,
        dept=dept,
        manager=mgr,
    )


# ── Création ───────────────────────────────────────────────────────────────

async def test_create_department(db):
    admin = await make_admin()
    res = await create_department(DepartmentCreate(name="  Direction Commerciale "), admin)
    assert res["name"] == "Direction Commerciale", "le nom doit être trimé"
    assert res["employee_count"] == 0
    assert await Department.get_or_none(name="Direction Commerciale")


async def test_create_rejects_blank_and_reserved(db):
    admin = await make_admin()
    for name in ["", "   ", RESERVED_NAME, "inconnu"]:
        with pytest.raises(Exception) as exc:
            await create_department(DepartmentCreate(name=name), admin)
        assert exc.value.status_code == 400, name


async def test_create_rejects_duplicate_ignoring_case(db):
    admin = await make_admin()
    await create_department(DepartmentCreate(name="RH"), admin)
    with pytest.raises(Exception) as exc:
        await create_department(DepartmentCreate(name="rh"), admin)
    assert exc.value.status_code == 409
    assert await Department.filter(name__iexact="rh").count() == 1


async def test_create_rejects_too_long_name(db):
    admin = await make_admin()
    with pytest.raises(Exception) as exc:
        await create_department(DepartmentCreate(name="X" * 51), admin)
    assert exc.value.status_code == 400


async def test_only_admin_can_manage_departments(db):
    """Le garde d'accès réel des routes (require_admin)."""
    admin = await make_admin()
    assert await require_admin(admin) is admin

    simple = await User.create(email="n1@test.mg", name="N1", is_validator_n1=True)
    dg = await User.create(email="dg@test.mg", name="DG", is_dg=True)
    for user in (simple, dg):
        with pytest.raises(Exception) as exc:
            await require_admin(user)
        assert exc.value.status_code == 403


# ── Liste ──────────────────────────────────────────────────────────────────

async def test_list_excludes_reserved_and_counts_employees(db):
    admin = await make_admin()
    await Department.create(name=RESERVED_NAME)
    rh = await Department.create(name="RH")
    await Department.create(name="Comptabilité")
    await make_employee(rh, matricule="M1")
    await make_employee(rh, matricule="M2")
    await make_employee(rh, matricule="M3")

    rows = await list_departments()
    names = [r["name"] for r in rows]
    assert RESERVED_NAME not in names, "le département technique doit rester masqué"
    assert names == sorted(names), "la liste doit être triée par nom"
    counts = {r["name"]: r["employee_count"] for r in rows}
    assert counts["RH"] == 3
    assert counts["Comptabilité"] == 0


# ── Renommage : synchronisation des copies dénormalisées ───────────────────

async def test_rename_syncs_employee_user_and_primemax(db):
    from app.models import BonusType

    admin = await make_admin()
    old = await Department.create(name="Ventes")
    emp = await make_employee(old, matricule="M1")
    user = await User.create(email="dir@test.mg", name="Dir", dept_str="Ventes", dept=old)
    plafond = await PrimeMax.create(
        dept=old, dept_str="Ventes", bonus_type=BonusType.ASTREINTE, amount=500000
    )

    res = await rename_department(old.id, DepartmentUpdate(name="Ventes Export"), admin)
    assert res["name"] == "Ventes Export"

    # relecture plutôt que refresh_from_db() : les modèles exposent une
    # propriété `department` en lecture seule, incompatible avec refresh_from_db.
    emp2 = await Employee.get(id=emp.id)
    user2 = await User.get(id=user.id)
    plafond2 = await PrimeMax.get(id=plafond.id)
    assert emp2.dept_str == "Ventes Export", "employé non resynchronisé"
    assert user2.dept_str == "Ventes Export", "utilisateur non resynchronisé"
    assert plafond2.dept_str == "Ventes Export", "plafond non resynchronisé"


async def test_rename_keeps_employee_count(db):
    admin = await make_admin()
    dept = await Department.create(name="Marketing")
    await make_employee(dept, matricule="M1")
    await make_employee(dept, matricule="M2")
    res = await rename_department(dept.id, DepartmentUpdate(name="Marketing 2"), admin)
    assert res["employee_count"] == 2


async def test_rename_same_name_is_noop(db):
    admin = await make_admin()
    dept = await Department.create(name="RH")
    res = await rename_department(dept.id, DepartmentUpdate(name="RH"), admin)
    assert res["name"] == "RH"


async def test_rename_rejects_duplicate_and_reserved_and_unknown(db):
    admin = await make_admin()
    a = await Department.create(name="Alpha")
    b = await Department.create(name="Beta")
    reserved = await Department.create(name=RESERVED_NAME)

    with pytest.raises(Exception) as exc:
        await rename_department(a.id, DepartmentUpdate(name="beta"), admin)
    assert exc.value.status_code == 409

    with pytest.raises(Exception) as exc:
        await rename_department(b.id, DepartmentUpdate(name=RESERVED_NAME), admin)
    assert exc.value.status_code == 400

    with pytest.raises(Exception) as exc:
        await rename_department(reserved.id, DepartmentUpdate(name="Autre"), admin)
    assert exc.value.status_code == 400

    with pytest.raises(Exception) as exc:
        await rename_department(99999, DepartmentUpdate(name="Ghost"), admin)
    assert exc.value.status_code == 404


# ── Suppression ────────────────────────────────────────────────────────────

async def test_delete_blocked_when_employees_linked(db):
    admin = await make_admin()
    dept = await Department.create(name="Ventes")
    await make_employee(dept, matricule="M1")
    with pytest.raises(Exception) as exc:
        await delete_department(dept.id, admin)
    assert exc.value.status_code == 400
    assert "employé" in exc.value.detail
    assert await Department.get_or_none(id=dept.id), "le département ne doit pas être supprimé"


async def test_delete_blocked_when_primemax_linked(db):
    admin = await make_admin()
    from app.models import BonusType

    dept = await Department.create(name="Plafonds")
    await PrimeMax.create(
        dept=dept, dept_str="Plafonds", bonus_type=BonusType.ASTREINTE, amount=1000
    )
    with pytest.raises(Exception) as exc:
        await delete_department(dept.id, admin)
    assert exc.value.status_code == 400
    assert "plafond" in exc.value.detail


async def test_delete_blocked_when_service_or_user_linked(db):
    admin = await make_admin()
    dept = await Department.create(name="Services")
    await ServiceGroup.create(name="SG Test", department=dept)
    with pytest.raises(Exception) as exc:
        await delete_department(dept.id, admin)
    assert exc.value.status_code == 400
    assert "service" in exc.value.detail

    dept2 = await Department.create(name="Avec users")
    await User.create(email="u@test.mg", name="U", dept_str="Avec users", dept=dept2)
    with pytest.raises(Exception) as exc:
        await delete_department(dept2.id, admin)
    assert exc.value.status_code == 400
    assert "utilisateur" in exc.value.detail


async def test_delete_empty_department_succeeds(db):
    admin = await make_admin()
    dept = await Department.create(name="Temporaire")
    result = await delete_department(dept.id, admin)
    assert "Temporaire" in result["message"]
    assert await Department.get_or_none(id=dept.id) is None


async def test_delete_reserved_and_unknown(db):
    admin = await make_admin()
    reserved = await Department.create(name=RESERVED_NAME)
    with pytest.raises(Exception) as exc:
        await delete_department(reserved.id, admin)
    assert exc.value.status_code == 400

    with pytest.raises(Exception) as exc:
        await delete_department(99999, admin)
    assert exc.value.status_code == 404