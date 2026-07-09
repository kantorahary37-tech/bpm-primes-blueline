Seeds commands :

Ajout des montants de plafond des primes et des données d'utilisateurs

```Shell
docker compose exec backend python -m scripts.sync_ldap
docker compose exec backend python -m scripts.seed_plafonds
docker compose exec backend python -m scripts.seed_bonuses
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
