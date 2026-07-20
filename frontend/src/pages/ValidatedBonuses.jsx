import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, CalendarIcon, MoonIcon, ChartIcon, FilterIcon, EyeIcon } from '../components/Icons';

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
};

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

const getBadgeClass = (status) => {
  const map = {
    'Prime validée': 'bg-emerald-100 text-emerald-700',
    'Validé': 'bg-emerald-100 text-emerald-700',
    'Prime rejetée': 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const ValidatedBonuses = () => {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depFilter, setDepFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [viewMode, setViewMode] = useState('date');
  const [sectionExpand, setSectionExpand] = useState({});
  const [datePage, setDatePage] = useState(1);

  useEffect(() => {
    getBonuses(null, null, null, null, null, false, false, true)
      .then(setBonuses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    const set = new Set(bonuses.map(b => b.employee?.department).filter(Boolean));
    return [...set].sort();
  }, [bonuses]);

  const filtered = useMemo(() => {
    return bonuses.filter(b => {
      if (depFilter && b.employee?.department !== depFilter) return false;
      if (typeFilter && b.bonus_type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = b.employee?.name?.toLowerCase() || '';
        const mat = b.employee?.matricule?.toLowerCase() || '';
        if (!name.includes(q) && !mat.includes(q)) return false;
      }
      if (filterYear) {
        if (filterMonth) {
          const ym = `${filterYear}-${filterMonth}`;
          const s = b.start_date ? b.start_date.substring(0, 7) : '';
          const e = b.end_date ? b.end_date.substring(0, 7) : '';
          if (s !== ym && e !== ym) return false;
        } else {
          const s = b.start_date ? b.start_date.substring(0, 4) : '';
          const e = b.end_date ? b.end_date.substring(0, 4) : '';
          if (s !== filterYear && e !== filterYear) return false;
        }
      }
      return true;
    });
  }, [bonuses, depFilter, typeFilter, searchQuery, filterMonth, filterYear]);

  const totalAmount = filtered.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0);
  const formatAmount = (v) => v.toLocaleString('fr-FR') + ' Ar';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusLabel = (bonus) => bonus?.status || '';

  const hasFilters = depFilter || typeFilter || searchQuery || filterMonth || filterYear;

  useEffect(() => { setDatePage(1); }, [typeFilter, depFilter, searchQuery, filterMonth, filterYear]);

  const sections = useMemo(() => [
    { key: 'validated', title: 'Validées', filter: (b) => b.status === 'Prime validée' || b.status === 'Validé' },
    { key: 'rejected', title: 'Rejetées', filter: (b) => b.status === 'Prime rejetée' || b.was_rejected },
  ], []);

  const grouped = useMemo(() => {
    const result = {};
    for (const s of sections) {
      result[s.key] = filtered.filter(s.filter);
    }
    return result;
  }, [filtered, sections]);

  const monthGroups = useMemo(() => {
    const groups = {};
    filtered.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu';
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(b);
    });
    return Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-');
      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { ym, monthName, bonuses: groups[ym] };
    });
  }, [filtered]);

  const deptGroups = useMemo(() => {
    const groups = {};
    filtered.forEach(b => {
      const d = b.employee?.department || 'N/A';
      if (!groups[d]) groups[d] = [];
      groups[d].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([dept, items]) => ({ dept, items }));
  }, [filtered]);

  const renderRow = (bonus) => {
    return (
      <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group">
        <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
          {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
        </div>
        <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
          <span className="font-medium" title={bonus.employee?.name || 'N/A'}>{bonus.employee?.name || 'N/A'}</span>
        </span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)}`}>
          {statusLabel(bonus)}
        </span>
        <span className="text-[10px] font-semibold text-blue-600 shrink-0">{Number(bonus.total_amount).toLocaleString('fr-FR')} Ar</span>
        <EyeIcon className="w-3 h-3 text-gray-300 shrink-0" />
      </Link>
    );
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Primes validées</h1>
        <span className="text-sm text-gray-400 ml-2">{filtered.length} prime{filtered.length > 1 ? 's' : ''} · {formatAmount(totalAmount)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
        <FilterIcon className="w-4 h-4 text-gray-400 ml-1" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Tous types</option>
          <option value="mensuel">Mensuelle</option>
          <option value="astreinte">Astreinte</option>
          <option value="commission">Commission</option>
        </select>
        <select value={depFilter} onChange={e => setDepFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Tous départements</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher un employé..."
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-48" />
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Mois</option>
          {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Année</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setDepFilter(''); setTypeFilter(''); setSearchQuery(''); setFilterMonth(''); setFilterYear(''); }}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            Réinitialiser
          </button>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={() => setViewMode('date')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'date' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Date
          </button>
          <button onClick={() => setViewMode('status')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'status' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Statut
          </button>
          <button onClick={() => setViewMode('department')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'department' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Département
          </button>
        </div>
      </div>

      {depFilter && filtered.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-700">{depFilter}</span>
          <span className="text-xs text-blue-500">{filtered.length} prime(s)</span>
          <span className="text-sm font-bold text-blue-700 ml-auto">
            Total : {formatAmount(totalAmount)}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="font-medium text-gray-500">Aucune prime validée</p>
          <p className="text-sm text-gray-400 mt-1">Aucune prime ne correspond aux filtres appliqués</p>
          {hasFilters && (
            <button onClick={() => { setDepFilter(''); setTypeFilter(''); setSearchQuery(''); setFilterMonth(''); setFilterYear(''); }}
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
              {formatAmount(items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0))}
            </span>
          </div>
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map(b => renderRow(b))}
            </div>
          </div>
        </div>
      )) : viewMode === 'status' ? sections.map((section) => {
        const items = grouped[section.key] || [];
        if (items.length === 0) return null;
        const showAll = sectionExpand[section.key];
        const limit = 12;
        const visible = showAll ? items : items.slice(0, limit);
        const remaining = items.length - limit;
        return (
          <div key={section.key} className="mb-6">
            <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
              <h2 className="font-semibold text-sm">{section.title}</h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
            </div>
            <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {visible.map(b => renderRow(b))}
              </div>
              {remaining > 0 && (
                <button onClick={() => setSectionExpand(prev => ({ ...prev, [section.key]: !showAll }))}
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                  {showAll ? 'Réduire' : `Afficher tout (${items.length})`}
                </button>
              )}
            </div>
          </div>
        );
      }) : (() => {
        const PAGE_SIZE = 4;
        const totalPages = Math.max(1, Math.ceil(monthGroups.length / PAGE_SIZE));
        const safePage = Math.min(datePage, totalPages);
        const visibleGroups = monthGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
        return (
          <>
            {visibleGroups.map(({ ym, monthName, bonuses: items }) => (
              <div key={ym} className="mb-6">
                <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-gray-100 text-gray-900">
                  <h2 className="font-semibold text-sm">{monthName}</h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-300 text-gray-700">{items.length}</span>
                  <span className="text-sm font-bold text-blue-600 ml-1">
                    {formatAmount(items.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0))}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map(b => renderRow(b))}
                  </div>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-2 mb-4">
                <button disabled={safePage <= 1} onClick={() => setDatePage(p => p - 1)}
                  className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                  Précédent
                </button>
                <span className="text-xs text-gray-400 font-medium">Page {safePage} / {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setDatePage(p => p + 1)}
                  className="btn btn-sm btn-ghost text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                  Suivant
                </button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};

export default ValidatedBonuses;
