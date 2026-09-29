import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  MailIcon, ClockIcon, CalendarIcon, EyeIcon, CheckBadgeIcon,
  SettingsIcon, BellIcon, ExclamationIcon, UsersIcon,
} from '../components/Icons';
import {
  getEmailTriggersOverview,
  getEmailTriggerConfig,
  updateEmailTriggerConfig,
  sendEmailTriggerNow,
  previewEmailTrigger,
  getEmailTriggerExecutions,
} from '../services/api';

const TRIGGER_META = {
  daily: {
    label: 'Rappels quotidiens',
    description: 'Un email par acteur (Directeur / DRH) listant les primes en attente de sa validation. Les comptes DG reçoivent le dédié « Rappel DG ».',
    color: 'blue',
    Icon: BellIcon,
    audience: 'Directeurs et DRH concernés (automatique)',
  },
  deadline: {
    label: 'Rappel de date limite',
    description: 'Rappels avant la date limite de finalisation des validations (envoyés aux N+1, N+2 et Directeurs).',
    color: 'amber',
    Icon: CalendarIcon,
    audience: 'N+1, N+2, Directeurs concernés (automatique)',
  },
  dg: {
    label: 'Rappel DG',
    description: 'Résumé groupé (département / type de prime) des primes en attente de validation DG, envoyé aux comptes DG. Aucune information nominative.',
    color: 'emerald',
    Icon: MailIcon,
    audience: 'Comptes DG (ou surcharge)',
  },
  rh: {
    label: 'Rappel RH',
    description: 'Résumé groupé (département / type de prime) des primes validées en attente de traitement, envoyé aux comptes RH. Aucune information nominative.',
    color: 'violet',
    Icon: UsersIcon,
    audience: 'Comptes RH (ou surcharge)',
  },
};

const COLOR_CLASSES = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100', dot: 'bg-blue-500', toggle: 'toggle-primary' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100', dot: 'bg-amber-500', toggle: 'toggle-warning' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100', dot: 'bg-emerald-500', toggle: 'toggle-success' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100', dot: 'bg-violet-500', toggle: 'toggle-secondary' },
};

const STATUS_BG = {
  SENT: 'bg-green-100 text-green-700',
  MANUAL: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SENDING: 'bg-purple-100 text-purple-700',
};

const STATUS_LABEL = {
  SENT: 'Envoyé',
  MANUAL: 'Manuel',
  FAILED: 'Échec',
  PENDING: 'En attente',
  SENDING: 'En cours',
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 10;

// ── Carte résumé d'un déclencheur ──────────────────────────────────────────

function TriggerCard({ trigger, onConfigure, onSend, onPreview, sending, previewing }) {
  const meta = TRIGGER_META[trigger.key];
  const colors = COLOR_CLASSES[meta.color];
  const last = trigger.last_execution;

  return (
    <div className="bg-white rounded-2xl border border-base-200 p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
          <meta.Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{meta.label}</h3>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${trigger.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${trigger.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              {trigger.enabled ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{meta.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><ClockIcon className="w-3 h-3" /> Prochain envoi</p>
          <p className="font-semibold text-gray-900 text-[13px]">{formatDateTime(trigger.next_run)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><MailIcon className="w-3 h-3" /> Dernier envoi</p>
          <p className="font-semibold text-gray-900 text-[13px]">
            {last ? formatDateTime(last.sent_at || last.scheduled_for) : 'Aucun'}
            {last && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BG[last.status] || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABEL[last.status] || last.status}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className={`rounded-lg ${colors.bg}/60 px-3 py-2 text-xs text-gray-600 ring-1 ${colors.ring}`}>
        <p className="font-medium text-gray-700">{trigger.schedule}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{meta.audience}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-auto">
        <button onClick={() => onConfigure(trigger.key)} className="btn btn-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5" /> Configurer
        </button>
        <button
          onClick={() => onPreview(trigger.key)}
          disabled={previewing === trigger.key}
          className="btn btn-sm btn-ghost text-gray-500 gap-1.5"
        >
          {previewing === trigger.key ? <span className="loading loading-spinner loading-xs" /> : <EyeIcon className="w-3.5 h-3.5" />}
          Aperçu
        </button>
        <button
          onClick={() => onSend(trigger.key)}
          disabled={sending === trigger.key}
          className={`btn btn-sm btn-outline gap-1.5 ${colors.text} border-current ml-auto`}
          title="Envoyer maintenant (journalisé comme envoi manuel)"
        >
          {sending === trigger.key ? <span className="loading loading-spinner loading-xs" /> : <MailIcon className="w-3.5 h-3.5" />}
          Envoyer maintenant
        </button>
      </div>
    </div>
  );
}

// ── Éditeurs de listes (jours / heures) ───────────────────────────────────
// Remontés via `key` côté parent : pas de synchronisation par effet.

function parseIntList(input, min, max) {
  return [...new Set(
    input.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n >= min && n <= max)
  )].sort((a, b) => a - b);
}

function DaysEditor({ value, onChange, color }) {
  const [input, setInput] = useState(value.join(', '));
  const commit = () => onChange(parseIntList(input, 1, 28));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 min-h-7">
        {value.length
          ? value.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => onChange(value.filter((d) => d !== day))}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLOR_CLASSES[color].bg} ${COLOR_CLASSES[color].text} hover:opacity-70`}
              title="Retirer"
            >
              {day} ✕
            </button>
          ))
          : <span className="text-xs text-gray-400">Aucun jour</span>}
      </div>
      <input
        type="text"
        className="input input-bordered input-sm w-full mt-2"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="ex : 5, 10, 15"
      />
    </div>
  );
}

function HoursEditor({ value, onChange, color }) {
  const [input, setInput] = useState(value.join(', '));
  const commit = () => onChange(parseIntList(input, 0, 23));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 min-h-7">
        {value.length
          ? value.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onChange(value.filter((x) => x !== h))}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COLOR_CLASSES[color].bg} ${COLOR_CLASSES[color].text} hover:opacity-70`}
              title="Retirer"
            >
              {String(h).padStart(2, '0')}h ✕
            </button>
          ))
          : <span className="text-xs text-gray-400">Aucune heure</span>}
      </div>
      <input
        type="text"
        className="input input-bordered input-sm w-full mt-2"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="ex : 8, 17"
      />
    </div>
  );
}

// ── Panneau de configuration inline ───────────────────────────────────────

function TriggerConfigPanel({ triggerKey, onClose, onSaved }) {
  const meta = TRIGGER_META[triggerKey];
  const colors = COLOR_CLASSES[meta.color];
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEmailTriggerConfig(triggerKey)
      .then((data) => { if (!cancelled) setCfg(data); })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger la configuration'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [triggerKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let payload;
      if (triggerKey === 'daily') {
        payload = { enabled: cfg.enabled, hour: cfg.hour, minute: cfg.minute };
      } else if (triggerKey === 'deadline') {
        if (!cfg.days?.length) { toast.error('Indiquez au moins un jour de rappel'); return; }
        if (!cfg.hours?.length) { toast.error('Indiquez au moins une heure'); return; }
        payload = { enabled: cfg.enabled, deadline_day: cfg.deadline_day, days: cfg.days, hours: cfg.hours };
      } else {
        // dg & rh : même forme de payload
        if (!cfg.days?.length) { toast.error('Indiquez au moins un jour du mois'); return; }
        if (!cfg.hours?.length) { toast.error('Indiquez au moins une heure'); return; }
        payload = { enabled: cfg.enabled, days: cfg.days, hours: cfg.hours, recipient: cfg.recipient_override || '' };
      }
      const updated = await updateEmailTriggerConfig(triggerKey, payload);
      setCfg((prev) => ({ ...prev, ...updated }));
      toast.success('Configuration enregistrée');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const numInput = (key, min, max, suffix) => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        className="input input-bordered input-sm w-24"
        value={cfg[key]}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          setCfg((prev) => ({ ...prev, [key]: Number.isNaN(v) ? '' : Math.max(min, Math.min(max, v)) }));
        }}
      />
      <span className="text-sm text-gray-400">{suffix}</span>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-base-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-200">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}>
            <meta.Icon className="w-4 h-4" />
          </span>
          Configuration — {meta.label}
        </h2>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">✕</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="loading loading-spinner loading-md" /></div>
      ) : !cfg ? (
        <div className="px-6 py-8 text-sm text-gray-400 text-center">Configuration indisponible.</div>
      ) : (
        <div className="p-6 space-y-5">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="font-medium text-gray-900">Activer {meta.label.toLowerCase()}</p>
              <p className="text-sm text-gray-400">Envoi automatique selon la planification ci-dessous</p>
            </div>
            <input
              type="checkbox"
              className={`toggle ${colors.toggle}`}
              checked={Boolean(cfg.enabled)}
              onChange={(e) => setCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
          </label>

          {triggerKey === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure d'envoi quotidienne</label>
              <div className="flex items-center gap-3">
                {numInput('hour', 0, 23, 'h')}
                {numInput('minute', 0, 59, 'min')}
                <span className="text-xs text-gray-400">(UTC{(cfg.tz_offset ?? 3) >= 0 ? '+' : ''}{cfg.tz_offset ?? 3})</span>
              </div>
            </div>
          )}

          {triggerKey === 'deadline' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date limite de validation</label>
                <div className="flex items-center gap-2">
                  {numInput('deadline_day', 1, 28, 'du mois')}
                  <span className="text-xs text-gray-400">Affichée dans l'email comme échéance</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jours de rappel</label>
                  <DaysEditor key={(cfg.days || []).join('-')} value={cfg.days || []} onChange={(days) => setCfg((p) => ({ ...p, days }))} color={meta.color} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heures d'envoi</label>
                  <HoursEditor key={(cfg.hours || []).join('-')} value={cfg.hours || []} onChange={(hours) => setCfg((p) => ({ ...p, hours }))} color={meta.color} />
                </div>
              </div>
            </>
          )}

          {(triggerKey === 'dg' || triggerKey === 'rh') && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jours du mois</label>
                  <DaysEditor key={(cfg.days || []).join('-')} value={cfg.days || []} onChange={(days) => setCfg((p) => ({ ...p, days }))} color={meta.color} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heures d'envoi</label>
                  <HoursEditor key={(cfg.hours || []).join('-')} value={cfg.hours || []} onChange={(hours) => setCfg((p) => ({ ...p, hours }))} color={meta.color} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire(s) (surcharge)</label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={cfg.recipient_override || ''}
                  onChange={(e) => setCfg((prev) => ({ ...prev, recipient_override: e.target.value }))}
                  placeholder={triggerKey === 'dg'
                    ? "Laissez vide pour utiliser le(s) compte(s) DG de l'application"
                    : "Laissez vide pour utiliser le(s) compte(s) RH de l'application"}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Emails séparés par des virgules. Vide = tous les comptes marqués {triggerKey === 'dg' ? 'DG (is_dg)' : 'RH (is_drh)'} non administrateurs.
                  Actuellement : <span className="font-medium text-gray-600">{cfg.recipient || (triggerKey === 'dg' ? 'aucun compte DG' : 'aucun compte RH')}</span>
                </p>
              </div>
            </>
          )}

          <div className="rounded-lg bg-gray-50 border border-base-200 px-4 py-3 text-xs text-gray-500">
            {cfg.recipients_hint || 'Un email est envoyé automatiquement aux acteurs concernés — aucune adresse à configurer.'}
          </div>

          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-sm" /> : null}
              Enregistrer
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            <span className="text-xs text-gray-400 ml-auto">
              Prochain envoi : <span className="font-medium text-gray-600">{formatDateTime(cfg.next_run)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Historique ────────────────────────────────────────────────────────────

function ExecutionSummary({ summary, total }) {
  if (!summary) return total != null ? <span className="font-semibold">{total}</span> : '—';
  if (typeof summary === 'object' && !Array.isArray(summary)) {
    // Résumé d'agrégat (emails envoyés / échoués / vague)
    return (
      <div className="text-xs space-y-0.5">
        {summary.emails_sent != null && <p><span className="font-semibold">{summary.emails_sent}</span> email(s) envoyé(s)</p>}
        {summary.emails_failed > 0 && <p className="text-red-500">{summary.emails_failed} échec(s)</p>}
        {summary.wave && <p className="text-gray-500">{summary.wave} — échéance : {summary.deadline}</p>}
      </div>
    );
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
        Voir le résumé {total ? `(${total})` : ''}
      </summary>
      <ul className="mt-1 space-y-0.5 text-gray-500">
        {summary.map((s, i) => (
          <li key={i}>{s.department} / {s.bonus_type_label} : {s.count}</li>
        ))}
      </ul>
    </details>
  );
}

function TriggerHistory({ triggerKey }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = { page, size: PAGE_SIZE };
    if (statusFilter) params.status = statusFilter;
    getEmailTriggerExecutions(triggerKey, params)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => { /* silencieux */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [triggerKey, page, statusFilter]);

  const changeFilter = (value) => { setStatusFilter(value); setPage(1); setLoading(true); };
  const changePage = (delta) => { setPage((p) => p + delta); setLoading(true); };

  return (
    <div className="bg-white rounded-2xl border border-base-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-base-200">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          Historique des envois — {TRIGGER_META[triggerKey].label}
        </h2>
        <select
          className="select select-sm select-bordered"
          value={statusFilter}
          onChange={(e) => changeFilter(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="SENT">Envoyé</option>
          <option value="MANUAL">Manuel</option>
          <option value="FAILED">Échec</option>
          <option value="PENDING">En attente</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="font-medium">Date</th>
              <th className="font-medium">Déclencheur</th>
              <th className="font-medium">Statut</th>
              <th className="font-medium">Contenu</th>
              <th className="font-medium">Destinataires</th>
              <th className="font-medium">Détail</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="6" className="text-center py-8"><span className="loading loading-spinner loading-sm" /></td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan="6" className="text-center py-8 text-gray-400">Aucun envoi enregistré pour le moment</td></tr>
            )}
            {items.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">{formatDateTime(row.scheduled_for || row.sent_at)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.trigger_type === 'MANUAL' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                    {row.trigger_type === 'MANUAL' ? 'Manuel' : 'Cron'}
                  </span>
                </td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BG[row.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[row.status] || row.status}
                  </span>
                  {row.error_message && (
                    <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={row.error_message}>{row.error_message}</p>
                  )}
                </td>
                <td><ExecutionSummary summary={row.summary} total={row.total_count} /></td>
                <td className="max-w-xs truncate text-gray-500" title={row.recipient}>{row.recipient || '—'}</td>
                <td className="text-gray-400 text-xs">
                  {row.created_at ? formatDateTime(row.created_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-base-200 text-sm">
          <span className="text-gray-400">{total} envoi(s)</span>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => changePage(-1)}>Précédent</button>
            <span className="text-gray-500">Page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button className="btn btn-sm btn-ghost" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => changePage(1)}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function EmailTriggersPage() {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(null);   // panneau de config inline
  const [preview, setPreview] = useState(null);           // aperçu du template
  const [previewing, setPreviewing] = useState(null);     // clé du trigger en cours d'aperçu
  const [sending, setSending] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null);   // clé du trigger à confirmer
  const [historyKey, setHistoryKey] = useState('daily');  // onglet d'historique
  const historyTriggers = triggers.length ? triggers : [{ key: 'daily' }, { key: 'deadline' }, { key: 'dg' }, { key: 'rh' }];

  const refreshOverview = useCallback(async () => {
    try {
      setTriggers(await getEmailTriggersOverview());
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossible de charger les déclencheurs email');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEmailTriggersOverview()
      .then((data) => { if (!cancelled) setTriggers(data); })
      .catch((e) => { if (!cancelled) toast.error(e.response?.data?.detail || 'Impossible de charger les déclencheurs email'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSend = async (key) => {
    setConfirmSend(null);
    setSending(key);
    try {
      const result = await sendEmailTriggerNow(key);
      if (result.status === 'sent' || result.status === 'MANUAL') {
        toast.success(result.message || 'Envoi effectué');
      } else if (result.status === 'skipped') {
        toast(result.message || 'Envoi non nécessaire');
      } else {
        toast.error(result.message || 'Échec de l\'envoi');
      }
      await refreshOverview();
      setHistoryKey(key);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l\'envoi');
    } finally {
      setSending(null);
    }
  };

  const handlePreview = async (key) => {
    setPreviewing(key);
    try {
      setPreview(await previewEmailTrigger(key));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossible de générer l\'aperçu');
    } finally {
      setPreviewing(null);
    }
  };

  const confirmMeta = confirmSend ? TRIGGER_META[confirmSend] : null;

  if (loading) {
    return <div className="flex justify-center p-12"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Déclencheurs email</h1>
        <p className="text-sm text-gray-400">
          Configurez, surveillez et testez les emails automatiques de l'application :
          rappels de validation, échéances, synthèse DG et traitement RH.
        </p>
      </div>

      {/* Cartes déclencheurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {triggers.map((t) => (
          <TriggerCard
            key={t.key}
            trigger={t}
            onConfigure={(key) => setConfiguring(key)}
            onSend={(key) => setConfirmSend(key)}
            onPreview={handlePreview}
            sending={sending}
            previewing={previewing}
          />
        ))}
      </div>

      {/* Panneau de configuration inline */}
      {configuring && (
        <TriggerConfigPanel
          triggerKey={configuring}
          onClose={() => setConfiguring(null)}
          onSaved={refreshOverview}
        />
      )}

      {/* Historique unifié */}
      <div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-3 w-fit flex-wrap">
          {historyTriggers.map((t) => (
            <button
              key={t.key}
              onClick={() => setHistoryKey(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                historyKey === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${COLOR_CLASSES[TRIGGER_META[t.key].color].dot}`} />
              {TRIGGER_META[t.key].label}
            </button>
          ))}
        </div>
        {historyKey && <TriggerHistory key={historyKey} triggerKey={historyKey} />}
      </div>

      {/* Modal : confirmation d'envoi manuel */}
      <Modal open={!!confirmSend} onClose={() => setConfirmSend(null)} title={`Envoyer « ${confirmMeta?.label} » maintenant ?`} size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ExclamationIcon className="w-5 h-5" />
            </div>
            <p className="text-sm text-gray-600 pt-2">
              Les emails seront générés avec les données actuelles et envoyés immédiatement.
              Cette action est enregistrée dans l'historique comme envoi manuel.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmSend(null)}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={() => handleSend(confirmSend)} disabled={sending || !confirmSend}>
              {sending ? <span className="loading loading-spinner loading-xs" /> : <MailIcon className="w-4 h-4" />}
              Envoyer
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal : aperçu du template */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.subject || 'Aperçu'} size="xl">
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${preview.using_real_data ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                {preview.using_real_data ? 'Données réelles' : 'Jeu d\'exemple (aucune donnée en cours)'}
              </span>
              {preview.stats?.primes != null && <span className="text-gray-500">{preview.stats.primes} prime(s) concernée(s)</span>}
              {preview.stats?.destinataires != null && <span className="text-gray-500">{preview.stats.destinataires} destinataire(s)</span>}
            </div>
            <iframe
              title="Aperçu de l'email"
              sandbox=""
              srcDoc={preview.html}
              className="w-full rounded-lg border border-base-200 bg-white"
              style={{ height: 460 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
