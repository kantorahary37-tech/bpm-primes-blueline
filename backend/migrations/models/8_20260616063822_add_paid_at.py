from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ADD "paid_at" TIMESTAMPTZ;
        ALTER TABLE "bonus" ALTER COLUMN "bonus_type" TYPE VARCHAR(20) USING "bonus_type"::VARCHAR(20);
        COMMENT ON COLUMN "bonus"."bonus_type" IS 'MENSUEL: mensuel
ASTREINTE: astreinte
COMMISSION: commission
INTERVENTION: intervention
PONCTUELLE: ponctuelle
EXCEPTIONNEL: exceptionnel';
        ALTER TABLE "primemax" ALTER COLUMN "bonus_type" TYPE VARCHAR(20) USING "bonus_type"::VARCHAR(20);
        COMMENT ON COLUMN "primemax"."bonus_type" IS 'MENSUEL: mensuel
ASTREINTE: astreinte
COMMISSION: commission
INTERVENTION: intervention
PONCTUELLE: ponctuelle
EXCEPTIONNEL: exceptionnel';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" DROP COLUMN "paid_at";
        COMMENT ON COLUMN "bonus"."bonus_type" IS 'MENSUEL: mensuel
ASTREINTE: astreinte
COMMISSION: commission';
        ALTER TABLE "bonus" ALTER COLUMN "bonus_type" TYPE VARCHAR(10) USING "bonus_type"::VARCHAR(10);
        COMMENT ON COLUMN "primemax"."bonus_type" IS 'MENSUEL: mensuel
ASTREINTE: astreinte
COMMISSION: commission';
        ALTER TABLE "primemax" ALTER COLUMN "bonus_type" TYPE VARCHAR(10) USING "bonus_type"::VARCHAR(10);"""


MODELS_STATE = (
    "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"
    "HIDr6Jfx+5z94fmmqiW/Khmi55ZAtYzj2lWqJfd9s8NUjWq5Y2tUu0K1bM7zzXl+/8/zzZ"
    "uqw39TtZHrW+P01lxRH5zSVrii9jCtfT2dkTkiI0aFwhYg+XH62rs50H1XXcsMjrra2luq"
    "KpysQE2JiJerKH6UolFPdmxGVqknoFSaVp0rm1hgH2+83uTGprn0ejVCtlvXYhgLbATxHT"
    "bWI7k43BrZxs5wlHYG09NDLyfH1cmZwAxd9apFIN08bCkAXkSvAOrTzYg2aIto3YcNoAZC"
    "Dc4izuUGNJcNTNF7Ns97ckA5fECeYIhWHLTygs2BK/nsD9PiqfOIBQ/by4nmxBqeAp46fl"
    "6ZrugautqKWpJF8xbznd9iNs5MB2EXDzq2YOBt/Eoq/EpED7VeiWE/HxYVPwgFW8orSaSd"
    "Z3Z1Aa8G0bzpecvbjBQUwZ1GFln5zcbXbLrmfmObe+Obf1Aar+qczqP0+2mc3/6LHhjowg"
    "93lRNMJPaT4fYda4gjutzQ8HPZJzidvbrbqDrOKl+0zEm28Nmj+DQ7GI+uo+T5byFlcdoO"
    "Ne/514sE2kQ51ZxYA1cIN9zrNtLV8rKNtrYD2lrRi7PWUSItckzPTgRzwqn5Zicvdkz4Kp"
    "zA4v+Z5ZU+YHtoDGjnvMDSk+v7H9aIx9MW4O3/g6f87NolJzoZu6bx0BKonGFMu0rdREma"
    "RtXcsXWtXaFqfsWu+CPH5bpSSmRPlaW3uAhiU6MGxDD5fgI8O11H3YRUpQB5XP4T0YQK/c"
    "DKv72bEtnCt3d36ynH1j6+W+PmY/vby7f/A/yA0C4="
)
