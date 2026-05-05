import sys
sys.path.append('C:\\Users\\-\\Documents\\Kanto\\BPM PRIMES BLUELINE\\backend')

from app.db_config import SessionLocal
from app.models import User, Employee, Bonus, DepartmentType, BonusType, ValidationStatus
from datetime import datetime

db = SessionLocal()

# Créer les utilisateurs (managers + DRH + DG)
users = [
    User(
        email="vonjy.rakotoniaina@staff.blueline.mg",
        name="Vonjy Rakotoniaina",
        poste="Chef de Projet",
        department=DepartmentType.DSI,
        is_validator_n1="Y"
    ),
    User(
        email="rivo@gulfsat.mg",
        name="Nantenaina Ulrich",
        poste="DSI",
        department=DepartmentType.DSI,
        is_directeur="Y"
    ),
    User(
        email="johary.drh@blueline.mg",
        name="Johary",
        poste="DRH",
        department=DepartmentType.RH,
        is_drh="Y"
    ),
    User(
        email="dg@blueline.mg",
        name="Directeur Général",
        poste="DG",
        department=DepartmentType.DIR_GENERALE,
        is_dg="Y"
    ),
    User(
        email="rindra.razafimbelo@blueline-business.mg",
        name="RAZAFIMBELO Faliharinohatra Rindra",
        poste="DA",
        department=DepartmentType.BBS,
        is_validator_n1="Y"
    ),
]

db.add_all(users)
db.commit()
print("Utilisateurs créés")

# Créer des employés
employees = [
    Employee(
        matricule="EMP001",
        name="Employé Test 1",
        department=DepartmentType.DSI,
        manager_id=1  # Vonjy
    ),
    Employee(
        matricule="EMP002",
        name="Employé Test 2",
        department=DepartmentType.BBS,
        manager_id=5  # Rindra
    ),
]

db.add_all(employees)
db.commit()
print("Employés créés")

# Créer une prime de test
bonus = Bonus(
    employee_id=1,
    month=5,
    year=2026,
    bonus_type=BonusType.MENSUEL,
    performance_score=85.5,
    absences=2,
    retard=1,
    prime_mensuel_amount=150000,
    total_amount=150000,
    status=ValidationStatus.INITIALISE,
    created_by_id=1
)

db.add(bonus)
db.commit()
print("Prime créée")
print(f"ID de la prime: {bonus.id}")

db.close()
print("Données de test injectées avec succès !")
