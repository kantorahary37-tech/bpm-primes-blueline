"""
Script d'injection de données de test pour BPM Primes.
Utilise Tortoise ORM (asynchrone).
Usage : python -m scripts.seed_data
"""
import asyncio
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import User, Employee, Bonus, PrimeMax, Department
from app.auth import get_password_hash
from datetime import date


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    dept_cache = {}
    async def get_dept(name):
        if name not in dept_cache:
            dept_cache[name] = await Department.get_or_none(name=name)
        return dept_cache[name]

    # Création des utilisateurs
    users_data = [
        dict(email="vonjy.rakotoniaina@staff.blueline.mg", name="Vonjy Rakotoniaina",
             poste="Chef de Projet", department="Direction des Systemes d'Informations", is_validator_n1=True),
        dict(email="rivo@gulfsat.mg", name="Nantenaina Ulrich",
             poste="DSI", department="Direction des Systemes d'Informations", is_directeur=True),
        dict(email="johary.drh@blueline.mg", name="Johary",
             poste="DRH", department="RH", is_drh=True),
        dict(email="dg@blueline.mg", name="Directeur Général",
             poste="DG", department="Direction Generale", is_dg=True),
        dict(email="rindra.razafimbelo@blueline-business.mg", name="RAZAFIMBELO Faliharinohatra Rindra",
             poste="DA", department="Direction BBS", is_validator_n1=True),
        dict(email="natana.randriambololona@blueline-business.mg", name="RANDRIAMBOLONOLONA Natana",
             poste="Commerciale", department="Direction Commerciale", is_validator_n1=True),
        dict(email="rija.rakoto@staff.blueline.mg", name="Rija Rakoto",
             poste="DSI", department="Direction des Systemes d'Informations"),
        dict(email="mahery.andria@staff.blueline.mg", name="Mahery Andria",
             poste="DSI", department="Direction des Systemes d'Informations"),
    ]

    users_map = {}
    for u in users_data:
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
            print(f"  ~ Utilisateur mis à jour : {user.name} ({user.email})")
        else:
            print(f"  ✓ Utilisateur créé : {user.name} ({user.email})")
        users_map[user.email] = user

    # Création des employés
    employees_data = [
        dict(matricule="EMP005", name="Mahery Andria", department="Direction des Systemes d'Informations",
             manager=users_map["mahery.andria@staff.blueline.mg"]),
        dict(matricule="EMP006", name="RANDRIAMBOLONOLONA Natana", department="Direction Commerciale",
             manager=users_map["natana.randriambololona@blueline-business.mg"]),
    ]

    employees = []
    for e in employees_data:
        dept_obj = await get_dept(e["department"])
        emp, created = await Employee.get_or_create(
            matricule=e["matricule"],
            defaults={
                "name": e["name"],
                "dept_str": e["department"],
                "dept": dept_obj,
                "manager": e["manager"],
            }
        )
        if not created:
            await emp.update_from_dict({
                "name": e["name"],
                "dept_str": e["department"],
                "dept": dept_obj,
                "manager": e["manager"],
            }).save()
            print(f"  ~ Employé mis à jour : {emp.name} ({emp.matricule})")
        else:
            print(f"  ✓ Employé créé : {emp.name} ({emp.matricule})")
        employees.append(emp)

    # Création des plafonds
    plafonds = [
        dict(department="Direction des Systemes d'Informations", bonus_type="mensuel", amount=200000),
        dict(department="Direction BBS", bonus_type="mensuel", amount=150000),
        dict(department="Direction Commerciale", bonus_type="mensuel", amount=150000),
    ]
    for p in plafonds:
        dept_obj = await get_dept(p["department"])
        pm, created = await PrimeMax.get_or_create(
            dept_str=p["department"],
            bonus_type=p["bonus_type"],
            defaults={"amount": p["amount"], "dept": dept_obj}
        )
        if not created:
            pm.amount = p["amount"]
            pm.dept = dept_obj
            await pm.save()
            print(f"  ~ Plafond mis à jour : {pm.dept_str} / {pm.bonus_type} = {pm.amount} Ar")
        else:
            print(f"  ✓ Plafond créé : {pm.dept_str} / {pm.bonus_type} = {pm.amount} Ar")

    # Création d'une prime de test
    bonus = await Bonus.create(
        employee=employees[0],
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        bonus_type="mensuel",
        performance_score=85.5,
        absences=2,
        retard=1,
        prime_mensuel_amount=150000,
        total_amount=150000,
        status="Initialisé",
        created_by=users_map["vonjy.rakotoniaina@staff.blueline.mg"],
    )
    print(f"  ✓ Prime créée : ID={bonus.id}, employé={bonus.employee_id}, {bonus.total_amount} Ar")

    await Tortoise.close_connections()
    print("\n✅ Données de test injectées avec succès !")


if __name__ == "__main__":
    run_async(seed())
