import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  getConfigSnapshots,
  getConfigSnapshot,
  createConfigSnapshot,
  restoreConfigSnapshot,
  deleteConfigSnapshot,
  restoreFromSqlFile,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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

export default function ConfigSnapshotPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [sqlFiles, setSqlFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [detailSnapshot, setDetailSnapshot] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getConfigSnapshots();
      setSnapshots(Array.isArray(data?.snapshots) ? data.snapshots : []);
      setSqlFiles(Array.isArray(data?.files) ? data.files : []);
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

  const handleSave = async () => {
    const label = saveLabel.trim();
    if (!label) {
      toast.error('Veuillez saisir un nom pour la sauvegarde');
      return;
    }
    setSaving(true);
    try {
      const result = await createConfigSnapshot(label);
      toast.success(
        `Sauvegardé : ${result.employee_count} employé(s) — fichier ${result.sql_file} créé`
      );
      setSaveLabel('');
      setShowSaveModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDetail = async (snapshotId) => {
    setDetailLoading(true);
    try {
      const data = await getConfigSnapshot(snapshotId);
      setDetailSnapshot(data);
    } catch (err) {
      toast.error('Erreur lors du chargement de la sauvegarde');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRestore = async (snapshot) => {
    if (!window.confirm(
      `Restaurer la configuration « ${snapshot.label} » ?\n\n` +
      `Cela remplacera les affectations actuelles de ${snapshot.employee_count} employé(s) ` +
      `par celles enregistrées dans cette sauvegarde.`
    )) return;

    setRestoring(true);
    try {
      const result = await restoreConfigSnapshot(snapshot.id);
      toast.success(
        `Configuration restaurée : ${result.restored} employé(s) mis à jour` +
        (result.skipped > 0 ? `, ${result.skipped} ignoré(s)` : '')
      );
      setDetailSnapshot(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la restauration');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (snapshot) => {
    if (!window.confirm(`Supprimer la sauvegarde « ${snapshot.label} » ?`)) return;
    try {
      await deleteConfigSnapshot(snapshot.id);
      toast.success('Sauvegarde supprimée');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const downloadFile = (filename) => {
    const token = localStorage.getItem('token');
    fetch(`/api/v1/admin/config-snapshots/files/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Erreur téléchargement');
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error('Erreur lors du téléchargement'));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Affectations employés</h2>
          <p className="text-sm text-gray-400">
            Sauvegardez et restaurez les départements et services de tous les employés.
            <br />
            <span className="text-[11px] text-gray-300">
              Chaque sauvegarde est enregistrée en base <strong>et</strong> en fichier SQL sur le disque.
            </span>
          </p>
        </div>
        <button
          onClick={() => {
            setSaveLabel(`Sauvegarde ${new Date().toLocaleDateString('fr-FR')}`);
            setShowSaveModal(true);
          }}
          className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5"
        >
          <ArchiveIcon className="w-4 h-4" />
          Sauvegarder l'état actuel
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : snapshots.length === 0 && sqlFiles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-200">
          <ArchiveIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">Aucune sauvegarde</p>
          <p className="text-gray-300 text-xs mt-1">
            Créez votre première sauvegarde pour pouvoir restaurer les affectations plus tard.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* === Database snapshots === */}
          {snapshots.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-gray-700">En base de données</h3>
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {snapshots.length}
                </span>
              </div>
              <div className="space-y-2">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="flex items-center gap-4 px-5 py-3.5 bg-white border border-gray-200 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <ArchiveIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{snap.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {snap.employee_count} employé(s) · {formatDate(snap.created_at)}
                        {snap.created_by_name && ` · ${snap.created_by_name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleDetail(snap.id)}
                        className="btn btn-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600"
                        title="Voir le détail"
                      >
                        <DownloadIcon className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRestore(snap)}
                        disabled={restoring}
                        className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                      >
                        {restoring ? <span className="loading loading-spinner loading-xs" /> : 'Restaurer'}
                      </button>
                      <button
                        onClick={() => handleDelete(snap)}
                        className="btn btn-xs bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Supprimer"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === SQL files on disk === */}
          {sqlFiles.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-gray-700">Fichiers SQL sur le disque</h3>
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {sqlFiles.length}
                </span>
              </div>
              <div className="space-y-2">
                {sqlFiles.map((f) => (
                  <div
                    key={f.filename}
                    className="flex items-center gap-4 px-5 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <ArchiveIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm font-mono truncate">
                        {f.filename}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {f.size_display} · Backup fichier
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFile(f.filename)}
                      className="btn btn-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 gap-1"
                      title="Télécharger le fichier SQL"
                    >
                      <DownloadIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(
                          `Restaurer depuis le fichier « ${f.filename} » ?\n\n` +
                          `Cela exécutera le fichier SQL et remplacera les affectations actuelles.`
                        )) return;
                        setRestoring(true);
                        try {
                          const result = await restoreFromSqlFile(f.filename);
                          toast.success(
                            `${result.message} — ${result.employees_affected} employé(s) affecté(s)`
                          );
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Erreur lors de la restauration');
                        } finally {
                          setRestoring(false);
                        }
                      }}
                      disabled={restoring}
                      className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1"
                      title="Restaurer depuis ce fichier SQL"
                    >
                      {restoring ? <span className="loading loading-spinner loading-xs" /> : 'Restaurer'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save modal */}
      <Modal open={showSaveModal} onClose={() => setShowSaveModal(false)} title="Sauvegarder l'état actuel" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Crée une sauvegarde <strong>en base</strong> + <strong>fichier SQL</strong> de l'état actuel des
            départements et services de tous les employés actifs.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-[11px] text-blue-700 font-medium">
              💡 Le fichier SQL est sauvegardé sur le disque et reste disponible même si la base est supprimée.
            </p>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Nom de la sauvegarde</span>
            </label>
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder="Ex : Avant réorganisation Janvier 2026"
              className="input input-bordered w-full"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setShowSaveModal(false)} className="btn btn-sm btn-ghost">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : <ArchiveIcon className="w-4 h-4" />}
              Sauvegarder (DB + fichier)
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail / preview modal */}
      <Modal
        open={!!detailSnapshot}
        onClose={() => setDetailSnapshot(null)}
        title={detailSnapshot ? `Sauvegarde : ${detailSnapshot.label}` : ''}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : detailSnapshot ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{detailSnapshot.employee_count} employé(s)</span>
              <span>{formatDate(detailSnapshot.created_at)}</span>
            </div>

            {(() => {
              const grouped = {};
              (detailSnapshot.snapshot_data || []).forEach((entry) => {
                const dept = entry.department || 'Sans département';
                if (!grouped[dept]) grouped[dept] = [];
                grouped[dept].push(entry);
              });
              return Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dept, entries]) => (
                  <div key={dept}>
                    <div className="px-3 py-1.5 bg-gray-100 rounded-t-lg border border-gray-200 border-b-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{dept}</span>
                      <span className="text-[10px] font-medium text-gray-400 ml-2">{entries.length}</span>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-b-lg divide-y divide-gray-50">
                      {entries.map((e) => (
                        <div key={e.employee_id} className="flex items-center gap-3 px-3 py-2">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {e.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{e.name}</p>
                            <p className="text-[10px] text-gray-400">{e.matricule}</p>
                          </div>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                            {e.service_group_name || 'Sans service'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
            })()}

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => handleRestore(detailSnapshot)}
                disabled={restoring}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              >
                {restoring ? <span className="loading loading-spinner loading-xs" /> : 'Restaurer cette configuration'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
