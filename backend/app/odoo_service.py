"""
Client Odoo (XML-RPC) : comparaison de l'état d'archivage des employés.

L'état d'archivage se lit sur la colonne `is_active` (« Est actif ») de
`hr.employee` — PAS sur le drapeau `active` d'Odoo, qui ne reflète pas
l'état RH réel (338 lignes ont `active = False` mais `is_active = True`).

Le rapprochement se fait par matricule (Odoo « number » ↔ `employee.matricule`)
en ignorant les zéros de tête (Odoo « 1765 » / application « 01765 »). Cette
normalisation pouvant créer des collisions (Odoo « 002012 » ≡ « 2012 »),
plusieurs lignes Odoo peuvent porter la même clé : on retient alors la
meilleure candidature (non archivée de préférence, puis matricule identique,
puis le plus ancien id).
"""
import xmlrpc.client
from datetime import datetime, timezone

from app.config import get_config

ODOO_FIELDS = ["number", "name", "active", "is_active", "work_email", "job_id", "department_id"]


class OdooError(Exception):
    """Erreur de connexion / d'interrogation d'Odoo (message affichable)."""


def odoo_config() -> dict:
    """Paramètres de connexion Odoo (configuration applicative)."""
    return {
        "url": (get_config("ODOO_URL") or "").strip().rstrip("/"),
        "db": (get_config("ODOO_DB") or "").strip(),
        "user": (get_config("ODOO_USER") or "").strip(),
        "password": get_config("ODOO_PASSWORD") or "",
    }


def odoo_configured() -> bool:
    cfg = odoo_config()
    return all(cfg.values())


def normalize_matricule(value) -> str:
    """Normalise un matricule pour le rapprochement : « 01765 » ≡ « 1765 »."""
    v = (str(value) if value is not None else "").strip()
    if v.isdigit():
        return str(int(v))
    return v


def _authenticate(cfg: dict) -> int:
    """Identifie l'utilisateur sur Odoo, ou lève `OdooError`."""
    try:
        common = xmlrpc.client.ServerProxy(f"{cfg['url']}/xmlrpc/2/common", allow_none=True)
        uid = common.authenticate(cfg["db"], cfg["user"], cfg["password"], {})
    except Exception as e:  # noqa: BLE001 — réseau / XML-RPC : message affichable
        raise OdooError(f"Connexion à Odoo impossible ({cfg['url']}) : {e}") from e
    if not uid:
        raise OdooError("Authentification Odoo refusée (identifiants ou base incorrects)")
    return uid


def fetch_odoo_employees() -> list[dict]:
    """
    Liste tous les employés Odoo (actifs ET archivés) avec leur matricule.

    Les employés archivés sont invisibles par défaut : deux recherches
    explicites (`active = True` puis `active = False`) sont nécessaires —
    Odoo 10 ignore sinon la condition sur `active`.

    `archived` est dérivé de `is_active` (« Est actif »), colonne réelle de
    l'état RH ; `active` (drapeau Odoo) est conservé à titre informatif.
    """
    cfg = odoo_config()
    if not odoo_configured():
        raise OdooError("Configuration Odoo manquante (ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD)")

    uid = _authenticate(cfg)
    models = xmlrpc.client.ServerProxy(f"{cfg['url']}/xmlrpc/2/object", allow_none=True)

    rows = []
    fields = list(ODOO_FIELDS)
    try:
        for active in (True, False):
            rows += models.execute_kw(
                cfg["db"], uid, cfg["password"], "hr.employee", "search_read",
                [[("active", "=", active)]],
                {"fields": fields, "limit": 10000},
            )
    except Exception:  # noqa: BLE001 — instance Odoo sans le champ `is_active`
        if "is_active" not in fields:
            raise
        fields.remove("is_active")
        rows = []
        try:
            for active in (True, False):
                rows += models.execute_kw(
                    cfg["db"], uid, cfg["password"], "hr.employee", "search_read",
                    [[("active", "=", active)]],
                    {"fields": fields, "limit": 10000},
                )
        except Exception as e:  # noqa: BLE001
            raise OdooError(f"Lecture de hr.employee sur Odoo impossible : {e}") from e

    employees = []
    for r in rows:
        job = r.get("job_id") or [None, None]
        dept = r.get("department_id") or [None, None]
        is_active = r.get("is_active")
        if is_active is None:
            is_active = r.get("active")
        employees.append({
            "odoo_id": r.get("id"),
            "number": str(r.get("number") or "").strip(),
            "matricule": normalize_matricule(r.get("number")),
            "name": r.get("name") or "",
            "active": bool(r.get("active")),
            "is_active": bool(is_active),
            "archived": not bool(is_active),
            "work_email": r.get("work_email") or "",
            "job": job[1] if isinstance(job, list) else str(job),
            "department": dept[1] if isinstance(dept, list) else str(dept),
        })
    return employees


def _app_entry(emp, odoo_emp=None) -> dict:
    entry = {
        "id": emp.id,
        "matricule": emp.matricule,
        "name": emp.name,
        "dept": emp.dept_str,
        "is_archived": emp.is_archived,
    }
    if odoo_emp:
        entry.update({
            "odoo_name": odoo_emp["name"],
            "odoo_department": odoo_emp["department"],
            "odoo_job": odoo_emp["job"],
            "odoo_active": odoo_emp["is_active"],
        })
    return entry


def group_by_matricule(odoo_employees: list[dict]) -> dict:
    """Indexe les lignes Odoo par matricule normalisé (plusieurs par clé)."""
    grouped: dict[str, list] = {}
    for e in odoo_employees:
        if e["matricule"]:
            grouped.setdefault(e["matricule"], []).append(e)
    return grouped


def pick_odoo_match(candidates: list, app_matricule) -> dict | None:
    """
    Choisit la ligne Odoo à associer à un matricule de l'application.

    Plusieurs lignes peuvent partager la clé normalisée (ex. Odoo « 002012 »
    record de test archivé ≡ « 2012 » employée réelle). On privilégie, par
    ordre : un enregistrement non archivé, un matricule Odoo strictement
    identique, puis l'id le plus faible.
    """
    if not candidates:
        return None
    raw = str(app_matricule or "").strip()

    def rank(e):
        return (
            0 if not e["archived"] else 1,
            0 if e["number"] == raw else 1,
            e["odoo_id"] or 0,
        )

    return min(candidates, key=rank)


async def compare_with_app() -> dict:
    """
    Compare l'état d'archivage Odoo ⇄ application (sans rien modifier).

    - `to_archive`      : archivé dans Odoo (`is_active = False`), encore actif ici ;
    - `to_restore`      : archivé ici, actif dans Odoo → vérification manuelle ;
    - `already_archived`: cohérent des deux côtés ;
    - `missing_in_odoo` : employé de l'application sans correspondance Odoo.
    """
    from app.models import Employee

    cfg = odoo_config()
    report = {
        "compared_at": datetime.now(timezone.utc),
        "odoo": {
            "configured": odoo_configured(),
            "url": cfg["url"],
            "db": cfg["db"],
            "active": 0,
            "archived": 0,
            "with_matricule": 0,
        },
        "app": {"total": 0, "archived": 0},
        "matched": 0,
        "to_archive": [],
        "to_restore": [],
        "already_archived": [],
        "missing_in_odoo": [],
        "error": None,
    }

    employees = await Employee.all()
    report["app"] = {
        "total": len(employees),
        "archived": sum(1 for e in employees if e.is_archived),
    }

    try:
        odoo_employees = fetch_odoo_employees()
    except OdooError as e:
        report["error"] = str(e)
        return report

    odoo_by_matricule = group_by_matricule(odoo_employees)
    report["odoo"]["active"] = sum(1 for e in odoo_employees if not e["archived"])
    report["odoo"]["archived"] = sum(1 for e in odoo_employees if e["archived"])
    report["odoo"]["with_matricule"] = sum(len(v) for v in odoo_by_matricule.values())

    for emp in employees:
        key = normalize_matricule(emp.matricule)
        odoo_emp = pick_odoo_match(odoo_by_matricule.get(key, []), emp.matricule)
        if odoo_emp is None:
            report["missing_in_odoo"].append(_app_entry(emp))
            continue
        report["matched"] += 1
        if odoo_emp["archived"]:
            if emp.is_archived:
                report["already_archived"].append(_app_entry(emp, odoo_emp))
            else:
                report["to_archive"].append(_app_entry(emp, odoo_emp))
        elif emp.is_archived:
            report["to_restore"].append(_app_entry(emp, odoo_emp))

    return report
