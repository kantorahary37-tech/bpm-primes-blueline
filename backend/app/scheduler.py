"""
Planificateur :
- Rappel quotidien 08h30 : un email par acteur (Directeur / DG / DRH)
  listant les primes en attente de sa validation.
- Rappel de la date limite (le 20 du mois) : un email les 5, 10 et 15 du mois à
  08h00 et 17h00 aux N+1, N+2 et Directeurs concernés, listant leurs
  validations encore en attente et la date limite fixée.
- Rappel DG des primes en cours de validation (résumé groupé) : email aux jours
  et heures configurés (PRIME_REMINDER_DAYS / PRIME_REMINDER_HOURS).
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
from app.email_service import send_validation_reminder_email, send_deadline_reminder_email
from app.config import get_config
from app.permissions import n1_service_group_ids

router = APIRouter()

TYPE_LABELS = {
    "mensuel": "Prime mensuelle", "astreinte": "Astreinte", "commission": "Commission GP",
    "commission_gc": "Commission Grand Compte",
    "commission_entreprise": "Commission Entreprise",
    "intervention": "Intervention", "ponctuelle": "Ponctuelle", "exceptionnel": "Exceptionnelle",
}

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

# Largeur du créneau (en secondes) après un horaire planifié pendant laquelle on
# considère encore que le rappel est dû (évite de sauter un créneau après un
# léger réveil tardif du planificateur).
DEADLINE_SLOT_GRACE_SECONDS = 600

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


# ---------------------------------------------------------------------------
# Rappel de la date limite de validation (le 20 du mois)
# ---------------------------------------------------------------------------

def _deadline_tz() -> timezone:
    return timezone(timedelta(hours=float(get_config("REMINDER_TZ_OFFSET") or "3")))


def _deadline_day() -> int:
    try:
        return max(1, min(28, int(get_config("REMINDER_DEADLINE_DAY") or "20")))
    except (TypeError, ValueError):
        return 20


def _parse_int_list(value: str, default: list) -> list:
    parts = [p.strip() for p in (value or "").split(",") if p.strip()]
    parsed = []
    for p in parts:
        if p.isdigit():
            parsed.append(int(p))
    return sorted(set(parsed)) if parsed else default


def _deadline_reminder_days() -> list:
    return _parse_int_list(get_config("REMINDER_DEADLINE_DAYS"), [5, 10, 15])


def _deadline_reminder_hours() -> list:
    return _parse_int_list(get_config("REMINDER_DEADLINE_HOURS"), [8, 17])


def _deadline_label(now: datetime) -> str:
    day = _deadline_day()
    return f"{day} {MONTHS_FR[now.month - 1]} {now.year}"


def _wave_label(reminder_day: int) -> str:
    days = _deadline_reminder_days()
    try:
        idx = days.index(reminder_day)
    except ValueError:
        return "Rappel"
    labels = ["1er rappel", "2ème rappel", "3ème rappel", "4ème rappel"]
    return labels[idx] if idx < len(labels) else f"{idx + 1}ème rappel"


async def collect_deadline_pending_by_actor() -> dict:
    """
    {user_id: {"user": User, "items": [...]}} pour les primes restant à
    valider, adressé aux N+1, N+2 et Directeurs concernés :
      - INITIALISE             → N+1 du département (restreint à ses services)
      - EN_ATTENTE_N2          → N+2 sélectionné (n2_user)
      - EN_ATTENTE_DIRECTEUR   → Directeur du département
    """
    actors = {}

    def _add(user: User, bonus: Bonus, status_label: str):
        emp = bonus.employee
        actors.setdefault(user.id, {"user": user, "items": []})["items"].append({
            "employee_name": emp.name,
            "type_label": TYPE_LABELS.get(bonus.bonus_type.value, bonus.bonus_type.value),
            "amount": f"{int(bonus.total_amount):,}".replace(",", " ") + " Ar",
            "status_label": status_label,
            "url": f"{get_config('FRONTEND_URL')}/bonuses/{bonus.id}",
        })

    # N+1 : primes initialisées
    for bonus in await Bonus.filter(
        status=ValidationStatus.INITIALISE, paid_at__isnull=True
    ).prefetch_related("employee", "employee__service_group", "employee__dept"):
        emp = bonus.employee
        n1s = await User.filter(is_validator_n1=True, is_admin=False, dept_str=emp.dept_str).all()
        for n1 in n1s:
            group_ids = await n1_service_group_ids(n1)
            if group_ids is not None and emp.service_group_id not in group_ids:
                continue
            _add(n1, bonus, "Validation N+1")

    # N+2 : primes en attente N+2 (validateur désigné)
    for bonus in await Bonus.filter(
        status=ValidationStatus.EN_ATTENTE_N2, paid_at__isnull=True
    ).prefetch_related("employee"):
        n2 = await User.get_or_none(id=bonus.n2_user_id) if bonus.n2_user_id else None
        if n2 and n2.is_validator_n2 and not n2.is_admin:
            _add(n2, bonus, "Validation N+2")

    # Directeurs : primes en attente Directeur
    for bonus in await Bonus.filter(
        status=ValidationStatus.EN_ATTENTE_DIRECTEUR, paid_at__isnull=True
    ).prefetch_related("employee"):
        emp = bonus.employee
        directeurs = await User.filter(is_directeur=True, is_admin=False, dept_str=emp.dept_str).all()
        for d in directeurs:
            _add(d, bonus, "Validation Directeur")

    return actors


async def send_deadline_reminders() -> dict:
    """Envoie, pour le mois courant, le rappel de la date limite de validation."""
    now = datetime.now(_deadline_tz())
    wave = _wave_label(now.day)
    deadline = _deadline_label(now)
    sent = failed = 0
    for entry in (await collect_deadline_pending_by_actor()).values():
        user, items = entry["user"], entry["items"]
        if not items or not user.email:
            continue
        if await send_deadline_reminder_email(user.email, user.name, wave, deadline, items):
            sent += 1
        else:
            failed += 1
    print(f"[REMINDER-DEADLINE] {wave} ({deadline}) envoyés: {sent}, échecs: {failed}")
    return {"wave": wave, "deadline": deadline, "emails_sent": sent, "emails_failed": failed}


@router.post("/reminders/send-deadline-now")
async def send_deadline_now(_admin: User = Depends(require_admin)):
    """Déclenchement manuel (test admin) du rappel de date limite."""
    return await send_deadline_reminders()


def _next_deadline_slot(now: datetime):
    """
    Retourne ((year, month, day, hour), delay_seconds) pour le prochain créneau
    (jour-heure) de rappel de date limite, en tenant compte d'une petite marge
    post-créneau pour ne pas sauter un envoi après un léger réveil tardif.
    """
    candidates = []
    for day in _deadline_reminder_days():
        for hour in _deadline_reminder_hours():
            for offset in range(0, 367):
                d = now + timedelta(days=offset)
                try:
                    target = d.replace(day=day, hour=hour, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue
                delta = (target - now).total_seconds()
                if delta > -DEADLINE_SLOT_GRACE_SECONDS:
                    candidates.append(((target.year, target.month, target.day, hour), delta))
                    break
    if not candidates:
        return None, None
    key, delta = min(candidates, key=lambda c: c[1])
    return key, max(delta, 0.0)


_last_deadline_sent = None


# ---------------------------------------------------------------------------
# Rappel DG des primes en cours de validation (résumé groupé)
# ---------------------------------------------------------------------------

_last_prime_reminder_slot = None


async def _prime_reminder_loop():
    global _last_prime_reminder_slot
    # Import différé pour éviter l'import circulaire (le service référence
    # TYPE_LABELS de ce module de façon paresseuse).
    from app.prime_reminder_service import prime_reminder_next_slot, prime_reminder_send_scheduled

    while True:
        now = datetime.now(_deadline_tz())
        target, delay = prime_reminder_next_slot(now)
        if target is None:
            print("[SCHEDULER] Aucun créneau de rappel DG configuré")
            await asyncio.sleep(3600)
            continue
        slot_key = (target.year, target.month, target.day, target.hour)
        if delay <= 0 and slot_key != _last_prime_reminder_slot:
            _last_prime_reminder_slot = slot_key
            try:
                print(f"[SCHEDULER] Rappel DG déclenché pour le créneau {slot_key}")
                await prime_reminder_send_scheduled(target)
            except Exception as e:
                print(f"[SCHEDULER] Erreur rappel DG : {e}")
                await asyncio.sleep(60)
                continue
        print(f"[SCHEDULER] Prochain rappel DG dans {delay/3600:.2f} h")
        await asyncio.sleep(max(delay, 1.0))


async def _deadline_reminder_loop():
    global _last_deadline_sent
    while True:
        now = datetime.now(_deadline_tz())
        slot_key, delay = _next_deadline_slot(now)
        if slot_key is None:
            print("[SCHEDULER] Aucun créneau de rappel de date limite configuré")
            await asyncio.sleep(3600)
            continue
        if delay <= 0 and slot_key != _last_deadline_sent:
            _last_deadline_sent = slot_key
            try:
                print(f"[SCHEDULER] Rappel de date limite déclenché pour le créneau {slot_key}")
                await send_deadline_reminders()
            except Exception as e:
                print(f"[SCHEDULER] Erreur rappel de date limite : {e}")
                await asyncio.sleep(60)
                continue
        print(f"[SCHEDULER] Prochain rappel de date limite dans {delay/3600:.2f} h")
        await asyncio.sleep(max(delay, 1.0))


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

    if (get_config("REMINDER_DEADLINE_ENABLED") or "false").lower() == "true":
        print("[SCHEDULER] Rappel de date limite activé")
        tasks.append(asyncio.create_task(_deadline_reminder_loop()))
    else:
        print("[SCHEDULER] Rappel de date limite désactivé")

    if (get_config("PRIME_REMINDER_ENABLED") or "false").lower() == "true":
        print("[SCHEDULER] Rappel DG des primes en cours activé")
        tasks.append(asyncio.create_task(_prime_reminder_loop()))
    else:
        print("[SCHEDULER] Rappel DG des primes en cours désactivé")

    if (get_config("BACKUP_ENABLED") or "true").lower() == "true":
        print("[SCHEDULER] Sauvegardes automatiques activées")
        tasks.append(asyncio.create_task(_backup_loop()))
    else:
        print("[SCHEDULER] Sauvegardes automatiques désactivées")

    return tasks
