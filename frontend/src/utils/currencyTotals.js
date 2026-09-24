/**
 * Somme des montants par devise.
 *
 * Les primes en euro ne doivent JAMAIS être additionnées avec les montants en
 * Ariary : on regroupe les montants par devise (employee.currency) et on les
 * affiche séparément, ex : « 931 675 Ar · 500 € ».
 *
 * @param {Array} items           Liste de primes (bonus) — utilise employee.currency
 * @param {Function} getCurrency  (optionnel) fonction pour lire la devise d'une prime
 * @returns {Array<{currency: string, total: number}>} totaux par devise, Ar d'abord
 */
export const sumByCurrency = (items, getCurrency) => {
  const totals = {};
  (items || []).forEach((b) => {
    const cur = (getCurrency ? getCurrency(b) : b?.employee?.currency) || 'Ar';
    totals[cur] = (totals[cur] || 0) + (parseFloat(b?.total_amount) || 0);
  });
  // Ar en premier, puis les autres devises par ordre alphabétique
  return Object.entries(totals)
    .sort(([a], [b]) => (a === 'Ar' ? -1 : b === 'Ar' ? 1 : a.localeCompare(b)))
    .map(([currency, total]) => ({ currency, total }));
};

/**
 * Formate un montant avec le symbole de sa devise (Ar, €, ou code brut).
 */
export const formatCurrencyTotal = (total, currency) => {
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${Math.round(total).toLocaleString('fr-FR')} ${symbol}`;
};

/**
 * Ligne de totaux multi-devises : « 931 675 Ar · 500 € ».
 * Retourne '' si aucune devise (rien à afficher).
 */
export const formatTotalsByCurrency = (items, getCurrency) =>
  sumByCurrency(items, getCurrency)
    .map(({ currency, total }) => formatCurrencyTotal(total, currency))
    .join(' · ');

/**
 * Nombre de primes par devise : [{ currency, count }, ...] (Ar d'abord).
 */
export const countByCurrency = (items, getCurrency) => {
  const counts = {};
  (items || []).forEach((b) => {
    const cur = (getCurrency ? getCurrency(b) : b?.employee?.currency) || 'Ar';
    counts[cur] = (counts[cur] || 0) + 1;
  });
  return Object.entries(counts)
    .sort(([a], [b]) => (a === 'Ar' ? -1 : b === 'Ar' ? 1 : a.localeCompare(b)))
    .map(([currency, count]) => ({ currency, count }));
};

/**
 * Compteur multi-devises : « 30 Ar · 2 € » (ou « 30 » si une seule devise).
 * Les compteurs ne révélant aucun montant, ils s'affichent même sans seeAmounts.
 */
export const formatCountsByCurrency = (items, getCurrency) => {
  const parts = countByCurrency(items, getCurrency)
    .map(({ currency, count }) => `${count} ${currency === 'EUR' ? '€' : currency}`);
  if (parts.length <= 1) return String(countByCurrency(items, getCurrency).reduce((s, c) => s + c.count, 0));
  return parts.join(' · ');
};
