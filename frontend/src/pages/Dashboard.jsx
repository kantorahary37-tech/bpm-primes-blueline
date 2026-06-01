import { useEffect, useState, useMemo } from 'react';
import { getBonuses, getEmployees } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import StatCard from '../components/StatCard';
import { EyeIcon } from '../components/Icons';

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

    const byStatus = {};
    const byType = {};
    for (const b of bonuses) {
      const st = b.status || 'Inconnu';
      byStatus[st] = (byStatus[st] || 0) + 1;
      const tp = b.bonus_type || 'inconnu';
      if (!byType[tp]) byType[tp] = { count: 0, amount: 0 };
      byType[tp].count++;
      byType[tp].amount += parseFloat(b.total_amount) || 0;
    }

    const pending = bonuses.filter(b => b.status !== 'Validé' && b.status !== 'Rejeté').length;
    const validated = byStatus['Validé'] || 0;

    return { total, totalAmount, pending, validated, byStatus, byType, employees: employees.length };
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
        <StatCard icon="📋" label="Total Primes" value={stats.total} sub={formatAmount(stats.totalAmount)} color="brand" />
        <StatCard icon="⏳" label="En attente" value={stats.pending} sub="Non validées" color="amber" />
        <StatCard icon="✅" label="Validées" value={stats.validated} sub="Approuvées" color="emerald" />
        <StatCard icon="👥" label="Employés" value={stats.employees} sub="Actifs" color="violet" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon="📅" label="Mensuel" value={stats.byType.mensuel?.count || 0} sub={formatAmount(stats.byType.mensuel?.amount)} color="brand" />
        <StatCard icon="🌙" label="Astreinte" value={stats.byType.astreinte?.count || 0} sub={formatAmount(stats.byType.astreinte?.amount)} color="amber" />
        <StatCard icon="📈" label="Commission" value={stats.byType.commission?.count || 0} sub={formatAmount(stats.byType.commission?.amount)} color="emerald" />
      </div>

      <div className="card bg-blue-50 border-2 border-blue-400 shadow-lg mb-6">
        <div className="card-body p-0">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-blue-300">
            <span className="text-xl text-blue-600">🫵</span>
            <h2 className="card-title text-lg text-gray-900">À valider par vous</h2>
            <span className="badge bg-blue-600 text-white border-0 ml-auto">{myPending.length}</span>
          </div>

          {myPending.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              Aucune prime en attente de votre validation
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Type</th>
                    <th>Période</th>
                    <th>Montant</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myPending.map((bonus) => (
                    <tr key={bonus.id}>
                      <td className="font-medium text-gray-900">{bonus.employee?.name || 'N/A'}</td>
                      <td><span className="badge badge-ghost">{bonus.bonus_type}</span></td>
                      <td className="text-sm text-gray-400">
                        {bonus.start_date && bonus.end_date
                          ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}`
                          : 'N/A'}
                      </td>
                      <td className="font-medium text-gray-900">{bonus.total_amount} Ar</td>
                      <td>
                        <Link to={`/bonuses/${bonus.id}`} className="btn btn-sm btn-ghost" title="Voir le détail">
                          <EyeIcon className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
