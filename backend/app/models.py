# Imports de base Tortoise pour définir les modèles
from tortoise import fields, models
# Import d'Enum pour créer des énumérations de chaînes
from enum import Enum

# Enumération des départements de l'entreprise
class DepartmentType(str, Enum):
    CLIENTELE = "Clientèle"
    COMMERCIALE = "Commerciale"
    ADV = "ADV"
    FIDELISATION = "Fidélisation"
    AUDITEUR_INTERNE = "Auditeur interne"
    DAF_CONTROLEUR = "DAF Contrôleur"
    DAF_CDG = "DAF CDG"
    CTB = "CTB"
    RH = "RH"
    ACHAT = "Achat"
    BBS = "BBS"
    COMM_MKTG = "Communication & Mktg"
    DO = "DO"
    DSI = "DSI"
    DT = "DT"
    LOGISTIQUE = "Logistique"
    DG = "DG"

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

# Modèle Département (table "department")
class Department(models.Model):
    id = fields.IntField(pk=True)
    name = fields.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

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
    # Relation vers le manager (User) : un manager a plusieurs employés
    manager = fields.ForeignKeyField('models.User', related_name='employees')
    # Taux astreinte personnalisé (Ar/semaine), null = taux par défaut
    astreinte_rate = fields.IntField(null=True, default=None)
    # Taux prime mensuelle personnalisé (Ar/mois), null = taux par défaut (plafond département)
    mensuel_rate = fields.IntField(null=True, default=None)
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
    # Montant maximum de la prime
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
