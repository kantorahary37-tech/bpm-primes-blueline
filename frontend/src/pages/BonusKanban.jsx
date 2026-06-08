import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { ArrowLeftIcon, CalendarIcon, MoonIcon, ChartIcon } from '../components/Icons';

const STATUS_COLUMNS = ['Initialisé', 'En attente Directeur', 'En attente DG', 'Prime validée'];

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
};

const badgeClass = (status) => {
  const map = {
    'Initialisé': 'bg-orange-100 text-orange-700',
    'En attente Directeur': 'bg-purple-100 text-purple-700',
    'En attente DG': 'bg-amber-100 text-amber-700',
    'Prime validée': 'bg-emerald-100 text-emerald-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const columnColor = {
  'Initialisé': 'border-t-orange-400',
  'En attente Directeur': 'border-t-purple-400',
  'En attente DG': 'border-t-amber-400',
  'Prime validée': 'border-t-emerald-400',
};

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric',
});

const BonusKanban = () => {
  const { type } = useParams();
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBonuses(null, null, type)
      .then(setBonuses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [type]);

  const columns = STATUS_COLUMNS.map(status => ({
    status,
    items: bonuses
      .filter(b => b.status === status || (status === 'Initialisé' && b.status === 'En attente N+1'))
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')),
  }));

  const typeIcon = type === 'mensuel' ? CalendarIcon : type === 'astreinte' ? MoonIcon : ChartIcon;

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Kanban {typeLabels[type] || type}</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => (
          <div key={col.status} className={`bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${columnColor[col.status]} flex flex-col`}>
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{col.status}</span>
                <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full">{col.items.length}</span>
              </div>
            </div>
            <div className="flex-1 p-3 space-y-2 min-h-[300px]">
              {col.items.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-8">Aucune prime</p>
              ) : (
                col.items.map(b => (
                  <Link key={b.id} to={`/bonuses/${b.id}`}
                    className="block bg-white rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:shadow-sm transition-all">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                        {b.bonus_type === 'mensuel' ? 'M' : b.bonus_type === 'astreinte' ? 'A' : 'C'}
                      </span>
                      <span className="text-xs font-medium text-gray-900 truncate">{b.employee?.name || 'N/A'}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">{b.start_date && b.end_date ? `${formatDate(b.start_date)} → ${formatDate(b.end_date)}` : '—'}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeClass(b.status)}`}>{b.status}</span>
                      <span className="text-xs font-semibold text-blue-600">{b.total_amount} Ar</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BonusKanban;
