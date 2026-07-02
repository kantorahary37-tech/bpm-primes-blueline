import { useEffect, useState, useMemo, useCallback } from 'react';
import { getBonuses, validateBonus, batchValidateBonuses, markBonusesPaid } from '../services/api';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, CheckIcon, EditIcon, DownloadIcon, CalendarIcon, MoonIcon, ChartIcon, FilterIcon, ChevronLeftIcon } from '../components/Icons';
import Modal from '../components/Modal';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
}

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
}

const EXPORT_COLUMNS_LIST = [
  "Matricule", "Nom", "Departement", "TypePrime",
  "DateDebut", "DateFin", "Montant", "Statut",
  "DejaRejete", "CreePar", "DateCreation",
]

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

const BonusesList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [bonuses, setBonuses] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'status' || v === 'date' ? v : 'date';
  });
const [typeFilter, setTypeFilter] = useState('');
const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || '');
const [searchQuery, setSearchQuery] = useState('');
const [depFilter, setDepFilter] = useState(() => new URLSearchParams(window.location.search).get('department') || '');
const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirmBonus, setConfirmBonus] = useState(null);
  const [payConfirm, setPayConfirm] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportColumns, setExportColumns] = useState(EXPORT_COLUMNS_LIST);
  const [selectedBonuses, setSelectedBonuses] = useState(new Set());
  const [batchReject, setBatchReject] = useState(null);
  const [paying, setPaying] = useState(false);
  const [datePage, setDatePage] = useState(1);
  const [sectionExpand, setSectionExpand] = useState({});

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('status')) {
      if (user?.is_dg) setStatusFilter('En attente DG');
      else if (user?.is_directeur) setStatusFilter('En attente Directeur');
    }
  }, [user?.is_dg, user?.is_directeur]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchBonuses = async () => {
    try {
      const data = await getBonuses();
      setBonuses(data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBonuses();
    if (location.state?.success) {
      setToast({ type: 'success', message: location.state.success });
      window.history.replaceState({}, '');
    }
  }, []);

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
      showToast('success', 'Prime validée avec succès !');
      setConfirmBonus(null);
      fetchBonuses();
    } catch (error) {
      showToast('error', error.response?.data?.detail || "Erreur lors de la validation");
      setConfirmBonus(null);
    }
  };

  const confirmBatchValidate = async () => {
    const step = getCommonStep();
    if (!step) return;
    const ids = [...selectedBonuses];
    try {
      const res = await batchValidateBonuses(ids, 'VALIDER', step);
      showToast('success', `${res.total_success} prime(s) validée(s)${res.total_errors > 0 ? `, ${res.total_errors} erreur(s)` : ''}`);
      clearSelection();
      setConfirmBonus(null);
      fetchBonuses();
    } catch (error) {
      showToast('error', error.response?.data?.detail || "Erreur lors de la validation par lot");
      setConfirmBonus(null);
    }
  };

  const confirmBatchReject = async () => {
    const step = getCommonStep();
    if (!step) return;
    const ids = [...selectedBonuses];
    try {
      const res = await batchValidateBonuses(ids, 'REJETER', step, batchReject);
      showToast('success', `${res.total_success} prime(s) rejetée(s)${res.total_errors > 0 ? `, ${res.total_errors} erreur(s)` : ''}`);
      clearSelection();
      setBatchReject(null);
      fetchBonuses();
    } catch (error) {
      showToast('error', error.response?.data?.detail || "Erreur lors du rejet par lot");
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

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusLabel = (bonus) => {
    if (!bonus) return '';
    if (bonus.status === 'En attente Directeur') return `En attente Directeur ${bonus.employee?.department || ''}`;
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

    const myStatuses = [];
    if (user.is_validator_n1) myStatuses.push('Initialisé');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');

    const base = [
      { key: 'myValidation', title: 'À valider par vous', highlight: true, filter: (b) => myStatuses.includes(b.status) },
      { key: 'initialised', title: 'Initialisées', highlight: false, filter: (b) => b.status === 'Initialisé' },
      { key: 'pendingDirector', title: 'En attente Directeur', highlight: false, filter: (b) => b.status === 'En attente Directeur' },
      { key: 'pendingDG', title: 'En attente DG', highlight: false, filter: (b) => b.status === 'En attente DG' },
      { key: 'validated', title: 'Validées', highlight: false, filter: (b) => b.status === 'Prime validée' || b.status === 'Validé' },
    ];

    const order = [];
    const hasValidationRole = user.is_validator_n1 || user.is_directeur || user.is_dg;
    if (hasValidationRole) order.push('myValidation');
    order.push('initialised', 'pendingDirector', 'pendingDG', 'validated');

    const map = new Map(base.map((s) => [s.key, s]));
    return order.map((key) => map.get(key)).filter(Boolean);
  }, [user]);

  const filteredBonuses = useMemo(() => {
    return bonuses.filter((b) => {
      if (typeFilter && b.bonus_type !== typeFilter) return false;
      if (statusFilter === 'Prime rejetée') { if (!b.was_rejected) return false; }
      else if (statusFilter && b.status !== statusFilter) return false;
      if (depFilter && b.employee?.department !== depFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = b.employee?.name?.toLowerCase() || '';
        const mat = b.employee?.matricule?.toLowerCase() || '';
        if (!name.includes(q) && !mat.includes(q)) return false;
      }
      if (filterYear) {
        if (filterMonth) {
          const ym = `${filterYear}-${filterMonth}`
          const s = b.start_date ? b.start_date.substring(0, 7) : '';
          const e = b.end_date ? b.end_date.substring(0, 7) : '';
          if (s !== ym && e !== ym) return false;
        } else {
          const y = filterYear;
          const s = b.start_date ? b.start_date.substring(0, 4) : '';
          const e = b.end_date ? b.end_date.substring(0, 4) : '';
          if (s !== y && e !== y) return false;
        }
      }
      return true;
    });
  }, [bonuses, typeFilter, statusFilter, depFilter, searchQuery, filterMonth, filterYear]);

  const departments = useMemo(() => {
    const deps = new Set(bonuses.map(b => b.employee?.department).filter(Boolean));
    return [...deps].sort();
  }, [bonuses]);

  const grouped = useMemo(() => {
    const result = {};
    for (const s of sections) {
      result[s.key] = filteredBonuses.filter(s.filter);
    }
    return result;
  }, [filteredBonuses, sections]);

  const monthGroups = useMemo(() => {
    const groups = {}
    filteredBonuses.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu'
      if (!groups[ym]) groups[ym] = []
      groups[ym].push(b)
    })
    return Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-')
      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      return { ym, monthName, bonuses: groups[ym] }
    })
  }, [filteredBonuses]);

  const canSelect = (bonus) => {
    const step = getValidStep(bonus);
    if (step) return true;
    if ((user?.is_drh || user?.is_dg) && bonus.status === 'Prime validée') return true;
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

  const groupByDept = (items) => {
    const groups = {};
    items.forEach(b => {
      const d = b.employee?.department || 'N/A';
      if (!groups[d]) groups[d] = [];
      groups[d].push(b);
    });
    return groups;
  };

  const renderCards = (items, getStep) => {
    if (items.length === 0) return null;
    const groups = depFilter ? { [depFilter]: items } : groupByDept(items);
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted.flatMap(([dept, deptBonuses]) => [
      <div key={`${dept}-hdr`} className="col-span-full flex items-center gap-2 px-1 pt-1 pb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{dept}</span>
        <span className="text-[9px] font-medium text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded-full">{deptBonuses.length}</span>
      </div>,
      ...deptBonuses.map(bonus => {
        const step = getStep(bonus);
        const selected = selectedBonuses.has(bonus.id);
        return (
          <div key={bonus.id} onClick={() => navigate(`/bonuses/${bonus.id}`)}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-all group ${
              selected ? 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-300' : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
            }`}>
            <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
              <input type="checkbox" checked={selected}
                disabled={!canSelect(bonus)}
                onChange={() => toggleSelect(bonus.id)}
                title={!canSelect(bonus) ? "Seules les primes validées peuvent être sélectionnées" : ""}
                className={`checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600 ${!canSelect(bonus) ? 'opacity-40 cursor-not-allowed' : ''}`} />
            </div>
            <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
              {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
            </div>
            <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
              <span className="font-medium" title={bonus.employee?.name || 'N/A'}>
                {bonus.employee?.name || 'N/A'}
              </span>
            </span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
              {statusLabel(bonus)}
            </span>
            <span className="text-[10px] font-semibold text-blue-600 shrink-0">{bonus.total_amount} Ar</span>
            <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => navigate(`/bonuses/${bonus.id}`)} className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-blue-600" title="Voir le détail">
                <EyeIcon className="w-3 h-3" />
              </button>
              {step && !bonus.was_rejected && (
                <button className="p-1 rounded hover:bg-emerald-50 text-gray-300 hover:text-emerald-600"
                  onClick={() => handleValidate(bonus.id, step)} title="Valider">
                  <CheckIcon className="w-3 h-3" />
                </button>
              )}
              {step && bonus.was_rejected && (
                <button onClick={() => navigate(`/bonuses/edit/${bonus.id}`)} className="p-1 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-600" title="Modifier">
                  <EditIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      }),
    ]);
  };

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
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Primes</h1>
        <div className="flex gap-2">
          <Link to="/bonuses/new" className="btn bg-blue-600 hover:bg-blue-700 text-white border-0">Nouvelle Prime</Link>
          {(user?.is_drh || user?.is_dg) && (
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          {!user?.is_dg && !user?.is_directeur && <option value="">Tous statuts</option>}
          {!user?.is_dg && !user?.is_directeur && <option value="Initialisé">Initialisé</option>}
          {!user?.is_dg && <option value="En attente Directeur">En attente Directeur</option>}
          {!user?.is_directeur && <option value="En attente DG">En attente DG</option>}
          <option value="Prime validée">Validée</option>
          <option value="Prime rejetée">Rejetée</option>
        </select>
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un employé..."
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-48" />
        {(user?.is_dg || user?.is_drh) && (
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
        </div>
      </div>

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
      ) : viewMode === 'status' ? sections.map((section) => {
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
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors">
                    Tout sélectionner
                  </button>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    deselectSection(items);
                  }}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                    Désélectionner
                  </button>
                </div>
              )}
              {section.key === 'validated' && (user?.is_drh || user?.is_dg) && items.length > 0 && (
                <div className="flex gap-1">
                  <button onClick={(e) => {
                    e.stopPropagation();
                    const allIds = items.filter(b => b.status === 'Prime validée').map(b => b.id);
                    setPayConfirm({ type: 'batch', ids: allIds, count: allIds.length });
                  }}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">
                    Marquer tout payé
                  </button>
                </div>
              )}
              <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${section.highlight ? 'bg-white text-blue-700' : 'bg-gray-300 text-gray-700'}`}>
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-400 bg-white rounded-b-xl border border-t-0 border-gray-200">
                Aucune prime à valider
              </div>
            ) : (
              <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-2">
                  {renderCards(visible, getValidStep)}
                </div>
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
            {(user?.is_drh || user?.is_dg) && validatedCount > 0 && (
              <button onClick={() => {
                const [y, m] = ym.split('-')
                setPayConfirm({ type: 'month', month: m, year: y, monthName, count: validatedCount })
              }} className="ml-1 btn btn-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0">Marquer payé ({validatedCount})</button>
            )}
            <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
          </div>
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-2">
              {renderCards(items, getValidStep)}
            </div>
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
            {(user?.is_drh || user?.is_dg) && (
              <button onClick={() => setPayConfirm({ type: 'batch', ids: [...selectedBonuses], count: selectedBonuses.size })}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Payer ({selectedBonuses.size})</button>
            )}
            {(() => {
              const step = getCommonStep()
              return step ? (
                <>
                  <button onClick={() => setConfirmBonus({ batch: true })}
                    className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider ({selectedBonuses.size})</button>
                  <button onClick={() => setBatchReject('')}
                    className="btn btn-sm bg-red-50 hover:bg-red-100 text-red-700 border border-red-200">Rejeter</button>
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
              <button onClick={confirmBatchValidate} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider tout</button>
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

      <Modal open={!!payConfirm} onClose={() => { if (!paying) setPayConfirm(null); }} title="Confirmer le paiement" size="sm">
        {paying ? (
          <div className="flex items-center justify-center gap-3 py-6">
            <span className="loading loading-spinner loading-sm text-emerald-600" />
            <span className="text-sm text-gray-600">Marquage en cours...</span>
          </div>
        ) : payConfirm?.type === 'month' ? (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Marquer toutes les primes validées de <strong>{payConfirm.monthName}</strong> comme payées ?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayConfirm(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                setPaying(true)
                markBonusesPaid({ month: payConfirm.month, year: payConfirm.year })
                  .then(r => { showToast('success', r.message); fetchBonuses(); setPayConfirm(null) })
                  .catch(e => showToast('error', e.response?.data?.detail || 'Erreur'))
                  .finally(() => setPaying(false))
              }} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Oui, marquer payé</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Marquer les <strong>{payConfirm?.count}</strong> prime(s) sélectionnée(s) comme payées ?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayConfirm(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                setPaying(true)
                markBonusesPaid({ bonus_ids: payConfirm.ids })
                  .then(r => { showToast('success', r.message); clearSelection(); fetchBonuses(); setPayConfirm(null) })
                  .catch(e => showToast('error', e.response?.data?.detail || 'Erreur'))
                  .finally(() => setPaying(false))
              }} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Oui, marquer payé</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default BonusesList;
