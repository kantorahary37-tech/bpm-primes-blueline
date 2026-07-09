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
    "Direction Clientele": [
        ("clientele.manager@blueline.mg", "Rakoto Harilala", "Responsable Clientèle", True),
    ],
    "Direction Commerciale": [
        ("commerciale.manager@blueline.mg", "Razafy Mamy", "Responsable Commerciale", True),
    ],
    "Direction Administrative et Financiere": [
        ("daf.manager@blueline.mg", "Rakotomalala Haja", "DAF", True),
    ],
    "RH": [
        ("rh.manager@blueline.mg", "Randrianarisoa Voahangy", "Responsable RH", True),
    ],
    "Direction Achat": [
        ("achat.manager@blueline.mg", "Rakotondrabe Tiana", "Responsable Achat", True),
    ],
    "Direction BBS": [
        ("bbs.manager@blueline.mg", "Rindra Razafimbelo", "Responsable BBS", True),
    ],
    "Direction Communication et Marketing": [
        ("com.manager@blueline.mg", "Ranaivosoa Kanto", "Responsable Communication", True),
    ],
    "Direction des Operations": [
        ("do.manager@blueline.mg", "Randriamiarantsoa Lova", "Responsable DO", True),
    ],
    "Direction des Systemes d'Informations": [
        ("dsi.manager@blueline.mg", "Vonjy Rakotoniaina", "Chef de Projet DSI", True),
    ],
    "Direction Technique": [
        ("dt.manager@blueline.mg", "Rakotoarisoa Jean", "Responsable DT", True),
    ],
    "Direction Logistique": [
        ("log.manager@blueline.mg", "Rajaonarison Faly", "Responsable Logistique", True),
    ],
    "Direction Generale": [
        ("dg@blueline.mg", "Directeur Général", "DG", False),
    ],
}

EMPLOYEES_PER_DEPT = {}


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    users_map = {}

    print("\n=== Création des utilisateurs (managers & DG/DRH/Directeurs) ===")

    directors_data = [
        dict(email="directeur@blueline.mg", name="Directeur Général Adjoint",
             poste="Directeur", department="Direction Generale", is_directeur=True),
        dict(email="rivo@gulfsat.mg", name="Nantenaina Ulrich",
             poste="DSI", department="Direction des Systemes d'Informations", is_directeur=True),
        dict(email="johary.drh@blueline.mg", name="Johary",
             poste="DRH", department="Direction Administrative et Financiere", is_drh=True),
        dict(email="dg@blueline.mg", name="Directeur Général",
             poste="DG", department="Direction Generale", is_dg=True),
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
            await user.update_from_dict({
                "name": u["name"],
                "poste": u["poste"],
                "dept_str": u["department"],
                "dept": dept_obj,
                "is_validator_n1": u.get("is_validator_n1", False),
                "is_directeur": u.get("is_directeur", False),
                "is_drh": u.get("is_drh", False),
                "is_dg": u.get("is_dg", False),
            }).save()
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
        if not manager_email and dept == "Direction Generale":
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
                await emp.update_from_dict({
                    "name": name,
                    "dept_str": dept,
                    "dept": dept_obj,
                    "manager": manager,
                }).save()
                print(f"  ~ Mis à jour : {emp.name} ({emp.matricule}) [{dept}]")
            else:
                print(f"  ✓ Créé : {emp.name} ({emp.matricule}) [{dept}]")
            total += 1

    print(f"\n✅ {total} employé(s) créé(s) avec succès !")
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(seed())
