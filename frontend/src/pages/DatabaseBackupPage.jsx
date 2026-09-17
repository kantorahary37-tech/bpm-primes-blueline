import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  createDatabaseDump,
  getDatabaseDumps,
  downloadDatabaseDump,
  restoreDatabaseDump,
  deleteDatabaseDump,
} from '../services/api';
import { ArchiveIcon, DownloadIcon, TrashIcon } from '../components/Icons';
import Modal from '../components/Modal';

const formatDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function DatabaseBackupPage() {
  const [dumps, setDumps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [label, setLabel] = useState('');

  const fetchData = async () => {
    try {
      const data = await getDatabaseDumps();
      setDumps(Array.isArray(data?.dumps) ? data.dumps : []);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des sauvegardes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createDatabaseDump(label.trim() || 'backup');
      toast.success(
        `Sauvegarde complète créée : ${result.filename} (${result.num_tables} table(s))`
      );
      setLabel('');
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la création de la sauvegarde');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (f) => {
    if (!window.confirm(
      `Restaurer la base ENTIÈRE depuis « ${f.filename} » ?\n\n` +
      `⚠️ ATTENTION : toutes les tables existantes seront supprimées puis recréées ` +
      `avec les données de cette sauvegarde. Cette opération est irréversible.`
    )) return;

    setRestoring(true);
    try {
      const result = await restoreDatabaseDump(f.filename);
      toast.success(
        `${result.message} — ${result.num_tables_created} table(s), ${result.num_rows_inserted} bloc(s) INSERT`
      );
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la restauration');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Supprimer la sauvegarde « ${f.filename} » ?`)) return;
    try {
      await deleteDatabaseDump(f.filename);
      toast.success('Sauvegarde supprimée');
      fetchData();
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sauvegardes complètes de la base</h2>
          <p className="text-sm text-gray-400">
            Dump SQL <strong>complet</strong> : schéma, données, relations (clés étrangères) et séquences
            de <strong>toutes</strong> les tables.
            <br />
            <span className="text-[11px] text-gray-300">
              Sauvegarde générée côté serveur dans le dossier <code className="font-mono">dumps/</code>.
            </span>
          </p>
        </div>
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

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : dumps.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-200">
          <ArchiveIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">Aucune sauvegarde complète</p>
          <p className="text-gray-300 text-xs mt-1">
            Créez une sauvegarde complète de la base pour pouvoir restaurer toutes les données plus tard.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {dumps.map((f) => (
            <div
              key={f.filename}
              className="flex items-center gap-4 px-5 py-3.5 bg-white border border-gray-200 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ArchiveIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm font-mono truncate">{f.filename}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {f.size_display} · {f.num_tables} table(s) · {f.num_inserts} bloc(s) INSERT ·{' '}
                  {formatDate(f.modified_at)}
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