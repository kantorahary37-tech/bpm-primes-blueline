from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ADD "was_rejected" BOOL NOT NULL DEFAULT False;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" DROP COLUMN "was_rejected";"""


MODELS_STATE = (
    "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"
    "RHbwiuh+XeXY2TOiNU4+dr+8fP0/2OarsA=="
)
