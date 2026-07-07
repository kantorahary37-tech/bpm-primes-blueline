# Imports FastAPI pour les routes et les erreurs
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from app.models import User, Employee, Bonus, Validation, PrimeMax
from app.auth import get_current_user
from app.schemas import *
from fastapi import HTTPException
import io
import csv
from datetime import datetime
from tortoise.expressions import Q
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, numbers
from openpyxl.utils import get_column_letter

# Création du routeur API
router = APIRouter(dependencies=[Depends(get_current_user)])


# Route POST pour créer une prime
@router.post("/bonuses/", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, user: User = Depends(get_current_user)):
    employee = await Employee.get(id=bonus.employee_id)

    if bonus.bonus_type != BonusType.ASTREINTE:
        primemax = await PrimeMax.filter(
            dept_str=employee.dept_str,
            bonus_type=bonus.bonus_type
        ).first()
        if primemax and bonus.total_amount > primemax.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Le montant ({bonus.total_amount} Ar) dépasse le plafond "
                       f"autorisé ({primemax.amount} Ar) pour "
                       f"'{bonus.bonus_type.value}' dans le département '{employee.dept_str}'."
            )

    existing = await Bonus.filter(
        employee_id=bonus.employee_id,
        bonus_type=bonus.bonus_type,
        start_date__lte=bonus.end_date,
        end_date__gte=bonus.start_date,
    ).exists()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Une prime de type '{bonus.bonus_type.value}' existe déjà sur cette période pour cet employé."
        )
    initial_status = ValidationStatus.EN_ATTENTE_DIRECTEUR if user.is_directeur else ValidationStatus.INITIALISE
    obj = await Bonus.create(**bonus.dict(), created_by_id=user.id, status=initial_status)
    return await Bonus.get(id=obj.id).prefetch_related('employee')

# Route POST pour validation par lot
@router.post("/bonuses/batch/validate", response_model=BatchValidateResponse)
async def batch_validate_bonuses(
    request: BatchValidateRequest,
    user: User = Depends(get_current_user)
):
    results = []
    for bonus_id in request.bonus_ids:
        try:
            bonus = await Bonus.get_or_none(id=bonus_id)
            if not bonus:
                results.append(BatchValidateResult(bonus_id=bonus_id, success=False, error="Prime introuvable"))
                continue

            if bonus.status == ValidationStatus.VALIDE:
                results.append(BatchValidateResult(bonus_id=bonus_id, success=False, error="Déjà validée"))
                continue

            expected_status = {
                "N1": ValidationStatus.INITIALISE,
                "DIRECTEUR": ValidationStatus.EN_ATTENTE_DIRECTEUR,
                "DG": ValidationStatus.EN_ATTENTE_DG,
            }.get(request.step)

            if not expected_status:
                results.append(BatchValidateResult(bonus_id=bonus_id, success=False, error="Étape invalide"))
                continue

            if bonus.status != expected_status:
                results.append(BatchValidateResult(
                    bonus_id=bonus_id, success=False,
                    error=f"Statut actuel '{bonus.status}', attendait '{expected_status}'"
                ))
                continue

            await Validation.create(
                bonus_id=bonus.id,
                validator_id=user.id,
                step=request.step,
                action=request.action,
                note=request.note,
                motif_rejet=request.motif_rejet,
            )

            if request.action == "VALIDER":
                bonus.status = {
                    "N1": ValidationStatus.EN_ATTENTE_DIRECTEUR,
                    "DIRECTEUR": ValidationStatus.EN_ATTENTE_DG,
                    "DG": ValidationStatus.VALIDE
                }[request.step]

                if bonus.status == ValidationStatus.VALIDE:
                    await Validation.create(
                        bonus_id=bonus.id,
                        validator_id=user.id,
                        step="CLOSED",
                        action="AUTOMATIC",
                        note="Prime validée par DG - Clôture automatique"
                    )
            elif request.action == "REJETER":
                bonus.status = ValidationStatus.INITIALISE
                bonus.was_rejected = True

            await bonus.save()
            results.append(BatchValidateResult(bonus_id=bonus_id, success=True))

        except Exception as e:
            results.append(BatchValidateResult(bonus_id=bonus_id, success=False, error=str(e)))

    total_success = sum(1 for r in results if r.success)
    total_errors = len(results) - total_success
    return BatchValidateResponse(results=results, total_success=total_success, total_errors=total_errors)

# Route PUT pour modifier une prime (seulement si statut = Initialisé)
@router.put("/bonuses/{bonus_id}", response_model=BonusResponse)
async def update_bonus(bonus_id: int, data: BonusCreate, user: User = Depends(get_current_user)):
    bonus = await Bonus.get_or_none(id=bonus_id).prefetch_related('employee')
    if not bonus: raise HTTPException(404, "Bonus not found")
    if bonus.status not in (ValidationStatus.INITIALISE, ValidationStatus.EN_ATTENTE_DIRECTEUR):
        raise HTTPException(400, "Impossible de modifier une prime dont le statut n'est pas 'Initialisé' ou 'En attente Directeur'")

    update_data = data.dict(exclude_unset=True)
    if 'total_amount' in update_data and data.bonus_type != BonusType.ASTREINTE:
        employee = await Employee.get(id=bonus.employee_id)
        primemax = await PrimeMax.filter(dept_str=employee.dept_str, bonus_type=bonus.bonus_type).first()
        if primemax and update_data['total_amount'] > primemax.amount:
            raise HTTPException(400, f"Le montant dépasse le plafond autorisé ({primemax.amount} Ar)")
    if 'employee_id' in update_data:
        del update_data['employee_id']

    update_data['was_rejected'] = False
    await bonus.update_from_dict(update_data)
    await bonus.save()
    return await Bonus.get(id=bonus.id).prefetch_related('employee')

# Route GET pour lister les primes (filtres optionnels)
@router.get("/bonuses/", response_model=List[BonusResponse])
async def list_bonuses(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    bonus_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    was_rejected: Optional[bool] = None,
    show_paid: Optional[bool] = False,
    user: User = Depends(get_current_user),
):
    query = Bonus.all().prefetch_related('employee')
    if not (user.is_dg or user.is_drh) and user.department:
        query = query.filter(employee__dept_str=user.department)
    if show_paid:
        query = query.filter(paid_at__isnull=False)
    else:
        query = query.filter(paid_at__isnull=True)
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    if bonus_type: query = query.filter(bonus_type=bonus_type)
    if start_date: query = query.filter(start_date__gte=start_date)
    if end_date: query = query.filter(end_date__lte=end_date)
    if was_rejected is not None: query = query.filter(was_rejected=was_rejected)
    return await query


@router.get("/bonuses/export")
async def export_bonuses(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    bonus_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    columns: Optional[str] = None,
    was_rejected: Optional[bool] = None,
    show_paid: Optional[bool] = False,
):
    query = Bonus.all().prefetch_related('employee', 'created_by')
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    if bonus_type: query = query.filter(bonus_type=bonus_type)
    if start_date and end_date:
        query = query.filter(start_date__lte=end_date, end_date__gte=start_date)
    elif start_date:
        query = query.filter(start_date__gte=start_date)
    elif end_date:
        query = query.filter(end_date__lte=end_date)
    if department: query = query.filter(employee__dept_str=department)
    if was_rejected is not None: query = query.filter(was_rejected=was_rejected)
    if search:
        query = query.filter(
            Q(employee__name__icontains=search) | Q(employee__matricule__icontains=search)
        )
    if show_paid:
        query = query.filter(paid_at__isnull=False)

    bonuses = await query.order_by('-start_date')

    all_columns = [
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "Montant", "Statut",
        "DejaRejete", "MarqueePayeeLe", "CreePar", "DateCreation"
    ]
    if columns:
        selected = [c.strip() for c in columns.split(',') if c.strip() in all_columns]
    else:
        selected = all_columns[:]

    extractors = {
        "Matricule": lambda b: b.employee.matricule,
        "Nom": lambda b: b.employee.name,
        "Departement": lambda b: b.employee.department if b.employee.department else '',
        "TypePrime": lambda b: b.bonus_type.value,
        "DateDebut": lambda b: b.start_date.isoformat(),
        "DateFin": lambda b: b.end_date.isoformat(),
        "Montant": lambda b: str(int(b.total_amount)),
        "Statut": lambda b: b.status.value,
        "DejaRejete": lambda b: "Oui" if b.was_rejected else "Non",
        "MarqueePayeeLe": lambda b: b.paid_at.strftime('%d/%m/%Y %H:%M') if b.paid_at else '',
        "CreePar": lambda b: b.created_by.name if b.created_by else '',
        "DateCreation": lambda b: b.created_at.isoformat() if b.created_at else '',
    }

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(selected)
    for b in bonuses:
        writer.writerow([extractors[col](b) for col in selected])

    output.seek(0)
    return StreamingResponse(
        iter(['\ufeff' + output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=export_primes_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/bonuses/export/xlsx")
async def export_bonuses_xlsx(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    bonus_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    columns: Optional[str] = None,
    was_rejected: Optional[bool] = None,
):
    query = Bonus.all().prefetch_related('employee', 'created_by')
    if status: query = query.filter(status=status)
    if employee_id: query = query.filter(employee_id=employee_id)
    if bonus_type: query = query.filter(bonus_type=bonus_type)
    if start_date and end_date:
        query = query.filter(start_date__lte=end_date, end_date__gte=start_date)
    elif start_date:
        query = query.filter(start_date__gte=start_date)
    elif end_date:
        query = query.filter(end_date__lte=end_date)
    if department: query = query.filter(employee__dept_str=department)
    if was_rejected is not None: query = query.filter(was_rejected=was_rejected)
    if search:
        query = query.filter(
            Q(employee__name__icontains=search) | Q(employee__matricule__icontains=search)
        )

    bonuses = await query.order_by('-start_date')

    all_columns = [
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "Montant", "Statut",
        "DejaRejete", "MarqueePayeeLe", "CreePar", "DateCreation"
    ]
    if columns:
        selected = [c.strip() for c in columns.split(',') if c.strip() in all_columns]
    else:
        selected = all_columns[:]

    extractors = {
        "Matricule": lambda b: b.employee.matricule,
        "Nom": lambda b: b.employee.name,
        "Departement": lambda b: b.employee.department,
        "TypePrime": lambda b: b.bonus_type.value,
        "DateDebut": lambda b: b.start_date.isoformat(),
        "DateFin": lambda b: b.end_date.isoformat(),
        "Montant": lambda b: b.total_amount,
        "Statut": lambda b: b.status.value,
        "DejaRejete": lambda b: "Oui" if b.was_rejected else "Non",
        "MarqueePayeeLe": lambda b: b.paid_at.strftime('%d/%m/%Y %H:%M') if b.paid_at else '',
        "CreePar": lambda b: b.created_by.name if b.created_by else '',
        "DateCreation": lambda b: b.created_at.isoformat() if b.created_at else '',
    }

    wb = Workbook()
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    number_font = Font(size=11)
    alt_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    dept_groups = {}
    for b in bonuses:
        dept = b.employee.department if b.employee.department else 'N/A'
        if dept not in dept_groups:
            dept_groups[dept] = []
        dept_groups[dept].append(b)

    def write_sheet(ws, title, data):
        ws.title = title
        for col_idx, col_name in enumerate(selected, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center')
        for row_idx, b in enumerate(data, 2):
            for col_idx, col_name in enumerate(selected, 1):
                val = extractors[col_name](b)
                cell = ws.cell(row=row_idx, column=col_idx, value=val)
                cell.font = number_font
                if col_name == "Montant" and isinstance(val, (int, float)):
                    cell.number_format = '#,##0'
                if row_idx % 2 == 0:
                    cell.fill = alt_fill
        for col_idx in range(1, len(selected) + 1):
            max_len = len(str(ws.cell(row=1, column=col_idx).value or ''))
            for row_idx in range(2, min(len(data) + 2, 50)):
                cell_val = ws.cell(row=row_idx, column=col_idx).value
                if cell_val:
                    max_len = max(max_len, len(str(cell_val)))
            ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 3, 35)

    ws_all = wb.active
    write_sheet(ws_all, "Toutes", bonuses)

    for dept in sorted(dept_groups.keys()):
        ws = wb.create_sheet()
        write_sheet(ws, dept[:31], dept_groups[dept])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=export_primes_{datetime.now().strftime('%Y%m%d')}.xlsx"
        }
    )


@router.get("/bonuses/export/sage")
async def export_sage():
    bonuses = await Bonus.filter(status=ValidationStatus.VALIDE).prefetch_related('employee')

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow([
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "Montant", "Statut"
    ])
    for b in bonuses:
        writer.writerow([
            b.employee.matricule,
            b.employee.name,
            b.employee.department,
            b.bonus_type.value,
            b.start_date.isoformat(),
            b.end_date.isoformat(),
            str(int(b.total_amount)),
            b.status.value
        ])

    output.seek(0)
    return StreamingResponse(
        iter(['\ufeff' + output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export_sage_paie.csv"}
    )


# Route GET pour l'export d'une prime spécifique
@router.get("/bonuses/{bonus_id}/export")
async def export_bonus_detail(bonus_id: int, columns: Optional[str] = None):
    bonus = await Bonus.get_or_none(id=bonus_id).prefetch_related('employee', 'created_by')
    if not bonus:
        raise HTTPException(404, "Bonus not found")

    common = [
        "Matricule", "Nom", "Departement", "TypePrime",
        "DateDebut", "DateFin", "MontantTotal", "Statut",
        "DejaRejete", "CreePar", "DateCreation"
    ]
    type_cols = {
        'mensuel': ["Score", "Quantitatif", "Qualitatif"],
        'astreinte': ["NbDisponibilite", "TotalDisponibilite", "TotalInterventions", "Exceptionnelle", "Ponctuelle"],
        'commission': ["NbVentes"],
    }
    all_possible = common + type_cols.get(bonus.bonus_type.value, [])

    if columns:
        selected = [c.strip() for c in columns.split(',') if c.strip() in all_possible]
    else:
        selected = all_possible[:]

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(selected)

    extractors = {
        "Matricule": lambda b: b.employee.matricule,
        "Nom": lambda b: b.employee.name,
        "Departement": lambda b: b.employee.department,
        "TypePrime": lambda b: b.bonus_type.value,
        "DateDebut": lambda b: b.start_date.isoformat(),
        "DateFin": lambda b: b.end_date.isoformat(),
        "Montant": lambda b: str(int(b.total_amount)),
        "Statut": lambda b: b.status.value,
        "DejaRejete": lambda b: "Oui" if b.was_rejected else "Non",
        "CreePar": lambda b: b.created_by.name if b.created_by else '',
        "DateCreation": lambda b: b.created_at.isoformat() if b.created_at else '',
        "Score": lambda b: str(b.performance_score or ''),
        "Quantitatif": lambda b: str(sum(i.get('evaluation', 0) for i in (b.details or {}).get('quantitative', []))),
        "Qualitatif": lambda b: str(sum(i.get('evaluation', 0) for i in (b.details or {}).get('qualitative', []))),
        "NbDisponibilite": lambda b: str(sum(int(d.get('nombre', 0)) for d in (b.details or {}).get('disponibilites', []))),
        "PrimeMaxSemaine": lambda b: str((b.details or {}).get('weekly_max', '')),
        "TauxIntervention": lambda b: str((b.details or {}).get('intervention_rate', '')),
        "TotalDisponibilite": lambda b: str((b.details or {}).get('total_dispo', '')),
        "TotalInterventions": lambda b: str((b.details or {}).get('total_interv', '')),
        "Exceptionnelle": lambda b: str((b.details or {}).get('exceptionnelle', '')),
        "Ponctuelle": lambda b: str((b.details or {}).get('ponctuelle', '')),
        "NbVentes": lambda b: str(sum(int(s.get('nombre', 0)) for s in (b.details or {}).get('sales', []))),
    }

    row = [extractors[col](bonus) for col in selected]
    writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter(['\ufeff' + output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=prime_{bonus.id}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


# Route GET pour une prime spécifique
@router.get("/bonuses/{bonus_id}", response_model=BonusResponse)
async def get_bonus(bonus_id: int):
    bonus = await Bonus.get_or_none(id=bonus_id).prefetch_related('employee')
    if not bonus: raise HTTPException(404, "Bonus not found")
    return bonus

# Route GET pour l'historique des validations d'une prime
@router.get("/bonuses/{bonus_id}/validations", response_model=List[ValidationResponse])
async def get_bonus_validations(bonus_id: int):
    bonus = await Bonus.get_or_none(id=bonus_id)
    if not bonus: raise HTTPException(404, "Bonus not found")
    validations = await Validation.filter(bonus_id=bonus_id).prefetch_related('validator')
    result = []
    for v in validations:
        result.append({
            "id": v.id,
            "bonus_id": v.bonus_id,
            "validator_id": v.validator_id,
            "validator_name": v.validator.name if v.validator else None,
            "step": v.step,
            "action": v.action,
            "note": v.note,
            "motif_rejet": v.motif_rejet,
            "validated_at": v.validated_at,
        })
    return result

# Route POST pour valider une prime
@router.post("/bonuses/{bonus_id}/validate")
async def validate_bonus(
    bonus_id: int,
    validation: ValidationCreate,
    step: str,
    user: User = Depends(get_current_user)
):
    # Récupération de la prime ou erreur 404
    bonus = await Bonus.get_or_none(id=bonus_id)
    if not bonus: raise HTTPException(404, "Bonus not found")
    
    # Vérification : si déjà validé, ON BLOQUE
    if bonus.status == ValidationStatus.VALIDE:
        raise HTTPException(status_code=400, detail="Bonus déjà validé - aucune action possible")
    
    # Validation du workflow : chaque étape n'est possible que si le statut actuel correspond
    expected_status = {
        "N1": ValidationStatus.INITIALISE,
        "DIRECTEUR": ValidationStatus.EN_ATTENTE_DIRECTEUR,
        "DG": ValidationStatus.EN_ATTENTE_DG,
    }.get(step)
    
    if not expected_status:
        raise HTTPException(400, "Étape de validation invalide")
    
    if bonus.status != expected_status:
        raise HTTPException(
            400,
            f"Action impossible : la prime est au statut '{bonus.status}', "
            f"attendait '{expected_status}' pour l'étape {step}."
        )
    
    # Création de l'enregistrement de validation (validator_id depuis le JWT)
    await Validation.create(
        bonus_id=bonus.id,
        validator_id=user.id,
        step=step,
        action=validation.action,
        note=validation.note,
        motif_rejet=validation.motif_rejet,
    )
    
    # Mise à jour du statut selon l'étape et l'action
    if validation.action == "VALIDER":
        bonus.status = {
            "N1": ValidationStatus.EN_ATTENTE_DIRECTEUR,
            "DIRECTEUR": ValidationStatus.EN_ATTENTE_DG,
            "DG": ValidationStatus.VALIDE
        }[step]
        
        # Clôture automatique si DG valide
        if bonus.status == ValidationStatus.VALIDE:
            await Validation.create(
                bonus_id=bonus.id,
                validator_id=user.id,
                step="CLOSED",
                action="AUTOMATIC",
                note="Prime validée par DG - Clôture automatique"
            )
    elif validation.action == "REJETER":
        bonus.status = ValidationStatus.INITIALISE
        bonus.was_rejected = True
    
    # Sauvegarde de la prime
    await bonus.save()
    return {"message": "OK", "status": bonus.status}


# Route POST pour marquer des primes comme payées
@router.post("/bonuses/mark-paid")
async def mark_bonuses_paid(req: MarkPaidRequest, user: User = Depends(get_current_user)):
    if not user.is_drh and not user.is_dg:
        raise HTTPException(403, "Seul le DRH peut marquer les primes comme payées")

    query = Bonus.filter(status=ValidationStatus.VALIDE, paid_at__isnull=True)

    if req.bonus_ids:
        query = query.filter(id__in=req.bonus_ids)
    elif req.month and req.year:
        query = query.filter(
            start_date__year=int(req.year),
            start_date__month=int(req.month),
        )
    else:
        raise HTTPException(400, "Fournir bonus_ids ou month+year")

    bonuses = await query
    if not bonuses:
        raise HTTPException(404, "Aucune prime validée trouvée à marquer comme payée")

    now = datetime.utcnow()
    for bonus in bonuses:
        bonus.paid_at = now
        await bonus.save()

    return {"message": f"{len(bonuses)} prime(s) marquée(s) comme payée(s)", "count": len(bonuses)}
