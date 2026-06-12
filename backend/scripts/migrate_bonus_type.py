import asyncio, sys
sys.path.append('.')
from tortoise import Tortoise
from app.db_config import TORTOISE_ORM

async def migrate():
    await Tortoise.init(config=TORTOISE_ORM)
    conn = Tortoise.get_connection('default')
    await conn.execute_script("ALTER TABLE primemax ALTER COLUMN bonus_type TYPE varchar(20);")
    await conn.execute_script("ALTER TABLE bonus ALTER COLUMN bonus_type TYPE varchar(20);")
    await Tortoise.close_connections()

asyncio.run(migrate())
print('Migration OK')
