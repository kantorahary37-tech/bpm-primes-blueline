import { useEffect, useState, useMemo } from 'react';
import { getBonuses, validateBonus } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, CheckIcon, EditIcon, DownloadIcon, CalendarIcon, MoonIcon, ChartIcon, FilterIcon } from '../components/Icons';

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
  const [bonuses, setBonuses] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBonuses();
  }, [statusFilter]);

  const fetchBonuses = async () => {
    try {
      const data = await getBonuses(statusFilter || null);
      setBonuses(data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  const handleValidate = async (bonusId, step) => {
    try {
      await validateBonus(bonusId, { action: 'VALIDER' }, step);
      alert('Prime validée !');
      fetchBonuses();
    } catch (error) {
      alert('Erreur lors de la validation');
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
    if (status === 'Prime validée' || status === 'Validé') return 'bg-emerald-100 text-emerald-700';
    if (status === 'Prime rejetée' || status === 'Rejeté') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div>
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
      </div>

      {sections.map((section) => {
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
                        className="block p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-gray-900">{typeLabels[bonus.bonus_type] || bonus.bonus_type}</span>
                          </div>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getBadgeClass(bonus.status)}`}>
                            {bonus.status}
                          </span>
                        </div>

                        <p className="font-semibold text-gray-900 mb-1">{bonus.employee?.name || 'N/A'}</p>
                        <p className="text-xs text-gray-400 mb-3">
                          {bonus.start_date && bonus.end_date
                            ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}`
                            : 'Période non définie'}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <span className="text-sm font-bold text-blue-600">{bonus.total_amount} Ar</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/bonuses/${bonus.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Voir le détail">
                              <EyeIcon className="w-4 h-4" />
                            </Link>
                            {step && !bonus.was_rejected && (
                              <button
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600"
                                onClick={() => handleValidate(bonus.id, step)}
                                title="Valider"
                              >
                                <CheckIcon className="w-4 h-4" />
                              </button>
                            )}
                            {step && bonus.was_rejected && (
                              <Link to={`/bonuses/edit/${bonus.id}`} className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600" title="Modifier">
                                <EditIcon className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BonusesList;
