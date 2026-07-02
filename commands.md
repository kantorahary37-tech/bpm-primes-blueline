Seeds commands :

Ajout des montants de plafond des primes et des données d'utilisateurs

```Shell
docker compose exec backend python -m scripts.seed_plafonds
docker compose exec backend python -m scripts.seed_data
```

Lancement de Docker en dev mode :

```Shell
docker compose up
```

Lancemende de Docker en prod mode (server use only)

```Shell
docker compose -f docker-compose.prod.yml up --build
```
