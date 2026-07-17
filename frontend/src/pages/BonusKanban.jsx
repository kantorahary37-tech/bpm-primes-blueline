import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBonuses } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeftIcon } from '../components/Icons';

const STATUS_COLUMNS = ['Initialisé', 'En attente Directeur', 'En attente DG', 'Prime validée'];

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
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
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const columnColor = {
  'Initialisé': 'border-t-orange-400',
  'En attente Directeur': 'border-t-purple-400',
  'En attente DG': 'border-t-amber-400',
  'Prime validée': 'border-t-emerald-400',
};

const BonusKanban = () => {
  const { type } = useParams();
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBonuses(null, null, type, null, null, false, true)
      .then(setBonuses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [type]);

  const myStatus = user?.is_admin ? null
    : user?.is_dg ? 'En attente DG'
    : user?.is_directeur ? 'En attente Directeur'
    : user?.is_validator_n1 ? 'Initialisé'
    : null;

  const columns = STATUS_COLUMNS.map(status => ({
    status,
    items: bonuses
      .filter(b => b.status === status)
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')),
  }));

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">{typeLabels[type] || type}</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => {
          const isMyColumn = col.status === myStatus;
          return (
            <div key={col.status} className={`bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${columnColor[col.status]} flex flex-col`}>
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{col.status}</span>
                  <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full">{col.items.length}</span>
                </div>
                {!isMyColumn && col.items.length > 0 && (
                  <p className="text-[9px] text-gray-400 mt-1">Lecture seule</p>
                )}
              </div>
              <div className="flex-1 p-2 space-y-1 min-h-[300px]">
                {col.items.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-8">Aucune prime</p>
                ) : (
                  col.items.map(b => {
                    const cardContent = (
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-white transition-all ${
                        isMyColumn
                          ? 'border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer'
                          : 'border-gray-100 opacity-60 cursor-default'
                      }`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          isMyColumn ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {b.bonus_type === 'mensuel' ? 'M' : b.bonus_type === 'astreinte' ? 'A' : 'C'}
                        </span>
                        <span className="text-[11px] text-gray-900 truncate min-w-0 flex-1">
                          <span className="font-medium" title={b.employee?.name || 'N/A'}>
                            {b.employee?.matricule || 'N/A'}{b.employee?.name && b.employee.name.split(' ')[0].length <= 12 ? ` ${b.employee.name.split(' ')[0]}` : ''}
                          </span>
                        </span>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(b.status)} ${b.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                          {statusLabel(b)}
                        </span>
                        <span className={`text-[10px] font-semibold shrink-0 ${isMyColumn ? 'text-blue-600' : 'text-gray-400'}`}>{b.total_amount} Ar</span>
                      </div>
                    );

                    return isMyColumn ? (
                      <Link key={b.id} to={`/bonuses/${b.id}`}>
                        {cardContent}
                      </Link>
                    ) : (
                      <div key={b.id}>{cardContent}</div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BonusKanban;
