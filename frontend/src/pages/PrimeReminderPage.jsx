import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { MailIcon, SettingsIcon, CalendarIcon, ClockIcon, CheckBadgeIcon, EyeIcon } from '../components/Icons';
import {
  getPrimeReminderConfig,
  updatePrimeReminderConfig,
  sendPrimeReminderNow,
  previewPrimeReminder,
  getPrimeReminderExecutions,
} from '../services/api';

const STATUS_BG = {
  SENT: 'bg-green-100 text-green-700',
  MANUAL: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SENDING: 'bg-purple-100 text-purple-700',
};

const STATUS_LABEL = {
  SENT: 'Envoyé (cron)',
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

export default function PrimeReminderPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('');
  const [hours, setHours] = useState('');
  const [recipient, setRecipient] = useState('');

  const [confirmSend, setConfirmSend] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [pageSize] = useState(10);

  const loadExecutions = useCallback(async () => {
    try {
      const params = { page, size: pageSize };
      if (statusFilter) params.status = statusFilter;
      const data = await getPrimeReminderExecutions(params);
      setHistory(data.items || []);
      setHistoryTotal(data.total || 0);
    } catch {
      // silencieux : le chargement principal affiche l'erreur
    }
  }, [page, statusFilter, pageSize]);

  const loadData = useCallback(async () => {
    try {
      const cfg = await getPrimeReminderConfig();
      setConfig(cfg);
      setEnabled(Boolean(cfg.enabled));
      setDays((cfg.days || []).join(', '));
      setHours((cfg.hours || []).join(', '));
      setRecipient(cfg.recipient_override || '');
      await loadExecutions();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossible de charger la configuration');
    } finally {
      setLoading(false);
    }
  }, [loadExecutions]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const daysList = days.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
      const hoursList = hours.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
      if (!daysList.length) return toast.error('Indiquez au moins un jour du mois');
      if (!hoursList.length) return toast.error('Indiquez au moins une heure');
      const updated = await updatePrimeReminderConfig({
        enabled,
        days: daysList,
        hours: hoursList,
        recipient: recipient.trim(),
      });
      setConfig(updated);
      toast.success('Configuration du rappel DG enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    setConfirmSend(false);
    try {
      const result = await sendPrimeReminderNow();
      if (result.status === 'sent') {
        toast.success(`Rappel envoyé (${result.execution?.total_count ?? 0} prime(s) en cours)`);
      } else {
        toast(result.message || 'Rappel non envoyé');
      }
      await loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l’envoi');
    } finally {
      setSending(false);
    }
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    try {
      const data = await previewPrimeReminder();
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossible de générer l’aperçu');
    } finally {
      setLoadingPreview(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  const last = config?.last_execution;
  const next = config?.next_execution;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Rappel DG des primes en cours</h1>
        <p className="text-sm text-gray-400">
          Résumé groupé (département / type de prime) envoyé automatiquement à la DG
          pour finaliser les validations. Aucune information nominative n'est incluse.
        </p>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-base-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <CalendarIcon className="w-4 h-4" /> Prochain envoi
          </div>
          <p className="font-semibold text-gray-900">{formatDateTime(next)}</p>
          <p className="text-xs text-gray-400 mt-1">
            Jours {days || '—'} à {hours || '—'}h (UTC{(config?.tz_offset ?? 3) >= 0 ? '+' : ''}{config?.tz_offset ?? 3})
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-base-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <ClockIcon className="w-4 h-4" /> Dernier envoi
          </div>
          <p className="font-semibold text-gray-900">
            {last ? `${formatDateTime(last.scheduled_for || last.sent_at)} · ${STATUS_LABEL[last.status] || last.status}` : 'Aucun envoi'}
          </p>
          <p className="text-xs text-gray-400 mt-1 truncate">{last?.recipient || '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-base-200 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <MailIcon className="w-4 h-4" /> Destinataires
          </div>
          <p className="font-semibold text-gray-900">
            {config?.recipient ? `${String(config.recipient).split(',').length} adresse(s)` : 'Aucun compte DG'}
          </p>
          <p className="text-xs text-gray-400 mt-1 truncate">{config?.recipient || 'Créez un compte DG (is_dg) ou définissez une surcharge'}</p>
        </div>
      </div>

      {/* Configuration form */}
      <div className="bg-white rounded-2xl border border-base-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-gray-400" /> Configuration du rappel
        </h2>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="font-medium text-gray-900">Activer le rappel DG</p>
            <p className="text-sm text-gray-400">Envoi automatique aux jours et heures configurés</p>
          </div>
          <input type="checkbox" className="toggle toggle-primary" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jours du mois</label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="15, 20"
            />
            <p className="text-xs text-gray-400 mt-1">Jours où le rappel est envoyé (séparés par des virgules).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Heures d'envoi</label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="8, 17"
            />
            <p className="text-xs text-gray-400 mt-1">Heures (0-23) dans la journée (séparées par des virgules).</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire(s) (surcharge)</label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Laissez vide pour utiliser le(s) compte(s) DG de l'application"
          />
          <p className="text-xs text-gray-400 mt-1">
            Emails séparés par des virgules. Vide = tous les comptes marqués DG (is_dg) non administrateurs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-sm"></span> : null}
            Enregistrer
          </button>
          <button className="btn btn-outline" onClick={handlePreview} disabled={loadingPreview}>
            {loadingPreview ? <span className="loading loading-spinner loading-sm"></span> : null}
            <EyeIcon className="w-4 h-4" /> Aperçu du template
          </button>
          <button className="btn btn-secondary" onClick={() => setConfirmSend(true)} disabled={sending}>
            {sending ? <span className="loading loading-spinner loading-sm"></span> : null}
            <MailIcon className="w-4 h-4" /> Envoyer maintenant
          </button>
        </div>
      </div>

      {/* Historique */}
      <div className="bg-white rounded-2xl border border-base-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-base-200">
          <h2 className="font-semibold text-gray-900">Historique des envois</h2>
          <div className="flex items-center gap-2">
            <select className="select select-sm select-bordered" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">Tous les statuts</option>
              <option value="SENT">Envoyé (cron)</option>
              <option value="MANUAL">Manuel</option>
              <option value="FAILED">Échec</option>
              <option value="PENDING">En attente</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="font-medium">Date</th>
                <th className="font-medium">Type</th>
                <th className="font-medium">Statut</th>
                <th className="font-medium">Primes</th>
                <th className="font-medium">Destinataires</th>
                <th className="font-medium">Détail</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    Aucun envoi enregistré pour le moment
                  </td>
                </tr>
              )}
              {history.map((row) => (
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
                    {row.error_message && <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={row.error_message}>{row.error_message}</p>}
                  </td>
                  <td className="font-semibold">{row.total_count}</td>
                  <td className="max-w-xs truncate text-gray-500">{row.recipient || '—'}</td>
                  <td>
                    {row.summary?.length ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-700">Voir le résumé</summary>
                        <ul className="mt-1 space-y-0.5 text-gray-500">
                          {row.summary.map((s, i) => (
                            <li key={i}>{s.department} / {s.bonus_type_label} : {s.count}</li>
                          ))}
                        </ul>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {historyTotal > pageSize && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-base-200 text-sm">
            <span className="text-gray-400">{historyTotal} envoi(s)</span>
            <div className="flex items-center gap-2">
              <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
              <span className="text-gray-500">Page {page} / {Math.max(1, Math.ceil(historyTotal / pageSize))}</span>
              <button className="btn btn-sm btn-ghost" disabled={page >= Math.ceil(historyTotal / pageSize)} onClick={() => setPage(page + 1)}>Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal : confirmation envoi manuel */}
      <Modal open={confirmSend} onClose={() => setConfirmSend(false)} title="Envoyer le rappel DG maintenant ?" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          Un email récapitulatif des primes encore en cours de validation sera envoyé aux destinataires
          ({config?.recipient || 'aucun compte DG'}). Cette action est enregistrée dans l'historique.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConfirmSend(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSendNow} disabled={sending}>
            {sending ? <span className="loading loading-spinner loading-sm"></span> : null}
            Envoyer
          </button>
        </div>
      </Modal>

      {/* Modal : aperçu du template */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.subject || 'Aperçu'} size="xl">
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckBadgeIcon className="w-4 h-4 text-green-500" />
              {preview.using_real_data
                ? `Résumé basé sur les ${preview.total_count} prime(s) en cours réelles.`
                : 'Aucune prime en cours — aperçu basé sur un jeu d’exemple représentatif.'}
            </div>
            <iframe
              title="Aperçu du rappel DG"
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