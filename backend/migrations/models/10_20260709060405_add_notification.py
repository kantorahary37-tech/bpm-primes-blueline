from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "auditlog" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bonus_id" INT NOT NULL REFERENCES "bonus" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
        CREATE TABLE IF NOT EXISTS "department" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(50) NOT NULL UNIQUE
);
        CREATE TABLE IF NOT EXISTS "notification" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "type" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOL NOT NULL DEFAULT False,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bonus_id" INT NOT NULL REFERENCES "bonus" ("id") ON DELETE CASCADE,
    "sender_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
        ALTER TABLE "employee" ADD "department" VARCHAR(50) NOT NULL;
        ALTER TABLE "employee" ADD "department_id" INT NOT NULL;
        ALTER TABLE "employee" DROP COLUMN "department";
        ALTER TABLE "primemax" ADD "department" VARCHAR(50) NOT NULL;
        ALTER TABLE "primemax" ADD "department_id" INT NOT NULL;
        ALTER TABLE "primemax" DROP COLUMN "department";
        ALTER TABLE "user" ADD "department" VARCHAR(50);
        ALTER TABLE "user" ADD "department_id" INT;
        ALTER TABLE "user" DROP COLUMN "department";
        ALTER TABLE "employee" ADD CONSTRAINT "fk_employee_departme_0c730890" FOREIGN KEY ("dept_id") REFERENCES "department" ("id") ON DELETE CASCADE;
        ALTER TABLE "primemax" ADD CONSTRAINT "fk_primemax_departme_9fb78c5b" FOREIGN KEY ("dept_id") REFERENCES "department" ("id") ON DELETE CASCADE;
        ALTER TABLE "user" ADD CONSTRAINT "fk_user_departme_a953b326" FOREIGN KEY ("dept_id") REFERENCES "department" ("id") ON DELETE CASCADE;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "primemax" DROP CONSTRAINT IF EXISTS "fk_primemax_departme_9fb78c5b";
        ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "fk_employee_departme_0c730890";
        ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "fk_user_departme_a953b326";
        ALTER TABLE "user" ADD "department" VARCHAR(21);
        ALTER TABLE "user" DROP COLUMN "department";
        ALTER TABLE "user" DROP COLUMN "department_id";
        ALTER TABLE "employee" ADD "department" VARCHAR(21) NOT NULL;
        ALTER TABLE "employee" DROP COLUMN "department";
        ALTER TABLE "employee" DROP COLUMN "department_id";
        ALTER TABLE "primemax" ADD "department" VARCHAR(21) NOT NULL;
        ALTER TABLE "primemax" DROP COLUMN "department";
        ALTER TABLE "primemax" DROP COLUMN "department_id";
        COMMENT ON COLUMN "user"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
COMMENT ON COLUMN "employee"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
COMMENT ON COLUMN "primemax"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
        DROP TABLE IF EXISTS "notification";
        DROP TABLE IF EXISTS "auditlog";
        DROP TABLE IF EXISTS "department";"""


MODELS_STATE = (
    "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"
    "n8cLk="
)
