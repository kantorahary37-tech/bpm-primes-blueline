/** Types de primes configurables par département (Administration → Départements).
 *
 * Ce sont les seuls types dont l'accès dépend du département. Les autres
 * (commission GC, intervention, ponctuelle, exceptionnelle…) restent
 * disponibles partout — voir `bonus_type_access.py` côté serveur, qui est la
 * source de vérité.
 */
export const MANAGED_BONUS_TYPES = ['mensuel', 'astreinte', 'commission'];

export const BONUS_TYPE_LABELS = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  // Libellé court dans l'écran de configuration ; ailleurs l'application
  // affiche « Commission GP » (Grand Public), à distinguer de « Commission GC ».
  commission: 'Commission',
  commission_gc: 'Commission GC',
  commission_entreprise: 'Commission Entreprise',
  intervention: 'Intervention',
  ponctuelle: 'Ponctuelle',
  exceptionnel: 'Exceptionnelle',
};