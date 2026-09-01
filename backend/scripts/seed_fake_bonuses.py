"""
Script pour créer des primes factices de test (mensuel, astreinte, commission),
5 primes par département, réparties sur les différents statuts du workflow.

Utilise Faker pour générer des données réalistes (noms de demandeurs,
motifs, tickets, commentaires...). Utile pour tester les filtres, le tri
et la recherche côté tableau.

Usage (conteneur backend via docker compose) :
    docker compose exec backend python -m scripts.seed_fake_bonuses          # ajoute
    docker compose exec backend python -m scripts.seed_fake_bonuses --clean  # supprime tout + re-seed

Usage (environnement local) :
    pip install faker
    python -m scripts.seed_fake_bonuses
"""
import sys
import random
from datetime import date
from datetime import timedelta

sys.path.append('.')

from faker import Faker
from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import Employee, User, Bonus, PrimeMax, ValidationStatus

random.seed(7)
fake = Faker('fr_FR')
Faker.seed(7)

QUANTI_CRITERIA = [
    'Planification du travail', 'Respect des deadlines',
    "Capacité d'analyse", 'Exécution des tâches périodiques',
]
QUALI_CRITERIA = [
    'Qualité du travail', 'Initiative', "Travail d'équipe",
]

# Types applicables par défaut selon le département (mensuel toujours applicable)
ASTREINTE_DEPTS = {'Direction BBS', 'Direction des Operations',
                   "Direction des Systemes d'Informations", 'Direction Technique'}
COMMISSION_DEPTS = {'Direction Commerciale'}

STATUSES = [
    ValidationStatus.INITIALISE,
    ValidationStatus.EN_ATTENTE_DIRECTEUR,
    ValidationStatus.EN_ATTENTE_DG,
    ValidationStatus.VALIDE,
    ValidationStatus.VALIDE,  # plus de « validées » pour varier
]

ASTREINTE_MOTIFS = [
    'Intervention technique', 'Maintenance préventive', 'Incident réseau',
    'Coupure électrique', 'Dépannage urgent', 'Supervision nocturne',
    'Intervention clientèle', 'Restaurations après incident',
]
SERVICES = ['Réseau', 'Datacenter', 'Helpdesk', 'Transmission', 'Énergie', 'Maintenance BTS']

# Noms de vente réalistes pour les commissions
PRODUITS = [
    'Abonnement Internet Fibre', 'Abonnement VSAT', 'Forfait entreprise',
    'Accès dédié', 'Téléphonie sur IP', 'Location de bande passante',
    'Package Data Pro', 'Contrat maintenance réseau',
]


def make_mensuel_details(prime_max):
    quanti = []
    for c in QUANTI_CRITERIA:
        coeff = random.choice([1, 2])
        note = round(random.uniform(4, 10), 1)
        quanti.append({
            "criteria": c, "description": fake.sentence()[:80] if random.random() < 0.3 else "",
            "coeff": coeff, "note": note,
            "value": round(prime_max * (coeff / 10) * (note / 10), 2),
        })
    quali = []
    for c in QUALI_CRITERIA:
        coeff = random.choice([1, 2])
        note = round(random.uniform(4, 10), 1)
        quali.append({
            "criteria": c, "description": fake.sentence()[:80] if random.random() < 0.3 else "",
            "coeff": coeff, "note": note,
            "value": round(prime_max * (coeff / 10) * (note / 10), 2),
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
    weekly_max = random.choice([50000, 60000, 70000])
    for _ in range(n_dispos):
        n = random.randint(1, 3)
        dispos.append({
            "employee_id": 0, "employee_name": fake.name(), "nombre": n,
            "semaine": f"S{fake.random_int(1, 52)}",
        })
        total_dispo += n * weekly_max
    n_intervs = random.randint(1, 4)
    intervs = []
    total_interv = 0
    for _ in range(n_intervs):
        intervs.append({
            "employee_id": 0, "employee_name": fake.name(),
            "date": fake.date_this_year().isoformat(),
            "heure": fake.time(),
            "motif": random.choice(ASTREINTE_MOTIFS),
            "ticket": f"TKT-{fake.random_int(100, 999)}",
            "type": "intervention",
            "demandeur": fake.name(),
            "service": random.choice(SERVICES),
        })
        total_interv += random.choice([7000, 9000, 12000])
    exceptionnelle = random.choice([0, 0, 15000, 20000])
    ponctuelle = random.choice([0, 0, 10000, 15000])
    return {
        "weekly_max": weekly_max,
        "intervention_rate": 9000,
        "disponibilites": dispos,
        "interventions": intervs,
        "total_dispo": total_dispo,
        "total_interv": total_interv,
        "total_interv_exceptionnelle": 0,
        "total_interv_ponctuelle": 0,
        "exceptionnelle": exceptionnelle,
        "ponctuelle": ponctuelle,
    }


def make_commission_details():
    n_ventes = random.randint(1, 5)
    rate = random.choice([8000, 10000, 12000, 15000])
    sales = []
    total = 0
    for _ in range(n_ventes):
        n = random.randint(1, 3)
        sales.append({
            "designation": random.choice(PRODUITS),
            "nombre": n, "description": fake.sentence()[:60] if random.random() < 0.4 else "",
        })
        total += n * rate
    return {"rate": rate, "sales": sales, "total": total}


def period_for(i):
    """Répartir les 5 primes sur des périodes récentes (mois courants/précédents)."""
    today = date.today()
    offsets = [0, 0, 1, 2, 3]
    months_back = offsets[i % len(offsets)]
    y = today.year
    m = today.month - months_back
    while m <= 0:
        m += 12
        y -= 1
    start = date(y, m, 1)
    if m == 12:
        end = date(y, 12, 31)
    else:
        end = date(y, m + 1, 1) - timedelta(days=1)
    return start, end


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    employees = await Employee.all().prefetch_related('manager')
    users = await User.all()
    dg_user = await User.filter(is_dg=True).first()
    if not dg_user:
        dg_user = users[0] if users else None
    if not dg_user:
        print("❌ Aucun utilisateur trouvé, impossible de créer des primes.")
        await Tortoise.close_connections()
        return

    plafonds = await PrimeMax.all()
    dept_plafond = {}
    for p in plafonds:
        dept_plafond[(p.dept_str, p.bonus_type)] = float(p.amount)

    # Regrouper les employés par département
    by_dept = {}
    for e in employees:
        by_dept.setdefault(e.dept_str, []).append(e)

    created = 0
    for dept in sorted(by_dept.keys()):
        dept_emps = by_dept[dept]
        available_types = ['mensuel']
        if dept in ASTREINTE_DEPTS:
            available_types.append('astreinte')
        if dept in COMMISSION_DEPTS:
            available_types.append('commission')
        if len(available_types) == 1:
            # Si un seul type dispo, on force quand même plusieurs types pour le test
            available_types = ['mensuel', 'astreinte', 'commission']

        print(f"\n=== {dept} ({len(dept_emps)} employés) ===")
        for i in range(5):
            emp = random.choice(dept_emps)
            bonus_type = available_types[i % len(available_types)]
            start, end = period_for(i)
            status = STATUSES[i % len(STATUSES)]
            was_rejected = random.random() < 0.15
            if was_rejected:
                status = ValidationStatus.INITIALISE

            key = (dept, bonus_type)
            pm = dept_plafond.get(key, 150000)

            detail_kwargs = {}
            if bonus_type == 'mensuel':
                details = make_mensuel_details(pm)
                total_eval = details["total_evaluation"]
                amount = min(total_eval, pm)
                detail_kwargs.update({
                    "performance_score": round(sum(q["note"] for q in details["quantitative"]) +
                                               sum(q["note"] for q in details["qualitative"]), 2),
                    "absences": random.randint(0, 8),
                    "retard": random.randint(0, 6),
                    "prime_mensuel_amount": amount,
                })
            elif bonus_type == 'astreinte':
                details = make_astreinte_details()
                amount = details["total_dispo"] + details["total_interv"] + details["exceptionnelle"] + details["ponctuelle"]
                detail_kwargs.update({
                    "nb_jours_astreinte": details["total_dispo"],
                    "taux_jour": details["weekly_max"],
                    "prime_astreinte_amount": details["total_interv"],
                })
            else:  # commission
                details = make_commission_details()
                amount = details["total"]
                detail_kwargs.update({
                    "ca_realise": amount,
                    "ca_objectif": round(amount * random.uniform(0.8, 1.2)),
                    "taux_commission": details["rate"],
                    "commission_amount": amount,
                })

            await Bonus.create(
                employee=emp,
                start_date=start,
                end_date=end,
                bonus_type=bonus_type,
                total_amount=amount,
                details=details,
                status=status,
                was_rejected=was_rejected,
                created_by=dg_user,
                **detail_kwargs,
            )
            created += 1
            rej = " (rejetée)" if was_rejected else ""
            print(f"  ✓ {status.value}{rej} — {bonus_type} {emp.name} ({emp.matricule}) {start}→{end} = {amount:.0f} Ar")

    await Tortoise.close_connections()
    print(f"\n✅ {created} prime(s) factice(s) créée(s)")


async def seed_clean():
    """Supprime toutes les primes existantes (base de dev), puis re-seed."""
    await Tortoise.init(config=TORTOISE_ORM)
    nb = await Bonus.all().count()
    await Bonus.all().delete()
    print(f"🗑  {nb} prime(s) supprimée(s)")
    await Tortoise.close_connections()
    await seed()


if __name__ == "__main__":
    if "--clean" in sys.argv:
        # Par sécurité : supprime toutes les primes factices puis re-seed.
        run_async(seed_clean())
    else:
        run_async(seed())
