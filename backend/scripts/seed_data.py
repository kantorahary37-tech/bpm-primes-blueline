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
from app.models import User, Employee, Bonus, PrimeMax
from app.auth import get_password_hash
from datetime import date


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    # Nettoyage
    # await Bonus.all().delete()
    # await Employee.all().delete()
    # await User.all().delete()
    # await PrimeMax.all().delete()

    # Création des utilisateurs
    users_data = [
        dict(email="vonjy.rakotoniaina@staff.blueline.mg", name="Vonjy Rakotoniaina",
             poste="Chef de Projet", department="DSI", is_validator_n1=True),
        dict(email="rivo@gulfsat.mg", name="Nantenaina Ulrich",
             poste="DSI", department="DSI", is_directeur=True),
        dict(email="johary.drh@blueline.mg", name="Johary",
             poste="DRH", department="RH", is_drh=True),
        dict(email="dg@blueline.mg", name="Directeur Général",
             poste="DG", department="DG", is_dg=True),
        dict(email="rindra.razafimbelo@blueline-business.mg", name="RAZAFIMBELO Faliharinohatra Rindra",
             poste="DA", department="BBS", is_validator_n1=True),
        dict(email="natana.randriambololona@blueline-business.mg", name="RANDRIAMBOLONOLONA Natana",
             poste="Commercial GP", department="Commercial GP", is_validator_n1=True),
    ]

    users = []
    for u in users_data:
        user = await User.create(
            email=u["email"],
            name=u["name"],
            poste=u["poste"],
            department=u["department"],
            is_validator_n1=u.get("is_validator_n1", False),
            is_directeur=u.get("is_directeur", False),
            is_drh=u.get("is_drh", False),
            is_dg=u.get("is_dg", False),
            password_hash=get_password_hash("password123")
        )
        users.append(user)
        print(f"  ✓ Utilisateur créé : {user.name} ({user.email})")

    # Création des employés
    employees_data = [
        dict(matricule="EMP001", name="Employé Test 1", department="DSI", manager=users[0]),
        dict(matricule="EMP002", name="Employé Test 2", department="BBS", manager=users[4]),
    ]

    employees = []
    for e in employees_data:
        emp = await Employee.create(**e)
        employees.append(emp)
        print(f"  ✓ Employé créé : {emp.name} ({emp.matricule})")

    # Création des plafonds
    plafonds = [
        dict(department="DSI", bonus_type="mensuel", amount=200000),
        dict(department="BBS", bonus_type="mensuel", amount=150000),
    ]
    for p in plafonds:
        pm = await PrimeMax.create(**p)
        print(f"  ✓ Plafond créé : {pm.department} / {pm.bonus_type} = {pm.amount} Ar")

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
        created_by=users[0],
    )
    print(f"  ✓ Prime créée : ID={bonus.id}, employé={bonus.employee_id}, {bonus.total_amount} Ar")

    await Tortoise.close_connections()
    print("\n✅ Données de test injectées avec succès !")


if __name__ == "__main__":
    run_async(seed())
