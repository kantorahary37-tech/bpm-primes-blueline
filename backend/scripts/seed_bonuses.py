"""
Script pour créer des primes de test (mensuel, astreinte, commission) pour chaque département.
Usage : python -m scripts.seed_bonuses
"""
import sys, random
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import Employee, User, Bonus, Validation, PrimeMax
from datetime import date, datetime

random.seed(42)

MENSUEL_DEPTS = [
    'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
    'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
    'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
]
ASTREINTE_DEPTS = ['BBS', 'DO', 'DSI', 'DT']
COMMISSION_DEPTS = ['Commercial GP', 'Commercial entreprise']

QUANTI_CRITERIA = [
    'Planification du travail', 'Respect des deadlines',
    "Capacité d'analyse", 'Exécution des tâches périodiques',
]
QUALI_CRITERIA = [
    'Qualité du travail', 'Initiative', "Travail d'équipe",
]


def make_mensuel_details(prime_max, total_pct):
    quanti = []
    for c in QUANTI_CRITERIA:
        obj = random.randint(10, 20)
        eval_pct = random.randint(int(obj * 0.5), obj)
        quanti.append({
            "criteria": c, "description": "", "objective": f"{obj}%",
            "evaluation": eval_pct, "value": round(prime_max * eval_pct / 100, 2),
        })
    quali = []
    for c in QUALI_CRITERIA:
        obj = random.randint(10, 20)
        eval_pct = random.randint(int(obj * 0.5), obj)
        quali.append({
            "criteria": c, "description": "", "objective": f"{obj}%",
            "evaluation": eval_pct, "value": round(prime_max * eval_pct / 100, 2),
        })
    total_quanti = sum(q["value"] for q in quanti)
    total_quali = sum(q["value"] for q in quali)
    return {
        "prime_max": prime_max,
        "quantitative": quanti,
        "qualitative": quali,
        "total_quantitative": total_quanti,
        "total_qualitative": total_quali,
        "total_evaluation": total_quanti + total_quali,
    }


def make_astreinte_details():
    n_dispos = random.randint(2, 5)
    dispos = []
    total_dispo = 0
    weekly_max = 70000
    for _ in range(n_dispos):
        n = random.randint(1, 3)
        dispos.append({"employee_id": 0, "employee_name": "", "nombre": n})
        total_dispo += n * weekly_max
    n_intervs = random.randint(1, 4)
    intervs = []
    total_interv = 0
    for _ in range(n_intervs):
        intervs.append({
            "employee_id": 0, "employee_name": "", "date": "",
            "heure": "", "motif": "Intervention technique",
            "ticket": f"TKT-{random.randint(100,999)}",
            "type": "intervention", "demandeur": "", "service": "",
        })
        total_interv += 9000
    exceptionnelle = random.choice([0, 0, 15000, 20000])
    ponctuelle = random.choice([0, 0, 10000, 15000])
    return {
        "weekly_max": weekly_max,
        "intervention_rate": 9000,
        "disponibilites": dispos,
        "interventions": intervs,
        "total_dispo": total_dispo,
        "total_interv": total_interv,
        "total_interv_exceptionnelle": sum(1 for i in intervs if i["type"] == "exceptionnelle") * 9000,
        "total_interv_ponctuelle": sum(1 for i in intervs if i["type"] == "ponctuelle") * 9000,
        "exceptionnelle": exceptionnelle,
        "ponctuelle": ponctuelle,
    }


def make_commission_details():
    n_ventes = random.randint(1, 5)
    rate = random.choice([10000, 12000, 15000])
    sales = []
    total = 0
    for _ in range(n_ventes):
        n = random.randint(1, 3)
        sales.append({"designation": "Vente", "nombre": n, "description": ""})
        total += n * rate
    return {"rate": rate, "sales": sales, "total": total}


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    employees = await Employee.all().prefetch_related('manager')
    users = await User.all()
    dg_user = await User.filter(is_dg=True).first()
    if not dg_user:
        dg_user = users[0] if users else None

    plafonds = await PrimeMax.all()

    dept_plafond = {}
    for p in plafonds:
        key = (p.dept_str, p.bonus_type)
        dept_plafond[key] = float(p.amount)

    today = date.today()
    current_month = today.month
    current_year = today.year

    months = []
    for i in range(3):
        m = current_month - i
        y = current_year
        if m <= 0:
            m += 12
            y -= 1
        months.append((y, m))

    created = 0
    skipped = 0

    for dept in MENSUEL_DEPTS:
        dept_emps = [e for e in employees if e.dept_str == dept]
        if not dept_emps:
            continue

        for y, m in months:
            emp = random.choice(dept_emps)
            start = date(y, m, 1)
            if m == 12:
                end = date(y, 12, 31)
            else:
                end = date(y, m + 1, 1) - __import__('datetime').timedelta(days=1)

            key = (dept, "mensuel")
            pm = dept_plafond.get(key, 150000)
            details = make_mensuel_details(pm, None)
            total_eval = details["total_evaluation"]
            amount = min(total_eval, pm)
            score = round(sum(q["evaluation"] for q in details["quantitative"]) +
                          sum(q["evaluation"] for q in details["qualitative"]), 2)

            exists = await Bonus.filter(
                employee=emp, start_date=start, end_date=end,
                bonus_type="mensuel",
            ).exists()
            if exists:
                skipped += 1
                continue

            await Bonus.create(
                employee=emp,
                start_date=start,
                end_date=end,
                bonus_type="mensuel",
                performance_score=score,
                absences=random.randint(0, 3),
                retard=random.randint(0, 2),
                prime_mensuel_amount=amount,
                total_amount=amount,
                details=details,
                created_by=dg_user,
            )
            created += 1
            print(f"  ✓ Mensuel {emp.name} ({dept}) — {y}-{m:02d} = {amount:.0f} Ar")

    for dept in ASTREINTE_DEPTS:
        dept_emps = [e for e in employees if e.dept_str == dept]
        if not dept_emps:
            continue

        for y, m in months:
            emp = random.choice(dept_emps)
            start = date(y, m, 1)
            if m == 12:
                end = date(y, 12, 31)
            else:
                end = date(y, m + 1, 1) - __import__('datetime').timedelta(days=1)

            details = make_astreinte_details()
            amount = details["total_dispo"] + details["total_interv"] + details["exceptionnelle"] + details["ponctuelle"]

            exists = await Bonus.filter(
                employee=emp, start_date=start, end_date=end,
                bonus_type="astreinte",
            ).exists()
            if exists:
                skipped += 1
                continue

            await Bonus.create(
                employee=emp,
                start_date=start,
                end_date=end,
                bonus_type="astreinte",
                nb_jours_astreinte=details["total_dispo"],
                taux_jour=details["weekly_max"],
                prime_astreinte_amount=details["total_interv"],
                total_amount=amount,
                details=details,
                created_by=dg_user,
            )
            created += 1
            print(f"  ✓ Astreinte {emp.name} ({dept}) — {y}-{m:02d} = {amount:.0f} Ar")

    for dept in COMMISSION_DEPTS:
        dept_emps = [e for e in employees if e.dept_str == dept]
        if not dept_emps:
            continue

        for y, m in months:
            emp = random.choice(dept_emps)
            start = date(y, m, 1)
            if m == 12:
                end = date(y, 12, 31)
            else:
                end = date(y, m + 1, 1) - __import__('datetime').timedelta(days=1)

            details = make_commission_details()
            amount = details["total"]

            exists = await Bonus.filter(
                employee=emp, start_date=start, end_date=end,
                bonus_type="commission",
            ).exists()
            if exists:
                skipped += 1
                continue

            await Bonus.create(
                employee=emp,
                start_date=start,
                end_date=end,
                bonus_type="commission",
                ca_realise=amount,
                ca_objectif=amount * random.uniform(0.8, 1.2),
                taux_commission=details["rate"],
                commission_amount=amount,
                total_amount=amount,
                details=details,
                created_by=dg_user,
            )
            created += 1
            print(f"  ✓ Commission {emp.name} ({dept}) — {y}-{m:02d} = {amount:.0f} Ar")

    await Tortoise.close_connections()
    print(f"\n✅ {created} prime(s) créée(s), {skipped} existante(s) ignorée(s)")


if __name__ == "__main__":
    run_async(seed())
