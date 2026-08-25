"""
Script pour supprimer toutes les primes et validations.
Usage : python -m scripts.delete_all_bonuses
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import Bonus, Validation, AuditLog, Notification


async def delete_all():
    await Tortoise.init(config=TORTOISE_ORM)

    notifications = await Notification.all().delete()
    audit_logs = await AuditLog.all().delete()
    validations = await Validation.all().delete()
    bonuses = await Bonus.all().delete()

    print(f"✓ {bonuses} prime(s) supprimee(s)")
    print(f"✓ {validations} validation(s) supprimee(s)")
    print(f"✓ {audit_logs} log(s) d'audit supprime(s)")
    print(f"✓ {notifications} notification(s) supprimee(s)")

    await Tortoise.close_connections()


if __name__ == '__main__':
    run_async(delete_all())
