import json
import os
import re
from datetime import datetime, date, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from tortoise import connections

from app.auth import get_current_user
from app.models import User

router = APIRouter()

DUMPS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "dumps")


def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


# ---------------------------------------------------------------------------
# Introspection du schéma PostgreSQL (information_schema + pg_catalog)
# ---------------------------------------------------------------------------

async def _query(sql, params=None):
    conn = connections.get('default')
    _, rows = await conn.execute_query(sql, params or ())
    return rows


async def _table_names():
    rows = await _query(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    )
    return [r['table_name'] for r in rows]


async def _columns_by_table():
    rows = await _query(
        "SELECT table_name, column_name, ordinal_position, data_type, is_nullable, "
        "column_default, character_maximum_length, numeric_precision, numeric_scale, "
        "datetime_precision "
        "FROM information_schema.columns "
        "WHERE table_schema = 'public' "
        "ORDER BY table_name, ordinal_position"
    )
    by_table = {}
    for r in rows:
        by_table.setdefault(r['table_name'], []).append(dict(r))
    return by_table


async def _primary_keys():
    rows = await _query(
        "SELECT tc.table_name, kcu.column_name, kcu.ordinal_position "
        "FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "  ON tc.constraint_name = kcu.constraint_name "
        " AND tc.table_schema = kcu.table_schema "
        "WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' "
        "ORDER BY tc.table_name, kcu.ordinal_position"
    )
    pks = {}
    for r in rows:
        pks.setdefault(r['table_name'], []).append(r['column_name'])
    return pks


async def _unique_constraints():
    rows = await _query(
        "SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position "
        "FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "  ON tc.constraint_name = kcu.constraint_name "
        " AND tc.table_schema = kcu.table_schema "
        "WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public' "
        "ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position"
    )
    uniques = {}
    for r in rows:
        uniques.setdefault((r['table_name'], r['constraint_name']), []).append(r['column_name'])
    return uniques


async def _foreign_keys():
    rows = await _query(
        "SELECT tc.table_name, tc.constraint_name, kcu.column_name, "
        "ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, "
        "rc.delete_rule "
        "FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "  ON tc.constraint_name = kcu.constraint_name "
        " AND tc.table_schema = kcu.table_schema "
        "JOIN information_schema.constraint_column_usage ccu "
        "  ON ccu.constraint_name = tc.constraint_name "
        " AND ccu.table_schema = tc.table_schema "
        "JOIN information_schema.referential_constraints rc "
        "  ON rc.constraint_name = tc.constraint_name "
        " AND rc.constraint_schema = tc.table_schema "
        "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' "
        "ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position"
    )
    fks = {}
    for r in rows:
        name = r['constraint_name']
        fks.setdefault((r['table_name'], name), {
            'table_name': r['table_name'],
            'constraint_name': name,
            'columns': [],
            'foreign_table': r['foreign_table_name'],
            'foreign_columns': [],
            'delete_rule': (r['delete_rule'] or 'NO ACTION').upper(),
        })
        fks[(r['table_name'], name)]['columns'].append(r['column_name'])
        fks[(r['table_name'], name)]['foreign_columns'].append(r['foreign_column_name'])
    return list(fks.values())


# ---------------------------------------------------------------------------
# Construction des types de colonnes pour le CREATE TABLE
# ---------------------------------------------------------------------------

def _column_type(col):
    dt = col['data_type'].lower()
    if dt == 'character varying':
        return f"VARCHAR({col['character_maximum_length'] or 255})"
    if dt == 'character':
        return f"CHAR({col['character_maximum_length'] or 1})"
    if dt in ('timestamp without time zone',):
        return "TIMESTAMP"
    if dt in ('timestamp with time zone',):
        return "TIMESTAMPTZ"
    if dt in ('time without time zone',):
        return "TIME"
    if dt in ('time with time zone',):
        return "TIMETZ"
    if dt == 'numeric':
        if col['numeric_precision'] and col['numeric_scale'] is not None:
            return f"NUMERIC({col['numeric_precision']},{col['numeric_scale']})"
        return "NUMERIC"
    if dt == 'integer':
        return "INTEGER"
    if dt == 'bigint':
        return "BIGINT"
    if dt == 'smallint':
        return "SMALLINT"
    if dt == 'serial':
        return "SERIAL"
    if dt == 'bigserial':
        return "BIGSERIAL"
    if dt in ('double precision', 'double'):
        return "DOUBLE PRECISION"
    if dt == 'real':
        return "REAL"
    if dt == 'boolean':
        return "BOOLEAN"
    if dt == 'bytea':
        return "BYTEA"
    if dt == 'uuid':
        return "UUID"
    if dt == 'json':
        return "JSON"
    if dt == 'jsonb':
        return "JSONB"
    return dt.upper()


def _type_is_castable_json(col):
    return col['data_type'].lower() in ('json', 'jsonb')


def _type_is_temporal(col):
    dt = col['data_type'].lower()
    return 'timestamp' in dt or 'date' in dt or ('time' in dt and 'timestamp' not in dt)


def _type_has_tz(col):
    return 'with time zone' in col['data_type'].lower()


def _type_is_bytea(col):
    return col['data_type'].lower() == 'bytea'


# ---------------------------------------------------------------------------
# Échappement des valeurs SQL
# ---------------------------------------------------------------------------

def _escape_str(value):
    return value.replace("'", "''")


def _sql_literal(value, col=None):
    castable_json = _type_is_castable_json(col) if col else False
    temporal = _type_is_temporal(col) if col else False
    has_tz = _type_has_tz(col) if col else False
    bytea = _type_is_bytea(col) if col else False

    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, int):
        return str(value)

    if isinstance(value, float):
        if value != value:
            return "'NaN'"
        if value in (float('inf'), float('-inf')):
            return f"'{'-Infinity' if value < 0 else 'Infinity'}::float8'"
        return repr(value)

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, datetime):
        if has_tz:
            return f"'{value.isoformat()}'::timestamptz"
        return f"'{value.strftime('%Y-%m-%d %H:%M:%S.%f')}'::timestamp"

    if isinstance(value, date):
        return f"'{value.isoformat()}'::date" if temporal else f"'{value.isoformat()}'"

    if isinstance(value, time):
        if has_tz:
            return f"'{value.isoformat()}'::timetz"
        return f"'{value.isoformat()}'::time"

    if isinstance(value, bytes):
        return f"'\\\\x{value.hex()}'::bytea"

    if isinstance(value, (dict, list)):
        raw = json.dumps(value, ensure_ascii=False)
        return f"'{_escape_str(raw)}'::jsonb"

    if bytea:
        return f"'\\\\x{value.encode().hex()}'::bytea"

    text = str(value)
    escaped = _escape_str(text)
    if temporal:
        return f"'{escaped}'::{'timestamptz' if has_tz else 'timestamp'}"
    if castable_json:
        return f"'{escaped}'::jsonb"
    return f"'{escaped}'"


# ---------------------------------------------------------------------------
# Tri topologique des tables (parents avant enfants)
# ---------------------------------------------------------------------------

def _topological_order(tables, fks):
    graph = {t: set() for t in tables}
    for fk in fks:
        child = fk['table_name']
        parent = fk['foreign_table']
        if child in graph and parent in graph:
            graph[child].add(parent)

    ordered = []
    visited = set()
    visiting = set()

    def visit(node):
        if node in visited:
            return
        if node in visiting:
            return  # cycle -> on l'ignore, le CASCADE fait le reste
        visiting.add(node)
        for dep in graph.get(node, ()):
            visit(dep)
        visiting.discard(node)
        visited.add(node)
        ordered.append(node)

    for t in tables:
        visit(t)
    return ordered


# ---------------------------------------------------------------------------
# Génération du dump complet
# ---------------------------------------------------------------------------

async def _generate_dump():
    tables = await _table_names()
    columns = await _columns_by_table()
    pks = await _primary_keys()
    uniques = await _unique_constraints()
    fks = await _foreign_keys()

    order = _topological_order(tables, fks)

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- Sauvegarde COMPLÈTE de la base BPM Primes")
    lines.append(f"-- Date : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("-- Tables : " + ", ".join(tables))
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # --- Suppression des anciennes tables (enfants d'abord) ---
    lines.append("-- === Suppression des tables existantes ===")
    for t in reversed(order):
        lines.append(f'DROP TABLE IF EXISTS "{t}" CASCADE;')
    lines.append("")

    # --- Création des tables (parents d'abord) ---
    lines.append("-- === Création des tables ===")
    for t in order:
        cols = columns.get(t, [])
        if not cols:
            continue

        # Les colonnes à auto-incrémentation reposent sur des séquences qui
        # disparaissent avec le DROP TABLE : on les recrée explicitement.
        for c in cols:
            default = c['column_default'] or ''
            m = re.match(r"nextval\('([^']+)'::regclass\)", default)
            if m:
                seq = m.group(1)
                lines.append(f'CREATE SEQUENCE IF NOT EXISTS "{seq}";')

        blocks = []
        for c in cols:
            name = c['column_name']
            line = f'    "{name}" {_column_type(c)}'
            if c['is_nullable'] == 'NO':
                line += " NOT NULL"
            if c['column_default'] is not None:
                default = c['column_default']
                if default.startswith("nextval("):
                    line += f" DEFAULT {default}"
                elif default.startswith("'") or default.lower() in ('true', 'false', 'current_timestamp', 'now()', 'now', 'clock_timestamp()'):
                    line += f" DEFAULT {default}"
                else:
                    try:
                        float(default)
                        line += f" DEFAULT {default}"
                    except (ValueError, TypeError):
                        stripped = default.strip().strip("'")
                        line += f" DEFAULT {_sql_literal(stripped)}"
            blocks.append(line)

        pk_cols = pks.get(t)
        if pk_cols:
            pk_list = ", ".join('"{0}"'.format(c) for c in pk_cols)
            blocks.append(f'    PRIMARY KEY ({pk_list})')

        for (tn, cn), cols_list in uniques.items():
            if tn != t:
                continue
            unique_list = ", ".join('"{0}"'.format(c) for c in cols_list)
            blocks.append(f'    UNIQUE ({unique_list})')

        lines.append(f'CREATE TABLE "{t}" (')
        lines.append(",\n".join(blocks))
        lines.append(");")
        lines.append("")

    # --- Contraintes étrangères ---
    for fk in fks:
        child = fk['table_name']
        parent = fk['foreign_table']
        cols_str = ", ".join(f'"{c}"' for c in fk['columns'])
        fcols_str = ", ".join(f'"{c}"' for c in fk['foreign_columns'])
        on_delete = fk['delete_rule']
        if on_delete == 'NO ACTION':
            on_delete = 'NO ACTION'
        elif on_delete == 'RESTRICT':
            on_delete = 'RESTRICT'
        elif on_delete == 'CASCADE':
            on_delete = 'CASCADE'
        elif on_delete == 'SET NULL':
            on_delete = 'SET NULL'
        elif on_delete == 'SET DEFAULT':
            on_delete = 'SET DEFAULT'
        lines.append(
            f'ALTER TABLE "{child}" ADD CONSTRAINT "{fk.get("constraint_name", "fk")}"'
        )
        lines.append(
            f'    FOREIGN KEY ({cols_str}) REFERENCES "{parent}" ({fcols_str})'
        )
        lines.append(
            f'    ON DELETE {on_delete};'
        )
        lines.append("")

    # --- Données (parents d'abord) ---
    lines.append("-- === Données ===")
    conn = connections.get('default')
    for t in order:
        cols = columns.get(t, [])
        if not cols:
            continue
        col_names = [c['column_name'] for c in cols]
        select_list = ", ".join(f'"{c}"' for c in col_names)
        _, data_rows = await conn.execute_query(f'SELECT {select_list} FROM "{t}"')
        if not data_rows:
            continue
        target = len(col_names)
        insert_lines = []
        for row in data_rows:
            values = []
            for i in range(target):
                values.append(_sql_literal(row[i], cols[i]))
            insert_lines.append(f"({', '.join(values)})")
        lines.append(f'-- Table: "{t}" ({len(data_rows)} lignes)')
        for start in range(0, len(insert_lines), 500):
            chunk = insert_lines[start:start + 500]
            lines.append(f'INSERT INTO "{t}" ({select_list}) VALUES')
            lines.append(",\n".join(chunk) + ";")
        lines.append("")

    # --- Remise à jour des séquences ---
    lines.append("-- === Mise à jour des séquences ===")
    for t in order:
        cols = columns.get(t, [])
        for c in cols:
            if c['column_name'] != 'id':
                continue
            default = c['column_default'] or ''
            m = re.search(r"nextval\('([^']+)'", default)
            if not m:
                continue
            seq = m.group(1)
            lines.append(
                f"SELECT setval('{seq}', GREATEST((SELECT COALESCE(MAX(\"id\"), 0) + 1 FROM \"{t}\"), 1), false);"
            )
    lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- ============================================================")
    lines.append("-- Fin de la sauvegarde complète")
    lines.append("-- ============================================================")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoints API
# ---------------------------------------------------------------------------

class DatabaseDumpCreate(BaseModel):
    label: str = "backup"


@router.post("/database/dumps", status_code=201)
async def create_database_dump(data: DatabaseDumpCreate, admin: User = Depends(require_admin)):
    """Génère et sauvegarde un dump SQL COMPLET de la base (schéma + données + relations + séquences)."""
    os.makedirs(DUMPS_DIR, exist_ok=True)

    try:
        sql = await _generate_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération du dump : {str(e)}")

    safe_label = re.sub(r'[^\w\s-]', '', data.label).strip().replace(' ', '_')[:40] or 'backup'
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{ts}_{safe_label}.sql"
    filepath = os.path.join(DUMPS_DIR, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(sql)

    size = os.path.getsize(filepath)
    tables = sql.count("CREATE TABLE")

    return {
        "filename": filename,
        "size_bytes": size,
        "size_display": f"{size / 1024:.1f} Ko" if size >= 1024 else f"{size} o",
        "num_tables": tables,
        "created_at": datetime.now(),
    }


@router.get("/database/dumps")
async def list_database_dumps(admin: User = Depends(require_admin)):
    """Liste tous les dumps générés."""
    os.makedirs(DUMPS_DIR, exist_ok=True)
    files = []
    for fname in sorted(os.listdir(DUMPS_DIR), reverse=True):
        if not fname.endswith('.sql'):
            continue
        fpath = os.path.join(DUMPS_DIR, fname)
        fsize = os.path.getsize(fpath)
        # Taille en octets + nombre de lignes estimé
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                text = f.read()
            num_tables = text.count("CREATE TABLE")
            num_inserts = text.count("INSERT INTO")
        except OSError:
            num_tables = 0
            num_inserts = 0
        files.append({
            "filename": fname,
            "size_bytes": fsize,
            "size_display": f"{fsize / 1024:.1f} Ko" if fsize >= 1024 else f"{fsize} o",
            "num_tables": num_tables,
            "num_inserts": num_inserts,
            "modified_at": datetime.fromtimestamp(os.path.getmtime(fpath)),
        })
    return {"dumps": files}


@router.get("/database/dumps/{filename}")
async def download_database_dump(filename: str, admin: User = Depends(require_admin)):
    """Télécharge un dump SQL."""
    safe = os.path.basename(filename)
    filepath = os.path.join(DUMPS_DIR, safe)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Dump introuvable")
    return FileResponse(filepath, media_type='application/sql', filename=safe)


@router.post("/database/dumps/{filename}/restore")
async def restore_database_dump(filename: str, admin: User = Depends(require_admin)):
    """Restaure la base ENTIÈRE depuis un dump SQL (supprime les tables existantes puis réinsère)."""
    safe = os.path.basename(filename)
    filepath = os.path.join(DUMPS_DIR, safe)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Dump introuvable")

    with open(filepath, 'r', encoding='utf-8') as f:
        sql = f.read()

    try:
        conn = connections.get('default')
        await conn.execute_script(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la restauration : {str(e)}")

    return {
        "message": f"Base restaurée depuis {safe}",
        "filename": safe,
        "num_tables_created": sql.count("CREATE TABLE"),
        "num_rows_inserted": sql.count("INSERT INTO"),
    }


@router.delete("/database/dumps/{filename}")
async def delete_database_dump(filename: str, admin: User = Depends(require_admin)):
    """Supprime un dump SQL."""
    safe = os.path.basename(filename)
    filepath = os.path.join(DUMPS_DIR, safe)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Dump introuvable")
    os.remove(filepath)
    return {"message": f"Dump {safe} supprimé"}