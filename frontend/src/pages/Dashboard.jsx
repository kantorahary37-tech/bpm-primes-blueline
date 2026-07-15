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

const Dashboard = () => {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [b, e] = await Promise.all([getBonuses(), getEmployees(user?.department)]);
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
    const validatedByType = {};
    for (const b of bonuses) {
      const tp = b.bonus_type || 'inconnu';
      if (!byType[tp]) byType[tp] = { count: 0, amount: 0 };
      byType[tp].count++;
      byType[tp].amount += parseFloat(b.total_amount) || 0;

      if (b.status === 'Prime validée') {
        if (!validatedByType[tp]) validatedByType[tp] = { count: 0, amount: 0 };
        validatedByType[tp].count++;
        validatedByType[tp].amount += parseFloat(b.total_amount) || 0;
      }
    }

    const pending = bonuses.filter(b => b.status !== 'Validé' && b.status !== 'Rejeté' && b.status !== 'Prime validée' && b.status !== 'Prime rejetée').length;
    const validated = bonuses.filter(b => b.status === 'Validé' || b.status === 'Prime validée').length;

    return { total, totalAmount, pending, validated, byType, validatedByType, employees: employees.length };
  }, [bonuses, employees]);

  const myPending = useMemo(() => {
    if (!user) return [];
    if (user.is_admin) return bonuses;
    if (user.is_drh) {
      const toPay = bonuses.filter(b => b.status === 'Prime validée');
      toPay.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return toPay;
    }
    const myStatuses = [];
    if (user.is_validator_n1) myStatuses.push('Initialisé');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');
    const sorted = [...bonuses.filter(b => myStatuses.includes(b.status))];
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted;
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        {[
          { icon: ClipboardIcon, label: 'Total Primes', value: stats.total, sub: formatAmount(stats.totalAmount), bg: 'bg-blue-50', text: 'text-blue-600' },
          { icon: ClockIcon, label: 'En attente', value: stats.pending, sub: 'Non validées', bg: 'bg-amber-50', text: 'text-amber-600' },
          { icon: CheckIcon, label: 'Validées', value: stats.validated, sub: 'Approuvées', bg: 'bg-emerald-50', text: 'text-emerald-600', to: '/validated' },
          { icon: EmployeesIcon, label: `Employés (${user?.department || 'tous'})`, value: stats.employees, sub: 'Actifs', bg: 'bg-violet-50', text: 'text-violet-600', to: '/employees' },
        ].map((card, i) => {
          const Icon = card.icon;
          const Tag = card.to ? Link : 'div';
          return (
            <Tag key={i} to={card.to} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all">
              <div className={`w-12 h-12 rounded-xl ${card.bg} ${card.text} flex items-center justify-center shrink-0`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
            </Tag>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const data = stats.byType[key] || { count: 0, amount: 0 };
          const valData = stats.validatedByType[key] || { count: 0, amount: 0 };
          const Icon = cfg.icon;
          return (
            <Link key={key} to={`/kanban/${key}`} className={`bg-white rounded-xl border ${cfg.border} p-4 hover:shadow-md transition-all`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{cfg.label}</p>
                  <p className="text-xs text-gray-400">{data.count} total</p>
                </div>
                <p className="text-sm font-bold text-gray-900">{formatAmount(data.amount)}</p>
              </div>
              {valData.count > 0 && (
                <div className="flex items-center justify-between px-1 pt-2 border-t border-gray-100">
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {valData.count} validée{valData.count > 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600">{formatAmount(valData.amount)}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mb-6">
        <div className={`flex items-center gap-2 px-4 py-3 rounded-t-xl text-white ${user?.is_drh ? 'bg-emerald-600' : 'bg-blue-600'}`}>
          <EyeIcon className="w-4 h-4" />
          <h2 className="font-semibold">{user?.is_admin ? 'Toutes les primes' : user?.is_drh ? 'À marquer payés' : 'À valider par vous'}</h2>
          <Link to={user?.is_drh ? '/validated' : '/bonuses?view=status'} className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/30 hover:text-white transition-all">
            Voir tout
          </Link>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full bg-white ${user?.is_drh ? 'text-emerald-700' : 'text-blue-700'}`}>
            {myPending.length}
          </span>
        </div>

        {myPending.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-white rounded-b-xl border border-t-0 border-gray-200">
            {user?.is_admin ? 'Aucune prime' : user?.is_drh ? 'Aucune prime à payer' : 'Aucune prime en attente de votre validation'}
          </div>
        ) : (
          <div className="p-3 bg-white rounded-b-xl border border-t-0 border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {myPending.slice(0, 6).map((bonus) => {
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
                      {statusLabel(bonus)}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-600 shrink-0">{bonus.total_amount} Ar</span>
                    <EyeIcon className="w-3 h-3 text-gray-300 shrink-0" />
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
