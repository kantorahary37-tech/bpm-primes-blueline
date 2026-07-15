# Import de FastAPI pour créer l'application web
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
# Import de l'extension Tortoise pour FastAPI (gestion auto de l'ORM)
from tortoise.contrib.fastapi import register_tortoise
from tortoise.exceptions import IntegrityError, DoesNotExist
import re
# Import de la config de base de données
from app.db_config import TORTOISE_ORM
# Import des routes API
from app.api import endpoints, employees, auth_routes, users, prime_max, departments, notifications, upload, admin

# Création de l'instance FastAPI avec titre et version
app = FastAPI(title="BPM Primes API", version="1.0.0")

# Inclusion des routes de l'API avec préfixe /api/v1
app.include_router(endpoints.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1/employees")
app.include_router(users.router, prefix="/api/v1/users")
app.include_router(auth_routes.router, prefix="/api/v1/auth")
app.include_router(prime_max.router, prefix="/api/v1/primemax")
app.include_router(departments.router, prefix="/api/v1/departments")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1/admin")

import os
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)

# Enregistrement de Tortoise ORM avec FastAPI
register_tortoise(app, config=TORTOISE_ORM, add_exception_handlers=False)

TABLE_LABELS = {
    "employee": "employé", "user": "utilisateur", "bonus": "prime",
    "validation": "validation", "primemax": "prime max",
}
FIELD_LABELS = {
    "employee_id": "employé", "user_id": "utilisateur", "bonus_id": "prime",
    "validator_id": "validateur", "manager_id": "manager",
    "created_by_id": "créateur", "set_by_id": "administrateur", "email": "email",
}

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    msg = str(exc)
    if "violates foreign key constraint" in msg:
        m = re.search(r'Key \((\w+)\)=\(([^)]+)\).*table "(\w+)"', msg)
        if m:
            field, value, table = m.group(1), m.group(2), m.group(3)
            label = FIELD_LABELS.get(field, field)
            table_label = TABLE_LABELS.get(table, table)
            return JSONResponse(status_code=400, content={"detail": f"{label.capitalize()} (ID {value}) introuvable dans la table {table_label}."})
        return JSONResponse(status_code=400, content={"detail": "Référence invalide : l'enregistrement lié n'existe pas."})
    if "duplicate key" in msg or "unique constraint" in msg:
        m = re.search(r'Key \((\w+)\)=\(([^)]+)\)', msg)
        if m:
            field, value = m.group(1), m.group(2)
            label = FIELD_LABELS.get(field, field)
            return JSONResponse(status_code=409, content={"detail": f"{label.capitalize()} '{value}' déjà existant."})
        return JSONResponse(status_code=409, content={"detail": "Conflit : cet enregistrement existe déjà."})
    return JSONResponse(status_code=400, content={"detail": "Données invalides."})

# Gestionnaire global : enregistrement introuvable
@app.exception_handler(DoesNotExist)
async def does_not_exist_handler(request: Request, exc: DoesNotExist):
    return JSONResponse(status_code=404, content={"detail": "Ressource introuvable."})
