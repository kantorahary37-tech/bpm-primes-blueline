from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
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
        ALTER TABLE "bonus" ALTER COLUMN "details" TYPE JSONB USING "details"::JSONB;
        ALTER TABLE "bonus" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at"::TIMESTAMPTZ;
        ALTER TABLE "primemax" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at"::TIMESTAMPTZ;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ALTER COLUMN "details" TYPE JSONB USING "details"::JSONB;
        ALTER TABLE "bonus" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at"::TIMESTAMPTZ;
        ALTER TABLE "primemax" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at"::TIMESTAMPTZ;
        DROP TABLE IF EXISTS "notification";
        DROP TABLE IF EXISTS "auditlog";"""


MODELS_STATE = (
    "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"
    "/0"
)
