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
    "is_validator_n1" BOOL NOT NULL DEFAULT False,
    "is_directeur" BOOL NOT NULL DEFAULT False,
    "is_drh" BOOL NOT NULL DEFAULT False,
    "is_dg" BOOL NOT NULL DEFAULT False,
    "password_hash" VARCHAR(255),
    "reset_token" VARCHAR(255),
    "reset_token_expires" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department_id" INT REFERENCES "department" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "employee" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "matricule" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "department" VARCHAR(50) NOT NULL,
    "astreinte_rate" INT,
    "mensuel_rate" INT,
    "is_active" BOOL NOT NULL DEFAULT True,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "was_rejected" BOOL NOT NULL DEFAULT False,
    "paid_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Initialisé',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "employee_id" INT NOT NULL REFERENCES "employee" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "bonus"."bonus_type" IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission\nINTERVENTION: intervention\nPONCTUELLE: ponctuelle\nEXCEPTIONNEL: exceptionnel';
COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé\nEN_ATTENTE_DIRECTEUR: En attente Directeur\nEN_ATTENTE_DG: En attente DG\nVALIDE: Prime validée\nREJETE: Prime rejetée';
CREATE TABLE IF NOT EXISTS "primemax" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "department" VARCHAR(50) NOT NULL,
    "bonus_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "validated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
)
