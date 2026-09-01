"""
Script pour créer des primes factices de test (mensuel, astreinte, commission),
5 primes par département, réparties sur les différents statuts du workflow.

Le script reproduit le bon déroulement métier :
- Le créateur (created_by) est un utilisateur du même département que l'employé
  (le manager/N+1, sinon un validateur N1 ou un directeur du département) —
  jamais l'administrateur.
- L'historique de validation (Validation) est cohérent avec le statut :
  INITIALISE → aucune, EN_ATTENTE_DIRECTEUR → N1, EN_ATTENTE_DG → N1+DIRECTEUR,
  PRIME VALIDEE → N1+DIRECTEUR+DG. Une prime rejetée porte un historique partiel
  + une validation REJETER avec motif, status ramené à INITIALISE + was_rejected.
- Les détails d'astreinte référencent le vrai employé et des semaines du mois
  (X/5).

Utilise Faker pour générer des données réalistes (motifs, tickets, commentaires).

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
from datetime import datetime
from datetime import timedelta

sys.path.append('.')

from faker import Faker
from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import Employee, User, Bonus, PrimeMax, Validation, ValidationStatus

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

# (statut attendu, nombre d'étapes de validation déjà effectuées)
STATUS_SCENARIOS = [
    (ValidationStatus.INITIALISE, 0),
    (ValidationStatus.EN_ATTENTE_DIRECTEUR, 1),
    (ValidationStatus.EN_ATTENTE_DG, 2),
    (ValidationStatus.VALIDE, 3),
    (ValidationStatus.VALIDE, 3),  # plus de « validées » pour varier
]
VALIDATION_STEPS = ['N1', 'DIRECTEUR', 'DG']

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

VALIDATION_NOTES = [
    'Évaluation conforme', 'OK pour ma part', 'Notes vérifiées',
    'Présences contrôlées', 'Aucune anomalie détectée',
]
REJET_MOTIFS = [
    'Informations incomplètes', 'Montant hors plafond',
    'Justificatifs manquants', 'Note d\'évaluation insuffisante',
    'Erreur dans la période concernée', 'Absences trop nombreuses',
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


def make_astreinte_details(emp, start):
    """Détails d'astreinte : l'employé concerné + semaines du mois (1..5)."""
    n_dispos = random.randint(2, 5)
    weeks = random.sample(range(1, 6), n_dispos)
    dispos = []
    total_dispo = 0
    weekly_max = random.choice([50000, 60000, 70000])
    for wk in weeks:
        n = random.randint(1, 3)
        dispos.append({
            "employee_id": emp.id, "employee_name": emp.name,
            "nombre": n, "semaine": f"S{wk}",
        })
        total_dispo += n * weekly_max
    n_intervs = random.randint(1, 4)
    intervs = []
    total_interv = 0
    for _ in range(n_intervs):
        intervs.append({
            "employee_id": emp.id, "employee_name": emp.name,
            "date": fake.date_between_dates(date_start=start, date_end=date.today()).isoformat(),
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

    user_by_id = {u.id: u for u in users}

    # Index des utilisateurs par département et par rôle (hors admin)
    n1_by_dept = {}
    director_by_dept = {}
    dept_users = {}
    for u in users:
        if u.is_admin:
            continue
        dept = u.dept_str or ''
        dept_users.setdefault(dept, []).append(u)
        if u.is_validator_n1:
            n1_by_dept.setdefault(dept, []).append(u)
        if u.is_directeur:
            director_by_dept.setdefault(dept, []).append(u)

    dg = next((u for u in users if u.is_dg and not u.is_admin), None)
    fallback_creator = next((u for u in users if not u.is_admin and u.dept_str), None) or dg
    if not fallback_creator:
        print("❌ Aucun utilisateur disponible pour créer des primes.")
        await Tortoise.close_connections()
        return

    def pick_creator(emp):
        """Créateur = un utilisateur du même département (manager/N+1 → N1 → directeur)."""
        cands = []
        if emp.manager_id and emp.manager_id in user_by_id and not user_by_id[emp.manager_id].is_admin:
            cands.append(user_by_id[emp.manager_id])
        cands += n1_by_dept.get(emp.dept_str, [])
        cands += director_by_dept.get(emp.dept_str, [])
        cands += dept_users.get(emp.dept_str, [])
        seen, uniq = set(), []
        for u in cands:
            if u.id not in seen and u.id != emp.id:
                seen.add(u.id)
                uniq.append(u)
        return random.choice(uniq) if uniq else fallback_creator

    def pick_validator(step, emp, creator):
        """Validateur de l'étape, distinct du créateur quand c'est possible."""
        if step == 'N1':
            cands = []
            if emp.manager_id and emp.manager_id in user_by_id \
                    and not user_by_id[emp.manager_id].is_admin \
                    and user_by_id[emp.manager_id].id != creator.id:
                cands.append(user_by_id[emp.manager_id])
            cands += [u for u in n1_by_dept.get(emp.dept_str, []) if u.id != creator.id]
            if not cands:
                cands = n1_by_dept.get(emp.dept_str, [])
            return random.choice(cands) if cands else pick_creator(emp)
        if step == 'DIRECTEUR':
            cands = [u for u in director_by_dept.get(emp.dept_str, []) if u.id != creator.id]
            if not cands:
                cands = director_by_dept.get(emp.dept_str, [])
            return random.choice(cands) if cands else pick_creator(emp)
        # DG
        return dg if dg else pick_creator(emp)

    async def build_validation_history(bonus, emp, creator, steps_done, reject_step=None, reject_motif=None):
        """Historique de validation cohérent avec le statut de la prime."""
        now = datetime.now().astimezone()
        made = []
        for idx in range(steps_done):
            step = VALIDATION_STEPS[idx]
            validator = pick_validator(step, emp, creator)
            note = random.choice(VALIDATION_NOTES) if random.random() < 0.5 else None
            made.append(await Validation.create(
                bonus=bonus, validator=validator, step=step, action='VALIDER', note=note,
            ))
        if reject_step is not None:
            step = VALIDATION_STEPS[reject_step]
            validator = pick_validator(step, emp, creator)
            made.append(await Validation.create(
                bonus=bonus, validator=validator, step=step, action='REJETER',
                motif_rejet=reject_motif,
            ))
        # Horodater la chaîne de façon croissante
        for i, v in enumerate(made):
            await Validation.filter(id=v.id).update(
                validated_at=now - timedelta(minutes=(len(made) - i) * 12)
            )

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

            status, steps_done = STATUS_SCENARIOS[i % len(STATUS_SCENARIOS)]
            was_rejected = random.random() < 0.15
            reject_step = None
            reject_motif = None
            if was_rejected:
                # Le rejet a lieu majoritairement tôt dans la chaîne
                reject_step = random.choices([0, 1, 2], weights=[4, 3, 1])[0]
                steps_done = reject_step
                reject_motif = random.choice(REJET_MOTIFS)
                status = ValidationStatus.INITIALISE

            creator = pick_creator(emp)

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
                details = make_astreinte_details(emp, start)
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

            paid_at = None
            if status == ValidationStatus.VALIDE and random.random() < 0.6:
                paid_at = datetime.now().astimezone() - timedelta(days=random.randint(0, 10))

            bonus = await Bonus.create(
                employee=emp,
                start_date=start,
                end_date=end,
                bonus_type=bonus_type,
                total_amount=amount,
                details=details,
                status=status,
                was_rejected=was_rejected,
                created_by=creator,
                paid_at=paid_at,
                **detail_kwargs,
            )

            await build_validation_history(
                bonus, emp, creator,
                steps_done=steps_done,
                reject_step=reject_step,
                reject_motif=reject_motif,
            )

            created += 1
            rej = " (rejetée)" if was_rejected else ""
            paid = " [payée]" if paid_at else ""
            print(f"  ✓ {status.value}{rej}{paid} — {bonus_type} {emp.name} ({emp.matricule}) "
                  f"{start}→{end} = {amount:.0f} Ar — créée par {creator.name} ({dept})")

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