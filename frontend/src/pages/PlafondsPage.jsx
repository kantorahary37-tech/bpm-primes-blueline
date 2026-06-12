import { useEffect, useState, useRef } from 'react';
import { getPrimeMax, createPrimeMax, updatePrimeMax, deletePrimeMax, getEmployees, updateEmployee } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { PlusIcon, EditIcon, XCircleIcon, LockIcon, MoonIcon, CheckIcon } from '../components/Icons';
import Modal from '../components/Modal';

const BONUS_TYPES = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'astreinte', label: 'Astreinte' },
  { value: 'commission', label: 'Commission' },
  { value: 'exceptionnel', label: 'Intervention Exceptionnelle' },
];

const ASTR_DEPARTMENTS = ['BBS', 'DO', 'DSI', 'DT'];

const PlafondsPage = () => {
  const { user } = useAuth();
  const [plafonds, setPlafonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ department: user?.department || 'Clientèle', bonus_type: 'mensuel', amount: '' });
  const [astrEmployees, setAstrEmployees] = useState([]);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateModalDept, setRateModalDept] = useState('');
  const [rateModalValue, setRateModalValue] = useState('');
  const [rateModalSelected, setRateModalSelected] = useState([]);

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

  const fetchAstrEmployees = async () => {
    try {
      const all = await getEmployees();
      setAstrEmployees(all.filter(e => ASTR_DEPARTMENTS.includes(e.department)));
    } catch (err) {
      console.error(err);
    }
  };

  const openRateModal = (dept) => {
    setRateModalDept(dept);
    setRateModalValue('');
    if (rateModalDept !== dept) setRateModalSelected([]);
    setShowRateModal(true);
  };

  const toggleRateSelected = (id) => {
    setRateModalSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const applyRate = async () => {
    const rate = rateModalValue === '' ? null : parseInt(rateModalValue);
    const deptEmps = astrEmployees.filter(e => e.department === rateModalDept);
    await Promise.all(deptEmps.map(e => updateEmployee(e.id, { astreinte_rate: rateModalSelected.includes(e.id) ? rate : null })));
    setShowRateModal(false);
    fetchAstrEmployees();
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPrimeMax();
        setPlafonds(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    fetchAstrEmployees();
  }, []);

  const canEdit = (p) => user?.is_dg || user?.is_drh || p.department === user?.department;

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

  const formRef = useRef(null);

  const handleEdit = (p) => {
    if (!canEdit(p)) return;
    setEditing(p.id);
    setForm({ department: p.department, bonus_type: p.bonus_type, amount: p.amount });
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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
          <p className="text-sm text-gray-400 mt-1">{user?.is_dg || user?.is_drh ? 'Accès total — vous pouvez modifier tous les plafonds' : `Vous ne pouvez modifier que les plafonds de votre département (${user?.department})`}</p>
        </div>
        <button onClick={openNewForm} className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Nouveau plafond
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className="card bg-white border border-gray-200 shadow-sm mb-6">
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

      {(user?.is_dg || user?.is_drh) && (
        <div className="mt-10 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 font-semibold text-sm bg-violet-50 text-violet-600 border-b border-violet-200 flex items-center gap-2">
            <MoonIcon className="w-4 h-4" /> Astreinte — Taux spéciaux
            <span className="text-xs font-normal text-violet-400">— Configurer un taux personnalisé par département</span>
          </div>
          <table className="table table-zebra w-full">
            <thead>
              <tr>
                <th>Département</th>
                <th>Employés avec taux spécial</th>
                <th className="w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ASTR_DEPARTMENTS.map((dept) => {
                const deptEmps = astrEmployees.filter(e => e.department === dept);
                const specials = deptEmps.filter(e => e.astreinte_rate != null);
                return (
                  <tr key={dept}>
                    <td className="font-medium text-gray-900">{dept}</td>
                    <td className="text-sm text-gray-500">
                      {specials.length === 0
                        ? <span className="text-gray-400">Aucun</span>
                        : specials.map(e => `${e.name} (${e.astreinte_rate.toLocaleString('fr-FR')} Ar)`).join(', ')
                      }
                    </td>
                    <td>
                      <button onClick={() => openRateModal(dept)} className="btn btn-sm bg-violet-600 hover:bg-violet-700 text-white border-0">Configurer</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showRateModal} onClose={() => setShowRateModal(false)} title={`Configurer — ${rateModalDept}`} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label"><span className="label-text font-medium">Taux spécial (Ar/semaine)</span></label>
            <input type="number" value={rateModalValue} onChange={(e) => setRateModalValue(e.target.value)}
              placeholder="70000 (défaut)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500" />
          </div>
          <div>
            <label className="label"><span className="label-text font-medium">Appliquer à :</span></label>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">{rateModalSelected.length} employé(s) sélectionné(s)</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRateModalSelected(astrEmployees.filter(e => e.department === rateModalDept).map(e => e.id))} className="btn btn-xs btn-ghost text-violet-600">Tout sélectionner</button>
                <button type="button" onClick={() => setRateModalSelected([])} className="btn btn-xs btn-ghost text-gray-500">Tout désélectionner</button>
              </div>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {astrEmployees.filter(e => e.department === rateModalDept).map(emp => (
                <label key={emp.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${rateModalSelected.includes(emp.id) ? 'bg-violet-50 border border-violet-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                  <input type="checkbox" checked={rateModalSelected.includes(emp.id)} onChange={() => toggleRateSelected(emp.id)}
                    className="checkbox checkbox-sm checkbox-violet-600" />
                  <span className="flex-1 text-sm font-medium">{emp.name}</span>
                  {emp.astreinte_rate != null && <span className="text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded">Actuel: {emp.astreinte_rate.toLocaleString('fr-FR')} Ar</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowRateModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={applyRate} className="btn btn-sm bg-violet-600 hover:bg-violet-700 text-white border-0 flex items-center gap-1">
              <CheckIcon className="w-4 h-4" /> Appliquer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlafondsPage;
