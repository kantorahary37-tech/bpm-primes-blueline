from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "department" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(50) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "user" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "poste" VARCHAR(255),
    "department" VARCHAR(50),
    "is_validator_n1" BOOL NOT NULL,
    "is_directeur" BOOL NOT NULL,
    "is_drh" BOOL NOT NULL,
    "is_dg" BOOL NOT NULL,
    "is_admin" BOOL NOT NULL,
    "password_hash" VARCHAR(255),
    "reset_token" VARCHAR(255),
    "reset_token_expires" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,
    "department_id" INT REFERENCES "department" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "employee" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "matricule" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "department" VARCHAR(50) NOT NULL,
    "astreinte_rate" INT,
    "mensuel_rate" INT,
    "is_active" BOOL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "department_id" INT NOT NULL REFERENCES "department" ("id") ON DELETE CASCADE,
    "manager_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "bonus" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "bonus_type" VARCHAR(20) NOT NULL,
    "performance_score" DECIMAL(5,2),
    "absences" INT,
    "retard" INT,
    "prime_mensuel_amount" DECIMAL(15,2),
    "nb_jours_astreinte" INT,
    "taux_jour" DECIMAL(10,2),
    "prime_astreinte_amount" DECIMAL(15,2),
    "ca_realise" DECIMAL(15,2),
    "ca_objectif" DECIMAL(15,2),
    "taux_commission" DECIMAL(10,2),
    "commission_amount" DECIMAL(15,2),
    "total_amount" DECIMAL(15,2) NOT NULL,
    "details" JSONB,
    "was_rejected" BOOL NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "employee_id" INT NOT NULL REFERENCES "employee" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "bonus"."bonus_type" IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission\nINTERVENTION: intervention\nPONCTUELLE: ponctuelle\nEXCEPTIONNEL: exceptionnel';
COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé\nEN_ATTENTE_DIRECTEUR: En attente Directeur\nEN_ATTENTE_DG: En attente DG\nVALIDE: Prime validée\nREJETE: Prime rejetée';
CREATE TABLE IF NOT EXISTS "auditlog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL,
    "bonus_id" INT NOT NULL REFERENCES "bonus" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "notification" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "type" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "bonus_id" INT NOT NULL REFERENCES "bonus" ("id") ON DELETE CASCADE,
    "sender_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "primemax" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "department" VARCHAR(50) NOT NULL,
    "bonus_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "department_id" INT NOT NULL REFERENCES "department" ("id") ON DELETE CASCADE,
    "set_by_id" INT REFERENCES "user" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "primemax"."bonus_type" IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission\nINTERVENTION: intervention\nPONCTUELLE: ponctuelle\nEXCEPTIONNEL: exceptionnel';
CREATE TABLE IF NOT EXISTS "validation" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "step" VARCHAR(50) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "motif_rejet" TEXT,
    "validated_at" TIMESTAMPTZ NOT NULL,
    "bonus_id" INT NOT NULL REFERENCES "bonus" ("id") ON DELETE CASCADE,
    "validator_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSONB NOT NULL
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """


MODELS_STATE = (
    "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"
    "oXtIJLud9j2/1i9u1f5NQ0tA=="
)
