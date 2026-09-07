import os
from ldap3 import ALL, Connection, Server

LDAP_SERVER_URI = os.getenv('LDAP_SERVER_URI', 'ldap://ldap.blueline.mg:389')
LDAP_BIND_DN = os.getenv('LDAP_BIND_DN', 'cn=admin,dc=blueline,dc=mg')
LDAP_BIND_PASSWORD = os.getenv('LDAP_BIND_PASSWORD', 'blueline2488')
LDAP_USER_SEARCH_BASE = os.getenv('LDAP_USER_SEARCH_BASE', 'dc=blueline,dc=mg')

LDAP_ATTRS = [
    'uid', 'mail', 'givenName', 'sn', 'cn',
    'employeeNumber', 'departmentNumber', 'ou',
    'title', 'employeeType', 'manager',
]


def connect() -> Connection:
    server = Server(LDAP_SERVER_URI, get_info=ALL, connect_timeout=5)
    return Connection(
        server,
        user=LDAP_BIND_DN,
        password=LDAP_BIND_PASSWORD,
        auto_bind=True,
        receive_timeout=5,
    )


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