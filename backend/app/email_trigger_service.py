"""
Service centralisé des déclencheurs email automatiques.

Quatre déclencheurs sont gérés par l'application :
- daily    : rappels quotidiens de validation (Directeur / DG / DRH)
- deadline : rappels de la date limite de validation (N+1 / N+2 / Directeurs)
- dg       : rappel DG des primes en cours (résumé groupé)
- rh       : rappel RH des primes validées en attente de traitement (résumé groupé)

Chaque déclenchement (cron ou manuel) est journalisé dans la table
PrimeReminderExecution (colonne notification_type) afin d'offrir un
historique unifié dans la page admin « Déclencheurs email ».
"""
from datetime import datetime, timedelta, timezone

from app.config import get_config, set_config
from app.models import User, PrimeReminderExecution
from app.email_service import (
    render_validation_reminder_email,
    render_deadline_reminder_email,
    render_prime_reminder_email,
    _smtp_config,
)

# Clé UI -> notification_type persisté en base
TRIGGER_NOTIFICATION_TYPES = {
    "daily": "daily_reminder",
    "deadline": "deadline_reminder",
    "dg": "prime_reminder_dg",
    "rh": "prime_reminder_rh",
}

TRIGGER_LABELS = {
    "daily": "Rappels quotidiens de validation",
    "deadline": "Rappel de date limite",
    "dg": "Rappel DG — primes en cours",
    "rh": "Rappel RH — primes validées à traiter",
}

TZ_KEY = "REMINDER_TZ_OFFSET"


def reminder_tz() -> timezone:
    try:
        return timezone(timedelta(hours=float(get_config(TZ_KEY) or "3")))
    except (TypeError, ValueError):
        return timezone(timedelta(hours=3))


def _notification_type(trigger: str) -> str:
    return TRIGGER_NOTIFICATION_TYPES.get(trigger, trigger)


def _bool_config(key: str, default: str = "false") -> bool:
    return (get_config(key) or default).lower() == "true"


def _int_config(key: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(get_config(key) or default)))
    except (TypeError, ValueError):
        return default


def _int_list_config(key: str, default: list) -> list:
    parts = [p.strip() for p in (get_config(key) or "").split(",") if p.strip()]
    parsed = [int(p) for p in parts if p.isdigit()]
    return sorted(set(parsed)) if parsed else list(default)


# ---------------------------------------------------------------------------
# Persistance générique des réglages (SystemConfig + cache env)
# ---------------------------------------------------------------------------

async def _persist_settings(settings: dict) -> None:
    from app.models import SystemConfig
    from app.config import CONFIG_DEFINITIONS

    for key, value in settings.items():
        set_config(key, value)
        try:
            row = await SystemConfig.get_or_none(key=key)
            if row:
                row.value = value
                await row.save()
            else:
                meta = CONFIG_DEFINITIONS[key]
                await SystemConfig.create(
                    key=key, value=value,
                    category=meta["category"], description=meta["description"],
                )
        except Exception as e:
            print(f"[CONFIG] Erreur sauvegarde {key}: {e}")


# ---------------------------------------------------------------------------
# Journalisation unifiée (cron + manuel)
# ---------------------------------------------------------------------------

async def log_trigger_execution(
    trigger: str,
    trigger_type: str = "CRON",
    status: str = "SENT",
    scheduled_for: datetime = None,
    recipient: str = "",
    summary: dict | list | None = None,
    total_count: int = 0,
    error_message: str | None = None,
    sent_at: datetime = None,
    created_by: User = None,
) -> PrimeReminderExecution:
    """Journalise une exécution (cron ou manuelle) d'un déclencheur."""
    now = datetime.now(reminder_tz())
    return await PrimeReminderExecution.create(
        notification_type=_notification_type(trigger),
        trigger_type=trigger_type,
        scheduled_for=scheduled_for or now,
        recipient=recipient or "",
        status=status,
        summary=summary,
        total_count=total_count,
        sent_at=sent_at or now,
        error_message=error_message,
        created_by=created_by,
    )


# ---------------------------------------------------------------------------
# Prochaine exécution (affichage admin)
# ---------------------------------------------------------------------------

def daily_next_run(now: datetime = None) -> datetime | None:
    now = now or datetime.now(reminder_tz())
    hour = _int_config("REMINDER_HOUR", 8, 0, 23)
    minute = _int_config("REMINDER_MINUTE", 30, 0, 59)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target


def deadline_next_run(now: datetime = None) -> datetime | None:
    now = now or datetime.now(reminder_tz())
    days = _int_list_config("REMINDER_DEADLINE_DAYS", [5, 10, 15])
    hours = _int_list_config("REMINDER_DEADLINE_HOURS", [8, 17])
    candidates = []
    for day in days:
        for hour in hours:
            for offset in range(0, 367):
                d = now + timedelta(days=offset)
                try:
                    target = d.replace(day=max(1, min(28, day)), hour=hour, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue
                if target > now:
                    candidates.append(target)
                    break
    return min(candidates) if candidates else None


def dg_next_run(now: datetime = None) -> datetime | None:
    from app.prime_reminder_service import prime_reminder_next_execution
    return prime_reminder_next_execution(now)


def rh_next_run(now: datetime = None) -> datetime | None:
    from app.prime_reminder_service import rh_reminder_next_execution
    return rh_reminder_next_execution(now)


NEXT_RUN_FNS = {
    "daily": daily_next_run,
    "deadline": deadline_next_run,
    "dg": dg_next_run,
    "rh": rh_next_run,
}


# ---------------------------------------------------------------------------
# Configuration par déclencheur
# ---------------------------------------------------------------------------

async def trigger_config(trigger: str) -> dict:
    if trigger == "daily":
        return {
            "enabled": _bool_config("REMINDER_ENABLED"),
            "hour": _int_config("REMINDER_HOUR", 8, 0, 23),
            "minute": _int_config("REMINDER_MINUTE", 30, 0, 59),
            "tz_offset": float(get_config(TZ_KEY) or 3),
            "next_run": daily_next_run(),
            "recipients_hint": "Un email par acteur concerné (Directeur du département, DG, DRH) — aucune adresse à configurer.",
        }
    if trigger == "deadline":
        day = _int_config("REMINDER_DEADLINE_DAY", 20, 1, 28)
        return {
            "enabled": _bool_config("REMINDER_DEADLINE_ENABLED"),
            "deadline_day": day,
            "days": _int_list_config("REMINDER_DEADLINE_DAYS", [5, 10, 15]),
            "hours": _int_list_config("REMINDER_DEADLINE_HOURS", [8, 17]),
            "tz_offset": float(get_config(TZ_KEY) or 3),
            "next_run": deadline_next_run(),
            "recipients_hint": "Un email par destinataire concerné (N+1, N+2, Directeur du département) — aucune adresse à configurer.",
        }
    if trigger == "dg":
        from app.prime_reminder_service import prime_reminder_config
        return await prime_reminder_config()
    if trigger == "rh":
        from app.prime_reminder_service import rh_reminder_config
        return await rh_reminder_config()
    raise ValueError(f"Déclencheur inconnu : {trigger}")


async def save_daily_config(enabled: bool, hour: int, minute: int) -> dict:
    await _persist_settings({
        "REMINDER_ENABLED": "true" if enabled else "false",
        "REMINDER_HOUR": str(max(0, min(23, int(hour)))),
        "REMINDER_MINUTE": str(max(0, min(59, int(minute)))),
    })
    return await trigger_config("daily")


async def save_deadline_config(enabled: bool, deadline_day: int, days: list, hours: list) -> dict:
    await _persist_settings({
        "REMINDER_DEADLINE_ENABLED": "true" if enabled else "false",
        "REMINDER_DEADLINE_DAY": str(max(1, min(28, int(deadline_day)))),
        "REMINDER_DEADLINE_DAYS": ",".join(str(max(1, min(28, int(d)))) for d in days),
        "REMINDER_DEADLINE_HOURS": ",".join(str(max(0, min(23, int(h)))) for h in hours),
    })
    return await trigger_config("deadline")


SAVE_CONFIG_FNS = {
    "daily": save_daily_config,
    "deadline": save_deadline_config,
    "dg": None,  # géré par prime_reminder_save_config
    "rh": None,  # géré par rh_reminder_save_config
}


# ---------------------------------------------------------------------------
# Envoi manuel (journalisé)
# ---------------------------------------------------------------------------

async def _send_daily_manual(user: User) -> dict:
    from app.scheduler import send_daily_reminders
    result = await send_daily_reminders()
    sent, failed = result.get("emails_sent", 0), result.get("emails_failed", 0)
    status = "FAILED" if (sent == 0 and failed > 0) else "SENT"
    await log_trigger_execution(
        "daily", trigger_type="MANUAL", status=status,
        recipient=f"{sent + failed} email(s)",
        summary={"emails_sent": sent, "emails_failed": failed},
        total_count=sent,
        created_by=user,
    )
    return {
        "status": "sent" if status == "SENT" else "failed",
        "message": f"{sent} email(s) envoyé(s), {failed} échec(s)"
        if (sent or failed) else "Aucune prime en attente — aucun email envoyé",
        "stats": {"emails_sent": sent, "emails_failed": failed},
    }


async def _send_deadline_manual(user: User) -> dict:
    from app.scheduler import send_deadline_reminders
    result = await send_deadline_reminders()
    sent, failed = result.get("emails_sent", 0), result.get("emails_failed", 0)
    status = "FAILED" if (sent == 0 and failed > 0) else "SENT"
    await log_trigger_execution(
        "deadline", trigger_type="MANUAL", status=status,
        recipient=f"{sent + failed} email(s)",
        summary={
            "wave": result.get("wave"),
            "deadline": result.get("deadline"),
            "emails_sent": sent, "emails_failed": failed,
        },
        total_count=sent,
        created_by=user,
    )
    return {
        "status": "sent" if status == "SENT" else "failed",
        "message": f"{result.get('wave')} — {sent} email(s) envoyé(s), {failed} échec(s)"
        if (sent or failed) else "Aucune validation en attente — aucun email envoyé",
        "stats": {"emails_sent": sent, "emails_failed": failed, "wave": result.get("wave")},
    }


async def _send_dg_manual(user: User) -> dict:
    from app.prime_reminder_service import prime_reminder_send_manual
    return await prime_reminder_send_manual(user)


async def _send_rh_manual(user: User) -> dict:
    from app.prime_reminder_service import rh_reminder_send_manual
    return await rh_reminder_send_manual(user)


SEND_FNS = {
    "daily": _send_daily_manual,
    "deadline": _send_deadline_manual,
    "dg": _send_dg_manual,
    "rh": _send_rh_manual,
}


async def trigger_send_now(trigger: str, user: User = None) -> dict:
    fn = SEND_FNS.get(trigger)
    if not fn:
        raise ValueError(f"Déclencheur inconnu : {trigger}")
    return await fn(user)


# ---------------------------------------------------------------------------
# Aperçu du template (aucun envoi)
# ---------------------------------------------------------------------------

_REPRESENTATIVE_ITEMS = [
    {"employee_name": "Rakoto Jean", "type_label": "Astreinte",
     "amount": "50 000 Ar", "status_label": "Validation Directeur",
     "url": "#"},
    {"employee_name": "Ravao Marie", "type_label": "Prime mensuelle",
     "amount": "120 000 Ar", "status_label": "Validation DG",
     "url": "#"},
    {"employee_name": "Randria Paul", "type_label": "Intervention",
     "amount": "35 000 Ar", "status_label": "Traitement DRH",
     "url": "#"},
]

_REPRESENTATIVE_SECTIONS = [
    {"department": "DO", "bonus_type": "astreinte", "bonus_type_label": "Astreinte", "count": 12},
    {"department": "BBS", "bonus_type": "astreinte", "bonus_type_label": "Astreinte", "count": 8},
    {"department": "DO", "bonus_type": "intervention", "bonus_type_label": "Intervention", "count": 5},
]


async def trigger_preview(trigger: str) -> dict:
    """Aperçu du template réel avec données réelles si disponibles."""
    cfg = _smtp_config()

    if trigger == "daily":
        from app.scheduler import collect_pending_by_actor
        actors = await collect_pending_by_actor()
        sample = next((e["items"] for e in actors.values() if e["items"]), None)
        using_real = sample is not None
        items = sample or _REPRESENTATIVE_ITEMS
        to_name = next((e["user"].name for e in actors.values() if e["items"]), "Directeur")
        subject, plain, html = render_validation_reminder_email(cfg, to_name, items)
        return {
            "subject": subject, "plain": plain, "html": html,
            "stats": {"destinataires": len(actors), "primes": sum(len(e["items"]) for e in actors.values())},
            "using_real_data": using_real,
        }

    if trigger == "deadline":
        from app.scheduler import collect_deadline_pending_by_actor, _deadline_label, _wave_label
        actors = await collect_deadline_pending_by_actor()
        sample = next((e["items"] for e in actors.values() if e["items"]), None)
        using_real = sample is not None
        items = sample or _REPRESENTATIVE_ITEMS
        to_name = next((e["user"].name for e in actors.values() if e["items"]), "Responsable")
        now = datetime.now(reminder_tz())
        subject, plain, html = render_deadline_reminder_email(
            cfg, to_name, _wave_label(now.day), _deadline_label(now), items,
        )
        return {
            "subject": subject, "plain": plain, "html": html,
            "stats": {"destinataires": len(actors), "primes": sum(len(e["items"]) for e in actors.values())},
            "using_real_data": using_real,
        }

    if trigger == "dg":
        from app.prime_reminder_service import prime_reminder_preview
        data = await prime_reminder_preview()
        return {
            "subject": data["subject"], "plain": data["plain"], "html": data["html"],
            "stats": {"destinataires": None, "primes": data["total_count"]},
            "using_real_data": data["using_real_data"],
        }

    if trigger == "rh":
        from app.prime_reminder_service import rh_reminder_preview
        data = await rh_reminder_preview()
        return {
            "subject": data["subject"], "plain": data["plain"], "html": data["html"],
            "stats": {"destinataires": None, "primes": data["total_count"]},
            "using_real_data": data["using_real_data"],
        }

    raise ValueError(f"Déclencheur inconnu : {trigger}")


# ---------------------------------------------------------------------------
# Historique unifié
# ---------------------------------------------------------------------------

async def trigger_executions(trigger: str, status: str = None, page: int = 1, size: int = 20) -> dict:
    qs = PrimeReminderExecution.filter(notification_type=_notification_type(trigger))
    if status:
        qs = qs.filter(status=status.upper())
    total = await qs.count()
    rows = await qs.order_by("-created_at").offset((page - 1) * size).limit(size)
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [_execution_dict(r) for r in rows],
    }


def _execution_dict(e: PrimeReminderExecution) -> dict:
    return {
        "id": e.id,
        "notification_type": e.notification_type,
        "trigger_type": e.trigger_type,
        "scheduled_for": e.scheduled_for.isoformat() if e.scheduled_for else None,
        "recipient": e.recipient,
        "status": e.status,
        "summary": e.summary,
        "total_count": e.total_count,
        "sent_at": e.sent_at.isoformat() if e.sent_at else None,
        "error_message": e.error_message,
        "created_by": e.created_by_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ---------------------------------------------------------------------------
# Vue d'ensemble (cartes de la page admin)
# ---------------------------------------------------------------------------

async def triggers_overview() -> list:
    result = []
    for trigger, label in TRIGGER_LABELS.items():
        cfg = await trigger_config(trigger)
        last = await PrimeReminderExecution.filter(
            notification_type=_notification_type(trigger),
        ).order_by("-created_at").first()

        # Réglages affichés sous forme de texte court
        if trigger == "daily":
            schedule = f"Tous les jours à {cfg['hour']:02d}h{cfg['minute']:02d}"
            details = {"Heure d'envoi": f"{cfg['hour']:02d}:{cfg['minute']:02d}"}
        elif trigger == "deadline":
            schedule = f"Jours {', '.join(str(d) for d in cfg['days'])} à {', '.join(str(h) + 'h' for h in cfg['hours'])}"
            details = {
                "Date limite": f"le {cfg['deadline_day']} du mois",
                "Jours de rappel": ", ".join(str(d) for d in cfg["days"]),
                "Heures": ", ".join(f"{h:02d}h" for h in cfg["hours"]),
            }
        elif trigger == "dg":
            days = cfg.get("days") or []
            hours = cfg.get("hours") or []
            schedule = f"Jours {', '.join(str(d) for d in days)} à {', '.join(str(h) + 'h' for h in hours)}"
            details = {
                "Jours du mois": ", ".join(str(d) for d in days) or "—",
                "Heures": ", ".join(f"{h:02d}h" for h in hours) or "—",
                "Destinataires": cfg.get("recipient") or "Aucun compte DG",
            }
        else:  # rh
            days = cfg.get("days") or []
            hours = cfg.get("hours") or []
            schedule = f"Jours {', '.join(str(d) for d in days)} à {', '.join(str(h) + 'h' for h in hours)}"
            details = {
                "Jours du mois": ", ".join(str(d) for d in days) or "—",
                "Heures": ", ".join(f"{h:02d}h" for h in hours) or "—",
                "Destinataires": cfg.get("recipient") or "Aucun compte RH",
            }

        result.append({
            "key": trigger,
            "label": label,
            "enabled": bool(cfg.get("enabled")),
            "schedule": schedule,
            "details": details,
            "recipients_hint": cfg.get("recipients_hint"),
            "next_run": NEXT_RUN_FNS[trigger](),
            "last_execution": _execution_dict(last) if last else None,
        })
    return result
