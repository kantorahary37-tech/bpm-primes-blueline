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
    COMMISSION_GC = "commission_gc"
    COMMISSION_ENTREPRISE = "commission_entreprise"
    INTERVENTION = "intervention"
    PONCTUELLE = "ponctuelle"
    EXCEPTIONNEL = "exceptionnel"

# Enumération des statuts de validation
class ValidationStatus(str, Enum):
    INITIALISE = "Initialisé"
    EN_ATTENTE_N2 = "En attente N+2"
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
    # Boolean : est validateur N+2 (sous-directeur) ?
    is_validator_n2 = fields.BooleanField(default=False)
    # Boolean : est directeur ?
    is_directeur = fields.BooleanField(default=False)
    # Boolean : est DRH ?
    is_drh = fields.BooleanField(default=False)
    # Boolean : est Directeur Général ?
    is_dg = fields.BooleanField(default=False)
    # Boolean : est Administrateur (tous les privilèges) ?
    is_admin = fields.BooleanField(default=False)
    # Groupes de services gérés (N+1) : un N+1 peut être affecté à plusieurs services,
    # et ne peut créer/valider que les primes des employés de ses services affectés.
    service_groups = fields.ManyToManyField('models.ServiceGroup', related_name='managers', through='user_servicegroup')
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

# Modèle Service / Groupe (table "servicegroup")
class ServiceGroup(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Nom du service
    name = fields.CharField(max_length=100)
    # Département auquel appartient le service
    department = fields.ForeignKeyField('models.Department', related_name='service_groups')
    # Utilisateur ayant créé le groupe (optionnel)
    created_by = fields.ForeignKeyField('models.User', null=True)
    # Date de création
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        # Un même nom de service ne peut exister qu'une fois par département
        unique_together = (("name", "department"),)

    def __str__(self):
        return self.name

# Modèle Assignation Service Utilisateur (table "user_service_assignment")
class UserServiceAssignment(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Utilisateur assigné
    user = fields.ForeignKeyField('models.User', related_name='service_assignments')
    # Service assigné
    service_group = fields.ForeignKeyField('models.ServiceGroup', related_name='user_assignments')
    # N+1 (responsable hiérarchique) pour ce service (optionnel)
    n1 = fields.ForeignKeyField('models.User', related_name='subordinates', null=True)
    # Date de création
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        # Un utilisateur ne peut être assigné qu'une fois au même service
        unique_together = (("user", "service_group"),)
        # Nom de table explicite (cohérent avec la migration dans wait_for_db.py)
        table = "user_service_assignment"

# Modèle Employé (table "employee")
class Employee(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Matricule unique de l'employé
    matricule = fields.CharField(max_length=50, unique=True)
    # Nom de l'employé
    name = fields.CharField(max_length=255)
    # Poste / fonction de l'employé (optionnel)
    poste = fields.CharField(max_length=255, null=True)
    # Département (colonne temporaire pour transition)
    dept_str = fields.CharField(max_length=50, source_field='department')
    # Département (FK vers Department)
    dept = fields.ForeignKeyField('models.Department', related_name='employees', source_field='department_id')
    # Relation vers le manager (User) : un manager a plusieurs employés
    manager = fields.ForeignKeyField('models.User', related_name='employees')
    # Service / groupe auquel l'employé est affecté (null = non assigné)
    service_group = fields.ForeignKeyField('models.ServiceGroup', related_name='employees_service_group', null=True, source_field='service_group_id')
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

    @property
    def service(self):
        return self.service_group.name if self.service_group else None

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
    # Type de prime (mensuel/astreinte/commission/...)
    bonus_type = fields.CharEnumField(BonusType, max_length=30)
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
    # Passer à un N+2 pour validation intermédiaire (mensuel uniquement)
    pass_to_n2 = fields.BooleanField(default=False)
    # Utilisateur N+2 sélectionné pour valider cette prime
    n2_user = fields.ForeignKeyField('models.User', related_name='n2_bonuses', null=True)
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

# Modèle Configuration Prime Commission Entreprise / Grand Compte (table "commissiongcconfig")
# Configuration GLOBALE (sans période) :
#   MRC % = MRC réalisé / objectif MRC
#   FMS % = (FMS réalisé / 12) / objectif FMS
#   Commission = commission@100% × % ; plafonnée à max_commission par employé.
class CommissionGCConfig(models.Model):
    # Clé primaire
    id = fields.IntField(pk=True)
    # Objectif mensuel MRC (en Ar)
    mrc_objective = fields.DecimalField(max_digits=15, decimal_places=2)
    # Objectif FMS (en Ar) — le réalisé FMS est ramené par FMS_DIVISOR (12) avant comparaison
    fms_objective = fields.DecimalField(max_digits=15, decimal_places=2)
    # Commission (en Ar) versée pour 100% de l'objectif atteint
    commission_at_100 = fields.DecimalField(max_digits=15, decimal_places=2)
    # Plafond de la commission totale par employé (en Ar)
    max_commission = fields.DecimalField(max_digits=15, decimal_places=2, default=1000000)
    # Configuration active ou non
    active = fields.BooleanField(default=True)
    # Date de création automatique
    created_at = fields.DatetimeField(auto_now_add=True)
    # Date de mise à jour automatique
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "commissiongcconfig"

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

# Modèle Snapshot de configuration (table "configsnapshot")
class ConfigSnapshot(models.Model):
    """Sauvegarde de l'état des affectations (département + service) de tous les employés."""
    id = fields.IntField(pk=True)
    # Nom / description de la sauvegarde
    label = fields.CharField(max_length=255)
    # Administrateur ayant créé la sauvegarde
    created_by = fields.ForeignKeyField('models.User', related_name='config_snapshots')
    # Données JSON : liste d'objets { employee_id, matricule, name, department, service_group_id, service_group_name }
    snapshot_data = fields.JSONField()
    # Nombre d'employés dans la sauvegarde
    employee_count = fields.IntField(default=0)
    # Date de création
    created_at = fields.DatetimeField(auto_now_add=True)


# Modèle Journal des synchronisations LDAP (table "ldapyncexecution")
class LdapSyncExecution(models.Model):
    """Historique / journal des synchronisations LDAP (create-only)."""
    id = fields.IntField(pk=True)
    # Origine : CRON ou MANUAL
    trigger_type = fields.CharField(max_length=20)
    # Statut : RUNNING / COMPLETED / FAILED
    status = fields.CharField(max_length=20, default='RUNNING')
    # Compteurs
    ldap_found = fields.IntField(default=0)
    created_count = fields.IntField(default=0)
    already_existing_count = fields.IntField(default=0)
    skipped_count = fields.IntField(default=0)
    errors_count = fields.IntField(default=0)
    # Détails : listes created / skipped / errors (JSON)
    result_details = fields.JSONField(null=True)
    # Durée en secondes
    duration_seconds = fields.DecimalField(max_digits=10, decimal_places=3, null=True)
    # Utilisateur ayant déclenché la synchronisation (null pour CRON / script)
    created_by = fields.ForeignKeyField('models.User', related_name='ldap_sync_executions', null=True)
    # Dates
    started_at = fields.DatetimeField(null=True)
    finished_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "ldapyncexecution"

# Modèle Journal des envois du rappel DG des primes en cours (table "primereminderexecution")
class PrimeReminderExecution(models.Model):
    """Historique / journal des envois du rappel DG (cron ou manuel).

    Garantit l'idempotence : un même créneau planifié (notification_type +
    scheduled_for) ne peut être envoyé qu'une seule fois. Un envoi ayant
    échoué (FAILED) peut être retenté en réutilisant la même ligne.
    """
    id = fields.IntField(pk=True)
    # Type d'exécution (ex: prime_reminder_dg)
    notification_type = fields.CharField(max_length=50)
    # Origine : CRON ou MANUAL
    trigger_type = fields.CharField(max_length=20)
    # Créneau planifié (date/heure locale) pour les exécutions CRON ;
    # instant de déclenchement pour les exécutions manuelles.
    scheduled_for = fields.DatetimeField(null=True)
    # Destinataire(s) effectif(s) de l'email (séparés par une virgule)
    recipient = fields.CharField(max_length=1000, default='')
    # Statut : PENDING / SENDING / SENT / FAILED / MANUAL
    status = fields.CharField(max_length=20, default='PENDING')
    # Résumé groupé envoyé (département / type => nombre)
    summary = fields.JSONField(null=True)
    # Nombre total de primes en cours concernées
    total_count = fields.IntField(default=0)
    # Date effective d'envoi
    sent_at = fields.DatetimeField(null=True)
    # Message d'erreur en cas d'échec
    error_message = fields.TextField(null=True)
    # Utilisateur ayant déclenché un envoi manuel (null pour CRON / script)
    created_by = fields.ForeignKeyField('models.User', related_name='prime_reminder_executions', null=True)
    # Dates de création / mise à jour
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        # Idempotence CRON : un même créneau planifié ne peut être exécuté qu'une fois
        unique_together = (("notification_type", "scheduled_for"),)
        table = "primereminderexecution"
