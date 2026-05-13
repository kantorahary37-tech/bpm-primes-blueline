from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ADD "details" JSONB;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" DROP COLUMN "details";"""


MODELS_STATE = (
    "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"
    "+fo/GQg8aw=="
)
