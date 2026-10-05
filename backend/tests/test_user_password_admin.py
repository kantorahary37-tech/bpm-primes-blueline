"""Définition du mot de passe local d'un utilisateur depuis l'écran Utilisateurs.

Historique : la seule action disponible était « Réinitialiser le mot de passe »,
qui réaffectait à tous les comptes le même mot de passe commun (``testprime``).
Remplacé par un mot de passe choisi par l'administrateur, et refus explicite
quand l'authentification LDAP est active (le hash local serait ignoré).

Régressions couvertes :
- plus aucun mot de passe « testprime » n'est posé à la création d'un compte ;
- un mot de passe faible (trop court / répétitif) est refusé ;
- l'opération est refusée quand LDAP est actif, sans modifier le compte ;
- un compte créé sans mot de passe reste utilisable hors LDAP seulement après
  définition d'un mot de passe (pas de hash → connexion refusée).
"""

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.api.admin import router as admin_router
from app.api.auth_routes import router as auth_router
from app.auth import get_current_user, get_password_hash, verify_password
from app.config import set_config, invalidate_cache
from app.models import User


async def _client(current_user=None):
    app = FastAPI()
    app.include_router(admin_router, prefix="/admin")
    app.include_router(auth_router, prefix="/auth")
    if current_user is not None:
        app.dependency_overrides[get_current_user] = lambda: current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _ldap(on: bool):
    set_config("USE_LDAP_PASSWORD", "true" if on else "false")
    invalidate_cache()


async def test_admin_definit_un_mot_de_passe_choisi(db):
    _ldap(False)
    target = await User.create(email="cible@gulfsat.mg", name="Cible")
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post(f"/admin/users/{target.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 200, r.text

    # refresh_from_db() échoue sur la propriété en lecture seule
    # ``department`` : on relit le compte depuis la base.
    target = await User.get(id=target.id)
    assert verify_password("Gulfsat2026", target.password_hash)
    # Le mot de passe commun d'autrefois n'est plus posé nulle part.
    assert not verify_password("testprime", target.password_hash)


async def test_mot_de_passe_trop_faible_refuse(db):
    _ldap(False)
    target = await User.create(email="cible@gulfsat.mg", name="Cible",
                               password_hash=None)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        for faible in ("court", "aaaaaaaaaa", "12345678"):
            r = await ac.post(f"/admin/users/{target.id}/set-password",
                              json={"password": faible})
            assert r.status_code == 400, (faible, r.text)

    target = await User.get(id=target.id)
    assert target.password_hash is None


async def test_refuse_quand_ldap_est_actif(db):
    _ldap(True)
    target = await User.create(email="cible@gulfsat.mg", name="Cible",
                               password_hash=None)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post(f"/admin/users/{target.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 400, r.text
        assert "LDAP" in r.json()["detail"]

    # Le compte n'a pas été modifié : un changement silencieux serait trompeur.
    target = await User.get(id=target.id)
    assert target.password_hash is None


async def test_compte_de_secours_modifiable_meme_ldap_actif(db):
    """Le compte de secours est justement celui dont le mot de passe local sert
    quand l'annuaire est down : il doit rester modifiable dans ce cas, sans quoi
    on ne pourrait plus le changer au moment où on en a besoin."""
    _ldap(True)
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "secours@gulfsat.mg")
    invalidate_cache()
    secours = await User.create(email="secours@gulfsat.mg", name="Secours",
                                is_admin=True, password_hash=None)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post(f"/admin/users/{secours.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 200, r.text

    secours = await User.get(id=secours.id)
    assert verify_password("Gulfsat2026", secours.password_hash)

    # Et il se connecte effectivement par ce mot de passe local, LDAP actif.
    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "secours@gulfsat.mg",
                                               "password": "Gulfsat2026"})
        assert r.status_code == 200, r.text


async def test_les_comptes_hors_perimetre_de_secours_restent_refuses(db):
    """Être administrateur ne suffit pas : il faut aussi figurer dans
    LDAP_LOCAL_ADMIN_EMAILS."""
    _ldap(True)
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "")
    invalidate_cache()
    autre_admin = await User.create(email="autre@gulfsat.mg", name="Autre Admin",
                                    is_admin=True, password_hash=None)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post(f"/admin/users/{autre_admin.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 400, r.text


async def test_restore_mot_de_passe_par_defaut(db):
    """« Rétablir le mot de passe par défaut » remet le compte de secours à la
    valeur de configuration, y compris quand LDAP est actif."""
    _ldap(True)
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "secours@gulfsat.mg")
    set_config("LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD", "ValeurParDéfaut2026")
    invalidate_cache()
    secours = await User.create(email="secours@gulfsat.mg", name="Secours",
                                is_admin=True, password_hash=None)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        # Un mot de passe personnalisé d'abord, puis le retour au défaut.
        r = await ac.post(f"/admin/users/{secours.id}/set-password",
                          json={"password": "Personnalise2026"})
        assert r.status_code == 200, r.text

        r = await ac.post(f"/admin/users/{secours.id}/reset-default-password")
        assert r.status_code == 200, r.text
        assert "par défaut" in r.json()["message"]

    secours = await User.get(id=secours.id)
    assert verify_password("ValeurParDéfaut2026", secours.password_hash)
    assert not verify_password("Personnalise2026", secours.password_hash)

    async for ac in _client():
        r = await ac.post("/auth/login", json={"email": "secours@gulfsat.mg",
                                               "password": "ValeurParDéfaut2026"})
        assert r.status_code == 200, r.text


async def test_restore_par_defaut_refuse_hors_compte_de_secours(db):
    _ldap(False)
    cible = await User.create(email="cible@gulfsat.mg", name="Cible")
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "admin@gulfsat.mg")
    invalidate_cache()

    async for ac in _client(admin):
        r = await ac.post(f"/admin/users/{cible.id}/reset-default-password")
        assert r.status_code == 400, r.text
        assert "LDAP_LOCAL_ADMIN_EMAILS" in r.json()["detail"]


async def test_valeur_par_defaut_issue_de_la_config(db):
    """Sans clé en base, la constante du script sert de repli : c'est la
    source de vérité de reset_admin_password.py."""
    set_config("LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD", "")
    invalidate_cache()
    from app.auth import DEFAULT_LOCAL_ADMIN_PASSWORD, local_admin_default_password
    assert DEFAULT_LOCAL_ADMIN_PASSWORD == "Adm1N@Gulfs4T"
    assert local_admin_default_password() == "Adm1N@Gulfs4T"

    set_config("LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD", "AutreValeur2026")
    invalidate_cache()
    assert local_admin_default_password() == "AutreValeur2026"


async def test_creation_sans_mot_de_passe_genere_une_valeur_provisoire(db):
    _ldap(False)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post("/admin/users", json={"email": "nouveau@gulfsat.mg", "name": "Nouveau"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["user"]["email"] == "nouveau@gulfsat.mg"
        provisoire = body["temporary_password"]
        assert provisoire and provisoire != "testprime"

    created = await User.get(email="nouveau@gulfsat.mg")
    assert verify_password(provisoire, created.password_hash)


async def test_creation_avec_mot_de_passe_choisi(db):
    _ldap(False)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post("/admin/users", json={
            "email": "choisi@gulfsat.mg", "name": "Choisi", "password": "MonMotDePasse1",
        })
        assert r.status_code == 201, r.text
        # L'administrateur connaît déjà le mot de passe saisi : inutile de le
        # renvoyer.
        assert r.json()["temporary_password"] is None

    created = await User.get(email="choisi@gulfsat.mg")
    assert verify_password("MonMotDePasse1", created.password_hash)


async def test_creation_ldap_ne_pose_aucun_hash(db):
    """LDAP actif : aucun mot de passe n'est stocké, l'annuaire fait foi."""
    _ldap(True)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        r = await ac.post("/admin/users", json={"email": "ldap@gulfsat.mg", "name": "Ldap"})
        assert r.status_code == 201, r.text
        assert r.json()["temporary_password"] is None

    created = await User.get(email="ldap@gulfsat.mg")
    assert created.password_hash is None


async def test_directeur_hors_perimetre_refuse(db):
    _ldap(False)
    target = await User.create(email="cible@gulfsat.mg", name="Cible",
                               dept_str="Direction Commerciale")
    directeur = await User.create(email="dir@gulfsat.mg", name="Directeur",
                                  is_directeur=True, dept_str="Direction des Systemes d'Informations")

    async for ac in _client(directeur):
        r = await ac.post(f"/admin/users/{target.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 403, r.text


async def test_compte_sans_hash_ne_peut_pas_se_connecter(db):
    """Un compte créé sans mot de passe ne doit pas être utilisable tant que
    l'administrateur n'en a pas défini un (aucun repli implicite)."""
    _ldap(False)
    admin = await User.create(email="admin@gulfsat.mg", name="Admin", is_admin=True)

    async for ac in _client(admin):
        await ac.post("/admin/users", json={"email": "sans@gulfsat.mg", "name": "Sans"})

        r = await ac.post("/auth/login", json={"email": "sans@gulfsat.mg", "password": "Bpm-1234"})
        assert r.status_code == 401, r.text

        created = await User.get(email="sans@gulfsat.mg")
        r = await ac.post(f"/admin/users/{created.id}/set-password",
                          json={"password": "Gulfsat2026"})
        assert r.status_code == 200, r.text

        r = await ac.post("/auth/login", json={"email": "sans@gulfsat.mg", "password": "Gulfsat2026"})
        assert r.status_code == 200, r.text


async def test_me_expose_le_regime_d_authentification(db):
    """/auth/me indique à l'interface s'il faut proposer les outils de mot de
    passe local."""
    _ldap(True)
    user = await User.create(email="u@gulfsat.mg", name="U", password_hash=None)

    async for ac in _client(user):
        r = await ac.get("/auth/me")
        assert r.status_code == 200, r.text
        assert r.json()["ldap_auth_enabled"] is True
        assert r.json()["has_local_password"] is False

    _ldap(False)
    await user.save()
    async for ac in _client(user):
        r = await ac.get("/auth/me")
        assert r.json()["ldap_auth_enabled"] is False
        assert r.json()["has_local_password"] is False


async def test_me_expose_le_droit_de_restore_par_defaut(db):
    """/auth/me doit signaler le compte de secours à l'interface : c'est le seul
    compte où « Rétablir le mot de passe par défaut » a du sens, et il doit
    rester disponible même quand LDAP est actif."""
    _ldap(True)
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "secours@gulfsat.mg")
    invalidate_cache()
    secours = await User.create(email="secours@gulfsat.mg", name="Secours",
                                is_admin=True, password_hash=None)
    ordinaire = await User.create(email="simple@gulfsat.mg", name="Simple")

    async for ac in _client(secours):
        body = (await ac.get("/auth/me")).json()
        assert body["ldap_auth_enabled"] is True
        assert body["can_restore_default_password"] is True

    async for ac in _client(ordinaire):
        body = (await ac.get("/auth/me")).json()
        assert body["can_restore_default_password"] is False


async def test_script_reset_admin_password_reste_conforme(db, monkeypatch):
    """Le script de réinitialisation doit rester cohérent avec la valeur
    appliquée par l'endpoint « Rétablir le mot de passe par défaut ».

    On appelle ``apply`` (la logique réelle, sans gestion de connexion) sur la
    base de test avec une cible temporaire, plutôt que de reproduire le
    hachage à la main : c'est le seul moyen de garantir que le script et l'API
    appliquent bien la même valeur.
    """
    from scripts import reset_admin_password as script

    set_config("USE_LDAP_PASSWORD", "false")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "")
    set_config("LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD", "")
    invalidate_cache()

    target = await User.create(email="script@gulfsat.mg", name="Script",
                               is_admin=True, password_hash=None)

    # Le script cible l'email du compte de secours : on lui passe le sien.
    assert await script.apply(target.email, check_only=False) == 0

    target = await User.get(id=target.id)
    assert verify_password("Adm1N@Gulfs4T", target.password_hash)

    # --check doit valider l'état conforme (code 0)...
    assert await script.apply(target.email, check_only=True) == 0

    # ...et signaler un écart (code 2) quand le mot de passe a été changé.
    target.password_hash = get_password_hash("Personnalise2026")
    await target.save()
    assert await script.apply(target.email, check_only=True) == 2

    # Le script restaure bien la valeur par défaut.
    assert await script.apply(target.email, check_only=False) == 0
    target = await User.get(id=target.id)
    assert verify_password("Adm1N@Gulfs4T", target.password_hash)


async def test_le_script_cree_le_compte_de_secours_absent(db):
    """Base neuve (ou compte supprimé par erreur) : le script doit recréer le
    compte de secours en administrateur, sinon plus personne ne peut entrer."""
    from scripts import reset_admin_password as script

    set_config("USE_LDAP_PASSWORD", "false")
    set_config("LDAP_LOCAL_ADMIN_EMAILS", "absent@gulfsat.mg")
    set_config("LDAP_LOCAL_ADMIN_DEFAULT_PASSWORD", "")
    invalidate_cache()

    assert await User.filter(email="absent@gulfsat.mg").count() == 0
    assert await script.apply("absent@gulfsat.mg", check_only=False) == 0

    cree = await User.get(email="absent@gulfsat.mg")
    assert cree.is_admin is True
    assert verify_password("Adm1N@Gulfs4T", cree.password_hash)


async def test_la_constante_du_script_est_la_valeur_connue(db):
    """Garde-fou explicite : si la valeur de repli change un jour, ce test
    rappelle de mettre à jour ce qui est documenté."""
    from app.auth import DEFAULT_LOCAL_ADMIN_PASSWORD
    assert DEFAULT_LOCAL_ADMIN_PASSWORD == "Adm1N@Gulfs4T"
    assert len(DEFAULT_LOCAL_ADMIN_PASSWORD) >= 12