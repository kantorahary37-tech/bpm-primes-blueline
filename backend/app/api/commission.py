# Module Calcul des Primes Commission
# - Barème des commissions (table commissionconfig)
# - Import du fichier CSV 4D (ventes mensuelles) avec calcul des commissions
# - Aperçu avant création, puis création des primes "commission"
import csv
import io
import re
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.models import Bonus, BonusType, CommissionConfig, Employee, User, ValidationStatus
from app.auth import get_current_user
from app.schemas import (
    CommissionConfigCreate,
    CommissionConfigUpdate,
    CommissionConfigResponse,
    CommissionPreviewResponse,
    CommissionEmployeePreview,
    CommissionLine,
    CommissionImportResult,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Utilitaires de parsing / normalisation
# ---------------------------------------------------------------------------

def normalize_product_name(name):
    """Normalise un nom de produit : minuscules + espaces multiples réduits à un."""
    if name is None:
        return ''
    return re.sub(r'\s+', ' ', str(name)).strip().lower()


def normalize_matricule(value):
    """
    Normalise un matricule pour la comparaison.
    - retire espaces et espaces insécables
    - retire l'apostrophe de protection Excel ('01814)
    - retire le ".0" d'une cellule numérique (1814.0)
    - supprime les zéros initiaux des matricules numériques (01814 → 1814)
    - insensible à la casse pour les matricules alphanumériques
    """
    if value is None:
        return ''
    s = str(value).strip().replace('\u00a0', ' ').strip()
    if s.startswith("'"):
        s = s[1:]
    if s.endswith('.0') and s[:-2].isdigit():
        s = s[:-2]
    if s.isdigit():
        return str(int(s))
    return s.lower()


def parse_pdv(value):
    """
    Cellule CSV 'Point de vente' → is_gpv (Grand point de vente = True).
    'Grand point de vente' / 'GPV' → True ; 'Petit point de vente' / 'PDV' → False.
    """
    if value is None:
        return False
    s = str(value).strip().lower()
    if any(k in s for k in ('grand', 'gpv')):
        return True
    return False


def parse_ventes(value):
    """Cellule CSV → nombre de ventes (entier ≥ 0). Vide/nul/négatif/non numérique → 0."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        v = float(value)
        return int(max(0, round(v)))
    s = str(value).strip().replace('\u00a0', '')
    if s == '':
        return 0
    try:
        v = float(s.replace(',', '.'))
    except (ValueError, TypeError):
        return 0
    if v < 0:
        return 0
    return int(round(v))


async def load_active_configs():
    """
    Charge le barème actif : nom normalisé → {is_gpv: config}.
    Un même produit peut avoir deux lignes : une pour GPV (objectif élevé)
    et une pour petit point de vente (objectif bas).
    """
    configs = await CommissionConfig.filter(active=True)
    by_name = {}
    for c in configs:
        key = normalize_product_name(c.product_name)
        if key:
            by_name.setdefault(key, {})[bool(c.is_gpv)] = c
    return by_name


async def parse_csv_4d(content: bytes):
    """Parse le CSV 4D (séparateur ;, encodage UTF-8, BOM toléré)."""
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            text = content.decode('latin-1')
        except UnicodeDecodeError:
            raise HTTPException(400, "Fichier illisible : encodage non supporté (UTF-8 attendu).")

    text = text.replace('\r\n', '\n').replace('\r', '\n')
    reader = csv.reader(io.StringIO(text), delimiter=';')
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise HTTPException(400, "Le fichier CSV est vide.")
    header = [h.strip() for h in rows[0]]
    data_rows = rows[1:]
    return header, data_rows


async def compute_commission_rows(content: bytes, by_name: dict):
    """
    Lit le CSV, fait correspondre les colonnes aux produits du barème et les
    matricules aux employés, puis calcule la commission par employé/produit.
    Retourne : employees (dict matricule → {employee, lines, total}),
               ignored_employees, ignored_columns, matched_products.
    """
    header, data_rows = await parse_csv_4d(content)

    # Indices des colonnes spéciales
    nom_idx = None
    matricule_idx = None
    pdv_idx = None
    product_idxs = {}
    ignored_columns = []
    matched_products = []

    for i, col in enumerate(header):
        norm = normalize_product_name(col)
        if norm in ('nom', 'name', 'nom commercial'):
            nom_idx = i
            continue
        if norm in ('matricule', 'matricule employe', 'matricule employé', 'mat'):
            matricule_idx = i
            continue
        if norm in ('point de vente', 'point de vent', 'pdv', 'gpv', 'type de point de vente',
                    'type pdv', 'categorie point de vente', 'categorie pdv', 'point de vente (gpv)'):
            pdv_idx = i
            continue
        if norm == '':
            continue
        if norm in by_name:
            if norm not in product_idxs:
                product_idxs[norm] = []
            product_idxs[norm].append(i)
            if norm not in matched_products:
                matched_products.append(norm)
        else:
            ignored_columns.append(col)

    if matricule_idx is None:
        raise HTTPException(400, "Colonne 'Matricule' introuvable dans le fichier CSV.")

    # Tous les employés en base, indexés par matricule exact ET par matricule normalisé
    # (tolère les zéros initiaux : la base stocke 01814, le CSV 4D fournit 1814).
    employees_db = {}
    for e in await Employee.all():
        employees_db.setdefault(e.matricule, e)
        norm = normalize_matricule(e.matricule)
        if norm and norm != e.matricule:
            employees_db.setdefault(norm, e)

    # Agréger par employé (gère les matricules en double dans le CSV)
    employees = {}  # matricule → {employee, is_gpv, lines: {product_key: CommissionLine}, total}
    ignored_employees = []

    for row in data_rows:
        raw_matricule = row[matricule_idx].strip() if matricule_idx < len(row) else ''
        if not raw_matricule:
            continue
        emp = employees_db.get(raw_matricule)
        if emp is None:
            emp = employees_db.get(normalize_matricule(raw_matricule))
        if emp is None:
            if raw_matricule not in ignored_employees:
                ignored_employees.append(raw_matricule)
            continue
        # Utilise le matricule officiel de la base pour l'agrégation et l'affichage
        matricule = emp.matricule
        is_gpv = parse_pdv(row[pdv_idx]) if pdv_idx is not None and pdv_idx < len(row) else False

        if matricule not in employees:
            employees[matricule] = {
                'employee': emp,
                'is_gpv': is_gpv,
                'lines': {},
                'total': 0.0,
            }
        entry = employees[matricule]
        entry['is_gpv'] = entry['is_gpv'] or is_gpv

        for norm, idxs in product_idxs.items():
            # Barème selon le type de point de vente : GPV → objectif élevé, sinon objectif standard
            configs = by_name.get(norm, {})
            config = configs.get(is_gpv)
            if config is None:
                # Barème exact absent (ex : GPV non configuré) → repli silencieux sur l'autre barème,
                # signalé dans l'aperçu pour éviter un calcul avec le mauvais objectif.
                entry['barème_fallback'] = True
                config = configs.get(not is_gpv)
            if config is None:
                continue
            ventes = 0
            for idx in idxs:
                raw = row[idx] if idx < len(row) else None
                ventes += parse_ventes(raw)
            if ventes <= 0:
                continue
            if norm not in entry['lines']:
                entry['lines'][norm] = {
                    'designation': config.product_name,
                    'nombre': 0,
                    'taux': float(config.rate),
                    'objectif': int(config.objectif),
                    'doublé': False,
                    'montant': 0.0,
                }
            line = entry['lines'][norm]
            line['nombre'] += ventes
            taux = float(config.rate)
            objectif = int(config.objectif)
            if objectif > 0 and line['nombre'] >= objectif:
                line['montant'] = (line['nombre'] * taux) * 2
                line['doublé'] = True
            else:
                line['montant'] = line['nombre'] * taux
            entry['total'] = sum(l['montant'] for l in entry['lines'].values())

    return employees, ignored_employees, ignored_columns, matched_products


async def build_preview(employees, ignored_employees, ignored_columns, matched_products, start_date, end_date):
    """Construit la réponse d'aperçu (seuls les employés avec total > 0 sont retenus)."""
    preview_employees = []
    total_amount = 0.0

    for matricule, entry in employees.items():
        emp = entry['employee']
        total = round(entry['total'], 2)
        if total <= 0:
            continue
        lines = [
            CommissionLine(
                designation=l['designation'],
                nombre=l['nombre'],
                taux=l['taux'],
                objectif=l['objectif'],
                doublé=l['doublé'],
                montant=round(l['montant'], 2),
            )
            for l in sorted(entry['lines'].values(), key=lambda x: -x['montant'])
        ]
        preview_employees.append(CommissionEmployeePreview(
            employee_id=emp.id,
            matricule=emp.matricule,
            name=emp.name,
            department=emp.dept_str or '',
            is_gpv=bool(entry.get('is_gpv')),
            barème_fallback=bool(entry.get('barème_fallback')),
            total=total,
            lines=lines,
        ))
        total_amount += total

    preview_employees.sort(key=lambda e: -e.total)

    return CommissionPreviewResponse(
        period={'start_date': start_date.isoformat(), 'end_date': end_date.isoformat()},
        employees=preview_employees,
        matched_products=matched_products,
        ignored_employees=ignored_employees,
        ignored_columns=ignored_columns,
        total_amount=round(total_amount, 2),
        count=len(preview_employees),
    )


async def create_commission_bonuses(employees, start_date, end_date, user):
    """Crée une prime commission par employé (statut Initialisé). Les conflits sont signalés."""
    created = []
    skipped = []

    for matricule, entry in employees.items():
        emp = entry['employee']
        total = round(entry['total'], 2)
        if total <= 0:
            continue

        existing = await Bonus.filter(
            employee_id=emp.id,
            bonus_type=BonusType.COMMISSION,
            start_date__lte=end_date,
            end_date__gte=start_date,
        ).exists()
        if existing:
            skipped.append({
                'matricule': emp.matricule,
                'name': emp.name,
                'reason': "Une prime commission existe déjà sur cette période pour cet employé.",
            })
            continue

        sales = [
            {
                'designation': l['designation'],
                'nombre': l['nombre'],
                'taux': l['taux'],
                'objectif': l['objectif'],
                'doublé': l['doublé'],
                'montant': round(l['montant'], 2),
            }
            for l in sorted(entry['lines'].values(), key=lambda x: -x['montant'])
        ]

        bonus = await Bonus.create(
            employee_id=emp.id,
            start_date=start_date,
            end_date=end_date,
            bonus_type=BonusType.COMMISSION,
            status=ValidationStatus.INITIALISE,
            total_amount=total,
            commission_amount=total,
            created_by_id=user.id,
            details={
                'sales': sales,
                'total': total,
                'source': 'csv_import',
                'imported': True,
                'is_gpv': bool(entry.get('is_gpv')),
            },
        )
        created.append({
            'id': bonus.id,
            'employee_id': emp.id,
            'matricule': emp.matricule,
            'name': emp.name,
            'is_gpv': bool(entry.get('is_gpv')),
            'total': total,
        })

    return created, skipped


# ---------------------------------------------------------------------------
# CRUD Barème (commissionconfig)
# ---------------------------------------------------------------------------

@router.get("/commission-config", response_model=List[CommissionConfigResponse])
async def list_commission_config(
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
):
    query = CommissionConfig.all()
    if not include_inactive:
        query = query.filter(active=True)
    return await query.order_by('group_name', 'product_name')


@router.post("/commission-config", response_model=CommissionConfigResponse)
async def create_commission_config(
    data: CommissionConfigCreate,
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG et DRH.")

    existing = await CommissionConfig.filter(
        product_name__iexact=data.product_name.strip(),
        is_gpv=data.is_gpv,
    ).first()
    if existing:
        type_pdv = "GPV" if data.is_gpv else "petit point de vente"
        raise HTTPException(409, f"Le produit '{data.product_name}' existe déjà pour {type_pdv} dans le barème.")

    obj = await CommissionConfig.create(
        product_name=data.product_name.strip(),
        rate=data.rate,
        objectif=data.objectif,
        group_name=data.group_name or '',
        active=data.active,
        is_gpv=data.is_gpv,
    )
    return obj


@router.put("/commission-config/{config_id}", response_model=CommissionConfigResponse)
async def update_commission_config(
    config_id: int,
    data: CommissionConfigUpdate,
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG et DRH.")

    obj = await CommissionConfig.get_or_none(id=config_id)
    if not obj:
        raise HTTPException(404, "Produit du barème introuvable.")

    update_data = data.dict(exclude_unset=True)
    if 'product_name' in update_data or 'is_gpv' in update_data:
        new_name = update_data.get('product_name', obj.product_name).strip()
        new_is_gpv = bool(update_data.get('is_gpv', obj.is_gpv))
        dup = await CommissionConfig.filter(
            product_name__iexact=new_name,
            is_gpv=new_is_gpv,
        ).exclude(id=config_id).first()
        if dup:
            type_pdv = "GPV" if new_is_gpv else "petit point de vente"
            raise HTTPException(409, f"Le produit '{new_name}' existe déjà pour {type_pdv} dans le barème.")
        update_data['product_name'] = new_name
    if update_data:
        await obj.update_from_dict(update_data)
        await obj.save()
    return await CommissionConfig.get(id=config_id)


@router.delete("/commission-config/{config_id}")
async def delete_commission_config(config_id: int, user: User = Depends(get_current_user)):
    if not (user.is_admin or user.is_dg or user.is_drh):
        raise HTTPException(403, "Accès réservé aux administrateurs, DG et DRH.")

    obj = await CommissionConfig.get_or_none(id=config_id)
    if not obj:
        raise HTTPException(404, "Produit du barème introuvable.")
    await obj.delete()
    return {"message": "Produit supprimé du barème."}


# ---------------------------------------------------------------------------
# Import CSV 4D : aperçu puis création
# ---------------------------------------------------------------------------

async def _load_csv_and_compute(file: UploadFile):
    by_name = await load_active_configs()
    if not by_name:
        raise HTTPException(400, "Aucun produit actif dans le barème des commissions. "
                                 "Veuillez d'abord configurer le barème (page Barème commission).")
    content = await file.read()
    return await compute_commission_rows(content, by_name)


@router.post("/bonuses/commission/preview", response_model=CommissionPreviewResponse)
async def preview_commission_bonuses(
    file: UploadFile = File(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur):
        raise HTTPException(403, "Vous n'avez pas le droit de créer des primes commission.")

    if start_date > end_date:
        raise HTTPException(400, "La date de début ne peut pas être après la date de fin.")

    employees, ignored_employees, ignored_columns, matched_products = await _load_csv_and_compute(file)
    return await build_preview(
        employees, ignored_employees, ignored_columns, matched_products, start_date, end_date
    )


@router.post("/bonuses/commission/import", response_model=CommissionImportResult)
async def import_commission_bonuses(
    file: UploadFile = File(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    user: User = Depends(get_current_user),
):
    if not (user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur):
        raise HTTPException(403, "Vous n'avez pas le droit de créer des primes commission.")

    if start_date > end_date:
        raise HTTPException(400, "La date de début ne peut pas être après la date de fin.")

    employees, ignored_employees, ignored_columns, matched_products = await _load_csv_and_compute(file)

    created, skipped = await create_commission_bonuses(employees, start_date, end_date, user)

    if not created and not skipped:
        raise HTTPException(400, "Aucune commission calculée : vérifiez les matricules et les produits du fichier.")

    total_amount = round(sum(c['total'] for c in created), 2)
    return CommissionImportResult(
        created=created,
        skipped=skipped,
        total_amount=total_amount,
        count=len(created),
    )
