# Module Calcul des Primes Commission Entreprise / Grand Compte
#
# Règles issues du fichier « Mode de calcul commision Grand compte.xlsx » (source de vérité) :
#   MRC % à considérer pour la commission = MRC réalisé / objectif MRC
#   FMS % à considérer pour la commission = (FMS réalisé / 12) / objectif FMS
#   Commission MRC  = Commission@100% objectif × MRC %
#   Commission FMS  = Commission@100% objectif × FMS %
#   Commission totale = Commission MRC + Commission FMS (plafonnée à max_commission)
#
# Objectifs et commission@100% sont GLOBAUX : issus de la table commissiongcconfig.
# Le fichier CSV fourni (prime_gc_*.csv) contient, par employé, les colonnes produits
# en double (RMS = MRC et FMS) ; on agrège le total MRC et le total FMS par employé.
import csv
import io
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.models import Bonus, BonusType, CommissionGCConfig, Employee, User, ValidationStatus
from app.auth import get_current_user
from app.schemas import (
    CommissionGCConfigCreate,
    CommissionGCConfigUpdate,
    CommissionGCConfigResponse,
    CommissionGCImportResult,
    CommissionGCPreviewResponse,
)
from app.api.commission import normalize_matricule, normalize_product_name

router = APIRouter(dependencies=[Depends(get_current_user)])

FMS_DIVISOR = 12  # Règle Excel : le réalisé FMS est divisé par 12 avant comparaison à l'objectif


# ---------------------------------------------------------------------------
# Utilitaires de parsing / normalisation
# ---------------------------------------------------------------------------

def parse_amount(value):
    """Cellule CSV → montant flottant ≥ 0. Vide/nul/non numérique → 0."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(max(0, value))
    s = str(value).strip().replace('\u00a0', '').replace(' ', '')
    if s == '':
        return 0.0
    try:
        v = float(s.replace(',', '.'))
    except (ValueError, TypeError):
        return 0.0
    return float(max(0, v))


def _csv_rows(text):
    """Lit un CSV en détectant le séparateur (',' ; ';' ou tabulation)."""
    first_line = text.split('\n', 1)[0]
    for delim in (';', ',', '\t'):
        if delim in first_line:
            return list(csv.reader(io.StringIO(text), delimiter=delim))
    return list(csv.reader(io.StringIO(text), delimiter=','))


async def parse_gc_csv(content: bytes):
    """
    CSV grand compte à EN-TÊTE DOUBLE :
      ligne 1 = noms des produits (cellule vide sur la 2e colonne de chaque produit)
      ligne 2 = RMS / FMS (sous-rapport de chaque produit ; RMS ≡ MRC)
    Retourne (header, data_rows) :
      header['columns'] = [{'index', 'product', 'metric': 'MRC'|'FMS'}]
    """
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            text = content.decode('latin-1')
        except UnicodeDecodeError:
            raise HTTPException(400, "Fichier illisible : encodage non supporté (UTF-8 attendu).")

    text = text.replace('\r\n', '\n').replace('\r', '\n')
    rows = [r for r in _csv_rows(text) if any((c or '').strip() for c in r)]
    if not rows:
        raise HTTPException(400, "Le fichier CSV est vide.")
    if len(rows) < 2:
        raise HTTPException(400, "En-tête incomplet : deux lignes d'en-tête attendues (produits puis RMS/FMS).")

    name_row = [c.strip() for c in rows[0]]
    metric_row = [c.strip().upper() for c in rows[1]]

    SKIP_NAMES = {
        'id', 'num', 'numero', 'nom', 'name', 'nom commercial', 'nom et prenom', 'noms',
        'matricule', 'matricule employe', 'matricule employé', 'mat',
        'adresse mail', 'adresse e-mail', 'adresse email', 'email', 'e-mail', 'courriel', 'mail',
        'total montant', 'total', 'montant total', 'montant', 'somme', 'cumul',
        'objectif', 'objectif mrc', 'objectif fms',
        'pourcentage', 'pourcent', 'pct', '%', 'taux',
        'prime', 'commission', 'part', 'part mrc', 'part fms',
        'observation', 'remarque', 'commentaire',
    }

    columns = []  # colonnes produits détectées
    ignored_columns = []
    current_product = ''

    for i, (name, metric) in enumerate(zip(name_row, metric_row)):
        norm = normalize_product_name(name)
        if norm in SKIP_NAMES:
            # Colonnes structurales (total montant, objectif…) : leurs cellules
            # voisines ne doivent pas être rattachées au dernier produit.
            current_product = ''
            continue
        if name:
            current_product = name
        if metric in ('RMS', 'MRC', 'FMS') and current_product:
            columns.append({
                'index': i,
                'product': current_product,
                'metric': 'MRC' if metric in ('RMS', 'MRC') else 'FMS',
            })
        elif norm:
            ignored_columns.append(name)

    return {'columns': columns, 'ignored_columns': ignored_columns}, rows[2:]


async def compute_gc_rows(content: bytes):
    """
    Lit le CSV grand compte, associe chaque ligne à un employé (matricule) et
    agrège les totaux MRC et FMS par employé (et par produit pour l'affichage).
    """
    header, data_rows = await parse_gc_csv(content)

    # Indices des colonnes Matricule et Nom (détectés sur la 1re ligne d'en-tête)
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    first_row = _csv_rows(text)[0]
    matricule_idx = name_idx = None
    for i, col in enumerate(first_row):
        norm = normalize_product_name(col)
        if norm in ('matricule', 'matricule employe', 'matricule employé', 'mat'):
            matricule_idx = i
        elif norm in ('nom', 'nom employe', 'nom employé', 'name', 'nom et prenom', 'noms'):
            name_idx = i
    if matricule_idx is None and name_idx is None:
        raise HTTPException(400, "Colonne 'Matricule' (ou 'Nom' de l'employé) introuvable dans le fichier CSV.")
    if not header['columns']:
        raise HTTPException(400, "Aucune colonne produit (RMS/FMS) trouvée dans le fichier CSV.")

    # Tous les employés en base, indexés par matricule exact ET normalisé
    employees_all = await Employee.all()
    employees_db = {}
    for e in employees_all:
        employees_db.setdefault(e.matricule, e)
        norm = normalize_matricule(e.matricule)
        if norm and norm != e.matricule:
            employees_db.setdefault(norm, e)

    # Index par nom normalisé (repli quand le matricule est manquant ou introuvable)
    def _norm_name(s):
        return ' '.join(str(s or '').lower().split())

    name_employees = [(_norm_name(e.name), e) for e in employees_all]

    def _match_by_name(raw_name):
        n = _norm_name(raw_name)
        if not n:
            return None
        exact = [e for (en, e) in name_employees if en == n]
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            return None  # nom ambigu : on ne déduit pas
        if len(n) >= 4:
            sub = [e for (en, e) in name_employees if n in en]
            if len(sub) == 1:
                return sub[0]
        return None

    employees = {}  # matricule → {employee, lines, mrc, fms}
    ignored_employees = []
    matched_products = {}

    for row in data_rows:
        raw_matricule = row[matricule_idx].strip() if (matricule_idx is not None and matricule_idx < len(row)) else ''
        emp = None
        if raw_matricule:
            emp = employees_db.get(raw_matricule) or employees_db.get(normalize_matricule(raw_matricule))
        if emp is None:
            # Matricule manquant ou introuvable : repli sur le nom de l'employé
            raw_name = row[name_idx].strip() if (name_idx is not None and name_idx < len(row)) else ''
            emp = _match_by_name(raw_name)
        if emp is None:
            label = raw_matricule or (row[name_idx].strip() if (name_idx is not None and name_idx < len(row)) else '')
            if label and label not in ignored_employees:
                ignored_employees.append(f"{label} ({'sans matricule' if not raw_matricule else 'inconnu'})")
            continue
        matricule = emp.matricule

        if matricule not in employees:
            employees[matricule] = {'employee': emp, 'lines': {}, 'mrc': 0.0, 'fms': 0.0}
        entry = employees[matricule]

        for col in header['columns']:
            idx = col['index']
            if idx >= len(row):
                continue
            value = parse_amount(row[idx])
            if value <= 0:
                continue
            if col['metric'] == 'MRC':
                entry['mrc'] += value
            else:
                entry['fms'] += value
            key = normalize_product_name(col['product'])
            if key not in entry['lines']:
                entry['lines'][key] = {'product': col['product'], 'mrc': 0.0, 'fms': 0.0}
            line = entry['lines'][key]
            line['product'] = col['product']
            if col['metric'] == 'MRC':
                line['mrc'] += value
            else:
                line['fms'] += value
            matched_products.setdefault(key, col['product'])

    return employees, ignored_employees, header['ignored_columns'], list(matched_products.values())


# ---------------------------------------------------------------------------
# Moteur de calcul (règles Excel)
# ---------------------------------------------------------------------------

def calculate_commission(entry, config):
    mrc_objective = float(config.mrc_objective or 0)
    fms_objective = float(config.fms_objective or 0)
    commission_at_100 = float(config.commission_at_100 or 0)
    max_commission = float(config.max_commission or 0)

    mrc = round(entry['mrc'], 2)
    fms = round(entry['fms'], 2)

    mrc_pct = (mrc / mrc_objective) if mrc_objective > 0 else 0.0
    fms_pct = ((fms / FMS_DIVISOR) / fms_objective) if fms_objective > 0 else 0.0

    mrc_commission = round(commission_at_100 * mrc_pct, 2)
    fms_commission = round(commission_at_100 * fms_pct, 2)
    total = round(mrc_commission + fms_commission, 2)

    capped = max_commission > 0 and total > max_commission
    if capped:
        total = round(max_commission, 2)

    return {
        'mrc': mrc,
        'fms': fms,
        'mrc_objective': mrc_objective,
        'fms_objective': fms_objective,
        'mrc_pct': mrc_pct,
        'fms_pct': fms_pct,
        'mrc_commission': mrc_commission,
        'fms_commission': fms_commission,
        'total': total,
        'capped': capped,
    }


async def get_gc_config() -> Optional[CommissionGCConfig]:
    """Configuration active de la prime commission grand compte (globale, sans période)."""
    return await CommissionGCConfig.filter(active=True).order_by('-id').first()


# Département dont le Directeur peut gérer la configuration Commission Grand Compte
COMMISSION_GC_DEPARTMENT = "Direction Commerciale"


def can_manage_gc_config(user: User) -> bool:
    """
    Droits de modification de la configuration Commission Grand Compte :
    Admin, DG, DRH, ou Directeur du département Direction Commerciale.
    """
    if user.is_admin or user.is_dg or user.is_drh:
        return True
    return bool(
        user.is_directeur
        and (user.dept_str or '') == COMMISSION_GC_DEPARTMENT
    )


def _build_lines(entry):
    lines = []
    for line in entry['lines'].values():
        ltotal = round(line['mrc'] + line['fms'], 2)
        if ltotal <= 0:
            continue
        lines.append({
            'product': line['product'],
            'mrc': round(line['mrc'], 2),
            'fms': round(line['fms'], 2),
            'total': ltotal,
        })
    lines.sort(key=lambda x: -x['total'])
    return lines


async def build_preview(employees, ignored_employees, ignored_columns, matched_products, config, period_key):
    """Construit l'aperçu (seuls les employés avec MRC ou FMS > 0 sont retenus)."""
    preview_employees = []
    total_amount = 0.0

    for matricule, entry in employees.items():
        emp = entry['employee']
        calc = calculate_commission(entry, config)
        if (calc['mrc'] <= 0 and calc['fms'] <= 0) or calc['total'] <= 0:
            continue
        preview_employees.append({
            'employee_id': emp.id,
            'matricule': emp.matricule,
            'name': emp.name,
            'department': emp.dept_str or '',
            'mrc_actual': calc['mrc'],
            'fms_actual': calc['fms'],
            'total_actual': round(calc['mrc'] + calc['fms'], 2),
            'mrc_objective': calc['mrc_objective'],
            'fms_objective': calc['fms_objective'],
            'mrc_pct': round(calc['mrc_pct'], 6),
            'fms_pct': round(calc['fms_pct'], 6),
            'mrc_commission': calc['mrc_commission'],
            'fms_commission': calc['fms_commission'],
            'total_commission': calc['total'],
            'capped': calc['capped'],
            'lines': _build_lines(entry),
        })
        total_amount += calc['total']

    preview_employees.sort(key=lambda e: e['matricule'])

    return {
        'period': {'period': period_key},
        'config': config,
        'employees': preview_employees,
        'matched_products': matched_products,
        'ignored_employees': ignored_employees,
        'ignored_columns': ignored_columns,
        'total_amount': round(total_amount, 2),
        'count': len(preview_employees),
    }


async def create_gc_bonuses(employees, config, start_date, end_date, user):
    """Crée une prime commission grand compte par employé (statut Initialisé)."""
    created = []
    skipped = []
    period_key = f"{start_date.year:04d}-{start_date.month:02d}"

    for matricule, entry in employees.items():
        emp = entry['employee']
        calc = calculate_commission(entry, config)
        total = calc['total']
        if (calc['mrc'] <= 0 and calc['fms'] <= 0) or total <= 0:
            continue

        existing = await Bonus.filter(
            employee_id=emp.id,
            bonus_type=BonusType.COMMISSION_GC,
            start_date__lte=end_date,
            end_date__gte=start_date,
        ).exists()
        if existing:
            skipped.append({
                'matricule': emp.matricule,
                'name': emp.name,
                'reason': "Une prime commission grand compte existe déjà sur cette période pour cet employé.",
            })
            continue

        bonus = await Bonus.create(
            employee_id=emp.id,
            start_date=start_date,
            end_date=end_date,
            bonus_type=BonusType.COMMISSION_GC,
            status=ValidationStatus.INITIALISE,
            total_amount=total,
            commission_amount=total,
            ca_realise=calc['mrc'] if calc['mrc'] > 0 else None,
            ca_objectif=calc['mrc_objective'] if calc['mrc_objective'] > 0 else None,
            created_by_id=user.id,
            details={
                'mrc_actual': calc['mrc'],
                'fms_actual': calc['fms'],
                'mrc_objective': calc['mrc_objective'],
                'fms_objective': calc['fms_objective'],
                'mrc_pct': round(calc['mrc_pct'], 6),
                'fms_pct': round(calc['fms_pct'], 6),
                'commission_at_100': float(config.commission_at_100),
                'max_commission': float(config.max_commission),
                'mrc_commission': calc['mrc_commission'],
                'fms_commission': calc['fms_commission'],
                'fms_divisor': FMS_DIVISOR,
                'capped': calc['capped'],
                'period': period_key,
                'lines': _build_lines(entry),
                'config_id': config.id,
                'source': 'csv_gc_import',
                'imported': True,
            },
        )
        created.append({
            'id': bonus.id,
            'employee_id': emp.id,
            'matricule': emp.matricule,
            'name': emp.name,
            'total': total,
        })

    return created, skipped


def _require_commission_rights(user: User):
    if not (user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur):
        raise HTTPException(403, "Vous n'avez pas le droit de créer des primes commission.")


async def _load_gc_csv_and_compute(file: UploadFile):
    content = await file.read()
    return await compute_gc_rows(content)


# ---------------------------------------------------------------------------
# CRUD Configuration Commission Grand Compte (commissiongcconfig)
# ---------------------------------------------------------------------------

@router.get("/commission-gc-config", response_model=List[CommissionGCConfigResponse])
async def list_gc_config(
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
):
    query = CommissionGCConfig.all()
    if not include_inactive:
        query = query.filter(active=True)
    return await query.order_by('-id')


@router.post("/commission-gc-config", response_model=CommissionGCConfigResponse)
async def create_gc_config(
    data: CommissionGCConfigCreate,
    user: User = Depends(get_current_user),
):
    if not can_manage_gc_config(user):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG, DRH et Directeur Direction Commerciale.")

    obj = await CommissionGCConfig.create(**data.dict())
    return obj


@router.put("/commission-gc-config/{config_id}", response_model=CommissionGCConfigResponse)
async def update_gc_config(
    config_id: int,
    data: CommissionGCConfigUpdate,
    user: User = Depends(get_current_user),
):
    if not can_manage_gc_config(user):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG, DRH et Directeur Direction Commerciale.")

    obj = await CommissionGCConfig.get_or_none(id=config_id)
    if not obj:
        raise HTTPException(404, "Configuration grand compte introuvable.")

    update_data = data.dict(exclude_unset=True)
    if update_data:
        await obj.update_from_dict(update_data)
        await obj.save()
    return await CommissionGCConfig.get(id=config_id)


@router.delete("/commission-gc-config/{config_id}")
async def delete_gc_config(config_id: int, user: User = Depends(get_current_user)):
    if not can_manage_gc_config(user):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG, DRH et Directeur Direction Commerciale.")

    obj = await CommissionGCConfig.get_or_none(id=config_id)
    if not obj:
        raise HTTPException(404, "Configuration grand compte introuvable.")
    await obj.delete()
    return {"message": "Configuration grand compte supprimée."}


# ---------------------------------------------------------------------------
# Import CSV grand compte : aperçu puis création
# ---------------------------------------------------------------------------

@router.post("/bonuses/commission-gc/preview", response_model=CommissionGCPreviewResponse)
async def preview_gc_bonuses(
    file: UploadFile = File(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    user: User = Depends(get_current_user),
):
    _require_commission_rights(user)
    if start_date > end_date:
        raise HTTPException(400, "La date de début ne peut pas être après la date de fin.")

    employees, ignored_employees, ignored_columns, matched_products = await _load_gc_csv_and_compute(file)

    period_key = f"{start_date.year:04d}-{start_date.month:02d}"
    config = await get_gc_config()
    if config is None:
        raise HTTPException(
            400,
            "Aucune configuration 'Prime Commission Entreprise / Grand Compte' active. "
            "Configurez d'abord les objectifs MRC/FMS et la commission@100% (Admin → Configuration → Commission Grand Compte).",
        )

    return await build_preview(
        employees, ignored_employees, ignored_columns, matched_products, config, period_key
    )


@router.post("/bonuses/commission-gc/import", response_model=CommissionGCImportResult)
async def import_gc_bonuses(
    file: UploadFile = File(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    user: User = Depends(get_current_user),
):
    _require_commission_rights(user)
    if start_date > end_date:
        raise HTTPException(400, "La date de début ne peut pas être après la date de fin.")

    employees, ignored_employees, ignored_columns, matched_products = await _load_gc_csv_and_compute(file)

    period_key = f"{start_date.year:04d}-{start_date.month:02d}"
    config = await get_gc_config()
    if config is None:
        raise HTTPException(
            400,
            "Aucune configuration 'Prime Commission Entreprise / Grand Compte' active. "
            "Configurez d'abord les objectifs MRC/FMS et la commission@100% (Admin → Configuration → Commission Grand Compte).",
        )

    created, skipped = await create_gc_bonuses(employees, config, start_date, end_date, user)

    if not created and not skipped:
        raise HTTPException(400, "Aucune commission calculée : vérifiez les matricules et les produits du fichier.")

    total_amount = round(sum(c['total'] for c in created), 2)
    return CommissionGCImportResult(
        created=created,
        skipped=skipped,
        total_amount=total_amount,
        count=len(created),
    )