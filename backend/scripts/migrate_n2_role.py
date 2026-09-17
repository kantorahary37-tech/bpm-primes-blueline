"""
Migration: Add N+2 (sous-directeur) role support.

Adds:
  - user.is_validator_n2 (boolean, default false)
  - user.is_admin (boolean, default false)  — already exists, just ensuring
  - bonus.pass_to_n2 (boolean, default false)
  - bonus.n2_user_id (FK to user, nullable)

Usage:
  python -m scripts.migrate_n2_role
"""
import asyncio
from app.db_config import TORTOISE_ORM
from tortoise import Tortoise

async def migrate():
    await Tortoise.init(config=TORTOISE_ORM)
    conn = Tortoise.get_connection('default')

    # 1. Add is_validator_n2 to user table
    try:
        await conn.execute_script(
            "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS is_validator_n2 BOOLEAN DEFAULT false NOT NULL;"
        )
        print("✓ user.is_validator_n2 column added")
    except Exception as e:
        print(f"  user.is_validator_n2: {e}")

    # 2. Add pass_to_n2 to bonus table
    try:
        await conn.execute_script(
            "ALTER TABLE bonus ADD COLUMN IF NOT EXISTS pass_to_n2 BOOLEAN DEFAULT false NOT NULL;"
        )
        print("✓ bonus.pass_to_n2 column added")
    except Exception as e:
        print(f"  bonus.pass_to_n2: {e}")

    # 3. Add n2_user_id FK to bonus table
    try:
        await conn.execute_script(
            "ALTER TABLE bonus ADD COLUMN IF NOT EXISTS n2_user_id INT REFERENCES \"user\"(id) ON DELETE SET NULL;"
        )
        print("✓ bonus.n2_user_id column added")
    except Exception as e:
        print(f"  bonus.n2_user_id: {e}")

    await Tortoise.close_connections()
    print("\n✅ Migration N+2 terminée.")

if __name__ == "__main__":
    asyncio.run(migrate())
