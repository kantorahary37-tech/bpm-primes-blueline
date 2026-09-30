import { useState, useEffect } from 'react';
import toast from '../utils/toast';
import {
  createDatabaseDump,
  getDatabaseDumps,
  downloadDatabaseDump,
  restoreDatabaseDump,
  deleteDatabaseDump,
  getBackupSchedule,
  bulkUpdateSystemConfig,
} from '../services/api';
import {
  ArchiveIcon, DownloadIcon, TrashIcon, ClockIcon, SettingsIcon,
  CheckIcon, DatabaseIcon, CalendarIcon,
} from '../components/Icons';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmModal';

const FORMAT = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

const formatDateTime = (d) => (d ? new Date(d).toLocaleString('fr-FR', FORMAT) : '—');

const formatDelay = (seconds) => {
  if (seconds == null) return '—';
  if (seconds < 60) return 'à tout moment';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `dans ${m} min`;
  return `dans ${h} h ${String(m).padStart(2, '0')}`;
};

// Paramètres déplacés depuis « Paramètres système » vers cette page
const BACKUP_KEYS = ['BACKUP_ENABLED', 'BACKUP_INTERVAL_HOURS', 'BACKUP_RETENTION', 'BACKUP_LABEL'];

// ── Carte « Sauvegarde automatique » ───────────────────────────────────────

function AutoBackupCard({ schedule, edits, onChange, onSave, onRunNow, saving, running }) {
  const value = (key) => (edits[key] !== undefined ? edits[key] : schedule[key] ?? '');
  const enabled = String(value('BACKUP_ENABLED')) === 'true';
  const dirty = BACKUP_KEYS.some((k) => edits[k] !== undefined && String(edits[k]) !== String(schedule[k] ?? ''));

  return (
    <div className="bg-white rounded-2xl border border-base-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-base-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ArchiveIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-900">Sauvegarde automatique de la base</h2>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                {enabled ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Dump SQL complet périodique (schéma, données, relations, séquences), conservé dans le dossier <code className="font-mono">dumps/</code>.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="text-sm text-gray-600">{enabled ? 'Activée' : 'Désactivée'}</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={enabled}
            onChange={(e) => onChange('BACKUP_ENABLED', e.target.checked ? 'true' : 'false')}
          />
        </label>
      </div>

      <div className="p-6 space-y-5">
        {/* État du planificateur */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-gray-50 border border-base-200 px-4 py-3">
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <ClockIcon className="w-3 h-3" /> Dernière sauvegarde
            </p>
            <p className="font-semibold text-gray-900 text-[13px] mt-0.5">{formatDateTime(schedule.last_backup_at)}</p>
            <p className="text-[11px] text-gray-400 font-mono truncate" title={schedule.last_backup || ''}>
              {schedule.last_backup || 'Aucune sauvegarde'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-base-200 px-4 py-3">
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" /> Prochaine sauvegarde
            </p>
            <p className="font-semibold text-gray-900 text-[13px] mt-0.5">
              {enabled ? formatDateTime(schedule.next_backup_at) : 'Désactivée'}
            </p>
            <p className="text-[11px] text-gray-400">
              {enabled ? formatDelay(schedule.delay_seconds) : 'Aucune exécution planifiée'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-base-200 px-4 py-3">
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <SettingsIcon className="w-3 h-3" /> Planificateur
            </p>
            <p className="mt-0.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${schedule.scheduler_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${schedule.scheduler_active ? 'bg-green-500' : 'bg-red-500'}`} />
                {schedule.scheduler_active ? 'Actif' : 'Arrêté'}
              </span>
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {schedule.scheduler_active
                ? 'Boucle tournant dans le processus backend'
                : 'Redémarrez le serveur pour relancer la boucle'}
            </p>
          </div>
        </div>

        {/* Paramètres */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intervalle</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.25"
                step="0.25"
                className="input input-bordered input-sm w-24"
                value={value('BACKUP_INTERVAL_HOURS')}
                onChange={(e) => onChange('BACKUP_INTERVAL_HOURS', e.target.value)}
              />
              <span className="text-sm text-gray-400">heure(s)</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sauvegardes conservées</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                className="input input-bordered input-sm w-24"
                value={value('BACKUP_RETENTION')}
                onChange={(e) => onChange('BACKUP_RETENTION', e.target.value)}
              />
              <span className="text-sm text-gray-400">fichier(s) les plus récents</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Libellé des sauvegardes</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              value={value('BACKUP_LABEL')}
              onChange={(e) => onChange('BACKUP_LABEL', e.target.value)}
              placeholder="auto"
            />
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-base-200 px-4 py-3 text-xs text-gray-500">
          À chaque exécution, un fichier <span className="font-mono">AAAAJJJJ_HHMMSS_&lt;libellé&gt;.sql</span> est écrit puis les
          sauvegardes les plus anciennes sont supprimées au-delà du nombre conservé.
          Les changements sont appliqués immédiatement, sans redémarrage.
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-base-200">
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? <span className="loading loading-spinner loading-sm" /> : <CheckIcon className="w-4 h-4" />}
            Enregistrer
          </button>
          <span className="text-xs text-gray-400">
            Prochaine sauvegarde&nbsp;:{' '}
            <span className="font-medium text-gray-600">
              {enabled
                ? `${formatDateTime(schedule.next_backup_at)} (${formatDelay(schedule.delay_seconds)})`
                : 'désactivée'}
            </span>
          </span>
          <button
            className="btn btn-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 gap-1.5 ml-auto"
            onClick={onRunNow}
            disabled={running}
            title="Exécuter immédiatement une sauvegarde automatique"
          >
            {running ? <span className="loading loading-spinner loading-xs" /> : <DatabaseIcon className="w-4 h-4" />}
            Sauvegarder maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DatabaseBackupPage() {
  const { confirm, confirmElement } = useConfirm();
  const [schedule, setSchedule] = useState(null);
  const [edits, setEdits] = useState({});
  const [dumps, setDumps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [label, setLabel] = useState('');

  const fetchSchedule = async () => {
    try {
      setSchedule(await getBackupSchedule());
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement de la planification des sauvegardes');
    }
  };

  const fetchDumps = async () => {
    try {
      const data = await getDatabaseDumps();
      setDumps(Array.isArray(data?.dumps) ? data.dumps : []);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des sauvegardes');
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBackupSchedule(), getDatabaseDumps()])
      .then(([scheduleData, dumpsData]) => {
        if (cancelled) return;
        setSchedule(scheduleData);
        setDumps(Array.isArray(dumpsData?.dumps) ? dumpsData.dumps : []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Erreur lors du chargement des sauvegardes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (key, val) => setEdits((prev) => ({ ...prev, [key]: val }));

  const handleSaveSchedule = async () => {
    const settings = {};
    for (const key of BACKUP_KEYS) {
      if (edits[key] !== undefined && String(edits[key]) !== String(schedule[key] ?? '')) {
        settings[key] = String(edits[key]);
      }
    }
    if (!Object.keys(settings).length) return;
    setSaving(true);
    try {
      await bulkUpdateSystemConfig(settings);
      setEdits({});
      toast.success('Planification des sauvegardes enregistrée');
      await fetchSchedule();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await createDatabaseDump(schedule?.BACKUP_LABEL?.trim() || 'auto');
      toast.success(`Sauvegarde créée : ${result.filename}`);
      await Promise.all([fetchSchedule(), fetchDumps()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally {
      setRunning(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createDatabaseDump(label.trim() || 'backup');
      toast.success(
        `Sauvegarde complète créée : ${result.filename} (${result.num_tables} table(s))`
      );
      setLabel('');
      setShowCreateModal(false);
      await Promise.all([fetchSchedule(), fetchDumps()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la création de la sauvegarde');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (f) => {
    const ok = await confirm({
      title: 'Restaurer toute la base',
      message: `Restaurer la base ENTIÈRE depuis « ${f.filename} » ?`,
      details: [
        '⚠️ ATTENTION : toutes les tables existantes seront supprimées puis recréées avec les données de cette sauvegarde.',
        'Cette opération est irréversible.',
      ],
      confirmText: 'Restaurer',
      tone: 'danger',
    });
    if (!ok) return;

    setRestoring(true);
    try {
      const result = await restoreDatabaseDump(f.filename);
      toast.success(
        `${result.message} — ${result.num_tables_created} table(s), ${result.num_rows_inserted} bloc(s) INSERT`
      );
      await Promise.all([fetchSchedule(), fetchDumps()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la restauration');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (f) => {
    const ok = await confirm({
      title: 'Supprimer la sauvegarde',
      message: `Supprimer la sauvegarde « ${f.filename} » ?`,
      details: ['Cette action est définitive.'],
      confirmText: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDatabaseDump(f.filename);
      toast.success('Sauvegarde supprimée');
      await Promise.all([fetchSchedule(), fetchDumps()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const downloadFile = async (filename) => {
    try {
      const blob = await downloadDatabaseDump(filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors du téléchargement');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmElement}

      <div>
        <h1 className="text-xl font-bold text-gray-900">Sauvegardes complètes de la base</h1>
        <p className="text-sm text-gray-400">
          Dump SQL <strong>complet</strong> : schéma, données, relations (clés étrangères) et séquences de{' '}
          <strong>toutes</strong> les tables — automatique ou à la demande.
        </p>
      </div>

      {/* Sauvegarde automatique */}
      {schedule && (
        <AutoBackupCard
          schedule={schedule}
          edits={edits}
          onChange={handleChange}
          onSave={handleSaveSchedule}
          onRunNow={handleRunNow}
          saving={saving}
          running={running}
        />
      )}

      {/* Historique des sauvegardes */}
      <div className="bg-white rounded-2xl border border-base-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-base-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ArchiveIcon className="w-4 h-4 text-gray-400" />
            Sauvegardes disponibles
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
              {dumps.length}
            </span>
          </h2>
          <button
            onClick={() => {
              setLabel(`backup ${new Date().toLocaleDateString('fr-FR')}`);
              setShowCreateModal(true);
            }}
            className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5"
          >
            <ArchiveIcon className="w-4 h-4" />
            Sauvegarder toute la base
          </button>
        </div>

        {dumps.length === 0 ? (
          <div className="text-center py-16">
            <ArchiveIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Aucune sauvegarde complète</p>
            <p className="text-gray-300 text-xs mt-1">
              Créez une sauvegarde complète de la base pour pouvoir restaurer toutes les données plus tard.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-base-200">
            {dumps.map((f) => (
              <div key={f.filename} className="flex flex-wrap items-center gap-4 px-6 py-3.5 hover:bg-gray-50/70 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <ArchiveIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <p className="font-medium text-gray-900 text-sm font-mono truncate">{f.filename}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {f.size_display} · {f.num_tables} table(s) · {f.num_inserts} bloc(s) INSERT ·{' '}
                    {formatDateTime(f.modified_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => downloadFile(f.filename)}
                    className="btn btn-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 gap-1"
                    title="Télécharger le fichier SQL"
                  >
                    <DownloadIcon className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleRestore(f)}
                    disabled={restoring}
                    className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1"
                    title="Restaurer la base entière depuis ce dump"
                  >
                    {restoring ? <span className="loading loading-spinner loading-xs" /> : 'Restaurer'}
                  </button>
                  <button
                    onClick={() => handleDelete(f)}
                    className="btn btn-xs bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Sauvegarder toute la base" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Génère un fichier SQL <strong>complet</strong> avec :
          </p>
          <ul className="space-y-1.5 text-xs text-gray-600">
            <li>✅ Création de toutes les tables (schéma)</li>
            <li>✅ Contraintes (clés primaires, uniques, étrangères)</li>
            <li>✅ Toutes les données de toutes les tables</li>
            <li>✅ Séquences (auto-incrémentation) remises à jour</li>
          </ul>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-[11px] text-amber-700 font-medium">
              ⚠️ La restauration supprime les tables existantes avant de réinsérer les données.
            </p>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Libellé (optionnel)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : backup 17/09/2026"
              className="input input-bordered w-full"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setShowCreateModal(false)} className="btn btn-sm btn-ghost">
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {creating ? <span className="loading loading-spinner loading-xs" /> : <ArchiveIcon className="w-4 h-4" />}
              Sauvegarder
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
