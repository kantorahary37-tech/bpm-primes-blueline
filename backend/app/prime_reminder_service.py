"""
Service du rappel DG des primes en cours de validation.

La MÊME logique métier est utilisée par :
- le planificateur (cron)             -> send_prime_reminder_scheduled()
- le déclenchement manuel (bouton / script admin) -> send_prime_reminder_manual()
- l'aperçu du template                -> prime_reminder_preview()

Idempotence : un même créneau planifié (notification_type + scheduled_for)
est journalisé en base (PrimeReminderExecution). Une exécution CRON déjà
envoyée (SENT/MANUAL) n'est jamais renvoyée ; une exécution ayant échoué
(FAILED) peut être retentée en réutilisant la même ligne de journal.
"""
from datetime import datetime, timedelta, timezone

from tortoise.exceptions import IntegrityError

from app.models import User, Bonus, ValidationStatus, PrimeReminderExecution
from app.config import get_config, set_config
from app.email_service import send_prime_reminder_email, render_prime_reminder_email, _smtp_config

PRIME_REMINDER_TYPE = "prime_reminder_dg"

# Créneau passé considéré comme encore exécutable (évite de sauter un envoi
# après un léger réveil tardif du planificateur). L'idempotence reste portée
# par la base de données.
GRACE_SECONDS = 7200

# Fuseau horaire de l'application (Antananarivo, UTC+3 par défaut).
def reminder_tz() -> timezone:
    try:
        return timezone(timedelta(hours=float(get_config("REMINDER_TZ_OFFSET") or "3")))
    except (TypeError, ValueError):
        return timezone(timedelta(hours=3))


def _parse_int_list(value: str, default: list) -> list:
    parts = [p.strip() for p in (value or "").split(",") if p.strip()]
    parsed = []
    for p in parts:
        if p.isdigit():
            parsed.append(int(p))
    return sorted(set(parsed)) if parsed else list(default)


def prime_reminder_enabled() -> bool:
    return (get_config("PRIME_REMINDER_ENABLED") or "false").lower() == "true"


def prime_reminder_days() -> list:
    """Jours du mois configurés pour l'envoi (ex: [15, 20])."""
    return _parse_int_list(get_config("PRIME_REMINDER_DAYS"), [15, 20])


def prime_reminder_hours() -> list:
    """Heures (entières) configurées dans la journée (ex: [8, 17])."""
    return _parse_int_list(get_config("PRIME_REMINDER_HOURS"), [8, 17])


def _type_label(value: str) -> str:
    from app.scheduler import TYPE_LABELS
    return TYPE_LABELS.get(value, value)


async def prime_reminder_recipients() -> list:
    """Adresses destinataires : surcharge config PRIME_REMINDER_RECIPIENT
    (séparées par virgule) sinon emails des comptes DG de l'application."""
    override = (get_config("PRIME_REMINDER_RECIPIENT") or "").strip()
    if override:
        return [e.strip() for e in override.split(",") if e.strip()]
    dgs = await User.filter(is_dg=True, is_admin=False).all()
    return [u.email for u in dgs if u.email]


async def prime_reminder_summary() -> tuple:
    """
    Résumé groupé des primes réellement en attente de la validation DG :
        {department / bonus_type} -> count

    Seules les primes au statut « En attente DG » (ET exclues si payées) sont
    comptées — les étapes précédentes (Initialisé, N+2, Directeur) relèvent
    d'autres validateurs. Retourne (sections, total) où sections est une liste
    triée de dicts {department, bonus_type, bonus_type_label, count}.
    """
    bonuses = await Bonus.filter(
        status=ValidationStatus.EN_ATTENTE_DG,
        paid_at__isnull=True,
    ).prefetch_related("employee")

    groups = {}
    for b in bonuses:
        emp = b.employee
        dept = (emp.dept_str or "").strip() or "N/A"
        btype = b.bonus_type.value
        key = (dept, btype)
        if key not in groups:
            groups[key] = {
                "department": dept,
                "bonus_type": btype,
                "bonus_type_label": _type_label(btype),
                "count": 0,
            }
        groups[key]["count"] += 1

    sections = sorted(
        groups.values(),
        key=lambda g: (g["department"].lower(), g["bonus_type"].lower()),
    )
    total = sum(g["count"] for g in sections)
    return sections, total


def prime_reminder_next_slot(now: datetime = None) -> tuple:
    """
    Prochain créneau (date/heure entière) d'envoi configuré, avec la latence
    en secondes. Tient compte d'une marge post-créneau pour ne pas sauter un
    créneau après un réveil tardif du planificateur. Retourne (target, delay).

    target : datetime gérant le fuseau horaire local (Antananarivo).
    """
    now = now or datetime.now(reminder_tz())
    candidates = []
    for day in prime_reminder_days():
        for hour in prime_reminder_hours():
            for offset in range(0, 367):
                d = now + timedelta(days=offset)
                try:
                    target = d.replace(day=day, hour=hour, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue
                delta = (target - now).total_seconds()
                if delta > -GRACE_SECONDS:
                    candidates.append((target, delta))
                    break
    if not candidates:
        return None, None
    target, delta = min(candidates, key=lambda c: c[1])
    return target, max(delta, 0.0)


def prime_reminder_next_execution(now: datetime = None) -> datetime:
    """Prochain créneau strictement futur (affichage admin)."""
    now = now or datetime.now(reminder_tz())
    for day in prime_reminder_days():
        for hour in prime_reminder_hours():
            for offset in range(1, 367):
                d = now + timedelta(days=offset)
                try:
                    target = d.replace(day=day, hour=hour, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue
                if target > now:
                    return target
    return None


def _execution_dict(execution) -> dict:
    return {
        "id": execution.id,
        "notification_type": execution.notification_type,
        "trigger_type": execution.trigger_type,
        "scheduled_for": execution.scheduled_for.isoformat() if execution.scheduled_for else None,
        "recipient": execution.recipient,
        "status": execution.status,
        "summary": execution.summary,
        "total_count": execution.total_count,
        "sent_at": execution.sent_at.isoformat() if execution.sent_at else None,
        "error_message": execution.error_message,
        "created_by": execution.created_by_id,
        "created_at": execution.created_at.isoformat() if execution.created_at else None,
    }


async def _record_execution(**kwargs) -> PrimeReminderExecution:
    return await PrimeReminderExecution.create(**kwargs)


async def prime_reminder_send_scheduled(scheduled_for: datetime = None) -> dict:
    """
    Exécution CRON du rappel DG (idempotente).

    - La ligne de journal d'un créneau SENT/MANUAL n'est jamais renvoyée.
    - Une ligne PENDING/SENDING indique un envoi déjà en cours -> ignoré.
    - Une ligne FAILED est retentée (réutilisée, pas de doublon).
    - Aucune prime en cours -> pas d'email, le créneau est clôturé (SENT total 0).
    Respecte la contrainte UNIQUE (notification_type, scheduled_for) en base.
    """
    if scheduled_for is None:
        scheduled_for, _ = prime_reminder_next_slot()

    if scheduled_for is None:
        return {
            "status": "skipped",
            "message": "Aucun créneau de rappel DG configuré",
            "execution": None,
        }

    execution = await PrimeReminderExecution.filter(
        notification_type=PRIME_REMINDER_TYPE,
        scheduled_for=scheduled_for,
    ).first()

    if execution and execution.status in ("SENT", "MANUAL"):
        print(f"[PRIME_REMINDER] Créneau {scheduled_for} déjà envoyé ({execution.status}) — ignoré")
        return {"status": "skipped", "message": "Rappel déjà envoyé pour ce créneau", "execution": _execution_dict(execution)}

    if execution and execution.status in ("PENDING", "SENDING"):
        print(f"[PRIME_REMINDER] Créneau {scheduled_for} déjà en cours — ignoré")
        return {"status": "skipped", "message": "Envoi déjà en cours pour ce créneau", "execution": _execution_dict(execution)}

    if execution is None:
        try:
            execution = await _record_execution(
                notification_type=PRIME_REMINDER_TYPE,
                trigger_type="CRON",
                scheduled_for=scheduled_for,
                status="PENDING",
            )
        except IntegrityError:
            # Deux planificateurs se sont réveillés en même temps : l'autre a
            # déjà créé la ligne — on ne renvoie pas.
            execution = await PrimeReminderExecution.filter(
                notification_type=PRIME_REMINDER_TYPE,
                scheduled_for=scheduled_for,
            ).first()
            return {"status": "skipped", "message": "Envoi déjà planifié pour ce créneau", "execution": _execution_dict(execution)}

    print(f"[PRIME_REMINDER] Démarrage du rappel planifié pour {scheduled_for}")
    execution.status = "SENDING"
    execution.error_message = None
    await execution.save()

    try:
        sections, total = await prime_reminder_summary()
        execution.summary = sections
        execution.total_count = total

        if total == 0:
            # Pas de primes en cours : pas d'email vide, le créneau est clôturé.
            execution.status = "SENT"
            execution.sent_at = datetime.now(reminder_tz())
            execution.error_message = None
            await execution.save()
            print(f"[PRIME_REMINDER] Aucune prime en cours pour {scheduled_for} — envoi ignoré")
            return {"status": "skipped", "message": "Aucune prime en cours de validation", "execution": _execution_dict(execution)}

        recipients = await prime_reminder_recipients()
        if not recipients:
            raise ValueError("Aucun destinataire DG (email) configuré")
        execution.recipient = ", ".join(recipients)

        print(f"[PRIME_REMINDER] Créneau {scheduled_for} — groupes trouvés: {len(sections)}, primes: {total}")
        print(f"[PRIME_REMINDER] Envoi de l'email au(x) destinataire(s) DG")
        ok = await send_prime_reminder_email(recipients, sections, total)
        if not ok:
            raise RuntimeError("Échec de l'envoi SMTP")

        execution.status = "SENT"
        execution.sent_at = datetime.now(reminder_tz())
        execution.error_message = None
        await execution.save()
        print(f"[PRIME_REMINDER] Email envoyé avec succès ({total} primes en cours)")
        return {"status": "sent", "message": "Rappel envoyé avec succès", "execution": _execution_dict(execution)}

    except Exception as e:
        execution.status = "FAILED"
        execution.error_message = str(e)
        await execution.save()
        print(f"[PRIME_REMINDER] Échec de l'envoi : {e}")
        return {"status": "failed", "message": "Impossible d'envoyer le rappel", "execution": _execution_dict(execution)}


async def prime_reminder_send_manual(user: User = None) -> dict:
    """
    Déclenchement manuel du rappel DG (bouton admin / script). Utilise la même
    génération que le cron et journalise une exécution MANUAL.
    """
    now = datetime.now(reminder_tz())
    execution = await _record_execution(
        notification_type=PRIME_REMINDER_TYPE,
        trigger_type="MANUAL",
        scheduled_for=now,
        status="SENDING",
        created_by=user,
    )
    print(f"[PRIME_REMINDER] Déclenchement manuel par "
          f"{user.name if user else 'script'} à {now.isoformat()}")

    try:
        sections, total = await prime_reminder_summary()
        execution.summary = sections
        execution.total_count = total

        if total == 0:
            execution.status = "MANUAL"
            execution.sent_at = now
            await execution.save()
            return {"status": "skipped", "message": "Aucune prime en cours de validation", "execution": _execution_dict(execution)}

        recipients = await prime_reminder_recipients()
        if not recipients:
            raise ValueError("Aucun destinataire DG (email) configuré")
        execution.recipient = ", ".join(recipients)

        print(f"[PRIME_REMINDER] Groupes trouvés: {len(sections)}, primes: {total}")
        ok = await send_prime_reminder_email(recipients, sections, total)
        if not ok:
            raise RuntimeError("Échec de l'envoi SMTP")

        execution.status = "MANUAL"
        execution.sent_at = datetime.now(reminder_tz())
        execution.error_message = None
        await execution.save()
        print(f"[PRIME_REMINDER] Email manuel envoyé avec succès ({total} primes en cours)")
        return {"status": "sent", "message": "Rappel envoyé avec succès", "execution": _execution_dict(execution)}

    except Exception as e:
        execution.status = "FAILED"
        execution.error_message = str(e)
        await execution.save()
        print(f"[PRIME_REMINDER] Échec de l'envoi manuel : {e}")
        return {"status": "failed", "message": "Impossible d'envoyer le rappel", "execution": _execution_dict(execution)}


# Jeu représentatif utilisé uniquement pour l'aperçu quand aucune prime n'est
# en cours (basé sur les labels métier de l'application).
REPRESENTATIVE_SECTIONS = [
    {"department": "DO", "bonus_type": "astreinte", "bonus_type_label": "Astreinte", "count": 12},
    {"department": "BBS", "bonus_type": "astreinte", "bonus_type_label": "Astreinte", "count": 8},
    {"department": "DO", "bonus_type": "intervention", "bonus_type_label": "Intervention", "count": 5},
]


async def prime_reminder_preview() -> dict:
    """
    Aperçu du template sans envoyer d'email. Utilise les données réelles si
    des primes sont en cours, sinon un jeu représentatif.
    """
    sections, total = await prime_reminder_summary()
    using_real_data = total > 0
    if not using_real_data:
        sections = REPRESENTATIVE_SECTIONS
        total = 3

    cfg = _smtp_config()
    dg = await User.filter(is_dg=True, is_admin=False).order_by("id").first()
    greeting_name = (dg.name or "").strip() if dg else None
    subject, plain, html = render_prime_reminder_email(cfg, sections, total, greeting_name)
    return {
        "subject": subject,
        "plain": plain,
        "html": html,
        "sections": sections,
        "total_count": total,
        "using_real_data": using_real_data,
    }


async def prime_reminder_config() -> dict:
    """Configuration actuelle du rappel DG + dernière/prochaine exécution."""
    recipients = await prime_reminder_recipients()
    last = await PrimeReminderExecution.filter(
        notification_type=PRIME_REMINDER_TYPE,
    ).order_by("-created_at").first()

    return {
        "enabled": prime_reminder_enabled(),
        "days": prime_reminder_days(),
        "hours": prime_reminder_hours(),
        "recipient_override": (get_config("PRIME_REMINDER_RECIPIENT") or "").strip(),
        "recipient": ", ".join(recipients),
        "tz_offset": float(get_config("REMINDER_TZ_OFFSET") or "3"),
        "last_execution": _execution_dict(last) if last else None,
        "next_execution": prime_reminder_next_execution(),
    }


async def prime_reminder_save_config(enabled: bool, days: list, hours: list, recipient: str) -> dict:
    """Persiste la configuration du rappel DG dans SystemConfig (cache + DB)."""
    from app.models import SystemConfig

    settings = {
        "PRIME_REMINDER_ENABLED": "true" if enabled else "false",
        "PRIME_REMINDER_DAYS": ",".join(str(max(1, min(28, int(d)))) for d in days),
        "PRIME_REMINDER_HOURS": ",".join(str(max(0, min(23, int(h)))) for h in hours),
        "PRIME_REMINDER_RECIPIENT": (recipient or "").strip(),
    }
    for key, value in settings.items():
        set_config(key, value)
        try:
            row = await SystemConfig.get_or_none(key=key)
            if row:
                row.value = value
                await row.save()
            else:
                from app.config import CONFIG_DEFINITIONS
                meta = CONFIG_DEFINITIONS[key]
                await SystemConfig.create(
                    key=key,
                    value=value,
                    category=meta["category"],
                    description=meta["description"],
                )
        except Exception as e:
            print(f"[CONFIG] Erreur sauvegarde {key}: {e}")

    return await prime_reminder_config()