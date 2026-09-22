"""
Planificateur :
- Rappel quotidien 08h30 : un email par acteur (Directeur / DG / DRH)
  listant les primes en attente de sa validation.
- Sauvegarde automatique périodique de la base (dump SQL complet) avec
  rétention des N dernières copies.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from app.models import User, Bonus, ValidationStatus
from app.auth import get_current_user
from app.api.admin import require_admin
from app.api.database_dump import create_database_dump_file, cleanup_old_dumps
from app.email_service import send_validation_reminder_email
from app.config import get_config

router = APIRouter()

TYPE_LABELS = {
    "mensuel": "Prime mensuelle", "astreinte": "Astreinte", "commission": "Commission GP",
    "commission_gc": "Commission Grand Compte",
    "commission_entreprise": "Commission Entreprise",
    "intervention": "Intervention", "ponctuelle": "Ponctuelle", "exceptionnel": "Exceptionnelle",
}

# Statut bloquant → (libellé de l'étape, filtre sur le rôle responsable)
# Uniquement les étapes Directeur, DG et DRH (traitement)
STEPS = {
    ValidationStatus.EN_ATTENTE_DIRECTEUR: ("Validation Directeur", {"is_directeur": True}, True),
    ValidationStatus.EN_ATTENTE_DG: ("Validation DG", {"is_dg": True}, False),
    ValidationStatus.VALIDE: ("Traitement DRH", {"is_drh": True}, False),
}


async def collect_pending_by_actor() -> dict:
    """{user_id: {"user": User, "items": [...]}} pour les primes bloquées à l'étape Directeur/DG/DRH."""
    actors = {}
    for status, (label, role_filter, dept_scoped) in STEPS.items():
        for bonus in await Bonus.filter(status=status, paid_at__isnull=True).prefetch_related("employee"):
            emp = bonus.employee
            query = User.filter(is_admin=False, **role_filter)
            validators = await (query.filter(dept_str=emp.dept_str).all() if dept_scoped else query.all())
            for v in validators:
                actors.setdefault(v.id, {"user": v, "items": []})["items"].append({
                    "employee_name": emp.name,
                    "type_label": TYPE_LABELS.get(bonus.bonus_type.value, bonus.bonus_type.value),
                    "amount": f"{int(bonus.total_amount):,}".replace(",", " ") + " Ar",
                    "status_label": label,
                    "url": f"{get_config('FRONTEND_URL')}/bonuses/{bonus.id}",
                })
    return actors


async def send_daily_reminders() -> dict:
    sent = failed = 0
    for entry in (await collect_pending_by_actor()).values():
        user, items = entry["user"], entry["items"]
        if not user.email:
            continue
        if await send_validation_reminder_email(user.email, user.name, items):
            sent += 1
        else:
            failed += 1
    print(f"[REMINDER] Rappels envoyés: {sent}, échecs: {failed}")
    return {"emails_sent": sent, "emails_failed": failed}


@router.post("/reminders/send-now")
async def send_now(_admin: User = Depends(require_admin)):
    """Déclenchement manuel (test admin)."""
    return await send_daily_reminders()


def _seconds_until_next_run() -> float:
    hour = int(get_config("REMINDER_HOUR") or "8")
    minute = int(get_config("REMINDER_MINUTE") or "30")
    tz = timezone(timedelta(hours=float(get_config("REMINDER_TZ_OFFSET") or "3")))
    now = datetime.now(tz)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def _reminder_loop():
    while True:
        delay = _seconds_until_next_run()
        print(f"[SCHEDULER] Prochain rappel dans {delay/3600:.2f} h")
        await asyncio.sleep(delay)
        try:
            await send_daily_reminders()
        except Exception as e:
            print(f"[SCHEDULER] Erreur rappel : {e}")
            await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# Sauvegarde automatique de la base
# ---------------------------------------------------------------------------

_backup_lock = asyncio.Lock()


async def run_automatic_backup() -> dict:
    """Génère une sauvegarde complète puis nettoie les copies trop anciennes."""
    if _backup_lock.locked():
        print("[BACKUP] Une sauvegarde est déjà en cours, ignoré")
        return {"skipped": True}

    async with _backup_lock:
        label = (get_config("BACKUP_LABEL") or "auto")[:40]
        result = await create_database_dump_file(label)

        try:
            retention = max(0, int(get_config("BACKUP_RETENTION") or "6"))
        except (TypeError, ValueError):
            retention = 6
        removed = cleanup_old_dumps(retention)

        print(f"[BACKUP] Sauvegarde créée : {result['filename']} ({result['size_display']}), "
              f"retention={retention}, supprimées={len(removed)}")
        return {**result, "cleaned": removed, "retention": retention}


async def _backup_loop():
    while True:
        try:
            enabled = (get_config("BACKUP_ENABLED") or "true").lower() == "true"
            if enabled:
                try:
                    interval_hours = max(0.25, float(get_config("BACKUP_INTERVAL_HOURS") or "2"))
                except (TypeError, ValueError):
                    interval_hours = 2.0
                await run_automatic_backup()
                print(f"[BACKUP] Prochaine sauvegarde dans {interval_hours} h")
                await asyncio.sleep(interval_hours * 3600)
            else:
                print("[BACKUP] Sauvegardes automatiques désactivées")
                await asyncio.sleep(3600)
        except Exception as e:
            print(f"[BACKUP] Erreur lors de la sauvegarde automatique : {e}")
            await asyncio.sleep(300)


def start_scheduler():
    tasks = []
    if get_config("REMINDER_ENABLED").lower() == "true":
        print("[SCHEDULER] Rappels activés")
        tasks.append(asyncio.create_task(_reminder_loop()))
    else:
        print("[SCHEDULER] Rappels désactivés")

    if (get_config("BACKUP_ENABLED") or "true").lower() == "true":
        print("[SCHEDULER] Sauvegardes automatiques activées")
        tasks.append(asyncio.create_task(_backup_loop()))
    else:
        print("[SCHEDULER] Sauvegardes automatiques désactivées")

    return tasks
