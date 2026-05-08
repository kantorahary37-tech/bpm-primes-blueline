from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ADD "end_date" DATE;
        ALTER TABLE "bonus" ADD "start_date" DATE;
        UPDATE "bonus" SET "start_date" = MAKE_DATE("year", "month", 1), "end_date" = (MAKE_DATE("year", "month", 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        ALTER TABLE "bonus" ALTER COLUMN "start_date" SET NOT NULL;
        ALTER TABLE "bonus" ALTER COLUMN "end_date" SET NOT NULL;
        ALTER TABLE "bonus" DROP COLUMN "month";
        ALTER TABLE "bonus" DROP COLUMN "year";
        COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé
EN_ATTENTE_N1: En attente N+1
EN_ATTENTE_DIRECTEUR: En attente Directeur
EN_ATTENTE_DG: En attente DG
VALIDE: Prime validée
REJETE: Prime rejetée';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ADD "month" INT;
        ALTER TABLE "bonus" ADD "year" INT;
        UPDATE "bonus" SET "month" = EXTRACT(MONTH FROM "start_date"), "year" = EXTRACT(YEAR FROM "start_date");
        ALTER TABLE "bonus" ALTER COLUMN "month" SET NOT NULL;
        ALTER TABLE "bonus" ALTER COLUMN "year" SET NOT NULL;
        ALTER TABLE "bonus" DROP COLUMN "end_date";
        ALTER TABLE "bonus" DROP COLUMN "start_date";
        COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé
EN_ATTENTE_N1: En attente N+1
EN_ATTENTE_DIRECTEUR: En attente Directeur
EN_ATTENTE_DG: En attente DG
EN_ATTENTE_DRH: En attente DRH
VALIDE: Prime validée
REJETE: Prime rejetée';"""


MODELS_STATE = (
    "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"
)
