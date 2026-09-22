"""
Envoi manuel du rappel de la date limite de validation des primes (le 20 du
mois) aux N+1, N+2 et Directeurs concernés. En TEST_MODE, tous les emails sont
redirigés vers TEST_EMAIL.

Usage:  docker compose exec backend python -m scripts.send_deadline_reminder
"""
import sys
sys.path.append('.')

from tortoise import Tortoise, run_async
from app.db_config import TORTOISE_ORM
from app.scheduler import send_deadline_reminders


async def main():
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()
    summary = await send_deadline_reminders()
    print(f"Rappel date limite ({summary['deadline']}) : "
          f"{summary['emails_sent']} envoyé(s), {summary['emails_failed']} échec(s)")
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(main())