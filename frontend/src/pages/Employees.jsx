import { useEffect, useState } from 'react';
import { getEmployees, createEmployee } from '../services/api';
import { Link } from 'react-router-dom';
import { PlusIcon, EyeIcon } from '../components/Icons';

const DEPARTMENTS = [
  'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
  'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
  'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
];

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ matricule: '', name: '', department: 'Clientèle', manager_id: '' });
  const [managers, setManagers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [emps, users] = await Promise.all([
          getEmployees(),
          fetch('/api/v1/users/').then(r => r.json()),
        ]);
        setEmployees(emps);
        setManagers(users);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
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

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Nom</th>
              <th>Département</th>
              <th>Manager</th>
              <th className="w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-8">Aucun employé</td></tr>
            ) : (
              employees.map((emp) => {
                const mgr = managers.find((m) => m.id === emp.manager_id);
                return (
                  <tr key={emp.id}>
                    <td className="font-mono text-sm text-gray-500">{emp.matricule}</td>
                    <td className="font-medium text-gray-900">{emp.name}</td>
                    <td><span className="badge badge-ghost">{emp.department}</span></td>
                    <td className="text-sm text-gray-500">{mgr?.name || 'N/A'}</td>
                    <td>
                      <Link to={`/bonuses?employee_id=${emp.id}`} className="btn btn-sm btn-ghost" title="Voir les primes">
                        <EyeIcon className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Employees;
