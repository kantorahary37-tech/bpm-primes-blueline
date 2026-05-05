# Configuration de l'ORM Tortoise pour la connexion à PostgreSQL
TORTOISE_ORM = {
    # Section des connexions à la base de données
    "connections": {
        # Connexion par défaut : format postgres://user:password@host:port/dbname
        "default": "postgres://postgres:mysecretpassword@localhost:5432/bpm_primes_db"
    },
    # Configuration des applications utilisant Tortoise
    "apps": {
        "models": {
            # Modules contenant les modèles (tes classes de tables + Aerich)
            "models": ["app.models", "aerich.models"],
            # Connexion associée à cette application
            "default_connection": "default",
        }
    },
}
