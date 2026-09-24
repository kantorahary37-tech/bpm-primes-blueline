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
    "DATABASE_URL": {"category": "database", "type": "string", "description": "URL de connexion PostgreSQL", "default": ""},
    "DB_HOST": {"category": "database", "type": "string", "description": "Hôte de la base de données", "default": "db"},
    "DB_PORT": {"category": "database", "type": "number", "description": "Port de la base de données", "default": "5432"},

    # ── Auth / JWT ──
    "SECRET_KEY": {"category": "auth", "type": "password", "description": "Clé secrète JWT (ne pas partager)", "default": ""},
    "ALGORITHM": {"category": "auth", "type": "string", "description": "Algorithme de signature JWT", "default": "HS256"},
    "ACCESS_TOKEN_EXPIRE_MINUTES": {"category": "auth", "type": "number", "description": "Durée de vie du token (minutes)", "default": "1440"},

    # ── Frontend ──
    "FRONTEND_URL": {"category": "auth", "type": "string", "description": "URL du frontend (liens dans les emails)", "default": "http://localhost:5173"},

    # ── Email (SMTP) ──
    "SMTP_HOST": {"category": "email", "type": "string", "description": "Serveur SMTP", "default": "smtp.blueline.mg"},
    "SMTP_PORT": {"category": "email", "type": "number", "description": "Port SMTP", "default": "25"},
    "SMTP_USER": {"category": "email", "type": "string", "description": "Utilisateur SMTP", "default": "zato@staff.blueline.mg"},
    "SMTP_PASSWORD": {"category": "email", "type": "password", "description": "Mot de passe SMTP", "default": ""},
    "SMTP_FROM_EMAIL": {"category": "email", "type": "string", "description": "Email expéditeur", "default": "bpm@si.blueline.mg"},
    "SMTP_FROM_NAME": {"category": "email", "type": "string", "description": "Nom de l'expéditeur", "default": "BPM | Gestion de Prime"},
    "TEST_MODE": {"category": "email", "type": "boolean", "description": "Mode test (redirige les emails vers TEST_EMAIL)", "default": "true"},
    "TEST_EMAIL": {"category": "email", "type": "string", "description": "Email(s) de test (séparés par virgule)", "default": ""},
    "USER_MAIL_TEST_MODE": {"category": "email", "type": "boolean", "description": "En mode test, envoyer également aux adresses réelles des destinataires (contenu test conservé)", "default": "false"},

    # ── Reminders ──
    "REMINDER_ENABLED": {"category": "reminders", "type": "boolean", "description": "Activer les rappels quotidiens", "default": "false"},
    "REMINDER_HOUR": {"category": "reminders", "type": "number", "description": "Heure d'envoi des rappels (0-23)", "default": "8"},
    "REMINDER_MINUTE": {"category": "reminders", "type": "number", "description": "Minute d'envoi des rappels (0-59)", "default": "30"},
    "REMINDER_TZ_OFFSET": {"category": "reminders", "type": "number", "description": "Décalage horaire UTC", "default": "3"},
    "REMINDER_RUN_ON_STARTUP": {"category": "reminders", "type": "boolean", "description": "Envoyer un rappel au démarrage", "default": "false"},

    # ── Rappel date limite (finalisation des validations le 20 du mois) ──
    "REMINDER_DEADLINE_ENABLED": {"category": "reminders", "type": "boolean", "description": "Activer les rappels de la date limite de validation (5, 10 & 15 du mois)", "default": "false"},
    "REMINDER_DEADLINE_DAY": {"category": "reminders", "type": "number", "description": "Date limite de finalisation des validations (jour du mois)", "default": "20"},
    "REMINDER_DEADLINE_DAYS": {"category": "reminders", "type": "string", "description": "Jours des rappels dans le mois (séparés par virgule)", "default": "5,10,15"},
    "REMINDER_DEADLINE_HOURS": {"category": "reminders", "type": "string", "description": "Heures d'envoi des rappels dans la journée (séparées par virgule)", "default": "8,17"},

    # ── Rappel DG des primes en cours de validation (résumé groupé) ──
    "PRIME_REMINDER_ENABLED": {"category": "reminders", "type": "boolean", "description": "Activer le rappel DG des primes en cours de validation", "default": "false"},
    "PRIME_REMINDER_DAYS": {"category": "reminders", "type": "string", "description": "Jours du mois d'envoi du rappel DG (séparés par virgule)", "default": "15,20"},
    "PRIME_REMINDER_HOURS": {"category": "reminders", "type": "string", "description": "Heures d'envoi du rappel DG dans la journée (séparées par virgule)", "default": "8,17"},
    "PRIME_REMINDER_RECIPIENT": {"category": "reminders", "type": "string", "description": "Destinataire(s) du rappel DG (emails séparés par virgule ; vide = compte(s) DG de l'application)", "default": ""},

    # ── LDAP ──
    "LDAP_SERVER_URI": {"category": "ldap", "type": "string", "description": "URI du serveur LDAP", "default": "ldap://ldap.blueline.mg:389"},
    "LDAP_BIND_DN": {"category": "ldap", "type": "string", "description": "DN de connexion LDAP", "default": "cn=admin,dc=blueline,dc=mg"},
    "LDAP_BIND_PASSWORD": {"category": "ldap", "type": "password", "description": "Mot de passe LDAP", "default": ""},
    "LDAP_USER_SEARCH_BASE": {"category": "ldap", "type": "string", "description": "Base de recherche LDAP", "default": "dc=blueline,dc=mg"},
    "USE_LDAP_PASSWORD": {"category": "ldap", "type": "boolean", "description": "Utiliser le mot de passe LDAP pour l'auth", "default": "false"},

    # ── SFTP ──
    "SFTP_HOST": {"category": "sftp", "type": "string", "description": "Hôte du serveur SFTP (4D)", "default": "192.168.1.104"},
    "SFTP_PORT": {"category": "sftp", "type": "number", "description": "Port SFTP", "default": "22"},
    "SFTP_USERNAME": {"category": "sftp", "type": "string", "description": "Utilisateur SFTP", "default": "4dprime"},
    "SFTP_PASSWORD": {"category": "sftp", "type": "password", "description": "Mot de passe SFTP", "default": ""},
    "SFTP_MAX_DOWNLOAD": {"category": "sftp", "type": "number", "description": "Taille max de téléchargement (octets)", "default": "52428800"},
    "SFTP_POOL_SIZE": {"category": "sftp", "type": "number", "description": "Nb de connexions SFTP conservées ouvertes entre les requêtes (évite de se reconnecter à chaque appel)", "default": "2"},
    "SFTP_CONNECTION_TTL": {"category": "sftp", "type": "number", "description": "Durée de vie max d'une connexion SFTP avant reconnexion (secondes)", "default": "900"},
    "SFTP_LIST_CACHE_TTL": {"category": "sftp", "type": "number", "description": "Validité du cache des listes de dossiers SFTP (secondes, 0 = désactivé)", "default": "30"},
    "SFTP_CACHE_ENABLED": {"category": "sftp", "type": "boolean", "description": "Mettre en cache localement les fichiers SFTP téléchargés (réutilisation sans redownload)", "default": "true"},
    "SFTP_CACHE_TTL": {"category": "sftp", "type": "number", "description": "Validité du cache local des fichiers SFTP (secondes)", "default": "3600"},
    "SFTP_CACHE_DIR": {"category": "sftp", "type": "string", "description": "Dossier local du cache SFTP (vide = dossier par défaut du serveur)", "default": ""},

    # ── Backups ──
    "BACKUP_ENABLED": {"category": "backups", "type": "boolean", "description": "Activer les sauvegardes automatiques", "default": "true"},
    "BACKUP_INTERVAL_HOURS": {"category": "backups", "type": "number", "description": "Intervalle entre deux sauvegardes automatiques (heures)", "default": "2"},
    "BACKUP_RETENTION": {"category": "backups", "type": "number", "description": "Nombre maximal de sauvegardes conservées (les plus anciennes sont supprimées)", "default": "6"},
    "BACKUP_LABEL": {"category": "backups", "type": "string", "description": "Libellé des sauvegardes automatiques", "default": "auto"},

    # ── Interface ──
    "SHOW_AMOUNTS": {"category": "interface", "type": "boolean", "description": "Afficher les montants aux utilisateurs (DRH/DG/Admin)", "default": "true"},
    "SHOW_AMOUNTS_DG_DRH": {"category": "interface", "type": "boolean", "description": "Afficher les montants aux DG/DRH/Directeur (désactiver pour masquer même pour DG/DRH)", "default": "true"},
}

CATEGORY_LABELS = {
    "database": "Base de données",
    "auth": "Authentification",
    "email": "Email (SMTP)",
    "reminders": "Rappels (quotidien & date limite)",
    "ldap": "LDAP",
    "sftp": "SFTP (serveur 4D)",
    "backups": "Sauvegardes automatiques",
    "interface": "Interface",
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


async def bootstrap_config() -> None:
    """Point d'entrée unique de chargement de la configuration.

    Initialise les clés manquantes depuis .env puis charge TOUTES les valeurs
    depuis la base de données, qui priment sur le fichier .env. À appeler
    après l'init de Tortoise (et avant toute lecture de config) dans chaque
    processus : application web, scripts d'envoi (send_prime_reminder,
    send_reminder, send_deadline_reminder), CLI, etc. Sans cet appel, un
    processus autonome ne verrait que les valeurs du fichier .env et ignorerait
    la configuration modifiée via l'interface (SystemConfig en DB).
    """
    await seed_config_from_env()
    await load_configs_to_env()


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
