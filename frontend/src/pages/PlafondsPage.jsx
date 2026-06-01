import { useEffect, useState } from 'react';
import { getPrimeMax, createPrimeMax, updatePrimeMax, deletePrimeMax } from '../services/api';
import { PlusIcon, EditIcon, XCircleIcon } from '../components/Icons';

const DEPARTMENTS = [
  'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
  'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
  'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
];

const BONUS_TYPES = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'astreinte', label: 'Astreinte' },
  { value: 'commission', label: 'Commission' },
];

const PlafondsPage = () => {
  const [plafonds, setPlafonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ department: 'Clientèle', bonus_type: 'mensuel', amount: '' });

  const fetchPlafonds = async () => {
    try {
      const data = await getPrimeMax();
      setPlafonds(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlafonds(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await updatePrimeMax(editing, form);
      } else {
        await createPrimeMax(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ department: 'Clientèle', bonus_type: 'mensuel', amount: '' });
      fetchPlafonds();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (p) => {
    setEditing(p.id);
    setForm({ department: p.department, bonus_type: p.bonus_type, amount: p.amount });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce plafond ?')) return;
    try {
      await deletePrimeMax(id);
      fetchPlafonds();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const openNewForm = () => {
    setEditing(null);
    setForm({ department: 'Clientèle', bonus_type: 'mensuel', amount: '' });
    setShowForm(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Plafonds des Primes</h1>
        <button onClick={openNewForm} className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Nouveau plafond
        </button>
      </div>

      {showForm && (
        <div className="card bg-white border border-gray-200 shadow-sm mb-6">
          <div className="card-body p-6">
            <h3 className="font-semibold text-gray-900 mb-4">{editing ? 'Modifier' : 'Nouveau'} plafond</h3>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
              <div className="form-control">
                <label className="label"><span className="label-text">Département</span></label>
                <select
                  className="select select-bordered select-sm w-56"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  required
                >
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Type de prime</span></label>
                <select
                  className="select select-bordered select-sm w-40"
                  value={form.bonus_type}
                  onChange={(e) => setForm({ ...form, bonus_type: e.target.value })}
                  required
                >
                  {BONUS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Montant max (Ar)</span></label>
                <input
                  type="number"
                  step="0.01"
                  className="input input-bordered input-sm w-40"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">
                  {editing ? 'Modifier' : 'Créer'}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>Département</th>
              <th>Type de prime</th>
              <th>Montant max (Ar)</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plafonds.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-gray-400 py-8">Aucun plafond défini</td></tr>
            ) : (
              plafonds.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-gray-900">{p.department}</td>
                  <td><span className="badge badge-ghost">{p.bonus_type}</span></td>
                  <td className="font-medium text-gray-900">{parseFloat(p.amount).toLocaleString('fr-FR')} Ar</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm btn-ghost" title="Modifier" onClick={() => handleEdit(p)}>
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button className="btn btn-sm btn-ghost text-red-500" title="Supprimer" onClick={() => handleDelete(p.id)}>
                        <XCircleIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlafondsPage;
