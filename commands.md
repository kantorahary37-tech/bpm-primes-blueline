Seeds commands :

```Shell
docker compose exec backend python -m scripts.seed_plafonds
```

Lancement de Docker en dev mode :

```Shell
docker compose up
```

Lancemende de Docker en prod mode (server use only)

```Shell
docker compose -f docker-compose.prod.yml up --build
```
