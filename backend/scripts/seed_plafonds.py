"""
Script pour créer les plafonds de primes par défaut pour tous les départements.
Usage : python -m scripts.seed_plafonds
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import PrimeMax

DEPARTMENTS = [
    'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
    'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
    'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
]

DEFAULTS = {
    'mensuel': 150000,
    'astreinte': 70000,
    'commission': 200000,
}

BONUS_TYPE_DEPARTMENTS = {
    'mensuel': DEPARTMENTS,
    'astreinte': ['BBS', 'DO', 'DSI', 'DT'],
    'commission': ['Commercial GP', 'Commercial entreprise'],
}

async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    created = 0
    for bonus_type, depts in BONUS_TYPE_DEPARTMENTS.items():
        for dept in depts:
            exists = await PrimeMax.filter(department=dept, bonus_type=bonus_type).first()
            if not exists:
                await PrimeMax.create(
                    department=dept,
                    bonus_type=bonus_type,
                    amount=DEFAULTS[bonus_type],
                )
                print(f"  ✓ {dept} / {bonus_type} = {DEFAULTS[bonus_type]} Ar")
                created += 1

    await Tortoise.close_connections()
    print(f"\n✅ {created} plafond(s) créé(s) avec succès !")

if __name__ == "__main__":
    run_async(seed())
