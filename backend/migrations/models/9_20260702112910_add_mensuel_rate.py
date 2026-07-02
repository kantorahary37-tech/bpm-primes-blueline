from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "employee" ADD "mensuel_rate" INT;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "employee" DROP COLUMN "mensuel_rate";"""


MODELS_STATE = (
    "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"
)
