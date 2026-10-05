"""Permissions d'écriture sur les plafonds.

La création / modification / suppression d'un plafond et les taux spéciaux
(astreinte / mensuel) sont réservées à la DRH, à l'administrateur, au DG et aux
utilisateurs cochés « Autoriser à modifier les plafonds » (User
.can_modify_plafonds). Un directeur est en lecture seule, y compris sur les
plafonds de son propre département.

Régressions couvertes :
- ``/primemax`` ignorait le drapeau (lecture/écriture restreintes à son dept.) ;
- la création d'un plafond ne renseignait pas la FK ``department_id`` ;
- les accès par id lisaient un attribut ``department_id`` inexistant (500) ;
- un taux spécial d'un employé hors périmètre était refusé ;
- un directeur pouvait modifier / créer / supprimer les plafonds de son
  département, et les taux spéciaux de ses employés.
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


async def test_directeur_lit_les_taux_speciaux_de_son_departement(db):
    """Un directeur voit (lecture seule) les taux spéciaux (astreinte / mensuel)
    des employés de son département — et uniquement ceux-là : la liste des
    employés qui alimente les sections « Taux spéciaux » de la page Plafonds
    expose bien les taux de son département, sans jamais déborder sur un autre.
    """
    ctx = await _setup()
    directeur = await User.create(email="dir@test.mg", name="Dir", password_hash="x",
                                  is_directeur=True, dept=ctx["dept_a"],
                                  dept_str="Dept A")
    emp_a1 = await Employee.create(matricule="A1", name="Employe A1", dept=ctx["dept_a"],
                                   dept_str="Dept A", manager=directeur,
                                   astreinte_rate=25000, mensuel_rate=50000)
    emp_a2 = await Employee.create(matricule="A2", name="Employe A2", dept=ctx["dept_a"],
                                   dept_str="Dept A", manager=directeur)

    async for ac in _client(db, directeur):
        r = await ac.get("/employees/")
        assert r.status_code == 200
        by_id = {e["id"]: e for e in r.json()}
        # Les employés de son département, avec leurs taux spéciaux visibles
        assert set(by_id) == {emp_a1.id, emp_a2.id}
        assert by_id[emp_a1.id]["astreinte_rate"] == 25000
        assert by_id[emp_a1.id]["mensuel_rate"] == 50000
        assert by_id[emp_a2.id]["astreinte_rate"] is None
        # Aucun employé hors de son département (l'employé de Dept B reste invisible)
        assert ctx["employe_b"].id not in by_id


async def test_directeur_ne_peut_pas_modifier_les_plafonds_de_son_departement(db):
    """Un directeur est en lecture seule sur les plafonds — même ceux de son
    propre département (il peut en revanche les consulter)."""
    ctx = await _setup()
    directeur = await User.create(email="dir@test.mg", name="Dir", password_hash="x",
                                  is_directeur=True, dept=ctx["dept_a"],
                                  dept_str="Dept A")

    async for ac in _client(db, directeur):
        # Lecture autorisée
        r = await ac.get("/primemax/")
        assert r.status_code == 200
        assert {p["id"] for p in r.json()} == {ctx["plafond_a"].id}

        # Écriture refusée sur le plafond de son département…
        r = await ac.put(f"/primemax/{ctx['plafond_a'].id}",
                         json={"department": "Dept A", "bonus_type": "mensuel",
                               "currency": "Ar", "amount": 999})
        assert r.status_code == 403, r.text
        assert float((await PrimeMax.get(id=ctx["plafond_a"].id)).amount) == 100

        # … création, suppression et taux spéciaux également refusés
        r = await ac.post("/primemax/", json={"department": "Dept A",
                                              "bonus_type": "ponctuelle",
                                              "currency": "Ar", "amount": 500})
        assert r.status_code == 403, r.text
        r = await ac.delete(f"/primemax/{ctx['plafond_a'].id}")
        assert r.status_code == 403, r.text
        assert await PrimeMax.filter(id=ctx["plafond_a"].id).exists()

        employe_a = await Employee.create(matricule="A1", name="Employe A", dept=ctx["dept_a"],
                                          dept_str="Dept A", manager=directeur)
        r = await ac.put(f"/employees/{employe_a.id}", json={"astreinte_rate": 25000})
        assert r.status_code == 403, r.text
        assert (await Employee.get(id=employe_a.id)).astreinte_rate is None


async def test_drh_administre_tous_les_plafonds(db):
    ctx = await _setup()
    drh = await User.create(email="drh@test.mg", name="Drh", password_hash="x",
                            dept=ctx["dept_b"], dept_str="Dept B", is_drh=True)
    async for ac in _client(db, drh):
        r = await ac.get("/primemax/")
        assert {p["id"] for p in r.json()} == {ctx["plafond_a"].id, ctx["plafond_b"].id}

        r = await ac.put(f"/primemax/{ctx['plafond_a'].id}",
                         json={"department": "Dept A", "bonus_type": "mensuel",
                               "currency": "Ar", "amount": 750})
        assert r.status_code == 200, r.text
        r = await ac.put(f"/employees/{ctx['employe_b'].id}", json={"mensuel_rate": 60000})
        assert r.status_code == 200, r.text
        r = await ac.delete(f"/primemax/{ctx['plafond_b'].id}")
        assert r.status_code == 200, r.text


async def test_administrateur_administre_tous_les_plafonds(db):
    ctx = await _setup()
    admin = await User.create(email="adm@test.mg", name="Adm", password_hash="x",
                              dept=ctx["dept_b"], dept_str="Dept B", is_admin=True)
    async for ac in _client(db, admin):
        r = await ac.post("/primemax/", json={"department": "Dept A",
                                              "bonus_type": "exceptionnel",
                                              "currency": "Ar", "amount": 1234})
        assert r.status_code == 200, r.text
        assert r.json()["department"] == "Dept A"
