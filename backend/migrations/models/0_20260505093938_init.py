from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "user" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "poste" VARCHAR(255),
    "department" VARCHAR(21),
    "is_validator_n1" BOOL NOT NULL DEFAULT False,
    "is_directeur" BOOL NOT NULL DEFAULT False,
    "is_drh" BOOL NOT NULL DEFAULT False,
    "is_dg" BOOL NOT NULL DEFAULT False,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN "user"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';
CREATE TABLE IF NOT EXISTS "employee" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "matricule" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "department" VARCHAR(21) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manager_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "employee"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';
CREATE TABLE IF NOT EXISTS "bonus" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "month" INT NOT NULL,
    "year" INT NOT NULL,
    "bonus_type" VARCHAR(10) NOT NULL,
    "performance_score" DECIMAL(5,2),
    "absences" INT,
    "retard" INT,
    "prime_mensuel_amount" DECIMAL(15,2),
    "nb_jours_astreinte" INT,
    "taux_jour" DECIMAL(10,2),
    "prime_astreinte_amount" DECIMAL(15,2),
    "ca_realise" DECIMAL(15,2),
    "ca_objectif" DECIMAL(15,2),
    "taux_commission" DECIMAL(5,2),
    "commission_amount" DECIMAL(15,2),
    "total_amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Initialisé',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "employee_id" INT NOT NULL REFERENCES "employee" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "bonus"."bonus_type" IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission';
COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé\nEN_ATTENTE_N1: En attente N+1\nEN_ATTENTE_DIRECTEUR: En attente Directeur\nEN_ATTENTE_DG: En attente DG\nVALIDE: Validé\nREJETE: Rejeté';
CREATE TABLE IF NOT EXISTS "primemax" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "department" VARCHAR(21) NOT NULL,
    "bonus_type" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "set_by_id" INT REFERENCES "user" ("id") ON DELETE CASCADE
);
COMMENT ON COLUMN "primemax"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';
COMMENT ON COLUMN "primemax"."bonus_type" IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission';
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
    "I1Lw1M9qp+b4GNQfaw8WPQutbqm2BoNuwoxqqXqK6VWvpWhH9ZQdm415BESTKH5dnG5CtU"
    "KbRUtz3m/yW6g07yUnFU4gM12D5rSCmYVZRQ7shdsqjBzI+F+qS9ySS9y8iP8HYtjNCPXs"
    "D/3hMPdAEvGb6q0zyVYCUQWHP6azMQYlx+WYRFbsePyelKvcj5t8Nj6y+9FjeCbi94nkd9"
    "N3tvnQcJjouS9kKCa41NhNhpv/aTNx83yPOr4rerWSu1Oux7LjrPJBT5xkI0xHPfnDi8Rp"
    "tjvoX0TiMazt7qCVwum4zLoxKP8BuwjVlFoFNxfu/Fm3lq2W1q2stS2w1rJBUUJHibjKIc"
    "V456wJVzBAPq12SPhKYjQWb89+YIjGDjoDjlNBGvHF9ftfaC/m0wbg7f6vC9Kra5tiXGRM"
    "LfO2lmNyznOOy8xNtJSpTM0t29eOS0zN75jmv7yu2FaKqeyosfQYgQZ8aQhAnIvvJsD6yW"
    "ph1mVx1jnv/iMsN0zj3XDQL7hnWaqkQF4R6OCniWWyY8m2PPZ5O7GWUOS9LjeU0jZR6ujN"
    "C2jlnWqe8vHy639U42/A"
)
