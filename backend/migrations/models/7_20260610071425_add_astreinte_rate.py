from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé
EN_ATTENTE_DIRECTEUR: En attente Directeur
EN_ATTENTE_DG: En attente DG
VALIDE: Prime validée
REJETE: Prime rejetée';
        ALTER TABLE "employee" ADD "astreinte_rate" INT;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        COMMENT ON COLUMN "bonus"."status" IS 'INITIALISE: Initialisé
EN_ATTENTE_N1: En attente N+1
EN_ATTENTE_DIRECTEUR: En attente Directeur
EN_ATTENTE_DG: En attente DG
VALIDE: Prime validée
REJETE: Prime rejetée';
        ALTER TABLE "employee" DROP COLUMN "astreinte_rate";"""


MODELS_STATE = (
    "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"
)
