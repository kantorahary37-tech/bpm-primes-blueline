"""Planification des sauvegardes automatiques.

Régression : l'échéance est calculée depuis le dump le plus récent (et non
depuis le démarrage du processus), sinon chaque redémarrage du serveur
déclenche une nouvelle sauvegarde et l'intervalle configuré n'est jamais
respecté. Vérifie aussi que les paramètres BACKUP_* sont lus correctement et
exposés à l'interface via /database/backup-schedule.
"""

import os
import time

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

import app.api.database_dump as dump_module
from app.api.database_dump import (
    get_backup_settings,
    latest_dump,
    seconds_until_next_backup,
    router as dump_router,
)
from app.auth import get_current_user
from app.config import invalidate_cache, set_config
from app.models import User


def _write_dump(directory, name, age_seconds=0.0):
    path = os.path.join(str(directory), name)
    with open(path, "w", encoding="utf-8") as f:
        f.write("-- test dump\n")
    if age_seconds:
        past = time.time() - age_seconds
        os.utime(path, (past, past))
    return path


async def test_seconds_until_next_backup_no_dump(tmp_path, monkeypatch):
    monkeypatch.setattr(dump_module, "DUMPS_DIR", str(tmp_path))
    assert latest_dump() is None
    assert seconds_until_next_backup(2.0) == 0.0


async def test_seconds_until_next_backup_respects_interval(tmp_path, monkeypatch):
    monkeypatch.setattr(dump_module, "DUMPS_DIR", str(tmp_path))
    _write_dump(tmp_path, "20260930_060000_auto.sql")

    delay = seconds_until_next_backup(2.0)
    assert 2 * 3600 - 5 <= delay <= 2 * 3600

    # Un redémarrage du serveur ne doit pas repousser l'échéance : le délai
    # reste calculé depuis le dump, pas depuis "maintenant".
    assert seconds_until_next_backup(2.0) <= 2 * 3600


async def test_seconds_until_next_backup_overdue(tmp_path, monkeypatch):
    monkeypatch.setattr(dump_module, "DUMPS_DIR", str(tmp_path))
    _write_dump(tmp_path, "20260930_000000_auto.sql", age_seconds=3 * 3600)
    assert seconds_until_next_backup(2.0) == 0.0


async def test_latest_dump_ignores_non_dump_files(tmp_path, monkeypatch):
    monkeypatch.setattr(dump_module, "DUMPS_DIR", str(tmp_path))
    _write_dump(tmp_path, "notes.txt")
    _write_dump(tmp_path, "20260930_060000_auto.sql", age_seconds=3600)
    _write_dump(tmp_path, "20260930_070000_auto.sql")

    name, _ = latest_dump()
    assert name == "20260930_070000_auto.sql"


async def test_get_backup_settings_parses_config():
    set_config("BACKUP_ENABLED", "true")
    set_config("BACKUP_INTERVAL_HOURS", "1.5")
    set_config("BACKUP_RETENTION", "6")
    set_config("BACKUP_LABEL", "auto")
    try:
        settings = get_backup_settings()
        assert settings["enabled"] is True
        assert settings["interval_hours"] == 1.5
        assert settings["retention"] == 6

        set_config("BACKUP_ENABLED", "false")
        set_config("BACKUP_INTERVAL_HOURS", "pas-un-nombre")
        set_config("BACKUP_RETENTION", "-3")
        settings = get_backup_settings()
        # Intervalle invalide → valeur par défaut (2 h), rétention ramenée à 0
        assert settings["enabled"] is False
        assert settings["interval_hours"] == 2.0
        assert settings["retention"] == 0
    finally:
        for key in ("BACKUP_ENABLED", "BACKUP_INTERVAL_HOURS", "BACKUP_RETENTION", "BACKUP_LABEL"):
            set_config(key, "")
        invalidate_cache()


async def _client(user, routers=(dump_router,)):
    app = FastAPI()
    for router in routers:
        app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_backup_schedule_endpoint(db, tmp_path, monkeypatch):
    monkeypatch.setattr(dump_module, "DUMPS_DIR", str(tmp_path))
    _write_dump(tmp_path, "20260930_060000_auto.sql")
    set_config("BACKUP_ENABLED", "true")
    set_config("BACKUP_INTERVAL_HOURS", "2")
    set_config("BACKUP_RETENTION", "6")

    admin = await User.create(email="admin@schedule.test", name="Admin",
                              password_hash="x", is_admin=True)
    try:
        async for client in _client(admin):
            resp = await client.get("/database/backup-schedule")
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["enabled"] is True
            assert data["interval_hours"] == 2
            assert data["retention"] == 6
            # Clés BACKUP_* (chaînes) attendues par la page « Sauvegardes complètes »
            assert data["BACKUP_ENABLED"] == "true"
            assert data["BACKUP_INTERVAL_HOURS"] == "2"
            assert data["BACKUP_RETENTION"] == "6"
            assert data["BACKUP_LABEL"] == "auto"
            assert data["last_backup"] == "20260930_060000_auto.sql"
            assert data["next_backup_at"] is not None
            assert data["delay_seconds"] > 0

        user = await User.create(email="user@schedule.test", name="User",
                                 password_hash="x", is_admin=False)
        async for client in _client(user):
            resp = await client.get("/database/backup-schedule")
            assert resp.status_code == 403, resp.text
    finally:
        for key in ("BACKUP_ENABLED", "BACKUP_INTERVAL_HOURS", "BACKUP_RETENTION"):
            set_config(key, "")
        invalidate_cache()


async def test_backup_schedule_save_round_trip(db):
    """Régression : activer la sauvegarde depuis l'UI puis relire la planification.

    La page lit `BACKUP_ENABLED` (et non `enabled`) : si le format de la
    réponse ne correspond pas aux clés de configuration, le switch revient en
    « désactivé » après l'enregistrement.
    """
    from app.api.system_config import router as system_router
    from app.models import SystemConfig

    for key, value in (("BACKUP_ENABLED", "false"), ("BACKUP_INTERVAL_HOURS", "2"),
                       ("BACKUP_RETENTION", "6"), ("BACKUP_LABEL", "auto")):
        await SystemConfig.create(key=key, value=value, category="backups")
        set_config(key, value)

    admin = await User.create(email="admin@roundtrip.test", name="Admin",
                              password_hash="x", is_admin=True)
    try:
        async for client in _client(admin, routers=(dump_router, system_router)):
            resp = await client.get("/database/backup-schedule")
            assert resp.status_code == 200, resp.text
            assert resp.json()["BACKUP_ENABLED"] == "false"

            resp = await client.post("/system-config/bulk", json={
                "settings": {"BACKUP_ENABLED": "true"},
            })
            assert resp.status_code == 200, resp.text
            assert resp.json()["updated"] == ["BACKUP_ENABLED"]

            resp = await client.get("/database/backup-schedule")
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["BACKUP_ENABLED"] == "true"
            assert data["enabled"] is True
            assert data["next_backup_at"] is not None
    finally:
        for key in ("BACKUP_ENABLED", "BACKUP_INTERVAL_HOURS", "BACKUP_RETENTION", "BACKUP_LABEL"):
            set_config(key, "")
        invalidate_cache()
