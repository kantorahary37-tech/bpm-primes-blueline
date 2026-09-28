import { sumByCurrency, countByCurrency, formatCurrencyTotal } from '../utils/currencyTotals';

const CURRENCY_SYMBOLS = { EUR: '€' };
const symbolFor = (currency) => CURRENCY_SYMBOLS[currency] || currency;

const AMOUNT_SIZE = { sm: 'text-xs', md: 'text-sm' };
const BADGE_SIZE = { sm: 'text-[10px] px-1.5 py-0.5', md: 'text-xs px-2 py-0.5' };

/**
 * Ligne de totaux multi-devises des en-têtes de listes de primes.
 *
 * Le montant reste du texte, le compteur est rendu dans un badge afin qu'il
 * ne soit plus confondu avec le montant (ex : « 5 458 600 Ar [31] »).
 * Les primes en euro ne sont jamais additionnées aux montants en Ariary :
 * chaque devise garde sa pastille et son propre badge.
 *
 * @param {Array} items           Liste de primes (bonus) — utilise employee.currency
 * @param {boolean} seeAmounts    false → n'affiche que les compteurs
 * @param {Function} getCurrency  (optionnel) fonction pour lire la devise d'une prime
 * @param {boolean} highlight     true pour les en-têtes à fond bleu (texte blanc)
 * @param {'sm'|'md'} size        taille du texte et du badge
 */
export default function CurrencyTotals({
  items,
  seeAmounts = true,
  getCurrency,
  highlight = false,
  size = 'md',
  className = '',
}) {
  const totals = sumByCurrency(items, getCurrency);
  const counts = countByCurrency(items, getCurrency);
  if (counts.length === 0) return null;

  const badgeBase = `inline-flex items-center rounded-full font-bold leading-none ${BADGE_SIZE[size]}`;
  const badgeClass = highlight ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700';
  const soloBadgeClass = highlight ? 'bg-white text-blue-700' : 'bg-gray-100 text-gray-600';

  // Sans seeAmounts, une seule devise affiche un compteur nu (pas de suffixe).
  if (!seeAmounts) {
    if (counts.length === 1) {
      return <span className={`${badgeBase} ${soloBadgeClass}`}>{counts[0].count}</span>;
    }
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        {counts.map(({ currency, count }) => (
          <span key={currency} className={`${badgeBase} ${soloBadgeClass}`}>
            {count} {symbolFor(currency)}
          </span>
        ))}
      </span>
    );
  }

  const countFor = (currency) => counts.find((c) => c.currency === currency)?.count ?? 0;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {totals.map(({ currency, total }) => (
        <span
          key={currency}
          className={`inline-flex items-center gap-1.5 font-bold ${AMOUNT_SIZE[size]} ${highlight ? 'text-white' : 'text-blue-600'}`}
        >
          <span>{formatCurrencyTotal(total, currency)}</span>
          <span className={`${badgeBase} ${badgeClass}`}>{countFor(currency)}</span>
        </span>
      ))}
    </span>
  );
}
