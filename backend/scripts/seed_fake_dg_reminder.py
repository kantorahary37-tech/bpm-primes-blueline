"""
Seed de test pour le rappel DG : crée UNE prime factice par type de prime
(les 8 types : mensuel, astreinte, commission, commission_gc,
commission_entreprise, intervention, ponctuelle, exceptionnel), toutes au
statut « En attente DG » avec un historique de validation cohérent
(N1 → DIRECTEUR), puis envoie le rappel DG en mode test.

La configuration USER_MAIL_TEST_MODE est forcée à false : en TEST_MODE,
l'email est redirigé vers TEST_EMAIL (aucun envoi aux adresses réelles).

Les primes créées portent une marque (details.seed = "dg_reminder_test")
pour être supprimées proprement via --clean.

Usage (conteneur backend via docker compose) :
    docker compose exec backend python scripts/seed_fake_dg_reminder.py            # seed + envoi mail test
    docker compose exec backend python scripts/seed_fake_dg_reminder.py --no-send  # seed sans envoi
    docker compose exec backend python scripts/seed_fake_dg_reminder.py --clean    # supprime les primes de test
"""
import sys
import random
from datetime import date, datetime, timedelta

sys.path.append('.')

from faker import Faker
from tortoise import Tortoise, run_async

from app.db_config import TORTOISE_ORM
from app.config import bootstrap_config
from app.models import Bonus, Validation, ValidationStatus, BonusType, User, Employee, SystemConfig
from app.config import CONFIG_DEFINITIONS
from app.prime_reminder_service import prime_reminder_send_manual, prime_reminder_summary

random.seed(11)
fake = Faker('fr_FR')
Faker.seed(11)

SEED_MARKER = "dg_reminder_test"

TYPES = [
    BonusType.MENSUEL,
    BonusType.ASTREINTE,
    BonusType.COMMISSION,
    BonusType.COMMISSION_GC,
    BonusType.COMMISSION_ENTREPRISE,
    BonusType.INTERVENTION,
    BonusType.PONCTUELLE,
    BonusType.EXCEPTIONNEL,
]

# Départements conseillés par type (None = n'importe lequel)
TYPE_DEPTS = {
    BonusType.ASTREINTE: {'Direction BBS', "Direction des Systemes d'Informations",
                          'Direction des Operations', 'Direction Technique'},
    BonusType.COMMISSION: {'Direction Commerciale'},
    BonusType.COMMISSION_GC: {'Direction Commerciale'},
    BonusType.COMMISSION_ENTREPRISE: {'Direction Commerciale', 'Direction Generale'},
}

VALIDATION_NOTES = ['Évaluation conforme', 'OK pour ma part', 'Notes vérifiées', 'Présences contrôlées']
ASTREINTE_MOTIFS = ['Intervention technique', 'Incident réseau', 'Maintenance préventive', 'Coupure électrique']
SERVICES = ['Réseau', 'Datacenter', 'Helpdesk', 'Transmission']
PRODUITS = ['Abonnement Fibre', 'Accès VSAT', 'Forfait entreprise', 'Accès dédié']


def period_current_month():
    today = date.today()
    start = date(today.year, today.month, 1)
    if today.month == 12:
        end = date(today.year, 12, 31)
    else:
        end = date(today.year, today.month + 1, 1) - timedelta(days=1)
    return start, end


def build_details(btype, amount):
    """Détails techniquement plausibles pour chaque type (frappés de la marque de test)."""
    base = {"seed": SEED_MARKER}
    if btype == BonusType.MENSUEL:
        return {
            **base,
            "prime_max": amount,
            "quantitative": [{"criteria": c, "description": "", "coeff": 2, "note": 8.5,
                              "value": round(amount * 0.2, 2)} for c in
                             ('Planification du travail', 'Respect des deadlines')],
            "qualitative": [{"criteria": c, "description": "", "coeff": 1, "note": 8.0,
                             "value": round(amount * 0.4, 2)} for c in
                            ('Qualité du travail', 'Initiative')],
            "total_quantitative": round(amount * 0.4, 2),
            "total_qualitative": round(amount * 0.8, 2),
            "total_evaluation": amount,
        }
    if btype == BonusType.ASTREINTE:
        weekly_max = 70000
        n_intervs = random.randint(1, 3)
        intervs = [{
            "employee_id": None, "employee_name": "Fake Test", "date": fake.date_this_month().isoformat(),
            "heure": fake.time(), "motif": random.choice(ASTREINTE_MOTIFS),
            "ticket": f"TKT-{fake.random_int(100, 999)}", "type": "intervention",
            "demandeur": fake.name(), "service": random.choice(SERVICES),
        } for _ in range(n_intervs)]
        return {
            **base,
            "weekly_max": weekly_max,
            "intervention_rate": 9000,
            "disponibilites": [{"employee_id": None, "employee_name": "Fake Test",
                                "nombre": n, "semaine": f"S{wk}"}
                               for n, wk in [(2, 1), (3, 3)]],
            "interventions": intervs,
            "total_dispo": 5 * weekly_max,
            "total_interv": n_intervs * 9000,
            "total_interv_exceptionnelle": 0,
            "total_interv_ponctuelle": 0,
            "exceptionnelle": 0,
            "ponctuelle": 0,
        }
    if btype in (BonusType.COMMISSION, BonusType.COMMISSION_GC, BonusType.COMMISSION_ENTREPRISE):
        rate = random.choice([8000, 10000, 12000])
        sales = [{"designation": p, "nombre": random.randint(1, 3), "description": ""}
                 for p in random.sample(PRODUITS, k=random.randint(1, 3))]
        return {**base, "rate": rate, "sales": sales, "total": amount}
    if btype == BonusType.INTERVENTION:
        n = random.randint(2, 4)
        return {**base, "intervention_rate": 9000, "total_interv": n * 9000,
                "interventions": [{"date": fake.date_this_month().isoformat(), "heure": fake.time(),
                                   "motif": random.choice(ASTREINTE_MOTIFS), "type": "intervention",
                                   "demandeur": fake.name(), "service": random.choice(SERVICES)}
                                  for _ in range(n)]}
    return {**base, "montant": amount, "motif": random.choice(ASTREINTE_MOTIFS)}


def pick_employee(employees, preferred_dept):
    candidates = [e for e in employees if e.dept_str in (preferred_dept or set())]
    if not candidates:
        candidates = employees
    return random.choice(candidates)


def pick_validator(dept_users, creator, role_filter):
    cands = [u for u in dept_users if role_filter(u) and u.id != creator.id]
    if not cands:
        cands = [u for u in dept_users if role_filter(u)]
    return random.choice(cands) if cands else creator


async def seed():
    employees = await Employee.all()
    users = await User.all()
    dg = next((u for u in users if u.is_dg and not u.is_admin), None)
    if not users or not employees:
        print("❌ Aucun utilisateur / employé en base — seed impossible.")
        await Tortoise.close_connections()
        return

    # Index utilisateurs non-admin par département et par rôle
    dept_users = {}
    n1_by_dept = {}
    director_by_dept = {}
    for u in users:
        if u.is_admin:
            continue
        dept = u.dept_str or ''
        dept_users.setdefault(dept, []).append(u)
        if u.is_validator_n1:
            n1_by_dept.setdefault(dept, []).append(u)
        if u.is_directeur:
            director_by_dept.setdefault(dept, []).append(u)

    start, end = period_current_month()
    created = 0
    for btype in TYPES:
        emp = pick_employee(employees, TYPE_DEPTS.get(btype))
        dept = emp.dept_str or ''
        dept_user_pool = dept_users.get(dept) or [u for u in users if not u.is_admin]

        creator = None
        if emp.manager_id:
            creator = next((u for u in users if u.id == emp.manager_id and not u.is_admin), None)
        if not creator:
            creator = (n1_by_dept.get(dept) or dept_user_pool or [dg] or [u for u in users if not u.is_admin])[0]

        # Montant cohérent selon le type
        amount = random.choice([120000, 180000, 250000])
        detail_kwargs = {}
        if btype == BonusType.MENSUEL:
            detail_kwargs.update({"performance_score": 16.5, "absences": random.randint(0, 4),
                                  "retard": random.randint(0, 3), "prime_mensuel_amount": amount})
        elif btype == BonusType.ASTREINTE:
            detail_kwargs.update({"nb_jours_astreinte": 5, "taux_jour": 70000, "prime_astreinte_amount": 45000})
        elif btype in (BonusType.COMMISSION, BonusType.COMMISSION_GC, BonusType.COMMISSION_ENTREPRISE):
            detail_kwargs.update({"ca_realise": amount, "ca_objectif": round(amount * 1.1),
                                  "taux_commission": random.choice([8000, 10000, 12000]),
                                  "commission_amount": amount})
        elif btype == BonusType.INTERVENTION:
            amount = 9000 * random.randint(2, 4)
        else:
            amount = random.choice([50000, 80000])

        bonus = await Bonus.create(
            employee=emp,
            start_date=start,
            end_date=end,
            bonus_type=btype,
            total_amount=amount,
            details=build_details(btype, amount),
            status=ValidationStatus.EN_ATTENTE_DG,
            created_by=creator,
            **detail_kwargs,
        )

        # Historique cohérent : N1 puis DIRECTEUR (deux étapes avant le DG)
        n1 = pick_validator(n1_by_dept.get(dept) or dept_user_pool, creator, lambda u: u.is_validator_n1)
        director = pick_validator(director_by_dept.get(dept) or dept_user_pool, creator, lambda u: u.is_directeur)
        now = datetime.now().astimezone()
        await Validation.create(bonus=bonus, validator=n1, step='N1', action='VALIDER',
                                note=random.choice(VALIDATION_NOTES))
        await Validation.create(bonus=bonus, validator=director, step='DIRECTEUR', action='VALIDER',
                                note=random.choice(VALIDATION_NOTES))
        await Validation.filter(bonus=bonus).update(validated_at=now - timedelta(minutes=35))
        second = await Validation.filter(bonus=bonus).order_by('id').last()
        await Validation.filter(id=second.id).update(validated_at=now)

        created += 1
        print(f"  ✓ {btype.value:<20} {emp.name:<36} ({dept}) — {amount:.0f} Ar")

    print(f"\n✅ {created} prime(s) factice(s) créée(s) au statut « En attente DG »")


async def clean():
    await Tortoise.init(config=TORTOISE_ORM)
    rows = await Bonus.all()
    targets = [b for b in rows if (b.details or {}).get("seed") == SEED_MARKER]
    ids = [b.id for b in targets]
    if not ids:
        print("ℹ️  Aucune prime de test à supprimer.")
    else:
        await Validation.filter(bonus_id__in=ids).delete()
        await Bonus.filter(id__in=ids).delete()
        print(f"🧹 {len(ids)} prime(s) de test supprimée(s)")
    await Tortoise.close_connections()


async def force_config(key, value):
    """Force une config en cache ET en base (SystemConfig)."""
    from app.config import set_config
    meta = CONFIG_DEFINITIONS[key]
    set_config(key, value)
    row = await SystemConfig.get_or_none(key=key)
    if row:
        row.value = value
        await row.save()
    else:
        await SystemConfig.create(key=key, value=value, category=meta["category"],
                                  description=meta["description"])


async def send_test():
    # En TEST_MODE, sans USER_MAIL_TEST_MODE : redirection vers TEST_EMAIL.
    await force_config("TEST_MODE", "true")
    await force_config("USER_MAIL_TEST_MODE", "false")
    sections, total = await prime_reminder_summary()
    print(f"\n📋 Résumé du rappel : {total} prime(s) en attente DG sur "
          f"{len(sections)} groupe(s) :")
    for s in sections:
        print(f"   - {s['department']} / {s['bonus_type_label']} : {s['count']}")
    print("\n📤 Envoi du rappel DG (mode test → TEST_EMAIL)…")
    result = await prime_reminder_send_manual(None)
    print(f"→ {result['message']} ({result['status']})")


async def main():
    if "--clean" in sys.argv:
        await clean()
        return
    await Tortoise.init(config=TORTOISE_ORM)
    await bootstrap_config()
    await seed()
    if "--no-send" not in sys.argv:
        await send_test()
    await Tortoise.close_connections()


if __name__ == "__main__":
    run_async(main())