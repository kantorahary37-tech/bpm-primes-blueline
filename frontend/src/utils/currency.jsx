// Devise / profil d'un employé (Ar par défaut, EUR pour les employés étrangers).
// Retourne le symbole d'affichage associé à un code de devise.
export const currencySymbol = (currency) => {
  const c = (currency || 'Ar').toUpperCase();
  if (c === 'EUR') return '€';
  return 'Ar';
};

// Retourne la devise d'une prime en fonction de son employé.
export const bonusCurrency = (bonus) => currencySymbol(bonus?.employee?.currency);

// Formate une valeur (nombre) avec la devise de l'employé associé.
export const formatAmount = (value, currency) => {
  const symbol = currencySymbol(currency);
  const v = value == null ? 0 : value;
  return `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
};
