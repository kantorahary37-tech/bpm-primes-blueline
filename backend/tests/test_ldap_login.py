"""Authentification LDAP à la connexion (paramètre USE_LDAP_PASSWORD).

Avant, ce paramètre du menu Configuration → LDAP n'était lu nulle part : la
connexion vérifiait toujours le hachage bcrypt local, même activé. Régressions
couvertes ici :
- ``USE_LDAP_PASSWORD`` actif ⇒ le mot de passe est validé par l'annuaire ;
- aucun repli sur le mot de passe local (même correct) quand LDAP est actif ;
- un compte sans mot de passe local peut se connecter via LDAP ;
- une annuaire injoignable renvoie 503 (et non un « mot de passe invalide ») ;
- paramètre inactif ⇒ comportement historique (bcrypt local).
"""

from contextlib import contextmanager
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api.auth_routes import router as auth_router
from app.api.system_config import router as system_config_router
from app import ldap_helpers, rate_limit
from app.auth import get_current_user, get_password_hash
from app.config import invalidate_cache, set_config
from app.models import User


@pytest_asyncio.fixture(autouse=True)
async def _clean_state():
    # Le rate-limiter est en mémoire et partagé : chaque test repart à zéro.
    rate_limit._login_attempts.clear()
    set_config("USE_LDAP_PASSWORD", "false")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "")
    invalidate_cache()
    yield
    rate_limit._login_attempts.clear()
    set_config("USE_LDAP_PASSWORD", "false")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "")
    invalidate_cache()


async def _client(current_user=None):
    app = FastAPI()
    app.include_router(auth_router, prefix="/auth")
    app.include_router(system_config_router, prefix="/admin")
    if current_user is not None:
        app.dependency_overrides[get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def test_login_local_quand_ldap_est_desactive(db, monkeypatch):
    monkeypatch.setattr(
        ldap_helpers, "verify_credentials",
        lambda *a, **k: pytest.fail("LDAP ne doit pas être sollicité"),
    )
    user = await User.create(
        email="local@test.mg", name="Local",
        password_hash=get_password_hash("motdepasse"),
    )

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "local@test.mg", "password": "motdepasse"})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

        r = await ac.post("/auth/login", json={"email": "local@test.mg", "password": "mauvais"})
        assert r.status_code == 401


async def test_sans_mot_de_passe_local_refuse_quand_ldap_est_desactive(db):
    user = await User.create(email="nohash@test.mg", name="NoHash", password_hash=None)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "nohash@test.mg", "password": "peu importe"})
        assert r.status_code == 401


async def test_login_valide_le_mot_de_passe_ldap(db, monkeypatch):
    set_config("USE_LDAP_PASSWORD", "true")
    invalidate_cache("USE_LDAP_PASSWORD")
    # Compte SANS mot de passe local : la connexion ne peut aboutir que si
    # l'annuaire est bien interrogé.
    user = await User.create(email="ldap@test.mg", name="Ldap", password_hash=None)
    seen = {}

    def fake_verify(login, password):
        seen.update(login=login, password=password)
        return password == "annuaire"

    monkeypatch.setattr(ldap_helpers, "verify_credentials", fake_verify)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "ldap@test.mg", "password": "annuaire"})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]
        assert seen == {"login": "ldap@test.mg", "password": "annuaire"}


async def test_login_ldap_actif_ignore_le_mot_de_passe_local(db, monkeypatch):
    set_config("USE_LDAP_PASSWORD", "true")
    invalidate_cache("USE_LDAP_PASSWORD")
    # Le mot de passe local est correct mais LDAP le refuse : aucun repli local,
    # sinon l'activation de LDAP ne servirait à rien.
    user = await User.create(
        email="mixte@test.mg", name="Mixte",
        password_hash=get_password_hash("motdepasse"),
    )
    monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda login, password: False)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "mixte@test.mg", "password": "motdepasse"})
        assert r.status_code == 401, r.text


async def test_login_ldap_indisponible_ne_vaut_pas_mot_de_passe_invalide(db, monkeypatch):
    set_config("USE_LDAP_PASSWORD", "true")
    invalidate_cache("USE_LDAP_PASSWORD")
    user = await User.create(
        email="hs@test.mg", name="HS", password_hash=get_password_hash("motdepasse"),
    )

    def boom(login, password):
        raise ldap_helpers.LdapUnavailable("annuaire injoignable")

    monkeypatch.setattr(ldap_helpers, "verify_credentials", boom)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "hs@test.mg", "password": "motdepasse"})
        assert r.status_code == 503, r.text
        # Aucune tentative ratée n'est comptabilisée : l'indisponibilité du
        # serveur ne doit pas bloquer le compte à terme.
        assert not rate_limit._login_attempts


async def test_etre_dans_ldap_ne_suffit_pas_pour_se_connecter(db, monkeypatch):
    """Régle voulue : seul un compte créé depuis l'écran Utilisateurs peut se
    connecter. Une personne présente dans l'annuaire mais absente de la table
    des utilisateurs est rejetée, sans créer de compte au passage."""
    set_config("USE_LDAP_PASSWORD", "true")
    invalidate_cache()

    def ldap_sait_tout(login, password):
        # L'annuaire connaît la personne et validerait le mot de passe...
        return True

    monkeypatch.setattr(ldap_helpers, "find_by_email", lambda email: {
        "givenName": "Alain Nambinintsoa", "sn": "RAKOTOARIVELO", "ou": "Direction des Systemes d'Informations",
    })
    monkeypatch.setattr(ldap_helpers, "verify_credentials", ldap_sait_tout)

    async for ac in _client():
        r = await ac.post("/auth/login", json={
            "email": "nambinintsoa.rakotoarivelo@staff.blueline.mg", "password": "ldap-pwd",
        })
        assert r.status_code == 401, r.text

    # ...mais aucun compte n'est créé automatiquement.
    assert await User.filter(email="nambinintsoa.rakotoarivelo@staff.blueline.mg").count() == 0


async def test_compte_cree_par_un_admin_se_connecte_en_ldap(db, monkeypatch):
    """Le même compte, une fois créé par un administrateur, se connecte."""
    set_config("USE_LDAP_PASSWORD", "true")
    invalidate_cache()
    await User.create(email="ajoute@gulfsat.mg", name="Ajoute Par Admin", password_hash=None)
    monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda login, password: True)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "ajoute@gulfsat.mg", "password": "ldap-pwd"})
        assert r.status_code == 200, r.text


async def test_email_inconnu_refuse(db, monkeypatch):
    monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda *a, **k: True)
    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "inconnu@gulfsat.mg", "password": "x"})
        assert r.status_code == 401, r.text


async def test_admin_de_secours_se_connecte_sans_ldap(db, monkeypatch):
    """Le compte d'administration de secours (LDAP_LOCAL_ADMIN_EMAILS) reste
    accessible avec son mot de passe local même quand LDAP est activé."""
    set_config("USE_LDAP_PASSWORD", "true")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "Admin@Gulfsat.mg, autre@gulfsat.mg")
    invalidate_cache()
    admin = await User.create(
        email="admin@gulfsat.mg", name="Admin", is_admin=True,
        password_hash=get_password_hash("motdepasse-local"),
    )
    monkeypatch.setattr(
        ldap_helpers, "verify_credentials",
        lambda *a, **k: pytest.fail("LDAP ne doit pas être sollicité pour ce compte"),
    )

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "admin@gulfsat.mg",
                                               "password": "motdepasse-local"})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

        # Le mot de passe LDAP / un autre mot de passe local est refusé.
        r = await ac.post("/auth/login", json={"email": "admin@gulfsat.mg", "password": "autre"})
        assert r.status_code == 401, r.text


async def test_le_contournement_ldap_est_reserve_aux_administrateurs(db, monkeypatch):
    set_config("USE_LDAP_PASSWORD", "true")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "ldap@test.mg")
    invalidate_cache()
    # Même email que dans la liste, mais pas administrateur : LDAP prime.
    user = await User.create(
        email="ldap@test.mg", name="Pas admin", password_hash=get_password_hash("motdepasse-local"),
    )
    monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda login, password: False)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "ldap@test.mg", "password": "motdepasse-local"})
        assert r.status_code == 401, r.text

    # rétrogradé administrateur, mais plus dans la liste : LDAP prime aussi
    user.is_admin = True
    await user.save()
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "")
    invalidate_cache()
    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "ldap@test.mg", "password": "motdepasse-local"})
        assert r.status_code == 401, r.text


async def test_seul_un_administrateur_peut_tester_ldap(db):
    async for ac in _client():
        r = await ac.post("/admin/system-config/ldap-test", json={})
        assert r.status_code in (401, 403), r.text
async def test_test_ldap_connexion_et_mot_de_passe(db, monkeypatch):
    admin = await User.create(email="admin@test.mg", name="Admin", password_hash="x", is_admin=True)
    bind_calls = []

    @contextmanager
    def fake_connect():
        bind_calls.append("service")
        yield SimpleNamespace()

    monkeypatch.setattr(ldap_helpers, "connect", fake_connect)
    monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda login, password: bind_calls.append(login) or True)

    async for ac in _client(admin):
        # Sans identifiant : simple bind du compte de service.
        r = await ac.post("/admin/system-config/ldap-test", json={})
        assert r.status_code == 200, r.text
        assert r.json()["user_checked"] is False

        # Avec identifiant + mot de passe : validation du mot de passe.
        r = await ac.post("/admin/system-config/ldap-test",
                          json={"login": "a@test.mg", "password": "secret"})
        assert r.status_code == 200, r.text
        assert r.json()["user_checked"] is True

        # Paramétrage non enregistré : testé puis restauré.
        monkeypatch.setattr(ldap_helpers, "verify_credentials", lambda login, password: False)
        r = await ac.post("/admin/system-config/ldap-test", json={
            "settings": {"LDAP_SERVER_URI": "ldap://ailleurs:389"},
            "login": "a@test.mg", "password": "faux",
        })
        assert r.status_code == 400, r.text
        assert ldap_helpers.setting("LDAP_SERVER_URI") != "ldap://ailleurs:389"
