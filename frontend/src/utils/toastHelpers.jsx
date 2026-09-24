import toast from 'react-hot-toast';

/**
 * Notifications enrichies — cartes structurées au lieu d'une simple ligne.
 *
 * renderCountToast('Synchronisation LDAP terminée', [
 *   { label: 'Créés', value: 7, tone: 'success' },
 *   { label: 'Déjà existants', value: 140, tone: 'muted' },
 *   ...
 * ])
 */

const TONES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  danger: 'bg-red-50 text-red-700 border-red-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  muted: 'bg-gray-100 text-gray-600 border-gray-200',
};

const toneClass = (tone) => TONES[tone] || TONES.muted;

/**
 * Carte de compteurs : titre + grille de stats + liste de détails optionnelle.
 */
function renderCountToast(title, stats = [], details = null) {
  return (
    <div className="w-80 max-w-full">
      <p className="text-sm font-semibold text-gray-900 mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.map((s, i) => (
          <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${toneClass(s.tone)}`}>
            <span className="text-[11px] font-medium">{s.label}</span>
            <span className="text-sm font-bold">{s.value}</span>
          </div>
        ))}
      </div>
      {details && details.length > 0 && (
        <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
          {details.slice(0, 8).map((d, i) => (
            <li key={i} className="text-[11px] text-gray-500 truncate">• {d}</li>
          ))}
          {details.length > 8 && (
            <li className="text-[11px] text-gray-400 italic">… {details.length - 8} autre(s)</li>
          )}
        </ul>
      )}
    </div>
  );
}

function showCountToast(kind, title, stats, details, duration = 9000) {
  const content = renderCountToast(title, stats, details);
  const opts = { duration };
  // 'blank' et les kinds inconnus : toast neutre via la fonction de base
  // (react-hot-toast n'expose pas toast.blank — toast.success/error/loading uniquement).
  if (typeof toast[kind] !== 'function') toast(content, opts);
  else toast[kind](content, opts);
}

/**
 * Résumé de synchronisation LDAP (employés ou départements).
 * `result` = réponse du backend : { created, already_existing, skipped, errors, ... }
 */
export const ldapSyncToast = (result) => {
  const stats = [
    { label: 'Créés', value: result.created ?? 0, tone: 'success' },
    { label: 'Déjà existants', value: result.already_existing ?? 0, tone: 'muted' },
    { label: 'Ignorés', value: result.skipped ?? 0, tone: result.skipped > 0 ? 'warning' : 'muted' },
    { label: 'Erreurs', value: result.errors ?? 0, tone: result.errors > 0 ? 'danger' : 'muted' },
  ];
  const details = [
    ...(result.created_list || []).map(c => `Créé : ${c.name} (${c.identifier})`),
    ...(result.error_list || []).map(e => `Erreur : ${e.identifier ?? '—'} — ${e.error}`),
  ];
  showCountToast('success', 'Synchronisation LDAP terminée', stats, details);
};

/**
 * Résumé de synchronisation des départements.
 */
export const departmentSyncToast = (result) => {
  const stats = [
    { label: 'Créés', value: result.created ?? 0, tone: 'success' },
    { label: 'Déjà existants', value: result.already_existing ?? 0, tone: 'muted' },
  ];
  const details = (result.created_list || []).map(c => `Créé : ${c.name}`);
  showCountToast('success', 'Synchronisation des départements terminée', stats, details);
};

/**
 * Résumé de déplacement : moved + kept_in_service (avec raison).
 */
export const moveSummaryToast = (result) => {
  const kept = result.kept_in_service ?? 0;
  const stats = [
    { label: 'Déplacés', value: result.moved ?? 0, tone: 'success' },
    { label: 'Conservés (service)', value: kept, tone: kept > 0 ? 'warning' : 'muted' },
  ];
  const details = (result.kept_details || []).map(
    k => `${k.name} : conservé dans « ${k.service} » (${k.service_department})`
  );
  showCountToast('success', `Déplacement vers « ${result.target_department} »`, stats, details);
};

/**
 * Résumé d'auto-fix services/départements.
 */
export const alignToast = (result) => {
  const stats = [
    { label: 'Réalignés', value: result.aligned ?? 0, tone: 'success' },
    { label: 'Vérifiés', value: result.checked ?? 0, tone: 'muted' },
  ];
  const details = (result.details || [])
    .filter(d => d.status === 'aligned')
    .map(d => `${d.name} (${d.matricule}) : ${d.old_department} → ${d.new_department}`);
  showCountToast(
    (result.aligned ?? 0) > 0 ? 'success' : 'blank',
    (result.aligned ?? 0) > 0 ? 'Réalignement terminé' : 'Aucun réalignement nécessaire',
    stats,
    details,
  );
};

/**
 * Erreur API : détail backend si présent.
 */
export const apiErrorToast = (err, fallback = 'Une erreur est survenue') => {
  // err.message : utile quand l'erreur vient du frontend (ex: TypeError), pas de l'API.
  toast.error(err?.response?.data?.detail || err?.message || fallback, { duration: 7000 });
};
