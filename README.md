# BPM Primes Blueline

Application de gestion des primes (backend FastAPI + Tortoise ORM, frontend React).

## Configuration des emails (.env)

Le fichier `backend/.env` contrôle l'envoi des emails (réinitialisation mot de passe,
notifications de primes, rappels quotidiens de validation).

### Mode TEST vs mode PRODUCTION

| Variable | Valeur | Effet |
|---|---|---|
| `TEST_MODE` | `true` | **Tous** les emails sont redirigés vers `TEST_EMAIL` (aucun mail réel aux utilisateurs) |
| `TEST_MODE` | `false` | **Production** : les emails partent vers les vrais destinataires |
| `TEST_EMAIL` | 1 ou plusieurs adresses | Boîte(s) de réception de test. Plusieurs adresses séparées par des virgules : `a@blueline.mg,b@blueline.mg` |

> **Passer en production** : mettre `TEST_MODE=false` dans `backend/.env`, puis redémarrer
> le backend (`docker compose restart backend`). Penser aussi à vérifier les variables ci-dessous.

### Variables SMTP

```ini
SMTP_HOST=smtp.blueline.mg          # serveur SMTP interne
SMTP_PORT=25                        # port SMTP (STARTTLS)
SMTP_USER=zato@staff.blueline.mg    # compte d'envoi
SMTP_PASSWORD=...                   # mot de passe du compte
SMTP_FROM_EMAIL=bpm@si.blueline.mg  # adresse expéditeur affichée
SMTP_FROM_NAME=BPM | Gestion de Prime
```

### Liens dans les emails

```ini
FRONTEND_URL=https://uat-primes.malagasy.com   # utilisée pour construire les liens /bonuses/{id}
```

> Si `FRONTEND_URL` est absente ou fausse, les liens des emails pointent vers une mauvaise adresse.

### Rappels quotidiens de validation (08h30)

Chaque matin, un email est envoyé à chaque acteur (N+1, Directeur, DG) ayant des primes
en attente de sa validation, avec la liste des liens pour traiter.

```ini
REMINDER_ENABLED=true       # false = désactive complètement le planificateur
REMINDER_HOUR=8             # heure d'envoi (heure locale)
REMINDER_MINUTE=30          # minutes
REMINDER_TZ_OFFSET=3        # fuseau UTC+3 (Antananarivo)
```

Envoi manuel sans attendre 08h30 :

```Shell
docker compose exec backend python -m scripts.send_reminder
# ou backend arrêté :
docker compose run --rm backend python -m scripts.send_reminder
```

## Commandes utiles

Voir [commands.md](commands.md) (seeds, Docker dev/prod, backup/restore).
