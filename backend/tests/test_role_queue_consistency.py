"""
Cohérence de la « file » d'un rôle entre la liste des primes et les rappels.

Un utilisateur ne doit jamais voir ni recevoir une prime qui n'est pas dans SA
file de validation : c'est le bug qui faisait afficher « 8 primes en attente »
sur le dashboard (et dans le rappel quotidien) d'un Directeur alors que sa
liste était vide, parce que les primes étaient déjà passées à l'étape DG.

Ces tests verrouillent ``permissions.actionable_statuses`` comme source de
vérité unique des deux côtés.
"""
import itertools
from datetime import date

from app.models import User, Department, Employee, Bonus, BonusType, ValidationStatus
from app.permissions import actionable_statuses
import app.scheduler as scheduler_module

_matricules = itertools.count(1)


async def make_user(email, **kwargs):
    return await User.create(email=email, name=email.split("@")[0], **kwargs)


async def make_bonus(manager, dept_str, status):
    dept, _ = await Department.get_or_create(name=dept_str)
    emp = await Employee.create(
        matricule=f"M{next(_matricules)}",
        name="Employe",
        dept_str=dept_str,
        dept=dept,
        manager=manager,
    )
    return await Bonus.create(
        employee=emp,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        bonus_type=BonusType.ASTREINTE,
        total_amount=1000,
        status=status,
        created_by=manager,
    )


# ── Règle : file de chaque rôle ────────────────────────────────────────────

async def test_directeur_queue_is_only_en_attente_directeur(db):
    directeur = await make_user("dir@test.mg", is_directeur=True, dept_str="DO")
    assert actionable_statuses(directeur) == [ValidationStatus.EN_ATTENTE_DIRECTEUR]


async def test_role_queues_match_backend_expectations(db):
    admin = await make_user("admin@test.mg", is_admin=True)
    dg = await make_user("dg@test.mg", is_dg=True)
    drh = await make_user("drh@test.mg", is_drh=True)
    n2 = await make_user("n2@test.mg", is_validator_n2=True)
    n1 = await make_user("n1@test.mg", is_validator_n1=True)
    aucun = await make_user("plain@test.mg")

    assert actionable_statuses(admin) == list(ValidationStatus)
    assert actionable_statuses(dg) == [ValidationStatus.EN_ATTENTE_DG]
    assert actionable_statuses(drh) == [ValidationStatus.EN_ATTENTE_DRH, ValidationStatus.VALIDE]
    assert actionable_statuses(n2) == [ValidationStatus.INITIALISE, ValidationStatus.EN_ATTENTE_N2]
    assert actionable_statuses(n1) == [ValidationStatus.INITIALISE]
    assert actionable_statuses(aucun) == []


# ── Rappel quotidien : ne reminder que SA file ──────────────────────────────

async def test_daily_reminder_skips_primes_already_past_director(db):
    """Un Directeur ne doit PAS être rappelé pour une prime déjà au statut DG."""
    manager = await make_user("n1@test.mg", is_validator_n1=True, dept_str="DO")
    directeur = await make_user("dir@test.mg", is_directeur=True, dept_str="DO")

    await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DIRECTEUR)
    for _ in range(8):
        await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DG)

    actors = await scheduler_module.collect_pending_by_actor()
    assert directeur.id in actors
    # Les 8 primes en attente DG ne doivent surtout pas gonfler son rappel.
    items = actors[directeur.id]["items"]
    assert len(items) == 1
    assert all(i["status_label"] == "Validation Directeur" for i in items)


async def test_daily_reminder_multi_role_account_only_gets_own_queue(db):
    """
    Compte cumulant Directeur + DRH : sa file est celle du rôle le plus large
    (``actionable_statuses`` teste ``is_drh`` avant ``is_directeur``), donc le
    rappel doit contenir la file DRH et rien d'autre — jamais les primes
    « En attente Directeur », qui ne sont pas dans sa file.
    """
    manager = await make_user("n1b@test.mg", is_validator_n1=True, dept_str="DO")
    both = await make_user("dir_drh@test.mg", is_directeur=True, is_drh=True, dept_str="DO")

    assert actionable_statuses(both) == [ValidationStatus.EN_ATTENTE_DRH, ValidationStatus.VALIDE]

    await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DIRECTEUR)  # hors file
    await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DRH)        # sa file
    await make_bonus(manager, "DO", ValidationStatus.VALIDE)                # sa file

    actors = await scheduler_module.collect_pending_by_actor()
    labels = {i["status_label"] for i in actors[both.id]["items"]}
    assert labels == {"Validation DRH", "Traitement DRH"}, labels


# ── Rappel date limite : même garde-fou ────────────────────────────────────

async def test_deadline_reminder_skips_status_outside_recipient_queue(db):
    """Un Directeur n'est pas rappelé « Validation N+1 » pour l'étape du DG."""
    manager = await make_user("n1c@test.mg", is_validator_n1=True, dept_str="DO")
    directeur = await make_user("dir2@test.mg", is_directeur=True, dept_str="DO")

    await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DG)       # pas sa file
    await make_bonus(manager, "DO", ValidationStatus.EN_ATTENTE_DIRECTEUR)  # sa file

    actors = await scheduler_module.collect_deadline_pending_by_actor()
    items = actors[directeur.id]["items"]
    assert [i["status_label"] for i in items] == ["Validation Directeur"]