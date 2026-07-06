"""
Script pour créer les plafonds de primes par défaut pour tous les départements.
Usage : python -m scripts.seed_plafonds
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import PrimeMax, Department

DEPARTMENTS = [
    'Clientèle', 'Commerciale', 'ADV', 'Fidélisation',
    'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
    'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
]

DEFAULTS = {
    'mensuel': 150000,
    'astreinte': 70000,
    'commission': 200000,
    'intervention': 9000,
    'ponctuelle': 9000,
    'exceptionnel': 9000,
}

BONUS_TYPE_DEPARTMENTS = {
    'mensuel': DEPARTMENTS,
    'astreinte': ['BBS', 'DO', 'DSI', 'DT'],
    'commission': ['Commerciale'],
    'intervention': ['BBS', 'DO', 'DSI', 'DT'],
    'ponctuelle': ['BBS', 'DO', 'DSI', 'DT'],
    'exceptionnel': ['BBS', 'DO', 'DSI', 'DT'],
}

async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    created = 0
    for bonus_type, depts in BONUS_TYPE_DEPARTMENTS.items():
        for dept in depts:
            exists = await PrimeMax.filter(dept_str=dept, bonus_type=bonus_type).first()
            if not exists:
                dept_obj = await Department.get_or_none(name=dept)
                await PrimeMax.create(
                    dept_str=dept,
                    dept=dept_obj,
                    bonus_type=bonus_type,
                    amount=DEFAULTS[bonus_type],
                )
                print(f"  ✓ {dept} / {bonus_type} = {DEFAULTS[bonus_type]} Ar")
                created += 1

    await Tortoise.close_connections()
    print(f"\n✅ {created} plafond(s) créé(s) avec succès !")

if __name__ == "__main__":
    run_async(seed())
