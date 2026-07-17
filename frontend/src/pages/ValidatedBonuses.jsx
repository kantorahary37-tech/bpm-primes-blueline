import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, CalendarIcon, MoonIcon, ChartIcon, FilterIcon } from '../components/Icons';

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
};

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
};

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 3}, (_, i) => currentYear - 1 + i);

const ValidatedBonuses = () => {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depFilter, setDepFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
      if (filterMonth || filterYear) {
        const d = b.start_date ? new Date(b.start_date) : null;
        if (!d) return false;
        if (filterMonth && (d.getMonth() + 1) !== parseInt(filterMonth)) return false;
        if (filterYear && d.getFullYear() !== parseInt(filterYear)) return false;
      }
      return true;
    });
  }, [bonuses, depFilter, typeFilter, filterMonth, filterYear]);

  const totalAmount = filtered.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0);
  const formatAmount = (v) => v.toLocaleString('fr-FR') + ' Ar';

  const monthGroups = useMemo(() => {
    const groups = {};
    filtered.forEach(b => {
      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu';
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(b);
    });
    return Object.keys(groups).sort().reverse().map(ym => {
      const [y, m] = ym.split('-');
      const monthName = new Date(parseInt(y), parseInt(m) - 1)
        .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { ym, monthName, items: groups[ym] };
    });
  }, [filtered]);

  const hasFilters = depFilter || typeFilter || filterMonth || filterYear;

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Primes validées</h1>
        <span className="text-sm text-gray-400 ml-2">{filtered.length} prime{filtered.length > 1 ? 's' : ''} · {formatAmount(totalAmount)}</span>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
          <FilterIcon className="w-4 h-4" />
          Filtres
          {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
          <select value={depFilter} onChange={e => setDepFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Tous départements</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Tous types</option>
            <option value="mensuel">Mensuelle</option>
            <option value="astreinte">Astreinte</option>
            <option value="commission">Commission</option>
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Tous mois</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Toutes années</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setDepFilter(''); setTypeFilter(''); setFilterMonth(''); setFilterYear(''); }}
              className="px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors">
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {monthGroups.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">Aucune prime validée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {monthGroups.map(({ ym, monthName, items }) => (
            <div key={ym} className="bg-gray-50 rounded-xl border border-gray-200 border-t-4 border-t-emerald-400 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{monthName}</span>
                <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-1">
                {items.map(b => (
                  <Link key={b.id} to={`/bonuses/${b.id}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {b.bonus_type === 'mensuel' ? 'M' : b.bonus_type === 'astreinte' ? 'A' : 'C'}
                    </span>
                    <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                      <span className="font-medium">{b.employee?.name || 'N/A'}</span>
                    </span>
                    <span className="text-[9px] text-gray-400 shrink-0">{b.employee?.department || ''}</span>
                    <span className="text-[10px] font-semibold text-blue-600 shrink-0">{Number(b.total_amount).toLocaleString('fr-FR')} Ar</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ValidatedBonuses;
