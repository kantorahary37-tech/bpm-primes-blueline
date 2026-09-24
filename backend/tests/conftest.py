import pytest
import pytest_asyncio
from tortoise import Tortoise

from app.config import set_config, invalidate_cache


@pytest.fixture
def reminder_config():
    """Configuration connue du rappel DG pour les tests."""
    set_config("PRIME_REMINDER_ENABLED", "true")
    set_config("PRIME_REMINDER_DAYS", "15,20")
    set_config("PRIME_REMINDER_HOURS", "8,17")
    set_config("PRIME_REMINDER_RECIPIENT", "")
    set_config("REMINDER_TZ_OFFSET", "3")
    set_config("TEST_MODE", "true")
    invalidate_cache()
    yield
    invalidate_cache()


@pytest_asyncio.fixture
async def db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["app.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()