from contextlib import contextmanager

from ldap3 import ALL, Connection, Server

from app.config import get_config, set_config

# Valeurs de repli : uniquement des paramètres NON sensibles (le mot de passe du
# compte de service n'a pas de repli codé en dur, il vient de la configuration).
DEFAULTS = {
    'LDAP_SERVER_URI': 'ldap://ldap.blueline.mg:389',
    'LDAP_BIND_DN': 'cn=admin,dc=blueline,dc=mg',
    'LDAP_BIND_PASSWORD': '',
    'LDAP_USER_SEARCH_BASE': 'dc=blueline,dc=mg',
}

TRUTHY = ('1', 'true', 'yes', 'oui', 'on')

LDAP_ATTRS = [
    'uid', 'mail', 'givenName', 'sn', 'cn',
    'employeeNumber', 'departmentNumber', 'ou',
    'title', 'employeeType', 'manager',
]


class LdapUnavailable(Exception):
    """L'annuaire LDAP est injoignable ou sa configuration est inutilisable.

    À distinguer d'un simple « mot de passe refusé » : une connexion ne doit
    JAMAIS être refusée parce que le serveur n'a pas répondu.
    """


def setting(key: str) -> str:
    """Valeur LDAP courante, lue via le cache de config (donc à jour après une
    modification depuis le menu Configuration, sans redémarrage).

    Les paramètres étaient auparavant lus une seule fois à l'import du module :
    toute modification faite dans l'interface était ignorée jusqu'au
    redémarrage du backend.
    """
    return get_config(key) or DEFAULTS.get(key, '')


def ldap_auth_enabled() -> bool:
    """True si l'authentification par mot de passe LDAP est activée
    (paramètre ``USE_LDAP_PASSWORD`` du menu Configuration → LDAP)."""
    return str(get_config('USE_LDAP_PASSWORD') or '').strip().lower() in TRUTHY


@contextmanager
def temporary_settings(values: dict):
    """Applique provisoirement des valeurs de configuration (test d'un
    paramétrage non encore enregistré) et restaure l'état initial ensuite."""
    previous = {key: get_config(key) for key in values}
    try:
        for key, value in values.items():
            set_config(key, value)
        yield
    finally:
        for key, value in previous.items():
            set_config(key, value)


def _server() -> Server:
    uri = setting('LDAP_SERVER_URI').strip()
    if not uri:
        raise LdapUnavailable("LDAP_SERVER_URI n'est pas configuré")
    return Server(uri, get_info=ALL, connect_timeout=5)


def connect() -> Connection:
    """Connexion au compte de service de l'annuaire (lecture des fiches)."""
    try:
        return Connection(
            _server(),
            user=setting('LDAP_BIND_DN').strip(),
            password=setting('LDAP_BIND_PASSWORD'),
            auto_bind=True,
            receive_timeout=5,
        )
    except LdapUnavailable:
        raise
    except Exception as e:
        raise LdapUnavailable(f"Connexion LDAP impossible : {e}") from e


def find_dn(login: str) -> str | None:
    """DN de l'utilisateur correspondant à ``login``.

    ``login`` peut être l'adresse mail ou l'identifiant court. Retourne None
    si l'annuaire ne contient pas cet utilisateur.
    """
    login = (login or '').strip()
    if not login:
        return None
    candidates = [login]
    if '@' in login:
        candidates.append(login.split('@')[0])
    search_filter = '(|{})'.format(''.join(
        f'(uid={escape_ldap(c)})' for c in candidates
    ) + f'(mail={escape_ldap(login)})')
    with connect() as conn:
        if not conn.search(
            search_base=setting('LDAP_USER_SEARCH_BASE').strip(),
            search_filter=search_filter,
            attributes=['mail', 'uid', 'cn'],
        ):
            return None
        return conn.entries[0].entry_dn or None


def verify_credentials(login: str, password: str) -> bool:
    """Vérifie un couple identifiant / mot de passe contre l'annuaire LDAP.

    Retourne True si le bind est accepté, False si l'utilisateur est inconnu ou
    le mot de passe refusé. Lève ``LdapUnavailable`` si l'annuaire est
    injoignable : l'appelant ne doit pas en déduire un mot de passe invalide.
    """
    if not password:
        return False
    dn = find_dn(login)
    if not dn:
        return False
    try:
        # Bind en tant qu'utilisateur : c'est l'annuaire qui valide le mot de
        # passe, jamais le hachage stocké en base.
        return bool(Connection(
            _server(),
            user=dn,
            password=password,
            receive_timeout=5,
        ).bind())
    except LdapUnavailable:
        raise
    except Exception as e:
        raise LdapUnavailable(f"Connexion LDAP impossible : {e}") from e


def find_by_email(email: str) -> dict | None:
    """Renvoie l'enregistrement LDAP correspondant à ``email`` (dict d'attributs)
    ou None si aucun utilisateur / si l'annuaire est indisponible."""
    try:
        with connect() as conn:
            if not conn.search(
                search_base=setting('LDAP_USER_SEARCH_BASE').strip(),
                search_filter=f'(mail={escape_ldap(email)})',
                attributes=LDAP_ATTRS,
            ):
                return None
            entry = conn.entries[0]
            return {attr: first(entry, attr) for attr in LDAP_ATTRS}
    except Exception:
        return None


def first(entry, attr):
    if attr not in entry or not entry[attr]:
        return None
    value = entry[attr].value
    return value[0] if isinstance(value, list) and value else value


def full_name(rec: dict) -> str:
    given = rec.get('givenName') or ''
    sn = rec.get('sn') or ''
    if given and sn:
        return f'{given} {sn}'
    return rec.get('cn') or given or sn or rec.get('uid', 'Inconnu')


def matricule(rec: dict, email: str) -> str:
    raw = rec.get('employeeNumber')
    if raw and str(raw).strip().isdigit():
        return str(int(raw)).zfill(5)
    return rec.get('uid') or email.split('@')[0]


def dept_name(rec: dict):
    name = rec.get('departmentNumber') or rec.get('ou')
    return str(name).strip() if name and str(name).strip() else None


def escape_ldap(s: str) -> str:
    return s.replace('\\', '\\5c').replace('*', '\\2a').replace('(', '\\28').replace(')', '\\29').replace('\0', '\\00')
