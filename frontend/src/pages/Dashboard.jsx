import { useEffect, useState, useMemo } from 'react';
import { getBonuses, getEmployees } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ClipboardIcon, ClockIcon, CheckIcon, EmployeesIcon,
  CalendarIcon, MoonIcon, ChartIcon, EyeIcon,
} from '../components/Icons';

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

const getBadgeClass = (status) => {
  if (status === 'Prime validée' || status === 'Validé') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Prime rejetée' || status === 'Rejeté') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const Dashboard = () => {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [b, e] = await Promise.all([getBonuses(), getEmployees()]);
        setBonuses(b);
        setEmployees(e);
        setLoading(false);
      } catch (err) {
        console.error('Erreur:', err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatAmount = (v) => (v || 0).toLocaleString('fr-FR') + ' Ar';

  const stats = useMemo(() => {
    const total = bonuses.length;
    const totalAmount = bonuses.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0);

    const byType = {};
    for (const b of bonuses) {
      const tp = b.bonus_type || 'inconnu';
      if (!byType[tp]) byType[tp] = { count: 0, amount: 0 };
      byType[tp].count++;
      byType[tp].amount += parseFloat(b.total_amount) || 0;
    }

    const pending = bonuses.filter(b => b.status !== 'Validé' && b.status !== 'Rejeté' && b.status !== 'Prime validée' && b.status !== 'Prime rejetée').length;
    const validated = bonuses.filter(b => b.status === 'Validé' || b.status === 'Prime validée').length;

    return { total, totalAmount, pending, validated, byType, employees: employees.length };
  }, [bonuses, employees]);

  const myPending = useMemo(() => {
    if (!user) return [];
    const myStatuses = [];
    if (user.is_validator_n1) myStatuses.push('Initialisé', 'En attente N+1');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');
    return bonuses.filter(b => myStatuses.includes(b.status));
  }, [bonuses, user]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const typeConfig = {
    mensuel: { label: 'Mensuel', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: CalendarIcon },
    astreinte: { label: 'Astreinte', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', icon: MoonIcon },
    commission: { label: 'Commission', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: ChartIcon },
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: ClipboardIcon, label: 'Total Primes', value: stats.total, sub: formatAmount(stats.totalAmount), bg: 'bg-blue-50', text: 'text-blue-600' },
          { icon: ClockIcon, label: 'En attente', value: stats.pending, sub: 'Non validées', bg: 'bg-amber-50', text: 'text-amber-600' },
          { icon: CheckIcon, label: 'Validées', value: stats.validated, sub: 'Approuvées', bg: 'bg-emerald-50', text: 'text-emerald-600' },
          { icon: EmployeesIcon, label: 'Employés', value: stats.employees, sub: 'Actifs', bg: 'bg-violet-50', text: 'text-violet-600' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${card.bg} ${card.text} flex items-center justify-center shrink-0`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const data = stats.byType[key] || { count: 0, amount: 0 };
          const Icon = cfg.icon;
          return (
            <div key={key} className={`bg-white rounded-xl border ${cfg.border} p-4 flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{cfg.label}</p>
                  <p className="text-xs text-gray-400">{data.count} prime{data.count !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-bold text-gray-900">{formatAmount(data.amount)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-blue-600 text-white">
          <EyeIcon className="w-4 h-4" />
          <h2 className="font-semibold">À valider par vous</h2>
          <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-white text-blue-700">
            {myPending.length}
          </span>
        </div>

        {myPending.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-white rounded-b-xl border border-t-0 border-gray-200">
            Aucune prime en attente de votre validation
          </div>
        ) : (
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {myPending.map((bonus) => {
                const Icon = typeIcons[bonus.bonus_type] || CalendarIcon;
                return (
                  <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
                    className="block p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all group">
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
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <EyeIcon className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <Link to="/bonuses/new" className="btn bg-blue-600 hover:bg-blue-700 text-white border-0">Nouvelle Prime</Link>
        <Link to="/bonuses" className="btn btn-outline">Voir les Primes</Link>
      </div>
    </div>
  );
};

export default Dashboard;
