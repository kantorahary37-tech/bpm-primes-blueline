import { useEffect, useState } from 'react';
import { getPrimeMax, createPrimeMax, updatePrimeMax, deletePrimeMax } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { PlusIcon, EditIcon, XCircleIcon, LockIcon } from '../components/Icons';

const BONUS_TYPES = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'astreinte', label: 'Astreinte' },
  { value: 'commission', label: 'Commission' },
];

const PlafondsPage = () => {
  const { user } = useAuth();
  const [plafonds, setPlafonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ department: user?.department || 'Clientèle', bonus_type: 'mensuel', amount: '' });

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

  const canEdit = (p) => p.department === user?.department;

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
      setForm({ department: user?.department || 'Clientèle', bonus_type: 'mensuel', amount: '' });
      fetchPlafonds();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (p) => {
    if (!canEdit(p)) return;
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
    setForm({ department: user?.department || 'Clientèle', bonus_type: 'mensuel', amount: '' });
    setShowForm(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plafonds des Primes</h1>
          <p className="text-sm text-gray-400 mt-1">Vous ne pouvez modifier que les plafonds de votre département ({user?.department})</p>
        </div>
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
                  disabled
                >
                  <option value={user?.department}>{user?.department}</option>
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

      <div className="space-y-6">
        {BONUS_TYPES.map((bt) => {
          const items = plafonds.filter(p => p.bonus_type === bt.value);
          if (items.length === 0) return null;
          const typeColors = { mensuel: 'bg-blue-50 text-blue-600 border-blue-200', astreinte: 'bg-violet-50 text-violet-600 border-violet-200', commission: 'bg-amber-50 text-amber-600 border-amber-200' };
          const color = typeColors[bt.value] || typeColors.mensuel;
          return (
            <div key={bt.value} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className={`px-5 py-3 font-semibold text-sm border-b ${color}`}>
                {bt.label} — {items.length} département{items.length !== 1 ? 's' : ''}
              </div>
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>Département</th>
                    <th>Montant max (Ar)</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className={!canEdit(p) ? 'opacity-60' : ''}>
                      <td className="font-medium text-gray-900">{p.department}</td>
                      <td className="font-medium text-gray-900">{parseFloat(p.amount).toLocaleString('fr-FR')} Ar</td>
                      <td>
                        <div className="flex gap-1">
                          {canEdit(p) ? (
                            <>
                              <button className="btn btn-sm btn-ghost" title="Modifier" onClick={() => handleEdit(p)}>
                                <EditIcon className="w-4 h-4" />
                              </button>
                              <button className="btn btn-sm btn-ghost text-red-500" title="Supprimer" onClick={() => handleDelete(p.id)}>
                                <XCircleIcon className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 flex items-center gap-1 px-2">
                              <LockIcon className="w-3 h-3" /> Autre dép.
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlafondsPage;
