import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import { getValidationAttachments, getValidationAttachmentServices, downloadFile, deleteValidationAttachment } from '../services/api';
import { PaperclipIcon, SearchIcon, DownloadIcon, EyeIcon, TrashIcon } from '../components/Icons';
import FilePreview from '../components/FilePreview';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmModal';

const PAGE_SIZE = 25;

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
// Années proposées : de l'année courante à 4 ans en arrière
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const SELECT_CLASS = 'px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30';

// Rôles qui consultent les pièces jointes (le backend applique le même filtre :
// un Directeur est restreint à son département)
const CAN_VIEW = ['is_admin', 'is_dg', 'is_drh', 'is_directeur'];
const FULL_SCOPE = ['is_admin', 'is_dg', 'is_drh'];

const STEP_LABEL = { N1: 'N+1', N2: 'N+2', DIRECTEUR: 'Directeur', DG: 'DG', DRH: 'DRH' };

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const AttachmentsPage = () => {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const { confirm, confirmElement } = useConfirm();

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dept, setDept] = useState('');
  const [service, setService] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [services, setServices] = useState([]);
  const [page, setPage] = useState(1);
  // Pièce jointe ouverte en aperçu dans l'application (sans téléchargement)
  const [preview, setPreview] = useState(null);

  const isFullScope = FULL_SCOPE.some(r => user?.[r]);
  const canView = CAN_VIEW.some(r => user?.[r]);

  const load = useCallback(async (params = {}) => {
    try {
      const data = await getValidationAttachments(params);
      setAttachments(data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Impossible de charger les pièces jointes');
    } finally {
      setLoading(false);
    }
  }, []);

  // Paramètres de filtrage communiqués à l'API
  const filterParams = useCallback(() => ({
    search: searchInput.trim() || undefined,
    department: dept || undefined,
    service: service || undefined,
    month: month || undefined,
    year: year || undefined,
  }), [searchInput, dept, service, month, year]);

  // Recharge avec les filtres courants (après une suppression)
  const reload = useCallback(() => { load(filterParams()); }, [load, filterParams]);

  const confirmDelete = async (att) => {
    const ok = await confirm({
      title: 'Supprimer la pièce jointe ?',
      message: `« ${att.original_name} » sera supprimé définitivement.`,
      details: ['Si le fichier est encore utilisé par une autre prime, seul ce dépôt est retiré.'],
      confirmText: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteValidationAttachment(att.id);
      toast.success('Pièce jointe supprimée');
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  // Chargement initial + recherche différée (une requête, pas une par frappe)
  useEffect(() => {
    if (!canView) return undefined;
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      load(filterParams());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filterParams, canView, load]);

  // Liste des services proposés par le filtre (une fois, au chargement)
  useEffect(() => {
    if (!canView) return;
    getValidationAttachmentServices()
      .then(list => setServices(list || []))
      .catch(() => setServices([]));
  }, [canView]);

  // Un Directeur n'a pas de filtre département : tout est déjà restreint côté API
  const visibleDepts = isFullScope ? departments : [];

  const filtered = attachments.filter(a =>
    !search || [a.original_name, a.employee_name, a.employee_matricule]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!canView) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">Accès réservé aux Directeurs, DG, DRH et administrateurs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Pièces jointes</h1>
        <p className="text-sm text-gray-400">
          {isFullScope
            ? 'Fichiers déposés par les validateurs (N+1 / N+2) à la validation des primes'
            : `Fichiers transmis par vos validateurs pour le département ${user?.department || ''}`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b bg-gray-50">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher par nom d'employé, matricule ou fichier…"
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
            />
          </div>
          {visibleDepts.length > 0 && (
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={SELECT_CLASS}>
              <option value="">Tous les départements</option>
              {visibleDepts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          )}
          <select value={service} onChange={(e) => setService(e.target.value)}
            className={`${SELECT_CLASS} min-w-[140px]`}>
            <option value="">Tous les services</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT_CLASS}>
            <option value="">Mois</option>
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={SELECT_CLASS}>
            <option value="">Année</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(searchInput || dept || service || month || year) && (
            <button
              onClick={() => { setSearchInput(''); setDept(''); setService(''); setMonth(''); setYear(''); }}
              className="btn btn-xs btn-ghost text-gray-500"
            >
              Réinitialiser
            </button>
          )}
          <span className="text-xs text-gray-400">{filtered.length} pièce(s)</span>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32"><span className="loading loading-spinner loading-md" /></div>
        ) : paginated.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <PaperclipIcon className="w-8 h-8 mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400 italic">Aucune pièce jointe pour le moment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm table-zebra w-full">
              <thead>
                <tr>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Fichier</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Département</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Déposé par</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Service</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Date</th>
                  <th className="w-16 text-center text-gray-500 font-medium text-xs uppercase tracking-wider">Voir</th>
                  <th className="w-24 text-center text-gray-500 font-medium text-xs uppercase tracking-wider">Télécharger</th>
                  <th className="w-16 text-center text-gray-500 font-medium text-xs uppercase tracking-wider">Supp</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(a => (
                  <tr key={a.id} className="hover">
                    <td>
                      <button onClick={() => setPreview(a)} title="Aperçu dans l'application"
                        className="flex items-center gap-2 min-w-0 text-left">
                        <PaperclipIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800 truncate hover:text-violet-700" title={a.original_name}>
                            {a.original_name}
                          </span>
                          <span className="block text-[11px] text-gray-400">
                            {formatSize(a.size)}
                            {a.employee_name ? ` · ${a.employee_name}` : ''}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="text-sm text-gray-500">{a.department || '—'}</td>
                    <td className="text-sm text-gray-500">
                      <div>{a.uploaded_by_name || '—'}</div>
                      {a.step && <div className="text-[11px] text-gray-400">étape {STEP_LABEL[a.step] || a.step}</div>}
                    </td>
                    <td className="text-sm text-gray-500">{a.uploaded_by_service || '—'}</td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">{formatDate(a.created_at)}</td>
                    <td className="text-center">
                      <button onClick={() => setPreview(a)}
                        className="p-1.5 rounded hover:bg-violet-50 text-gray-400 hover:text-violet-600"
                        title="Aperçu dans l'application">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="text-center">
                      <button onClick={() => downloadFile(a.url, a.original_name)}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                        title="Télécharger le fichier">
                        <DownloadIcon className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="text-center">
                      <button onClick={() => confirmDelete(a)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Supprimer cette pièce jointe">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="btn btn-xs btn-ghost disabled:opacity-40">Précédent</button>
            <span className="text-xs text-gray-500">Page {safePage} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="btn btn-xs btn-ghost disabled:opacity-40">Suivant</button>
          </div>
        )}
      </div>

      {/* Aperçu dans l'application : PDF et images sont lus directement ici,
          sans téléchargement. Les autres formats restent en simple téléchargement. */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.original_name || 'Aperçu'} size="xl">
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                Employé : <strong className="text-gray-700">{preview.employee_name || '—'}</strong>
                {preview.employee_matricule && ` (${preview.employee_matricule})`}
              </span>
              <span>Département : <strong className="text-gray-700">{preview.department || '—'}</strong></span>
              <span>
                Déposé par : <strong className="text-gray-700">{preview.uploaded_by_name || '—'}</strong>
                {preview.step && ` · étape ${STEP_LABEL[preview.step] || preview.step}`}
              </span>
              <span>Date : <strong className="text-gray-700">{formatDate(preview.created_at)}</strong></span>
              <span>{formatSize(preview.size)}</span>
            </div>

            <FilePreview file={{ original_name: preview.original_name, url: preview.url }} defaultExpanded />

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Link to={`/bonuses/${preview.bonus_id}`}
                className="btn btn-sm btn-ghost">Ouvrir la prime</Link>
              <button onClick={() => downloadFile(preview.url, preview.original_name)}
                className="btn btn-sm bg-violet-600 hover:bg-violet-700 text-white border-0">
                <DownloadIcon className="w-4 h-4" /> Télécharger
              </button>
            </div>
          </div>
        )}
      </Modal>

      {confirmElement}
    </div>
  );
};

export default AttachmentsPage;