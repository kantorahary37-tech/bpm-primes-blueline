import { useEffect, useState, useMemo } from 'react';
import { getBonuses, validateBonus } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, CheckIcon, EditIcon, DownloadIcon, CalendarIcon, MoonIcon, ChartIcon, FilterIcon } from '../components/Icons';
import Modal from '../components/Modal';

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

const BonusesList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bonuses, setBonuses] = useState([]);
  const [viewMode, setViewMode] = useState('status');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirmBonus, setConfirmBonus] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchBonuses();
  }, []);

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

  const getValidStep = (bonus) => {
    if (!user) return null;
    if (user.is_validator_n1 && (bonus.status === 'Initialisé' || bonus.status === 'En attente N+1')) return 'N1';
    if (user.is_directeur && bonus.status === 'En attente Directeur') return 'DIRECTEUR';
    if (user.is_dg && bonus.status === 'En attente DG') return 'DG';
    return null;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getBadgeClass = (status) => {
    const map = {
      'Initialisé': 'bg-orange-100 text-orange-700',
      'En attente N+1': 'bg-blue-100 text-blue-700',
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
    if (user.is_validator_n1) myStatuses.push('Initialisé', 'En attente N+1');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');

    const base = [
      { key: 'myValidation', title: 'À valider par vous', highlight: true, filter: (b) => myStatuses.includes(b.status) },
      { key: 'initialised', title: 'Initialisées', highlight: false, filter: (b) => b.status === 'Initialisé' || b.status === 'En attente N+1' },
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
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = b.employee?.name?.toLowerCase() || '';
        const mat = b.employee?.matricule?.toLowerCase() || '';
        if (!name.includes(q) && !mat.includes(q)) return false;
      }
      if (monthFilter) {
        const start = b.start_date ? b.start_date.substring(0, 7) : '';
        const end = b.end_date ? b.end_date.substring(0, 7) : '';
        if (start !== monthFilter && end !== monthFilter) return false;
      }
      return true;
    });
  }, [bonuses, typeFilter, searchQuery, monthFilter]);

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
          <a
            href="/api/v1/bonuses/export/sage"
            className="btn btn-outline btn-success"
            target="_blank"
            rel="noopener noreferrer"
          >
            <DownloadIcon className="w-4 h-4" />
            Export SAGE
          </a>
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
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un employé..."
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-48" />
        <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
        {(typeFilter || searchQuery || monthFilter) && (
          <button onClick={() => { setTypeFilter(''); setSearchQuery(''); setMonthFilter(''); }}
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

      {viewMode === 'status' ? sections.map((section) => {
        const items = grouped[section.key] || [];
        if (items.length === 0 && section.key !== 'myValidation') return null;

        return (
          <div key={section.key} className="mb-6">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-t-xl ${section.highlight ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
              <h2 className="font-semibold">{section.title}</h2>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((bonus) => {
                    const Icon = typeIcons[bonus.bonus_type] || CalendarIcon
                    const step = getValidStep(bonus)
                    return (
                      <Link
                        key={bonus.id}
                        to={`/bonuses/${bonus.id}`}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all group"
                      >
                        <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
                          {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
                        </div>
                        <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                          <span className="font-medium">{bonus.employee?.name || 'N/A'}</span>
                        </span>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                          {bonus.status}
                        </span>
                        <span className="text-[10px] font-semibold text-blue-600 shrink-0">{bonus.total_amount} Ar</span>
                        <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => navigate(`/bonuses/${bonus.id}`)} className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-blue-600" title="Voir le détail">
                            <EyeIcon className="w-3 h-3" />
                          </button>
                          {step && !bonus.was_rejected && (
                            <button
                              className="p-1 rounded hover:bg-emerald-50 text-gray-300 hover:text-emerald-600"
                              onClick={() => handleValidate(bonus.id, step)}
                              title="Valider"
                            >
                              <CheckIcon className="w-3 h-3" />
                            </button>
                          )}
                          {step && bonus.was_rejected && (
                            <button onClick={() => navigate(`/bonuses/edit/${bonus.id}`)} className="p-1 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-600" title="Modifier">
                              <EditIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        );
      }) : monthGroups.map(({ ym, monthName, bonuses: items }) => (
        <div key={ym} className="mb-6">
          <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
            <h2 className="font-semibold text-sm">{monthName}</h2>
            <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
          </div>
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map((bonus) => {
                const step = getValidStep(bonus)
                return (
                  <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all group">
                    <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
                    </div>
                    <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                      <span className="font-medium">{bonus.employee?.name || 'N/A'}</span>
                    </span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                      {bonus.status}
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
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      ))}

      <Modal open={!!confirmBonus} onClose={() => setConfirmBonus(null)} title="Confirmer la validation" size="sm">
        <p className="text-sm text-gray-600 mb-6">Êtes-vous sûr de vouloir valider cette prime ?</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmBonus(null)} className="btn btn-sm btn-ghost">Annuler</button>
          <button onClick={confirmValidate} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider</button>
        </div>
      </Modal>
    </div>
  );
};

export default BonusesList;
