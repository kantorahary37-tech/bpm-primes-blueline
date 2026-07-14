"""
Script d'injection d'utilisateurs et employés fictifs.
Usage : python -m scripts.seed_employees
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import User, Employee, Department
from app.auth import get_password_hash


MANAGERS_PER_DEPT = {
    "Clientèle": [
        ("clientele.manager@blueline.mg", "Rakoto Harilala", "Responsable Clientèle", True),
    ],
    "Commerciale": [
        ("commerciale.manager@blueline.mg", "Razafy Mamy", "Responsable Commerciale", True),
    ],
    "ADV": [
        ("adv.manager@blueline.mg", "Raharinirina Fy", "Responsable ADV", True),
    ],
    "Fidélisation": [
        ("fidele.manager@blueline.mg", "Randria Nome", "Responsable Fidélisation", True),
    ],
    "Auditeur interne": [
        ("audit.manager@blueline.mg", "Ranalvo Tia", "Responsable Audit", True),
    ],
    "DAF Contrôleur": [
        ("dafcontroleur.manager@blueline.mg", "Rakotomalala Haja", "DAF Contrôleur", True),
    ],
    "DAF CDG": [
        ("dafcdg.manager@blueline.mg", "Andriantsilavo Mamy", "DAF CDG", True),
    ],
    "CTB": [
        ("ctb.manager@blueline.mg", "Razafimandimby Solo", "Responsable CTB", True),
    ],
    "RH": [
        ("rh.manager@blueline.mg", "Randrianarisoa Voahangy", "Responsable RH", True),
    ],
    "Achat": [
        ("achat.manager@blueline.mg", "Rakotondrabe Tiana", "Responsable Achat", True),
    ],
    "BBS": [
        ("bbs.manager@blueline.mg", "Rindra Razafimbelo", "Responsable BBS", True),
    ],
    "Communication & Mktg": [
        ("com.manager@blueline.mg", "Ranaivosoa Kanto", "Responsable Communication", True),
    ],
    "DO": [
        ("do.manager@blueline.mg", "Randriamiarantsoa Lova", "Responsable DO", True),
    ],
    "DSI": [
        ("dsi.manager@blueline.mg", "Vonjy Rakotoniaina", "Chef de Projet DSI", True),
    ],
    "DT": [
        ("dt.manager@blueline.mg", "Rakotoarisoa Jean", "Responsable DT", True),
    ],
    "Logistique": [
        ("log.manager@blueline.mg", "Rajaonarison Faly", "Responsable Logistique", True),
    ],
    "DG": [
        ("dg@blueline.mg", "Directeur Général", "DG", False),
    ],
}

EMPLOYEES_PER_DEPT = {
    "Clientèle": [
        ("CLT001", "Rakotoarisoa Ando"),
        ("CLT002", "Razafindrakoto Miora"),
        ("CLT003", "Randriamampionona Lala"),
        ("CLT004", "Andrianantenaina Tovo"),
        ("CLT005", "Rakotoniaina Holy"),
        ("CLT006", "Rabeharisoa Nivo"),
    ],
    "Commerciale": [
        ("CGP001", "Razafy Faniry"),
        ("CGP002", "Randrianarison Tahiry"),
        ("CGP003", "Rakotozafy Hery"),
        ("CGP004", "Andrianjafy Nambinina"),
        ("CGP005", "Ranaivosoa Tafita"),
        ("CEN001", "Rabeantoandro Sarobidy"),
        ("CEN002", "Razafindrakoto Fitahiana"),
        ("CEN003", "Randriatsarafara Rivo"),
        ("CEN004", "Rakotonirina Maminirina"),
    ],
    "ADV": [
        ("ADV001", "Raharimanantsoa Anjarasoa"),
        ("ADV002", "Razafimandimby Faneva"),
        ("ADV003", "Andriamasinoro Tafitasoa"),
        ("ADV004", "Randrianantenaina Toky"),
    ],
    "Fidélisation": [
        ("FID001", "Rakotoarivelo Soa"),
        ("FID002", "Razafinjato Ony"),
        ("FID003", "Randriambololona Mamy"),
    ],
    "Auditeur interne": [
        ("AUD001", "Ravelojaona Herinjaka"),
        ("AUD002", "Razafindrakoto Manoa"),
        ("AUD003", "Rakotonirina Sitraka"),
    ],
    "DAF Contrôleur": [
        ("DAF001", "Rakotovao Hasina"),
        ("DAF002", "Randrianandrasana Hary"),
        ("DAF003", "Razafindratsimba Tiana"),
    ],
    "DAF CDG": [
        ("CDG001", "Rafanomezantsoa Lova"),
        ("CDG002", "Andriatsiferana Tafita"),
        ("CDG003", "Rakotoniaina Nomena"),
    ],
    "CTB": [
        ("CTB001", "Razafinakanga Holy"),
        ("CTB002", "Randriamasimanana Tovo"),
        ("CTB003", "Rabeharisoa Miora"),
    ],
    "RH": [
        ("RH001", "Randrianasolo Voahangy"),
        ("RH002", "Rakotoarimanana Soafara"),
        ("RH003", "Razafindrakoto Hanta"),
        ("RH004", "Andriambelosoa Miranto"),
    ],
    "Achat": [
        ("ACH001", "Rakotondrabe Tafita"),
        ("ACH002", "Randriamampionona Hasina"),
        ("ACH003", "Razafinjato Miranto"),
    ],
    "BBS": [
        ("BBS001", "Razafimandimby Nandrianina"),
        ("BBS002", "Randrianarivelo Sitraka"),
        ("BBS003", "Rakotoarisoa Mandresy"),
        ("BBS004", "Andriamananjara Tafitasoa"),
        ("BBS005", "Ranaivoarisoa Miora"),
    ],
    "Communication & Mktg": [
        ("COM001", "Rakotondravao Kanto"),
        ("COM002", "Randriamanantena Holy"),
        ("COM003", "Razafindrakoto Nivo"),
    ],
    "DO": [
        ("DO001", "Rajaonarison Faneva"),
        ("DO002", "Randriamiandrisoa Tovo"),
        ("DO003", "Rakotozafy Mamy"),
        ("DO004", "Razafinjato Nambinina"),
        ("DO005", "Andriamasinoro Hery"),
    ],
    "DSI": [
        ("DSI001", "Rakotoarison Nantenaina"),
        ("DSI002", "Randrianantenaina Tafitasoa"),
        ("DSI003", "Razafindrakoto Mandresy"),
        ("DSI004", "Andriamanjato Sitraka"),
        ("DSI005", "Ranaivoson Maminirina"),
        ("DSI006", "Rakotondravony Lova"),
        ("DSI007", "Razafinakanga Holy"),
        ("DSI008", "Randriatsarafara Nomena"),
    ],
    "DT": [
        ("DT001", "Rakotoarivelo Fy"),
        ("DT002", "Razafindrakoto Tafita"),
        ("DT003", "Randrianandrasana Miora"),
        ("DT004", "Rabeantoandro Hasina"),
    ],
    "Logistique": [
        ("LOG001", "Rakotonirina Faneva"),
        ("LOG002", "Razafinjato Soa"),
        ("LOG003", "Randriambololona Tovo"),
        ("LOG004", "Rajaonarison Nomena"),
    ],
    "DG": [
        ("DG001", "Secrétaire DG"),
        ("DG002", "Assistant DG"),
    ],
}


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    users_map = {}

    print("\n=== Création des utilisateurs (managers & DG/DRH/Directeurs) ===")

    directors_data = [
        dict(email="directeur@blueline.mg", name="Directeur Général Adjoint",
             poste="Directeur", department="DG", is_directeur=True),
        dict(email="rivo@gulfsat.mg", name="Nantenaina Ulrich",
             poste="DSI", department="DSI", is_directeur=True),
        dict(email="johary.drh@blueline.mg", name="Johary",
             poste="DRH", department="RH", is_drh=True),
        dict(email="dg@blueline.mg", name="Directeur Général",
             poste="DG", department="DG", is_dg=True),
    ]

    all_users_data = list(directors_data)

    for dept, mgrs in MANAGERS_PER_DEPT.items():
        for email, name, poste, is_n1 in mgrs:
            all_users_data.append(dict(
                email=email, name=name, poste=poste,
                department=dept, is_validator_n1=is_n1,
            ))

    dept_cache = {}
    async def get_dept(name):
        if name not in dept_cache:
            dept_cache[name] = await Department.get_or_none(name=name)
        return dept_cache[name]

    for u in all_users_data:
        dept_obj = await get_dept(u["department"])
        user, created = await User.get_or_create(
            email=u["email"],
            defaults={
                "name": u["name"],
                "poste": u["poste"],
                "dept_str": u["department"],
                "dept": dept_obj,
                "is_validator_n1": u.get("is_validator_n1", False),
                "is_directeur": u.get("is_directeur", False),
                "is_drh": u.get("is_drh", False),
                "is_dg": u.get("is_dg", False),
                "password_hash": get_password_hash("password123"),
            }
        )
        if not created:
            user.update_from_dict({
                "name": u["name"],
                "poste": u["poste"],
                "dept_str": u["department"],
                "dept": dept_obj,
                "is_validator_n1": u.get("is_validator_n1", False),
                "is_directeur": u.get("is_directeur", False),
                "is_drh": u.get("is_drh", False),
                "is_dg": u.get("is_dg", False),
            })
            await user.save()
            print(f"  ~ Mis à jour : {user.name} ({user.email})")
        else:
            print(f"  ✓ Créé : {user.name} ({user.email})")
        users_map[user.email] = user

    print(f"\n=== Création des employés ===")

    total = 0
    for dept, employees_list in EMPLOYEES_PER_DEPT.items():
        manager_email = None
        for d, mgrs in MANAGERS_PER_DEPT.items():
            if d == dept and mgrs:
                manager_email = mgrs[0][0]
                break
        if not manager_email and dept == "DG":
            manager_email = "dg@blueline.mg"
        if not manager_email:
            manager_email = "dg@blueline.mg"

        manager = users_map.get(manager_email)
        if not manager:
            print(f"  ! Aucun manager trouvé pour {dept}")
            continue

        for matricule, name in employees_list:
            dept_obj = await get_dept(dept)
            emp, created = await Employee.get_or_create(
                matricule=matricule,
                defaults={
                    "name": name,
                    "dept_str": dept,
                    "dept": dept_obj,
                    "manager": manager,
                }
            )
            if not created:
                emp.update_from_dict({
                    "name": name,
                    "dept_str": dept,
                    "dept": dept_obj,
                    "manager": manager,
                })
                await emp.save()
                print(f"  ~ Mis à jour : {emp.name} ({emp.matricule}) [{dept}]")
            else:
                print(f"  ✓ Créé : {emp.name} ({emp.matricule}) [{dept}]")
            total += 1

    print(f"\n✅ {total} employé(s) créé(s) avec succès !")
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(seed())
