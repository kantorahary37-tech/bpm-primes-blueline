"""
Rate-limiting simple en mémoire pour /auth/login.
Max 5 tentatives échouées par IP → blocage 15 minutes.
"""
import time

MAX_ATTEMPTS = 5
BLOCK_DURATION = 15 * 60  # 15 minutes en secondes

# Stockage en mémoire : {ip: {"count": int, "blocked_until": float}}
_login_attempts = {}


def _cleanup():
    """Supprime les entrées expirées."""
    now = time.time()
    expired = [ip for ip, data in _login_attempts.items()
               if data["count"] >= MAX_ATTEMPTS and now > data["blocked_until"]]
    for ip in expired:
        del _login_attempts[ip]


def check_rate_limit(ip: str) -> tuple[bool, str]:
    """
    Vérifie si l'IP peut tenter un login.
    Retourne (allowed: bool, message: str).
    """
    _cleanup()
    data = _login_attempts.get(ip)

    if not data:
        return True, ""

    now = time.time()

    if data["count"] >= MAX_ATTEMPTS:
        if now < data["blocked_until"]:
            remaining = int(data["blocked_until"] - now)
            minutes = remaining // 60
            seconds = remaining % 60
            return False, f"Trop de tentatives. Réessayez dans {minutes}min {seconds}s."
        else:
            del _login_attempts[ip]
            return True, ""

    return True, ""


def record_failed_attempt(ip: str):
    """Enregistre une tentative échouée."""
    now = time.time()
    data = _login_attempts.get(ip)

    if not data or data["count"] >= MAX_ATTEMPTS:
        _login_attempts[ip] = {"count": 1, "blocked_until": now + BLOCK_DURATION}
    else:
        data["count"] += 1
        if data["count"] >= MAX_ATTEMPTS:
            data["blocked_until"] = now + BLOCK_DURATION


def reset_attempts(ip: str):
    """Remet à zéro après un login réussi."""
    _login_attempts.pop(ip, None)
