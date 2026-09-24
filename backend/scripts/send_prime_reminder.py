"""
Envoi manuel du rappel DG des primes en cours de validation (résumé groupé).
En TEST_MODE, tous les emails sont redirigés vers TEST_EMAIL.

Usage:  docker compose exec backend python -m scripts.send_prime_reminder
"""
import sys
sys.path.append('.')

from tortoise import Tortoise, run_async
from app.db_config import TORTOISE_ORM
from app.config import bootstrap_config
from app.prime_reminder_service import prime_reminder_send_manual


async def main():
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()
    # La config de la base de données prime sur le fichier .env.
    await bootstrap_config()
    result = await prime_reminder_send_manual()
    print(f"Rappel DG : {result['message']} ({result['status']})")
    exec_row = result.get("execution")
    if exec_row:
        print(f"  Statut: {exec_row['status']}, primes concernées: {exec_row['total_count']}")
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(main())