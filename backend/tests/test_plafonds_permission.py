"""Permission « Autoriser à modifier les plafonds » (User.can_modify_plafonds).

Un utilisateur coché dans la page Utilisateurs doit pouvoir gérer les plafonds
ET les taux spéciaux de tous les départements, sans rôle admin/DG/DRH et quel
que soit son département. Les autres utilisateurs conservent un accès limité à
leur département.

Régressions couvertes :
- ``/primemax`` ignorait le drapeau (lecture/écriture restreintes à son dept.) ;
- la création d'un plafond ne renseignait pas la FK ``department_id`` ;
- les accès par id lisaient un attribut ``department_id`` inexistant (500) ;
- un taux spécial d'un employé hors périmètre était refusé.
"""

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api.admin import router as admin_router
from app.api.employees import router as employees_router
from app.api.prime_max import router as primemax_router
from app.auth import get_current_user
from app.models import Department, Employee, PrimeMax, User


async def _client(db, current_user):
    app = FastAPI()
    app.include_router(primemax_router, prefix="/primemax")
    app.include_router(employees_router, prefix="/employees")
    app.include_router(admin_router, prefix="/admin")
    app.dependency_overrides[get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test",
                           follow_redirects=True) as ac:
        yield ac
    app.dependency_overrides.clear()


async def _setup():
    dept_a = await Department.create(name="Dept A")
    dept_b = await Department.create(name="Dept B")

    joel = await User.create(email="joel@test.mg", name="Joel", password_hash="x",
                             dept=dept_a, dept_str="Dept A", can_modify_plafonds=True)
    paul = await User.create(email="paul@test.mg", name="Paul", password_hash="x",
                             dept=dept_b, dept_str="Dept B")

    plafond_a = await PrimeMax.create(dept_str="Dept A", dept=dept_a,
                                      bonus_type="mensuel", amount=100)
    plafond_b = await PrimeMax.create(dept_str="Dept B", dept=dept_b,
                                      bonus_type="astreinte", amount=200)
    employe_b = await Employee.create(matricule="B1", name="Employe B", dept=dept_b,
                                      dept_str="Dept B", manager=paul)
    return {"dept_a": dept_a, "dept_b": dept_b, "joel": joel, "paul": paul,
            "plafond_a": plafond_a, "plafond_b": plafond_b, "employe_b": employe_b}


async def test_voit_et_modifie_les_plafonds_de_tous_les_departements(db):
    ctx = await _setup()
    async for ac in _client(db, ctx["joel"]):
        r = await ac.get("/primemax/")
        assert r.status_code == 200
        assert {p["id"] for p in r.json()} == {ctx["plafond_a"].id, ctx["plafond_b"].id}

        # Modification d'un plafond d'un autre département
        r = await ac.put(f"/primemax/{ctx['plafond_b'].id}",
                         json={"department": "Dept B", "bonus_type": "astreinte",
                               "currency": "Ar", "amount": 999})
        assert r.status_code == 200, r.text
        r = await ac.get(f"/primemax/{ctx['plafond_b'].id}")
        assert float(r.json()["amount"]) == 999

        # Suppression possible hors de son département
        r = await ac.delete(f"/primemax/{ctx['plafond_a'].id}")
        assert r.status_code == 200, r.text

        # Création d'un plafond pour un département sans plafond existant
        r = await ac.post("/primemax/", json={"department": "Dept B",
                                              "bonus_type": "ponctuelle",
                                              "currency": "Ar", "amount": 5000})
        assert r.status_code == 200, r.text
        assert r.json()["department"] == "Dept B"


async def test_modifie_les_taux_speciales_de_tous_les_employes(db):
    ctx = await _setup()
    async for ac in _client(db, ctx["joel"]):
        # Les employés de tous les départements sont listés (sections taux spéciaux)
        r = await ac.get("/employees/")
        assert r.status_code == 200
        assert ctx["employe_b"].id in {e["id"] for e in r.json()}

        r = await ac.put(f"/employees/{ctx['employe_b'].id}",
                         json={"astreinte_rate": 25000, "mensuel_rate": 50000})
        assert r.status_code == 200, r.text
        r = await ac.get(f"/employees/{ctx['employe_b'].id}")
        assert r.json()["astreinte_rate"] == 25000
        assert r.json()["mensuel_rate"] == 50000


async def test_utilisateur_sans_permission_reste_limite_a_son_departement(db):
    ctx = await _setup()
    async for ac in _client(db, ctx["paul"]):
        r = await ac.get("/primemax/")
        assert {p["id"] for p in r.json()} == {ctx["plafond_b"].id}

        r = await ac.put(f"/primemax/{ctx['plafond_a'].id}",
                         json={"department": "Dept A", "bonus_type": "mensuel",
                               "currency": "Ar", "amount": 1})
        assert r.status_code == 403

        r = await ac.get("/employees/")
        assert [e["id"] for e in r.json()] == [ctx["employe_b"].id]


async def test_directeur_scoped_ne_peut_pas_accorder_la_permission(db):
    ctx = await _setup()
    directeur = await User.create(email="dir@test.mg", name="Dir", password_hash="x",
                                  is_directeur=True, dept=ctx["dept_a"],
                                  dept_str="Dept A")
    cible = await User.create(email="cible@test.mg", name="Cible", password_hash="x",
                              dept=ctx["dept_a"], dept_str="Dept A")
    async for ac in _client(db, directeur):
        r = await ac.put(f"/admin/users/{cible.id}", json={"can_modify_plafonds": True})
        assert r.status_code == 403, r.text