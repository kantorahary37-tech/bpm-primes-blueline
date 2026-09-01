Seeds commands :

Ajout des montants de plafond des primes et des données d'utilisateurs

```Shell
docker compose exec backend python -m scripts.sync_ldap
docker compose exec backend python -m scripts.seed_plafonds
docker compose exec backend python -m scripts.seed_bonuses
docker compose exec backend python -m scripts.seed_commission_config
```

Génération de primes factices (test des filtres / tri / recherche) avec données
réalistes via Faker — 5 primes par département couvrant mensuel / astreinte /
commission et tous les statuts :

```Shell
docker compose exec backend python -m scripts.seed_fake_bonuses          # ajoute 5 primes/dépt
docker compose exec backend python -m scripts.seed_fake_bonuses --clean  # supprime tout puis re-seed
```

Lancement de Docker en dev mode :

```Shell
docker compose up
```

Lancemende de Docker en prod mode (server use only)

```Shell
docker compose -f docker-compose.prod.yml up --build
```

Backup / Restore base de données :

```Shell
./backup.sh backup              # créer un dump → backups/dump-bpm_primes_db-<timestamp>.sql
./backup.sh restore <file>      # restaurer depuis un fichier de dump
./backup.sh list                # lister les sauvegardes disponibles
```

Envoi manuel des rappels de validation de primes (email aux acteurs N+1 / Directeur / DG
ayant des primes en attente — identique au rappel automatique quotidien de 08h30) :

```Shell
docker compose exec backend python -m scripts.send_reminder
```

Suppression de toutes les primes (et validations, logs, notifications) :

```Shell
docker compose exec backend python -m scripts.delete_all_bonuses
```

> Configuration emails (mode test vs production) : voir [README.md](README.md).
