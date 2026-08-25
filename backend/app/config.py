"""
Centralized config accessor — reads from DB first, falls back to os.environ.
All env var reads in the codebase should go through get_config() for hot-reload.
"""
import os
from tortoise.exceptions import DoesNotExist

# Cache so we don't hit DB on every call in hot paths
_cache: dict[str, str] = {}

# Definition of all config keys with defaults, categories and descriptions
CONFIG_DEFINITIONS = {
    # ── Database ──
    "DATABASE_URL": {"category": "database", "description": "URL de connexion PostgreSQL", "default": ""},
    "DB_HOST": {"category": "database", "description": "Hôte de la base de données", "default": "db"},
    "DB_PORT": {"category": "database", "description": "Port de la base de données", "default": "5432"},

    # ── Auth / JWT ──
    "SECRET_KEY": {"category": "auth", "description": "Clé secrète JWT (ne pas partager)", "default": ""},
    "ALGORITHM": {"category": "auth", "description": "Algorithme de signature JWT", "default": "HS256"},
    "ACCESS_TOKEN_EXPIRE_MINUTES": {"category": "auth", "description": "Durée de vie du token (minutes)", "default": "1440"},

    # ── Frontend ──
    "FRONTEND_URL": {"category": "auth", "description": "URL du frontend (liens dans les emails)", "default": "http://localhost:5173"},

    # ── Email (SMTP) ──
    "SMTP_HOST": {"category": "email", "description": "Serveur SMTP", "default": "smtp.blueline.mg"},
    "SMTP_PORT": {"category": "email", "description": "Port SMTP", "default": "25"},
    "SMTP_USER": {"category": "email", "description": "Utilisateur SMTP", "default": "zato@staff.blueline.mg"},
    "SMTP_PASSWORD": {"category": "email", "description": "Mot de passe SMTP", "default": ""},
    "SMTP_FROM_EMAIL": {"category": "email", "description": "Email expéditeur", "default": "bpm@si.blueline.mg"},
    "SMTP_FROM_NAME": {"category": "email", "description": "Nom de l'expéditeur", "default": "BPM | Gestion de Prime"},
    "TEST_MODE": {"category": "email", "description": "Mode test (redirige les emails)", "default": "true"},
    "TEST_EMAIL": {"category": "email", "description": "Email(s) de test (séparés par virgule)", "default": ""},

    # ── Reminders ──
    "REMINDER_ENABLED": {"category": "reminders", "description": "Activer les rappels quotidiens", "default": "false"},
    "REMINDER_HOUR": {"category": "reminders", "description": "Heure d'envoi des rappels (0-23)", "default": "8"},
    "REMINDER_MINUTE": {"category": "reminders", "description": "Minute d'envoi des rappels (0-59)", "default": "30"},
    "REMINDER_TZ_OFFSET": {"category": "reminders", "description": "Décalage horaire UTC", "default": "3"},
    "REMINDER_RUN_ON_STARTUP": {"category": "reminders", "description": "Envoyer un rappel au démarrage", "default": "false"},

    # ── LDAP ──
    "LDAP_SERVER_URI": {"category": "ldap", "description": "URI du serveur LDAP", "default": "ldap://ldap.blueline.mg:389"},
    "LDAP_BIND_DN": {"category": "ldap", "description": "DN de connexion LDAP", "default": "cn=admin,dc=blueline,dc=mg"},
    "LDAP_BIND_PASSWORD": {"category": "ldap", "description": "Mot de passe LDAP", "default": ""},
    "LDAP_USER_SEARCH_BASE": {"category": "ldap", "description": "Base de recherche LDAP", "default": "dc=blueline,dc=mg"},
    "USE_LDAP_PASSWORD": {"category": "ldap", "description": "Utiliser le mot de passe LDAP pour l'auth", "default": "false"},

    # ── SFTP ──
    "SFTP_HOST": {"category": "sftp", "description": "Hôte du serveur SFTP (4D)", "default": "192.168.1.104"},
    "SFTP_PORT": {"category": "sftp", "description": "Port SFTP", "default": "22"},
    "SFTP_USERNAME": {"category": "sftp", "description": "Utilisateur SFTP", "default": "4dprime"},
    "SFTP_PASSWORD": {"category": "sftp", "description": "Mot de passe SFTP", "default": ""},
    "SFTP_MAX_DOWNLOAD": {"category": "sftp", "description": "Taille max de téléchargement (octets)", "default": "52428800"},
}

CATEGORY_LABELS = {
    "database": "Base de données",
    "auth": "Authentification",
    "email": "Email (SMTP)",
    "reminders": "Rappels quotidiens",
    "ldap": "LDAP",
    "sftp": "SFTP (serveur 4D)",
}


def get_config(key: str) -> str:
    """Get a config value — DB first, cache, then os.environ fallback."""
    if key in _cache:
        return _cache[key]
    val = os.environ.get(key, "")
    _cache[key] = val
    return val


def set_config(key: str, value: str) -> None:
    """Update a config value in DB and os.environ (immediate effect)."""
    _cache[key] = value
    os.environ[key] = value


def invalidate_cache(key: str = None) -> None:
    """Clear cache for a key or the entire cache."""
    if key:
        _cache.pop(key, None)
    else:
        _cache.clear()


async def load_configs_to_env() -> None:
    """Load all SystemConfig rows into os.environ + cache. Called at startup."""
    from app.models import SystemConfig
    try:
        rows = await SystemConfig.all()
        for row in rows:
            os.environ[row.key] = row.value
            _cache[row.key] = row.value
        print(f"[CONFIG] {len(rows)} configuration(s) chargée(s) depuis la base de données")
    except Exception as e:
        print(f"[CONFIG] Impossible de charger la config depuis la DB: {e}")


async def seed_config_from_env() -> None:
    """Insert config definitions into DB if they don't exist yet. Called at startup."""
    from app.models import SystemConfig
    try:
        existing = {row.key for row in await SystemConfig.all().only("key")}
        to_create = []
        for key, meta in CONFIG_DEFINITIONS.items():
            if key not in existing:
                value = os.environ.get(key, meta["default"])
                to_create.append(SystemConfig(
                    key=key,
                    value=value,
                    category=meta["category"],
                    description=meta["description"],
                ))
        if to_create:
            await SystemConfig.bulk_create(to_create)
            print(f"[CONFIG] {len(to_create)} configuration(s) initialisée(s) depuis .env")
    except Exception as e:
        print(f"[CONFIG] Erreur lors du seed de la config: {e}")
