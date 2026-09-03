from enum import Enum
from tortoise import fields, models

# Modèle Configuration Système (table "systemconfig")
class SystemConfig(models.Model):
    # Clé = nom de la variable d'environnement (ex: SMTP_HOST)
    key = fields.CharField(max_length=100, pk=True)
    # Valeur actuelle
    value = fields.TextField(default='')
    # Catégorie de regroupement
    category = fields.CharField(max_length=50)
    # Description lisible par l'humain
    description = fields.CharField(max_length=255, default='')

# Enumération des types de primes
class BonusType(str, Enum):
    MENSUEL = "mensuel"
    ASTREINTE = "astreinte"
    COMMISSION = "commission"
    INTERVENTION = "intervention"
    PONCTUELLE = "ponctuelle"
    EXCEPTIONNEL = "exceptionnel"

# Enumération des statuts de validation
class ValidationStatus(str, Enum):
    INITIALISE = "Initialisé"
    EN_ATTENTE_DIRECTEUR = "En attente Directeur"
    EN_ATTENTE_DG = "En attente DG"
    VALIDE = "Prime validée"
    REJETE = "Prime rejetée"

# Modèle Devise / Profil (table "currency") — liste dynamique gérée par Admin/DG/DRH
class Currency(models.Model):
    # Code devise (ex: Ar, EUR, USD)
    code = fields.CharField(max_length=10, pk=True)
    # Symbole d'affichage (ex: Ar, €, $)
    symbol = fields.CharField(max_length=10, default='')
    # Libellé lisible (ex: Ariary, Euro)
    label = fields.CharField(max_length=50, default='')
    # Devise système (Ar/EUR) : ne peut pas être supprimée
    is_system = fields.BooleanField(default=False)
    # Visible dans les listes
    active = fields.BooleanField(default=True)

    def __str__(self):
        return self.code

# Modèle Département (table "department")
class Department(models.Model):
    id = fields.IntField(pk=True)
    name = fields.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

# Modèle Groupe / Sous-département (table "group")
class Group(models.Model):
    id = fields.IntField(pk=True)
    name = fields.CharField(max_length=100)
    # Département parent
    department = fields.ForeignKeyField('models.Department', related_name='groups')
    # Actif ou non
    active = fields.BooleanField(default=True)
    created_at = fields.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("name", "department"),)

    def __str__(self):
        return f"{self.name} ({self.department})"

# Modèle d'assignation Directeur ↔ Groupe (table "directorgroupassignment")
# Un directeur peut valider plusieurs groupes, un groupe peut avoir plusieurs directeurs
class DirectorGroupAssignment(models.Model):
    id = fields.IntField(pk=True)
    # Le directeur (User avec is_directeur=True)
    director = fields.ForeignKeyField('models.User', related_name='group_assignments')
    # Le groupe assigné
    group = fields.ForeignKeyField('models.Group', related_name='director_assignments')
    created_at = fields.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("director", "group"),)

# Modèle Utilisateur (table "user")
class User(models.Model):
    # Clé primaire auto-incrémentée
    id = fields.IntField(pk=True)
    # Email unique de l'utilisateur
    email = fields.CharField(max_length=255, unique=True)
    # Nom complet de l'utilisateur
    name = fields.CharField(max_length=255)
    # Poste occupé (optionnel)
    poste = fields.CharField(max_length=255, null=True)
    # Département (colonne temporaire pour transition)
    dept_str = fields.CharField(max_length=50, null=True, source_field='department')
    # Département (FK vers Department)
    dept = fields.ForeignKeyField('models.Department', related_name='users', null=True, source_field='department_id')
    # Boolean : est validateur N+1 ?
    is_validator_n1 = fields.BooleanField(default=False)
    # Boolean : est directeur ?
    is_directeur = fields.BooleanField(default=False)
    # Boolean : est DRH ?
    is_drh = fields.BooleanField(default=False)
    # Boolean : est Directeur Général ?
    is_dg = fields.BooleanField(default=False)
    # Boolean : est Administrateur (tous les privilèges) ?
    is_admin = fields.BooleanField(default=False)
    # Mot de passe hashé
    password_hash = fields.CharField(max_length=255, null=True)
    # Token de réinitialisation de mot de passe
    reset_token = fields.CharField(max_length=255, null=True)
    # Date d'expiration du token
    reset_token_expires = fields.DatetimeField(null=True)
    # Date de création automatique
    created_at = fields.DatetimeField(auto_now_add=True)

    @property
    def department(self):
        return self.dept_str

# Modèle Employé (table "employee")
class Employee(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Matricule unique de l'employé
    matricule = fields.CharField(max_length=50, unique=True)
    # Nom de l'employé
    name = fields.CharField(max_length=255)
    # Département (colonne temporaire pour transition)
    dept_str = fields.CharField(max_length=50, source_field='department')
    # Département (FK vers Department)
    dept = fields.ForeignKeyField('models.Department', related_name='employees', source_field='department_id')
    # Groupe / sous-département (optionnel)
    group = fields.ForeignKeyField('models.Group', related_name='employees', null=True)
    # Relation vers le manager (User) : un manager a plusieurs employés
    manager = fields.ForeignKeyField('models.User', related_name='employees', null=True)
    # Devise / profil de l'employé (Ar par défaut, EUR pour les employés étrangers, etc.)
    currency = fields.CharField(max_length=10, default='Ar', index=True)
    # Taux astreinte personnalisé (unité = devise de l'employé/semaine), null = taux par défaut
    astreinte_rate = fields.IntField(null=True, default=None)
    # Taux prime mensuelle personnalisé (unité = devise de l'employé/mois), null = taux par défaut (plafond département)
    mensuel_rate = fields.IntField(null=True, default=None)
    # Si l'employé est actif (visible dans les listes)
    is_active = fields.BooleanField(default=True)
    # Date de création
    created_at = fields.DatetimeField(auto_now_add=True)

    @property
    def department(self):
        return self.dept_str

# Modèle Prime (table "bonus")
class Bonus(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Relation vers l'employé concerné
    employee = fields.ForeignKeyField('models.Employee', related_name='bonuses')
    # Date de début de la période
    start_date = fields.DateField()
    # Date de fin de la période
    end_date = fields.DateField()
    # Type de prime (mensuel/astreinte/commission)
    bonus_type = fields.CharEnumField(BonusType, max_length=20)
    # Score de performance (optionnel)
    performance_score = fields.DecimalField(max_digits=5, decimal_places=2, null=True)
    # Nombre d'absences (optionnel)
    absences = fields.IntField(null=True)
    # Nombre de retards (optionnel)
    retard = fields.IntField(null=True)
    # Montant prime mensuelle (optionnel)
    prime_mensuel_amount = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    # Nombre de jours d'astreinte (optionnel)
    nb_jours_astreinte = fields.IntField(null=True)
    # Taux journalier d'astreinte (optionnel)
    taux_jour = fields.DecimalField(max_digits=10, decimal_places=2, null=True)
    # Montant prime astreinte (optionnel)
    prime_astreinte_amount = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    # Chiffre d'affaires réalisé (optionnel)
    ca_realise = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    # Chiffre d'affaires objectif (optionnel)
    ca_objectif = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    # Taux de commission (optionnel)
    taux_commission = fields.DecimalField(max_digits=10, decimal_places=2, null=True)
    # Montant commission (optionnel)
    commission_amount = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    # Montant total de la prime
    total_amount = fields.DecimalField(max_digits=15, decimal_places=2)
    # Données détaillées de l'évaluation (JSON : critères, budgets, notes, etc.)
    details = fields.JSONField(null=True)
    # Indique si la prime a déjà été rejetée
    was_rejected = fields.BooleanField(default=False)
    # Date de paiement (null = pas encore payée)
    paid_at = fields.DatetimeField(null=True)
    # Statut de validation de la prime
    status = fields.CharEnumField(ValidationStatus, default=ValidationStatus.INITIALISE)
    # Créateur de la prime (relation vers User)
    created_by = fields.ForeignKeyField('models.User', related_name='bonuses')
    # Date de création
    created_at = fields.DatetimeField(auto_now_add=True)
    # Date de mise à jour automatique
    updated_at = fields.DatetimeField(auto_now=True)

# Modèle Validation (table "validation")
class Validation(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Relation vers la prime validée
    bonus = fields.ForeignKeyField('models.Bonus', related_name='validations')
    # Relation vers le validateur (User)
    validator = fields.ForeignKeyField('models.User')
    # Étape de validation (N1/DIRECTEUR/DG)
    step = fields.CharField(max_length=50)
    # Action (VALIDER/REJETER)
    action = fields.CharField(max_length=20)
    # Note de modification (optionnel)
    note = fields.TextField(null=True)
    # Motif de rejet (optionnel)
    motif_rejet = fields.TextField(null=True)
    # Date de validation
    validated_at = fields.DatetimeField(auto_now_add=True)

# Modèle Barème commission (table "commissionconfig")
class CommissionConfig(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Nom exact du produit (doit correspondre aux colonnes du CSV)
    product_name = fields.CharField(max_length=100)
    # Taux de commission par vente (en Ar)
    rate = fields.IntField()
    # Nombre minimum de ventes pour bénéficier du doublement
    objectif = fields.IntField(default=0)
    # Groupe d'appartenance (objectif partagé)
    group_name = fields.CharField(max_length=100, null=True, default='')
    # Produit actif ou non
    active = fields.BooleanField(default=True)
    # Grand point de vente (GPV) : objectifs différents des petits points de vente
    is_gpv = fields.BooleanField(default=False)

    class Meta:
        # Un même produit peut exister en deux lignes : une pour GPV, une pour petit PDV
        unique_together = (("product_name", "is_gpv"),)

# Modèle Prime Max (table "primemax")
class PrimeMax(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Département (colonne temporaire pour transition)
    dept_str = fields.CharField(max_length=50, source_field='department')
    # Département (FK vers Department)
    dept = fields.ForeignKeyField('models.Department', related_name='primemax', source_field='department_id')
    # Type de prime concerné
    bonus_type = fields.CharEnumField(BonusType, max_length=20)

    @property
    def department(self):
        return self.dept_str
    # Devise du plafond (Ar par défaut, EUR pour les employés étrangers)
    currency = fields.CharField(max_length=10, default='Ar', index=True)
    # Montant maximum de la prime (dans la devise du plafond)
    amount = fields.DecimalField(max_digits=15, decimal_places=2)
    # Utilisateur ayant défini le montant (optionnel)
    set_by = fields.ForeignKeyField('models.User', null=True)
    # Date de mise à jour
    updated_at = fields.DatetimeField(auto_now=True)

# Modèle Audit Log (table "auditlog")
class AuditLog(models.Model):
    id = fields.IntField(pk=True)
    bonus = fields.ForeignKeyField('models.Bonus', related_name='audit_logs')
    user = fields.ForeignKeyField('models.User')
    action = fields.CharField(max_length=50)
    description = fields.TextField(null=True)
    changes = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

# Modèle Template d'évaluation (table "evaluationtemplate")
class EvaluationTemplate(models.Model):
    id = fields.IntField(pk=True)
    employee = fields.ForeignKeyField('models.Employee', related_name='evaluation_templates')
    section = fields.CharField(max_length=20)  # "quantitative" ou "qualitative"
    criteria_name = fields.CharField(max_length=255)
    description = fields.CharField(max_length=255, null=True, default='')
    coeff = fields.DecimalField(max_digits=5, decimal_places=1)
    sort_order = fields.IntField(default=0)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

# Modèle Notification (table "notification")
class Notification(models.Model):
    id = fields.IntField(pk=True)
    user = fields.ForeignKeyField('models.User', related_name='notifications')
    bonus = fields.ForeignKeyField('models.Bonus', related_name='notifications')
    sender = fields.ForeignKeyField('models.User', related_name='sent_notifications')
    type = fields.CharField(max_length=20)  # MODIF_DIR, MODIF_DG
    message = fields.TextField()
    is_read = fields.BooleanField(default=False)
    created_at = fields.DatetimeField(auto_now_add=True)
