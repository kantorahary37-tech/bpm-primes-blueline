from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "department" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(50) NOT NULL UNIQUE
);
        INSERT INTO "department" ("name") VALUES
            ('Clientèle'), ('Commercial GP'), ('Commercial entreprise'),
            ('ADV'), ('Fidélisation'), ('Auditeur interne'),
            ('DAF Contrôleur'), ('DAF CDG'), ('CTB'), ('RH'),
            ('Achat'), ('BBS'), ('Communication & Mktg'), ('DO'),
            ('DSI'), ('DT'), ('Logistique'), ('DG');
        ALTER TABLE "user" ADD "department_id" INT;
        ALTER TABLE "employee" ADD "department_id" INT;
        ALTER TABLE "primemax" ADD "department_id" INT;
        UPDATE "user" SET "department_id" = (SELECT id FROM "department" WHERE name = "user"."department");
        UPDATE "employee" SET "department_id" = (SELECT id FROM "department" WHERE name = "employee"."department");
        UPDATE "primemax" SET "department_id" = (SELECT id FROM "department" WHERE name = "primemax"."department");
        ALTER TABLE "employee" ALTER COLUMN "department_id" SET NOT NULL;
        ALTER TABLE "primemax" ALTER COLUMN "department_id" SET NOT NULL;
        ALTER TABLE "employee" ADD CONSTRAINT "fk_employee_departme_062d1c92" FOREIGN KEY ("department_id") REFERENCES "department" ("id") ON DELETE CASCADE;
        ALTER TABLE "primemax" ADD CONSTRAINT "fk_primemax_departme_d287ec88" FOREIGN KEY ("department_id") REFERENCES "department" ("id") ON DELETE CASCADE;
        ALTER TABLE "user" ADD CONSTRAINT "fk_user_departme_1bf28910" FOREIGN KEY ("department_id") REFERENCES "department" ("id") ON DELETE CASCADE;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "primemax" DROP CONSTRAINT IF EXISTS "fk_primemax_departme_d287ec88";
        ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "fk_employee_departme_062d1c92";
        ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "fk_user_departme_1bf28910";
        ALTER TABLE "user" DROP COLUMN "department_id";
        ALTER TABLE "employee" DROP COLUMN "department_id";
        ALTER TABLE "primemax" DROP COLUMN "department_id";
        COMMENT ON COLUMN "user"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
COMMENT ON COLUMN "employee"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
COMMENT ON COLUMN "primemax"."department" IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDG: DG';
        DROP TABLE IF EXISTS "department";"""


MODELS_STATE = (
    "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"
    "Fc2U9VZFY1r2leXv4Hf+N+3Q=="
)
