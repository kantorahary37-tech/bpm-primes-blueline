"""
Envoi manuel des rappels de validation de primes (même contenu que le rappel
quotidien de 08h30). En TEST_MODE, tous les emails sont redirigés vers TEST_EMAIL.

Usage:  docker compose exec backend python -m scripts.send_reminder
"""
import sys
sys.path.append('.')

from tortoise import Tortoise, run_async
from app.db_config import TORTOISE_ORM
from app.scheduler import send_daily_reminders


async def main():
    await Tortoise.init(config=TORTOISE_ORM)
    summary = await send_daily_reminders()
    print(f"Rappels : {summary['emails_sent']} envoyé(s), {summary['emails_failed']} échec(s)")
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(main())
