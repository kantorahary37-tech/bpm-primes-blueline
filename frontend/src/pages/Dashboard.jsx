import { useEffect, useState, useMemo } from 'react';
import { getBonuses, getEmployees } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { useCurrencies } from '../contexts/CurrenciesContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  ClipboardIcon, ClockIcon, CheckIcon, EmployeesIcon,
  CalendarIcon, MoonIcon, ChartIcon,
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
  const { canSeeAmounts } = useSystemConfig();
  const { symbolFor } = useCurrencies();
  const seeAmounts = canSeeAmounts(user);
  const [bonuses, setBonuses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [b, e] = await Promise.all([getBonuses(null, null, null, null, null, false, true), getEmployees(user?.department)]);
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

  const formatAmount = (v) => seeAmounts ? (v || 0).toLocaleString('fr-FR') + ' Ar' : '••••••';

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

  const { monthlyData, donutData, monthLabels } = useMemo(() => {
    const colors = { mensuel: '#2563eb', astreinte: '#7c3aed', commission: '#d97706', inconnu: '#9ca3af' };
    const labels = { mensuel: 'Mensuel', astreinte: 'Astreinte', commission: 'Commission', inconnu: '?' };

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }), count: { mensuel: 0, astreinte: 0, commission: 0, inconnu: 0 } });
    }

    const countByType = { mensuel: 0, astreinte: 0, commission: 0, inconnu: 0 };

    for (const b of bonuses) {
      const tp = b.bonus_type || 'inconnu';
      countByType[tp] = (countByType[tp] || 0) + 1;
      if (!b.created_at) continue;
      const d = new Date(b.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) bucket.count[tp] = (bucket.count[tp] || 0) + 1;
    }

    const monthlyData = months.map(m => ({
      name: m.label,
      Mensuel: m.count.mensuel,
      Astreinte: m.count.astreinte,
      Commission: m.count.commission,
    }));

    const monthLabels = months.map(m => m.label);

    const donutData = Object.entries(countByType)
      .map(([key, value]) => ({ name: labels[key] || key, value, color: colors[key] || '#9ca3af' }))
      .filter(d => d.value > 0);

    return { monthlyData, donutData, monthLabels };
  }, [bonuses]);



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
          { icon: CheckIcon, label: 'Validées', value: stats.validated, sub: 'Approuvées', bg: 'bg-emerald-50', text: 'text-emerald-600', to: (user?.is_admin || user?.is_drh) ? '/validated' : undefined },
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



      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Primes par mois (6 derniers mois)</h3>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Mensuel" stackId="a" fill="#2563eb" />
                <Bar dataKey="Astreinte" stackId="a" fill="#7c3aed" />
                <Bar dataKey="Commission" stackId="a" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Répartition par type</h3>
          {donutData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Aucune donnée</div>
          ) : (
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>


      <div className="flex gap-4">
        <Link to="/bonuses/new" className="btn bg-blue-600 hover:bg-blue-700 text-white border-0">Nouvelle Prime</Link>
        <Link to="/bonuses" className="btn btn-outline">Voir les Primes</Link>
      </div>
    </div>
  );
};

export default Dashboard;
