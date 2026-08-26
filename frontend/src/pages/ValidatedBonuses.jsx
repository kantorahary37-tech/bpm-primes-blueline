import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { ArrowLeftIcon } from '../components/Icons';

const ValidatedBonuses = () => {
  const { user } = useAuth();
  const { canSeeAmounts } = useSystemConfig();
  const seeAmounts = canSeeAmounts(user);
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBonuses('Prime validée', null, null)
      .then(setBonuses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthGroups = (() => {
    const groups = {};
    bonuses.forEach(b => {
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
  })();

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Primes validées</h1>
      </div>

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
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">Validée</span>
                    <span className="text-[10px] font-semibold text-blue-600 shrink-0">{seeAmounts ? `${b.total_amount.toLocaleString('fr-FR')} Ar` : '••••••'}</span>
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
