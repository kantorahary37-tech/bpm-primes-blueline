// Règle UNIQUE de la « file » d'un rôle : les statuts sur lesquels ce compte doit
// agir, donc les seules primes à compter comme « en attente » pour lui.
//
// Cette règle doit rester alignée avec `actionable_statuses()` côté backend
// (app/permissions.py), qui filtre la liste des primes, les exports et les
// rappels email. Elle est partagée par le Dashboard, la liste des primes et le
// Kanban : c'est ce qui garantit que le compteur « En attente » tombe toujours
// sur 0 quand la liste affichée est vide.
//
// L'ordre des tests est significatif : un compte cumulant plusieurs rôles
// (Directeur + N+1, DG + Directeur...) est traité par son rôle le plus large.

export const ALL_STATUSES = [
  'Initialisé',
  'En attente N+2',
  'En attente Directeur',
  'En attente DRH',
  'En attente DG',
  'Prime validée',
  'Prime rejetée',
];

// Statuts terminaux : la prime a quitté le circuit, elle n'est plus « en attente ».
export const CLOSED_STATUSES = ['Prime validée', 'Prime rejetée'];

export const roleStatuses = (user) => {
  if (!user) return [];
  if (user.is_admin) return ALL_STATUSES;
  if (user.is_dg) return ['En attente DG'];
  if (user.is_drh) return ['En attente DRH', 'Prime validée'];
  if (user.is_directeur) return ['En attente Directeur'];
  if (user.is_validator_n2) return ['Initialisé', 'En attente N+2'];
  if (user.is_validator_n1) return ['Initialisé'];
  return [];
};

// Statut pré-sélectionné dans le filtre de la liste des primes.
// Admin et DRH n'ont pas de filtre par défaut (DRH voit d'un coup la file
// « En attente DRH » et les « Prime validée » à traiter).
export const defaultStatusFor = (user) => {
  if (!user) return '';
  if (user.is_admin) return '';
  if (user.is_dg) return 'En attente DG';
  if (user.is_drh) return '';
  if (user.is_directeur) return 'En attente Directeur';
  if (user.is_validator_n2) return 'En attente N+2';
  if (user.is_validator_n1) return 'Initialisé';
  return '';
};

// Primes relevant de la file du compte ET encore ouvertes → les « en attente ».
export const isPendingFor = (user, bonus) => {
  if (!bonus) return false;
  if (CLOSED_STATUSES.includes(bonus.status)) return false;
  return roleStatuses(user).includes(bonus.status);
};