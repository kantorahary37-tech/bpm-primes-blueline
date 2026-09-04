import { useEffect, useState, useMemo, useCallback } from 'react';
import { getBonuses, getUsers, validateBonus, batchValidateBonuses, markBonusesPaid } from '../services/api';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import toast from 'react-hot-toast';
import { DownloadIcon, FilterIcon, ChevronLeftIcon } from '../components/Icons';
import Modal from '../components/Modal';
import BonusTable from '../components/BonusTable';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const EXPORT_COLUMNS_LIST = [
  "Matricule", "Nom", "Departement", "TypePrime",
  "DateDebut", "DateFin", "Montant total", "Montant Autres", "Montant Evaluation", "Statut",
  "DejaRejete", "CreePar", "DateCreation", "Descriptions",
]

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

const ALL_STATUSES = ['Initialisé', 'En attente Directeur', 'En attente DG', 'Prime validée', 'Prime rejetée'];

// Statuts visibles/filtrables par rôle — chaque validateur ne voit que son flux :
// Directeur : En attente Directeur · DRH : Prime validée · N+1 : Initialisé · DG : En attente DG · Admin : tous
const roleStatuses = (user) => {
  if (!user) return [];
  if (user.is_admin) return ALL_STATUSES;
  if (user.is_dg) return ['En attente DG'];
  if (user.is_drh) return ['Prime validée'];
  if (user.is_directeur) return ['En attente Directeur'];
  if (user.is_validator_n1) return ['Initialisé'];
  return [];
};

const BonusesList = () => {
  const { user } = useAuth();
  const { canSeeAmounts } = useSystemConfig();
  const seeAmounts = canSeeAmounts(user);
  const navigate = useNavigate();
  const location = useLocation();
  const [bonuses, setBonuses] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'status' || v === 'date' || v === 'department' ? v : 'date';
  });
const [typeFilter, setTypeFilter] = useState('');
const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || '');
const [searchQuery, setSearchQuery] = useState('');
const [depFilter, setDepFilter] = useState(() => new URLSearchParams(window.location.search).get('department') || '');
const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmBonus, setConfirmBonus] = useState(null);
  const [payConfirm, setPayConfirm] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportColumns, setExportColumns] = useState(EXPORT_COLUMNS_LIST);
  const [selectedBonuses, setSelectedBonuses] = useState(new Set());
  const [batchReject, setBatchReject] = useState(null);
  const [paying, setPaying] = useState(false);
  const [datePage, setDatePage] = useState(1);
  const [sectionExpand, setSectionExpand] = useState({});
  const [initiatorMap, setInitiatorMap] = useState(new Map());
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');

  const { departments: allDepartments } = useDepartments();

  useEffect(() => {
    getUsers()
      .then((users) => setInitiatorMap(new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u.name]))))
      .catch(() => setInitiatorMap(new Map()));
  }, []);

  useEffect(() => {
    // Statut par défaut du rôle (un seul statut autorisé hors admin)
    if (!new URLSearchParams(window.location.search).get('status')) {
      const allowed = roleStatuses(user);
      if (user?.is_admin) setStatusFilter('');
      else if (allowed.length === 1) setStatusFilter(allowed[0]);
    }
  }, [user?.is_admin, user?.is_dg, user?.is_drh, user?.is_directeur, user?.is_validator_n1]);

  // Paramètres de filtrage/tri/recherche envoyés au backend
  const queryParams = useMemo(() => {
    let startDate = null;
    let endDate = null;
    if (filterYear) {
      if (filterMonth) {
        startDate = `${filterYear}-${filterMonth}-01`;
        const lastDay = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate();
        endDate = `${filterYear}-${filterMonth}-${String(lastDay).padStart(2, '0')}`;
      } else {
        startDate = `${filterYear}-01-01`;
        endDate = `${filterYear}-12-31`;
      }
    }
    return {
      status: statusFilter === 'Prime rejetée' ? null : statusFilter,
      wasRejected: statusFilter === 'Prime rejetée' ? true : undefined,
      bonusType: typeFilter,
      department: depFilter,
      search: searchQuery,
      startDate,
      endDate,
      sortBy,
      sortDir,
    };
  }, [statusFilter, typeFilter, depFilter, searchQuery, filterMonth, filterYear, sortBy, sortDir]);

  const fetchBonuses = useCallback(async (params) => {
    try {
      const data = await getBonuses(
        params.status,
        null,
        params.bonusType,
        params.startDate,
        params.endDate,
        false,
        false,
        false,
        {
          search: params.search,
          department: params.department,
          wasRejected: params.wasRejected,
          sortBy: params.sortBy,
          sortDir: params.sortDir,
        }
      );
      setBonuses(data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBonuses(queryParams);
  }, [queryParams, fetchBonuses]);

  // Mise à jour du tri côté backend (refetch automatique via queryParams)
  const handleTableSort = useCallback((key) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  useEffect(() => {
    if (location.state?.success) {
      toast.success(location.state.success);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => { setDatePage(1); }, [typeFilter, statusFilter, searchQuery, depFilter, filterMonth, filterYear]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (depFilter) params.set('department', depFilter);
    if (viewMode !== 'date') params.set('view', viewMode);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [typeFilter, statusFilter, depFilter, viewMode]);

  const handleValidate = async (bonusId, step) => {
    setConfirmBonus({ bonusId, step });
  };

  const confirmValidate = async () => {
    if (!confirmBonus) return;
    try {
      await validateBonus(confirmBonus.bonusId, { action: 'VALIDER' }, confirmBonus.step);
      toast.success('Prime validée avec succès !');
      setConfirmBonus(null);
      fetchBonuses(queryParams);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la validation");
      setConfirmBonus(null);
    }
  };

  const confirmBatchValidate = async () => {
    const step = getCommonStep();
    if (!step) return;
    const ids = [...selectedBonuses];
    try {
      const res = await batchValidateBonuses(ids, 'VALIDER', step);
      toast.success(`${res.total_success} prime(s) validée(s)${res.total_errors > 0 ? `, ${res.total_errors} erreur(s)` : ''}`);
      clearSelection();
      setConfirmBonus(null);
      fetchBonuses(queryParams);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la validation par lot");
      setConfirmBonus(null);
    }
  };

  const confirmBatchReject = async () => {
    const step = getCommonStep();
    if (!step) return;
    const ids = [...selectedBonuses];
    try {
      const res = await batchValidateBonuses(ids, 'REJETER', step, batchReject);
      toast.success(`${res.total_success} prime(s) rejetée(s)${res.total_errors > 0 ? `, ${res.total_errors} erreur(s)` : ''}`);
      clearSelection();
      setBatchReject(null);
      fetchBonuses(queryParams);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors du rejet par lot");
      setBatchReject(null);
    }
  };

  const getValidStep = (bonus) => {
    if (!user) return null;
    if (user.is_validator_n1 && bonus.status === 'Initialisé') return 'N1';
    if (user.is_directeur && bonus.status === 'En attente Directeur') return 'DIRECTEUR';
    if (user.is_dg && bonus.status === 'En attente DG') return 'DG';
    return null;
  };

  const statusLabel = (bonus) => {
    if (!bonus) return '';
    return bonus.status;
  };

  const getBadgeClass = (status) => {
    const map = {
      'Initialisé': 'bg-orange-100 text-orange-700',
      'En attente Directeur': 'bg-purple-100 text-purple-700',
      'En attente DG': 'bg-amber-100 text-amber-700',
      'Prime validée': 'bg-emerald-100 text-emerald-700',
      'Prime rejetée': 'bg-red-100 text-red-700',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };

  const sections = useMemo(() => {
    if (!user) return [];

    if (user.is_drh) {
      return [
        { key: 'validated', title: 'Validées', highlight: false, filter: (b) => b.status === 'Prime validée' || b.status === 'Validé' },
      ];
    }

    const myStatuses = [];
    if (user.is_validator_n1) myStatuses.push('Initialisé');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');

    const base = [
      { key: 'initialised', title: 'Initialisées', highlight: false, filter: (b) => b.status === 'Initialisé' },
      { key: 'pendingDirector', title: 'En attente Directeur', highlight: false, filter: (b) => b.status === 'En attente Directeur' },
      { key: 'pendingDG', title: 'En attente DG', highlight: false, filter: (b) => b.status === 'En attente DG' },
      { key: 'validated', title: 'Validées', highlight: false, filter: (b) => b.status === 'Prime validée' || b.status === 'Validé' },
    ];

    const order = ['initialised', 'pendingDirector', 'pendingDG', 'validated'];

    const map = new Map(base.map((s) => [s.key, s]));
    return order.map((key) => map.get(key)).filter(Boolean);
  }, [user]);

  // Les filtres/tri/recherche sont appliqués côté backend : on affiche directement la liste renvoyée
  const filteredBonuses = bonuses;

  // Options de statut : limitées aux statuts que le rôle est autorisé à voir
  const statusOptions = useMemo(() => roleStatuses(user), [user]);

  const statusOptionLabel = (s) => {
    const map = {
      'Prime validée': 'Validée',
      'Prime rejetée': 'Rejetée',
      'En attente Directeur': 'En attente Directeur',
      'En attente DG': 'En attente DG',
    };
    return map[s] || s;
  };

  const departments = useMemo(() => {
    const names = (Array.isArray(allDepartments) ? allDepartments : []).map((d) => d.name).filter(Boolean);
    const fromData = [...new Set(bonuses.map((b) => b.employee?.department).filter(Boolean))];
    const merged = new Set([...names, ...fromData]);
    return [...merged].sort();
  }, [allDepartments, bonuses]);

  const grouped = useMemo(() => {
    const result = {};
    for (const s of sections) {
      result[s.key] = bonuses.filter(s.filter);
    }
    return result;
  }, [bonuses, sections]);

  const monthGroups = useMemo(() => {
    const groups = {}
    bonuses.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu'
      if (!groups[ym]) groups[ym] = []
      groups[ym].push(b)
    })
    return Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-')
      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      return { ym, monthName, bonuses: groups[ym] }
    })
  }, [bonuses]);

  const deptGroups = useMemo(() => {
    const groups = {};
    bonuses.forEach(b => {
      const d = b.employee?.department || 'N/A';
      if (!groups[d]) groups[d] = [];
      groups[d].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([dept, items]) => ({ dept, items }));
  }, [bonuses]);

  const canSelect = (bonus) => {
    const step = getValidStep(bonus);
    if (step) return true;
    if (user?.is_drh && bonus.status === 'Prime validée') return true;
    return false;
  };

  const toggleSelect = (id) => {
    const bonus = bonuses.find(b => b.id === id);
    if (bonus && !canSelect(bonus)) return;
    setSelectedBonuses(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = filteredBonuses.filter(b => canSelect(b)).map(b => b.id);
    setSelectedBonuses(new Set(ids));
  };

  const selectSection = (sectionBonuses) => {
    setSelectedBonuses(prev => {
      const next = new Set(prev);
      sectionBonuses.filter(b => canSelect(b)).forEach(b => next.add(b.id));
      return next;
    });
  };

  const deselectSection = (sectionBonuses) => {
    setSelectedBonuses(prev => {
      const next = new Set(prev);
      sectionBonuses.forEach(b => next.delete(b.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedBonuses(new Set());

  const validatedCount = useMemo(() => bonuses.filter(b => b.status === 'Prime validée').length, [bonuses]);

  const getCommonStep = useCallback(() => {
    const ids = [...selectedBonuses];
    if (ids.length === 0) return null;
    const bonusesInView = filteredBonuses.filter(b => ids.includes(b.id));
    if (bonusesInView.length === 0) return null;
    const steps = bonusesInView.map(b => getValidStep(b)).filter(Boolean);
    const unique = [...new Set(steps)];
    return unique.length === 1 ? unique[0] : null;
  }, [selectedBonuses, filteredBonuses]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Primes</h1>
        <div className="flex gap-2">
          <Link to="/bonuses/new" className="btn bg-blue-600 hover:bg-blue-700 text-white border-0">Nouvelle Prime</Link>
          {(user?.is_admin || user?.is_drh) && (
            <button onClick={() => {
              const token = localStorage.getItem('token')
              fetch(`/api/v1/bonuses/export?status=Prime%20valid%C3%A9e&columns=${EXPORT_COLUMNS_LIST.join(',')}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.blob())
                .then(blob => {
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `export_validees_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                })
            }}
              className="btn bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2"
              title="Export rapide de toutes les primes validées"
            >
              <DownloadIcon className="w-4 h-4" />
              Export validées
              <span className="badge badge-sm bg-white/20 text-white font-bold">{validatedCount}</span>
            </button>
          )}
          <button onClick={() => {
            setExportColumns(EXPORT_COLUMNS_LIST)
            setShowExportModal(true)
          }}
            className="btn btn-outline btn-success"
          >
            <DownloadIcon className="w-4 h-4" />
            Exporter Excel
          </button>
          {/* <button onClick={() => {
            const token = localStorage.getItem('token')
            fetch('/api/v1/bonuses/export/sage', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'export_sage_paie.csv'
                a.click()
                URL.revokeObjectURL(url)
              })
          }}
            className="btn btn-outline btn-success"
          >
            <DownloadIcon className="w-4 h-4" />
            Export SAGE
          </button> */}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
        <FilterIcon className="w-4 h-4 text-gray-400 ml-1" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Tous types</option>
          <option value="mensuel">Mensuelle</option>
          <option value="astreinte">Astreinte</option>
          <option value="commission">Commission</option>
        </select>
        {/* Filtre statut : limité aux statuts autorisés du rôle */}
        {statusOptions.length > 0 && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">Tous statuts</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{statusOptionLabel(s)}</option>
            ))}
          </select>
        )}
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un employé..."
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-48" />
        {/* Filtre département : visible uniquement pour DG, DRH et Admin */}
        {(user?.is_dg || user?.is_drh || user?.is_admin) && (
          <select value={depFilter} onChange={(e) => setDepFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">Tous départements</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Mois</option>
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Année</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(typeFilter || statusFilter || searchQuery || depFilter || filterMonth || filterYear) && (
          <button onClick={() => { setTypeFilter(''); setStatusFilter(''); setSearchQuery(''); setDepFilter(''); setFilterMonth(''); setFilterYear(''); }}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            Réinitialiser
          </button>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={() => setViewMode('status')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'status' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Statut
          </button>
          <button onClick={() => setViewMode('date')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'date' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Date
          </button>
          {(user?.is_dg || user?.is_drh || user?.is_directeur || user?.is_admin) && (
            <button onClick={() => setViewMode('department')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'department' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Département
            </button>
          )}
        </div>
      </div>

      {depFilter && filteredBonuses.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-700">{depFilter}</span>
          <span className="text-sm font-bold text-blue-700">
            Total : {seeAmounts ? `${filteredBonuses.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0).toLocaleString('fr-FR')} Ar` : '••••••'}
          </span>
          <span className="text-xs text-blue-500">{filteredBonuses.length} prime(s)</span>
        </div>
      )}
      {filteredBonuses.length === 0 ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
          <DownloadIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Aucune prime trouvée</p>
          <p className="text-sm text-gray-400 mt-1">Aucune prime ne correspond aux filtres appliqués</p>
          {(typeFilter || statusFilter || searchQuery || depFilter || filterMonth || filterYear) && (
            <button onClick={() => { setTypeFilter(''); setStatusFilter(''); setSearchQuery(''); setDepFilter(''); setFilterMonth(''); setFilterYear(''); }}
              className="btn btn-sm btn-ghost mt-4 text-blue-600">
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : viewMode === 'department' ? deptGroups.map(({ dept, items }) => (
        <div key={dept} className="mb-6">
          <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
            <h2 className="font-semibold text-sm">{dept}</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
            <span className="text-sm font-bold text-blue-600 ml-1">
              {seeAmounts ? `${items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0).toLocaleString('fr-FR')} Ar` : '••••••'}
            </span>
            <div className="flex gap-1 ml-auto">
              {items.some(b => canSelect(b)) && (
                <button onClick={() => {
                  const selectable = items.filter(b => canSelect(b));
                  const allSelected = selectable.every(b => selectedBonuses.has(b.id));
                  setSelectedBonuses(prev => {
                    const next = new Set(prev);
                    if (allSelected) {
                      selectable.forEach(b => next.delete(b.id));
                    } else {
                      selectable.forEach(b => next.add(b.id));
                    }
                    return next;
                  });
                }}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors">
                  {items.filter(b => canSelect(b)).every(b => selectedBonuses.has(b.id)) ? 'Désélectionner' : 'Tout sélectionner'}
                </button>
              )}
              {user?.is_drh && items.some(b => b.status === 'Prime validée') && (
                <button onClick={() => {
                  const ids = items.filter(b => b.status === 'Prime validée').map(b => b.id);
                  setPayConfirm({ type: 'batch', ids, count: ids.length });
                }}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">
                  Traiter {dept} ({items.filter(b => b.status === 'Prime validée').length})
                </button>
              )}
              {(() => {
                const steps = [...new Set(items.map(b => getValidStep(b)).filter(Boolean))];
                if (steps.length === 1) {
                  return (
                    <button onClick={() => {
                      const ids = items.filter(b => getValidStep(b) === steps[0]).map(b => b.id);
                      setSelectedBonuses(new Set(ids));
                      setConfirmBonus({ batch: true });
                    }}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">
                      Valider {dept} ({items.filter(b => getValidStep(b) === steps[0]).length})
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          </div>
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <BonusTable
              bonuses={items}
              getValidStep={getValidStep}
              canSelect={canSelect}
              selectedBonuses={selectedBonuses}
              onToggleSelect={toggleSelect}
              onSelectAll={() => selectSection(items)}
              onClearSelection={() => deselectSection(items)}
              seeAmounts={seeAmounts}
              initiatorMap={initiatorMap}
              onView={(id) => navigate(`/bonuses/${id}`)}
              onValidate={handleValidate}
              onEdit={(id) => navigate(`/bonuses/edit/${id}`)}
              badgeClass={getBadgeClass}
              statusLabel={statusLabel}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleTableSort}
            />
          </div>
        </div>
      )) : viewMode === 'status' ? sections.map((section) => {
        const items = grouped[section.key] || [];
        if (items.length === 0 && section.key !== 'myValidation') return null;
        const showAll = sectionExpand[section.key];
        const limit = 12;
        const visible = showAll ? items : items.slice(0, limit);
        const remaining = items.length - limit;

        return (
          <div key={section.key} className="mb-6">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-t-xl ${section.highlight ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
              <h2 className="font-semibold">{section.title}</h2>
              {(section.key === 'myValidation' || section.key === 'initialised' || section.key === 'pendingDirector' || section.key === 'pendingDG' || section.key === 'validated') && items.length > 0 && (
                <div className="flex gap-1">
                  <button onClick={(e) => {
                    e.stopPropagation();
                    selectSection(items);
                  }}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${section.highlight ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}>
                    Tout sélectionner
                  </button>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    deselectSection(items);
                  }}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${section.highlight ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}>
                    Désélectionner
                  </button>
                </div>
              )}
              {section.key === 'validated' && user?.is_drh && items.length > 0 && (
                <div className="flex gap-1">
                  <button onClick={(e) => {
                    e.stopPropagation();
                    const allIds = items.filter(b => b.status === 'Prime validée').map(b => b.id);
                    setPayConfirm({ type: 'batch', ids: allIds, count: allIds.length });
                  }}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">
                    Tout traiter
                  </button>
                </div>
              )}
              <span className={`text-sm font-bold ${section.highlight ? 'text-white' : 'text-blue-600'}`}>
                {seeAmounts ? `${items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0).toLocaleString('fr-FR')} Ar` : '••••••'}
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${section.highlight ? 'bg-white text-blue-700' : 'bg-gray-300 text-gray-700'}`}>
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-400 bg-white rounded-b-xl border border-t-0 border-gray-200">
                Aucune prime à valider
              </div>
            ) : (
              <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
                <BonusTable
                  bonuses={visible}
                  getValidStep={getValidStep}
                  canSelect={canSelect}
                  selectedBonuses={selectedBonuses}
                  onToggleSelect={toggleSelect}
                  onSelectAll={() => selectSection(visible)}
                  onClearSelection={() => deselectSection(visible)}
                  seeAmounts={seeAmounts}
                  initiatorMap={initiatorMap}
                  onView={(id) => navigate(`/bonuses/${id}`)}
                  onValidate={handleValidate}
                  onEdit={(id) => navigate(`/bonuses/edit/${id}`)}
                  badgeClass={getBadgeClass}
                  statusLabel={statusLabel}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleTableSort}
                />
                {remaining > 0 && (
                  <button onClick={() => setSectionExpand(prev => ({ ...prev, [section.key]: !showAll }))}
                    className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                    {showAll ? `Réduire` : `Afficher tout (${items.length})`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      }) : (() => {
        const PAGE_SIZE = 4;
        const totalPages = Math.max(1, Math.ceil(monthGroups.length / PAGE_SIZE));
        const safePage = Math.min(datePage, totalPages);
        const visibleGroups = monthGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
        return (
          <>
          {visibleGroups.map(({ ym, monthName, bonuses: items }) => {
        const validatedCount = items.filter(b => b.status === 'Prime validée').length;
        return (
        <div key={ym} className="mb-6">
          <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
            <h2 className="font-semibold text-sm">{monthName}</h2>
            {user?.is_drh && validatedCount > 0 && (
              <button onClick={() => {
                const [y, m] = ym.split('-')
                setPayConfirm({ type: 'month', month: m, year: y, monthName, count: validatedCount })
              }} className="ml-1 btn btn-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0">Traiter ({validatedCount})</button>
            )}
            <span className="text-sm font-bold text-blue-600">
              {seeAmounts ? `${items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0).toLocaleString('fr-FR')} Ar` : '••••••'}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
          </div>
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <BonusTable
              bonuses={items}
              getValidStep={getValidStep}
              canSelect={canSelect}
              selectedBonuses={selectedBonuses}
              onToggleSelect={toggleSelect}
              onSelectAll={() => selectSection(items)}
              onClearSelection={() => deselectSection(items)}
              seeAmounts={seeAmounts}
              initiatorMap={initiatorMap}
              onView={(id) => navigate(`/bonuses/${id}`)}
              onValidate={handleValidate}
              onEdit={(id) => navigate(`/bonuses/edit/${id}`)}
              badgeClass={getBadgeClass}
              statusLabel={statusLabel}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleTableSort}
            />
          </div>
        </div>
      );
      })}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2 mb-4">
          <button disabled={safePage <= 1} onClick={() => setDatePage(p => p - 1)}
            className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeftIcon className="w-4 h-4" /> Précédent
          </button>
          <span className="text-xs text-gray-400 font-medium">Page {safePage} / {totalPages}</span>
          <button disabled={safePage >= totalPages} onClick={() => setDatePage(p => p + 1)}
            className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
            Suivant <ChevronRightIcon />
          </button>
        </div>
      )}
      </>
    );
  })()
}

      {selectedBonuses.size > 0 && (
        <div className="sticky bottom-4 z-40 flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-lg">
          <span className="text-sm font-medium text-gray-700">{selectedBonuses.size} sélectionnée(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={selectAllFiltered} className="btn btn-ghost btn-xs">Tout</button>
            <button onClick={clearSelection} className="btn btn-ghost btn-xs text-gray-400">Aucun</button>
            <div className="w-px h-5 bg-gray-200" />
            {user?.is_drh && (
              <button onClick={() => setPayConfirm({ type: 'batch', ids: [...selectedBonuses], count: selectedBonuses.size })}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                {depFilter ? `Traiter ${depFilter}` : 'Traiter'} ({selectedBonuses.size})
              </button>
            )}
            {(() => {
              const step = getCommonStep()
              return step ? (
                <>
                  <button onClick={() => setConfirmBonus({ batch: true })}
                    className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                    {depFilter ? `Valider ${depFilter}` : 'Valider'} ({selectedBonuses.size})
                  </button>
                  <button onClick={() => setBatchReject('')}
                    className="btn btn-sm bg-red-50 hover:bg-red-100 text-red-700 border border-red-200">
                    {depFilter ? `Rejeter ${depFilter}` : 'Rejeter'}
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400 italic" title="Les primes sélectionnées n'ont pas le même statut ou ne peuvent pas être validées ensemble">Étapes différentes</span>
              )
            })()}
          </div>
        </div>
      )}

      <Modal open={!!confirmBonus} onClose={() => { setConfirmBonus(null); clearSelection(); }} title="Confirmer la validation" size="sm">
        {confirmBonus?.batch ? (
          <>
            <p className="text-sm text-gray-600 mb-6">Valider les <strong>{selectedBonuses.size}</strong> prime(s) sélectionnée(s) ?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmBonus(null); }} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={confirmBatchValidate} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6">Êtes-vous sûr de vouloir valider cette prime ?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmBonus(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={confirmValidate} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={batchReject !== null} onClose={() => setBatchReject(null)} title="Rejeter les primes" size="sm">
        <p className="text-sm text-gray-600 mb-3">Rejeter les <strong>{selectedBonuses.size}</strong> prime(s) sélectionnée(s) ?</p>
        <textarea value={batchReject || ''} onChange={(e) => setBatchReject(e.target.value)}
          placeholder="Motif du rejet (optionnel)..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 mb-4 resize-none"
          rows={3} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setBatchReject(null)} className="btn btn-sm btn-ghost">Annuler</button>
          <button onClick={confirmBatchReject} className="btn btn-sm bg-red-600 hover:bg-red-700 text-white border-0">Rejeter</button>
        </div>
      </Modal>
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Exporter les primes" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => setExportColumns([...EXPORT_COLUMNS_LIST])} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_COLUMNS_LIST.map(col => {
              const selected = exportColumns.includes(col)
              return (
                <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected} onChange={() => {
                    setExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                  }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                  <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{exportColumns.length} / {EXPORT_COLUMNS_LIST.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const p = new URLSearchParams()
                if (typeFilter) p.set('bonus_type', typeFilter)
                if (statusFilter === 'Prime rejetée') p.set('was_rejected', 'true')
                else if (statusFilter) p.set('status', statusFilter)
                if (searchQuery) p.set('search', searchQuery)
                if (depFilter) p.set('department', depFilter)
                if (filterYear) {
                  if (filterMonth) {
                    const lastDay = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate()
                    p.set('start_date', `${filterYear}-${filterMonth}-01`)
                    p.set('end_date', `${filterYear}-${filterMonth}-${String(lastDay).padStart(2, '0')}`)
                  } else {
                    p.set('start_date', `${filterYear}-01-01`)
                    p.set('end_date', `${filterYear}-12-31`)
                  }
                }
                p.set('columns', exportColumns.join(','))
                const token = localStorage.getItem('token')
                fetch(`/api/v1/bonuses/export/xlsx?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `export_primes_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!payConfirm} onClose={() => { if (!paying) setPayConfirm(null); }} title="Confirmer le traitement" size="sm">
        {paying ? (
          <div className="flex items-center justify-center gap-3 py-6">
            <span className="loading loading-spinner loading-sm text-emerald-600" />
            <span className="text-sm text-gray-600">Marquage en cours...</span>
          </div>
        ) : payConfirm?.type === 'month' ? (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Marquer toutes les primes validées de <strong>{payConfirm.monthName}</strong> comme traitées ?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayConfirm(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                setPaying(true)
                markBonusesPaid({ month: payConfirm.month, year: payConfirm.year })
                  .then(r => { toast.success(r.message); fetchBonuses(queryParams); setPayConfirm(null) })
                  .catch(e => toast.error(e.response?.data?.detail || 'Erreur'))
                  .finally(() => setPaying(false))
              }} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Oui, traiter</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Marquer les <strong>{payConfirm?.count}</strong> prime(s) sélectionnée(s) comme traitées ?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayConfirm(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                setPaying(true)
                markBonusesPaid({ bonus_ids: payConfirm.ids })
                  .then(r => { toast.success(r.message); clearSelection(); fetchBonuses(queryParams); setPayConfirm(null) })
                  .catch(e => toast.error(e.response?.data?.detail || 'Erreur'))
                  .finally(() => setPaying(false))
              }} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Oui, traiter</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default BonusesList;
