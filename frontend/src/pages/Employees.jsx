import { useEffect, useState } from 'react';
import { getEmployees, getBonuses, createEmployee, getUsers } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { PlusIcon, EyeIcon, CalendarIcon, MoonIcon, ChartIcon, ClipboardIcon } from '../components/Icons';

const DEPARTMENTS = [
  'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
  'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
  'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
];

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

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const Employees = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ matricule: '', name: '', department: 'Clientèle', manager_id: '' });
  const [managers, setManagers] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empBonuses, setEmpBonuses] = useState([]);
  const [bonusesLoading, setBonusesLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [emps, users] = await Promise.all([
          departmentFilter ? getEmployees(departmentFilter) : getEmployees(),
          getUsers(),
        ]);
        setEmployees(emps);
        setManagers(Array.isArray(users) ? users : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [departmentFilter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createEmployee({ ...form, manager_id: parseInt(form.manager_id) });
      setShowForm(false);
      setForm({ matricule: '', name: '', department: 'Clientèle', manager_id: '' });
      const emps = await getEmployees();
      setEmployees(emps);
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const loadEmployeeBonuses = async (emp) => {
    setSelectedEmp(emp);
    if (user?.department && emp.department !== user.department) {
      setEmpBonuses([]);
      setBonusesLoading(false);
      return;
    }
    setBonusesLoading(true);
    try {
      const data = await getBonuses(null, emp.id);
      setEmpBonuses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setBonusesLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employés</h1>
        <button onClick={() => setShowForm(true)} className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Nouvel employé
        </button>
      </div>

      {showForm && (
        <div className="card bg-white border border-gray-200 shadow-sm mb-6">
          <div className="card-body p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Nouvel employé</h3>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
              <div className="form-control">
                <label className="label"><span className="label-text">Matricule</span></label>
                <input type="text" className="input input-bordered input-sm w-32" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Nom</span></label>
                <input type="text" className="input input-bordered input-sm w-48" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Département</span></label>
                <select className="select select-bordered select-sm w-44" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Manager</span></label>
                <select className="select select-bordered select-sm w-44" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} required>
                  <option value="">Sélectionner...</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Créer</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Mon département{user?.department ? ` (${user.department})` : ''}</option>
          {DEPARTMENTS.filter(d => d !== user?.department).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{employees.length} employé(s)</span>
      </div>

      <div className="space-y-2 mb-6">
        {employees.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Aucun employé</div>
        ) : (
          employees.map((emp) => {
            const mgr = managers.find((m) => m.id === emp.manager_id);
            return (
              <button key={emp.id} onClick={() => loadEmployeeBonuses(emp)}
                className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all text-left ${
                  selectedEmp?.id === emp.id
                    ? 'border-blue-400 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                }`}>
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm shrink-0">
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.matricule}</p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-gray-400">Département</div>
                  <div className="font-medium text-gray-700">{emp.department}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-gray-400">Manager</div>
                  <div className="font-medium text-gray-700">{mgr?.name || 'N/A'}</div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedEmp && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ClipboardIcon className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Primes de {selectedEmp.name}</h3>
            </div>
            <button onClick={() => setSelectedEmp(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
          </div>
          <div className="p-3">
            {bonusesLoading ? (
              <div className="flex justify-center py-8"><span className="loading loading-spinner loading-sm" /></div>
            ) : selectedEmp.department !== user?.department ? (
              <p className="text-center text-gray-400 py-6 text-sm">Vous ne pouvez voir que les primes des employés de votre département</p>
            ) : empBonuses.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">Aucune prime pour cet employé</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {empBonuses.map((bonus) => {
                  const Icon = typeIcons[bonus.bonus_type] || ClipboardIcon;
                  return (
                    <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Icon className="w-3 h-3" />
                          </div>
                          <span className="text-xs font-medium text-gray-700">{typeLabels[bonus.bonus_type] || bonus.bonus_type}</span>
                        </div>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getBadgeClass(bonus.status)}`}>
                          {bonus.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">
                        {bonus.start_date && bonus.end_date ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}` : '—'}
                      </p>
                      <p className="text-sm font-bold text-blue-600">{bonus.total_amount} Ar</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
